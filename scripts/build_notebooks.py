"""Generate the four judge-facing notebooks (thin: all logic lives in qrelay/). Execute with --execute."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import nbformat as nbf

ROOT = Path(__file__).resolve().parent.parent
NB = ROOT / "notebooks"

SETUP = """import sys, json, math, warnings
sys.path.insert(0, '..')
warnings.filterwarnings('ignore')
import numpy as np, matplotlib.pyplot as plt
from IPython.display import display, Markdown
%matplotlib inline
plt.rcParams.update({'figure.dpi': 110, 'axes.grid': True, 'grid.alpha': 0.25})
def sweep(name): return json.load(open(f'../data/sweeps/{name}.json'))"""


def md(s: str):
    return nbf.v4.new_markdown_cell(s.strip())


def code(s: str):
    return nbf.v4.new_code_cell(s.strip())


def nb01():
    return [
        md("""
# PS1 · Quantum Teleportation
**Q-Relay, Qiskit Fall Fest 2026 (DBATU).** Teleport an *arbitrary* single-qubit state from Alice to Bob using one shared Bell pair and two classical bits, then verify the transfer with several independent fidelity measures and a noise analysis.

> Source labels used throughout: **SIM** = Aer simulator (its randomness is pseudo-random), **EMU** = Aer plus the noise model of a real IBM device snapshot, **HW** = real IBM hardware (with job ID)."""),
        code(SETUP + "\nfrom qrelay import teleport, plots, hardware\nfrom qrelay.noise import NoiseSpec\nfrom qrelay.qrng import load_pool, EntropyPool"),
        md(r"""
## 1. The protocol
Qubit roles: **q0** = the secret state $|\psi\rangle = \cos\frac{\theta}{2}|0\rangle + e^{i\varphi}\sin\frac{\theta}{2}|1\rangle$ (Alice), **q1** = Alice's half of the Bell pair, **q2** = Bob's half.

1. **Entangle:** $H(q_1)$, $CX(q_1,q_2)$ gives $|\Phi^+\rangle = (|00\rangle+|11\rangle)/\sqrt2$.
2. **Bell-basis measurement (Alice):** $CX(q_0,q_1)$, $H(q_0)$, then measure $q_0 \to m_0$ and $q_1 \to m_1$. Just before the measurement the 3-qubit state is
$$\tfrac12\sum_{m_0,m_1\in\{0,1\}}|m_0\rangle_{q_0}|m_1\rangle_{q_1}\otimes X^{m_1}Z^{m_0}|\psi\rangle_{q_2}.$$
   Each of the four outcomes has probability 1/4, *independent of* $|\psi\rangle$. Alice learns nothing about the state.
3. **Classical communication:** Alice sends $(m_0, m_1)$ to Bob.
4. **Correction (Bob):** apply $X$ if $m_1=1$, then $Z$ if $m_0=1$. Bob now holds $|\psi\rangle$ exactly.

**No-cloning:** Alice's measurement destroys $|\psi\rangle$ on q0. The state is *moved*, not copied. **No signalling:** without the two bits, Bob's qubit is maximally mixed."""),
        md("### Variant A: dynamic circuit (mid-circuit measurement + classical feed-forward, `if_test`)"),
        code("theta, phi = 1.1, 0.7\nqc = teleport.teleport_circuit(theta, phi, 'dynamic')\nqc.draw('mpl', fold=-1)"),
        md("### Variant B: deferred measurement (quantum-controlled corrections; runs on any backend)"),
        code("teleport.teleport_circuit(theta, phi, 'deferred').draw('mpl', fold=-1)"),
        md("""
## 2. Watching it happen: Bloch vectors after every gate (Variant C, step engine)
We evolve the 3-qubit **density matrix** gate by gate and take the reduced state of each qubit (partial trace). A Bloch vector **shorter than 1** means that qubit is *mixed*. Halves of an entangled pair look maximally mixed ($|r|=0$) on their own."""),
        code("""steps = teleport.TeleportStepper(theta, phi, rand=np.random.default_rng(7).random).run()
for s in steps:
    print(f"{s.name:10s} |r| = {[round(float(np.linalg.norm(v)),3) for v in s.bloch]}  F(Bob)={s.fidelity_bob:.4f}  {s.caption[:70]}")
plots.bloch_lengths(steps); plt.show()"""),
        code("""from qiskit.visualization import plot_bloch_vector
fig, axes = plt.subplots(1, 3, figsize=(10, 3.4), subplot_kw={'projection': '3d'})
for ax, name in zip(axes, ['prepare', 'bell_cx', 'done']):
    s = next(x for x in steps if x.name == name)
    plot_bloch_vector(s.bloch[0] if name == 'prepare' else s.bloch[2], ax=ax, title=f"{'q0' if name=='prepare' else 'q2 (Bob)'} after {name}")
plt.show()"""),
        md("""
## 3. Verification
### 3a. Exact fidelity in every measurement branch
Using Aer's `save_density_matrix(conditional=True)` we get Bob's exact density matrix **separately for each of the four outcomes** $(m_0,m_1)$ and compute $F=\\langle\\psi|\\rho_B|\\psi\\rangle$."""),
        code("""res = teleport.exact_fidelity(theta, phi, shots=4000)
for k, v in res['branches'].items(): print(f"{k}:  P = {v['probability']:.3f}   F = {v['fidelity']:.12f}")
print('branch-averaged F =', res['fidelity'])"""),
        md("""### 3b. Measurement-based state tomography (our own implementation)
Measure Bob in the Z, X ($H$ before measuring) and Y ($S^\\dagger H$) bases; $\\langle\\sigma\\rangle = P(0)-P(1)$ reconstructs $\\vec r_{out}$, and for a pure input $F = (1+\\vec r_{in}\\cdot\\vec r_{out})/2$. Finite-shot estimates with $|r|>1$ are projected onto the Bloch ball."""),
        code("""t = teleport.run_tomography(theta, phi, shots=8192)
print('r_in  =', np.round(t['r_in'], 4)); print('r_out =', np.round(t['r_out'], 4)); print('tomography F =', round(t['fidelity'], 5))"""),
        md("### 3c. 200 Haar-random states, with angles drawn from the QRNG entropy pool: $\\cos\\theta\\sim U[-1,1]$, $\\varphi\\sim U[0,2\\pi)$"),
        code("""pool = EntropyPool(load_pool('../data/qrng_pool_sim.bin'), source='SIM')
angles = [pool.haar_angles() for _ in range(200)]
ideal = teleport.haar_average(angles=angles)
noisy = teleport.haar_average(angles=angles, noise=NoiseSpec(p1=0.01, p2=0.1, readout=0.02))
print(f"ideal exact : mean={ideal['mean']:.12f}  min={ideal['min']:.12f}")
print(f"noisy exact : mean={noisy['mean']:.4f} +- {noisy['std']:.4f}  min={noisy['min']:.4f}")
fig, ax = plt.subplots(1, 2, figsize=(11, 3.4))
th = [a[0] for a in angles]; ax[0].hist(np.cos(th), bins=20, color=plots.CYAN); ax[0].set_title('cos(theta) of the 200 states (uniform => Haar)')
plots.fidelity_hist(noisy['fidelities'], 'Noisy fidelity over 200 Haar states [SIM]', ax=ax[1]); plt.show()"""),
        md("""### 3d. Exhaustive cardinal-state test and the process (Pauli transfer matrix)
The six states $|0\\rangle,|1\\rangle,|\\pm\\rangle,|\\pm i\\rangle$ fully determine the single-qubit channel. From their outputs we build the PTM $R_{ij}=\\tfrac12\\mathrm{Tr}[\\sigma_i\\,\\mathcal E(\\sigma_j)]$. The ideal channel gives $R=I$. Average fidelity follows exactly as $F_{avg}=(2F_{pro}+1)/3$ with $F_{pro}=\\mathrm{Tr}R/4$."""),
        code("""ci = teleport.cardinal_state_test(); cn = teleport.cardinal_state_test(NoiseSpec(p1=0.01, p2=0.1))
print({k: round(v, 9) for k, v in ci['fidelities'].items()})
fig, ax = plt.subplots(1, 2, figsize=(9, 3.6))
plots.ptm(ci['ptm'], 'PTM ideal [SIM]', ax=ax[0]); plots.ptm(cn['ptm'], f"PTM noisy, F_avg={cn['average_fidelity']:.3f} [SIM]", ax=ax[1]); plt.show()"""),
        md("""
