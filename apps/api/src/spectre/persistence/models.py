"""Persisted records. Only runs are stored: scenarios stay as files, and graphs/findings are
kept as the JSON payload of the run that produced them, not as rows per node or edge."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from spectre.persistence.db import Base


def _now() -> datetime:
    return datetime.now(UTC)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(String(64), index=True)
    engine_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    finding_count: Mapped[int] = mapped_column(Integer)
    objectives_violated: Mapped[int] = mapped_column(Integer)
    truncated: Mapped[bool]
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    scenario_id: Mapped[str] = mapped_column(String(64), index=True)
    engine_version: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    verdict: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
