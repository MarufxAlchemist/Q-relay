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

## Phase 6 — layout, title screen, guide, music (user request)
- Every screen is a fixed CSS grid that fills the viewport (`.fit`, min-height 620px, then scroll). Charts are rendered
  at the exact pixel size of their cell via `<Fill>` (ResizeObserver), so nothing is cut off. Checked at 1900x860 and 1366x680.
- Title screen (Continue / New Mission / Music / Guide) after the boot sequence; Continue restores the last screen.
- Mission Guide: 8 plain-language steps with illustrations and "Show me" navigation; opens automatically on the first
  New Mission. A per-screen "?" help sheet explains each panel in simple words.
- Music: WebAudio synthesis (pad, bass, plucked arpeggio, delay and reverb), no audio files, offline. Arpeggio notes come
  from QRNG bits (SIM-labelled bits from the boot fetch). Noise closes a low-pass filter, adds hiss, detunes and drops
  notes. Event sound effects for classical bits, fidelity below 2/3, and the DJ verdict. Starts only after a user gesture.
- Teleport Lab ignores stale responses (request id) and shows loading and error states.

## Hardware run (2026-10-28)
- Submitted one SamplerV2 job to `ibm_marrakesh` (156-qubit Heron, dynamic circuits supported): job ID
  `dbgnmpote5oc738iia1g`. 47 circuits; dry-run estimate ~170 s of the 600 s monthly allowance.
  If the local session dies before results return: `python scripts/run_hardware.py --fetch dbgnmpote5oc738iia1g`.

## Hardware results (2026-10-28)
- ibm_marrakesh job `dbgnmpote5oc738iia1g`, 55 s QPU. Teleport F_avg: deferred 0.978, dynamic 0.880 (equatorial states
  ~0.82; PTM X/Y 0.65/0.69 vs Z 0.94 suggests dephasing during the feed-forward wait). DJ 10/10 correct (random balanced
  0.888 / 0.855; distributed DJ parity 0.861). QRNG 819,200 bits: 8/10 tests (monobit, cusum fail; per-qubit P(1)
  0.435–0.530); every extractor restores 10/10.

## Phase 7 — story mode and astronomical "Loki" theme (user request)
- QRNG, Teleport and DJ labs open in a chaptered Story (one or two big visuals + plain-language narration; Next/Play,
  arrow keys); the previous dashboards are kept as "Overview (all panels)".
- Charts build up when they mount (lines draw, bars grow, heatmaps wave in, fingerprints scan in, test cells pop,
  numbers count up). Low-power mode skips the animations.
- Palette: Loki green (Alice / 0), TVA gold (Bob / 1), coral for the 2/3 line, red for failures; twinkling starfield with
  shooting stars and nebula gradients; stars inside 3-D scenes.
- Server caches `analyze()` of hardware records and the RANDU suite (both deterministic); otherwise the story's parallel
  first requests re-ran the full test suite on 819k bits and stalled the UI for several seconds.
