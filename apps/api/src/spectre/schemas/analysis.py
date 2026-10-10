"""Transport schemas for analyses and simulations, and the mappers from engine results.

The engine returns frozen dataclasses; ``model_validate(asdict(...))`` is the single, explicit
boundary where they become wire/storage JSON.
"""

from dataclasses import asdict
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from spectre.domain.models.scenario import ActionPattern, EntityId, ResourcePattern
from spectre.engine import analysis as eng
from spectre.engine import remediation as rem

Decision = Literal["ALLOW", "DENY", "NOT_ALLOWED", "UNSUPPORTED"]


# --- evidence, graph, findings ---------------------------------------------------------------


class StatementEvidence(BaseModel):
    kind: Literal["statement"]
    policy_id: str
    sid: str
    effect: Literal["Allow", "Deny"]


class TrustEvidence(BaseModel):
    kind: Literal["trust"]
    role_id: str
    identity_id: str


class RelationshipEvidence(BaseModel):
    kind: Literal["relationship"]
    relationship_id: str


Evidence = Annotated[
    StatementEvidence | TrustEvidence | RelationshipEvidence, Field(discriminator="kind")
]


class GraphNode(BaseModel):
    id: str
    name: str
    kind: str
    group: Literal["principal", "role", "resource"]
    sensitivity: str | None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    kind: Literal["inventory", "authorized", "prerequisite", "rejected", "unsupported"]
    label: str
    actions: list[str]
    decision: Decision | None
    reason: str
    evidence: list[Evidence]


class Graph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class AttackPath(BaseModel):
    source: str
    target: str
    steps: list[GraphEdge]


class Finding(BaseModel):
    id: str
    source: str
    target: str
    severity: Literal["critical", "high", "medium", "low"]
    paths: list[AttackPath]
    truncated: bool
    violated_objectives: list[str]


class ObjectiveResult(BaseModel):
    objective_id: str
    principal: str
    target: str
    status: Literal["violated", "satisfied"]
    finding_id: str | None
    search_truncated: bool


class AuthorizationDecision(BaseModel):
    decision: Decision
    reason: str
    evidence: list[Evidence]


class AccessCheck(BaseModel):
    id: str
    principal: str
    action: str
    resource: str
    passes: bool
    decision: AuthorizationDecision


class Limits(BaseModel):
    max_depth: int
    max_paths_per_pair: int
    max_expansions: int


# --- analyses --------------------------------------------------------------------------------


class AnalysisPayload(BaseModel):
    """Everything persisted for a run (the JSON column)."""

    graph: Graph
    findings: list[Finding]
    objectives: list[ObjectiveResult]
    legitimate_access: list[AccessCheck]
    limits: Limits
    truncated: bool


class AnalysisSummary(BaseModel):
    id: str
    scenario_id: str
    engine_version: str
    created_at: datetime
    finding_count: int
    objectives_violated: int
    truncated: bool


class AnalysisDetail(AnalysisSummary):
    objectives: list[ObjectiveResult]
    legitimate_access: list[AccessCheck]
    limits: Limits


class AnalysisList(BaseModel):
    items: list[AnalysisSummary]


class FindingList(BaseModel):
    items: list[Finding]


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: EntityId


def analysis_payload(result: eng.AnalysisResult) -> AnalysisPayload:
    return AnalysisPayload.model_validate(asdict(result))


# --- simulations -----------------------------------------------------------------------------


class _Change(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RemoveStatementIn(_Change):
    kind: Literal["remove_statement"]
    policy_id: EntityId
    sid: EntityId

    def to_engine(self) -> rem.Change:
        return rem.RemoveStatement(self.policy_id, self.sid)


class ReplaceStatementIn(_Change):
    kind: Literal["replace_statement"]
    policy_id: EntityId
    sid: EntityId
    effect: Literal["Allow", "Deny"]
    actions: list[ActionPattern] = Field(min_length=1, max_length=20)
    resources: list[ResourcePattern] = Field(min_length=1, max_length=20)

    def to_engine(self) -> rem.Change:
        return rem.ReplaceStatement(
            self.policy_id, self.sid, self.effect, list(self.actions), list(self.resources)
        )


class RemoveTrustIn(_Change):
    kind: Literal["remove_trust"]
    role_id: EntityId
    identity_id: EntityId

    def to_engine(self) -> rem.Change:
        return rem.RemoveTrust(self.role_id, self.identity_id)


class DetachPolicyIn(_Change):
    kind: Literal["detach_policy"]
    policy_id: EntityId
    identity_id: EntityId

    def to_engine(self) -> rem.Change:
        return rem.DetachPolicy(self.policy_id, self.identity_id)


ChangeIn = Annotated[
    RemoveStatementIn | ReplaceStatementIn | RemoveTrustIn | DetachPolicyIn,
    Field(discriminator="kind"),
]

MAX_CHANGES = 25


class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario_id: EntityId
    changes: list[ChangeIn] = Field(min_length=1, max_length=MAX_CHANGES)


class ChangeDiff(BaseModel):
    target: str
    change: ChangeIn
    before: dict[str, Any] | None
    after: dict[str, Any] | None


class SimulationSide(BaseModel):
    finding_count: int
    findings: list[Finding]
    objectives: list[ObjectiveResult]
    legitimate_access: list[AccessCheck]
    truncated: bool


class SimulationPayload(BaseModel):
    """Everything persisted for a simulation (the JSON column)."""

    diffs: list[ChangeDiff]
    before: SimulationSide
    after: SimulationSide
    resolved_findings: list[str]
    remaining_findings: list[str]
    new_findings: list[str]
    removed_paths: list[AttackPath]
    new_paths: list[AttackPath]
    broken_legitimate_access: list[AccessCheck]
    verdict: Literal[
        "effective",
        "partial",
        "ineffective",
        "breaks_legitimate_access",
        "introduces_findings",
        "inconclusive",
        "nothing_to_remediate",
    ]
    notes: list[str]


class SimulationOut(SimulationPayload):
    id: str
    scenario_id: str
    engine_version: str
    created_at: datetime


class SimulationSummary(BaseModel):
    id: str
    scenario_id: str
    created_at: datetime
    verdict: str
    change_count: int


class SimulationList(BaseModel):
    items: list[SimulationSummary]


def _side(r: eng.AnalysisResult) -> dict[str, Any]:
    d = asdict(r)
    return {
        "finding_count": len(r.findings),
        "findings": d["findings"],
        "objectives": d["objectives"],
        "legitimate_access": d["legitimate_access"],
        "truncated": r.truncated,
    }


def simulation_payload(sim: rem.SimulationResult) -> SimulationPayload:
    d = asdict(sim)
    return SimulationPayload.model_validate(
        {
            **{
                k: d[k]
                for k in (
                    "diffs",
                    "resolved_findings",
                    "remaining_findings",
                    "new_findings",
                    "removed_paths",
                    "new_paths",
                    "broken_legitimate_access",
                    "verdict",
                    "notes",
                )
            },
            "before": _side(sim.before),
            "after": _side(sim.after),
        }
    )
