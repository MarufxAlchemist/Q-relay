"""Precompute heavy datasets for the API, notebooks and report (all from real simulator runs).

Outputs land in data/sweeps/*.json and data/qrng_pool_sim.bin. Run: python scripts/precompute_sweeps.py [--quick]
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from qrelay import dj, distributed_dj, extract, hardware, qrng, stats, teleport  # noqa: E402
from qrelay.noise import NoiseSpec, find_crossing  # noqa: E402

OUT = ROOT / "data" / "sweeps"


def dump(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(obj, default=float))
    print(f"  wrote {name}.json")


def pack_bits(b: np.ndarray) -> str:
    return base64.b64encode(np.packbits(b).tobytes()).decode()


def avg_fidelity(spec: NoiseSpec | None) -> float:
    """Exact Haar-average fidelity from the Pauli transfer matrix: F_avg = (2 F_pro + 1) / 3."""
    return teleport.cardinal_state_test(spec)["average_fidelity"]


def teleport_sweeps(quick: bool) -> None:
    ps = np.round(np.arange(0, 0.61, 0.05 if quick else 0.025), 4).tolist()
    curves = {
        "depolarizing (p1 = p2/10)": [avg_fidelity(NoiseSpec(p1=p / 10, p2=p)) for p in ps],
        "CX-only depolarizing": [avg_fidelity(NoiseSpec(p2=p)) for p in ps],
    }
    # The exact density-matrix path has no readout model, so the readout curve is measured by tomography
    # (cardinal-state average, which equals the Haar average for this channel up to shot noise).
    curves["depolarizing + readout (p/5)"] = [
        np.mean([teleport.run_tomography(th, ph, NoiseSpec(p1=p / 10, p2=p, readout=p / 5), shots=2048,
                                         seed=int(1000 * p) + k)["fidelity"]
                 for k, (th, ph) in enumerate(teleport.CARDINAL_STATES.values())]) for p in ps]
    analytic = [teleport.analytic_cx_depolarizing_fidelity(p) for p in ps]
    dump("teleport_sweep_1d", {
        "p2": ps, "curves": curves, "analytic_cx_only": analytic,
        "crossings": {k: find_crossing(ps, v) for k, v in curves.items()},
        "classical_bound": 2 / 3, "source": "SIM",
    })

    t1s = [200, 100, 50, 20, 10, 5, 2, 1, 0.5]
    dump("teleport_t1_sweep", {"t1_us": t1s, "fidelity": [avg_fidelity(NoiseSpec(t1_us=t, t2_us=t)) for t in t1s],
                               "gate_times_ns": {"1q": 50, "2q": 300}, "source": "SIM"})

    g1 = np.round(np.linspace(0, 0.3, 7 if quick else 13), 4).tolist()
    g2 = np.round(np.linspace(0, 0.6, 7 if quick else 13), 4).tolist()
    grid = [[avg_fidelity(NoiseSpec(p1=a, p2=b)) for b in g2] for a in g1]
    dump("teleport_sweep_2d", {"p1": g1, "p2": g2, "fidelity": grid, "classical_bound": 2 / 3, "source": "SIM"})


def teleport_states(quick: bool) -> None:
    pool = qrng.make_pool(65536, seed=2026)
    n = 60 if quick else 200
    angles = [pool.haar_angles() for _ in range(n)]
    ideal = teleport.haar_average(angles=angles)
    noisy_spec = NoiseSpec(p1=0.01, p2=0.1, readout=0.02)
    noisy = teleport.haar_average(angles=angles, noise=noisy_spec)
    tomo = teleport.haar_average(angles=angles[: (30 if quick else 200)], method="tomography", shots=1024)
    card_ideal = teleport.cardinal_state_test()
    card_noisy = teleport.cardinal_state_test(noisy_spec)
    card_tomo = teleport.cardinal_state_test(noisy_spec, method="tomography", shots=8192)
    mit = [teleport.run_tomography(th, ph, noisy_spec, shots=8192, mitigate=True, seed=k)
           for k, (th, ph) in enumerate(teleport.CARDINAL_STATES.values())]
    dump("teleport_states", {
        "angles_source": "QRNG pool (SIM)", "ideal_exact": ideal, "noisy_exact": noisy, "ideal_tomography": tomo,
        "noisy_spec": noisy_spec.__dict__, "cardinal_ideal": card_ideal, "cardinal_noisy_exact": card_noisy,
        "cardinal_noisy_tomography": card_tomo,
        "mitigation": {"raw": float(np.mean([m["fidelity"] for m in mit])),
                       "mitigated": float(np.mean([m["fidelity_mitigated"] for m in mit]))},
        "source": "SIM",
    })


def qrng_compare(quick: bool) -> None:
    n = 200_000 if quick else 1_000_000
    t = time.time()
    q = qrng.generate_bits(n, m=16, seed=2026)
    qrng.save_pool(q, str(ROOT / "data" / "qrng_pool_sim.bin"))
    print(f"  QRNG sim: {n} bits in {time.time() - t:.1f}s")
    sources = {"QRNG (Aer simulator)": (q, "SIM"), "PCG64 (NumPy)": (stats.prng_pcg64(n), "PRNG"),
               "Mersenne Twister": (stats.prng_mt19937(n), "PRNG"), "RANDU (low byte)": (stats.prng_randu(n), "PRNG")}
    for src in ("HW", "EMU"):
        rec = hardware.latest(src)
        if rec:
            b = hardware.load_bits(rec)
            if b is not None and len(b) >= 10_000:
                sources[f"QRNG ({rec['backend']}, {src})"] = (b, src)
    out = {}
    for name, (b, src) in sources.items():
        s = stats.run_suite(b)
        out[name] = {"source": src, "suite": s, "fingerprint": pack_bits(stats.fingerprint(b, 256).ravel()),
                     "walk": stats.random_walk(b), "autocorr": stats.autocorrelation_profile(b),
                     "counts": [int(len(b) - b.sum()), int(b.sum())], "preview": b[:512].tolist()}
        print(f"  {name}: {s['passed']}/{s['total']}")
    dump("qrng_compare", out)


def extractor_demo(quick: bool) -> None:
    n = 200_000 if quick else 400_000
    biased = qrng.generate_bits(n, m=16, seed=77, noise_model=qrng.biased_readout_model(0.2))
    res = extract.compare_extractors(biased)
    out = {"source_description": "Aer QRNG with asymmetric readout error P(read 0 | 1) = 0.2 -> P(1) = 0.4",
           "h_min_per_bit": float(stats.entropy_metrics(biased)["min_entropy_per_bit"]), "methods": {}}
    for k, v in res.items():
        suite = stats.run_suite(v["bits"]) if v["n_out"] >= 10_000 else None
        out["methods"][k] = {"n_out": v["n_out"], "yield": v["yield"], "p1": v["p1"], "suite": suite,
                             "fingerprint": pack_bits(stats.fingerprint(v["bits"], 128).ravel())}
    rec = hardware.latest("HW") or hardware.latest("EMU")
    if rec is not None and (b := hardware.load_bits(rec)) is not None:
        hres = extract.compare_extractors(b)
        out["device"] = {"backend": rec["backend"], "source": rec["source"],
                         "methods": {k: {"n_out": v["n_out"], "yield": v["yield"], "p1": v["p1"],
                                         "suite": stats.run_suite(v["bits"]) if v["n_out"] >= 10_000 else None}
                                     for k, v in hres.items()}}
    dump("extractors", out)


def dj_noise(quick: bool) -> None:
    levels = np.round(np.linspace(0, 0.3, 6 if quick else 11), 4).tolist()
    ns = [2, 3, 4] if quick else [2, 3, 4, 5, 6]
    out = {"levels_p2": levels, "p1_ratio": 0.1, "by_n": {}}
    for n in ns:
        rows = {}
        for o in dj.oracle_library(n, seed=3):
            rows[o.name] = {"kind": o.kind, "cx": o.two_qubit_gate_count(),
                            "success": [dj.run_dj(o, shots=2048, noise=NoiseSpec(p1=p / 10, p2=p) if p else None,
                                                  seed=int(p * 1000) + n)["success_probability"] for p in levels]}
        out["by_n"][str(n)] = rows
        print(f"  dj noise n={n}")
    out["source"] = "SIM"
    dump("dj_noise", out)


def dist_heatmap(quick: bool) -> None:
    levels = np.round(np.linspace(0, 0.4, 5 if quick else 9), 4).tolist()
    out = {}
    for o in (dj.parity(3), dj.random_balanced(3, seed=11)):
        out[o.name] = distributed_dj.stage_noise_heatmap(o, levels, shots=2048)
    out["source"] = "SIM"
    dump("dist_dj_heatmap", out)


def complexity() -> None:
    dump("dj_complexity", {"rows": dj.complexity_table(20)})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    jobs = {"teleport_sweeps": lambda: teleport_sweeps(a.quick), "teleport_states": lambda: teleport_states(a.quick),
            "qrng_compare": lambda: qrng_compare(a.quick), "extractors": lambda: extractor_demo(a.quick),
            "dj_noise": lambda: dj_noise(a.quick), "dist_heatmap": lambda: dist_heatmap(a.quick),
            "complexity": complexity}
    for name, fn in jobs.items():
        if a.only and name not in a.only:
            continue
        t = time.time()
        print(f"[{name}]")
        fn()
        print(f"  ({time.time() - t:.1f}s)")


if __name__ == "__main__":
    main()
