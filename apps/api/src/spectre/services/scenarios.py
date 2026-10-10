"""Scenario loading. Plain Python: no HTTP types, so a CLI or the engine tests can use it."""

import json
import logging
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from spectre.domain.models import Scenario

SCENARIO_FILE = "scenario.json"
MAX_ERROR_CHARS = 500
log = logging.getLogger("spectre.catalog")


class ScenarioNotFound(Exception):
    pass


class ScenarioInvalid(Exception):
    """The scenario file exists but cannot be used. ``reason`` is safe to show to a client."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class InvalidEntry:
    id: str
    error: str


@dataclass(frozen=True)
class Listing:
    scenarios: list[Scenario]
    invalid: list[InvalidEntry]


class ScenarioCatalog:
    """Loads synthetic scenarios from ``<scenarios_dir>/<id>/scenario.json``.

    Requested ids are only compared with directory names found by listing the scenarios
    directory; they are never joined into a path. Symlinked directories and files are ignored.
    """

    def __init__(self, scenarios_dir: Path, max_bytes: int):
        self._dir = scenarios_dir
        self._max_bytes = max_bytes

    def _files(self) -> dict[str, Path]:
        if not self._dir.is_dir():
            return {}
        root = self._dir.resolve()
        found: dict[str, Path] = {}
        for d in sorted(self._dir.iterdir()):
            f = d / SCENARIO_FILE
            if d.is_symlink() or not d.is_dir() or f.is_symlink() or not f.is_file():
                continue
            if not f.resolve().is_relative_to(root):
                continue
            found[d.name] = f
        return found

    def _load(self, scenario_id: str, path: Path) -> Scenario:
        """Raises ScenarioInvalid with a client-safe reason for anything wrong with the file."""
        try:
            with path.open("rb") as fh:
                data = fh.read(self._max_bytes + 1)  # bounded read; no stat/read race
            if len(data) > self._max_bytes:
                raise ScenarioInvalid(f"file exceeds {self._max_bytes} bytes")
            scenario = Scenario.model_validate(json.loads(data))
        except ScenarioInvalid:
            raise
        except ValidationError as exc:
            raise ScenarioInvalid(_describe_validation(exc)) from exc
        except RecursionError as exc:
            raise ScenarioInvalid("JSON is nested too deeply") from exc
        except json.JSONDecodeError as exc:
            raise ScenarioInvalid("file is not valid JSON") from exc
        except OSError as exc:
            log.warning("cannot read scenario %s: %s", scenario_id, exc)
            raise ScenarioInvalid("file could not be read") from exc
        except Exception as exc:  # hostile input must never take down the listing
            log.exception("unexpected failure loading scenario %s", scenario_id)
            raise ScenarioInvalid("file could not be processed") from exc
        if scenario.metadata.id != scenario_id:
            raise ScenarioInvalid("metadata.id does not match the directory name")
        return scenario

    def list(self) -> Listing:
        scenarios: list[Scenario] = []
        invalid: list[InvalidEntry] = []
        for scenario_id, path in self._files().items():
            try:
                scenarios.append(self._load(scenario_id, path))
            except ScenarioInvalid as exc:
                log.warning("invalid scenario %s: %s", scenario_id, exc.reason)
                invalid.append(InvalidEntry(scenario_id, exc.reason))
        return Listing(scenarios, invalid)

    def get(self, scenario_id: str) -> Scenario:
        path = self._files().get(scenario_id)
        if path is None:
            raise ScenarioNotFound(scenario_id)
        return self._load(scenario_id, path)


def _describe_validation(exc: ValidationError) -> str:
    parts = [f"{'.'.join(map(str, e['loc']))[:80]}: {e['msg'][:120]}" for e in exc.errors()[:5]]
    more = len(exc.errors()) - len(parts)
    text = "; ".join(parts) + (f"; and {more} more" if more > 0 else "")
    return text[:MAX_ERROR_CHARS]
