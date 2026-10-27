# Q-Relay: theory notes

Concise derivations behind every claim the code, notebooks and UI make. Notation: $|\pm\rangle=(|0\rangle\pm|1\rangle)/\sqrt2$, $|\pm i\rangle=(|0\rangle\pm i|1\rangle)/\sqrt2$.

## Conventions

* **Qubit ordering (Qiskit, little-endian).** Basis index $i=\sum_k b_k2^k$ where $b_k$ is the bit of qubit $k$. A result string prints qubit/clbit 0 as its **right-most** character. With several classical registers, Aer prints them space-separated, last-created register first (`qrelay.backends.register_counts` handles this). The QRNG reverses each shot so bits are emitted in qubit order q0, q1, …
* **Bloch vector.** For a 1-qubit density matrix $\rho$, $\vec r=(\mathrm{Tr}\rho X,\mathrm{Tr}\rho Y,\mathrm{Tr}\rho Z)$ and $\rho=\tfrac12(I+\vec r\cdot\vec\sigma)$. $|\vec r|=1$ iff the state is pure. For a qubit of an entangled pure state, $|\vec r|<1$, and $|\vec r|=0$ for half of a Bell pair. The 3-D view draws $|\vec r|$ as the arrow length.
* **three.js mapping.** Qiskit $(x,y,z)$ with $|0\rangle$ at $+z$ maps to three.js (Y-up) as $(x,\,z,\,-y)$. This is a proper rotation, so handedness is preserved (`web/src/lib/three.ts`).

---

## 1. Teleportation (PS1)

**State.** $|\psi\rangle=\cos\frac\theta2|0\rangle+e^{i\varphi}\sin\frac\theta2|1\rangle=\alpha|0\rangle+\beta|1\rangle$ on q0. Implemented as `u(θ, φ, 0)`.

**Bell pair.** $H(q_1)$ then $CX(q_1,q_2)$ gives $|\Phi^+\rangle_{12}=(|00\rangle+|11\rangle)/\sqrt2$.

**Alice's operations.** $CX(q_0,q_1)$ gives $\tfrac1{\sqrt2}\big[\alpha|0\rangle(|00\rangle+|11\rangle)+\beta|1\rangle(|10\rangle+|01\rangle)\big]$. Then $H(q_0)$ and regrouping by Alice's two qubits give

$$
\tfrac12\Big[|00\rangle(\alpha|0\rangle+\beta|1\rangle)+|01\rangle(\alpha|1\rangle+\beta|0\rangle)+|10\rangle(\alpha|0\rangle-\beta|1\rangle)+|11\rangle(\alpha|1\rangle-\beta|0\rangle)\Big]
=\tfrac12\sum_{m_0,m_1}|m_0m_1\rangle\otimes X^{m_1}Z^{m_0}|\psi\rangle ,
$$

where the ket $|m_0m_1\rangle$ lists q0 then q1.

| $m_0$ | $m_1$ | Bob holds | correction |
|---|---|---|---|
| 0 | 0 | $\alpha\|0\rangle+\beta\|1\rangle$ | none |
| 0 | 1 | $\alpha\|1\rangle+\beta\|0\rangle$ | $X$ |
| 1 | 0 | $\alpha\|0\rangle-\beta\|1\rangle$ | $Z$ |
| 1 | 1 | $\alpha\|1\rangle-\beta\|0\rangle$ | $X$ then $Z$ |

Each outcome has probability $1/4$ independent of $(\alpha,\beta)$, so Alice's bits carry no information about $|\psi\rangle$. Bob applies $X^{m_1}$ then $Z^{m_0}$, and $Z^{m_0}X^{m_1}X^{m_1}Z^{m_0}=I$.

* **Dynamic circuit (variant A):** mid-circuit measurement plus `if_test` feed-forward, exactly the protocol above.
* **Deferred measurement (variant B):** replace classically-controlled $X$/$Z$ by $CX(q_1,q_2)$ and $CZ(q_0,q_2)$, and measure at the end. By the deferred-measurement principle the channel on Bob's qubit is identical.
* **No-cloning.** After measurement q0 is in $|m_0\rangle$. The original state survives only on Bob's side, so it was moved, not copied (the step engine shows q0's arrow snapping to a pole).
* **No signalling.** Averaged over the four outcomes, Bob's state before correction is $\tfrac14\sum_{m}X^{m_1}Z^{m_0}|\psi\rangle\langle\psi|Z^{m_0}X^{m_1}=I/2$.

