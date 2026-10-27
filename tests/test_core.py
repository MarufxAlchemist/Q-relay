"""Gate G1: core quantum correctness."""

import math

import numpy as np
import pytest
from qiskit.quantum_info import Operator, Statevector

from qrelay import dj, extract, qrng, stats, teleport
from qrelay.noise import NoiseSpec


# ---------------------------------------------------------------- teleportation

def test_teleport_all_four_branches_exact():
    res = teleport.exact_fidelity(1.1, 0.7, shots=2000)
    assert len(res["branches"]) == 4
    for b in res["branches"].values():
        assert abs(b["fidelity"] - 1) < 1e-9
        assert abs(b["probability"] - 0.25) < 0.05


@pytest.mark.parametrize("variant", ["dynamic", "deferred"])
def test_teleport_random_states_exact(variant):
    rng = np.random.default_rng(42)
    for _ in range(50):
        th, ph = math.acos(1 - 2 * rng.random()), 2 * math.pi * rng.random()
        assert abs(teleport.exact_fidelity(th, ph, variant=variant, shots=64)["fidelity"] - 1) < 1e-9


def test_teleport_cardinal_states_and_ptm_identity():
    res = teleport.cardinal_state_test()
    for f in res["fidelities"].values():
        assert abs(f - 1) < 1e-9
    assert np.allclose(res["ptm"], np.eye(4), atol=1e-9)
    assert abs(res["process_fidelity"] - 1) < 1e-9


def test_teleport_tomography_ideal():
    t = teleport.run_tomography(2.0, 4.0, shots=8192)
    assert t["fidelity"] > 0.98  # finite-shot estimate


def test_stepper_matches_physics():
    steps = teleport.TeleportStepper(1.3, 2.2, rand=np.random.default_rng(1).random).run()
    by = {s.name: s for s in steps}
    assert np.linalg.norm(by["bell_cx"].bloch[1]) < 1e-9 and np.linalg.norm(by["bell_cx"].bloch[2]) < 1e-9
    assert abs(by["done"].fidelity_bob - 1) < 1e-9
    # no-cloning: after measurement q0 is in a Z eigenstate, not |psi>
    assert abs(abs(by["measure"].bloch[0][2]) - 1) < 1e-9


def test_analytic_depolarizing_matches_simulation():
    from qrelay.noise import apply_noise  # noqa: F401
    for p2 in (0.1, 0.3):
        f = teleport.haar_average(8, NoiseSpec(p2=p2))["mean"]
        assert abs(f - teleport.analytic_cx_depolarizing_fidelity(p2)) < 1e-6


# ---------------------------------------------------------------- Deutsch-Jozsa

@pytest.mark.parametrize("n", [1, 2, 3])
def test_dj_exhaustive_small_n(n):
    oracles = dj.all_oracles(n)
    assert len(oracles) == 2 + math.comb(2 ** n, 2 ** (n - 1))
    for o in oracles:
        p0 = dj.p_all_zeros_exact(o)
        assert abs(p0 - (1.0 if o.kind == "constant" else 0.0)) < 1e-9, o.name


@pytest.mark.parametrize("n", [4, 5, 6])
def test_dj_random_balanced_larger_n(n):
    for s in range(200 if n < 6 else 60):
        assert dj.p_all_zeros_exact(dj.random_balanced(n, seed=s)) < 1e-9


@pytest.mark.parametrize("n", [1, 2, 3, 4, 5, 6, 7, 8])
def test_dj_library_all_n(n):
    for o in dj.oracle_library(n):
        expected = 1.0 if o.kind == "constant" else 0.0
        assert abs(dj.p_all_zeros_exact(o) - expected) < 1e-9


def test_dj_sampled_classification():
    for o in dj.oracle_library(3):
        r = dj.run_dj(o, shots=256)
        assert r["correct"]


@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_bit_and_phase_oracles_agree(n):
    """U_f (I (x) |->) == P_f (x) |->  on the full input space."""
    minus = Statevector([1, -1]) / math.sqrt(2)
    for o in dj.oracle_library(n, seed=n):
        U = Operator(o.build())
        P = Operator(o.phase_oracle())
        for x in range(2 ** n):
            psi_x = Statevector.from_int(x, 2 ** n)
            lhs = minus.tensor(psi_x).evolve(U)        # ancilla is the most significant qubit
            rhs = minus.tensor(psi_x.evolve(P))
            assert lhs.equiv(rhs) and np.allclose(lhs.data, rhs.data)


def test_classical_adversary():
    for n in range(1, 10):
        assert dj.adversary_queries(n) == 2 ** (n - 1) + 1


def test_dj_steps_phase_kickback():
    o = dj.parity(3)
    steps = dj.dj_steps(o)
    after = np.array(steps[2]["re"])
    assert np.allclose(after, [(-1) ** int(v) / math.sqrt(8) for v in o.truth_table])
    assert np.allclose(steps[2]["ancilla_bloch"], [-1, 0, 0])  # ancilla still |->
    assert abs(steps[3]["re"][0]) < 1e-9


# ---------------------------------------------------------------- QRNG, stats, extractors

def test_qrng_length_and_ordering():
    b = qrng.generate_bits(10_000, m=5, seed=3)
    assert len(b) == 10_000 and set(np.unique(b)) <= {0, 1}
    # ordering: shot "00011" (clbit0 = 1, clbit1 = 1) -> [1, 1, 0, 0, 0]
    assert qrng.memory_to_bits(["00011"], 5).tolist() == [1, 1, 0, 0, 0]


def test_pool_draws():
    pool = qrng.make_pool(4096, seed=1)
    th, ph = pool.haar_angles()
    assert 0 <= th <= math.pi and 0 <= ph < 2 * math.pi
    assert 0 <= pool.randint(6) < 6
    assert pool.cursor > 0


def test_suite_flags_randu_passes_pcg():
    pcg = stats.run_suite(stats.prng_pcg64(200_000, seed=1))
    randu = stats.run_suite(stats.prng_randu(200_000))
    assert pcg["passed"] >= pcg["total"] - 1
    assert randu["passed"] <= randu["total"] - 4


def test_extractors_improve_biased_source():
    b = extract.biased_source(200_000, p1=0.4)
    out = extract.compare_extractors(b)
    assert abs(out["von_neumann"]["p1"] - 0.5) < 0.01
    assert abs(out["toeplitz"]["p1"] - 0.5) < 0.01
    assert abs(out["xor"]["p1"] - 0.5) < abs(out["raw"]["p1"] - 0.5)
    assert stats.frequency_monobit(out["raw"]["bits"]).passed is False
    assert stats.frequency_monobit(out["von_neumann"]["bits"]).passed


def test_biased_readout_source():
    b = qrng.generate_bits(50_000, m=10, seed=2, noise_model=qrng.biased_readout_model())
    assert abs(b.mean() - 0.4) < 0.01
