import json

import pytest

from spectre.domain.models import Scenario
from spectre.engine import ENGINE_VERSION
from spectre.engine.analysis import AnalysisResult, SearchLimits, Severity, analyze
from spectre.engine.graph import CREDENTIAL_READ, EdgeKind
from spectre.engine.policy import Decision
from tests.conftest import REPO_SCENARIOS
from tests.unit.engine.builders import build, stmt

ASSUME = "sts:AssumeRole"
GET_SECRET = CREDENTIAL_READ


def findings(r: AnalysisResult) -> dict[str, list[list[str]]]:
    """finding id -> list of paths, each path as the node sequence."""
    return {
        f.id: [[p.steps[0].source, *(s.target for s in p.steps)] for p in f.paths]
        for f in r.findings
    }


def test_direct_access_to_a_restricted_resource_is_a_critical_finding() -> None:
    s = build(
        resources={"db": "restricted"},
        policies={"p": ("alice", [stmt("Allow", ["rds:*"], ["db"])])},
    )
    r = analyze(s)
    assert findings(r) == {"finding:alice>db": [["alice", "db"]]}
    f = r.findings[0]
    assert f.severity is Severity.CRITICAL
    assert [e.kind for e in f.paths[0].steps] == [EdgeKind.AUTHORIZED]


def test_internal_resources_are_not_findings_unless_an_objective_names_them() -> None:
    s = build(policies={"p": ("alice", [stmt("Allow", ["s3:*"], ["bucket"])])})
    assert analyze(s).findings == ()
    named = build(
        policies={"p": ("alice", [stmt("Allow", ["s3:*"], ["bucket"])])},
        objectives=[("alice", "bucket")],
    )
    assert analyze(named).findings[0].severity is Severity.MEDIUM


def chain() -> Scenario:
    return build(
        roles={"role-a": ["alice"], "role-b": ["role-a"]},
        resources={"secret": "restricted", "db": "restricted"},
        kinds={"secret": "secret", "db": "database"},
        relationships=[("secret", "db")],
        policies={
            "p-alice": ("alice", [stmt("Allow", [ASSUME], ["role-a"])]),
            "p-a": ("role-a", [stmt("Allow", [ASSUME], ["role-b"])]),
            "p-b": ("role-b", [stmt("Allow", [GET_SECRET], ["secret"])]),
        },
    )


def test_a_chain_of_assumptions_and_a_modeled_credential_is_one_evidenced_path() -> None:
    r = analyze(chain())
    assert findings(r)["finding:alice>db"] == [["alice", "role-a", "role-b", "secret", "db"]]
    steps = (
        r.findings[0].paths[0].steps
        if r.findings[0].target == "db"
        else r.findings[1].paths[0].steps
    )
    assert [s.kind for s in steps] == [
        EdgeKind.AUTHORIZED,
        EdgeKind.AUTHORIZED,
        EdgeKind.AUTHORIZED,
        EdgeKind.PREREQUISITE,
    ]
    assert all(s.evidence for s in steps)  # no step without evidence


def test_the_secret_itself_is_also_reached() -> None:
    assert "finding:alice>secret" in findings(analyze(chain()))


def test_missing_trust_breaks_the_chain() -> None:
    s = build(
        roles={"role-a": []},
        resources={"db": "restricted"},
        policies={
            "p-alice": ("alice", [stmt("Allow", [ASSUME], ["role-a"])]),
            "p-a": ("role-a", [stmt("Allow", ["rds:*"], ["db"])]),
        },
        objectives=[("alice", "db")],
    )
    r = analyze(s)
    assert r.findings == ()
    assert r.objectives[0].status == "satisfied"


def test_explicit_deny_blocks_an_otherwise_reachable_resource() -> None:
    s = build(
        resources={"pii": "restricted"},
        policies={
            "p": ("alice", [stmt("Allow", ["s3:*"], ["*"]), stmt("Deny", ["s3:*"], ["pii"])])
        },
    )
    assert analyze(s).findings == ()


def test_a_role_is_not_an_entry_point() -> None:
    s = build(
        roles={"role-a": []},
        resources={"db": "restricted"},
        policies={"p": ("role-a", [stmt("Allow", ["rds:*"], ["db"])])},
    )
    assert analyze(s).findings == ()


def test_trust_cycles_terminate_and_never_revisit_a_node() -> None:
    s = build(
        roles={"role-a": ["alice", "role-b"], "role-b": ["role-a"]},
        resources={"db": "restricted"},
        policies={
            "p-alice": ("alice", [stmt("Allow", [ASSUME], ["role-a"])]),
            "p-a": ("role-a", [stmt("Allow", [ASSUME], ["role-b"])]),
            "p-b": (
                "role-b",
                [stmt("Allow", [ASSUME], ["role-a"]), stmt("Allow", ["rds:*"], ["db"])],
            ),
        },
    )
    r = analyze(s)
    for path in findings(r)["finding:alice>db"]:
        assert len(path) == len(set(path))