### 1.1 Fidelity measures

* **Exact:** $F=\langle\psi|\rho_B|\psi\rangle$ with $\rho_B$ from Aer's `save_density_matrix`, saved **per branch** (`conditional=True`). The branch average weights by observed branch frequency.
* **Tomography:** measure Bob in Z, X ($H$ first) and Y ($S^\dagger H$ first). $\langle\sigma\rangle=P(0)-P(1)$ gives $\vec r_{out}$, and for a pure input $F=\langle\psi|\rho|\psi\rangle=\tfrac12(1+\vec r_{in}\cdot\vec r_{out})$. Finite-shot estimates can give $|\vec r_{out}|>1$ (unphysical), so we project onto the Bloch ball $\vec r\to\vec r/|\vec r|$. This is the standard constrained estimate, and the raw vector is kept as `r_out_raw`.
* **Process (Pauli transfer matrix):** $R_{ij}=\tfrac12\mathrm{Tr}[\sigma_i\mathcal E(\sigma_j)]$. With $\mathcal E(\rho)\leftrightarrow(1,\vec r_{out})$ and linearity, $\mathcal E(I)=\mathcal E(|0\rangle\langle0|)+\mathcal E(|1\rangle\langle1|)$, $\mathcal E(Z)=\mathcal E(|0\rangle\langle0|)-\mathcal E(|1\rangle\langle1|)$, $\mathcal E(X)=2\mathcal E(|+\rangle\langle+|)-\mathcal E(I)$ and $\mathcal E(Y)=2\mathcal E(|{+i}\rangle\langle{+i}|)-\mathcal E(I)$. The process fidelity to the identity is $F_{pro}=\mathrm{Tr}R/4$, and the **Haar-average fidelity** is exactly $F_{avg}=(dF_{pro}+1)/(d+1)=(2F_{pro}+1)/3$ (Horodecki et al. 1999; Nielsen 2002). Our noise sweeps use this identity, so they are exact, not sampled.
* **Haar sampling:** $\cos\theta\sim U[-1,1]$, $\varphi\sim U[0,2\pi)$. Uniform $\cos\theta$, not $\theta$, is what makes the distribution uniform on the sphere. The bits come from the QRNG pool.

### 1.2 Why 2/3 is the benchmark

Without entanglement, the best Alice can do is measure her single copy of an unknown, uniformly random $|\psi\rangle$ and send the result. Bob then prepares his best guess. The optimal average fidelity of such measure-and-prepare schemes for one copy is $(N+1)/(N+2)$ with $N=1$, i.e. **2/3** (Massar & Popescu 1995). Example: measure Z and prepare $|m\rangle$ gives $\int\cos^2\frac\theta2\cdot\cos^2\frac\theta2+\sin^2\frac\theta2\cdot\sin^2\frac\theta2\,d\Omega/4\pi=2/3$. **Only $F_{avg}>2/3$ certifies a quantum channel.** The noise level where $F_{avg}$ crosses 2/3 is our *quantum-advantage threshold*.

### 1.3 Closed form: depolarizing CX gates only

Qiskit's `depolarizing_error(p, 2)` is $\rho\to(1-p)\rho+p\,I/4$, i.e. with probability $p$ a uniformly random 2-qubit Pauli (including identity) is applied.

* **Bell-pair CX:** a uniform Pauli error on $(q_1,q_2)$ turns $|\Phi^+\rangle$ into a uniform mixture of the four Bell states, so Bob's output becomes a uniformly random Pauli applied to $|\psi\rangle$. Averaged, that is $I/2$.
* **Alice's CX($q_0,q_1$):** after it come $H(q_0)$ and measurement. A $Z$ or $Y$ on q0 flips $m_0$ (it becomes an $X$-type error after $H$), giving a spurious $Z$ on Bob. An $X$ or $Y$ on q1 flips $m_1$, giving a spurious $X$. A uniform Pauli on $(q_0,q_1)$ therefore induces a uniform Pauli on Bob's output.

Each depolarized CX independently replaces the output with $I/2$ with probability $p$:
$$\rho_{out}=(1-p)^2|\psi\rangle\langle\psi|+\big(1-(1-p)^2\big)\tfrac I2\quad\Rightarrow\quad F=\frac{1+(1-p)^2}{2}.$$
It crosses $2/3$ at $p^*=1-1/\sqrt3\approx0.4226$. The simulation reproduces this to 6 decimal places (`tests/test_core.py::test_analytic_depolarizing_matches_simulation`).

