from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from spectre.engine import ENGINE_VERSION
from spectre.engine.graph import GraphEdge, TransitionGraph
from spectre.engine.policy import AuthorizationDecision


class Severity(StrEnum):
    """Assigned only from the target's declared sensitivity (see README, "Graph and paths")."""

    CRITICAL = "critical"  # restricted
    HIGH = "high"  # confidential
    MEDIUM = "medium"  # internal (only when a security objective names the target)
    LOW = "low"  # public (same)


@dataclass(frozen=True)
class SearchLimits:
    max_depth: int = 8  # maximum number of transitions in one path
    max_paths_per_pair: int = 20
    max_expansions: int = 20_000  # total edges examined across the whole search


@dataclass(frozen=True)
class AttackPath:
    source: str
    target: str
    steps: tuple[GraphEdge, ...]

    @property
    def nodes(self) -> tuple[str, ...]:
        return (self.source, *(s.target for s in self.steps))


@dataclass(frozen=True)
class Finding:
    id: str
    source: str
    target: str
    severity: Severity
    paths: tuple[AttackPath, ...]
    truncated: bool  # more paths may exist than are listed
    violated_objectives: tuple[str, ...] = ()


@dataclass(frozen=True)
class ObjectiveResult:
    objective_id: str
    principal: str
    target: str
    status: Literal["violated", "satisfied"]
    finding_id: str | None
    # "satisfied" only means no path was found within the limits and modeled subset.
    search_truncated: bool = False


@dataclass(frozen=True)
class AccessCheck:
    id: str
    principal: str
    action: str
    resource: str
    passes: bool
    decision: AuthorizationDecision


@dataclass(frozen=True)
class AnalysisResult:
    scenario_id: str
    graph: TransitionGraph
    findings: tuple[Finding, ...]
    objectives: tuple[ObjectiveResult, ...]
    legitimate_access: tuple[AccessCheck, ...]
    limits: SearchLimits
    truncated: bool
    engine_version: str = ENGINE_VERSION
