from dataclasses import dataclass
from typing import Literal

from spectre.domain.models import Scenario
from spectre.engine.policy.decision import (
    AuthorizationDecision,
    Decision,
    Evidence,
    StatementEvidence,
    TrustEvidence,
)
from spectre.engine.policy.matching import covers

ASSUME_ROLE = "sts:AssumeRole"


@dataclass(frozen=True)
class AttachedStatement:
    policy_id: str
    sid: str
    effect: Literal["Allow", "Deny"]
    actions: tuple[str, ...]
    resources: tuple[str, ...]

    @property
    def evidence(self) -> StatementEvidence:
        return StatementEvidence(self.policy_id, self.sid, self.effect)


class PolicyEvaluator:
    """Evaluates (identity, action, resource) against the identity's attached policies.

    Pure and in-memory: it indexes the scenario once and never touches a database.
    ``action`` may be a probe pattern such as ``s3:*`` (see ``covers``).
    """

    def __init__(self, scenario: Scenario):
        self._identities = {p.id for p in scenario.principals} | {r.id for r in scenario.roles}
        self._roles = {r.id: set(r.trusted_identities) for r in scenario.roles}
        self._entities = self._identities | {r.id for r in scenario.resources}
        self._statements: dict[str, list[AttachedStatement]] = {}
        for policy in scenario.policies:
            for stmt in policy.statements:
                for identity in policy.attached_to:
                    self._statements.setdefault(identity, []).append(
                        AttachedStatement(
                            policy.id,
                            stmt.sid,
                            stmt.effect,
                            tuple(stmt.actions),
                            tuple(stmt.resources),
                        )
                    )

    def statements_for(self, identity_id: str) -> list[AttachedStatement]:
        return self._statements.get(identity_id, [])

    def _matching(self, identity_id: str, action: str, resource_id: str) -> list[AttachedStatement]:
        return [
            st
            for st in self.statements_for(identity_id)
            if any(covers(a, action) for a in st.actions)
            and any(covers(r, resource_id) for r in st.resources)
        ]

    def evaluate(self, principal_id: str, action: str, resource_id: str) -> AuthorizationDecision:
        def result(decision: Decision, reason: str, *evidence: Evidence) -> AuthorizationDecision:
            return AuthorizationDecision(
                decision, principal_id, action, resource_id, reason, tuple(evidence)
            )

        if principal_id not in self._identities:
            return result(Decision.UNSUPPORTED, f"unknown identity '{principal_id}'")
        if resource_id not in self._entities:
            return result(Decision.UNSUPPORTED, f"unknown resource '{resource_id}'")

        matched = self._matching(principal_id, action, resource_id)
        denies = [m.evidence for m in matched if m.effect == "Deny"]
        allows = [m.evidence for m in matched if m.effect == "Allow"]

        if denies:
            return result(Decision.DENY, "explicitly denied by a Deny statement", *denies)

        if action == ASSUME_ROLE:
            if resource_id not in self._roles:
                return result(Decision.UNSUPPORTED, "AssumeRole target is not a role")
            trusted = principal_id in self._roles[resource_id]
            trust = TrustEvidence(resource_id, principal_id)
            if allows and trusted:
                return result(
                    Decision.ALLOW, "permitted by policy and listed in role trust", *allows, trust
                )
            if allows:
                return result(
                    Decision.NOT_ALLOWED,
                    "permitted by policy but not listed in the role's trust",
                    *allows,
                )
            if trusted:
                return result(
                    Decision.NOT_ALLOWED,
                    "listed in role trust but no policy grants the permission",
                    trust,
                )
            return result(Decision.NOT_ALLOWED, "no policy grants the permission")

        if allows:
            return result(Decision.ALLOW, "granted by an Allow statement", *allows)
        return result(Decision.NOT_ALLOWED, "no statement grants the action on the resource")
