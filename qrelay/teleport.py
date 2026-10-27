"""Quantum teleportation of an arbitrary single-qubit state (PS1).

Qubit roles: q0 = |psi> held by Alice, q1 = Alice's half of the Bell pair, q2 = Bob's half.
Classical registers: ``m0`` <- q0 (drives Bob's Z correction), ``m1`` <- q1 (drives Bob's X correction).

Variants
  A. ``dynamic``  — mid-circuit measurement + classical feed-forward (``if_test``). Primary implementation.
  B. ``deferred`` — corrections as CX(q1, q2), CZ(q0, q2), no mid-circuit measurement; runs on any hardware.
  C. :class:`TeleportStepper` — gate-by-gate density-matrix engine recording per-qubit Bloch vectors.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister
from qiskit.quantum_info import DensityMatrix, Statevector, partial_trace
from qiskit_aer import AerSimulator

from .backends import register_counts
from .bloch import bloch_vector
from .noise import NoiseSpec, apply_noise

CLASSICAL_FIDELITY_BOUND = 2 / 3  # best average fidelity of any measure-and-prepare (classical) strategy

CARDINAL_STATES: dict[str, tuple[float, float]] = {
    "|0>": (0.0, 0.0),
    "|1>": (math.pi, 0.0),
    "|+>": (math.pi / 2, 0.0),
    "|->": (math.pi / 2, math.pi),
    "|+i>": (math.pi / 2, math.pi / 2),
    "|-i>": (math.pi / 2, 3 * math.pi / 2),
}


def target_state(theta: float, phi: float) -> Statevector:
    """|psi> = cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>."""
    return Statevector([math.cos(theta / 2), np.exp(1j * phi) * math.sin(theta / 2)])


def bloch_of(theta: float, phi: float) -> np.ndarray:
    """Bloch vector (x, y, z) of the pure state with angles (theta, phi)."""
    return np.array([math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta)])


def teleport_circuit(theta: float, phi: float, variant: str = "dynamic", measure_basis: str | None = None,
                     save_dm: bool = False, conditional: bool = False, barriers: bool = True) -> QuantumCircuit:
    """Build the teleportation circuit.

    ``measure_basis`` in {"Z", "X", "Y"} appends a measurement of Bob's qubit in that basis (register ``bob``)
    for tomography. ``save_dm`` saves Bob's reduced density matrix (Aer only).
    """
    q = QuantumRegister(3, "q")
    m0, m1 = ClassicalRegister(1, "m0"), ClassicalRegister(1, "m1")
    regs = [q, m0, m1]
    bob = None
    if measure_basis:
        bob = ClassicalRegister(1, "bob")
        regs.append(bob)
    qc = QuantumCircuit(*regs, name=f"teleport_{variant}")

    qc.u(theta, phi, 0, 0)                 # 1. prepare |psi> on q0
    if barriers:
        qc.barrier()
    qc.h(1)                                 # 2. Bell pair (q1, q2) = (|00> + |11>)/sqrt2
    qc.cx(1, 2)
    if barriers:
        qc.barrier()
    qc.cx(0, 1)                             # 3. Alice's Bell-basis measurement
    qc.h(0)
    if variant == "dynamic":
        qc.measure(0, m0[0])
        qc.measure(1, m1[0])
        if barriers:
            qc.barrier()
        with qc.if_test((m1, 1)):           # 4. Bob's feed-forward corrections
            qc.x(2)
        with qc.if_test((m0, 1)):
            qc.z(2)
    elif variant == "deferred":
        if barriers:
            qc.barrier()
        qc.cx(1, 2)                         # quantum-controlled corrections (deferred measurement principle)
        qc.cz(0, 2)
        qc.measure(0, m0[0])
        qc.measure(1, m1[0])
    else:
        raise ValueError(f"unknown variant {variant!r}")

    if save_dm:
        qc.save_density_matrix([2], label="rho_bob", conditional=conditional)
    if measure_basis:
        if measure_basis == "X":
            qc.h(2)
        elif measure_basis == "Y":
            qc.sdg(2)
            qc.h(2)
        elif measure_basis != "Z":
            raise ValueError(measure_basis)
        qc.measure(2, bob[0])
    return qc


# ------------------------------------------------------------------ exact fidelity

def fidelity_pure(theta: float, phi: float, rho) -> float:
    """F = <psi| rho |psi>."""
    psi = target_state(theta, phi).data
    r = np.asarray(rho.data if hasattr(rho, "data") else rho)
    return float(np.real(np.conj(psi) @ r @ psi))


def exact_fidelity(theta: float, phi: float, noise: NoiseSpec | None = None, variant: str = "dynamic",
                   shots: int = 1000, seed: int = 11) -> dict:
    """Fidelity from Bob's exact density matrix in each measurement branch (Aer, density-matrix method).

    Returns per-branch fidelity and probability and the branch-weighted average. Branch keys are the 2-bit
    classical memory value ``m1 m0`` (hex, little-endian: bit 0 = m0).
    """
    qc = teleport_circuit(theta, phi, variant, save_dm=True, conditional=True, barriers=False)
    if noise is not None:
        qc = apply_noise(qc, noise)
    # Readout error flips the classical bits that drive Bob's feed-forward (dynamic variant), so it changes rho_B.
    sim = AerSimulator(method="density_matrix", seed_simulator=seed,
                       noise_model=noise.readout_model() if noise is not None else None)
    res = sim.run(qc, shots=shots).result()
    dms = res.data()["rho_bob"]
    counts = res.get_counts()
    branch_counts: dict[str, int] = {}
    for key, v in counts.items():
        val = int(key.replace(" ", ""), 2)
        branch_counts[hex(val)] = branch_counts.get(hex(val), 0) + v
    branches = {}
    total = 0.0
    for k, rho in dms.items():
        p = branch_counts.get(k, 0) / shots
        f = fidelity_pure(theta, phi, rho)
        m = int(k, 16)
        branches[f"m0={m & 1},m1={(m >> 1) & 1}"] = {"fidelity": f, "probability": p}
        total += p * f
    return {"fidelity": total, "branches": branches}


# ------------------------------------------------------------------ tomography

def tomography_circuits(theta: float, phi: float, variant: str = "dynamic") -> dict[str, QuantumCircuit]:
    """Three circuits measuring Bob's qubit in Z, X and Y bases."""
    return {b: teleport_circuit(theta, phi, variant, measure_basis=b) for b in ("Z", "X", "Y")}


