# Demo script

**Setup (before judges arrive):** run `.\tasks.ps1 demo` (Windows) or `make demo`, then open http://127.0.0.1:8000 full-screen (F11). Press **L** if the laptop struggles (low-power mode), and **P** for presenter captions on a projector. Everything runs offline.

Hotkeys: `1–7` screens · `D` auto-demo (90 s) · `P` presenter captions · `L` low power · `S` scanlines.

---

## A. 90-second version (press `D` and narrate, or click through)

| t | screen / action | say |
|---|---|---|
| 0 s | **Mission** auto-launches | "Q-Relay wires all three problem statements into one mission." |
| 5 s | entropy pool fills | "Stage 1: a QRNG, H then measure, fills an entropy pool. Those bits choose a random secret state and a hidden oracle." |
| 12 s | Bell pair: arrows shrink | "Stage 2: Alice and Bob share a Bell pair. Look: each half alone has a *zero-length* Bloch vector. That's entanglement, drawn honestly." |
| 20 s | bit packets fly, Bob snaps to the ghost | "Alice measures and sends two classical bits. Bob corrects, and his arrow lands on the ghost of the original. Fidelity 1." |
| 30 s | DJ bars | "Stage 3: Alice teleports a minus state, which becomes Bob's Deutsch–Jozsa ancilla. One query: constant or balanced." |
| 40 s | noise ramps to 85% | "Now the noise. The beam decoheres, and fidelity drops through **2/3**, the best any classical strategy can do. That's the quantum-advantage threshold." |
| 50 s | **QRNG Lab**, RANDU goes red | "The same 10-test suite passes quantum bits and catches a broken classical generator red-handed. See the stripes." |
| 62 s | **DJ Lab**, query race | "Quantum: one query. Classical worst case: 2^(n−1)+1. We verify that count with an adversary." |
| 76 s | **Hardware** | "Simulator, emulated device and IBM hardware side by side, each clearly labelled." |
| 88 s | — | "Correct, tested, honest, and it runs offline." |

## B. 5-minute version (manual)

1. **Mission (60 s).** Set n = 3 and press LAUNCH. Narrate as above. After it finishes, **drag the noise slider** slowly. Bob's arrow shrinks live and the gauge turns red under 2/3 ("CLASSICAL REGIME"). Drag it back.
2. **Teleport Lab (60 s).** Drag on q0's sphere to pick any state, or click *Random state from QRNG*. Scrub the *step* slider: point out q1/q2 shrinking at the Bell CX, and q0 collapsing at measurement (**no-cloning**). Show the branch table: four branches, each F = 1.000000000. Scroll to the sweep: the analytic dashed curve sits exactly on the simulation, and the crossings are p₂* ≈ 0.38 / 0.42 / 0.33. Show the 2-D heatmap with its white 2/3 contour and the PTM.
3. **QRNG Lab (45 s).** Generate 1M bits. Show the histogram inside its ±3σ band and the random walk inside √n. Press **Break the PRNG** and watch RANDU fail 6/10 with a striped fingerprint. Switch to *Von Neumann* / *Toeplitz* to show yields. Point at the amber honesty line: *simulator bits are pseudo-random*.
4. **DJ Lab (60 s).** n = 4, random balanced. Use *Replay steps*: superposition → phase kickback (bars flip sign, ancilla stays |−⟩) → interference (|0000⟩ cancels to exactly 0). Then switch to const_1 to show all amplitude piling onto |0000⟩. Show the query race and the log-scale complexity chart. Toggle *teleported ancilla*, add noise, and show the "which stage hurts more" heatmap.
5. **Beat the Oracle (30 s).** Hand the mouse to a judge: "Find out if it's constant or balanced." After a few clicks: "You'd need up to 17. The quantum computer needs one." Press *Ask the quantum computer*: the verdict is teleported to Bob with the fidelity shown.
6. **Hardware (30 s).** Show the source badges, per-state teleport fidelity versus 2/3, the PTM, DJ success, and job IDs (HW) or the "local emulation" label (EMU).
7. **Close (15 s).** Open notebooks 01–04 if asked: same library, executed outputs.

---

## Likely judge questions, with crisp answers

**Why is 2/3 the important number?**
Without entanglement, the best you can do with one copy of an unknown random state is measure it and re-prepare a guess. The optimal average fidelity of that is 2/3 (Massar–Popescu). Above 2/3 the channel is provably doing something no classical channel can.

**Is your simulator QRNG truly random?**
No, and we say so on screen. Aer samples measurement outcomes with a classical PRNG. Physically random bits come only from hardware runs, which are cached with their job ID. Statistical tests can't tell the two apart: they detect structure, they don't certify origin.

**If PCG64 passes all your tests too, what's the point of the suite?**
It shows our bits have no detectable bias or correlation, and the RANDU control proves the tests have teeth (6/10 failures). Certifying *quantum* origin would need device-independent methods (Bell tests). That's future work.

**Why a dynamic circuit?**
It *is* the protocol: Bob's correction depends on bits measured mid-circuit and sent classically. We also built the deferred-measurement version (quantum-controlled corrections) for hardware without feed-forward. Both give identical ideal results, and we test both.

**What does noise do to Deutsch–Jozsa?**
Gate noise mixes the output, so P(all-zeros) drifts toward 2⁻ⁿ. Deeper oracles (MCX-built random balanced ones) degrade fastest. Careful: at full noise, balanced oracles look 1−2⁻ⁿ "correct" purely by chance, so we also report the discrimination P₀(const) − P₀(bal).

**What's special about the teleported ancilla?**
We proved that with a perfect oracle, the balanced-case success probability *equals* the teleportation fidelity of the |−⟩ ancilla. Any |+⟩ admixture gives no phase kickback, so Bob over-reports "constant". So a PS1 quantity directly limits PS3 correctness, and the simulation matches within shot noise.

**Why can't Alice just copy the state?**
No-cloning: no unitary maps |ψ⟩|0⟩ → |ψ⟩|ψ⟩ for all ψ. In our step view, Alice's qubit collapses to a pole the moment she measures. The state is moved, not copied.

**Does teleportation send information faster than light?**
No. Until Bob receives the two classical bits, his qubit averages to I/2, which carries no information.

**How do you know the fidelity numbers are right?**
Four independent methods agree: exact density matrices per branch, our own tomography, the process (PTM) average, and a closed-form noise formula that matches simulation to 10⁻⁶. There are 53 automated tests.

**Why did your tomography ever give F > 1?**
It can't anymore. Finite-shot estimates can produce |r| > 1, which is unphysical. We project onto the Bloch ball, the standard constrained estimate, and keep the raw vector for transparency.