### 1.4 Readout error: what mitigation can and cannot fix

A symmetric readout flip $p$ acts twice. On **Bob's tomography readout** it shrinks each measured $\langle\sigma\rangle$ by $(1-2p)$, and inverting the measured confusion matrix $A$ undoes it ($\vec p_{true}=A^{-1}\vec p_{meas}$, clipped and renormalised). On **Alice's mid-circuit bits** a flipped $m_0$ ($m_1$) makes Bob apply a wrong $Z$ ($X$). That is a real error on the quantum state and no post-processing of Bob's counts can remove it. For $|+\rangle$ only the $Z$ error matters, so the mitigated ceiling is $F=1-p$ (verified: $p=0.08\Rightarrow0.924$).

---

## 2. Quantum random number generation (PS2)

**Born rule.** $H|0\rangle=|+\rangle$, and measuring in Z gives $P(0)=P(1)=|\langle b|+\rangle|^2=1/2$, independently per qubit and per shot. On hardware the outcome is fundamentally unpredictable. On Aer it is sampled by a classical PRNG, so **simulated bits are pseudo-random**.

**Tests** (our implementation of NIST SP 800-22 Rev. 1a; $\alpha=0.01$):

| test | detects | statistic and p-value |
|---|---|---|
| Frequency (monobit) | global bias | $s_{obs}=\|\sum(2b-1)\|/\sqrt n$, $p=\mathrm{erfc}(s_{obs}/\sqrt2)$ |
| Block frequency (M=128) | local bias | $\chi^2=4M\sum(\pi_i-\frac12)^2$, $p=Q(N/2,\chi^2/2)$ |
| Runs | oscillation too fast/slow | $V_n$ runs vs $2n\pi(1-\pi)$, erfc |
| Longest run of ones | clustering | block maxima vs tabulated classes, $\chi^2$ |
| Serial (m=3) | 2- and 3-bit pattern non-uniformity | $\nabla\psi^2_m,\nabla^2\psi^2_m$, incomplete gamma |
| Approximate entropy | regularity | $\chi^2=2n(\ln2-\mathrm{ApEn}(m))$ |
| Cumulative sums | drift of the ±1 walk | max excursion, normal-cdf series |
| Spectral (DFT) | periodicity | peaks below $T=\sqrt{n\ln20}$ vs 95% expectation |
| Autocorrelation (lags 1–32) | lag correlation | z-test per lag, Bonferroni-corrected |
| Byte $\chi^2$ | byte-level non-uniformity | 255 d.o.f. |
| *Shannon / min-entropy* | *information content* | *plug-in estimates (reported, not pass/fail)* |

**What passing means.** A pass means the test failed to find structure at the 1% level. It never proves randomness. Even an ideal source fails about 1% of tests by design, and a deterministic PRNG (PCG64, MT) passes them all. That is why we include **RANDU** (low byte of $x\to65539x \bmod 2^{31}$) as a control: its low bits have short periods (bit 0 is constant), and it fails 6/10 tests.

**Extractors.**
* *Von Neumann:* for i.i.d. bits with $P(1)=p$, $P(01)=P(10)=p(1-p)$, so the output is exactly unbiased. The yield is $p(1-p)$ output bits per input bit ($0.24$ at $p=0.4$).
* *XOR of pairs:* with bias $\varepsilon=p-\frac12$, $P(b_1\oplus b_2=1)=\frac12-2\varepsilon^2$ (piling-up lemma). The bias shrinks but does not vanish ($0.4\to0.48$).
* *Toeplitz hashing:* $\vec y=T\vec x \bmod 2$ with a random binary Toeplitz $T$ ($m\times n$, $n+m-1$ seed bits) forms a 2-universal hash family. By the leftover hash lemma the output is $\varepsilon$-close to uniform if $m\le H_\infty(\vec x)-2\log_2(1/\varepsilon)$. We use $n=1024$, $H_\infty$ estimated per bit, and $\varepsilon=2^{-32}$. The seed must be uniform and independent of the source.

---

## 3. Deutsch–Jozsa (PS3)

**Promise.** $f:\{0,1\}^n\to\{0,1\}$ is constant or balanced ($|f^{-1}(1)|=2^{n-1}$).

