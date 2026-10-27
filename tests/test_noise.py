"""Gate G2: noise behaviour, the 2/3 crossing, mitigation, distributed DJ and the mission stream."""

import math

import numpy as np

from qrelay import dj, distributed_dj, teleport
from qrelay.mission import EVENT_ORDER, MissionConfig, run_mission
from qrelay.noise import NoiseSpec, find_crossing


def test_fidelity_decreases_and_crosses_two_thirds():
    ps = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
    sw = teleport.fidelity_sweep(ps, p1_ratio=0.1, n_states=4)
    f = sw["fidelity"]
    assert abs(f[0] - 1) < 1e-9
    assert all(a > b for a, b in zip(f, f[1:]))
    x = find_crossing(ps, f)
    assert x is not None and 0.2 < x < 0.6


def test_readout_mitigation_improves_fidelity():
    spec = NoiseSpec(readout=0.08)
    t = teleport.run_tomography(math.pi / 2, 0.0, spec, shots=20000, mitigate=True, seed=9)
    assert t["fidelity_mitigated"] > t["fidelity"]
    # Mitigation only fixes Bob's final readout. Readout errors on Alice's mid-circuit m0 still cause a wrong
    # Z correction (which flips |+>), so the ceiling is 1 - p.
    assert abs(t["fidelity_mitigated"] - (1 - 0.08)) < 0.01


def test_thermal_relaxation_reduces_fidelity():
    f = teleport.exact_fidelity(math.pi, 0.0, NoiseSpec(t1_us=2.0, t2_us=2.0), shots=200)["fidelity"]
    assert f < 0.999


def test_distributed_dj_ideal_equals_local():
    for n in (1, 2, 3, 4):
        for o in dj.oracle_library(n, seed=n):
            for variant in ("dynamic", "deferred"):
                r = distributed_dj.run_distributed(o, shots=256, variant=variant)
                assert r["correct"] and r["success_probability"] == 1.0, (n, o.name, variant)


def test_distributed_dj_balanced_success_equals_ancilla_fidelity():
    """With noise confined to teleportation: P(success | balanced) = <-|rho_anc|->, constant stays perfect."""
    spec = NoiseSpec(p1=0.03, p2=0.3)
    anc_f = teleport.exact_fidelity(math.pi / 2, math.pi, spec, shots=4000)["fidelity"]
    bal = distributed_dj.run_distributed(dj.parity(3), shots=40000, tele_noise=spec)
    const = distributed_dj.run_distributed(dj.constant_one(3), shots=4000, tele_noise=spec)
    assert const["success_probability"] == 1.0
    assert abs(bal["success_probability"] - anc_f) < 0.01


def test_mission_event_order():
    events = list(run_mission(MissionConfig(n=3, noise_level=0.2, seed=5, shots=256)))
    seen = []
    for e in events:
        if not seen or seen[-1] != e["type"]:
            seen.append(e["type"])
    assert seen == EVENT_ORDER
    assert all(isinstance(e["caption"], str) and e["caption"] for e in events)


def test_mission_noise_lowers_fidelity():
    clean = list(run_mission(MissionConfig(n=2, noise_level=0.0, seed=1, shots=256)))[-1]["data"]
    noisy = list(run_mission(MissionConfig(n=2, noise_level=0.9, seed=1, shots=256)))[-1]["data"]
    assert abs(clean["fidelity"] - 1) < 1e-9 and clean["correct"]
    assert noisy["fidelity"] < clean["fidelity"]
    assert np.isfinite(noisy["success_probability"])
