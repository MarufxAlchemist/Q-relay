"""Statistical test suite for bit sequences, implemented from the NIST SP 800-22 Rev. 1a definitions.

Every test returns a p-value; a sequence "passes" at significance alpha = 0.01 when p >= alpha.
Passing does NOT prove randomness — it only means the test failed to detect non-randomness.
"""

from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass

import numpy as np
from scipy.special import erfc, gammaincc
from scipy.stats import chi2 as chi2_dist, norm

ALPHA = 0.01


@dataclass
class TestResult:
    name: str
    p_value: float | None  # None for informational metrics
    passed: bool | None
    statistic: float
    detail: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _res(name: str, p: float, stat: float, detail: str = "", alpha: float = ALPHA) -> TestResult:
    p = float(p)
    return TestResult(name, p, bool(p >= alpha), float(stat), detail)


def frequency_monobit(b: np.ndarray) -> TestResult:
    """NIST 2.1: is the proportion of ones close to 1/2?"""
    n = len(b)
    s = np.sum(2 * b.astype(np.int64) - 1)
    s_obs = abs(s) / math.sqrt(n)
    return _res("Frequency (monobit)", erfc(s_obs / math.sqrt(2)), s_obs, f"ones={int(b.sum())}/{n}")


def block_frequency(b: np.ndarray, M: int = 128) -> TestResult:
    """NIST 2.2: proportion of ones within M-bit blocks."""
    N = len(b) // M
    pis = b[: N * M].reshape(N, M).mean(axis=1)
    chi2 = 4 * M * np.sum((pis - 0.5) ** 2)
    return _res("Block frequency", gammaincc(N / 2, chi2 / 2), chi2, f"M={M}, N={N}")


def runs(b: np.ndarray) -> TestResult:
    """NIST 2.3: number of uninterrupted runs of identical bits."""
    n = len(b)
    pi = b.mean()
    if abs(pi - 0.5) >= 2 / math.sqrt(n):
        return _res("Runs", 0.0, float("nan"), "frequency pre-test failed")
    v = 1 + int(np.count_nonzero(b[1:] != b[:-1]))
    p = erfc(abs(v - 2 * n * pi * (1 - pi)) / (2 * math.sqrt(2 * n) * pi * (1 - pi)))
    return _res("Runs", p, v, f"runs={v}")


def _longest_run_ones(block: np.ndarray) -> int:
    padded = np.concatenate(([0], block, [0]))
    d = np.diff(padded.astype(np.int8))
    starts, ends = np.flatnonzero(d == 1), np.flatnonzero(d == -1)
    return int((ends - starts).max()) if len(starts) else 0


def longest_run(b: np.ndarray) -> TestResult:
    """NIST 2.4: longest run of ones within M-bit blocks vs. its theoretical distribution."""
    n = len(b)
    if n >= 750_000:
        M, lo, hi = 10_000, 10, 16
        pi = [0.0882, 0.2092, 0.2483, 0.1933, 0.1208, 0.0675, 0.0727]
    elif n >= 6272:
        M, lo, hi = 128, 4, 9
        pi = [0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124]
    else:
        M, lo, hi = 8, 1, 4
        pi = [0.2148, 0.3672, 0.2305, 0.1875]
    N = n // M
    blocks = b[: N * M].reshape(N, M)
    longest = np.clip([_longest_run_ones(r) for r in blocks], lo, hi) - lo
    v = np.bincount(longest, minlength=len(pi))
    exp = N * np.array(pi)
    chi2 = float(np.sum((v - exp) ** 2 / exp))
    return _res("Longest run of ones", gammaincc((len(pi) - 1) / 2, chi2 / 2), chi2, f"M={M}, N={N}")


def _pattern_counts(b: np.ndarray, m: int) -> np.ndarray:
    """Counts of all overlapping m-bit patterns, with wrap-around (as NIST specifies)."""
    if m == 0:
        return np.array([len(b)])
    ext = np.concatenate((b, b[: m - 1])).astype(np.int64)
    n = len(b)
    idx = np.zeros(n, dtype=np.int64)
    for k in range(m):
        idx = (idx << 1) | ext[k:k + n]
    return np.bincount(idx, minlength=2**m)


