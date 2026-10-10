from pathlib import Path

from spectre.core.config import find_scenarios_dir


def test_finds_scenarios_in_an_ancestor_directory(tmp_path: Path) -> None:
    (tmp_path / "scenarios").mkdir()
    deep = tmp_path / "apps" / "api" / "src" / "spectre" / "core"
    deep.mkdir(parents=True)
    assert find_scenarios_dir(deep / "config.py") == tmp_path / "scenarios"


def test_shallow_install_layout_does_not_raise() -> None:
    # e.g. /app/src/spectre/core/config.py inside a container: fewer parents than the monorepo
    assert find_scenarios_dir(Path("/app/src/spectre/core/config.py")) == Path("scenarios")


def test_falls_back_to_a_cwd_relative_path_when_nothing_is_found(tmp_path: Path) -> None:
    assert find_scenarios_dir(tmp_path / "x.py") == Path("scenarios")
