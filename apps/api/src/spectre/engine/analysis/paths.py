"""Bounded path search over traversable transitions (see README, "Graph and paths").

Only AUTHORIZED and PREREQUISITE edges are followed. A path never revisits a node, so cycles
cannot loop; depth, per-pair path count and total expansions are capped, and hitting any cap
is reported rather than hidden. Shortest-path length is not used as a risk measure.
"""

from collections import defaultdict
from dataclasses import dataclass, field

from spectre.engine.analysis.model import AttackPath, SearchLimits, Severity
from spectre.engine.graph import GraphEdge, TransitionGraph

_SEVERITY = {
    "restricted": Severity.CRITICAL,
    "confidential": Severity.HIGH,
    "internal": Severity.MEDIUM,
    "public": Severity.LOW,
}


def severity_for(sensitivity: str) -> Severity:
    return _SEVERITY[sensitivity]


@dataclass
class SearchOutcome:
    paths: dict[tuple[str, str], list[AttackPath]] = field(default_factory=dict)
    truncated_pairs: set[tuple[str, str]] = field(default_factory=set)
    truncated: bool = False


def search(
    graph: TransitionGraph, sources: list[str], targets: set[str], limits: SearchLimits
) -> SearchOutcome:
    out_edges: dict[str, list[GraphEdge]] = defaultdict(list)
    for e in graph.edges:
        if e.traversable:
            out_edges[e.source].append(e)

    outcome = SearchOutcome()
    expansions = 0

    def walk(source: str, node: str, steps: tuple[GraphEdge, ...], seen: frozenset[str]) -> None:
        nonlocal expansions
        for edge in out_edges.get(node, ()):
            if edge.target in seen:
                continue
            if expansions >= limits.max_expansions:
                outcome.truncated = True
                return
            expansions += 1
            if len(steps) + 1 > limits.max_depth:
                outcome.truncated = True
                continue
            path = (*steps, edge)
            if edge.target in targets:
                pair = (source, edge.target)
                found = outcome.paths.setdefault(pair, [])
                if len(found) < limits.max_paths_per_pair:
                    found.append(AttackPath(source, edge.target, path))
                else:
                    outcome.truncated_pairs.add(pair)
                    outcome.truncated = True
            walk(source, edge.target, path, seen | {edge.target})

    for source in sorted(set(sources)):
        walk(source, source, (), frozenset({source}))
    return outcome
