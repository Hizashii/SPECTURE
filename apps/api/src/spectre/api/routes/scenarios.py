from fastapi import APIRouter

from spectre.api.dependencies import CatalogDep
from spectre.api.errors import ApiError
from spectre.domain.models import Scenario
from spectre.schemas.api import (
    ErrorResponse,
    InvalidScenario,
    ScenarioListResponse,
    ScenarioSummary,
)
from spectre.services.scenarios import ScenarioInvalid, ScenarioNotFound

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", summary="List scenario metadata")
def list_scenarios(catalog: CatalogDep) -> ScenarioListResponse:
    listing = catalog.list()
    return ScenarioListResponse(
        items=[ScenarioSummary.from_scenario(s) for s in listing.scenarios],
        invalid=[InvalidScenario(id=i.id, error=i.error) for i in listing.invalid],
    )


# The scenario document is a versioned public format (schema_version), so it is returned as is.
@router.get(
    "/{scenario_id}",
    summary="Get a validated scenario",
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def get_scenario(scenario_id: str, catalog: CatalogDep) -> Scenario:
    try:
        return catalog.get(scenario_id)
    except ScenarioNotFound:
        raise ApiError(
            404, "scenario_not_found", f"Scenario '{scenario_id}' does not exist."
        ) from None
    except ScenarioInvalid as exc:
        raise ApiError(
            500, "scenario_invalid", f"Scenario '{scenario_id}' failed validation.", exc.reason
        ) from exc
