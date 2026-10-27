"""Matplotlib figures shared by the notebooks and scripts/build_report_figures.py (no web code)."""

from __future__ import annotations

import math

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from .teleport import CLASSICAL_FIDELITY_BOUND

CYAN, MAGENTA, VIOLET, AMBER, GREEN, RED = "#0fb5cc", "#e0287f", "#7c4ddb", "#e09a00", "#1fae75", "#d93a4a"
PALETTE = [CYAN, MAGENTA, AMBER, VIOLET, GREEN, "#555555"]


def _ax(ax, figsize=(6.4, 3.8)):
    if ax is None:
        _, ax = plt.subplots(figsize=figsize)
    return ax


def classical_line(ax, horizontal: bool = True) -> None:
    if horizontal:
        ax.axhline(CLASSICAL_FIDELITY_BOUND, color=AMBER, ls="--", lw=1.2, label="classical limit 2/3")
    else:
        ax.axvline(CLASSICAL_FIDELITY_BOUND, color=AMBER, ls="--", lw=1.2, label="classical limit 2/3")


# ------------------------------------------------------------------ teleportation

def teleport_sweep(sw: dict, ax=None):
    ax = _ax(ax)
    for i, ((name, ys), c) in enumerate(zip(sw["curves"].items(), PALETTE)):
        ax.plot(sw["p2"], ys, color=c, lw=2, label=name)
        x = sw["crossings"].get(name)
        if x is not None:
            ax.plot([x], [CLASSICAL_FIDELITY_BOUND], "o", mfc="none", mec=c, ms=8)
            ax.annotate(f"p2*={x:.3f}", (x, CLASSICAL_FIDELITY_BOUND), xytext=(6, -14 - 11 * i), textcoords="offset points", color=c, fontsize=8)
    ax.plot(sw["p2"], sw["analytic_cx_only"], "k:", lw=1.2, label="analytic (1+(1-p)^2)/2, CX-only")
    classical_line(ax)
    ax.set(xlabel="2-qubit depolarizing probability p2", ylabel="average fidelity", ylim=(0.5, 1.01),
           title="Teleportation fidelity vs noise [SIM]")
    ax.legend(fontsize=7.5)
    return ax


def teleport_heatmap(sw2: dict, ax=None):
    ax = _ax(ax, (5.2, 4))
    F = np.array(sw2["fidelity"])
    im = ax.imshow(F, origin="lower", aspect="auto", cmap="viridis", vmin=0.5, vmax=1,
                   extent=[sw2["p2"][0], sw2["p2"][-1], sw2["p1"][0], sw2["p1"][-1]])
    X, Y = np.meshgrid(sw2["p2"], sw2["p1"])
    cs = ax.contour(X, Y, F, levels=[CLASSICAL_FIDELITY_BOUND], colors="white", linewidths=2)
    ax.clabel(cs, fmt={CLASSICAL_FIDELITY_BOUND: "F = 2/3"}, fontsize=8)
    plt.colorbar(im, ax=ax, label="average fidelity")
    ax.set(xlabel="p2 (2-qubit)", ylabel="p1 (1-qubit)", title="2-D noise sweep [SIM]")
    return ax


def ptm(R, title: str = "Pauli transfer matrix", ax=None):
    ax = _ax(ax, (4, 3.6))
    R = np.asarray(R)
    im = ax.imshow(R, cmap="RdBu_r", vmin=-1, vmax=1)
    for i in range(4):
        for j in range(4):
            ax.text(j, i, f"{R[i, j]:.2f}", ha="center", va="center", fontsize=9,
                    color="white" if abs(R[i, j]) > 0.6 else "black")
    ax.set_xticks(range(4), ["I", "X", "Y", "Z"])
    ax.set_yticks(range(4), ["I", "X", "Y", "Z"])
    ax.set_title(title)
    plt.colorbar(im, ax=ax, fraction=0.046)
    return ax


def fidelity_hist(values, title: str, ax=None, bins: int = 30):
    ax = _ax(ax)
    v = np.asarray(values)
    ax.hist(v, bins=bins, color=MAGENTA, alpha=0.85)
    ax.axvline(v.mean(), color="k", lw=1, label=f"mean {v.mean():.4f}")
    if v.min() < 0.75:
        classical_line(ax, horizontal=False)
    ax.set(xlabel="fidelity", ylabel="states", title=title)
    ax.legend(fontsize=8)
    return ax


