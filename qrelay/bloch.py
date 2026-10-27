"""Bloch vectors from (reduced) density matrices.

Coordinates are Qiskit's (x, y, z) with |0> at +z. The web client maps them to three.js (Y-up) as
(x, y, z)_qiskit -> (x, z, -y)_three, which preserves handedness (documented in docs/THEORY.md).
"""

from __future__ import annotations

import numpy as np
from qiskit.quantum_info import DensityMatrix, Statevector, partial_trace

X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)


def bloch_vector(rho) -> np.ndarray:
    """r = (Tr rho X, Tr rho Y, Tr rho Z) for a single-qubit state. |r| < 1 means the qubit is mixed."""
    r = np.asarray(rho.data if hasattr(rho, "data") else rho)
    if r.ndim == 1:  # statevector
        r = np.outer(r, np.conj(r))
    return np.real([np.trace(r @ X), np.trace(r @ Y), np.trace(r @ Z)])


def bloch_vectors(state: Statevector | DensityMatrix, n: int | None = None) -> list[list[float]]:
    """Bloch vector of every qubit of an n-qubit state (via partial traces)."""
    n = n or state.num_qubits
    out = []
    for k in range(n):
        red = partial_trace(state, [i for i in range(n) if i != k])
        out.append([float(v) for v in bloch_vector(red)])
    return out
