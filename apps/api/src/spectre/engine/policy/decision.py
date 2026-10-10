from dataclasses import dataclass, field
from enum import StrEnum
from typing import Literal


class Decision(StrEnum):
    ALLOW = "ALLOW"
    DENY = "DENY"  # an explicit Deny statement matched
    NOT_ALLOWED = "NOT_ALLOWED"  # nothing granted it (the default)
    UNSUPPORTED = "UNSUPPORTED"  # the question is outside the modeled subset


@dataclass(frozen=True)
class StatementEvidence:
    policy_id: str
    sid: str
    effect: Literal["Allow", "Deny"]
    kind: Literal["statement"] = field(default="statement", init=False)


@dataclass(frozen=True)
class TrustEvidence:
    """The role's trust entry that lists ``identity_id``."""

    role_id: str
    identity_id: str
    kind: Literal["trust"] = field(default="trust", init=False)


@dataclass(frozen=True)
class RelationshipEvidence:
    relationship_id: str
    kind: Literal["relationship"] = field(default="relationship", init=False)


Evidence = StatementEvidence | TrustEvidence | RelationshipEvidence


@dataclass(frozen=True)
class AuthorizationDecision:
    decision: Decision
    principal_id: str
    action: str
    resource_id: str
    reason: str
    evidence: tuple[Evidence, ...] = ()
