from pathlib import Path

from alembic import command
from sqlalchemy import inspect

from spectre.persistence.db import get_engine
from spectre.persistence.migrate import alembic_config


def test_migrations_upgrade_and_downgrade_cleanly(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    url = f"sqlite:///{tmp_path / 'm.db'}"
    monkeypatch.setenv("SPECTRE_DATABASE_URL", url)
    cfg = alembic_config()
    command.upgrade(cfg, "head")
    tables = set(inspect(get_engine(url)).get_table_names())
    assert {"analysis_runs", "simulation_runs"} <= tables
    command.downgrade(cfg, "base")
    assert not (
        {"analysis_runs", "simulation_runs"} & set(inspect(get_engine(url)).get_table_names())
    )


def test_models_and_migration_agree(tmp_path: Path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Autogenerate against a migrated database must find nothing to change."""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from spectre.persistence import models  # noqa: F401
    from spectre.persistence.db import Base

    url = f"sqlite:///{tmp_path / 'd.db'}"
    monkeypatch.setenv("SPECTRE_DATABASE_URL", url)
    command.upgrade(alembic_config(), "head")
    with get_engine(url).connect() as conn:
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []
