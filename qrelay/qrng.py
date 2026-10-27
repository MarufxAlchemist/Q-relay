"""Quantum random number generator: Hadamard + measure, batching, and an entropy pool.

Honesty note: bits produced on Aer are *simulated* — Aer samples measurement outcomes with a classical PRNG.
Only bits measured on real IBM hardware are physically random.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from qiskit import QuantumCircuit, transpile
from qiskit_aer.noise import NoiseModel, ReadoutError

from .backends import simulator


def qrng_circuit(m: int = 1) -> QuantumCircuit:
    """H on each of ``m`` qubits followed by measurement: each qubit yields one unbiased bit (Born rule)."""
    qc = QuantumCircuit(m, m, name=f"qrng_{m}")
    qc.h(range(m))
    qc.measure(range(m), range(m))
    return qc


def memory_to_bits(memory: list[str], m: int) -> np.ndarray:
    """Convert per-shot memory strings into a flat bit array.

    Each memory string is little-endian: its right-most character is clbit 0. We reverse each shot so the output
    order is shot0[q0, q1, ..., q_{m-1}], shot1[q0, ...], ...
    """
    raw = np.frombuffer("".join(memory).encode("ascii"), dtype=np.uint8) - ord("0")
    return raw.reshape(-1, m)[:, ::-1].ravel().astype(np.uint8)


def biased_readout_model(p1_to_0: float = 0.2, p0_to_1: float = 0.0) -> NoiseModel:
    """Asymmetric readout error: an |1> is misread as 0 with probability ``p1_to_0``.

    With the default 0.2, an H-then-measure qubit gives P(1) = 0.5 * 0.8 = 0.4 — a physically motivated biased
    source for demonstrating extractors.
    """
    nm = NoiseModel()
    nm.add_all_qubit_readout_error(ReadoutError([[1 - p0_to_1, p0_to_1], [p1_to_0, 1 - p1_to_0]]))
    return nm


def generate_bits(n_bits: int, m: int = 16, seed: int | None = None, noise_model: NoiseModel | None = None,
                  max_shots_per_job: int = 100_000) -> np.ndarray:
    """Generate ``n_bits`` QRNG bits on Aer using an ``m``-qubit parallel circuit (chunked over jobs)."""
    sim = simulator(noise_model=noise_model, seed=seed)
    circ = transpile(qrng_circuit(m), sim)
    shots_needed = math.ceil(n_bits / m)
    chunks: list[np.ndarray] = []
    job = 0
    while shots_needed > 0:
        shots = min(shots_needed, max_shots_per_job)
        if seed is not None:
            sim.set_options(seed_simulator=seed + job)
        mem = sim.run(circ, shots=shots, memory=True).result().get_memory()
        chunks.append(memory_to_bits(mem, m))
        shots_needed -= shots
        job += 1
    return np.concatenate(chunks)[:n_bits]


@dataclass
class EntropyPool:
    """A pool of random bits consumed sequentially (bits are never reused)."""

    bits: np.ndarray
    source: str = "SIM"
    cursor: int = 0
    log: list[str] = field(default_factory=list)

    @property
    def remaining(self) -> int:
        return len(self.bits) - self.cursor

    def take(self, k: int, purpose: str = "") -> np.ndarray:
        """Consume ``k`` bits. Raises if the pool is exhausted."""
        if k > self.remaining:
            raise RuntimeError(f"entropy pool exhausted ({self.remaining} bits left, {k} requested)")
        out = self.bits[self.cursor:self.cursor + k]
        self.cursor += k
        if purpose:
            self.log.append(f"{k} bits -> {purpose}")
        return out

    def uniform(self, purpose: str = "") -> float:
        """A float in [0, 1) built from 53 bits."""
        b = self.take(53, purpose)
        return float(int("".join(map(str, b)), 2)) / 2.0**53

    def randint(self, n: int, purpose: str = "") -> int:
        """Unbiased integer in [0, n) via rejection sampling."""
        if n <= 1:
            return 0
        k = (n - 1).bit_length()
        while True:
            v = int("".join(map(str, self.take(k))), 2)
            if v < n:
                if purpose:
                    self.log.append(f"randint({n}) -> {purpose}")
                return v

    def haar_angles(self) -> tuple[float, float]:
        """Haar-random single-qubit state as Bloch angles: cos(theta) ~ U[-1, 1], phi ~ U[0, 2pi)."""
        theta = math.acos(1 - 2 * self.uniform("haar cos(theta)"))
        phi = 2 * math.pi * self.uniform("haar phi")
        return theta, phi


def make_pool(n_bits: int = 65_536, seed: int | None = None) -> EntropyPool:
    """Fresh simulator-sourced entropy pool."""
    return EntropyPool(generate_bits(n_bits, seed=seed), source="SIM")


def save_pool(bits: np.ndarray, path: str) -> None:
    """Pack bits (MSB-first within each byte) to a binary file."""
    np.packbits(bits).tofile(path)


def load_pool(path: str) -> np.ndarray:
    """Inverse of :func:`save_pool`."""
    return np.unpackbits(np.fromfile(path, dtype=np.uint8))
