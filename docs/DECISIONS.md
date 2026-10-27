# Decisions log

## Phase 0 — environment (2026-10-27)
- Python 3.12.5, Node 22.14, Qiskit 2.6.1, qiskit-aer 0.18.2, qiskit-ibm-runtime 0.51.0 (all pinned in `requirements.txt`).
- Qiskit 2.x API: feed-forward via `with qc.if_test((creg, v)):`; no `execute`/`c_if`. Verified that Aer runs
  `if_test` circuits with `save_density_matrix(..., conditional=True)` (keys `0x0..0x3` = classical memory value).
- `qiskit_ibm_runtime.SamplerV2` is deprecated as of runtime 0.50 (replacement: `executor_sampler.Sampler`), but it
  still works and is the documented hardware path. We use it in `scripts/run_hardware.py` only, with warnings filtered.
- Local simulation uses `AerSimulator.run` directly. Classical counts with several registers come back as
  space-separated keys, **last-created register first**; `qrelay.backends.register_counts` does the marginalisation.
- Noise is injected as explicit `QuantumError` instructions after each gate (`qrelay.noise.noisify`), recursing into
  `if_else` blocks. This lets us target noise at a *stage* (teleport vs oracle) — required for the Stage-3 heatmap —
  which a gate-name-based `NoiseModel` cannot do. Readout error still uses a `NoiseModel`.
- Emulation backend: `FakeBrisbane` (127q Eagle, supports `if_else`). Building its noise model takes ~10 s, so the
  server caches it once.
- Windows has no `make` by default: `Makefile` is provided per spec, plus an equivalent `tasks.ps1`.
- Work is done directly in the repo root (user request), not in a `q-relay/` subfolder.
