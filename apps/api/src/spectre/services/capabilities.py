from importlib.metadata import version

from spectre.domain.models.scenario import SCHEMA_VERSION
from spectre.engine import ENGINE_VERSION
from spectre.schemas.api import CapabilitiesResponse, Feature, PolicySemantic

APP_NAME = "spectre-api"


def app_version() -> str:
    return version(APP_NAME)


def describe_capabilities() -> CapabilitiesResponse:
    """Hand-maintained statement of what the engine does. Update with every milestone."""
    done, planned, unsupported = "implemented", "planned", "unsupported"
    return CapabilitiesResponse(
        version=app_version(),
        engine_version=ENGINE_VERSION,
        scenario_schema_versions=[SCHEMA_VERSION],
        features=[
            Feature(
                id="scenario-validation",
                name="Scenario validation",
                status=done,
                description="Synthetic scenarios are parsed and cross-reference checked.",
            ),
            Feature(
                id="policy-evaluation",
                name="Policy evaluation",
                status=done,
                description="ALLOW, DENY, NOT_ALLOWED and UNSUPPORTED decisions with evidence.",
            ),
            Feature(
                id="graph-construction",
                name="Transition graph",
                status=done,
                description="Typed edges: inventory, authorized, prerequisite, rejected.",
            ),
            Feature(
                id="path-discovery",
                name="Attack-path discovery",
                status=done,
                description="Bounded search; every step cites its evidence.",
            ),
            Feature(
                id="remediation-simulation",
                name="Remediation simulation",
                status=done,
                description="Changes apply to a copy; compares paths and legitimate access.",
            ),
            Feature(
                id="analysis-history",
                name="Analysis history",
                status=done,
                description="Runs are stored in SQLite.",
            ),
        ],
        policy_semantics=[
            PolicySemantic(
                id="identity-allow",
                name="Identity policy Allow",
                status=done,
                description="Statements attached to a principal or role.",
            ),
            PolicySemantic(
                id="identity-deny",
                name="Identity policy explicit Deny",
                status=done,
                description="An explicit Deny overrides any Allow.",
            ),
            PolicySemantic(
                id="wildcard-matching",
                name="Action and resource wildcards",
                status=done,
                description="'*' and trailing-'*' prefix matching only; case-sensitive.",
            ),
            PolicySemantic(
                id="role-assumption",
                name="Role assumption",
                status=done,
                description="Requires both an Allow on the caller and a trust entry.",
            ),
            PolicySemantic(
                id="credential-access",
                name="Modeled credential access",
                status=done,
                description="Reading a secret opens only its declared relationships.",
            ),
            PolicySemantic(
                id="conditions",
                name="Condition blocks",
                status=unsupported,
                description="Scenarios containing conditions are rejected.",
            ),
            PolicySemantic(
                id="boundaries",
                name="SCPs, permission boundaries, session policies",
                status=unsupported,
                description="Not modeled.",
            ),
            PolicySemantic(
                id="resource-policies",
                name="Resource-based policies",
                status=unsupported,
                description="Only role trust is modeled.",
            ),
            PolicySemantic(
                id="resource-types",
                name="Actions checked against resource type",
                status=planned,
                description="Actions are matched by pattern only.",
            ),
        ],
    )
