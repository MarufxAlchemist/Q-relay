"""Deutsch-Jozsa for an n-qubit input register (PS3).

Layout: input qubits 0..n-1 hold x (x_i on qubit i, so integer x = sum_i x_i 2^i — Qiskit little-endian);
qubit n is the ancilla y. Bit oracle: |x>|y> -> |x>|y XOR f(x)>.
"""

from __future__ import annotations

import itertools
import math
from dataclasses import dataclass, field
from typing import Callable

import numpy as np
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.circuit.library import Diagonal
from qiskit.quantum_info import Statevector

from .backends import register_counts


@dataclass
class Oracle:
    """A promise function f: {0,1}^n -> {0,1}, either constant or balanced."""

    name: str
    kind: str                     # "constant" | "balanced"
    n: int
    truth_table: np.ndarray       # truth_table[x] = f(x), x little-endian integer
    builder: Callable[[QuantumCircuit, list, object], None] | None = field(default=None, repr=False)
    params: dict = field(default_factory=dict)

    def __post_init__(self) -> None:
        tt = np.asarray(self.truth_table, dtype=np.uint8)
        assert len(tt) == 2 ** self.n
        ones = int(tt.sum())
        expected = "constant" if ones in (0, 2 ** self.n) else "balanced" if ones == 2 ** (self.n - 1) else "neither"
        if expected != self.kind:
            raise ValueError(f"oracle {self.name}: truth table is {expected}, declared {self.kind}")
        self.truth_table = tt

    def f(self, x: int) -> int:
        return int(self.truth_table[x])

    def build(self) -> QuantumCircuit:
        """Bit-oracle circuit on n+1 qubits (inputs 0..n-1, ancilla n)."""
        qc = QuantumCircuit(self.n + 1, name=f"U_f[{self.name}]")
        inputs, anc = list(range(self.n)), self.n
        if self.builder is not None:
            self.builder(qc, inputs, anc)
        else:
            _truth_table_oracle(qc, inputs, anc, self.truth_table)
        return qc

    def phase_oracle(self) -> QuantumCircuit:
        """Equivalent phase oracle on the n inputs: |x> -> (-1)^f(x) |x> (a Diagonal gate)."""
        qc = QuantumCircuit(self.n, name=f"P_f[{self.name}]")
        qc.append(Diagonal([(-1) ** int(v) for v in self.truth_table]), range(self.n))
        return qc

    def two_qubit_gate_count(self) -> int:
        """Rough cost: 2-qubit gates after decomposition to {u, cx}."""
        from qiskit import transpile
        return int(transpile(self.build(), basis_gates=["u", "cx"], optimization_level=1).count_ops().get("cx", 0))

    def to_dict(self) -> dict:
        return {"name": self.name, "kind": self.kind, "n": self.n, "truth_table": self.truth_table.tolist(),
                "params": self.params}


def _truth_table_oracle(qc: QuantumCircuit, inputs: list, anc, tt: np.ndarray) -> None:
    """Generic construction: for each x with f(x)=1, X-conjugate the zero bits of x and apply MCX onto the ancilla."""
    n = len(inputs)
    for x in np.flatnonzero(tt):
        zeros = [inputs[i] for i in range(n) if not (int(x) >> i) & 1]
        if zeros:
            qc.x(zeros)
        qc.mcx(inputs, anc)
        if zeros:
            qc.x(zeros)


def _table(n: int, f: Callable[[int], int]) -> np.ndarray:
    return np.array([f(x) for x in range(2 ** n)], dtype=np.uint8)


# ------------------------------------------------------------------ oracle library

def constant_zero(n: int) -> Oracle:
    """f(x) = 0: the identity."""
    return Oracle("const_0", "constant", n, _table(n, lambda x: 0), lambda qc, i, a: None)


def constant_one(n: int) -> Oracle:
    """f(x) = 1: X on the ancilla."""
    return Oracle("const_1", "constant", n, _table(n, lambda x: 1), lambda qc, i, a: qc.x(a))


def first_bit(n: int) -> Oracle:
    """f(x) = x_0: a single CX."""
    return Oracle("x0", "balanced", n, _table(n, lambda x: x & 1), lambda qc, i, a: qc.cx(i[0], a))


def parity(n: int) -> Oracle:
    """f(x) = XOR of all bits: a CX from every input."""
    def build(qc, inputs, anc):
        for q in inputs:
            qc.cx(q, anc)
    return Oracle("parity", "balanced", n, _table(n, lambda x: bin(x).count("1") % 2), build)