def expectation_from_counts(bob_counts: dict[str, int]) -> float:
    """<sigma> = P(0) - P(1) for Bob's single-bit register."""
    n = sum(bob_counts.values())
    return (bob_counts.get("0", 0) - bob_counts.get("1", 0)) / n if n else 0.0


def readout_confusion(noise: NoiseSpec, shots: int = 8192, seed: int = 5) -> np.ndarray:
    """Measured 1-qubit confusion matrix A[measured, prepared] under ``noise``'s readout model."""
    sim = AerSimulator(noise_model=noise.readout_model(), seed_simulator=seed)
    A = np.zeros((2, 2))
    for prep in (0, 1):
        c = QuantumCircuit(1, 1)
        if prep:
            c.x(0)
        c.measure(0, 0)
        counts = sim.run(c, shots=shots).result().get_counts()
        A[0, prep] = counts.get("0", 0) / shots
        A[1, prep] = counts.get("1", 0) / shots
    return A


def mitigate_counts(bob_counts: dict[str, int], A: np.ndarray) -> dict[str, float]:
    """Readout-error mitigation by confusion-matrix inversion (clipped to a valid distribution)."""
    n = sum(bob_counts.values())
    p = np.array([bob_counts.get("0", 0), bob_counts.get("1", 0)]) / n
    q = np.clip(np.linalg.solve(A, p), 0, None)
    q = q / q.sum()
    return {"0": q[0] * n, "1": q[1] * n}