def bloch_lengths(steps, ax=None):
    """|r| of each qubit after every step: entanglement makes single-qubit Bloch vectors shrink."""
    ax = _ax(ax, (7, 3.2))
    names = [s.name for s in steps]
    for k, (c, lab) in enumerate(zip([CYAN, VIOLET, MAGENTA], ["q0 (Alice, |psi>)", "q1 (Alice's half)", "q2 (Bob)"])):
        ax.plot(names, [np.linalg.norm(s.bloch[k]) for s in steps], "o-", color=c, label=lab)
    ax.plot(names, [s.fidelity_bob for s in steps], "k--", lw=1, label="F(Bob, psi)")
    ax.set(ylabel="Bloch vector length |r|", ylim=(-0.05, 1.08), title="Teleportation step by step")
    ax.tick_params(axis="x", rotation=40)
    ax.legend(fontsize=7.5, loc="lower left")
    return ax


# ------------------------------------------------------------------ QRNG

def bit_histogram(bits, title: str = "0/1 frequency", ax=None):
    ax = _ax(ax, (4.2, 3.4))
    n = len(bits)
    ones = int(np.sum(bits))
    sigma = math.sqrt(n / 4)
    ax.bar(["0", "1"], [n - ones, ones], color=[CYAN, MAGENTA])
    ax.axhspan(n / 2 - 3 * sigma, n / 2 + 3 * sigma, color=AMBER, alpha=0.25, label="n/2 +- 3 sigma")
    ax.set_ylim(n / 2 - 12 * sigma, n / 2 + 12 * sigma)
    ax.set(title=f"{title} (n={n:,})", ylabel="count")
    ax.legend(fontsize=8)
    return ax


def fingerprints(sources: dict, side: int = 256):
    fig, axes = plt.subplots(1, len(sources), figsize=(2.6 * len(sources), 2.9))
    for ax, (name, b) in zip(np.atleast_1d(axes), sources.items()):
        img = np.asarray(b[: side * side]).reshape(side, side)
        ax.imshow(img, cmap="gray", interpolation="nearest")
        ax.set_title(name, fontsize=8.5)
        ax.axis("off")
    fig.suptitle(f"Bit fingerprints ({side}x{side} bits)", fontsize=10)
    fig.tight_layout()
    return fig


def random_walk(sources: dict, ax=None):
    ax = _ax(ax)
    n_max = 0
    for (name, b), c in zip(sources.items(), PALETTE):
        s = np.cumsum(2 * np.asarray(b, dtype=np.int64) - 1)
        idx = np.linspace(0, len(s) - 1, 2000).astype(int)
        ax.plot(idx + 1, s[idx], color=c, lw=1, label=name)
        n_max = max(n_max, len(s))
    x = np.linspace(1, n_max, 400)
    ax.fill_between(x, -3 * np.sqrt(x), 3 * np.sqrt(x), color="grey", alpha=0.15, label="+- 3 sqrt(n)")
    ax.set(xlabel="bits", ylabel="cumulative sum of +-1", title="Random walk")
    ax.legend(fontsize=7.5)
    return ax


def autocorr(profiles: dict, n: int, ax=None):
    ax = _ax(ax)
    for (name, prof), c in zip(profiles.items(), PALETTE):
        ax.plot(range(1, len(prof) + 1), prof, "o-", ms=3, color=c, label=name)
    ax.axhspan(-3 / math.sqrt(n), 3 / math.sqrt(n), color="grey", alpha=0.15, label="+- 3/sqrt(n)")
    ax.set(xlabel="lag", ylabel="autocorrelation", title="Autocorrelation (lags 1-32)")
    ax.legend(fontsize=7.5)
    return ax


def stats_table(suites: dict) -> pd.DataFrame:
    """Rows = tests, columns = generators; cells = p-values (pass at >= 0.01)."""
    cols = {}
    for name, s in suites.items():
        cols[name] = {t["name"]: t["p_value"] for t in s["tests"]}
        cols[name]["PASSED"] = f"{s['passed']}/{s['total']}"
        cols[name]["min-entropy / byte"] = round(s["entropy"]["min_entropy_per_byte"], 4)
    return pd.DataFrame(cols)


