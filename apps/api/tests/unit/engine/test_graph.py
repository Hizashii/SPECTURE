from spectre.domain.models import Scenario
from spectre.engine.graph import CREDENTIAL_READ, EdgeKind, GraphEdge, TransitionGraph, build_graph
from spectre.engine.policy import Decision, RelationshipEvidence, TrustEvidence
from tests.unit.engine.builders import build, stmt

GET_SECRET = CREDENTIAL_READ


def edges(s: Scenario, kind: EdgeKind | None = None) -> dict[str, GraphEdge]:
    g = build_graph(s)
    return {e.id: e for e in g.edges if kind is None or e.kind is kind}


def test_nodes_cover_every_entity_with_a_group() -> None:
    s = build(roles={"role-a": []}, resources={"db": "restricted"})
    g = build_graph(s)
    assert {n.id: n.group for n in g.nodes} == {
        "alice": "principal",
        "role-a": "role",
        "db": "resource",
    }
    assert next(n for n in g.nodes if n.id == "db").sensitivity == "restricted"


def test_trust_entries_are_inventory_edges_with_trust_evidence() -> None:
    s = build(roles={"role-a": ["alice"]})
    e = edges(s, EdgeKind.INVENTORY)["trust:alice>role-a"]
    assert e.evidence == (TrustEvidence("role-a", "alice"),)
    assert e.decision is None


def test_assume_role_needs_permission_and_trust_to_be_authorized() -> None:
    s = build(
        roles={"role-a": ["alice"]},
        policies={"p": ("alice", [stmt("Allow", ["sts:AssumeRole"], ["role-a"])])},
    )
    e = edges(s)["assume:alice>role-a"]
    assert (e.kind, e.decision) == (EdgeKind.AUTHORIZED, Decision.ALLOW)
    assert e.actions == ("sts:AssumeRole",)


def test_permission_without_trust_is_a_rejected_edge() -> None:
    s = build(
        roles={"role-a": []},
        policies={"p": ("alice", [stmt("Allow", ["sts:AssumeRole"], ["role-a"])])},
    )
    e = edges(s)["assume:alice>role-a"]
    assert (e.kind, e.decision) == (EdgeKind.REJECTED, Decision.NOT_ALLOWED)
    assert "trust" in e.reason


def test_trust_without_permission_is_a_rejected_edge() -> None:
    s = build(roles={"role-a": ["alice"]})
    assert edges(s)["assume:alice>role-a"].kind is EdgeKind.REJECTED


def test_unrelated_identity_and_role_produce_no_edge_at_all() -> None:
    s = build(roles={"role-a": []})
    assert "assume:alice>role-a" not in edges(s)


def test_explicit_deny_on_assume_role_is_rejected_with_deny_decision() -> None:
    s = build(
        roles={"role-a": ["alice"]},
        policies={
            "p": (
                "alice",
                [stmt("Allow", ["sts:*"], ["*"]), stmt("Deny", ["sts:AssumeRole"], ["role-a"])],
            )
        },
    )
    e = edges(s)["assume:alice>role-a"]
    assert (e.kind, e.decision) == (EdgeKind.REJECTED, Decision.DENY)


def test_resource_access_edge_lists_the_allowed_actions() -> None:
    s = build(policies={"p": ("alice", [stmt("Allow", ["s3:GetObject"], ["bucket"])])})
    e = edges(s)["access:alice>bucket"]
    assert (e.kind, e.actions) == (EdgeKind.AUTHORIZED, ("s3:GetObject",))
    assert e.evidence[0].kind == "statement"


def test_no_edge_when_nothing_is_granted() -> None:
    assert "access:alice>bucket" not in edges(build())


def test_wildcard_allow_with_full_deny_on_one_resource_yields_authorized_and_rejected() -> None:
    s = build(
        resources={"logs": "internal", "pii-lake": "restricted"},
        policies={
            "p": (
                "alice",
                [stmt("Allow", ["s3:*"], ["*"]), stmt("Deny", ["s3:*"], ["pii-lake"])],
            )
        },
    )
    es = edges(s)
    assert es["access:alice>logs"].kind is EdgeKind.AUTHORIZED
    assert es["access:alice>pii-lake"].kind is EdgeKind.REJECTED
    assert es["access:alice>pii-lake"].decision is Decision.DENY


def test_partial_deny_leaves_the_rest_of_the_wildcard_reachable() -> None:
    s = build(
        policies={
            "p": (
                "alice",
                [stmt("Allow", ["s3:*"], ["*"]), stmt("Deny", ["s3:GetObject"], ["bucket"])],
            )
        }
    )
    assert edges(s)["access:alice>bucket"].kind is EdgeKind.AUTHORIZED


def test_assume_role_statements_do_not_create_resource_access_edges() -> None:
    s = build(
        roles={"role-a": ["alice"]},
        policies={"p": ("alice", [stmt("Allow", ["sts:AssumeRole"], ["*"])])},
    )
    assert not [i for i in edges(s) if i.startswith("access:")]


def secret_scenario(policies: dict | None = None) -> Scenario:  # type: ignore[type-arg]
    return build(
        resources={"secret": "restricted", "db": "restricted"},
        kinds={"secret": "secret", "db": "database"},
        relationships=[("secret", "db")],
        policies=policies or {},
    )


def test_modeled_relationship_is_a_prerequisite_edge_with_relationship_evidence() -> None:
    e = edges(secret_scenario(), EdgeKind.PREREQUISITE)["rel:rel-0"]
    assert (e.source, e.target) == ("secret", "db")
    assert e.evidence == (RelationshipEvidence("rel-0"),)


def test_reading_the_secret_is_an_authorized_credential_edge() -> None:
    s = secret_scenario({"p": ("alice", [stmt("Allow", [GET_SECRET], ["secret"])])})
    e = edges(s)["credential:alice>secret"]
    assert (e.kind, e.actions) == (EdgeKind.AUTHORIZED, (GET_SECRET,))


def test_credential_read_is_checked_against_the_concrete_action_not_a_probe() -> None:
    s = secret_scenario(
        {
            "p": (
                "alice",
                [
                    stmt("Allow", ["secretsmanager:*"], ["secret"]),
                    stmt("Deny", [GET_SECRET], ["secret"]),
                ],
            )
        }
    )
    e = edges(s)["credential:alice>secret"]
    assert (e.kind, e.decision) == (EdgeKind.REJECTED, Decision.DENY)


def test_other_actions_on_the_secret_do_not_open_the_credential_edge() -> None:
    s = secret_scenario(
        {"p": ("alice", [stmt("Allow", ["secretsmanager:ListSecrets"], ["secret"])])}
    )
    assert "credential:alice>secret" not in edges(s)
    assert "access:alice>secret" not in edges(s)  # relationship sources use credential edges only


def test_graph_is_deterministic() -> None:
    s = secret_scenario({"p": ("alice", [stmt("Allow", ["*"], ["*"])])})
    assert build_graph(s) == build_graph(s)
    assert isinstance(build_graph(s), TransitionGraph)
