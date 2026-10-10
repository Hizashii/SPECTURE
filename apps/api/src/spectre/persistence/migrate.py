from pathlib import Path

from alembic import command
from alembic.config import Config

MIGRATIONS = Path(__file__).parent / "migrations"


def alembic_config() -> Config:
    cfg = Config()  # no alembic.ini needed: migrations ship inside the package
    cfg.set_main_option("script_location", str(MIGRATIONS))
    return cfg


def upgrade_to_head() -> None:
    """Applies pending migrations to the database named by SPECTRE_DATABASE_URL."""
    command.upgrade(alembic_config(), "head")
