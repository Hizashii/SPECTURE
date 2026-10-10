"""Compact scenario builder for engine tests: inline scenarios, no files, no HTTP."""

from typing import Any

from spectre.domain.models import Scenario


def stmt(effect: str, actions: list[str], resources: list[str]) -> dict[str, Any]:
    return {"effect": effect, "actions": actions, "resources": resources}


def build(
    *,
    principals: list[str] | None = None,
    roles: dict[str, list[str]] | None = None,
    resources: dict[str, str] | None = None,
    kinds: dict[str, str] | None = None,
    policies: dict[str, tuple[str, list[dict[str, Any]]]] | None = None,
    relationships: list[tuple[str, str]] | None = None,
    legit: list[tuple[str, str, str]] | None = None,
    objectives: list[tuple[str, str]] | None = None,
) -> Scenario:
    """roles: id -> trusted identity ids. resources: id -> sensitivity.
    policies: id -> (attached_to, statements). Principals default to ``["alice"]``."""
    doc: dict[str, Any] = {
        "schema_version": "1",
        "metadata": {"id": "t", "name": "T", "description": "d", "intended_outcome": "o"},
        "principals": [{"id": p, "name": p, "kind": "user"} for p in (principals or ["alice"])],
        "roles": [{"id": r, "name": r, "trusted_identities": t} for r, t in (roles or {}).items()],
        "resources": [
            {"id": r, "name": r, "kind": (kinds or {}).get(r, "object_storage"), "sensitivity": s}
            for r, s in (resources or {"bucket": "internal"}).items()
        ],
        "policies": [
            {
                "id": pid,
                "name": pid,
                "attached_to": [att],
                "statements": [{"sid": f"s{i}", **st} for i, st in enumerate(stmts)],
            }
            for pid, (att, stmts) in (policies or {}).items()
        ],
        "relationships": [
            {
                "id": f"rel-{i}",
                "kind": "credential_access",
                "source": s,
                "target": t,
                "description": "d",
            }
            for i, (s, t) in enumerate(relationships or [])
        ],
        "legitimate_access": [
            {
                "id": f"legit-{i}",
                "principal": p,
                "action": a,
                "resource": r,
                "description": "d",
            }
            for i, (p, a, r) in enumerate(legit or [])
        ],
        "objectives": [
            {
                "id": f"obj-{i}",
                "description": "d",
                "principal": p,
                "target": t,
                "expectation": "must_be_unreachable",
            }
            for i, (p, t) in enumerate(objectives or [])
        ],
    }
    return Scenario.model_validate(doc)