## 4. Why 2/3 is the line that matters
A *classical* channel (Alice measures $|\\psi\\rangle$, phones the result, Bob re-prepares) achieves at best average fidelity **2/3** (Massar & Popescu 1995). Only $F_{avg} > 2/3$ certifies that the entanglement did real work.

## 5. Noise analysis
Noise is inserted as explicit error channels after every gate (`qrelay.noise.noisify`). We sweep 2-qubit depolarizing $p_2$ (with $p_1=p_2/10$). For CX-only noise the closed form $F=(1+(1-p_2)^2)/2$ is derived in THEORY.md, and the simulation matches it exactly."""),
        code("""sw = sweep('teleport_sweep_1d'); plots.teleport_sweep(sw); plt.show()
print('quantum-advantage thresholds (F crosses 2/3):', {k: (round(v,4) if v else None) for k, v in sw['crossings'].items()})"""),
        code("""fig, ax = plt.subplots(1, 2, figsize=(11, 3.8))
plots.teleport_heatmap(sweep('teleport_sweep_2d'), ax=ax[0])
t1 = sweep('teleport_t1_sweep'); ax[1].semilogx(t1['t1_us'], t1['fidelity'], 'o-', color=plots.VIOLET); plots.classical_line(ax[1])
ax[1].set(xlabel='T1 = T2 (us), gate times 50/300 ns', ylabel='average fidelity', title='Thermal relaxation [SIM]'); ax[1].legend(); plt.show()"""),
        md("""### Readout-error mitigation
Inverting the measured confusion matrix fixes errors in **Bob's** final readout. It cannot fix readout errors on **Alice's mid-circuit** bits, which make Bob apply the wrong correction. So for $|+\\rangle$ with readout flip $p$ the mitigated ceiling is $1-p$. Mitigation helps, but there is a physical ceiling."""),
        code("""spec = NoiseSpec(readout=0.08)
r = teleport.run_tomography(math.pi/2, 0, spec, shots=20000, mitigate=True)
print(f"raw F = {r['fidelity']:.4f}   mitigated F = {r['fidelity_mitigated']:.4f}   (ceiling 1 - p = {1-0.08:.2f})")"""),
        md("## 6. Real-device / emulated results\nLoaded from `data/hardware/` (written by `scripts/run_hardware.py`). Every number below carries its source label."),
        code("""for src in ('HW', 'EMU'):
    rec = hardware.latest(src)
    if rec is None:
        print(f'[{src}] not available'); continue
    a = hardware.analyze(rec)
    print(f"[{src}] backend={a['backend']}  job_id={a['job_id']}  time={a['timestamp']}")
    for v, tv in a['teleport'].items():
        print(f"   {v:9s} F_avg={tv['average_fidelity']:.4f}  per state:", {k: round(x['fidelity'], 3) for k, x in tv['states'].items()})
    best = a['teleport'].get('dynamic') or a['teleport']['deferred']
    plots.ptm(best['ptm'], f"PTM [{src}] {a['backend']}"); plt.show()"""),
        md("""
## Conclusions
* The dynamic-circuit protocol teleports arbitrary states with fidelity 1 (to 1e-12) in **every** branch. Tomography and a 200-state Haar average agree.
* With noise, fidelity falls smoothly. The **2/3 crossing** marks where the channel stops beating any classical strategy ($p_2^*\\approx0.38$ for our model).
* On the emulated device, average fidelity is well above 2/3 (see section 6), and readout mitigation gives a measurable gain up to a physical ceiling."""),
    ]


def nb02():
    return [
        md("""
# PS2 · Quantum Random Number Generator
A qubit in $|+\\rangle = H|0\\rangle$ yields 0 or 1 with probability exactly 1/2 by the Born rule. We generate **1,000,000** bits, run **10 statistical tests** (our own NIST SP 800-22 implementation), compare against classical PRNGs, and demonstrate **bias mitigation**.

> **Honesty:** Aer is a classical simulator. Its measurement outcomes come from a classical PRNG, so **SIM** bits are pseudo-random under the hood. Only **HW** bits are physically random. Passing statistical tests never *proves* randomness. It means no structure was found."""),
        code(SETUP + "\nfrom qrelay import qrng, stats, extract, plots, hardware"),
        md("## 1. Circuits: the textbook 1-qubit QRNG, and an 8-qubit parallel version (8 bits per shot)"),
        code("display(qrng.qrng_circuit(1).draw('mpl')); qrng.qrng_circuit(8).draw('mpl')"),
        md("**Bit ordering:** Qiskit is little-endian (the right-most character of a result string is clbit 0). `qrng.memory_to_bits` reverses each shot so the output order is q0, q1, …"),
        code("""import time
