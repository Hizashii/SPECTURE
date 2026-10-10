from fastapi.testclient import TestClient


def run(client: TestClient, scenario_id: str = "northstar-financial") -> dict:  # type: ignore[type-arg]
    res = client.post("/api/v1/analyses", json={"scenario_id": scenario_id})
    assert res.status_code == 201, res.text
    return res.json()  # type: ignore[no-any-return]


def test_run_analysis_returns_a_persisted_summary(db_client: TestClient) -> None:
    body = run(db_client)
    assert body["scenario_id"] == "northstar-financial"
    assert body["finding_count"] == 2
    assert body["objectives_violated"] == 1
    assert body["truncated"] is False
    assert body["engine_version"] and len(body["id"]) == 32


def test_detail_lists_objectives_legitimate_access_and_limits(db_client: TestClient) -> None:
    aid = run(db_client)["id"]
    d = db_client.get(f"/api/v1/analyses/{aid}").json()
    assert d["objectives"][0]["status"] == "violated"
    assert d["objectives"][0]["finding_id"] == "finding:dev-alice>customer-db"
    assert all(c["passes"] for c in d["legitimate_access"])
    assert d["limits"]["max_depth"] == 8


def test_findings_carry_evidence_on_every_step(db_client: TestClient) -> None:
    aid = run(db_client)["id"]
    items = db_client.get(f"/api/v1/analyses/{aid}/findings").json()["items"]
    top = items[0]
    assert (top["id"], top["severity"]) == ("finding:dev-alice>customer-db", "critical")
    steps = top["paths"][0]["steps"]
    assert len(steps) == 4
    assert all(step["evidence"] for step in steps)
    assert steps[0]["evidence"][0]["kind"] in {"statement", "trust"}
    assert steps[-1]["kind"] == "prerequisite"
    assert steps[-1]["evidence"][0] == {
        "kind": "relationship",
        "relationship_id": "rel-secret-opens-db",
    }


def test_graph_exposes_typed_edges_including_rejected_ones(db_client: TestClient) -> None:
    aid = run(db_client, "helios-platform")["id"]
    g = db_client.get(f"/api/v1/analyses/{aid}/graph").json()
    kinds = {e["kind"] for e in g["edges"]}
    assert {"inventory", "rejected"} <= kinds
    assert "authorized" in kinds  # ops-bob may assume the analyst role
    rejected = {e["id"]: e for e in g["edges"] if e["kind"] == "rejected"}
    assert rejected["access:role-analyst>pii-lake"]["decision"] == "DENY"
    assert {n["id"] for n in g["nodes"]} >= {"ops-bob", "role-analyst", "pii-lake"}


def test_clean_scenario_has_no_findings(db_client: TestClient) -> None:
    body = run(db_client, "helios-platform")
    assert body["finding_count"] == 0 and body["objectives_violated"] == 0


def test_list_is_newest_first_and_filterable(db_client: TestClient) -> None:
    a = run(db_client, "northstar-financial")["id"]
    b = run(db_client, "harbor-commerce")["id"]
    ids = [r["id"] for r in db_client.get("/api/v1/analyses").json()["items"]]
    assert ids == [b, a]
    only = db_client.get("/api/v1/analyses", params={"scenario_id": "northstar-financial"}).json()
    assert [r["id"] for r in only["items"]] == [a]


def test_unknown_scenario_and_analysis_are_structured_404s(db_client: TestClient) -> None:
    r = db_client.post("/api/v1/analyses", json={"scenario_id": "nope"})
    assert (r.status_code, r.json()["error"]["code"]) == (404, "scenario_not_found")
    r = db_client.get("/api/v1/analyses/" + "0" * 32)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "analysis_not_found")
    assert db_client.get("/api/v1/analyses/" + "0" * 32 + "/graph").status_code == 404
    assert db_client.get("/api/v1/analyses/" + "0" * 32 + "/findings").status_code == 404


def test_bad_request_bodies_are_rejected(db_client: TestClient) -> None:
    for body in (
        {},
        {"scenario_id": "x", "extra": 1},
        {"scenario_id": "../etc"},
        {"scenario_id": 5},
    ):
        r = db_client.post("/api/v1/analyses", json=body)
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_request"), body


