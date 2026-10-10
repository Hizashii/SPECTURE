from typing import Annotated

from fastapi import APIRouter, Query

from spectre.api.dependencies import CatalogDep, SessionDep
from spectre.api.errors import ApiError
from spectre.engine.remediation import InvalidChange
from spectre.persistence.models import SimulationRun
from spectre.schemas.analysis import (
    SimulationList,
    SimulationOut,
    SimulationRequest,
    SimulationSummary,
)
from spectre.schemas.api import ErrorResponse
from spectre.services import runs
from spectre.services.scenarios import ScenarioInvalid, ScenarioNotFound

router = APIRouter(prefix="/simulations", tags=["simulations"])


def _out(run: SimulationRun) -> SimulationOut:
    return SimulationOut(
        id=run.id,
        scenario_id=run.scenario_id,
        engine_version=run.engine_version,
        created_at=run.created_at,
        **run.payload,
    )


@router.post(
    "",
    status_code=201,
    summary="Apply changes to a copy of a scenario and compare the results",
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def create_simulation(
    body: SimulationRequest, session: SessionDep, catalog: CatalogDep
) -> SimulationOut:
    try:
        run = runs.run_simulation(
            session, catalog, body.scenario_id, [c.to_engine() for c in body.changes]
        )
    except ScenarioNotFound:
        raise ApiError(
            404, "scenario_not_found", f"Scenario '{body.scenario_id}' does not exist."
        ) from None
    except ScenarioInvalid as exc:
        raise ApiError(422, "scenario_invalid", "Scenario failed validation.", exc.reason) from exc
    except InvalidChange as exc:
        raise ApiError(422, "invalid_change", str(exc)) from exc
    return _out(run)


@router.get("", summary="List stored simulations, newest first")
def list_simulations(
    session: SessionDep,
    scenario_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> SimulationList:
    return SimulationList(
        items=[
            SimulationSummary(
                id=r.id,
                scenario_id=r.scenario_id,
                created_at=r.created_at,
                verdict=r.verdict,
                change_count=len(r.payload["diffs"]),
            )
            for r in runs.list_simulations(session, scenario_id, limit)
        ]
    )


@router.get(
    "/{simulation_id}", summary="A stored simulation", responses={404: {"model": ErrorResponse}}
)
def get_simulation(simulation_id: str, session: SessionDep) -> SimulationOut:
    try:
        return _out(runs.get_simulation(session, simulation_id))
    except runs.SimulationNotFound:
        raise ApiError(
            404, "simulation_not_found", f"Simulation '{simulation_id}' does not exist."
        ) from None
