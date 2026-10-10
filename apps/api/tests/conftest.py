import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from spectre.core.config import Settings, get_settings
from spectre.main import app
from spectre.persistence.db import get_engine

REPO_SCENARIOS = Path(__file__).resolve().parents[3] / "scenarios"


@pytest.fixture(autouse=True)
def _isolated_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Tests never read the developer's SPECTRE_* variables or a local .env file."""
    import os

    for key in [k for k in os.environ if k.startswith("SPECTRE_")]:
        monkeypatch.delenv(key)
    get_settings.cache_clear()
    get_engine.cache_clear()
    yield
    get_settings.cache_clear()
    get_engine.cache_clear()


def make_settings(**kw: Any) -> Settings:
    return Settings(_env_file=None, **kw)


@pytest.fixture
def scenarios_dir(tmp_path: Path) -> Path:
    return tmp_path


@pytest.fixture
def client(scenarios_dir: Path) -> Iterator[TestClient]:
    app.dependency_overrides[get_settings] = lambda: make_settings(scenarios_dir=scenarios_dir)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def real_client() -> Iterator[TestClient]:
    """Client against the repository's real scenarios/ directory."""
    app.dependency_overrides[get_settings] = lambda: make_settings(scenarios_dir=REPO_SCENARIOS)
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def db_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """Real scenarios and a real SQLite file migrated with Alembic."""
    from spectre.persistence.migrate import upgrade_to_head

    url = f"sqlite:///{tmp_path / 'spectre.db'}"
    monkeypatch.setenv("SPECTRE_DATABASE_URL", url)
    get_settings.cache_clear()
    upgrade_to_head()
    app.dependency_overrides[get_settings] = lambda: make_settings(
        scenarios_dir=REPO_SCENARIOS, database_url=url
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


def write_scenario(root: Path, scenario_id: str, doc: dict) -> None:  # type: ignore[type-arg]
    (root / scenario_id).mkdir()
    (root / scenario_id / "scenario.json").write_text(json.dumps(doc), encoding="utf-8")
