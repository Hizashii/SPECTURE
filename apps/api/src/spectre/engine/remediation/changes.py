"""Remediation changes and their application to a *copy* of a scenario."""

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import ValidationError

from spectre.domain.models import Scenario


class InvalidChange(ValueError):
    """The change refers to something that does not exist or would make the scenario invalid."""


@dataclass(frozen=True)
class RemoveStatement:
    policy_id: str
    sid: str
    kind: Literal["remove_statement"] = "remove_statement"


@dataclass(frozen=True)
class ReplaceStatement:
    policy_id: str
    sid: str
    effect: Literal["Allow", "Deny"]
    actions: list[str]
    resources: list[str]
    kind: Literal["replace_statement"] = "replace_statement"


@dataclass(frozen=True)
class RemoveTrust:
    role_id: str
    identity_id: str
    kind: Literal["remove_trust"] = "remove_trust"


@dataclass(frozen=True)
class DetachPolicy:
    policy_id: str
    identity_id: str
    kind: Literal["detach_policy"] = "detach_policy"


Change = RemoveStatement | ReplaceStatement | RemoveTrust | DetachPolicy


@dataclass(frozen=True)
class ChangeDiff:
    change: Change
    target: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None


def _policy(doc: dict[str, Any], policy_id: str) -> dict[str, Any]:
    for p in doc["policies"]:
        if p["id"] == policy_id:
            return p  # type: ignore[no-any-return]
    raise InvalidChange(f"unknown policy '{policy_id}'")


def _statement(policy: dict[str, Any], sid: str) -> dict[str, Any]:
    for st in policy["statements"]:
        if st["sid"] == sid:
            return st  # type: ignore[no-any-return]
    raise InvalidChange(f"policy '{policy['id']}' has no statement '{sid}'")


def _drop_if_empty(doc: dict[str, Any], policy: dict[str, Any], key: str) -> None:
    if not policy[key]:
        doc["policies"].remove(policy)  # a policy with nothing left is removed entirely


def _apply(doc: dict[str, Any], ch: Change) -> ChangeDiff:
    if isinstance(ch, RemoveStatement):
        policy = _policy(doc, ch.policy_id)
        st = _statement(policy, ch.sid)
        policy["statements"].remove(st)
        _drop_if_empty(doc, policy, "statements")
        return ChangeDiff(ch, f"{ch.policy_id}/{ch.sid}", dict(st), None)
    if isinstance(ch, ReplaceStatement):
        st = _statement(_policy(doc, ch.policy_id), ch.sid)
        before = dict(st)
        st.update(effect=ch.effect, actions=list(ch.actions), resources=list(ch.resources))
        return ChangeDiff(ch, f"{ch.policy_id}/{ch.sid}", before, dict(st))
    if isinstance(ch, RemoveTrust):
        role = next((r for r in doc["roles"] if r["id"] == ch.role_id), None)
        if role is None:
            raise InvalidChange(f"unknown role '{ch.role_id}'")
        if ch.identity_id not in role["trusted_identities"]:
            raise InvalidChange(f"role '{ch.role_id}' does not trust '{ch.identity_id}'")
        before = {"trusted_identities": list(role["trusted_identities"])}
        role["trusted_identities"].remove(ch.identity_id)
        return ChangeDiff(
            ch, ch.role_id, before, {"trusted_identities": list(role["trusted_identities"])}
        )
    policy = _policy(doc, ch.policy_id)
    if ch.identity_id not in policy["attached_to"]:
        raise InvalidChange(f"policy '{ch.policy_id}' is not attached to '{ch.identity_id}'")
    before = {"attached_to": list(policy["attached_to"])}
    policy["attached_to"].remove(ch.identity_id)
    after = {"attached_to": list(policy["attached_to"])}
    _drop_if_empty(doc, policy, "attached_to")
    return ChangeDiff(ch, ch.policy_id, before, after)


def apply_changes(
    scenario: Scenario, changes: list[Change]
) -> tuple[Scenario, tuple[ChangeDiff, ...]]:
    """Returns a new, fully re-validated scenario. The input is never modified."""
    doc = scenario.model_dump()  # a plain deep copy
    diffs = tuple(_apply(doc, c) for c in changes)
    try:
        return Scenario.model_validate(doc), diffs
    except ValidationError as exc:
        first = exc.errors()[0]
        raise InvalidChange(f"change produces an invalid scenario: {first['msg']}") from exc
