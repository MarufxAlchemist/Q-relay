"""Regenerate every figure used in docs/REPORT.md from real runs / precomputed sweeps (docs/figures/*.png)."""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
warnings.filterwarnings("ignore")

from qrelay import dj, distributed_dj, hardware, plots, qrng, stats, teleport  # noqa: E402
from qrelay.noise import NoiseSpec  # noqa: E402

FIG = ROOT / "docs" / "figures"
SW = ROOT / "data" / "sweeps"


def sweep(name):
    return json.loads((SW / f"{name}.json").read_text())


def save(fig, name):
    fig.savefig(FIG / name, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print("  ", name)


def main() -> None:
    FIG.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"axes.grid": True, "grid.alpha": 0.25})

    # circuits
    for name, qc in [("circuit_teleport_dynamic.png", teleport.teleport_circuit(1.1, 0.7, "dynamic")),
                     ("circuit_teleport_deferred.png", teleport.teleport_circuit(1.1, 0.7, "deferred")),
                     ("circuit_qrng.png", qrng.qrng_circuit(4)),
                     ("circuit_dj_parity3.png", dj.dj_circuit(dj.parity(3))),
                     ("circuit_distributed_dj.png", distributed_dj.distributed_dj_circuit(dj.parity(2)))]:
        save(qc.draw("mpl", fold=-1), name)

    # teleportation
    steps = teleport.TeleportStepper(1.1, 0.7, rand=np.random.default_rng(7).random).run()
    fig, ax = plt.subplots(figsize=(7.5, 3.2)); plots.bloch_lengths(steps, ax=ax); save(fig, "teleport_steps.png")
    fig, ax = plt.subplots(figsize=(6.4, 3.8)); plots.teleport_sweep(sweep("teleport_sweep_1d"), ax=ax); save(fig, "teleport_sweep.png")
    fig, ax = plt.subplots(figsize=(5.4, 4)); plots.teleport_heatmap(sweep("teleport_sweep_2d"), ax=ax); save(fig, "teleport_heatmap.png")
    st = sweep("teleport_states")
    fig, ax = plt.subplots(1, 2, figsize=(10, 3.6))
    plots.ptm(st["cardinal_ideal"]["ptm"], "PTM ideal [SIM]", ax=ax[0])
    plots.ptm(st["cardinal_noisy_exact"]["ptm"], f"PTM noisy F_avg={st['cardinal_noisy_exact']['average_fidelity']:.3f} [SIM]", ax=ax[1])
    save(fig, "teleport_ptm.png")
    fig, ax = plt.subplots(figsize=(6, 3.4)); plots.fidelity_hist(st["noisy_exact"]["fidelities"], "200 Haar states, noisy [SIM]", ax=ax); save(fig, "teleport_haar.png")

    # QRNG
    qbits = qrng.load_pool(str(ROOT / "data" / "qrng_pool_sim.bin"))
    srcs = {"QRNG [SIM]": qbits, "PCG64": stats.prng_pcg64(len(qbits)), "RANDU": stats.prng_randu(len(qbits))}
    rec = hardware.latest("HW") or hardware.latest("EMU")
    if rec is not None:
        srcs[f"QRNG [{rec['source']}]"] = hardware.load_bits(rec)
    save(plots.fingerprints(srcs), "qrng_fingerprints.png")
    fig, ax = plt.subplots(1, 2, figsize=(10.5, 3.5))
    plots.bit_histogram(qbits, "QRNG [SIM]", ax=ax[0]); plots.random_walk({k: v[:200_000] for k, v in srcs.items()}, ax=ax[1])
    save(fig, "qrng_hist_walk.png")

    # DJ
    plots.dj_steps(dj.dj_steps(dj.parity(3)), 3, "parity (balanced), n=3")
    save(plt.gcf(), "dj_steps_balanced.png")
    plots.dj_steps(dj.dj_steps(dj.constant_one(3)), 3, "const_1 (constant), n=3")
    save(plt.gcf(), "dj_steps_constant.png")
    fig, ax = plt.subplots(figsize=(6, 3.6)); plots.complexity(sweep("dj_complexity")["rows"], ax=ax); save(fig, "dj_complexity.png")
    d = sweep("dj_noise")
    fig, ax = plt.subplots(1, 2, figsize=(11, 3.6)); plots.dj_noise(d, "4", ax=ax[0]); plots.dj_discrimination(d, ax=ax[1]); save(fig, "dj_noise.png")
    h = sweep("dist_dj_heatmap")
    fig, ax = plt.subplots(figsize=(5.2, 4)); plots.stage_heatmap(h["parity"], ax=ax); save(fig, "dist_dj_heatmap.png")

    # teleported ancilla theorem
    ps = np.linspace(0, 0.6, 7)
    anc = [teleport.exact_fidelity(np.pi / 2, np.pi, NoiseSpec(p1=p / 10, p2=p) if p else None, shots=2000)["fidelity"] for p in ps]
    bal = [distributed_dj.run_distributed(dj.parity(3), 20000, tele_noise=NoiseSpec(p1=p / 10, p2=p) if p else None)["success_probability"] for p in ps]
    fig, ax = plt.subplots(figsize=(6, 3.6))
    ax.plot(ps, anc, "k-", lw=2, label="teleport fidelity of |->")
    ax.plot(ps, bal, "o", color=plots.MAGENTA, label="DJ success (balanced)")
    ax.set(xlabel="teleport-stage p2", ylabel="probability", title="Ancilla fidelity = DJ success [SIM]"); ax.legend()
    save(fig, "dist_dj_theorem.png")

    # hardware / emulated
    for src in ("HW", "EMU"):
        r = hardware.latest(src)
        if r is None:
            continue
        a = hardware.analyze(r)
        v = "dynamic" if "dynamic" in a["teleport"] else "deferred"
        fig, ax = plt.subplots(1, 2, figsize=(11, 3.6))
        states = list(teleport.CARDINAL_STATES)
        ax[0].bar(states, [a["teleport"][v]["states"][s]["fidelity"] for s in states], color=plots.AMBER if src == "EMU" else plots.GREEN)
        plots.classical_line(ax[0]); ax[0].set(ylim=(0, 1.05), title=f"Teleport fidelity [{src}] {a['backend']} ({v})"); ax[0].legend()
        tags = [x["tag"].replace("dj_", "") for x in a["dj"]]
        ax[1].bar(tags, [x["success_probability"] for x in a["dj"]], color=[plots.CYAN if "const" in t else plots.MAGENTA for t in tags])
        ax[1].tick_params(axis="x", rotation=60); ax[1].set(ylim=(0, 1.05), title=f"DJ success [{src}]")
        save(fig, f"device_{src.lower()}.png")


if __name__ == "__main__":
    main()
