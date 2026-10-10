from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from spectre.core.config import Settings, get_settings
from spectre.persistence.db import session_for
from spectre.services.scenarios import ScenarioCatalog

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_catalog(settings: SettingsDep) -> ScenarioCatalog:
    return ScenarioCatalog(settings.scenarios_dir, settings.max_scenario_bytes)


CatalogDep = Annotated[ScenarioCatalog, Depends(get_catalog)]


def get_session(settings: SettingsDep) -> Iterator[Session]:
    yield from session_for(settings.database_url)


SessionDep = Annotated[Session, Depends(get_session)]
