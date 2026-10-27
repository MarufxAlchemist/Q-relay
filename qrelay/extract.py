"""Bias mitigation / randomness extraction: Von Neumann, XOR, and Toeplitz hashing."""

from __future__ import annotations

import math

import numpy as np


def von_neumann(b: np.ndarray) -> np.ndarray:
    """Von Neumann (1951): read pairs; 01 -> 0, 10 -> 1, discard 00/11.

    Output is exactly unbiased if input bits are independent with a fixed bias; yield is p(1-p) per input bit.
    """
    pairs = b[: len(b) // 2 * 2].reshape(-1, 2)
    keep = pairs[:, 0] != pairs[:, 1]
    return pairs[keep, 0].astype(np.uint8)  # output the first bit of each unequal pair


def xor_pairs(b: np.ndarray) -> np.ndarray:
    """XOR adjacent pairs. Bias e = p - 1/2 shrinks to 2e^2 (piling-up lemma); yield 1/2."""
    return (b[0: len(b) // 2 * 2: 2] ^ b[1: len(b) // 2 * 2: 2]).astype(np.uint8)


def toeplitz_output_length(n_in: int, min_entropy_per_bit: float, eps_exp: int = 32) -> int:
    """Leftover hash lemma: m = k - 2 log2(1/eps), with k = n_in * h_min and eps = 2^-eps_exp."""
    return max(0, int(math.floor(n_in * min_entropy_per_bit)) - 2 * eps_exp)


def toeplitz_matrix(n_in: int, n_out: int, seed: int | np.ndarray = 2026) -> np.ndarray:
    """Random binary Toeplitz matrix (n_out x n_in) defined by n_in + n_out - 1 seed bits: T[i, j] = s[i - j + n_in - 1]."""
    if isinstance(seed, np.ndarray):
        s = seed[: n_in + n_out - 1].astype(np.uint8)
    else:
        s = np.random.Generator(np.random.PCG64(seed)).integers(0, 2, n_in + n_out - 1, dtype=np.uint8)
    i = np.arange(n_out)[:, None]
    j = np.arange(n_in)[None, :]
    return s[i - j + n_in - 1]


def toeplitz_extract(b: np.ndarray, min_entropy_per_bit: float, n_in: int = 1024,
                     seed: int | np.ndarray = 2026) -> np.ndarray:
    """Toeplitz-hashing extractor (a two-universal hash family): out_block = T @ in_block mod 2.

    The seed must be uniform and independent of the source; here it is a recorded PCG64 seed (or QRNG bits).
    """
    n_out = toeplitz_output_length(n_in, min_entropy_per_bit)
    if n_out == 0:
        return np.zeros(0, dtype=np.uint8)
    T = toeplitz_matrix(n_in, n_out, seed).astype(np.float32)
    nb = len(b) // n_in
    blocks = b[: nb * n_in].reshape(nb, n_in).astype(np.float32)
    # float32 matmul is exact here: sums are integers <= 1024 < 2^24.
    out = (blocks @ T.T).astype(np.int64) % 2
    return out.ravel().astype(np.uint8)


def biased_source(n: int, p1: float = 0.4, seed: int = 7) -> np.ndarray:
    """Synthetic i.i.d. biased bits with P(1) = p1."""
    return (np.random.Generator(np.random.PCG64(seed)).random(n) < p1).astype(np.uint8)


def compare_extractors(b: np.ndarray, toeplitz_seed: int = 2026) -> dict[str, dict]:
    """Apply each extractor to ``b`` and report bias and yield. Min-entropy for Toeplitz is estimated from ``b``."""
    p1 = float(b.mean())
    h_min = -math.log2(max(p1, 1 - p1))
    outs = {
        "raw": b,
        "von_neumann": von_neumann(b),
        "xor": xor_pairs(b),
        "toeplitz": toeplitz_extract(b, h_min, seed=toeplitz_seed),
    }
    return {
        k: {"n_out": int(len(v)), "yield": len(v) / len(b), "p1": float(v.mean()) if len(v) else float("nan"),
            "bits": v}
        for k, v in outs.items()
    }