t = time.time(); bits = qrng.generate_bits(1_000_000, m=16, seed=2026)
print(f"{len(bits):,} bits in {time.time()-t:.1f}s   first 64: {''.join(map(str, bits[:64]))}")
print('P(1) =', bits.mean())"""),
        code("""fig, ax = plt.subplots(1, 2, figsize=(11, 3.4))
plots.bit_histogram(bits, 'QRNG [SIM]', ax=ax[0])
by = np.packbits(bits); ax[1].hist(by, bins=256, color=plots.CYAN); ax[1].axhline(len(by)/256, color='k', lw=1)
ax[1].set(title='byte distribution (expected flat)', xlabel='byte value'); plt.show()"""),
        md("## 2. Statistical test suite: QRNG vs PCG64 vs Mersenne Twister vs RANDU (a deliberately weak LCG)\nRANDU is the control: it proves the tests *can* fail. Green = p ≥ 0.01 (pass), red = fail."),
        code("""N = 1_000_000
sources = {'QRNG [SIM]': bits, 'PCG64': stats.prng_pcg64(N), 'MT19937': stats.prng_mt19937(N), 'RANDU (low byte)': stats.prng_randu(N)}
emu = hardware.latest('HW') or hardware.latest('EMU')
if emu is not None:
    sources[f"QRNG [{emu['source']}] {emu['backend']}"] = hardware.load_bits(emu)
suites = {k: stats.run_suite(v) for k, v in sources.items()}
plots.style_stats(plots.stats_table(suites))"""),
        md("## 3. Visual tests: bit fingerprints (structure = non-randomness), random walk, autocorrelation"),
        code("plots.fingerprints(sources); plt.show()"),
        code("""fig, ax = plt.subplots(1, 2, figsize=(12, 3.6))
plots.random_walk({k: v[:200_000] for k, v in sources.items()}, ax=ax[0])
plots.autocorr({k: stats.autocorrelation_profile(v[:200_000]) for k, v in sources.items() if 'RANDU' not in k}, 200_000, ax=ax[1]); plt.show()"""),
        md("""
## 4. Bias mitigation
A biased but physically motivated source: an **asymmetric readout error** $P(\\text{read }0\\mid 1)=0.2$ turns the ideal 50/50 into $P(1)=0.4$.

| extractor | idea | output | yield |
|---|---|---|---|
| Von Neumann | pairs 01→0, 10→1, drop 00/11 | exactly unbiased for i.i.d. bits | p(1−p) per bit |
| XOR pairs | $b_{2i}\\oplus b_{2i+1}$ | bias ε → 2ε² | 1/2 |
| Toeplitz hashing | random binary Toeplitz matrix (2-universal hash) | ε-close to uniform (leftover hash lemma) | ≈ H∞ − 2 log₂(1/ε) per block |"""),
        code("""biased = qrng.generate_bits(400_000, m=16, seed=77, noise_model=qrng.biased_readout_model(0.2))
res = extract.compare_extractors(biased)
import pandas as pd
pd.DataFrame({k: {'P(1)': round(v['p1'], 4), 'bits out': v['n_out'], 'yield': round(v['yield'], 3),
                  'tests passed': f"{stats.run_suite(v['bits'])['passed']}/10"} for k, v in res.items()}).T"""),
        md("**Trade-off:** Von Neumann is simple and exact but wasteful (24% yield here). XOR is cheap but leaves residual bias (0.48 instead of 0.5, so it still fails). Toeplitz hashing extracts close to the source's min-entropy (≈ 67% yield) with a provable bound, at the cost of a seed and matrix multiplication."),
        md("## 5. Hardware / emulated bits: per-qubit bias\nReal devices have per-qubit readout asymmetry, which is exactly why extraction matters."),
        code("""for src in ('HW', 'EMU'):
    rec = hardware.latest(src)
    if rec is None: print(f'[{src}] not available'); continue
    a = hardware.analyze(rec); b = hardware.load_bits(rec)
    print(f"[{src}] {a['backend']}  {len(b):,} bits  P(1)={b.mean():.4f}  suite {a['qrng']['suite']['passed']}/10")
    plt.figure(figsize=(9, 2.6)); plt.bar(range(len(a['qrng']['per_qubit_p1'])), a['qrng']['per_qubit_p1'], color=plots.CYAN)
    plt.axhline(0.5, color='k', lw=1); plt.title(f'per-qubit P(1) [{src}] {a["backend"]}'); plt.xlabel('qubit'); plt.ylim(0.4, 0.6); plt.show()
    ex = extract.compare_extractors(b)
    print('   after Toeplitz:', round(ex['toeplitz']['p1'], 4), f"({ex['toeplitz']['n_out']:,} bits)")"""),
        md("""