def style_stats(df: pd.DataFrame):
    def color(v):
        if isinstance(v, float) and v <= 1:
            return "background-color: #ffd6d9" if v < 0.01 else "background-color: #d7f5e6"
        return ""
    return df.style.map(color).format(lambda v: f"{v:.4f}" if isinstance(v, float) and v <= 1 else v)


# ------------------------------------------------------------------ Deutsch-Jozsa

def dj_steps(steps, n: int, title: str, axes=None):
    if axes is None:
        _, axes = plt.subplots(1, len(steps), figsize=(3.2 * len(steps), 2.6), sharey=True)
    for ax, st in zip(axes, steps):
        re = np.array(st["re"])
        ax.bar(range(len(re)), re, color=[MAGENTA if v < -1e-9 else CYAN if v > 1e-9 else "#bbbbbb" for v in re])
        ax.axhline(0, color="k", lw=0.6)
        ax.set_title(st["stage"], fontsize=9)
        ax.set_ylim(-1.05, 1.05)
        if len(re) <= 16:
            ax.set_xticks(range(len(re)), [format(i, f"0{n}b") for i in range(len(re))], rotation=90, fontsize=7)
        else:
            ax.set_xticks([])
    axes[0].set_ylabel("amplitude")
    axes[0].figure.suptitle(title, fontsize=10)
    axes[0].figure.tight_layout()
    return axes


def complexity(rows, ax=None):
    ax = _ax(ax)
    n = [r["n"] for r in rows]
    ax.semilogy(n, [r["classical_worst"] for r in rows], "o-", color=MAGENTA, label="classical deterministic 2^(n-1)+1")
    adv = [(r["n"], r["adversary"]) for r in rows if r["adversary"]]
    ax.semilogy([a[0] for a in adv], [a[1] for a in adv], "x", color=AMBER, ms=8, label="adversary simulation (measured)")
    ax.semilogy(n, [1] * len(n), "s-", color=CYAN, label="quantum: 1 query")
    ax.set(xlabel="input bits n", ylabel="oracle queries", title="Query complexity")
    ax.legend(fontsize=8)
    return ax


def dj_noise(data: dict, n: str, ax=None):
    ax = _ax(ax)
    for (name, v), c in zip(data["by_n"][n].items(), PALETTE):
        ax.plot(data["levels_p2"], v["success"], "--" if v["kind"] == "constant" else "-", color=c,
                label=f"{name} ({v['cx']} CX)")
    ax.axhline(1 - 2 ** -int(n), color="grey", lw=0.8, ls=":", label="balanced chance floor 1-2^-n")
    ax.set(xlabel="p2 (p1 = p2/10)", ylabel="P(correct)", ylim=(0, 1.02), title=f"DJ success vs noise, n={n} [SIM]")
    ax.legend(fontsize=7)
    return ax


def dj_discrimination(data: dict, ax=None):
    """P0(constant) - P0(balanced), averaged over oracles: a chance-free measure of DJ performance."""
    ax = _ax(ax)
    for n, c in zip(data["by_n"], PALETTE):
        rows = data["by_n"][n]
        p0c = np.mean([v["success"] for v in rows.values() if v["kind"] == "constant"], axis=0)
        p0b = np.mean([1 - np.array(v["success"]) for v in rows.values() if v["kind"] == "balanced"], axis=0)
        ax.plot(data["levels_p2"], p0c - p0b, "o-", ms=3, color=c, label=f"n={n}")
    ax.set(xlabel="p2", ylabel="P0(const) - P0(bal)", ylim=(0, 1.02), title="DJ discrimination vs noise [SIM]")
    ax.legend(fontsize=8)
    return ax


def stage_heatmap(heat: dict, ax=None):
    ax = _ax(ax, (5, 4))
    G = np.array(heat["success"])
    lv = heat["levels"]
    im = ax.imshow(G, origin="lower", cmap="viridis", vmin=0.5, vmax=1, extent=[lv[0], lv[-1], lv[0], lv[-1]], aspect="auto")
    plt.colorbar(im, ax=ax, label="P(success)")
    ax.set(xlabel="oracle-stage p2", ylabel="teleport-stage p2", title=f"Distributed DJ ({heat['oracle']}, n={heat['n']})")
    return ax