def inner_product(n: int, mask: int) -> Oracle:
    """f(x) = a . x mod 2 for a non-zero mask a: CX from the selected bits."""
    if not 0 < mask < 2 ** n:
        raise ValueError("mask must be non-zero and < 2^n")

    def build(qc, inputs, anc):
        for k, q in enumerate(inputs):
            if (mask >> k) & 1:
                qc.cx(q, anc)
    return Oracle(f"ip_{mask:0{n}b}", "balanced", n, _table(n, lambda x: bin(x & mask).count("1") % 2), build,
                  {"mask": mask})


def random_balanced(n: int, chooser: Callable[[int], int] | None = None, seed: int | None = None) -> Oracle:
    """A uniformly random balanced function: a random 2^(n-1)-subset S of inputs has f = 1 (MCX construction).

    ``chooser(k)`` returns a uniform integer in [0, k) — pass the QRNG pool's ``randint`` to use quantum bits.
    """
    if chooser is None:
        rng = np.random.default_rng(seed)
        chooser = lambda k: int(rng.integers(k))  # noqa: E731
    items = list(range(2 ** n))
    for i in range(len(items) - 1, 0, -1):  # Fisher-Yates driven by the chooser
        j = chooser(i + 1)
        items[i], items[j] = items[j], items[i]
    tt = np.zeros(2 ** n, dtype=np.uint8)
    tt[items[: 2 ** (n - 1)]] = 1
    return Oracle("random_bal", "balanced", n, tt, None, {"subset": sorted(items[: 2 ** (n - 1)])})


def from_truth_table(tt, name: str = "custom") -> Oracle:
    """Oracle from an explicit truth table (kind inferred)."""
    tt = np.asarray(tt, dtype=np.uint8)
    n = int(math.log2(len(tt)))
    kind = "constant" if tt.sum() in (0, len(tt)) else "balanced"
    if kind == "constant":
        return constant_one(n) if tt[0] else constant_zero(n)
    return Oracle(name, kind, n, tt, None)


def oracle_library(n: int, seed: int = 0) -> list[Oracle]:
    """The standard gallery: 2 constant + 4 balanced oracles."""
    mask = (2 ** n - 1) & 0b1011 or 1
    return [constant_zero(n), constant_one(n), first_bit(n), parity(n), inner_product(n, mask),
            random_balanced(n, seed=seed)]


def oracle_by_name(name: str, n: int, seed: int = 0) -> Oracle:
    for o in oracle_library(n, seed):
        if o.name == name or o.name.startswith(name):
            return o
    raise KeyError(name)


# ------------------------------------------------------------------ the algorithm

def dj_circuit(oracle: Oracle, measure: bool = True, barriers: bool = True) -> QuantumCircuit:
    """Deutsch-Jozsa: ancilla -> |->, H on inputs, one oracle query, H on inputs, measure inputs into ``out``."""
    n = oracle.n
    q = QuantumRegister(n + 1, "q")
    regs = [q]
    if measure:
        regs.append(ClassicalRegister(n, "out"))
    qc = QuantumCircuit(*regs, name=f"DJ_{oracle.name}_n{n}")
    qc.x(n)
    qc.h(n)
    qc.h(range(n))
    if barriers:
        qc.barrier()
    qc.compose(oracle.build(), range(n + 1), inplace=True)
    if barriers:
        qc.barrier()
    qc.h(range(n))
    if measure:
        qc.measure(range(n), range(n))
    return qc


def classify(out_counts: dict[str, int], n: int) -> dict:
    """Verdict from counts over the ``out`` register: all-zeros -> constant, anything else -> balanced."""
    shots = sum(out_counts.values())
    p0 = out_counts.get("0" * n, 0) / shots
    return {"verdict": "constant" if p0 > 0.5 else "balanced", "p_all_zeros": p0}


def p_all_zeros_exact(oracle: Oracle) -> float:
    """Exact probability of measuring |0...0> on the inputs: |(1/2^n) sum_x (-1)^f(x)|^2."""
    sv = Statevector(dj_circuit(oracle, measure=False, barriers=False))
    probs = sv.probabilities(list(range(oracle.n)))
    return float(probs[0])


def run_dj(oracle: Oracle, shots: int = 1024, noise=None, seed: int = 17) -> dict:
    """Run DJ on Aer (optionally noisy) and classify."""
    from qiskit_aer import AerSimulator

    from .noise import apply_noise
    qc = dj_circuit(oracle)
    run_qc = apply_noise(qc, noise) if noise is not None else qc
    nm = noise.readout_model() if noise is not None else None
    counts = AerSimulator(noise_model=nm, seed_simulator=seed).run(run_qc, shots=shots).result().get_counts()
    out = register_counts(counts, qc, "out")
    res = classify(out, oracle.n)
    res.update({"counts": out, "correct": res["verdict"] == oracle.kind, "truth": oracle.kind,
                "success_probability": res["p_all_zeros"] if oracle.kind == "constant" else 1 - res["p_all_zeros"]})
    return res