def test_oversized_request_bodies_are_refused(db_client: TestClient) -> None:
    r = db_client.post(
        "/api/v1/analyses", content=b" " * 200_000, headers={"content-type": "application/json"}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (413, "payload_too_large")


def test_results_survive_a_new_client_because_they_are_stored(db_client: TestClient) -> None:
    aid = run(db_client)["id"]
    again = TestClient(db_client.app)
    assert again.get(f"/api/v1/analyses/{aid}").status_code == 200


# --- simulations -----------------------------------------------------------------------------

CUT = {"kind": "remove_statement", "policy_id": "policy-ci-deploy", "sid": "assume-runtime"}


def simulate(client: TestClient, changes: list, scenario_id: str = "northstar-financial"):  # type: ignore[no-untyped-def,type-arg]
    return client.post("/api/v1/simulations", json={"scenario_id": scenario_id, "changes": changes})


def test_simulation_compares_before_and_after_and_is_persisted(db_client: TestClient) -> None:
    res = simulate(db_client, [CUT])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["verdict"] == "effective"
    assert body["resolved_findings"] == [
        "finding:dev-alice>customer-db",
        "finding:dev-alice>secret-db-credentials",
    ]
    assert body["broken_legitimate_access"] == []
    assert body["before"]["finding_count"] == 2 and body["after"]["finding_count"] == 0
    assert (
        body["diffs"][0]["before"]["sid"] == "assume-runtime" and body["diffs"][0]["after"] is None
    )
    assert any("subset" in n for n in body["notes"])
    got = db_client.get(f"/api/v1/simulations/{body['id']}")
    assert got.status_code == 200 and got.json()["verdict"] == "effective"


def test_simulation_does_not_modify_the_scenario(db_client: TestClient) -> None:
    before = db_client.get("/api/v1/scenarios/northstar-financial").json()
    simulate(db_client, [CUT])
    assert db_client.get("/api/v1/scenarios/northstar-financial").json() == before


def test_a_fix_that_breaks_legitimate_access_is_reported_as_such(db_client: TestClient) -> None:
    body = simulate(
        db_client,
        [{"kind": "remove_statement", "policy_id": "policy-dev-assume-ci", "sid": "assume-ci"}],
    ).json()
    assert body["verdict"] == "breaks_legitimate_access"
    assert [c["id"] for c in body["broken_legitimate_access"]] == ["legit-dev-assume-ci"]


def test_all_change_kinds_are_accepted(db_client: TestClient) -> None:
    changes = [
        {
            "kind": "replace_statement",
            "policy_id": "policy-ci-deploy",
            "sid": "assume-runtime",
            "effect": "Allow",
            "actions": ["sts:AssumeRole"],
            "resources": ["role-app-runtime"],
        },
        {"kind": "remove_trust", "role_id": "role-app-runtime", "identity_id": "role-ci-deployer"},
        {"kind": "detach_policy", "policy_id": "policy-dev-assume-ci", "identity_id": "dev-alice"},
    ]
    assert simulate(db_client, changes).status_code == 201


def test_invalid_changes_are_422_with_a_reason(db_client: TestClient) -> None:
    r = simulate(db_client, [{"kind": "remove_statement", "policy_id": "nope", "sid": "x"}])
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_change")
    assert "nope" in r.json()["error"]["message"]


def test_simulation_requests_are_validated_and_bounded(db_client: TestClient) -> None:
    assert simulate(db_client, []).status_code == 422  # at least one change
    assert simulate(db_client, [CUT] * 26).status_code == 422  # at most 25
    assert simulate(db_client, [{"kind": "run_shell", "cmd": "x"}]).status_code == 422
    assert simulate(db_client, [CUT], "nope").status_code == 404
    bad = {**CUT, "extra": 1}
    assert simulate(db_client, [bad]).status_code == 422
    wild = {
        "kind": "replace_statement",
        "policy_id": "p",
        "sid": "s",
        "effect": "Allow",
        "actions": ["not valid"],
        "resources": ["*"],
    }
    assert simulate(db_client, [wild]).status_code == 422


def test_simulation_list_and_unknown_id(db_client: TestClient) -> None:
    sid = simulate(db_client, [CUT]).json()["id"]
    items = db_client.get(
        "/api/v1/simulations", params={"scenario_id": "northstar-financial"}
    ).json()["items"]
    assert [i["id"] for i in items] == [sid]
    assert items[0]["verdict"] == "effective"
    r = db_client.get("/api/v1/simulations/" + "0" * 32)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "simulation_not_found")


def test_capabilities_now_report_the_engine_as_implemented(db_client: TestClient) -> None:
    body = db_client.get("/api/v1/capabilities").json()
    assert body["engine_version"]
    statuses = {f["id"]: f["status"] for f in body["features"]}
    assert statuses["policy-evaluation"] == statuses["path-discovery"] == "implemented"
    assert statuses["remediation-simulation"] == statuses["analysis-history"] == "implemented"
    sem = {s["id"]: s["status"] for s in body["policy_semantics"]}
    assert sem["identity-deny"] == sem["role-assumption"] == "implemented"
    assert sem["conditions"] == "unsupported"
