from dataclasses import dataclass
from typing import Literal

from spectre.domain.models import Scenario
from spectre.engine.analysis import AccessCheck, AnalysisResult, AttackPath, SearchLimits, analyze
from spectre.engine.remediation.changes import Change, ChangeDiff, apply_changes

Verdict = Literal[
    "effective",  # no objective violated, no finding left, nothing legitimate broken
    "partial",  # some paths resolved, others remain
    "ineffective",  # nothing resolved
    "breaks_legitimate_access",  # a check that passed before fails after (takes precedence)
    "introduces_findings",  # the change opened a new finding
    "inconclusive",  # looks fixed but the search hit a limit, so it cannot be certified
    "nothing_to_remediate",  # the baseline had no findings or violated objectives
]

NOTES = (
    "Evaluated against the documented IAM-like subset only; real AWS controls "
    "(SCPs, permission boundaries, conditions, resource policies) are not modeled.",
    "A path that is absent here is absent under these rules, not proven unreachable in AWS.",
)


@dataclass(frozen=True)
class SimulationResult:
    changes: tuple[Change, ...]
    diffs: tuple[ChangeDiff, ...]
    before: AnalysisResult
    after: AnalysisResult
    resolved_findings: tuple[str, ...]
    remaining_findings: tuple[str, ...]
    new_findings: tuple[str, ...]
    removed_paths: tuple[AttackPath, ...]
    new_paths: tuple[AttackPath, ...]
    broken_legitimate_access: tuple[AccessCheck, ...]
    verdict: Verdict
    notes: tuple[str, ...] = NOTES


def _signatures(r: AnalysisResult) -> dict[tuple[str, ...], AttackPath]:
    return {tuple(s.id for s in p.steps): p for f in r.findings for p in f.paths}


def simulate(
    scenario: Scenario, changes: list[Change], limits: SearchLimits | None = None
) -> SimulationResult:
    """Applies ``changes`` to a copy, re-analyzes, and compares with the baseline."""
    modified, diffs = apply_changes(scenario, changes)
    before, after = analyze(scenario, limits), analyze(modified, limits)

    ids_before = {f.id for f in before.findings}
    ids_after = {f.id for f in after.findings}
    sig_before, sig_after = _signatures(before), _signatures(after)
    passed_before = {c.id for c in before.legitimate_access if c.passes}
    broken = tuple(c for c in after.legitimate_access if c.id in passed_before and not c.passes)
    removed = tuple(p for k, p in sig_before.items() if k not in sig_after)
    added = tuple(p for k, p in sig_after.items() if k not in sig_before)
    resolved = tuple(sorted(ids_before - ids_after))
    new = tuple(sorted(ids_after - ids_before))
    remaining = tuple(sorted(ids_before & ids_after))
    violated_after = any(o.status == "violated" for o in after.objectives)
    violated_before = any(o.status == "violated" for o in before.objectives)

    verdict: Verdict
    if broken:
        verdict = "breaks_legitimate_access"
    elif new:
        verdict = "introduces_findings"
    elif not ids_before and not violated_before:
        # A baseline cut short by a search limit cannot show that nothing needs fixing.
        verdict = "inconclusive" if before.truncated else "nothing_to_remediate"
    elif ids_after or violated_after:
        verdict = "partial" if resolved or removed else "ineffective"
    elif after.truncated:
        verdict = "inconclusive"
    else:
        verdict = "effective"

    return SimulationResult(
        changes=tuple(changes),
        diffs=diffs,
        before=before,
        after=after,
        resolved_findings=resolved,
        remaining_findings=remaining,
        new_findings=new,
        removed_paths=removed,
        new_paths=added,
        broken_legitimate_access=broken,
        verdict=verdict,
    )
