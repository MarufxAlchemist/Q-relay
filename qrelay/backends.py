"""Shared execution helpers: simulators, source labels and classical-register parsing."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
from qiskit_aer.noise import NoiseModel

Source = Literal["SIM", "EMU", "HW"]

SOURCE_LABELS: dict[str, str] = {
    "SIM": "SIMULATOR (pseudo-random under the hood)",
    "EMU": "EMULATED (noise model from a real device)",
    "HW": "IBM HARDWARE (physical)",
}

EMULATED_BACKEND_NAME = "FakeBrisbane"


def simulator(noise_model: NoiseModel | None = None, seed: int | None = None,
              method: str = "automatic") -> AerSimulator:
    """Return an Aer simulator. Aer is a classical simulator: its outcomes come from a classical PRNG."""
    return AerSimulator(method=method, noise_model=noise_model, seed_simulator=seed)


@lru_cache(maxsize=1)
def fake_backend():
    """The fake IBM device used for emulation (snapshot of a real device's calibration data)."""
    from qiskit_ibm_runtime.fake_provider import FakeBrisbane
    return FakeBrisbane()


@lru_cache(maxsize=1)
def emulated_simulator() -> AerSimulator:
    """Aer simulator carrying the fake device's noise model and coupling map (slow to build, so cached)."""
    return AerSimulator.from_backend(fake_backend())


def register_counts(counts: dict[str, int], circuit: QuantumCircuit, reg_name: str) -> dict[str, int]:
    """Marginalise Aer counts onto one classical register.

    Aer joins registers with spaces and prints the *last-created* register first, so register i (creation
    order) is token ``len(cregs) - 1 - i``. Within a token, bit 0 of the register is the right-most character
    (Qiskit little-endian).
    """
    names = [c.name for c in circuit.cregs]
    idx = len(names) - 1 - names.index(reg_name)
    out: dict[str, int] = {}
    for key, v in counts.items():
        tok = key.split()[idx]
        out[tok] = out.get(tok, 0) + v
    return out
