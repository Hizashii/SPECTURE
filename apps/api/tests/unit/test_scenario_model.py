import copy
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from spectre.domain.models import Scenario
from tests.conftest import REPO_SCENARIOS


def minimal() -> dict:  # type: ignore[type-arg]
    return {
        "schema_version": "1",
        "metadata": {"id": "demo", "name": "Demo", "description": "d", "intended_outcome": "o"},
        "principals": [{"id": "alice", "name": "Alice", "kind": "user"}],
        "roles": [{"id": "role-a", "name": "A", "trusted_identities": ["alice"]}],
        "resources": [
            {"id": "bucket", "name": "B", "kind": "object_storage", "sensitivity": "internal"}
        ],
        "policies": [
            {
                "id": "p1",
                "name": "P",
                "attached_to": ["alice"],
                "statements": [
                    {
                        "sid": "get",
                        "effect": "Allow",
                        "actions": ["s3:GetObject"],
                        "resources": ["bucket"],
                    }
                ],
            }
        ],
    }


@pytest.mark.parametrize(
    "path", sorted(REPO_SCENARIOS.glob("*/scenario.json")), ids=lambda p: p.parent.name
)
def test_shipped_fixtures_are_valid(path: Path) -> None:
    scenario = Scenario.model_validate(json.loads(path.read_text()))
    assert scenario.metadata.id == path.parent.name


def test_three_fixtures_ship() -> None:
    assert REPO_SCENARIOS.is_dir()
    assert len(list(REPO_SCENARIOS.glob("*/scenario.json"))) == 3


def test_minimal_scenario_is_valid() -> None:
    Scenario.model_validate(minimal())


def test_unsupported_schema_version_is_rejected() -> None:
    doc = minimal() | {"schema_version": "2"}
    with pytest.raises(ValidationError):
        Scenario.model_validate(doc)


def test_policy_conditions_are_rejected_not_ignored() -> None:
    doc = copy.deepcopy(minimal())
    doc["policies"][0]["statements"][0]["condition"] = {"IpAddress": {"aws:SourceIp": "10.0.0.0/8"}}
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        Scenario.model_validate(doc)


def test_invalid_effect_is_rejected() -> None:
    doc = copy.deepcopy(minimal())
    doc["policies"][0]["statements"][0]["effect"] = "Maybe"
    with pytest.raises(ValidationError):
        Scenario.model_validate(doc)


def test_empty_actions_are_rejected() -> None:
    doc = copy.deepcopy(minimal())
    doc["policies"][0]["statements"][0]["actions"] = []
    with pytest.raises(ValidationError):
        Scenario.model_validate(doc)


def test_duplicate_ids_are_rejected() -> None:
    doc = copy.deepcopy(minimal())
    doc["resources"][0]["id"] = "alice"
    with pytest.raises(ValidationError, match="duplicate ids: alice"):
        Scenario.model_validate(doc)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d["roles"][0]["trusted_identities"].append("ghost"), "unknown id 'ghost'"),
        (lambda d: d["policies"][0]["attached_to"].append("bucket"), "unknown id 'bucket'"),
        (
            lambda d: d["policies"][0]["statements"][0]["resources"].append("ghost"),
            "unknown id 'ghost'",
        ),
    ],
)
def test_dangling_references_are_rejected(mutate, message: str) -> None:  # type: ignore[no-untyped-def]
    doc = copy.deepcopy(minimal())
    mutate(doc)
    with pytest.raises(ValidationError, match=message):
        Scenario.model_validate(doc)


def test_wildcard_resource_prefix_is_accepted() -> None:
    doc = copy.deepcopy(minimal())
    doc["policies"][0]["statements"][0]["resources"] = ["buck*"]
    Scenario.model_validate(doc)


def test_malformed_ids_are_rejected() -> None:
    doc = copy.deepcopy(minimal())
    doc["principals"][0]["id"] = "../etc/passwd"
    with pytest.raises(ValidationError):
        Scenario.model_validate(doc)


def with_stmt(doc: dict, **over) -> dict:  # type: ignore[type-arg,no-untyped-def]
    doc = copy.deepcopy(doc)
    doc["policies"][0]["statements"][0].update(over)
    return doc


def test_statement_ids_are_required() -> None:
    doc = copy.deepcopy(minimal())
    del doc["policies"][0]["statements"][0]["sid"]
    with pytest.raises(ValidationError, match="sid"):
        Scenario.model_validate(doc)


def test_statement_ids_must_be_unique_within_a_policy() -> None:
    doc = copy.deepcopy(minimal())
    doc["policies"][0]["statements"].append(dict(doc["policies"][0]["statements"][0]))
    with pytest.raises(ValidationError, match="duplicate statement ids"):
        Scenario.model_validate(doc)


def test_prefix_wildcard_matching_nothing_is_rejected() -> None:
    with pytest.raises(ValidationError, match="matches no entity"):
        Scenario.model_validate(with_stmt(minimal(), resources=["pii-lak*"]))


def test_bare_star_is_always_valid() -> None:
    Scenario.model_validate(with_stmt(minimal(), resources=["*"]))


@pytest.mark.parametrize("action", ["s3:", "s3", ":Get", "S3:Get"])
def test_malformed_actions_are_rejected(action: str) -> None:
    with pytest.raises(ValidationError):
        Scenario.model_validate(with_stmt(minimal(), actions=[action]))


def rel(source: str, target: str) -> dict:  # type: ignore[type-arg]
    return {
        "id": "rel",
        "kind": "credential_access",
        "source": source,
        "target": target,
        "description": "d",
    }


def test_credential_access_must_start_at_a_secret() -> None:
    doc = copy.deepcopy(minimal())
    doc["relationships"] = [rel("bucket", "bucket")]
    with pytest.raises(ValidationError, match="must be a secret"):
        Scenario.model_validate(doc)


def test_credential_access_from_a_secret_is_valid() -> None:
    doc = copy.deepcopy(minimal())
    doc["resources"].append(
        {"id": "sec", "name": "S", "kind": "secret", "sensitivity": "restricted"}
    )
    doc["relationships"] = [rel("sec", "bucket")]
    Scenario.model_validate(doc)


def test_legitimate_assume_role_must_target_a_role() -> None:
    doc = copy.deepcopy(minimal())
    doc["legitimate_access"] = [
        {
            "id": "l",
            "principal": "alice",
            "action": "sts:AssumeRole",
            "resource": "bucket",
            "description": "d",
        }
    ]
    with pytest.raises(ValidationError, match="must target a role"):
        Scenario.model_validate(doc)


def test_dangling_relationship_legit_and_objective_references_are_rejected() -> None:
    for key, item, msg in [
        ("relationships", rel("ghost", "bucket"), "unknown id 'ghost'"),
        (
            "legitimate_access",
            {
                "id": "l",
                "principal": "ghost",
                "action": "s3:Get*",
                "resource": "bucket",
                "description": "d",
            },
            "unknown id 'ghost'",
        ),
        (
            "objectives",
            {
                "id": "o",
                "description": "d",
                "principal": "alice",
                "target": "ghost",
                "expectation": "must_be_unreachable",
            },
            "unknown id 'ghost'",
        ),
    ]:
        doc = copy.deepcopy(minimal())
        doc[key] = [item]
        with pytest.raises(ValidationError, match=msg):
            Scenario.model_validate(doc)
