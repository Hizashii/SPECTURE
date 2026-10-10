"""API transport schemas. Domain models live in spectre.domain and never depend on these."""

from typing import Any, Literal

from pydantic import BaseModel

from spectre.domain.models import Scenario


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str


class ScenarioSummary(BaseModel):
    id: str
    name: str
    description: str
    intended_outcome: str
    schema_version: str
    principal_count: int
    role_count: int
    resource_count: int
    policy_count: int
    objective_count: int

    @classmethod
    def from_scenario(cls, s: Scenario) -> "ScenarioSummary":
        return cls(
            id=s.metadata.id,
            name=s.metadata.name,
            description=s.metadata.description,
            intended_outcome=s.metadata.intended_outcome,
            schema_version=s.schema_version,
            principal_count=len(s.principals),
            role_count=len(s.roles),
            resource_count=len(s.resources),
            policy_count=len(s.policies),
            objective_count=len(s.objectives),
        )


class InvalidScenario(BaseModel):
    id: str
    error: str


class ScenarioListResponse(BaseModel):
    items: list[ScenarioSummary]
    invalid: list[InvalidScenario]


class Feature(BaseModel):
    id: str
    name: str
    status: Literal["implemented", "not_implemented"]
    description: str


class PolicySemantic(BaseModel):
    id: str
    name: str
    status: Literal["implemented", "planned", "unsupported"]
    description: str


class CapabilitiesResponse(BaseModel):
    version: str
    engine_version: str | None
    scenario_schema_versions: list[str]
    features: list[Feature]
    policy_semantics: list[PolicySemantic]