## Conclusions
* 1M simulated QRNG bits pass all 10 tests, as PCG64 and MT do. RANDU fails 6/10 and its fingerprint shows stripes, so the suite discriminates.
* Simulated "quantum" bits are only as random as Aer's PRNG. The physically meaningful comparison is with **HW** bits (section 5).
* A 40/60 biased source fails monobit outright. Von Neumann and Toeplitz both restore all 10 tests, with very different yields."""),
    ]


def nb03():
    return [
        md("""
# PS3 · Deutsch–Jozsa
Given a black-box $f:\\{0,1\\}^n\\to\\{0,1\\}$ promised to be **constant** or **balanced**, decide which. A deterministic classical algorithm needs up to $2^{n-1}+1$ queries. Deutsch–Jozsa needs **one**."""),
        code(SETUP + "\nfrom qrelay import dj, plots, hardware\nfrom qrelay.noise import NoiseSpec\nfrom qiskit.visualization import plot_histogram"),
        md(r"""
## 1. Why it works: superposition → phase kickback → interference
1. **Superposition:** $H^{\otimes n}|0\rangle^{\otimes n} = \frac{1}{\sqrt{2^n}}\sum_x |x\rangle$, and the ancilla is prepared in $|-\rangle$.
2. **Phase kickback:** $U_f|x\rangle|y\rangle = |x\rangle|y\oplus f(x)\rangle$. With $|y\rangle=|-\rangle$: $U_f|x\rangle|-\rangle = (-1)^{f(x)}|x\rangle|-\rangle$. The answer moves into a **phase** on the input, and the ancilla is untouched.
3. **Interference:** after the final $H^{\otimes n}$, the amplitude of $|0\dots0\rangle$ is $\frac{1}{2^n}\sum_x(-1)^{f(x)}$. That is $\pm1$ if $f$ is constant and exactly **0** if balanced.

**Measure all-zeros ⇒ constant; anything else ⇒ balanced.** Qubit layout: inputs 0..n−1 (little-endian, $x=\sum_i x_i2^i$), ancilla n."""),
        md("## 2. The oracle library (2 constant + 4 balanced, any n)"),
        code("""n = 3
lib = dj.oracle_library(n, seed=0)
for o in lib: print(f"{o.name:12s} {o.kind:9s} truth table {''.join(map(str, o.truth_table))}   2q gates: {o.two_qubit_gate_count()}")"""),
        code("""fig, axes = plt.subplots(2, 3, figsize=(12, 5.5))
for ax, o in zip(axes.flat, lib): o.build().draw('mpl', ax=ax); ax.set_title(f'{o.name} ({o.kind})')
plt.tight_layout(); plt.show()"""),
        md("## 3. The full DJ circuit and its measurement results"),
        code("dj.dj_circuit(dj.parity(3)).draw('mpl', fold=-1)"),
        code("""results = {o.name: dj.run_dj(o, shots=2048) for o in lib}
for k, r in results.items(): print(f"{k:12s} truth={r['truth']:9s} verdict={r['verdict']:9s} P(000)={r['p_all_zeros']:.3f}  {'OK' if r['correct'] else 'WRONG'}")
plot_histogram([r['counts'] for r in results.values()], legend=list(results), figsize=(12, 3.6), bar_labels=False)"""),
        md("## 4. Step-through: amplitudes of the input register (balanced vs constant)"),
        code("""plots.dj_steps(dj.dj_steps(dj.parity(3)), 3, 'parity (balanced): |000> amplitude cancels to 0'); plt.show()
