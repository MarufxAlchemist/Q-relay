"""Stage 3: distributed Deutsch-Jozsa with a teleported ancilla.

Alice prepares |-> and teleports it to Bob; Bob uses the teleported qubit as the DJ ancilla and queries the
hidden oracle once.

Layout: inputs 0..n-1 (Bob), q_n = Alice's message qubit, q_{n+1} = Alice's Bell half, q_{n+2} = Bob's Bell half
(becomes the DJ ancilla). Registers: m0 <- q_n, m1 <- q_{n+1}, out <- inputs.

Key fact (proved in THEORY.md, checked in tests): with a noiseless oracle, a constant oracle is always classified
correctly, and for a balanced oracle P(success) = <-| rho_anc |->, the teleportation fidelity of |->: any |+>
component of the ancilla produces no phase kickback and leaves the inputs in |0...0>.
"""

from __future__ import annotations

import numpy as np
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit_aer import AerSimulator

from .backends import register_counts
from .dj import Oracle, classify
from .noise import NoiseSpec, apply_noise


def _registers(n: int):
    return (QuantumRegister(n + 3, "q"), ClassicalRegister(1, "m0"), ClassicalRegister(1, "m1"),
            ClassicalRegister(n, "out"))


def teleport_ancilla_part(n: int, variant: str = "dynamic") -> QuantumCircuit:
    """Alice prepares |-> on q_n and teleports it onto q_{n+2}."""
    q, m0, m1, out = _registers(n)
    qc = QuantumCircuit(q, m0, m1, out, name="teleport_minus")
    a, h, b = n, n + 1, n + 2
    qc.x(a)
    qc.h(a)
    qc.h(h)
    qc.cx(h, b)
    qc.cx(a, h)
    qc.h(a)
    if variant == "dynamic":
        qc.measure(a, m0[0])
        qc.measure(h, m1[0])
        with qc.if_test((m1, 1)):
            qc.x(b)
        with qc.if_test((m0, 1)):
            qc.z(b)
    else:
        qc.cx(h, b)
        qc.cz(a, b)
    return qc


def dj_part(oracle: Oracle) -> QuantumCircuit:
    """Bob's half: H on inputs, one oracle query against the teleported ancilla, H, measure."""
    n = oracle.n
    q, m0, m1, out = _registers(n)
    qc = QuantumCircuit(q, m0, m1, out, name="bob_dj")
    qc.h(range(n))
    qc.compose(oracle.build(), list(range(n)) + [n + 2], inplace=True)
    qc.h(range(n))
    qc.measure(range(n), out)
    return qc


def distributed_dj_circuit(oracle: Oracle, variant: str = "dynamic", tele_noise: NoiseSpec | None = None,
                           oracle_noise: NoiseSpec | None = None) -> QuantumCircuit:
    """Full circuit; noise can be confined to the teleportation stage, the oracle stage, or both."""
    t = teleport_ancilla_part(oracle.n, variant)
    d = dj_part(oracle)
    if tele_noise is not None:
        t = apply_noise(t, tele_noise)
    if oracle_noise is not None:
        d = apply_noise(d, oracle_noise)
    full = t.copy()
    full.barrier()
    full.compose(d, inplace=True)
    full.name = f"distDJ_{oracle.name}_n{oracle.n}"
    return full


def run_distributed(oracle: Oracle, shots: int = 2048, variant: str = "dynamic",
                    tele_noise: NoiseSpec | None = None, oracle_noise: NoiseSpec | None = None,
                    seed: int = 23) -> dict:
    """Run the distributed DJ on Aer and classify the outcome (readout noise taken from oracle_noise)."""
    qc = distributed_dj_circuit(oracle, variant, tele_noise, oracle_noise)
    nm = oracle_noise.readout_model() if oracle_noise is not None else None
    counts = AerSimulator(noise_model=nm, seed_simulator=seed).run(qc, shots=shots).result().get_counts()
    out = register_counts(counts, qc, "out")
    res = classify(out, oracle.n)
    success = res["p_all_zeros"] if oracle.kind == "constant" else 1 - res["p_all_zeros"]
    res.update({"counts": out, "truth": oracle.kind, "correct": res["verdict"] == oracle.kind,
                "success_probability": success})
    return res


def stage_noise_heatmap(oracle: Oracle, levels: list[float], shots: int = 2048) -> dict:
    """Success probability over a grid: rows = teleport-stage noise, cols = oracle-stage noise (p2, p1 = p2/10)."""
    grid = np.zeros((len(levels), len(levels)))
    for i, pt in enumerate(levels):
        for j, po in enumerate(levels):
            tn = NoiseSpec(p1=pt / 10, p2=pt) if pt > 0 else None
            on = NoiseSpec(p1=po / 10, p2=po) if po > 0 else None
            grid[i, j] = run_distributed(oracle, shots, tele_noise=tn, oracle_noise=on,
                                         seed=1000 + 31 * i + j)["success_probability"]
    return {"levels": list(levels), "success": grid.tolist(), "oracle": oracle.name, "n": oracle.n}
