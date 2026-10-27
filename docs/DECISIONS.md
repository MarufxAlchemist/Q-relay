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

## Phase 1–2 — core and noise
- Teleportation exact fidelity uses `save_density_matrix(conditional=True)`: Bob's exact state per measurement branch,
  weighted by observed branch frequencies. Readout error is included via a `NoiseModel`. In the dynamic circuit, a
  flipped mid-circuit bit drives the wrong correction, so readout genuinely changes Bob's state.
- Average fidelity in sweeps is computed exactly from the Pauli transfer matrix of the 4 cardinal inputs:
  F_avg = (2 F_pro + 1)/3. This is exact and faster than sampling Haar states.
- Tomography estimates with |r| > 1 (finite shots) are projected onto the Bloch ball. The raw vector is kept (`r_out_raw`).
- Readout mitigation ceiling: confusion-matrix inversion fixes Bob's readout only. For |+>, F_max = 1 - p. Tested.
- RANDU control uses the *low byte* of each output (a classic naive extraction); it fails 6/10 tests at 1M bits.
- DJ noise: under strong depolarization balanced oracles score 1-2^-n by chance, so we also report the
  discrimination P0(const) - P0(bal).
- Distributed DJ: proved and tested that P(success | balanced) = <-|rho_anc|-> for a noiseless oracle.

## Phase 1b — hardware
- One SamplerV2 job holds all experiments (QRNG 100 qubits x 8192 shots, 36 teleport tomography circuits in deferred
  and dynamic variants, 8 DJ circuits, 2 distributed DJ circuits) to minimise per-job overhead on the 10-minute plan.
- Emulation must pass a reused `AerSimulator.from_backend(FakeBrisbane)` as the sampler mode. Passing the fake backend
  itself rebuilds a simulator per circuit (>25 min vs ~2 min).
- Local emulation ids are stored as `local_run_id`, never as `job_id`, so EMU can't be mistaken for HW.

## Phase 3–4 — API and UI
- Sweeps may contain NaN (a skipped statistic), so the API sanitises all JSON (`jsonable`).
- drei `<Html>` labels inside the WebGL scene caused `removeChild` errors on screen switches, so they were replaced with
  canvas-texture sprites.
- framer-motion cannot interpolate SVG arc paths (corrupts arc flags), so the gauge uses a plain path.
- Live re-run after a mission updates only Bob's vector; Alice's qubits keep the mission's own measurement branch.
- UI smoke test uses Playwright with the system Edge (`channel="msedge"`), so no browser download is needed.

## Phase 5 — notebooks
- `python -m jupyter nbconvert` dispatches to the first `jupyter-nbconvert` on PATH (the system one), so we call
  `python -m nbconvert`. Kernel `qrelay` is installed with `--sys-prefix` (inside .venv only).