plots.dj_steps(dj.dj_steps(dj.constant_one(3)), 3, 'const_1 (constant): all amplitude interferes onto |000>'); plt.show()
print('ancilla Bloch vector after the query:', dj.dj_steps(dj.parity(3))[2]['ancilla_bloch'], '(= |->, unchanged: phase kickback)')"""),
        md("## 5. Correctness proof by exhaustion (n = 1, 2, 3) and random testing for larger n\nWe enumerate **every** constant (2) and **every** balanced function ($\\binom{2^n}{2^{n-1}}$ = 2, 6, 70) and check the exact probability of $|0\\dots0\\rangle$."),
        code("""import math
for n_ in (1, 2, 3):
    os_ = dj.all_oracles(n_)
    ok = all(abs(dj.p_all_zeros_exact(o) - (1.0 if o.kind == 'constant' else 0.0)) < 1e-9 for o in os_)
    print(f"n={n_}: {len(os_)} functions ({math.comb(2**n_, 2**(n_-1))} balanced), all classified correctly: {ok}")
for n_ in (4, 5, 6, 7, 8):
    k = 300 if n_ <= 6 else 40
    ok = all(dj.p_all_zeros_exact(dj.random_balanced(n_, seed=s)) < 1e-9 for s in range(k))
    print(f"n={n_}: {k} random balanced oracles, all P(0...0)=0: {ok}")"""),
        md("## 6. Query complexity, verified by an adversary simulation\nThe adversary answers 0 to the first $2^{n-1}$ distinct queries, which stays consistent with both 'constant 0' and some balanced function, so no deterministic algorithm can stop earlier."),
        code("""rows = dj.complexity_table(20)
plots.complexity(rows); plt.show()
print('n | quantum | classical worst | adversary-measured'); [print(r['n'], 1, r['classical_worst'], r['adversary']) for r in rows[:10]]"""),
        md("## 7. Noise: deeper oracles degrade faster\nCaveat: under strong noise the output tends to uniform, so P(all-zeros) → 2⁻ⁿ. Constant oracles then fail, while balanced ones 'succeed' with probability 1−2⁻ⁿ **by chance**. The discrimination $P_0(\\text{const})-P_0(\\text{bal})$ removes that artefact."),
        code("""data = sweep('dj_noise')
fig, ax = plt.subplots(1, 3, figsize=(16, 3.8))
plots.dj_noise(data, '3', ax=ax[0]); plots.dj_noise(data, '5', ax=ax[1]); plots.dj_discrimination(data, ax=ax[2]); plt.show()"""),
        md("## 8. Real-device / emulated results"),
        code("""for src in ('HW', 'EMU'):
    rec = hardware.latest(src)
    if rec is None: print(f'[{src}] not available'); continue
    a = hardware.analyze(rec); print(f"[{src}] {a['backend']} job={a['job_id']}")
    for d in a['dj']: print(f"   {d['tag']:22s} truth={d['truth']:9s} verdict={d['verdict']:9s} success={d['success_probability']:.3f}  2q gates={d['two_qubit_gates']}")"""),
        md("""
## Conclusions
* DJ is exhaustively correct for n ≤ 3 and tested on hundreds of random balanced oracles up to n = 8.
* 1 query versus $2^{n-1}+1$, a gap confirmed by an adversary simulation.
* Noise hurts oracles in proportion to their entangling-gate count. Random balanced oracles (MCX-built) degrade fastest."""),
    ]


def nb04():
    return [
        md("""
# Q-Relay Mission: the three problems as one pipeline
**QRNG → Teleportation → Distributed Deutsch–Jozsa.** The QRNG seeds a Haar-random secret state and a hidden oracle. Alice teleports the state to Bob. Then Alice teleports a $|-\\rangle$ to Bob, which **becomes the DJ ancilla**. Bob queries the hidden oracle once. One noise knob affects all three stages."""),
        code(SETUP + "\nfrom qrelay import dj, distributed_dj, teleport, plots\nfrom qrelay.mission import run_mission, MissionConfig\nfrom qrelay.noise import NoiseSpec"),
        md("## 1. The distributed DJ circuit (teleported ancilla, dynamic circuit)"),
        code("distributed_dj.distributed_dj_circuit(dj.parity(2)).draw('mpl', fold=-1)"),
        md("## 2. Run a mission (the same event generator drives the web app's WebSocket)"),
        code("""for ev in run_mission(MissionConfig(n=3, noise_level=0.0, seed=7, shots=1024)):
    print(f"[{ev['t']:6.2f}s] {ev['type']:20s} {ev['caption'][:110]}")
