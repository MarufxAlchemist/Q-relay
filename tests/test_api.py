"""Gate G3: every endpoint returns valid JSON offline; live runs are fast; the WebSocket streams in order."""

import time

import pytest
from fastapi.testclient import TestClient

from qrelay.mission import EVENT_ORDER
from server.main import app

client = TestClient(app)


def timed(method, url, **kw):
    t = time.perf_counter()
    r = getattr(client, method)(url, **kw)
    return r, time.perf_counter() - t


def test_meta():
    assert client.get("/api/health").json()["ok"]
    assert "qiskit" in client.get("/api/versions").json()


def test_qrng_generate_and_mitigate():
    for mit in ("none", "vn", "xor", "toeplitz"):
        r, dt = timed("post", "/api/qrng/generate", json={"n_bits": 50_000, "mitigate": mit, "seed": 1})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["source"] == "SIM" and d["suite"]["total"] == 10
        assert dt < 3.0
    r = client.post("/api/qrng/generate", json={"n_bits": 50_000, "mode": "hw_cached"})
    assert r.status_code in (200, 404)


def test_randu_breaks():
    d = client.get("/api/qrng/randu", params={"n_bits": 100_000}).json()
    assert d["suite"]["passed"] < d["suite"]["total"]


def test_teleport_run_fast():
    r, dt = timed("post", "/api/teleport/run", json={"random": True, "noise": {"level": 0.3}})
    assert r.status_code == 200, r.text
    d = r.json()
    assert len(d["steps"]) >= 10 and 0 < d["exact"]["fidelity"] <= 1
    assert dt < 2.0, dt
    ideal = client.post("/api/teleport/run", json={"theta": 1.0, "phi": 2.0}).json()
    assert abs(ideal["exact"]["fidelity"] - 1) < 1e-9


@pytest.mark.parametrize("n,oracle", [(1, "const_0"), (3, "parity"), (5, "random"), (8, "x0")])
def test_dj_run(n, oracle):
    r, dt = timed("post", "/api/dj/run", json={"n": n, "oracle": oracle})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["correct"] and d["queries"]["quantum"] == 1
    assert dt < 2.0, dt


def test_dj_distributed_noisy_and_tables():
    d = client.post("/api/dj/run", json={"n": 3, "oracle": "parity", "distributed": True,
                                         "noise": {"level": 0.2}}).json()
    assert 0 <= d["success_probability"] <= 1
    assert client.get("/api/dj/complexity", params={"n_max": 20}).json()["rows"][19]["classical_worst"] == 2**19 + 1
    assert len(client.get("/api/dj/oracles", params={"n": 3}).json()) == 6


def test_dj_custom_truth_table_validation():
    assert client.post("/api/dj/run", json={"n": 2, "truth_table": [1, 1, 0, 0]}).json()["truth"] == "balanced"
    assert client.post("/api/dj/run", json={"n": 2, "truth_table": [1, 0, 0, 0]}).status_code == 422


def test_game_flow():
    g = client.post("/api/game/new", json={"n": 4}).json()
    q = client.post("/api/game/query", json={"game_id": g["game_id"], "x": 3}).json()
    assert q["queries_used"] == 1 and q["fx"] in (0, 1)
    res = client.post("/api/game/quantum", json={"game_id": g["game_id"]}).json()
    assert res["queries"] == 1 and res["correct"]


def test_precomputed_and_hardware_endpoints():
    for url in ("/api/teleport/sweep", "/api/hardware/results", "/api/dj/complexity"):
        assert client.get(url).status_code == 200


def test_websocket_mission_order():
    with client.websocket_connect("/ws/mission") as ws:
        ws.send_json({"action": "start", "noise": 0.1, "n": 2, "speed": 1000})
        types = []
        while True:
            ev = ws.receive_json()
            if ev["type"] == "noise_ack":
                continue
            if not types or types[-1] != ev["type"]:
                types.append(ev["type"])
            if ev["type"] == "mission_summary":
                break
    assert types == EVENT_ORDER