def serial(b: np.ndarray, m: int = 3) -> TestResult:
    """NIST 2.11: uniformity of overlapping m-bit patterns (covers 2- and 3-bit pattern frequencies for m=3)."""
    n = len(b)

    def psi2(mm: int) -> float:
        if mm <= 0:
            return 0.0
        c = _pattern_counts(b, mm)
        return float((2**mm / n) * np.sum(c.astype(np.float64) ** 2) - n)

    d1 = psi2(m) - psi2(m - 1)
    d2 = psi2(m) - 2 * psi2(m - 1) + psi2(m - 2)
    p1 = gammaincc(2 ** (m - 2), d1 / 2)
    p2 = gammaincc(2 ** (m - 3), d2 / 2)
    p = min(p1, p2)
    return _res("Serial (2/3-bit patterns)", p, d1, f"m={m}, p1={p1:.4f}, p2={p2:.4f}")


def approximate_entropy(b: np.ndarray, m: int | None = None) -> TestResult:
    """NIST 2.12: frequency of overlapping m- vs (m+1)-bit patterns."""
    n = len(b)
    if m is None:
        m = max(2, min(10, int(math.log2(n)) - 6))

    def phi(mm: int) -> float:
        c = _pattern_counts(b, mm).astype(np.float64) / n
        c = c[c > 0]
        return float(np.sum(c * np.log(c)))

    apen = phi(m) - phi(m + 1)
    chi2 = 2 * n * (math.log(2) - apen)
    return _res("Approximate entropy", gammaincc(2 ** (m - 1), chi2 / 2), chi2, f"m={m}, ApEn={apen:.6f}")


def _cusum_p(z: float, n: int) -> float:
    sq = math.sqrt(n)
    k1 = np.arange(int(math.floor((-n / z + 1) / 4)), int(math.floor((n / z - 1) / 4)) + 1)
    k2 = np.arange(int(math.floor((-n / z - 3) / 4)), int(math.floor((n / z - 1) / 4)) + 1)
    s1 = np.sum(norm.cdf((4 * k1 + 1) * z / sq) - norm.cdf((4 * k1 - 1) * z / sq))
    s2 = np.sum(norm.cdf((4 * k2 + 3) * z / sq) - norm.cdf((4 * k2 + 1) * z / sq))
    return float(1 - s1 + s2)


def cumulative_sums(b: np.ndarray) -> TestResult:
    """NIST 2.13: maximal excursion of the +-1 random walk (forward and backward; reports the smaller p)."""
    x = 2 * b.astype(np.int64) - 1
    zf = int(np.max(np.abs(np.cumsum(x))))
    zb = int(np.max(np.abs(np.cumsum(x[::-1]))))
    pf, pb = _cusum_p(max(zf, 1), len(b)), _cusum_p(max(zb, 1), len(b))
    return _res("Cumulative sums", min(pf, pb), zf, f"z_fwd={zf}, z_bwd={zb}, p_fwd={pf:.4f}, p_bwd={pb:.4f}")


