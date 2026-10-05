"""Repository-wide architectural bans — TECH_STACK §10, ARCH §8.

These are grep tests on purpose. Each one encodes a rule that is cheap to state
in a doc and expensive to notice when broken:

| Ban | Why |
|---|---|
| `osgeo` / raw GDAL | No PyPI wheels; source-only, needs system libgdal headers (TECH_STACK §5.3) |
| global `np.random` | Determinism requires an explicitly seeded generator (NFR-1.2) |
| `langgraph` outside `app/ai/` | The engine must never depend on the AI layer (ADR-9) |
| `InMemorySaver` outside tests | Loses all state on restart (TECH_STACK §5.4) |
| `postgres`/`redis` in compose | V1 ships no database; if compose needs one, ARCH §11 is violated |
| `random.seed` / `time.time` in engine | Wall-clock and unseeded RNG in sim code break replay |

`random.seed(...)` and `math.fsum` appear in *docstrings* explaining why they
matter, so the checks strip comments and docstrings before matching.
"""

from __future__ import annotations

import io
import os
import re
import tokenize

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
SIM_APP = os.path.join(REPO_ROOT, "apps", "simulation", "app")
COMPOSE = os.path.join(REPO_ROOT, "infra", "compose.yaml")


def iter_source_files(root: str) -> list[str]:
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != "__pycache__"]
        found.extend(
            os.path.join(dirpath, filename) for filename in filenames if filename.endswith(".py")
        )
    return sorted(found)


def code_without_docs(path: str) -> str:
    """Return executable source with comments and string literals removed.

    Docstrings are stripped so that prose *about* a banned pattern does not trip
    the ban — e.g. `engine/scheduler.py` explains at length why builtin
    `hash()` is banned, and a naive text search would flag its own docstring.

    Tokens are reassembled rather than joined with a flat separator, because a
    flat join turns `np.random.rand()` into `np . random . rand ()` and every
    dotted-name pattern silently stops matching. (Verified: the global
    `np.random` guard did not fire until this was fixed.)
    """
    out: list[str] = []
    with open(path, "rb") as handle:
        try:
            tokens = list(tokenize.tokenize(io.BytesIO(handle.read()).readline))
        except tokenize.TokenError:  # pragma: no cover - malformed file
            return ""

    merge_before = {".", ",", ")", "]", "}", ";"}
    merge_after = {"(", "[", "."}
    for token in tokens:
        if token.type in (tokenize.COMMENT, tokenize.STRING):
            continue
        text = token.string
        if not text.strip():
            continue
        if not out:
            out.append(text)
            continue
        previous = out[-1]
        if text in merge_before or previous in merge_after or previous.endswith("."):
            out[-1] = previous + text
        else:
            out.append(text)
    return " ".join(out)


@pytest.fixture(scope="module")
def engine_sources() -> list[str]:
    return iter_source_files(os.path.join(SIM_APP, "engine"))


class TestGeoStack:
    def test_no_raw_gdal_imports(self) -> None:
        """`GDAL` on PyPI ships zero wheels across all 98 releases — installing
        it requires system libgdal headers, so the GIS pipeline could not run in
        a clean container. Use `rasterio` / `pyogrio`, which bundle GDAL."""
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in iter_source_files(SIM_APP)
            if re.search(r"\bosgeo\b", code_without_docs(path))
        ]
        assert offenders == [], f"raw GDAL imports are banned (TECH_STACK §5.3): {offenders}"


class TestDeterminismBans:
    def test_engine_never_uses_global_numpy_random(self, engine_sources: list[str]) -> None:
        """NFR-1.2 — all randomness from an explicitly seeded
        `np.random.Generator(PCG64(seed))`, never the global `np.random`."""
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in engine_sources
            if re.search(r"\bnp\.random\.", code_without_docs(path))
        ]
        assert offenders == [], f"global np.random is banned in engine/: {offenders}"

    def test_engine_never_uses_module_level_random_seed(self, engine_sources: list[str]) -> None:
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in engine_sources
            if re.search(r"\brandom\.seed\(", code_without_docs(path))
        ]
        assert offenders == [], f"random.seed() is banned in engine/: {offenders}"

    def test_engine_never_reads_a_wall_clock(self, engine_sources: list[str]) -> None:
        """NFR-1.1 — fixed timestep, no wall-clock reads inside simulation code.

        This is also a determinism rule rather than a performance one: a
        wall-clock-triggered skip would make world state a function of machine
        load, so the same seed would diverge between a loaded CI runner and an
        idle laptop (ARCH §4.2).
        """
        wall_clock = re.compile(r"\b(time\.time|time\.monotonic|datetime\.now|perf_counter)\b")
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in engine_sources
            if wall_clock.search(code_without_docs(path))
        ]
        assert offenders == [], f"wall-clock reads are banned in engine/: {offenders}"

    def test_engine_does_not_iterate_a_set_in_simulation_code(
        self, engine_sources: list[str]
    ) -> None:
        """`set` iteration order is `PYTHONHASHSEED`-dependent. Not every `set` is
        a bug — the banned shapes are iterating one, or building one for
        ordering. Membership tests and set-to-tuple conversion are fine."""
        banned = re.compile(r"for\s+\w+\s+in\s+\w*set\b|\bset\([^)]*\)\s*$|\.keys\(\)\s*$")
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in engine_sources
            if banned.search(code_without_docs(path))
        ]
        assert offenders == [], f"set iteration is banned in engine/ (NFR-1.3): {offenders}"


