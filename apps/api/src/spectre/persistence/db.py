"""SQLAlchemy boundary. Only this module and the Alembic env know the database URL scheme."""

from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session

from spectre.core.config import get_settings


class Base(DeclarativeBase):
    pass


@lru_cache
def get_engine(url: str) -> Engine:
    is_sqlite = url.startswith("sqlite")
    # check_same_thread is a SQLite-only setting needed because FastAPI uses a threadpool.
    args = {"check_same_thread": False} if is_sqlite else {}
    if is_sqlite and (db_file := make_url(url).database):
        Path(db_file).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, connect_args=args)


def make_engine() -> Engine:
    """The engine for the configured database (used by Alembic)."""
    return get_engine(get_settings().database_url)


def session_for(url: str) -> Iterator[Session]:
    with Session(get_engine(url), expire_on_commit=False) as session:
        yield session
