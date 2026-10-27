"""Hardware / emulation experiment set, result caching and analysis.

The UI never submits jobs; it only reads cached JSON from ``data/hardware``. Records carry ``source`` = "HW" (real
IBM device, with job ID) or "EMU" (fake-backend noise model). Nothing here fabricates data.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from qiskit import QuantumCircuit

from . import dj, distributed_dj, stats, teleport
from .qrng import qrng_circuit

ROOT = Path(__file__).resolve().parent.parent
HW_DIR = ROOT / "data" / "hardware"


@dataclass
class Experiment:
    tag: str
    kind: str          # qrng | teleport | dj | dist_dj
    circuit: QuantumCircuit
    meta: dict


def build_experiments(qrng_qubits: int = 100, include_dynamic: bool = True) -> list[Experiment]:
    """The full hardware batch: QRNG, teleport tomography (6 states x 3 bases x variants), DJ, distributed DJ."""
    exps = [Experiment("qrng", "qrng", qrng_circuit(qrng_qubits), {"m": qrng_qubits})]
    variants = ["deferred"] + (["dynamic"] if include_dynamic else [])
    for v in variants:
        for name, (th, ph) in teleport.CARDINAL_STATES.items():
            for basis, c in teleport.tomography_circuits(th, ph, v).items():
                exps.append(Experiment(f"tp_{v}_{name}_{basis}", "teleport", c,
                                       {"variant": v, "state": name, "theta": th, "phi": ph, "basis": basis}))
    for n in (2, 3):
        for o in [dj.constant_zero(n), dj.constant_one(n), dj.parity(n), dj.random_balanced(n, seed=7)]:
            exps.append(Experiment(f"dj_n{n}_{o.name}", "dj", dj.dj_circuit(o),
                                   {"n": n, "oracle": o.name, "kind": o.kind, "truth_table": o.truth_table.tolist()}))
    if include_dynamic:
        for o in [dj.constant_one(2), dj.parity(2)]:
            exps.append(Experiment(f"distdj_n2_{o.name}", "dist_dj", distributed_dj.distributed_dj_circuit(o),
                                   {"n": 2, "oracle": o.name, "kind": o.kind}))
    return exps


def _versions() -> dict:
    import qiskit
    import qiskit_aer
    import qiskit_ibm_runtime
    return {"qiskit": qiskit.__version__, "qiskit_aer": qiskit_aer.__version__,
            "qiskit_ibm_runtime": qiskit_ibm_runtime.__version__}


def pub_to_record(exp: Experiment, isa: QuantumCircuit, pub_result, shots: int) -> dict:
    """Serialise one SamplerV2 pub result: counts per classical register (+ raw bitstrings for QRNG)."""
    data = pub_result.data
    regs = {}
    for creg in exp.circuit.cregs:
        ba = getattr(data, creg.name)
        regs[creg.name] = ba.get_counts()
    rec = {"tag": exp.tag, "kind": exp.kind, "meta": exp.meta, "registers": regs, "shots": shots,
           "depth": isa.depth(), "ops": {k: int(v) for k, v in isa.count_ops().items()},
           "two_qubit_gates": int(sum(v for k, v in isa.count_ops().items() if k in ("cx", "ecr", "cz")))}
    if exp.kind == "qrng":
        rec["bitstrings"] = getattr(data, exp.circuit.cregs[0].name).get_bitstrings()
    return rec


def save_record(record: dict, name: str) -> Path:
    HW_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    path = HW_DIR / f"{name}_{ts}.json"
    qrng_bits = None
    for e in record["experiments"]:
        if e["kind"] == "qrng" and "bitstrings" in e:
            m = e["meta"]["m"]
            # each bitstring is little-endian (right-most char = clbit 0); reverse so order is q0..q_{m-1}
            raw = np.frombuffer("".join(e.pop("bitstrings")).encode(), dtype=np.uint8) - ord("0")
            qrng_bits = raw.reshape(-1, m)[:, ::-1].ravel().astype(np.uint8)
            bin_path = HW_DIR / f"qrng_{record['source'].lower()}_{ts}.bin"
            np.packbits(qrng_bits).tofile(bin_path)
            e["bits_file"] = bin_path.name
            e["n_bits"] = int(len(qrng_bits))
    path.write_text(json.dumps(record, indent=1))
    return path


def load_records() -> list[dict]:
    """All cached hardware/emulation records, newest first."""
    if not HW_DIR.exists():
        return []
    recs = []
    for p in sorted(HW_DIR.glob("*.json"), reverse=True):
        try:
            r = json.loads(p.read_text())
            r["file"] = p.name
            recs.append(r)
        except json.JSONDecodeError:
            continue
    return recs


def latest(source: str) -> dict | None:
    """Most recent record with the given source ("HW" or "EMU")."""
    for r in load_records():
        if r.get("source") == source:
            return r
    return None


def load_bits(record: dict) -> np.ndarray | None:
    for e in record["experiments"]:
        if e["kind"] == "qrng" and "bits_file" in e:
            return np.unpackbits(np.fromfile(HW_DIR / e["bits_file"], dtype=np.uint8))[: e["n_bits"]]
    return None


def analyze(record: dict) -> dict:
    """Turn a raw record into the metrics shown in the report and the UI."""
    out: dict = {"source": record["source"], "backend": record["backend"], "job_id": record.get("job_id"),
                 "timestamp": record["timestamp"], "versions": record.get("versions", {})}
    bits = load_bits(record)
    if bits is not None:
        qrng_exp = next(e for e in record["experiments"] if e["kind"] == "qrng")
        m = qrng_exp["meta"]["m"]
        per_qubit = bits.reshape(-1, m).mean(axis=0)
        out["qrng"] = {"n_bits": int(len(bits)), "p1": float(bits.mean()), "per_qubit_p1": per_qubit.tolist(),
                       "suite": stats.run_suite(bits)}
    # teleportation: group the three bases per (variant, state)
    tp: dict = {}
    for e in record["experiments"]:
        if e["kind"] != "teleport":
            continue
        key = (e["meta"]["variant"], e["meta"]["state"])
        tp.setdefault(key, {"meta": e["meta"], "counts": {}})["counts"][e["meta"]["basis"]] = e["registers"]["bob"]
    tele = {}
    for (variant, state), d in tp.items():
        if len(d["counts"]) == 3:
            r = teleport.tomography_fidelity_from_counts(d["meta"]["theta"], d["meta"]["phi"], d["counts"])
            tele.setdefault(variant, {})[state] = r
    for variant, states in tele.items():
        outs = {s: np.array(v["r_out"]) for s, v in states.items()}
        R = teleport.pauli_transfer_matrix(outs)
        fids = [v["fidelity"] for v in states.values()]
        tele[variant] = {"states": states, "mean_fidelity": float(np.mean(fids)), "ptm": R.tolist(),
                         **teleport.process_fidelity_from_ptm(R)}
    out["teleport"] = tele
    djr = []
    for e in record["experiments"]:
        if e["kind"] in ("dj", "dist_dj"):
            n = e["meta"]["n"]
            c = e["registers"]["out"]
            p0 = c.get("0" * n, 0) / sum(c.values())
            succ = p0 if e["meta"]["kind"] == "constant" else 1 - p0
            djr.append({"tag": e["tag"], "kind": e["kind"], "n": n, "oracle": e["meta"]["oracle"],
                        "truth": e["meta"]["kind"], "p_all_zeros": p0, "success_probability": succ,
                        "verdict": "constant" if p0 > 0.5 else "balanced", "counts": c,
                        "two_qubit_gates": e["two_qubit_gates"], "depth": e["depth"]})
    out["dj"] = djr
    return out


def run_batch(backend, mode, source: str, shots: int, qrng_shots: int, experiments: list[Experiment],
              job_id_holder: dict | None = None) -> dict:
    """Transpile for ``backend`` and run every experiment in one SamplerV2 job (``mode`` = backend for both HW
    and local fake-backend emulation)."""
    import warnings

    from qiskit.transpiler import generate_preset_pass_manager
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        from qiskit_ibm_runtime import SamplerV2
        pm = generate_preset_pass_manager(backend=backend, optimization_level=3, seed_transpiler=7)
        isas = [pm.run(e.circuit) for e in experiments]
        pubs = [(isa, None, qrng_shots if e.kind == "qrng" else shots) for e, isa in zip(experiments, isas)]
        sampler = SamplerV2(mode=mode)
        job = sampler.run(pubs)
        jid = job.job_id() if callable(getattr(job, "job_id", None)) else None
        if job_id_holder is not None:
            job_id_holder["job_id"] = jid
        print(f"submitted job {jid} to {backend.name}; waiting for results...")
        result = job.result()
    return {
        "source": source,
        "backend": backend.name,
        "job_id": jid,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "versions": _versions(),
        "experiments": [pub_to_record(e, isa, result[i], pubs[i][2]) for i, (e, isa) in
                        enumerate(zip(experiments, isas))],
    }


def estimate_qpu_seconds(experiments: list[Experiment], shots: int, qrng_shots: int,
                         per_shot_s: float = 0.0006, overhead_s: float = 3.0) -> float:
    """Very rough QPU-time estimate (dynamic circuits are slower per shot); shown before submission."""
    total = overhead_s
    for e in experiments:
        s = qrng_shots if e.kind == "qrng" else shots
        factor = 2.0 if any(i.operation.name == "if_else" for i in e.circuit.data) else 1.0
        total += s * per_shot_s * factor
    return total