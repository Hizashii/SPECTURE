"""ScenarioCatalog is plain Python: no FastAPI, no HTTP types."""

import json
from pathlib import Path

import pytest

from spectre.services.scenarios import ScenarioCatalog, ScenarioInvalid, ScenarioNotFound
from tests.unit.test_scenario_model import minimal

MAX = 100_000


def put(root: Path, scenario_id: str, text: str | None = None) -> Path:
    (root / scenario_id).mkdir()
    f = root / scenario_id / "scenario.json"
    f.write_text(
        text
        if text is not None
        else json.dumps(
            minimal()
            | {
                "metadata": {
                    "id": scenario_id,
                    "name": "N",
                    "description": "d",
                    "intended_outcome": "o",
                }
            }
        )
    )
    return f


def catalog(root: Path, max_bytes: int = MAX) -> ScenarioCatalog:
    return ScenarioCatalog(root, max_bytes)


def test_lists_valid_scenarios_as_domain_objects(tmp_path: Path) -> None:
    put(tmp_path, "demo")
    listing = catalog(tmp_path).list()
    assert [s.metadata.id for s in listing.scenarios] == ["demo"]
    assert listing.invalid == []


def test_get_returns_the_scenario_and_unknown_ids_raise(tmp_path: Path) -> None:
    put(tmp_path, "demo")
    assert catalog(tmp_path).get("demo").metadata.id == "demo"
    with pytest.raises(ScenarioNotFound):
        catalog(tmp_path).get("nope")


def test_deeply_nested_json_is_reported_not_fatal(tmp_path: Path) -> None:
    put(tmp_path, "good")
    put(tmp_path, "bomb", "[" * 50_000)
    listing = catalog(tmp_path).list()
    assert [s.metadata.id for s in listing.scenarios] == ["good"]
    assert [i.id for i in listing.invalid] == ["bomb"]


def test_get_of_invalid_scenario_raises_invalid(tmp_path: Path) -> None:
    put(tmp_path, "bad", "{}")
    with pytest.raises(ScenarioInvalid):
        catalog(tmp_path).get("bad")


def test_size_cap_applies_to_what_is_read_not_to_a_prior_stat(tmp_path: Path) -> None:
    put(tmp_path, "big", " " * 2_000)
    listing = catalog(tmp_path, max_bytes=1_000).list()
    assert "exceeds" in listing.invalid[0].error


def test_symlinked_scenario_file_is_ignored(tmp_path: Path) -> None:
    secret = tmp_path.parent / "elsewhere.json"
    secret.write_text(json.dumps(minimal()))
    (tmp_path / "linked").mkdir()
    (tmp_path / "linked" / "scenario.json").symlink_to(secret)
    assert catalog(tmp_path).list().scenarios == []
    with pytest.raises(ScenarioNotFound):
        catalog(tmp_path).get("linked")


def test_error_text_is_capped_and_free_of_scenario_controlled_bulk(tmp_path: Path) -> None:
    doc = minimal() | {f"extra_{'x' * 200}_{i}": 1 for i in range(50)}
    put(tmp_path, "noisy", json.dumps(doc))
    err = catalog(tmp_path).list().invalid[0].error
    assert len(err) <= 500


def test_unreadable_file_does_not_leak_the_path(tmp_path: Path) -> None:
    f = put(tmp_path, "locked")
    f.chmod(0)
    try:
        err = catalog(tmp_path).list().invalid[0].error
    finally:
        f.chmod(0o644)
    assert str(tmp_path) not in err


def test_id_must_match_directory(tmp_path: Path) -> None:
    put(tmp_path, "demo")
    (tmp_path / "demo" / "scenario.json").write_text(json.dumps(minimal()))  # metadata.id == "demo"
    (tmp_path / "other").mkdir()
    (tmp_path / "other" / "scenario.json").write_text(json.dumps(minimal()))
    assert [i.id for i in catalog(tmp_path).list().invalid] == ["other"]