def run_tomography(theta: float, phi: float, noise: NoiseSpec | None = None, shots: int = 4096,
                   variant: str = "dynamic", seed: int = 3, mitigate: bool = False) -> dict:
    """Measurement-based state tomography of Bob's qubit; F = (1 + r_in . r_out) / 2 for a pure input."""
    circs = tomography_circuits(theta, phi, variant)
    nm = noise.readout_model() if noise else None
    sim = AerSimulator(noise_model=nm, seed_simulator=seed)
    A = readout_confusion(noise) if (mitigate and noise and noise.readout > 0) else None
    r_out, r_mit = [], []
    raw_counts = {}
    for basis in ("X", "Y", "Z"):
        qc = circs[basis]
        if noise is not None:
            qc = apply_noise(qc, noise)
        counts = sim.run(qc, shots=shots).result().get_counts()
        bob = register_counts(counts, circs[basis], "bob")
        raw_counts[basis] = bob
        r_out.append(expectation_from_counts(bob))
        if A is not None:
            r_mit.append(expectation_from_counts(mitigate_counts(bob, A)))
    r_in = bloch_of(theta, phi)
    r_phys = project_to_ball(r_out)
    out = {
        "r_in": r_in.tolist(),
        "r_out": r_phys.tolist(),
        "r_out_raw": r_out,
        "fidelity": float((1 + np.dot(r_in, r_phys)) / 2),
        "counts": raw_counts,
        "shots": shots,
    }
    if A is not None:
        r_mit_phys = project_to_ball(r_mit)
        out["r_mitigated"] = r_mit_phys.tolist()
        out["fidelity_mitigated"] = float((1 + np.dot(r_in, r_mit_phys)) / 2)
        out["confusion"] = A.tolist()
    return out


def project_to_ball(r) -> np.ndarray:
    """Finite-shot estimates can give |r| > 1 (an unphysical state); project onto the Bloch ball (|r| <= 1)."""
    r = np.asarray(r, dtype=float)
    n = np.linalg.norm(r)
    return r / n if n > 1 else r


def tomography_fidelity_from_counts(theta: float, phi: float, counts_by_basis: dict[str, dict[str, int]]) -> dict:
    """Same reconstruction as :func:`run_tomography`, from externally obtained (e.g. hardware) counts."""
    r_raw = [expectation_from_counts(counts_by_basis[b]) for b in ("X", "Y", "Z")]
    r_out = project_to_ball(r_raw)
    r_in = bloch_of(theta, phi)
    return {"r_in": r_in.tolist(), "r_out": r_out.tolist(), "r_out_raw": r_raw,
            "fidelity": float((1 + np.dot(r_in, r_out)) / 2)}


# ------------------------------------------------------------------ process characterisation

def pauli_transfer_matrix(outputs: dict[str, np.ndarray]) -> np.ndarray:
    """PTM R_ij = Tr(sigma_i E(sigma_j)) / 2 from output Bloch vectors for |0>, |1>, |+>, |+i>.

    E(rho) has Bloch form (1, r); E(I) = E(|0><0|) + E(|1><1|), E(Z) = E(0) - E(1),
    E(X) = 2 E(+) - E(I), E(Y) = 2 E(+i) - E(I).
    """
    def vec(name: str) -> np.ndarray:
        return np.concatenate(([1.0], np.asarray(outputs[name], dtype=float)))

    eI = vec("|0>") + vec("|1>")
    eZ = vec("|0>") - vec("|1>")
    eX = 2 * vec("|+>") - eI
    eY = 2 * vec("|+i>") - eI
    # A vector v means the operator (1/2) sum_i v_i sigma_i, so R_ij = Tr(sigma_i E(sigma_j))/2 = v_i / 2.
    return np.column_stack([eI, eX, eY, eZ]) / 2


def process_fidelity_from_ptm(R: np.ndarray) -> dict[str, float]:
    """Process fidelity to the identity channel F_pro = Tr(R)/4 and average fidelity (2 F_pro + 1)/3."""
    fp = float(np.trace(R) / 4)
    return {"process_fidelity": fp, "average_fidelity": (2 * fp + 1) / 3}