def spectral_dft(b: np.ndarray) -> TestResult:
    """NIST 2.6: periodic features detected as peaks in the discrete Fourier transform."""
    n = len(b)
    x = 2 * b.astype(np.float64) - 1
    mags = np.abs(np.fft.rfft(x))[: n // 2]
    T = math.sqrt(math.log(1 / 0.05) * n)
    n0 = 0.95 * n / 2
    n1 = int(np.count_nonzero(mags < T))
    d = (n1 - n0) / math.sqrt(n * 0.95 * 0.05 / 4)
    return _res("Spectral (DFT)", erfc(abs(d) / math.sqrt(2)), d, f"peaks below T: {n1}/{n//2}")


def autocorrelation(b: np.ndarray, max_lag: int = 32) -> TestResult:
    """Autocorrelation at lags 1..max_lag (z-test per lag; Bonferroni-corrected pass threshold)."""
    n = len(b)
    ps, zs = [], []
    for d in range(1, max_lag + 1):
        a = int(np.count_nonzero(b[:-d] != b[d:]))
        z = 2 * (a - (n - d) / 2) / math.sqrt(n - d)
        zs.append(z)
        ps.append(float(erfc(abs(z) / math.sqrt(2))))
    p_min = min(ps)
    worst = int(np.argmin(ps)) + 1
    # Bonferroni: compare min p to alpha / number of lags; report the corrected p-value.
    p_corr = min(1.0, p_min * max_lag)
    r = _res(f"Autocorrelation (lags 1-{max_lag})", p_corr, zs[worst - 1], f"worst lag={worst}")
    return r


def autocorrelation_profile(b: np.ndarray, max_lag: int = 32) -> list[float]:
    """Normalised autocorrelation coefficient (of the +-1 sequence) at lags 1..max_lag."""
    x = 2 * b.astype(np.float64) - 1
    return [float(np.mean(x[:-d] * x[d:])) for d in range(1, max_lag + 1)]


def byte_chi_square(b: np.ndarray) -> TestResult:
    """Chi-square goodness of fit of non-overlapping bytes to the uniform distribution on 256 values."""
    by = np.packbits(b[: len(b) // 8 * 8])
    c = np.bincount(by, minlength=256)
    exp = len(by) / 256
    chi2 = float(np.sum((c - exp) ** 2 / exp))
    return _res("Byte chi-square", chi2_dist.sf(chi2, 255), chi2, f"bytes={len(by)}")


def entropy_metrics(b: np.ndarray) -> dict[str, float]:
    """Shannon and min-entropy, per bit and per byte (plug-in estimates)."""
    p1 = float(b.mean())
    p = np.array([1 - p1, p1])
    p = p[p > 0]
    by = np.packbits(b[: len(b) // 8 * 8])
    q = np.bincount(by, minlength=256) / max(len(by), 1)
    qn = q[q > 0]
    return {
        "p1": p1,
        "shannon_per_bit": float(-np.sum(p * np.log2(p))),
        "min_entropy_per_bit": float(-math.log2(max(p1, 1 - p1))),
        "shannon_per_byte": float(-np.sum(qn * np.log2(qn))),
        "min_entropy_per_byte": float(-math.log2(q.max())) if len(by) else 0.0,
    }


TESTS = [frequency_monobit, block_frequency, runs, longest_run, serial, approximate_entropy,
         cumulative_sums, spectral_dft, autocorrelation, byte_chi_square]


def run_suite(b: np.ndarray) -> dict:
    """Run every test on ``b``. Returns test results, entropy metrics and the pass count."""
    b = np.asarray(b, dtype=np.uint8)
    results = [t(b) for t in TESTS]
    ent = entropy_metrics(b)
    return {
        "n_bits": int(len(b)),
        "tests": [r.to_dict() for r in results],
        "entropy": ent,
        "passed": sum(1 for r in results if r.passed),
        "total": len(results),
    }


# ---------------------------------------------------------------- reference generators

def prng_pcg64(n: int, seed: int = 12345) -> np.ndarray:
    """NumPy's default PCG64 generator."""
    return np.random.Generator(np.random.PCG64(seed)).integers(0, 2, n, dtype=np.uint8)


def prng_mt19937(n: int, seed: int = 12345) -> np.ndarray:
    """Python's ``random`` module (Mersenne Twister MT19937)."""
    r = random.Random(seed)
    nbytes = (n + 7) // 8
    raw = r.getrandbits(nbytes * 8).to_bytes(nbytes, "big")
    return np.unpackbits(np.frombuffer(raw, dtype=np.uint8))[:n]


def prng_randu(n: int, seed: int = 1) -> np.ndarray:
    """RANDU (x <- 65539 x mod 2^31), keeping the LOW byte of each output — a classic naive extraction.

    RANDU is a famously broken LCG; its low bits have tiny periods (bit 0 is constant for odd seeds), so the suite
    must flag it. This is our control that proves the tests discriminate.
    """
    k = (n + 7) // 8
    out = np.empty(k, dtype=np.uint8)
    x = seed | 1
    for i in range(k):
        x = (65539 * x) & 0x7FFFFFFF
        out[i] = x & 0xFF
    return np.unpackbits(out)[:n]


def fingerprint(b: np.ndarray, side: int = 256) -> np.ndarray:
    """Reshape the first side*side bits into a 2-D bitmap for visual inspection."""
    need = side * side
    if len(b) < need:
        b = np.pad(b, (0, need - len(b)))
    return b[:need].reshape(side, side)


def random_walk(b: np.ndarray, max_points: int = 2000) -> dict:
    """Cumulative +-1 walk (downsampled) and its sqrt(n) envelope."""
    s = np.cumsum(2 * b.astype(np.int64) - 1)
    idx = np.unique(np.linspace(0, len(s) - 1, min(max_points, len(s))).astype(int))
    return {"x": (idx + 1).tolist(), "walk": s[idx].tolist(), "envelope": np.sqrt(idx + 1).tolist()}
