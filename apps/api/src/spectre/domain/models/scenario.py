"""Versioned schema for synthetic scenarios (schema_version "1").

A scenario is an untrusted document. It is validated structurally here and is never
executed or interpreted as code. Unknown fields are rejected so that authorization
semantics SPECTRE does not support (for example policy ``Condition`` blocks) fail loudly
instead of being silently treated as allowed.
"""

from collections import Counter
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

SCHEMA_VERSION = "1"

EntityId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]
# "service:Action", "service:Prefix*", "service:*" or "*"
ActionPattern = Annotated[str, StringConstraints(pattern=r"^(\*|[a-z0-9-]+:(\*|[A-Za-z0-9]+\*?))$")]
# an entity id, an id prefix ending in "*", or "*"
ResourcePattern = Annotated[str, StringConstraints(pattern=r"^(\*|[a-z0-9][a-z0-9-]{0,63}\*?)$")]
Text = Annotated[str, StringConstraints(min_length=1, max_length=1000)]
Name = Annotated[str, StringConstraints(min_length=1, max_length=120)]

Sensitivity = Literal["public", "internal", "confidential", "restricted"]
ResourceKind = Literal["database", "object_storage", "secret", "compute"]
PrincipalKind = Literal["user", "service"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class ScenarioMetadata(_Strict):
    id: EntityId
    name: Name
    description: Text
    intended_outcome: Text = Field(
        description="What a future engine evaluation is expected to show. Documentation only."
    )


class Principal(_Strict):
    id: EntityId
    name: Name
    kind: PrincipalKind


class Role(_Strict):
    id: EntityId
    name: Name
    trusted_identities: list[EntityId] = Field(
        default_factory=list,
        description="Identities (principals or roles) allowed to assume this role by its trust.",
    )


class Resource(_Strict):
    id: EntityId
    name: Name
    kind: ResourceKind
    sensitivity: Sensitivity


class PolicyStatement(_Strict):
    sid: EntityId = Field(description="Unique within its policy; findings cite (policy id, sid).")
    effect: Literal["Allow", "Deny"]
    actions: list[ActionPattern] = Field(min_length=1)
    resources: list[ResourcePattern] = Field(min_length=1)


class Policy(_Strict):
    id: EntityId
    name: Name
    attached_to: list[EntityId] = Field(min_length=1)
    statements: list[PolicyStatement] = Field(min_length=1)


class Relationship(_Strict):
    """An explicitly modeled transition that is not derived from policy evaluation."""

    id: EntityId
    kind: Literal["credential_access"]
    source: EntityId
    target: EntityId
    description: Text


class LegitimateAccess(_Strict):
    """Access that must keep working after any remediation."""

    id: EntityId
    principal: EntityId
    action: ActionPattern
    resource: EntityId
    description: Text


class SecurityObjective(_Strict):
    id: EntityId
    description: Text
    principal: EntityId
    target: EntityId
    expectation: Literal["must_be_unreachable"]


class Scenario(_Strict):
    schema_version: Literal["1"]
    metadata: ScenarioMetadata
    principals: list[Principal] = Field(min_length=1)
    roles: list[Role] = Field(default_factory=list)
    resources: list[Resource] = Field(min_length=1)
    policies: list[Policy] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    legitimate_access: list[LegitimateAccess] = Field(default_factory=list)
    objectives: list[SecurityObjective] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check_references(self) -> Self:
        ids = [
            e.id
            for group in (
                self.principals,
                self.roles,
                self.resources,
                self.policies,
                self.relationships,
                self.legitimate_access,
                self.objectives,
            )
            for e in group
        ]
        duplicates = sorted(i for i, n in Counter(ids).items() if n > 1)
        if duplicates:
            raise ValueError(f"duplicate ids: {', '.join(duplicates)}")

        identities = {p.id for p in self.principals} | {r.id for r in self.roles}
        resources = {r.id for r in self.resources}
        entities = identities | resources

        def require(ref: str, allowed: set[str], where: str) -> None:
            if ref not in allowed:
                raise ValueError(f"{where} references unknown id '{ref}'")

        for role in self.roles:
            for ref in role.trusted_identities:
                require(ref, identities, f"role '{role.id}' trust")
        for policy in self.policies:
            for ref in policy.attached_to:
                require(ref, identities, f"policy '{policy.id}' attachment")
            sids = Counter(stmt.sid for stmt in policy.statements)
            if dupes := sorted(k for k, n in sids.items() if n > 1):
                raise ValueError(
                    f"policy '{policy.id}' has duplicate statement ids: {', '.join(dupes)}"
                )
            for stmt in policy.statements:
                for pattern in stmt.resources:
                    if pattern == "*":
                        continue
                    if pattern.endswith("*"):
                        # A prefix that matches nothing silently disables the statement
                        # (dangerous for a Deny), so a typo must fail loudly.
                        if not any(e.startswith(pattern[:-1]) for e in entities):
                            raise ValueError(
                                f"policy '{policy.id}' pattern '{pattern}' matches no entity"
                            )
                    else:
                        require(pattern, entities, f"policy '{policy.id}' resource")
        for rel in self.relationships:
            require(rel.source, resources, f"relationship '{rel.id}' source")
            require(rel.target, entities, f"relationship '{rel.id}' target")
            if next(r.kind for r in self.resources if r.id == rel.source) != "secret":
                raise ValueError(f"relationship '{rel.id}' source must be a secret")
        role_ids = {r.id for r in self.roles}
        for access in self.legitimate_access:
            require(access.principal, identities, f"legitimate access '{access.id}' principal")
            require(access.resource, entities, f"legitimate access '{access.id}' resource")
            if access.action == "sts:AssumeRole" and access.resource not in role_ids:
                raise ValueError(f"legitimate access '{access.id}' must target a role")
        for obj in self.objectives:
            require(obj.principal, identities, f"objective '{obj.id}' principal")
            require(obj.target, resources, f"objective '{obj.id}' target")
        return self
