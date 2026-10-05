"""ADR-9 / R1 seam — ARCHITECTURE §1, §10.4.

**The claim under test:** deleting `app/ai/` must leave a fully functional
simulation at 0 LLM calls. "The LLM is an optional overlay, not a dependency"
is the project's central architectural thesis, and a thesis asserted only in a
doc comment is not a thesis.

Checked two ways:

1. **Statically** — no module under `engine/` or `wire/` may import `app.ai`.
   The dependency arrow points one way: `ai → engine → wire`.
2. **Dynamically** — every engine and wire module is imported in a subprocess
   with `app/ai/` moved away. Static analysis catches a direct import; the
   subprocess catches an indirect one laundered through a package `__init__`.

The AI layer is also forbidden from reaching into `wire/`, because R2 says an
LLM never writes world state directly.
"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

#: `apps/simulation` — two levels above `tests/integration/`.
SIM_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APP_ROOT = os.path.join(SIM_ROOT, "app")

#: Modules that must import cleanly with `app/ai/` removed.
R1_SURVIVORS = [
    "app.engine",
    "app.engine.clock",
    "app.engine.digest",
    "app.engine.events",
    "app.engine.publisher",
    "app.engine.routing",
    "app.engine.scheduler",
    "app.engine.stage",
    "app.engine.traffic",
    "app.engine.world",
    "app.wire",
    "app.wire.protocol",
    "app.main",
]


def python_files(package: str) -> list[str]:
    """Absolute paths of every `.py` file under `app/<package>`."""
    root = os.path.join(APP_ROOT, package)
    found: list[str] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        found.extend(
            os.path.join(dirpath, filename) for filename in filenames if filename.endswith(".py")
        )
    return sorted(found)


def read(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def offenders(package: str, needle: str) -> list[str]:
    return [
        os.path.relpath(path, SIM_ROOT) for path in python_files(package) if needle in read(path)
    ]


class TestDependencyDirection:
    @pytest.mark.parametrize("package", ["engine", "wire"])
    def test_no_engine_or_wire_imports_the_ai_layer(self, package: str) -> None:
        assert offenders(package, "app.ai") == [], (
            f"{package}/ must not import app.ai — the engine never depends on the "
            f"AI layer (ADR-9). Offenders: {offenders(package, 'app.ai')}"
        )

    def test_ai_layer_does_not_import_wire(self) -> None:
        assert offenders("ai", "app.wire") == [], (
            "ai/ must not import app.wire — a proposal reaches the engine, not the wire"
        )

    def test_langgraph_is_not_a_declared_dependency(self) -> None:
        """Phase 5 dependency, deliberately absent now.

        Asserted against `pyproject.toml` rather than by trying to import it:
        an unrelated namespace package on the machine's `sys.path` would make an
        import probe fail for reasons that have nothing to do with this repo,
        and the thing worth protecting is the *declaration*.
        """
        with open(os.path.join(SIM_ROOT, "pyproject.toml"), encoding="utf-8") as handle:
            pyproject = handle.read()
        assert "langgraph" not in pyproject, (
            "langgraph must not be declared before Phase 5 — it is confined to "
            "app/ai/ and would make the R1 seam unverifiable (ADR-9)"
        )


class TestR1SurvivesDeletingAI:
    @pytest.mark.parametrize("module", R1_SURVIVORS)
    def test_module_imports_without_the_ai_layer(self, module: str) -> None:
        """Simulate `rm -rf app/ai` and prove the engine still imports."""
        script = f"""
import shutil, sys
sys.path.insert(0, {SIM_ROOT!r})
target = {os.path.join(APP_ROOT, "ai")!r}
backup = target + ".disabled"
shutil.move(target, backup)
try:
    import {module}
    print("OK")
finally:
    shutil.move(backup, target)
"""
        result = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, (
            f"{module} failed to import with app/ai/ removed (R1 violated):\n{result.stderr}"
        )
        assert "OK" in result.stdout
