from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

from spectre.engine.policy import Decision, Evidence


class EdgeKind(StrEnum):
    INVENTORY = "inventory"  # a structural fact; never part of a path
    AUTHORIZED = "authorized"  # backed by an ALLOW decision
    PREREQUISITE = "prerequisite"  # a scenario-modeled transition (e.g. credential access)
    REJECTED = "rejected"  # evaluated: DENY, or only partially granted
    UNSUPPORTED = "unsupported"  # depends on semantics outside the subset


@dataclass(frozen=True)
class GraphNode:
    id: str
    name: str
    kind: str  # user | service | role | database | object_storage | secret | compute
    group: Literal["principal", "role", "resource"]
    sensitivity: str | None = None


@dataclass(frozen=True)
class GraphEdge:
    id: str
    source: str
    target: str
    kind: EdgeKind
    label: str
    actions: tuple[str, ...] = ()
    decision: Decision | None = None
    reason: str = ""
    evidence: tuple[Evidence, ...] = ()

    @property
    def traversable(self) -> bool:
        return self.kind in (EdgeKind.AUTHORIZED, EdgeKind.PREREQUISITE)


@dataclass(frozen=True)
class TransitionGraph:
    nodes: tuple[GraphNode, ...]
    edges: tuple[GraphEdge, ...]
