# References and acknowledgements

All code in this repository was written for this hackathon. The ideas come from the sources below. *Used for* says where each idea appears.

| # | Reference | Used for |
|---|---|---|
| 1 | C. H. Bennett, G. Brassard, C. Crépeau, R. Jozsa, A. Peres, W. K. Wootters, "Teleporting an unknown quantum state via dual classical and Einstein–Podolsky–Rosen channels", *Phys. Rev. Lett.* **70**, 1895 (1993) | the teleportation protocol (`qrelay/teleport.py`) |
| 2 | D. Deutsch, R. Jozsa, "Rapid solution of problems by quantum computation", *Proc. R. Soc. Lond. A* **439**, 553 (1992) | the Deutsch–Jozsa algorithm (`qrelay/dj.py`) |
| 3 | R. Cleve, A. Ekert, C. Macchiavello, M. Mosca, "Quantum algorithms revisited", *Proc. R. Soc. Lond. A* **454**, 339 (1998) | the single-ancilla, phase-kickback form of DJ |
| 4 | M. A. Nielsen, I. L. Chuang, *Quantum Computation and Quantum Information*, 10th anniv. ed., Cambridge (2010) | teleportation derivation (§1.3.7), deferred measurement (§4.4), DJ (§1.4.4), fidelity, tomography (§8.4) |
| 5 | S. Massar, S. Popescu, "Optimal extraction of information from finite quantum ensembles", *Phys. Rev. Lett.* **74**, 1259 (1995) | the 2/3 classical benchmark for teleportation |
| 6 | M. Horodecki, P. Horodecki, R. Horodecki, "General teleportation channel, singlet fraction, and quasidistillation", *Phys. Rev. A* **60**, 1888 (1999) | $F_{avg}=(dF_{pro}+1)/(d+1)$; 2/3 benchmark |
| 7 | M. A. Nielsen, "A simple formula for the average gate fidelity of a quantum dynamical operation", *Phys. Lett. A* **303**, 249 (2002) | average fidelity from the process (PTM) |
| 8 | A. Rukhin et al., *NIST SP 800-22 Rev. 1a: A Statistical Test Suite for Random and Pseudorandom Number Generators* (2010) | definitions of the statistical tests (`qrelay/stats.py`) |
| 9 | J. von Neumann, "Various techniques used in connection with random digits", *NBS Applied Math Series* **12**, 36 (1951) | Von Neumann extractor |
| 10 | M. Matsui, "Linear cryptanalysis method for DES cipher", EUROCRYPT (1993) | piling-up lemma (XOR bias $2\varepsilon^2$) |
| 11 | R. Impagliazzo, L. Levin, M. Luby, "Pseudo-random generation from one-way functions", STOC (1989); H. Krawczyk, "LFSR-based hashing and authentication", CRYPTO (1994) | leftover hash lemma; Toeplitz hashing as a 2-universal family |
| 12 | X. Ma, F. Xu, H. Xu, X. Tan, B. Qi, H.-K. Lo, "Postprocessing for quantum random-number generators: entropy evaluation and randomness extraction", *Phys. Rev. A* **87**, 062327 (2013) | Toeplitz extraction in QRNGs, output-length choice |
| 13 | M. Herrero-Collantes, J. C. Garcia-Escartin, "Quantum random number generators", *Rev. Mod. Phys.* **89**, 015004 (2017) | QRNG background, honesty about certification |
| 14 | D. E. Knuth, *The Art of Computer Programming*, Vol. 2, §3.3.4 | RANDU as a known-bad LCG (control) |
| 15 | M. E. O'Neill, "PCG: A family of simple fast space-efficient statistically good algorithms for random number generation", HMC-CS-2014-0905 (2014); M. Matsumoto, T. Nishimura, "Mersenne Twister", *ACM TOMACS* **8**, 3 (1998) | the classical PRNG baselines |
| 16 | A. D. Córcoles et al., "Exploiting dynamic quantum circuits in a quantum algorithm with superconducting qubits", *Phys. Rev. Lett.* **127**, 100501 (2021) | dynamic circuits / mid-circuit measurement on IBM hardware |
| 17 | Qiskit contributors, *Qiskit: An open-source framework for quantum computing* (2023), doi:10.5281/zenodo.2573505; Qiskit, Qiskit Aer and Qiskit IBM Runtime documentation (docs.quantum.ibm.com) | all circuits, `if_test`, Aer `save_density_matrix(conditional=True)`, noise models, `SamplerV2`, fake backends |

**Software:** Qiskit 2.6.1, qiskit-aer 0.18.2, qiskit-ibm-runtime 0.51.0, NumPy, SciPy, pandas, matplotlib, FastAPI, React, three.js / react-three-fiber, framer-motion, zustand. Fonts: Space Grotesk and JetBrains Mono (SIL Open Font License, bundled via @fontsource).

**Original contributions of this project:** the integrated QRNG→teleportation→DJ pipeline; the teleported-ancilla distributed DJ and the proof that balanced-case success equals the ancilla's teleportation fidelity; stage-confined noise injection (recursing into dynamic-circuit blocks); the readout-mitigation ceiling analysis for feed-forward; and all visualisations.
