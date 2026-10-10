from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from spectre.api.dependencies import CatalogDep, SessionDep
from spectre.api.errors import ApiError
from spectre.persistence.models import AnalysisRun
from spectre.schemas.analysis import (
    AnalysisDetail,
    AnalysisList,
    AnalysisRequest,
    AnalysisSummary,
    FindingList,
    Graph,
)
from spectre.schemas.api import ErrorResponse
from spectre.services import runs
from spectre.services.scenarios import ScenarioInvalid, ScenarioNotFound

router = APIRouter(prefix="/analyses", tags=["analyses"])
NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse}}


def _summary(run: AnalysisRun) -> AnalysisSummary:
    return AnalysisSummary(
        id=run.id,
        scenario_id=run.scenario_id,
        engine_version=run.engine_version,
        created_at=run.created_at,
        finding_count=run.finding_count,
        objectives_violated=run.objectives_violated,
        truncated=run.truncated,
    )


def _load(session: Session, analysis_id: str) -> AnalysisRun:
    try:
        return runs.get_analysis(session, analysis_id)
    except runs.AnalysisNotFound:
        raise ApiError(
            404, "analysis_not_found", f"Analysis '{analysis_id}' does not exist."
        ) from None


@router.post(
    "",
    status_code=201,
    summary="Run the engine on a scenario and store the result",
    responses={**NOT_FOUND, 422: {"model": ErrorResponse}},
)
def create_analysis(
    body: AnalysisRequest, session: SessionDep, catalog: CatalogDep
) -> AnalysisSummary:
    try:
        return _summary(runs.run_analysis(session, catalog, body.scenario_id))
    except ScenarioNotFound:
        raise ApiError(
            404, "scenario_not_found", f"Scenario '{body.scenario_id}' does not exist."
        ) from None
    except ScenarioInvalid as exc:
        raise ApiError(422, "scenario_invalid", "Scenario failed validation.", exc.reason) from exc


@router.get("", summary="List stored analyses, newest first")
def list_analyses(
    session: SessionDep,
    scenario_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AnalysisList:
    return AnalysisList(
        items=[_summary(r) for r in runs.list_analyses(session, scenario_id, limit)]
    )


@router.get(
    "/{analysis_id}", summary="Analysis summary, objectives and limits", responses=NOT_FOUND
)
def get_analysis(analysis_id: str, session: SessionDep) -> AnalysisDetail:
    run = _load(session, analysis_id)
    p = run.payload
    return AnalysisDetail(
        **_summary(run).model_dump(),
        objectives=p["objectives"],
        legitimate_access=p["legitimate_access"],
        limits=p["limits"],
    )


@router.get(
    "/{analysis_id}/graph", summary="Typed transition graph with evidence", responses=NOT_FOUND
)
def get_graph(analysis_id: str, session: SessionDep) -> Graph:
    return Graph.model_validate(_load(session, analysis_id).payload["graph"])


@router.get(
    "/{analysis_id}/findings", summary="Findings with step-by-step evidence", responses=NOT_FOUND
)
def get_findings(analysis_id: str, session: SessionDep) -> FindingList:
    return FindingList.model_validate({"items": _load(session, analysis_id).payload["findings"]})