1. Start in $|0\rangle^{\otimes n}|1\rangle$ and apply $H^{\otimes(n+1)}$: $\frac1{\sqrt{2^n}}\sum_x|x\rangle\otimes|-\rangle$ (**superposition**).
2. **Phase kickback:** $U_f|x\rangle|-\rangle=|x\rangle\frac{|f(x)\rangle-|1\oplus f(x)\rangle}{\sqrt2}=(-1)^{f(x)}|x\rangle|-\rangle$. The ancilla factor is unchanged (its Bloch vector stays at $(-1,0,0)$), and the function value now sits in the input's phase.
3. **Interference:** $H^{\otimes n}|x\rangle=\frac1{\sqrt{2^n}}\sum_z(-1)^{x\cdot z}|z\rangle$, so
$$\langle0^n|H^{\otimes n}\tfrac1{\sqrt{2^n}}\sum_x(-1)^{f(x)}|x\rangle=\frac1{2^n}\sum_x(-1)^{f(x)}=\begin{cases}\pm1 & f\text{ constant}\\ 0 & f\text{ balanced.}\end{cases}$$
Measuring all-zeros happens with probability 1 (constant) or 0 (balanced).

**Oracles.** Constant: identity, $X$ on the ancilla. Balanced: $x_0$ (one CX), parity (CX from every input), inner product $a\cdot x$ (CX from the bits of $a$), random balanced (a random $2^{n-1}$-subset $S$, with each $x\in S$ implemented as $X$-conjugated MCX onto the ancilla). The **phase oracle** $\mathrm{diag}((-1)^{f(x)})$ is the equivalent form. Tests check $U_f(I\otimes|-\rangle)=P_f\otimes|-\rangle$ on every basis input.

**Query complexity.** A deterministic classical algorithm that has seen $2^{n-1}$ equal values cannot exclude a balanced function, since the unseen half could all be different. So it needs $2^{n-1}+1$ queries in the worst case. **Adversary argument:** answer 0 to the first $2^{n-1}$ distinct queries. Both "constant 0" and "balanced with all 1s among the unqueried inputs" stay consistent, so any correct algorithm makes at least $2^{n-1}+1$ queries. Our simulation measures exactly this count. A randomized classical algorithm that sees $k$ equal answers errs with probability at most $2^{-(k-1)}$. DJ is exact with 1 query.

**Noise caveat.** Full depolarization makes the output uniform, so $P(0^n)\to2^{-n}$. Constant oracles then fail, while balanced ones succeed with probability $1-2^{-n}$ by chance. We therefore also report the discrimination $P_0(\text{const})-P_0(\text{bal})$, which goes to 0 with no information.

---

## 4. Distributed DJ with a teleported ancilla (Stage 3)

Alice prepares $|-\rangle$ and teleports it. Bob uses the received qubit as the DJ ancilla. Ideally this is identical to local DJ.

**Theorem.** Let the oracle be noiseless and let the received ancilla be any state $\rho_{anc}$. Then $P(\text{correct}\mid\text{constant})=1$ and $P(\text{correct}\mid\text{balanced})=\langle-|\rho_{anc}|-\rangle$.

*Proof.* Write $\rho_{anc}$ in the X basis: $a|+\rangle\langle+|+b|-\rangle\langle-|+c|+\rangle\langle-|+\bar c|-\rangle\langle+|$, with $a+b=1$. Since $X|\pm\rangle=\pm|\pm\rangle$, $U_f$ maps $|x\rangle|+\rangle\to|x\rangle|+\rangle$ and $|x\rangle|-\rangle\to(-1)^{f(x)}|x\rangle|-\rangle$. On the $|+\rangle$ part the inputs return to $|0^n\rangle$ after the final $H^{\otimes n}$. On the $|-\rangle$ part we get the standard DJ output. Cross terms carry $\langle+|-\rangle=0$ when the ancilla is traced out, so they do not contribute to the input-register statistics. Hence $P(0^n)=a\cdot1+b\cdot P_{DJ}(0^n)$, which equals $a+b=1$ for constant $f$ and $a$ for balanced $f$. So $P(\text{correct}\mid\text{balanced})=1-a=b=\langle-|\rho_{anc}|-\rangle$. $\square$

So **teleportation noise makes Bob over-report "constant"**, and the balanced success rate *is* the ancilla's teleportation fidelity. Verified numerically to within shot noise (`tests/test_noise.py`, notebook 04).
