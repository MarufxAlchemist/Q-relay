"""Q-Relay API: REST endpoints + the /ws/mission WebSocket. Works offline with no IBM token.

Run: uvicorn server.main:app --port 8000
"""

from __future__ import annotations

import asyncio
import base64
import json
import math
import secrets
import sys
import threading
import time
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from qrelay import dj, distributed_dj, extract, hardware, qrng, stats, teleport  # noqa: E402
from qrelay.backends import SOURCE_LABELS  # noqa: E402
from qrelay.mission import MissionConfig, run_mission  # noqa: E402
from qrelay.noise import NoiseSpec  # noqa: E402
from server.schemas import DJRequest, GameNew, GameQuantum, GameQuery, NoiseIn, QrngRequest, TeleportRequest  # noqa: E402

SWEEPS = ROOT / "data" / "sweeps"
DIST = ROOT / "web" / "dist"

app = FastAPI(title="Q-Relay", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_pool_lock = threading.Lock()
_pool: qrng.EntropyPool | None = None
_games: dict[str, dict] = {}


def pool() -> qrng.EntropyPool:
    """Shared simulator entropy pool for interactive draws (refilled when low)."""
    global _pool
    with _pool_lock:
        if _pool is None or _pool.remaining < 4096:
            path = ROOT / "data" / "qrng_pool_sim.bin"
            if _pool is None and path.exists():
                _pool = qrng.EntropyPool(qrng.load_pool(str(path)), source="SIM")
            else:
                _pool = qrng.make_pool(65_536)
        return _pool


def to_spec(n: NoiseIn) -> NoiseSpec:
    if n.level is not None:
        return NoiseSpec.from_level(n.level)
    return NoiseSpec(p1=n.p1, p2=n.p2, t1_us=n.t1_us, t2_us=n.t2_us, readout=n.readout)


def jsonable(x):
    if isinstance(x, dict):
        return {str(k): jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    if isinstance(x, np.ndarray):
        return jsonable(x.tolist())
    if isinstance(x, (np.floating, np.integer, np.bool_)):
        return x.item()
    if isinstance(x, float) and not math.isfinite(x):
        return None
    return x


def read_sweep(name: str) -> dict:
    p = SWEEPS / f"{name}.json"
    if not p.exists():
        raise HTTPException(404, f"{name} not precomputed — run `python scripts/precompute_sweeps.py`")
    return json.loads(p.read_text())


def circuit_json(qc) -> dict:
    """Gate list for the front-end circuit renderer (control flow flattened with its condition)."""
    qidx = {q: i for i, q in enumerate(qc.qubits)}
    ops = []

    def walk(circ, cond=None):
        for inst in circ.data:
            op = inst.operation
            if op.name == "if_else":
                reg, val = op.condition
                walk(op.blocks[0], {"register": getattr(reg, "name", "c"), "value": int(val)})
                continue
            ops.append({"name": op.name, "qubits": [qidx[q] for q in inst.qubits],
                        "params": [float(p) for p in op.params if isinstance(p, (int, float))],
                        "condition": cond})
    walk(qc)
    return {"num_qubits": qc.num_qubits, "ops": ops}


def pack(b: np.ndarray) -> str:
    return base64.b64encode(np.packbits(b).tobytes()).decode()


# ------------------------------------------------------------------ meta

@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time(), "sweeps": sorted(p.stem for p in SWEEPS.glob("*.json")),
            "hardware": {"HW": hardware.latest("HW") is not None, "EMU": hardware.latest("EMU") is not None}}


@app.get("/api/versions")
def versions():
    import fastapi
    import qiskit
    import qiskit_aer
    import qiskit_ibm_runtime
    import scipy
    return {"qiskit": qiskit.__version__, "qiskit_aer": qiskit_aer.__version__,
            "qiskit_ibm_runtime": qiskit_ibm_runtime.__version__, "numpy": np.__version__,
            "scipy": scipy.__version__, "fastapi": fastapi.__version__, "python": sys.version.split()[0],
            "source_labels": SOURCE_LABELS}


# ------------------------------------------------------------------ QRNG

@app.post("/api/qrng/generate")
def qrng_generate(req: QrngRequest):
    if req.mode == "sim":
        bits = qrng.generate_bits(req.n_bits, m=16, seed=req.seed)
        source, backend = "SIM", "aer_simulator"
    else:
        rec = hardware.latest("HW" if req.mode == "hw_cached" else "EMU")
        b = hardware.load_bits(rec) if rec else None
        if b is None:
            raise HTTPException(404, "hardware: not available" if req.mode == "hw_cached" else
                                "emulated results not available — run scripts/run_hardware.py --emulate")
        bits, source, backend = b[: req.n_bits], rec["source"], rec["backend"]
    raw_n = len(bits)
    if req.mitigate != "none":
        p1 = float(bits.mean())
        if req.mitigate == "vn":
            bits = extract.von_neumann(bits)
        elif req.mitigate == "xor":
            bits = extract.xor_pairs(bits)
        else:
            bits = extract.toeplitz_extract(bits, -math.log2(max(p1, 1 - p1)))
    if len(bits) < 1000:
        raise HTTPException(422, "too few bits after extraction")
    return jsonable({
        "source": source, "source_label": SOURCE_LABELS[source], "backend": backend, "n_raw": raw_n,
        "n_bits": len(bits), "yield": len(bits) / raw_n, "mitigate": req.mitigate,
        "counts": [int(len(bits) - bits.sum()), int(bits.sum())], "suite": stats.run_suite(bits),
        "fingerprint": pack(stats.fingerprint(bits, 256).ravel()), "walk": stats.random_walk(bits),
        "autocorr": stats.autocorrelation_profile(bits), "preview": bits[:1024].tolist(),
        "circuit": circuit_json(qrng.qrng_circuit(4)),
    })


@app.get("/api/qrng/compare")
def qrng_compare():
    return read_sweep("qrng_compare")


@app.get("/api/qrng/extractors")
def qrng_extractors():
    return read_sweep("extractors")


@app.get("/api/qrng/randu")
def qrng_randu(n_bits: int = 200_000):
    """'Break the PRNG': the suite on RANDU, computed live."""
    b = stats.prng_randu(min(n_bits, 1_000_000))
    return jsonable({"source": "PRNG", "name": "RANDU (low byte)", "suite": stats.run_suite(b),
                     "fingerprint": pack(stats.fingerprint(b, 256).ravel()), "walk": stats.random_walk(b),
                     "autocorr": stats.autocorrelation_profile(b), "counts": [int(len(b) - b.sum()), int(b.sum())]})


# ------------------------------------------------------------------ teleportation

@app.post("/api/teleport/run")
def teleport_run(req: TeleportRequest):
    p = pool()
    if req.random or req.theta is None:
        theta, phi = p.haar_angles()
    else:
        theta, phi = req.theta, (req.phi or 0.0) % (2 * math.pi)
    spec = to_spec(req.noise)
    steps = teleport.TeleportStepper(theta, phi, noise=spec, rand=lambda: p.uniform()).run()
    exact = teleport.exact_fidelity(theta, phi, None if spec.is_ideal else spec, req.variant, shots=400)
    tomo = teleport.run_tomography(theta, phi, None if spec.is_ideal else spec, shots=req.shots,
                                   variant=req.variant, mitigate=spec.readout > 0, seed=p.randint(2**31))
    qc = teleport.teleport_circuit(theta, phi, req.variant, barriers=False)
    return jsonable({
        "theta": theta, "phi": phi, "r_in": teleport.bloch_of(theta, phi), "noise": spec.__dict__,
        "steps": [s.__dict__ for s in steps], "exact": exact, "tomography": tomo,
        "classical_bound": teleport.CLASSICAL_FIDELITY_BOUND, "circuit": circuit_json(qc), "source": "SIM",
    })


@app.get("/api/teleport/sweep")
def teleport_sweep():
    out = {}
    for k in ("teleport_sweep_1d", "teleport_sweep_2d", "teleport_t1_sweep", "teleport_states"):
        try:
            out[k] = read_sweep(k)
        except HTTPException:
            out[k] = None
    return out


# ------------------------------------------------------------------ Deutsch-Jozsa

def _oracle(name: str, n: int, seed: int, tt: list[int] | None) -> dj.Oracle:
    if tt is not None:
        if len(tt) != 2 ** n:
            raise HTTPException(422, "truth table length must be 2^n")
        try:
            return dj.from_truth_table(tt)
        except ValueError as e:
            raise HTTPException(422, str(e))
    try:
        return dj.oracle_by_name(name, n, seed)
    except KeyError:
        raise HTTPException(404, f"unknown oracle {name}")


@app.get("/api/dj/oracles")
def dj_oracles(n: int = 3, seed: int = 0):
    return [o.to_dict() | {"cx": o.two_qubit_gate_count()} for o in dj.oracle_library(n, seed)]


@app.post("/api/dj/run")
def dj_run(req: DJRequest):
    o = _oracle(req.oracle, req.n, req.seed, req.truth_table)
    spec = to_spec(req.noise)
    noisy = None if spec.is_ideal else spec
    if noisy is not None and o.name.startswith(("random", "bal_", "custom")) and req.n > 6:
        raise HTTPException(422, "noisy runs of MCX-built oracles are limited to n <= 6")
    if req.distributed:
        res = distributed_dj.run_distributed(o, req.shots, tele_noise=noisy, oracle_noise=noisy, seed=req.seed + 1)
        qc = distributed_dj.distributed_dj_circuit(o)
    else:
        res = dj.run_dj(o, req.shots, noise=noisy, seed=req.seed + 1)
        qc = dj.dj_circuit(o, barriers=False)
    return jsonable({
        **res, "oracle": o.to_dict(), "n": req.n, "steps": dj.dj_steps(o), "p_all_zeros_exact": dj.p_all_zeros_exact(o),
        "queries": {"quantum": 1, "classical_worst": dj.classical_worst_case(req.n)},
        "circuit": circuit_json(qc), "noise": spec.__dict__, "source": "SIM",
    })


@app.get("/api/dj/complexity")
def dj_complexity(n_max: int = 20):
    return {"rows": dj.complexity_table(min(n_max, 30))}


@app.get("/api/dj/noise")
def dj_noise():
    return read_sweep("dj_noise")


@app.get("/api/dj/distributed_heatmap")
def dj_heatmap():
    return read_sweep("dist_dj_heatmap")


# ------------------------------------------------------------------ Beat the Oracle

@app.post("/api/game/new")
def game_new(req: GameNew):
    p = pool()
    if p.randint(2, "game: constant or balanced"):
        o = dj.random_balanced(req.n, chooser=lambda k: p.randint(k))
    else:
        o = dj.constant_one(req.n) if p.randint(2) else dj.constant_zero(req.n)
    gid = secrets.token_hex(6)
    _games[gid] = {"oracle": o, "queries": {}, "created": time.time()}
    return {"game_id": gid, "n": req.n, "inputs": 2 ** req.n, "classical_worst": dj.classical_worst_case(req.n)}


def _game(gid: str) -> dict:
    if gid not in _games:
        raise HTTPException(404, "unknown game")
    return _games[gid]


@app.post("/api/game/query")
def game_query(req: GameQuery):
    g = _game(req.game_id)
    o: dj.Oracle = g["oracle"]
    if req.x >= 2 ** o.n:
        raise HTTPException(422, "x out of range")
    g["queries"][req.x] = o.f(req.x)
    vals = set(g["queries"].values())
    n_q = len(g["queries"])
    certain = "balanced" if len(vals) > 1 else ("constant" if n_q >= dj.classical_worst_case(o.n) else None)
    return {"x": req.x, "fx": o.f(req.x), "queries_used": n_q, "classical_worst": dj.classical_worst_case(o.n),
            "certain": certain}


@app.post("/api/game/quantum")
def game_quantum(req: GameQuantum):
    """Solve with ONE quantum query, then teleport the 1-bit verdict to Bob (|0> = constant, |1> = balanced)."""
    g = _game(req.game_id)
    o: dj.Oracle = g["oracle"]
    spec = to_spec(req.noise)
    noisy = None if spec.is_ideal else spec
    res = dj.run_dj(o, shots=1, noise=noisy, seed=secrets.randbelow(2**31))
    bit = 0 if res["verdict"] == "constant" else 1
    theta = math.pi * bit
    tele = teleport.exact_fidelity(theta, 0.0, noisy, shots=200)
    p_correct_bit = tele["fidelity"]
    bob_bit = bit if pool().uniform() < p_correct_bit else 1 - bit
    bob_verdict = "constant" if bob_bit == 0 else "balanced"
    return jsonable({"verdict": res["verdict"], "measured": list(res["counts"].keys())[0], "queries": 1,
                     "truth": o.kind, "correct": bob_verdict == o.kind, "teleport_fidelity": p_correct_bit,
                     "bob_verdict": bob_verdict, "oracle": o.to_dict(),
                     "classical_queries_used": len(g["queries"])})


# ------------------------------------------------------------------ hardware

@app.get("/api/hardware/results")
def hardware_results():
    out = {}
    for src in ("HW", "EMU"):
        rec = hardware.latest(src)
        out[src] = jsonable(hardware.analyze(rec)) if rec else None
    out["labels"] = SOURCE_LABELS
    out["available"] = {"HW": out["HW"] is not None, "EMU": out["EMU"] is not None}
    return out


# ------------------------------------------------------------------ mission WebSocket

EVENT_DELAY = {"mission_start": 0.6, "qrng_batch": 1.6, "health_test": 1.2, "state_drawn": 1.4,
               "oracle_chosen": 1.4, "bell_pair": 1.3, "alice_bsm": 1.3, "classical_bits_sent": 1.6,
               "bob_correction": 1.2, "tomography": 1.6, "fidelity": 2.2, "ancilla_teleport": 1.6,
               "dj_hadamard": 1.6, "dj_oracle_query": 2.0, "dj_interference": 2.0, "dj_measure": 1.6,
               "verdict": 2.5, "mission_summary": 0.5}


@app.websocket("/ws/mission")
async def ws_mission(ws: WebSocket):
    """Client sends {"action": "start", "noise": 0..1, "n": int|null, "speed": float} to run a mission and
    {"action": "noise", "value": 0..1} to change the noise mid-run (applies from the next stage)."""
    await ws.accept()
    state = {"noise": 0.0, "speed": 1.0, "running": False}
    runner: asyncio.Task | None = None

    async def run(cfg: MissionConfig):
        state["running"] = True
        gen = run_mission(cfg, get_noise=lambda: state["noise"])
        try:
            while True:
                ev = await asyncio.to_thread(next, gen, None)
                if ev is None:
                    break
                await ws.send_json(jsonable(ev))
                await asyncio.sleep(EVENT_DELAY.get(ev["type"], 1.0) / max(state["speed"], 0.1))
        finally:
            state["running"] = False

    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")
            if action == "start":
                if runner and not runner.done():
                    runner.cancel()
                state["noise"] = float(msg.get("noise", state["noise"]))
                state["speed"] = float(msg.get("speed", 1.0))
                n = msg.get("n")
                runner = asyncio.create_task(run(MissionConfig(n=int(n) if n else None, noise_level=state["noise"],
                                                               shots=512)))
            elif action == "noise":
                state["noise"] = float(msg.get("value", 0.0))
                await ws.send_json({"type": "noise_ack", "value": state["noise"]})
            elif action == "speed":
                state["speed"] = float(msg.get("value", 1.0))
            elif action == "stop" and runner:
                runner.cancel()
    except WebSocketDisconnect:
        if runner:
            runner.cancel()


# ------------------------------------------------------------------ static front-end (production)

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = DIST / path
        if path and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