def cardinal_state_test(noise: NoiseSpec | None = None, method: str = "exact", shots: int = 4096) -> dict:
    """Teleport the six cardinal states; return per-state fidelity, output Bloch vectors and the PTM."""
    per_state, outputs = {}, {}
    for name, (th, ph) in CARDINAL_STATES.items():
        if method == "exact":
            qc = teleport_circuit(th, ph, save_dm=True, barriers=False)
            if noise is not None:
                qc = apply_noise(qc, noise)
            nm = noise.readout_model() if noise is not None else None
            rho = AerSimulator(method="density_matrix", seed_simulator=1, noise_model=nm).run(qc, shots=2000).result().data()["rho_bob"]
            r = bloch_vector(rho)
            f = fidelity_pure(th, ph, rho)
        else:
            t = run_tomography(th, ph, noise, shots=shots)
            r, f = np.array(t["r_out"]), t["fidelity"]
        per_state[name] = float(f)
        outputs[name] = np.asarray(r)
    R = pauli_transfer_matrix(outputs)
    return {"fidelities": per_state, "outputs": {k: v.tolist() for k, v in outputs.items()},
            "ptm": R.tolist(), **process_fidelity_from_ptm(R)}


def haar_average(n_states: int = 200, noise: NoiseSpec | None = None, method: str = "exact",
                 angles: list[tuple[float, float]] | None = None, seed: int = 99, shots: int = 2048) -> dict:
    """Average fidelity over Haar-random input states (angles supplied, e.g. from the QRNG pool, or from a seed)."""
    if angles is None:
        rng = np.random.default_rng(seed)
        angles = [(math.acos(1 - 2 * rng.random()), 2 * math.pi * rng.random()) for _ in range(n_states)]
    fs = []
    for th, ph in angles:
        if method == "exact":
            fs.append(exact_fidelity(th, ph, noise, shots=200)["fidelity"])
        else:
            fs.append(run_tomography(th, ph, noise, shots=shots)["fidelity"])
    f = np.array(fs)
    return {"n": len(fs), "mean": float(f.mean()), "std": float(f.std()), "min": float(f.min()),
            "max": float(f.max()), "fidelities": f.tolist(), "angles": [list(a) for a in angles]}


def analytic_cx_depolarizing_fidelity(p2: float) -> float:
    """Closed form when ONLY the two CX gates are depolarized with probability p2.

    Each depolarized CX turns into a uniform Pauli error on Bob's output with probability p2 (shown in THEORY.md),
    so the output is (1-p2)^2 |psi><psi| + (1-(1-p2)^2) I/2 and F = (1 + (1-p2)^2) / 2.
    """
    return (1 + (1 - p2) ** 2) / 2


def fidelity_sweep(p2_values: list[float], p1_ratio: float = 0.1, readout_ratio: float = 0.0,
                   n_states: int = 12, seed: int = 4) -> dict:
    """Average exact fidelity (over a fixed set of random states) vs. 2-qubit depolarizing strength."""
    rng = np.random.default_rng(seed)
    angles = [(math.acos(1 - 2 * rng.random()), 2 * math.pi * rng.random()) for _ in range(n_states)]
    means = []
    for p2 in p2_values:
        spec = NoiseSpec(p1=p2 * p1_ratio, p2=p2, readout=p2 * readout_ratio)
        means.append(float(np.mean([exact_fidelity(th, ph, spec, shots=200)["fidelity"] for th, ph in angles])))
    return {"p2": list(p2_values), "fidelity": means, "p1_ratio": p1_ratio}


# ------------------------------------------------------------------ Variant C: step engine

@dataclass
class Step:
    name: str
    caption: str
    gate: str
    bloch: list[list[float]]            # Bloch vectors of q0, q1, q2 (length < 1 => mixed / entangled)
    fidelity_bob: float                 # <psi| rho_q2 |psi>
    purity: list[float]
    outcome: dict | None = None


def _one_qubit(gate: str) -> QuantumCircuit:
    c = QuantumCircuit(1)
    getattr(c, gate)(0)
    return c