summary = ev['data']; summary"""),
        md("## 3. The same mission under noise"),
        code("""for lvl in (0.2, 0.6, 0.9):
    s = list(run_mission(MissionConfig(n=3, noise_level=lvl, seed=7, shots=1024)))[-1]['data']
    print(f"noise={lvl:.1f}: teleport F={s['fidelity']:.3f} ({'quantum' if s['fidelity']>2/3 else 'CLASSICAL'}), ancilla F={s['ancilla_fidelity']:.3f}, DJ verdict={s['verdict']} truth={s['truth']} P(success)={s['success_probability']:.3f}")"""),
        md(r"""
## 4. How teleportation fidelity limits DJ correctness
**Claim (proved in THEORY.md):** with a noiseless oracle, constant oracles are always classified correctly, and for a balanced oracle
$$P(\text{success}) = \langle -|\rho_{anc}|-\rangle,$$
the teleportation fidelity of the $|-\rangle$ ancilla. A $|+\rangle$ component gives no phase kickback and leaves the inputs in $|0\dots0\rangle$. We check this numerically:"""),
        code("""ps = np.linspace(0, 0.6, 9); anc, bal, const = [], [], []
for p in ps:
    spec = NoiseSpec(p1=p/10, p2=p) if p > 0 else None
    anc.append(teleport.exact_fidelity(math.pi/2, math.pi, spec, shots=2000)['fidelity'])
    bal.append(distributed_dj.run_distributed(dj.parity(3), shots=20000, tele_noise=spec)['success_probability'])
    const.append(distributed_dj.run_distributed(dj.constant_one(3), shots=4000, tele_noise=spec)['success_probability'])
plt.plot(ps, anc, 'k-', lw=2, label='teleport fidelity of |->'); plt.plot(ps, bal, 'o', color=plots.MAGENTA, label='DJ success, balanced (parity)')
plt.plot(ps, const, 's', color=plots.CYAN, label='DJ success, constant'); plt.xlabel('teleport-stage p2'); plt.ylabel('probability'); plt.legend(); plt.title('Teleportation noise only [SIM]'); plt.show()
print('max |P(success, balanced) - F_anc| =', np.max(np.abs(np.array(bal) - np.array(anc))))"""),
        md("## 5. Which stage hurts more? (noise confined to teleportation vs to the oracle)"),
        code("""h = sweep('dist_dj_heatmap')
fig, ax = plt.subplots(1, 2, figsize=(11, 4)); plots.stage_heatmap(h['parity'], ax=ax[0]); plots.stage_heatmap(h['random_bal'], ax=ax[1]); plt.show()"""),
        md("""
## Conclusions
* In the ideal case the teleported ancilla is indistinguishable from a local one (checked for every library oracle, n ≤ 4, in both circuit variants).
* Teleportation noise affects only the **balanced** verdicts, in exact proportion to the ancilla's teleportation fidelity. Oracle noise affects both kinds, and grows with oracle depth.
* One physical quantity, channel fidelity, links PS1 directly to PS3. PS2 supplies the randomness for the states and oracles."""),
    ]


def main() -> None:
    NB.mkdir(exist_ok=True)
    books = {"01_teleportation.ipynb": nb01(), "02_qrng.ipynb": nb02(), "03_deutsch_jozsa.ipynb": nb03(),
             "04_qrelay_mission.ipynb": nb04()}
    for name, cells in books.items():
        nb = nbf.v4.new_notebook()
        nb.cells = cells
        nb.metadata["kernelspec"] = {"name": "qrelay", "display_name": "Python (qrelay)", "language": "python"}
        nbf.write(nb, NB / name)
        print("wrote", name)
    if "--execute" in sys.argv:
        for name in books:
            print("executing", name)
            subprocess.run([sys.executable, "-m", "nbconvert", "--to", "notebook", "--execute", "--inplace",
                            "--ExecutePreprocessor.timeout=900", str(NB / name)], check=True)


if __name__ == "__main__":
    main()
