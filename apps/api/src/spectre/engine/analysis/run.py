from spectre.domain.models import Scenario
from spectre.engine.analysis.model import (
    AccessCheck,
    AnalysisResult,
    Finding,
    ObjectiveResult,
    SearchLimits,
)
from spectre.engine.analysis.paths import search, severity_for
from spectre.engine.graph import build_graph
from spectre.engine.policy import Decision, PolicyEvaluator

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def analyze(scenario: Scenario, limits: SearchLimits | None = None) -> AnalysisResult:
    """Deterministic: the same scenario and limits always produce an equal result."""
    limits = limits or SearchLimits()
    evaluator = PolicyEvaluator(scenario)
    graph = build_graph(scenario, evaluator)

    sensitivity = {r.id: r.sensitivity for r in scenario.resources}
    objective_targets = {o.target for o in scenario.objectives}
    targets = {rid for rid, s in sensitivity.items() if s in ("restricted", "confidential")}
    targets |= objective_targets
    sources = [p.id for p in scenario.principals] + [o.principal for o in scenario.objectives]
    outcome = search(graph, sources, targets, limits)

    violated: dict[tuple[str, str], list[str]] = {}
    for o in scenario.objectives:
        violated.setdefault((o.principal, o.target), []).append(o.id)

    findings = tuple(
        sorted(
            (
                Finding(
                    id=f"finding:{src}>{tgt}",
                    source=src,
                    target=tgt,
                    severity=severity_for(sensitivity[tgt]),
                    paths=tuple(paths),
                    truncated=(src, tgt) in outcome.truncated_pairs,
                    violated_objectives=tuple(violated.get((src, tgt), ())),
                )
                for (src, tgt), paths in outcome.paths.items()
            ),
            key=lambda f: (_SEVERITY_ORDER[f.severity], f.id),
        )
    )
    by_pair = {(f.source, f.target): f for f in findings}

    objectives = tuple(
        ObjectiveResult(
            objective_id=o.id,
            principal=o.principal,
            target=o.target,
            status="violated" if (o.principal, o.target) in by_pair else "satisfied",
            finding_id=by_pair[(o.principal, o.target)].id
            if (o.principal, o.target) in by_pair
            else None,
            search_truncated=outcome.truncated,
        )
        for o in scenario.objectives
    )

    legit = []
    for a in scenario.legitimate_access:
        d = evaluator.evaluate(a.principal, a.action, a.resource)
        legit.append(
            AccessCheck(a.id, a.principal, a.action, a.resource, d.decision is Decision.ALLOW, d)
        )

    return AnalysisResult(
        scenario_id=scenario.metadata.id,
        graph=graph,
        findings=findings,
        objectives=objectives,
        legitimate_access=tuple(legit),
        limits=limits,
        truncated=outcome.truncated,
    )
