from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_scenarios_dir(start: Path) -> Path:
    """Dev convenience: the nearest ``scenarios/`` directory above ``start``.

    Deployments (Docker) set SPECTRE_SCENARIOS_DIR explicitly. When nothing is found this
    returns a cwd-relative path instead of raising, so importing the app never fails.
    """
    for parent in start.resolve().parents:
        if (parent / "scenarios").is_dir():
            return parent / "scenarios"
    return Path("scenarios")


class Settings(BaseSettings):
    """Runtime configuration. Every value can be overridden with a SPECTRE_ env var."""

    model_config = SettingsConfigDict(env_prefix="SPECTRE_", env_file=".env", extra="ignore")

    scenarios_dir: Path = Field(default_factory=lambda: find_scenarios_dir(Path(__file__)))
    database_url: str = "sqlite:///./data/spectre.db"
    # Development origins only. Production deployments should serve web and API from one origin.
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    # Scenario files are untrusted input; refuse anything larger before parsing.
    max_scenario_bytes: int = 1_000_000


@lru_cache
def get_settings() -> Settings:
    return Settings()
