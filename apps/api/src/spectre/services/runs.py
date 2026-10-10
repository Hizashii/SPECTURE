"""Running analyses and simulations and persisting the results."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from spectre.engine.analysis import analyze
from spectre.engine.remediation import Change, simulate
from spectre.persistence.models import AnalysisRun, SimulationRun
from spectre.schemas.analysis import analysis_payload, simulation_payload
from spectre.services.scenarios import ScenarioCatalog


class AnalysisNotFound(Exception):
    pass


class SimulationNotFound(Exception):
    pass


def _new_id() -> str:
    return uuid.uuid4().hex


def run_analysis(session: Session, catalog: ScenarioCatalog, scenario_id: str) -> AnalysisRun:
    """Raises ScenarioNotFound / ScenarioInvalid from the catalog."""
    result = analyze(catalog.get(scenario_id))
    payload = analysis_payload(result)
    run = AnalysisRun(
        id=_new_id(),
        scenario_id=scenario_id,
        engine_version=result.engine_version,
        finding_count=len(result.findings),
        objectives_violated=sum(o.status == "violated" for o in result.objectives),
        truncated=result.truncated,
        payload=payload.model_dump(mode="json"),
    )
    session.add(run)
    session.commit()
    return run


def get_analysis(session: Session, analysis_id: str) -> AnalysisRun:
    run = session.get(AnalysisRun, analysis_id)
    if run is None:
        raise AnalysisNotFound(analysis_id)
    return run


def list_analyses(session: Session, scenario_id: str | None, limit: int) -> list[AnalysisRun]:
    q = select(AnalysisRun).order_by(AnalysisRun.created_at.desc(), AnalysisRun.id).limit(limit)
    if scenario_id:
        q = q.where(AnalysisRun.scenario_id == scenario_id)
    return list(session.scalars(q))


def run_simulation(
    session: Session, catalog: ScenarioCatalog, scenario_id: str, changes: list[Change]
) -> SimulationRun:
    """Raises ScenarioNotFound / ScenarioInvalid / InvalidChange."""
    result = simulate(catalog.get(scenario_id), changes)
    run = SimulationRun(
        id=_new_id(),
        scenario_id=scenario_id,
        engine_version=result.after.engine_version,
        verdict=result.verdict,
        payload=simulation_payload(result).model_dump(mode="json"),
    )
    session.add(run)
    session.commit()
    return run


def get_simulation(session: Session, simulation_id: str) -> SimulationRun:
    run = session.get(SimulationRun, simulation_id)
    if run is None:
        raise SimulationNotFound(simulation_id)
    return run


def list_simulations(session: Session, scenario_id: str | None, limit: int) -> list[SimulationRun]:
    q = (
        select(SimulationRun)
        .order_by(SimulationRun.created_at.desc(), SimulationRun.id)
        .limit(limit)
    )
    if scenario_id:
        q = q.where(SimulationRun.scenario_id == scenario_id)
    return list(session.scalars(q))
