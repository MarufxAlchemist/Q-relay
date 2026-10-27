"""The Q-Relay mission: QRNG -> teleportation -> distributed Deutsch-Jozsa, as an ordered stream of events.

The same generator drives notebook 04 and the WebSocket. Each event is a JSON-serialisable dict:
``{"type", "stage", "t", "caption", "data"}``. Captions double as live subtitles.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Callable, Iterator

import numpy as np

from . import dj, distributed_dj, stats, teleport
from .noise import NoiseSpec
from .qrng import EntropyPool, generate_bits

EVENT_ORDER = ["mission_start", "qrng_batch", "health_test", "state_drawn", "oracle_chosen", "bell_pair",
               "alice_bsm", "classical_bits_sent", "bob_correction", "tomography", "fidelity", "ancilla_teleport",
               "dj_hadamard", "dj_oracle_query", "dj_interference", "dj_measure", "verdict", "mission_summary"]


@dataclass
class MissionConfig:
    n: int | None = None            # DJ input size; None -> drawn from the QRNG pool in [2, 5]
    noise_level: float = 0.0        # UI slider in [0, 1] (see NoiseSpec.from_level)
    seed: int | None = None         # seeds the simulator that produces the QRNG bits
    pool_bits: int = 8192
    shots: int = 1024
    source: str = "SIM"


def _f(x):
    """Make numpy values JSON friendly."""
    if isinstance(x, dict):
        return {k: _f(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_f(v) for v in x]
    if isinstance(x, np.ndarray):
        return _f(x.tolist())
    if isinstance(x, (np.floating, np.integer)):
        return x.item()
    return x


def run_mission(config: MissionConfig | None = None, get_noise: Callable[[], float] | None = None,
                pool: EntropyPool | None = None) -> Iterator[dict]:
    """Yield mission events in order. ``get_noise`` is polled before each stage so the slider can change mid-run."""
    cfg = config or MissionConfig()
    t0 = time.perf_counter()
    noise_now = get_noise or (lambda: cfg.noise_level)

    def ev(type_: str, stage: str, caption: str, **data) -> dict:
        return _f({"type": type_, "stage": stage, "t": round(time.perf_counter() - t0, 4), "caption": caption,
                   "data": data})

    def spec() -> tuple[float, NoiseSpec]:
        lvl = float(noise_now())
        return lvl, NoiseSpec.from_level(lvl)

    yield ev("mission_start", "qrng", "Q-Relay mission start: QRNG -> teleportation -> distributed Deutsch-Jozsa.",
             config=cfg.__dict__, source=cfg.source)

    # ---------------- Stage 1: QRNG
    if pool is None:
        bits = generate_bits(cfg.pool_bits, m=16, seed=cfg.seed)
        pool = EntropyPool(bits, source=cfg.source)
    b = pool.bits
    yield ev("qrng_batch", "qrng", f"Entropy pool charged: {len(b)} bits from 16 qubits in superposition "
             f"(H then measure). Source: {pool.source}.", n_bits=len(b), p1=float(b.mean()),
             preview=b[:256].tolist(), source=pool.source)

    health = [stats.frequency_monobit(b), stats.runs(b), stats.block_frequency(b)]
    ok = all(t.passed for t in health)
    yield ev("health_test", "qrng", "Health tests " + ("passed" if ok else "FLAGGED") + ": monobit, runs, block "
             "frequency (passing means no bias was detected — not a proof of randomness).",
             tests=[t.to_dict() for t in health], passed=ok)

    theta, phi = pool.haar_angles()
    yield ev("state_drawn", "qrng", f"QRNG draws a Haar-random secret state: theta={theta:.3f}, phi={phi:.3f}.",
             theta=theta, phi=phi, bloch=teleport.bloch_of(theta, phi))

    n = cfg.n or (2 + pool.randint(4, "DJ size n"))
    lib = dj.oracle_library(n)
    oracle = lib[pool.randint(len(lib), "oracle choice")]
    if oracle.name == "random_bal":
        oracle = dj.random_balanced(n, chooser=lambda k: pool.randint(k))
    yield ev("oracle_chosen", "qrng", f"QRNG secretly picks a hidden oracle on n={n} input bits. "
             "Nobody (including Bob) knows whether it is constant or balanced.", n=n, hidden=True,
             oracle=oracle.to_dict())

    # ---------------- Stage 2: teleportation
    lvl, ns = spec()
    stepper = teleport.TeleportStepper(theta, phi, noise=ns, rand=lambda: pool.uniform())
    steps = stepper.run()
    mapping = {"bell_h": "bell_pair", "bell_cx": "bell_pair", "bsm_cx": "alice_bsm", "bsm_h": "alice_bsm",
               "measure": "alice_bsm", "classical": "classical_bits_sent", "correct_x": "bob_correction",
               "correct_z": "bob_correction"}
    for s in steps:
        if s.name in mapping:
            yield ev(mapping[s.name], "teleport", s.caption, step=s.name, gate=s.gate, bloch=s.bloch,
                     purity=s.purity, fidelity_bob=s.fidelity_bob, outcome=s.outcome, noise_level=lvl)

    lvl, ns = spec()
    tomo = teleport.run_tomography(theta, phi, ns, shots=cfg.shots, seed=pool.randint(2**31), mitigate=True)
    yield ev("tomography", "teleport", "Bob verifies by tomography: measure in X, Y and Z bases "
             f"({cfg.shots} shots each) and rebuild the Bloch vector.", **tomo, noise_level=lvl)

    exact = teleport.exact_fidelity(theta, phi, ns, shots=400)["fidelity"]
    quantum = exact > teleport.CLASSICAL_FIDELITY_BOUND
    yield ev("fidelity", "teleport", f"Fidelity {exact:.4f} — " + (
        "above 2/3: no classical strategy could do this." if quantum else
        "BELOW 2/3: noise has pushed the channel into the classical regime."),
             exact=exact, tomography=tomo["fidelity"], tomography_mitigated=tomo.get("fidelity_mitigated"),
             classical_bound=teleport.CLASSICAL_FIDELITY_BOUND, quantum_regime=quantum,
             bloch_final=steps[-1].bloch[2], noise_level=lvl)

    # ---------------- Stage 3: distributed Deutsch-Jozsa
    lvl, ns = spec()
    anc_f = teleport.exact_fidelity(math.pi / 2, math.pi, ns, shots=400)["fidelity"]
    yield ev("ancilla_teleport", "dj", f"Alice teleports |-> to Bob to serve as the DJ ancilla "
             f"(ancilla fidelity {anc_f:.4f}). Ideal limit: identical to a local ancilla.", ancilla_fidelity=anc_f,
             noise_level=lvl)

    st = dj.dj_steps(oracle)
    yield ev("dj_hadamard", "dj", st[1]["caption"], amplitudes=st[1], n=n)
    yield ev("dj_oracle_query", "dj", st[2]["caption"], amplitudes=st[2], n=n, queries=1)
    yield ev("dj_interference", "dj", st[3]["caption"], amplitudes=st[3], n=n)

    lvl, ns = spec()
    res = distributed_dj.run_distributed(oracle, shots=cfg.shots, tele_noise=None if ns.is_ideal else ns,
                                         oracle_noise=None if ns.is_ideal else ns, seed=pool.randint(2**31))
    yield ev("dj_measure", "dj", f"Bob measures the inputs ({cfg.shots} shots): P(all zeros) = "
             f"{res['p_all_zeros']:.3f}.", counts=res["counts"], p_all_zeros=res["p_all_zeros"], n=n,
             noise_level=lvl)

    verdict_ok = res["correct"]
    yield ev("verdict", "dj", f"Verdict: {res['verdict'].upper()} after ONE query. Ground truth: "
             f"{oracle.kind.upper()} — {'correct' if verdict_ok else 'WRONG (noise)'}. A classical computer "
             f"needs up to {dj.classical_worst_case(n)} queries to be certain.",
             verdict=res["verdict"], truth=oracle.kind, correct=verdict_ok, oracle=oracle.to_dict(),
             success_probability=res["success_probability"], classical_worst=dj.classical_worst_case(n))

    yield ev("mission_summary", "summary", "Mission complete.", theta=theta, phi=phi, fidelity=exact,
             tomography_fidelity=tomo["fidelity"], ancilla_fidelity=anc_f, n=n, oracle=oracle.name,
             verdict=res["verdict"], truth=oracle.kind, correct=verdict_ok,
             success_probability=res["success_probability"], bits_used=pool.cursor, pool_log=pool.log[-12:],
             noise_level=lvl, source=pool.source)
