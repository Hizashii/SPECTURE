import pytest

from spectre.domain.models import Scenario
from spectre.engine.policy import (
    AuthorizationDecision,
    Decision,
    PolicyEvaluator,
    StatementEvidence,
    covers,
)
from tests.unit.engine.builders import build, stmt


@pytest.mark.parametrize(
    ("pattern", "value", "expected"),
    [
        ("*", "s3:GetObject", True),
        ("s3:GetObject", "s3:GetObject", True),
        ("s3:GetObject", "s3:PutObject", False),
        ("s3:*", "s3:GetObject", True),
        ("s3:Get*", "s3:GetObject", True),
        ("s3:Get*", "s3:PutObject", False),
        ("s3:GetObject", "s3:getobject", False),  # case-sensitive
        ("s3:*", "ec2:RunInstances", False),
        # probes: an action pattern is covered only if the whole pattern is
        ("s3:*", "s3:Get*", True),
        ("s3:GetObject", "s3:*", False),
        ("s3:Get*", "s3:*", False),
        ("*", "s3:*", True),
    ],
)
def test_covers(pattern: str, value: str, expected: bool) -> None:
    assert covers(pattern, value) is expected


def ev(scenario: Scenario) -> PolicyEvaluator:
    return PolicyEvaluator(scenario)


def statements(d: AuthorizationDecision) -> list[StatementEvidence]:
    return [e for e in d.evidence if isinstance(e, StatementEvidence)]


def test_default_is_not_allowed() -> None:
    d = ev(build()).evaluate("alice", "s3:GetObject", "bucket")
    assert d.decision is Decision.NOT_ALLOWED
    assert d.evidence == ()


def test_allow_statement_allows_and_cites_evidence() -> None:
    s = build(policies={"p1": ("alice", [stmt("Allow", ["s3:GetObject"], ["bucket"])])})
    d = ev(s).evaluate("alice", "s3:GetObject", "bucket")
    assert d.decision is Decision.ALLOW
    assert [(e.policy_id, e.sid, e.effect) for e in statements(d)] == [("p1", "s0", "Allow")]


def test_allow_does_not_cover_other_action_or_resource() -> None:
    s = build(
        resources={"bucket": "internal", "other": "internal"},
        policies={"p1": ("alice", [stmt("Allow", ["s3:GetObject"], ["bucket"])])},
    )
    assert ev(s).evaluate("alice", "s3:PutObject", "bucket").decision is Decision.NOT_ALLOWED
    assert ev(s).evaluate("alice", "s3:GetObject", "other").decision is Decision.NOT_ALLOWED


def test_resource_wildcards() -> None:
    s = build(
        resources={"logs-a": "internal", "logs-b": "internal", "data": "internal"},
        policies={"p1": ("alice", [stmt("Allow", ["s3:*"], ["logs-*"])])},
    )
    assert ev(s).evaluate("alice", "s3:GetObject", "logs-a").decision is Decision.ALLOW
    assert ev(s).evaluate("alice", "s3:GetObject", "data").decision is Decision.NOT_ALLOWED


def test_explicit_deny_overrides_allow() -> None:
    s = build(
        policies={
            "allow": ("alice", [stmt("Allow", ["s3:*"], ["*"])]),
            "deny": ("alice", [stmt("Deny", ["s3:GetObject"], ["bucket"])]),
        }
    )
    d = ev(s).evaluate("alice", "s3:GetObject", "bucket")
    assert d.decision is Decision.DENY
    assert [e.policy_id for e in statements(d)] == ["deny"]


def test_deny_is_scoped_to_what_it_names() -> None:
    s = build(
        policies={
            "allow": ("alice", [stmt("Allow", ["s3:*"], ["*"])]),
            "deny": ("alice", [stmt("Deny", ["s3:GetObject"], ["bucket"])]),
        }
    )
    assert ev(s).evaluate("alice", "s3:PutObject", "bucket").decision is Decision.ALLOW


def test_policies_attached_to_someone_else_do_not_apply() -> None:
    s = build(
        principals=["alice", "bob"],
        policies={"p1": ("bob", [stmt("Allow", ["s3:*"], ["*"])])},
    )
    assert ev(s).evaluate("alice", "s3:GetObject", "bucket").decision is Decision.NOT_ALLOWED


def test_unknown_entities_are_unsupported_never_allowed() -> None:
    s = build(policies={"p1": ("alice", [stmt("Allow", ["*"], ["*"])])})
    assert ev(s).evaluate("ghost", "s3:GetObject", "bucket").decision is Decision.UNSUPPORTED
    assert ev(s).evaluate("alice", "s3:GetObject", "ghost").decision is Decision.UNSUPPORTED


# --- role assumption: needs both a permission and a trust entry --------------------------

ASSUME = "sts:AssumeRole"


def test_assume_role_requires_permission_and_trust() -> None:
    s = build(
        roles={"role-a": ["alice"]},
        policies={"p1": ("alice", [stmt("Allow", [ASSUME], ["role-a"])])},
    )
    d = ev(s).evaluate("alice", ASSUME, "role-a")
    assert d.decision is Decision.ALLOW
    assert {e.kind for e in d.evidence} == {"statement", "trust"}


def test_assume_role_with_permission_but_no_trust_is_not_allowed() -> None:
    s = build(
        roles={"role-a": []},
        policies={"p1": ("alice", [stmt("Allow", [ASSUME], ["role-a"])])},
    )
    d = ev(s).evaluate("alice", ASSUME, "role-a")
    assert d.decision is Decision.NOT_ALLOWED
    assert "trust" in d.reason
    assert [e.kind for e in d.evidence] == ["statement"]


def test_assume_role_with_trust_but_no_permission_is_not_allowed() -> None:
    s = build(roles={"role-a": ["alice"]})
    d = ev(s).evaluate("alice", ASSUME, "role-a")
    assert d.decision is Decision.NOT_ALLOWED
    assert "permission" in d.reason
    assert [e.kind for e in d.evidence] == ["trust"]


def test_explicit_deny_beats_assume_role_trust_and_allow() -> None:
    s = build(
        roles={"role-a": ["alice"]},
        policies={
            "p1": ("alice", [stmt("Allow", [ASSUME], ["*"])]),
            "p2": ("alice", [stmt("Deny", [ASSUME], ["role-a"])]),
        },
    )
    assert ev(s).evaluate("alice", ASSUME, "role-a").decision is Decision.DENY


def test_assume_role_on_a_non_role_is_unsupported() -> None:
    s = build(policies={"p1": ("alice", [stmt("Allow", ["*"], ["*"])])})
    assert ev(s).evaluate("alice", ASSUME, "bucket").decision is Decision.UNSUPPORTED


def test_a_role_acts_as_principal_using_its_own_policies() -> None:
    s = build(
        roles={"role-a": ["alice"]},
        policies={"p1": ("role-a", [stmt("Allow", ["s3:GetObject"], ["bucket"])])},
    )
    assert ev(s).evaluate("role-a", "s3:GetObject", "bucket").decision is Decision.ALLOW
    assert ev(s).evaluate("alice", "s3:GetObject", "bucket").decision is Decision.NOT_ALLOWED