@dataclass
class TeleportStepper:
    """Gate-by-gate teleportation on a 3-qubit density matrix with optional depolarizing noise.

    Measurement outcomes are sampled with Born probabilities using ``rand`` (a callable returning U[0,1) — e.g.
    the QRNG pool), and the state is projected, so the stepper shows exactly one branch, like a real run.
    """

    theta: float
    phi: float
    noise: NoiseSpec = field(default_factory=NoiseSpec)
    rand: object = None
    steps: list[Step] = field(default_factory=list)

    def _snapshot(self, rho: DensityMatrix, name: str, caption: str, gate: str, outcome=None) -> None:
        vecs, purs = [], []
        for k in range(3):
            red = partial_trace(rho, [i for i in range(3) if i != k])
            vecs.append(bloch_vector(red).tolist())
            purs.append(float(np.real(np.trace(red.data @ red.data))))
        f = fidelity_pure(self.theta, self.phi, partial_trace(rho, [0, 1]))
        self.steps.append(Step(name, caption, gate, vecs, f, purs, outcome))

    def _gate(self, rho: DensityMatrix, circ: QuantumCircuit, qargs: list[int]) -> DensityMatrix:
        rho = rho.evolve(circ, qargs)
        e1, e2 = self.noise.errors()
        err = e1 if len(qargs) == 1 else e2
        if err is not None:
            rho = rho.evolve(err.to_quantumchannel(), qargs)
        return rho

    def run(self) -> list[Step]:
        """Execute all steps and return them."""
        rand = self.rand or np.random.default_rng().random
        rho = DensityMatrix.from_label("000")
        self._snapshot(rho, "init", "All three qubits start in |0>.", "init")

        prep = QuantumCircuit(1)
        prep.u(self.theta, self.phi, 0, 0)
        rho = self._gate(rho, prep, [0])
        self._snapshot(rho, "prepare", "Alice prepares the secret state |psi> on q0.", "u")

        rho = self._gate(rho, _one_qubit("h"), [1])
        self._snapshot(rho, "bell_h", "Hadamard on q1 puts it in superposition.", "h_q1")
        cx = QuantumCircuit(2)
        cx.cx(0, 1)
        rho = self._gate(rho, cx, [1, 2])
        self._snapshot(rho, "bell_cx", "CNOT entangles q1 and q2 into a Bell pair; both arrows shrink to the "
                       "centre: each qubit alone is maximally mixed.", "cx_q1q2")

        rho = self._gate(rho, cx, [0, 1])
        self._snapshot(rho, "bsm_cx", "Alice applies CNOT(q0 -> q1): |psi> becomes entangled with the pair.",
                       "cx_q0q1")
        rho = self._gate(rho, _one_qubit("h"), [0])
        self._snapshot(rho, "bsm_h", "Hadamard on q0 completes the rotation into the Bell basis.", "h_q0")

        # Measure q0 and q1 (Born rule), project, renormalise. Index i = q0 + 2 q1 + 4 q2 (little-endian).
        probs = rho.probabilities([0, 1])  # index = m0 + 2 m1
        r = float(rand())
        k = int(np.searchsorted(np.cumsum(probs), r, side="right"))
        k = min(k, 3)
        m0, m1 = k & 1, (k >> 1) & 1
        P = np.zeros((8, 8))
        for i in range(8):
            if (i & 1) == m0 and ((i >> 1) & 1) == m1:
                P[i, i] = 1
        d = P @ rho.data @ P
        rho = DensityMatrix(d / np.trace(d))
        self._snapshot(rho, "measure", f"Alice measures: m0={m0}, m1={m1}. q0's original state is destroyed "
                       "(no-cloning) — it now only exists in the correlations with Bob.", "measure",
                       {"m0": m0, "m1": m1, "probabilities": [float(p) for p in probs]})

        self._snapshot(rho, "classical", f"Alice sends two classical bits ({m0}{m1}) to Bob. Nothing travels "
                       "faster than light: without these bits Bob's qubit is maximally mixed on average.",
                       "classical", {"m0": m0, "m1": m1})
        if m1:
            rho = self._gate(rho, _one_qubit("x"), [2])
        self._snapshot(rho, "correct_x", "m1=1 -> Bob applies X." if m1 else "m1=0 -> no X needed.", "x_q2")
        if m0:
            rho = self._gate(rho, _one_qubit("z"), [2])
        self._snapshot(rho, "correct_z", "m0=1 -> Bob applies Z." if m0 else "m0=0 -> no Z needed.", "z_q2")
        f = self.steps[-1].fidelity_bob
        self._snapshot(rho, "done", f"Bob now holds |psi>. Fidelity = {f:.4f} "
                       f"({'above' if f > CLASSICAL_FIDELITY_BOUND else 'BELOW'} the 2/3 classical limit).",
                       "done")
        return self.steps