def dj_steps(oracle: Oracle) -> list[dict]:
    """Input-register amplitudes at each stage, for the superposition -> phase kickback -> interference story.

    After ancilla prep the state factorises as |phi> (x) |->; we recover |phi> from the full statevector.
    The ancilla's Bloch vector is reported to show it is unchanged by the query (phase kickback).
    """
    from .bloch import bloch_vector
    from qiskit.quantum_info import partial_trace
    n, N = oracle.n, 2 ** oracle.n

    def split(sv: Statevector) -> tuple[np.ndarray, list[float]]:
        d = sv.data.reshape(2, N)  # row = ancilla value (qubit n is the most significant index bit)
        amp = (d[0] - d[1]) / math.sqrt(2)  # project ancilla onto |->
        anc = bloch_vector(partial_trace(sv, list(range(n))))
        return amp, anc.tolist()

    stages = []
    qc = QuantumCircuit(n + 1)
    qc.x(n)
    qc.h(n)
    sv = Statevector(qc)
    a, anc = split(sv)
    stages.append(("init", "Inputs in |0...0>, ancilla prepared in |-> (X then H).", a, anc))
    qc.h(range(n))
    sv = Statevector(qc)
    a, anc = split(sv)
    stages.append(("superposition", f"H on every input: an equal superposition of all {N} inputs, "
                   f"amplitude 1/sqrt({N}) each.", a, anc))
    qc.compose(oracle.build(), range(n + 1), inplace=True)
    sv = Statevector(qc)
    a, anc = split(sv)
    stages.append(("oracle", "ONE oracle query. Because the ancilla is |->, y XOR f(x) shows up as a phase "
                   "(-1)^f(x) on the input (phase kickback); the ancilla itself is unchanged.", a, anc))
    qc.h(range(n))
    sv = Statevector(qc)
    a, anc = split(sv)
    verdict = "constant: all amplitude interferes onto |0...0>" if oracle.kind == "constant" else \
        "balanced: the |0...0> amplitude cancels to exactly 0"
    stages.append(("interference", f"H again: amplitudes interfere — {verdict}.", a, anc))
    return [{"stage": s, "caption": c, "re": np.real(amp).round(12).tolist(), "im": np.imag(amp).round(12).tolist(),
             "ancilla_bloch": anc} for s, c, amp, anc in stages]


# ------------------------------------------------------------------ classical comparison

def classical_worst_case(n: int) -> int:
    """Deterministic classical algorithm: 2^(n-1) + 1 queries in the worst case."""
    return 2 ** (n - 1) + 1


def classical_deterministic(query: Callable[[int], int], n: int) -> dict:
    """Query x = 0, 1, 2, ... until two different values appear (balanced) or 2^(n-1)+1 agree (constant)."""
    seen = []
    for x in range(2 ** n):
        seen.append(query(x))
        if len(set(seen)) > 1:
            return {"verdict": "balanced", "queries": len(seen)}
        if len(seen) == 2 ** (n - 1) + 1:
            return {"verdict": "constant", "queries": len(seen)}
    return {"verdict": "constant", "queries": len(seen)}


class AdversaryOracle:
    """Adversary that answers so the classical algorithm learns as little as possible.

    It answers 0 to the first 2^(n-1) distinct queries — consistent with both "constant 0" and some balanced
    function — so no deterministic algorithm can stop before query 2^(n-1)+1.
    """

    def __init__(self, n: int) -> None:
        self.n = n
        self.answers: dict[int, int] = {}

    def __call__(self, x: int) -> int:
        if x not in self.answers:
            self.answers[x] = 0
        return self.answers[x]


def adversary_queries(n: int) -> int:
    """Queries a deterministic classical solver needs against the adversary."""
    return classical_deterministic(AdversaryOracle(n), n)["queries"]


def complexity_table(n_max: int = 20) -> list[dict]:
    """Quantum (1 query) vs classical deterministic worst case, with adversary-verified counts for small n,
    and the randomized classical error bound 2^-(k-1) after k agreeing random queries."""
    rows = []
    for n in range(1, n_max + 1):
        rows.append({"n": n, "quantum": 1, "classical_worst": classical_worst_case(n),
                     "adversary": adversary_queries(n) if n <= 14 else None,
                     "randomized_k_for_1e-6": math.ceil(1 + math.log2(1e6))})
    return rows


def all_oracles(n: int) -> list[Oracle]:
    """Every constant (2) and every balanced (C(2^n, 2^(n-1))) function on n bits."""
    N = 2 ** n
    out = [constant_zero(n), constant_one(n)]
    for subset in itertools.combinations(range(N), N // 2):
        tt = np.zeros(N, dtype=np.uint8)
        tt[list(subset)] = 1
        out.append(Oracle(f"bal_{''.join(map(str, tt))}", "balanced", n, tt))
    return out