def test_depth_limit_is_reported_as_truncation_not_silently_ignored() -> None:
    ids = [f"r{i}" for i in range(5)]
    roles = {ids[0]: ["alice"], **{ids[i]: [ids[i - 1]] for i in range(1, 5)}}
    policies = {"p-alice": ("alice", [stmt("Allow", [ASSUME], [ids[0]])])}
    for i in range(1, 5):
        policies[f"p{i}"] = (ids[i - 1], [stmt("Allow", [ASSUME], [ids[i]])])
    policies["p-last"] = (ids[4], [stmt("Allow", ["rds:*"], ["db"])])
    s = build(roles=roles, resources={"db": "restricted"}, policies=policies)
    shallow = analyze(s, SearchLimits(max_depth=3))
    assert shallow.findings == ()
    assert shallow.truncated is True
    assert analyze(s).findings and analyze(s).truncated is False


def test_path_cap_per_pair_is_reported() -> None:
    s = build(
        roles={"r1": ["alice"], "r2": ["alice"]},
        resources={"db": "restricted"},
        policies={
            "p-alice": ("alice", [stmt("Allow", [ASSUME], ["r1", "r2"])]),
            "p1": ("r1", [stmt("Allow", ["rds:*"], ["db"])]),
            "p2": ("r2", [stmt("Allow", ["rds:*"], ["db"])]),
        },
    )
    full = analyze(s)
    assert len(full.findings[0].paths) == 2
    capped = analyze(s, SearchLimits(max_paths_per_pair=1))
    assert len(capped.findings[0].paths) == 1
    assert capped.findings[0].truncated is True and capped.truncated is True


def test_expansion_budget_stops_the_search_and_flags_it() -> None:
    assert analyze(chain(), SearchLimits(max_expansions=1)).truncated is True


def test_objectives_report_violated_with_the_finding_id() -> None:
    s = build(
        resources={"db": "restricted"},
        policies={"p": ("alice", [stmt("Allow", ["rds:*"], ["db"])])},
        objectives=[("alice", "db")],
    )
    o = analyze(s).objectives[0]
    assert (o.status, o.finding_id) == ("violated", "finding:alice>db")


def test_legitimate_access_is_checked_with_the_same_evaluator() -> None:
    s = build(
        policies={"p": ("alice", [stmt("Allow", ["s3:GetObject"], ["bucket"])])},
        legit=[("alice", "s3:GetObject", "bucket"), ("alice", "s3:PutObject", "bucket")],
    )
    checks = analyze(s).legitimate_access
    assert [(c.passes, c.decision.decision) for c in checks] == [
        (True, Decision.ALLOW),
        (False, Decision.NOT_ALLOWED),
    ]


def test_analysis_is_deterministic_and_carries_the_engine_version() -> None:
    r1, r2 = analyze(chain()), analyze(chain())
    assert r1 == r2
    assert r1.engine_version == ENGINE_VERSION


def test_findings_are_ordered_by_severity_then_id() -> None:
    s = build(
        resources={"a": "confidential", "b": "restricted"},
        policies={"p": ("alice", [stmt("Allow", ["*"], ["*"])])},
    )
    assert [f.id for f in analyze(s).findings] == ["finding:alice>b", "finding:alice>a"]


# --- the shipped fixtures: documented intended outcomes, now actually evaluated --------------


def load(name: str) -> Scenario:
    path = REPO_SCENARIOS / name / "scenario.json"
    return Scenario.model_validate(json.loads(path.read_text()))


def test_northstar_developer_reaches_the_customer_db_through_the_documented_chain() -> None:
    r = analyze(load("northstar-financial"))
    assert findings(r)["finding:dev-alice>customer-db"] == [
        [
            "dev-alice",
            "role-ci-deployer",
            "role-app-runtime",
            "secret-db-credentials",
            "customer-db",
        ]
    ]
    assert r.objectives[0].status == "violated"
    assert all(c.passes for c in r.legitimate_access)


def test_harbor_service_reaches_the_restricted_bucket_through_an_overbroad_policy() -> None:
    r = analyze(load("harbor-commerce"))
    assert "finding:svc-order-processor>customer-exports" in findings(r)
    assert r.objectives[0].status == "violated"
    assert all(c.passes for c in r.legitimate_access)


def test_helios_routes_are_blocked_by_missing_trust_and_by_explicit_deny() -> None:
    r = analyze(load("helios-platform"))
    assert r.findings == ()
    assert r.objectives[0].status == "satisfied"
    rejected = {e.id: e for e in r.graph.edges if e.kind is EdgeKind.REJECTED}
    assert "not listed in the role's trust" in rejected["assume:ops-bob>role-platform-admin"].reason
    assert rejected["access:role-analyst>pii-lake"].decision is Decision.DENY
    assert all(c.passes for c in r.legitimate_access)


@pytest.mark.parametrize("name", ["northstar-financial", "harbor-commerce", "helios-platform"])
def test_every_step_of_every_reported_path_carries_evidence(name: str) -> None:
    for f in analyze(load(name)).findings:
        for p in f.paths:
            assert all(step.evidence for step in p.steps)