class TestAILeakageBans:
    def test_langgraph_imported_only_inside_the_ai_layer(self) -> None:
        """TECH_STACK §5.4 — the engine does not import LangGraph; the AI layer
        imports the engine. This preserves ADR-9."""
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in iter_source_files(SIM_APP)
            if "langgraph" in code_without_docs(path)
            and not os.path.relpath(path, SIM_APP).startswith(f"ai{os.sep}")
        ]
        assert offenders == [], f"langgraph may only be imported under app/ai/: {offenders}"

    def test_in_memory_checkpointer_is_never_used(self) -> None:
        """`InMemorySaver` loses all state on restart (TECH_STACK §5.4). Tests are
        the only legitimate place, and this scaffold has none."""
        offenders = [
            os.path.relpath(path, REPO_ROOT)
            for path in iter_source_files(SIM_APP)
            if "InMemorySaver" in code_without_docs(path)
        ]
        assert offenders == [], f"InMemorySaver is banned outside tests: {offenders}"


def read_compose_declarations() -> str:
    """Compose YAML with comments stripped.

    Same reason as `code_without_docs`: the compose file explains *why* there is
    no database, and that prose necessarily contains the word "postgres". The
    guard must inspect declarations, not the explanation.

    Two comment forms are handled: whole-line comments (which start at column
    zero, so a trailing-comment regex alone would miss them) and trailing
    comments after a value.
    """
    with open(COMPOSE, encoding="utf-8") as handle:
        lines = handle.read().splitlines()
    kept = ["" if line.lstrip().startswith("#") else re.sub(r"\s+#.*$", "", line) for line in lines]
    return "\n".join(kept)


class TestNoDatabaseInV1:
    """ARCH §11 — V1 ships file-based state and no database.

    The trigger: `docker compose up` must work with no Postgres or Redis
    running. If local setup requires either, §11 has been violated.
    """

    @pytest.mark.skipif(not os.path.exists(COMPOSE), reason="infra/compose.yaml not created yet")
    def test_compose_declares_no_database_services(self) -> None:
        declarations = read_compose_declarations().lower()
        for banned in ("postgres", "postgis", "redis", "mysql", "mongo"):
            assert banned not in declarations, (
                f"compose.yaml references `{banned}`; ARCH §11 defers all databases "
                f"in V1 and compose must start with no external services"
            )

    @pytest.mark.skipif(not os.path.exists(COMPOSE), reason="infra/compose.yaml not created yet")
    def test_compose_defines_only_web_and_api(self) -> None:
        declarations = read_compose_declarations()
        service_names = re.findall(r"^  ([a-z0-9_-]+):\s*$", declarations, re.MULTILINE)
        assert set(service_names) <= {"web", "api"}, (
            f"unexpected compose services: {sorted(set(service_names) - {'web', 'api'})}"
        )

    @pytest.mark.skipif(not os.path.exists(COMPOSE), reason="infra/compose.yaml not created yet")
    def test_determinism_env_vars_are_set_for_the_engine(self) -> None:
        """These are not tuning. `PYTHONHASHSEED` changes string-keyed iteration
        order between processes and BLAS threads change float reduction
        partitioning — dropping one makes replay diverge *between environments*
        while still passing every in-process test (ARCH §8, §8.1)."""
        declarations = read_compose_declarations()
        for var in (
            "PYTHONHASHSEED",
            "OMP_NUM_THREADS",
            "MKL_NUM_THREADS",
            "OPENBLAS_NUM_THREADS",
        ):
            assert var in declarations, (
                f"compose.yaml must set {var} for the api service (ARCH §8.1)"
            )
