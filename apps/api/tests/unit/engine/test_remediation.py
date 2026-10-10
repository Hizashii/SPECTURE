import json

import pytest

from spectre.domain.models import Scenario
from spectre.engine.analysis import SearchLimits
from spectre.engine.remediation import (
    DetachPolicy,
    InvalidChange,
    RemoveStatement,
    RemoveTrust,
    ReplaceStatement,
    apply_changes,
    simulate,
)
from tests.conftest import REPO_SCENARIOS
from tests.unit.engine.builders import build, stmt

ASSUME = "sts:AssumeRole"


def fixture(name: str) -> Scenario:
    path = REPO_SCENARIOS / name / "scenario.json"
    return Scenario.model_validate(json.loads(path.read_text()))


# --- applying changes ----------------------------------------------------------------------


def test_apply_never_mutates_the_original() -> None:
    s = fixture("northstar-financial")
    before = s.model_dump()
    new, _ = apply_changes(s, [RemoveStatement("policy-ci-deploy", "assume-runtime")])
    assert s.model_dump() == before
    assert new is not s
    assert [st.sid for p in new.policies if p.id == "policy-ci-deploy" for st in p.statements] == [
        "artifacts-rw"
    ]


def test_removing_the_last_statement_removes_the_policy() -> None:
    s = fixture("harbor-commerce")
    new, _ = apply_changes(s, [RemoveStatement("policy-order-storage", "all-storage")])
    assert new.policies == []


def test_replace_statement_keeps_its_sid_and_reports_a_diff() -> None:
    s = fixture("harbor-commerce")
    new, diffs = apply_changes(
        s,
        [
            ReplaceStatement(
                "policy-order-storage", "all-storage", "Allow", ["s3:*"], ["order-receipts"]
            )
        ],
    )
    assert new.policies[0].statements[0].resources == ["order-receipts"]
    assert diffs[0].before["resources"] == ["*"]  # type: ignore[index]
    assert diffs[0].after["resources"] == ["order-receipts"]  # type: ignore[index]


def test_remove_trust_and_detach_policy() -> None:
    s = fixture("northstar-financial")
    new, _ = apply_changes(
        s,
        [
            RemoveTrust("role-app-runtime", "role-ci-deployer"),
            DetachPolicy("policy-dev-assume-ci", "dev-alice"),
        ],
    )
    assert next(r for r in new.roles if r.id == "role-app-runtime").trusted_identities == []
    assert all(p.id != "policy-dev-assume-ci" for p in new.policies)


@pytest.mark.parametrize(
    "change",
    [
        RemoveStatement("nope", "x"),
        RemoveStatement("policy-ci-deploy", "nope"),
        RemoveTrust("nope", "dev-alice"),
        RemoveTrust("role-ci-deployer", "nobody"),
        DetachPolicy("policy-ci-deploy", "dev-alice"),
        ReplaceStatement("policy-ci-deploy", "assume-runtime", "Allow", ["bad action"], ["*"]),
        ReplaceStatement(
            "policy-ci-deploy", "assume-runtime", "Allow", ["s3:*"], ["typo-resourc*"]
        ),
    ],
)
def test_invalid_changes_are_rejected_with_a_reason(change) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(InvalidChange):
        apply_changes(fixture("northstar-financial"), [change])


# --- simulation verdicts ---------------------------------------------------------------------


def test_cutting_the_chain_resolves_the_finding_and_keeps_legitimate_access() -> None:
    r = simulate(
        fixture("northstar-financial"), [RemoveStatement("policy-ci-deploy", "assume-runtime")]
    )
    assert r.verdict == "effective"
    assert r.resolved_findings == (
        "finding:dev-alice>customer-db",
        "finding:dev-alice>secret-db-credentials",
    )
    assert r.remaining_findings == () and r.new_findings == ()
    assert r.broken_legitimate_access == ()
    assert r.after.objectives[0].status == "satisfied"


def test_fixing_the_overbroad_policy_with_a_scoped_resource_is_effective() -> None:
    r = simulate(
        fixture("harbor-commerce"),
        [
            ReplaceStatement(
                "policy-order-storage", "all-storage", "Allow", ["s3:*"], ["order-receipts"]
            )
        ],
    )
    assert r.verdict == "effective"


def test_a_change_that_removes_the_path_but_breaks_legitimate_access_is_not_effective() -> None:
    r = simulate(
        fixture("northstar-financial"), [RemoveStatement("policy-dev-assume-ci", "assume-ci")]
    )
    assert r.verdict == "breaks_legitimate_access"
    assert [c.id for c in r.broken_legitimate_access] == ["legit-dev-assume-ci"]
    assert r.after.findings == ()  # the path disappeared, yet the verdict is still not success


def test_removing_one_of_two_routes_is_partial_and_names_the_residual_path() -> None:
    s = build(
        roles={"r1": ["alice"], "r2": ["alice"]},
        resources={"db": "restricted"},
        policies={
            "p-alice": ("alice", [stmt("Allow", [ASSUME], ["r1", "r2"])]),
            "p1": ("r1", [stmt("Allow", ["rds:*"], ["db"])]),
            "p2": ("r2", [stmt("Allow", ["rds:*"], ["db"])]),
        },
        objectives=[("alice", "db")],
    )
    r = simulate(s, [RemoveStatement("p1", "s0")])
    assert r.verdict == "partial"
    assert r.remaining_findings == ("finding:alice>db",)
    assert len(r.removed_paths) == 1 and len(r.after.findings[0].paths) == 1


def test_a_change_that_does_nothing_useful_is_ineffective() -> None:
    s = fixture("northstar-financial")
    same = next(
        st
        for p in s.policies
        if p.id == "policy-ci-deploy"
        for st in p.statements
        if st.sid == "artifacts-rw"
    )
    r = simulate(
        s,
        [
            ReplaceStatement(
                "policy-ci-deploy", "artifacts-rw", same.effect, same.actions, same.resources
            )
        ],
    )
    assert r.verdict == "ineffective"
    assert r.resolved_findings == ()


def test_nothing_to_remediate_is_not_reported_as_success() -> None:
    s = fixture("helios-platform")
    r = simulate(s, [RemoveStatement("policy-admin-storage", "all-storage")])
    assert r.verdict == "nothing_to_remediate"


def test_a_change_that_opens_a_new_finding_is_flagged() -> None:
    s = build(
        resources={"db": "restricted", "bucket": "internal"},
        policies={"p": ("alice", [stmt("Allow", ["s3:GetObject"], ["bucket"])])},
    )
    # widening the statement to include the restricted resource creates a finding
    r = simulate(s, [ReplaceStatement("p", "s0", "Allow", ["s3:GetObject"], ["*"])])
    assert r.new_findings == ("finding:alice>db",)
    assert r.verdict == "introduces_findings"


def test_a_truncated_search_cannot_certify_success() -> None:
    s = fixture("northstar-financial")
    r = simulate(
        s,
        [RemoveStatement("policy-ci-deploy", "assume-runtime")],
        SearchLimits(max_expansions=2),
    )
    assert r.verdict == "inconclusive"


def test_result_lists_the_modeling_limits() -> None:
    r = simulate(
        fixture("northstar-financial"), [RemoveStatement("policy-ci-deploy", "assume-runtime")]
    )
    assert any("subset" in n for n in r.notes)
