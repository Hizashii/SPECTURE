from pathlib import Path

from fastapi.testclient import TestClient

from tests.conftest import write_scenario
from tests.unit.test_scenario_model import minimal


def test_health(real_client: TestClient) -> None:
    res = real_client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["version"]


def test_capabilities_lists_unsupported_semantics_explicitly(real_client: TestClient) -> None:
    body = real_client.get("/api/v1/capabilities").json()
    unsupported = {s["id"] for s in body["policy_semantics"] if s["status"] == "unsupported"}
    assert {"conditions", "boundaries", "resource-policies"} <= unsupported
    assert {s["status"] for s in body["policy_semantics"]} <= {
        "implemented",
        "planned",
        "unsupported",
    }


def test_lists_shipped_scenarios(real_client: TestClient) -> None:
    body = real_client.get("/api/v1/scenarios").json()
    assert body["invalid"] == []
    assert [s["id"] for s in body["items"]] == [
        "harbor-commerce",
        "helios-platform",
        "northstar-financial",
    ]
    northstar = body["items"][2]
    assert northstar["role_count"] == 2
    assert northstar["objective_count"] == 1


def test_get_scenario(real_client: TestClient) -> None:
    res = real_client.get("/api/v1/scenarios/northstar-financial")
    assert res.status_code == 200
    assert res.json()["metadata"]["id"] == "northstar-financial"


def test_unknown_scenario_is_a_structured_404(real_client: TestClient) -> None:
    res = real_client.get("/api/v1/scenarios/nope")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "scenario_not_found"


def test_path_traversal_id_cannot_read_outside_scenarios_dir(real_client: TestClient) -> None:
    res = real_client.get("/api/v1/scenarios/..%2F..%2Fapps%2Fapi%2Fpyproject")
    assert res.status_code == 404


def test_invalid_scenario_is_reported_not_hidden(client: TestClient, scenarios_dir: Path) -> None:
    write_scenario(scenarios_dir, "demo", minimal() | {"schema_version": "9"})
    listing = client.get("/api/v1/scenarios").json()
    assert listing["items"] == []
    assert listing["invalid"][0]["id"] == "demo"
    detail = client.get("/api/v1/scenarios/demo")
    assert detail.status_code == 500
    assert detail.json()["error"]["code"] == "scenario_invalid"


def test_scenario_id_must_match_directory(client: TestClient, scenarios_dir: Path) -> None:
    write_scenario(scenarios_dir, "other", minimal())
    assert client.get("/api/v1/scenarios").json()["invalid"][0]["id"] == "other"


def test_malformed_json_is_reported(client: TestClient, scenarios_dir: Path) -> None:
    (scenarios_dir / "broken").mkdir()
    (scenarios_dir / "broken" / "scenario.json").write_text("{not json")
    assert client.get("/api/v1/scenarios").json()["invalid"][0]["id"] == "broken"


def test_oversized_scenario_is_rejected(client: TestClient, scenarios_dir: Path) -> None:
    (scenarios_dir / "big").mkdir()
    (scenarios_dir / "big" / "scenario.json").write_text(" " * 1_000_001)
    assert "exceeds" in client.get("/api/v1/scenarios").json()["invalid"][0]["error"]


def test_missing_scenarios_dir_lists_nothing(client: TestClient, scenarios_dir: Path) -> None:
    scenarios_dir.rmdir()
    assert client.get("/api/v1/scenarios").json() == {"items": [], "invalid": []}


def test_cors_allows_dev_origin_only(real_client: TestClient) -> None:
    ok = real_client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    bad = real_client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_symlinked_scenario_directories_are_ignored(
    client: TestClient, scenarios_dir: Path
) -> None:
    outside = scenarios_dir.parent / "outside"
    write_scenario(scenarios_dir.parent, "outside", minimal())
    (scenarios_dir / "linked").symlink_to(outside, target_is_directory=True)
    assert client.get("/api/v1/scenarios").json() == {"items": [], "invalid": []}
    assert client.get("/api/v1/scenarios/linked").status_code == 404
