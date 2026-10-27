"""Noise models and gate-level noise injection.

Noise is inserted as explicit Aer ``QuantumError`` instructions after every gate (recursing into ``if_else``
blocks). Unlike a gate-name ``NoiseModel`` this lets us confine noise to one stage of a circuit.
"""

from __future__ import annotations

from dataclasses import dataclass

from qiskit import QuantumCircuit, transpile
from qiskit.circuit import ControlFlowOp
from qiskit_aer.noise import (NoiseModel, QuantumError, ReadoutError, depolarizing_error,
                              thermal_relaxation_error)

NON_GATES = {"measure", "barrier", "reset", "delay"}
BASIS = ["u", "cx", "h", "x", "z", "s", "sdg", "cz", "id"]


@dataclass
class NoiseSpec:
    """A simple, serialisable noise description.

    p1 / p2: depolarizing probability after each 1-/2-qubit gate (Qiskit convention:
    rho -> (1-p) rho + p I/d). t1_us / t2_us > 0 adds thermal relaxation (gate times 50 ns / 300 ns).
    readout: symmetric readout flip probability.
    """

    p1: float = 0.0
    p2: float = 0.0
    t1_us: float = 0.0
    t2_us: float = 0.0
    readout: float = 0.0

    @property
    def is_ideal(self) -> bool:
        return self.p1 == 0 and self.p2 == 0 and self.t1_us == 0 and self.readout == 0

    @classmethod
    def from_level(cls, level: float) -> "NoiseSpec":
        """One-knob noise used by the UI slider: level in [0, 1] -> p2 = 0.5 level, p1 = p2 / 10, readout = p2 / 5."""
        p2 = 0.5 * max(0.0, min(1.0, level))
        return cls(p1=p2 / 10, p2=p2, readout=p2 / 5)

    def errors(self) -> tuple[QuantumError | None, QuantumError | None]:
        """Per-gate (1q, 2q) errors."""
        e1 = depolarizing_error(self.p1, 1) if self.p1 > 0 else None
        e2 = depolarizing_error(self.p2, 2) if self.p2 > 0 else None
        if self.t1_us > 0:
            t2 = min(self.t2_us or self.t1_us, 2 * self.t1_us)
            r1 = thermal_relaxation_error(self.t1_us * 1e3, t2 * 1e3, 50)
            r2 = thermal_relaxation_error(self.t1_us * 1e3, t2 * 1e3, 300)
            r2 = r2.tensor(r2)
            e1 = r1 if e1 is None else e1.compose(r1)
            e2 = r2 if e2 is None else e2.compose(r2)
        return e1, e2

    def readout_model(self) -> NoiseModel | None:
        if self.readout <= 0:
            return None
        nm = NoiseModel()
        p = self.readout
        nm.add_all_qubit_readout_error(ReadoutError([[1 - p, p], [p, 1 - p]]))
        return nm


def noisify(qc: QuantumCircuit, e1: QuantumError | None, e2: QuantumError | None,
            qubits: set[int] | None = None) -> QuantumCircuit:
    """Return a copy of ``qc`` with ``e1``/``e2`` inserted after every 1-/2-qubit gate.

    If ``qubits`` is given, only gates acting exclusively on those qubit indices are noisy. Gates on >2 qubits
    must be decomposed first (see :func:`decompose_for_noise`).
    """
    out = qc.copy_empty_like()
    index = {q: i for i, q in enumerate(qc.qubits)}
    for inst in qc.data:
        op = inst.operation
        if isinstance(op, ControlFlowOp):
            blocks = [noisify(b, e1, e2, None if qubits is None else
                              {i for i, q in enumerate(b.qubits) if index.get(q, -1) in qubits})
                      for b in op.blocks]
            out.append(op.replace_blocks(blocks), inst.qubits, inst.clbits)
            continue
        out.append(op, inst.qubits, inst.clbits)
        if op.name in NON_GATES or op.name.startswith("save_") or op.name.startswith("set_"):
            continue
        idx = [index[q] for q in inst.qubits]
        if qubits is not None and not set(idx) <= qubits:
            continue
        if len(idx) == 1 and e1 is not None:
            out.append(e1, inst.qubits)
        elif len(idx) == 2 and e2 is not None:
            out.append(e2, inst.qubits)
        elif len(idx) > 2:
            raise ValueError(f"decompose {op.name} before adding noise")
    return out


def decompose_for_noise(qc: QuantumCircuit) -> QuantumCircuit:
    """Decompose multi-controlled gates into 1- and 2-qubit gates so each gate can be made noisy."""
    if all(len(i.qubits) <= 2 or i.operation.name in NON_GATES for i in qc.data
           if not isinstance(i.operation, ControlFlowOp)):
        return qc
    return transpile(qc, basis_gates=BASIS, optimization_level=0)


def apply_noise(qc: QuantumCircuit, spec: NoiseSpec, qubits: set[int] | None = None) -> QuantumCircuit:
    """Decompose and noisify a circuit according to ``spec`` (readout noise is applied separately via a NoiseModel)."""
    e1, e2 = spec.errors()
    if e1 is None and e2 is None:
        return qc
    return noisify(decompose_for_noise(qc), e1, e2, qubits)


def device_noise_model() -> NoiseModel:
    """Noise model built from the fake IBM device's calibration snapshot (labelled EMULATED, never hardware)."""
    from .backends import fake_backend
    return NoiseModel.from_backend(fake_backend())


def find_crossing(xs: list[float], ys: list[float], level: float = 2 / 3) -> float | None:
    """First x where y crosses below ``level`` (linear interpolation); None if it never does."""
    for i in range(1, len(xs)):
        if ys[i - 1] >= level > ys[i]:
            t = (ys[i - 1] - level) / (ys[i - 1] - ys[i])
            return xs[i - 1] + t * (xs[i] - xs[i - 1])
    return None
