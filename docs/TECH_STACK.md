# Tech Stack — AETHER: Baguio

**Status:** Draft for review
**Version:** 0.1.0
**Date:** 2026-10-03
**Verification:** every version below was resolved from the npm registry / PyPI on
2026-10-03. Peer dependencies were read from the registry, not assumed.
**Depends on:** [`PRD.md`](./PRD.md) · [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 1. Pinned versions

Exact pins, not ranges. A 3D renderer that resolves to a different minor version between
two developers is not reproducible.

### 1.1 Frontend

| Package | Version | Note |
|---|---|---|
| `next` | `16.3.8` | App Router; requires Node ≥ 20.9 |
| `react` / `react-dom` | `19.3.0` | R3F 9 peer: `>=19 <19.4` — **19.3.0 is in range** |
| `three` | `0.186.1` | R3F peer `>=0.156`; Rapier peer `>=0.159` |
| `@react-three/fiber` | `9.8.1` | React 19 compatible |
| `@react-three/drei` | `10.7.9` | Peer: react `^19`, three `>=0.159`, R3F `^9` |
| `@react-three/rapier` | `2.2.0` | Peer: react `^19`, three `>=0.159.0`, R3F `^9.0.4` |
| `@react-three/postprocessing` | `3.1.3` | Bloom / SSAO |
| `postprocessing` | `6.39.5` | **Required, non-optional peer of the above.** Peer: three `>=0.168.0 <0.187.0` |
| `zustand` | `5.0.15` | Client state |
| `tailwindcss` | `4.3.3` | CSS-first config; no `tailwind.config.js` required |
| `motion` | `14.0.0` | Current package name. Depends on `framer-motion@14.0.0`, which still ships separately — import from `motion`, never from `framer-motion` |
| `typescript` | `7.0.2` | See §5.1 — read this before pinning |
| `@biomejs/biome` | `2.5.15` | Lint + format, single tool |
| `vitest` | `5.0.3` | Unit tests |
| `@playwright/test` | `1.63.0` | E2E + visual |

**Runtime:** Node `24.21.0` (LTS "Krypton"). Node 26 is current but **not** LTS — do not
target it.

### 1.2 Simulation backend

| Package | Version | Note |
|---|---|---|
| Python | `3.13.x` | See §5.2 |
| `fastapi` | `0.142.2` | |
| `uvicorn` | `0.54.0` | ASGI server |
| `pydantic` | `2.13.5` | v2; structured action validation |
| `numpy` | `2.5.3` | Wheels for cp312–cp315 |
| `scipy` | `1.18.1` | `sparse.csgraph` for routing on the tick path |
| `shapely` | `2.1.2` | Geometry predicates |
| `rasterio` | `1.5.2` | **Replaces raw GDAL** — see §5.3 |
| `pyogrio` | `0.13.0` | **Replaces raw GDAL/OGR.** Wheels: cp310, cp311-abi3, cp314t only |
| `networkx` | `3.7` | **Offline only** — not on the tick path |
| `orjson` | `3.12.0` | REST + event log serialisation |
| `msgspec` | `0.22.0` | Optional: faster event-log encoding than `orjson` |
| `pytest` | `9.1.1` | |
| `pytest-asyncio` | `1.4.0` | |
| `hypothesis` | `6.168.3` | Property tests |
| `httpx` | `0.28.1` | Integration tests (CI gate, §9) |
| `pytest-benchmark` | `5.3.0` | Perf gate (CI gate, §9) |
| `mypy` | `2.4.0` | `--strict` on `engine/`, `wire/`, `ai/` (CI gate, §8) |
| `ruff` | `0.16.10` | Lint + format |

#### AETHER AI layer (Phase 5, optional)

| Package | Version | Note |
|---|---|---|
| `langgraph` | `1.2.12` | AI orchestration only — never the tick loop (ARCH §10.5) |
| `langgraph-checkpoint` | `4.2.0` | Transitive via langgraph; pins `ormsgpack` for serialisation |
| `langgraph-checkpoint-sqlite` | `3.1.1` | File-backed checkpointer. In-memory savers lose state on restart |

Transitive, pinned for reproducibility: `langchain-core` 1.6.6 · `langgraph-prebuilt` (via
langgraph) · `langgraph-sdk` (via langgraph) · `ormsgpack` 1.12.2 · `xxhash` (via
langgraph-checkpoint) · `sqlite-vec` 0.1.9 · `aiosqlite` 0.22.1

### 1.3 Deliberately deferred

| Package | Status | Trigger to adopt |
|---|---|---|
| `postgres` / `asyncpg` / `alembic` | Deferred | Multi-user scenario authoring (ARCH §11) |
| `redis` | Deferred | Multiple sim instances sharing state |
| `gdal` (PyPI) | **Rejected** | See §5.3 |
| `osrm` | Deferred | Routing demand exceeds in-process graph |

---

## 2. Compatibility matrix

Peer dependencies read from the registry on 2026-10-03. **The stack is internally
consistent.**

| Consumer | Requires | Provided | OK |
|---|---|---|---|
| R3F 9.8.1 | `react >=19 <19.4` | 19.3.0 | ✅ |
| R3F 9.8.1 | `three >=0.156` | 0.186.1 | ✅ |
| Drei 10.7.9 | `@react-three/fiber ^9` | 9.8.1 | ✅ |
| Drei 10.7.9 | `three >=0.159` | 0.186.1 | ✅ |
| Rapier 2.2.0 | `@react-three/fiber ^9.0.4` | 9.8.1 | ✅ |
| Rapier 2.2.0 | `three >=0.159.0` | 0.186.1 | ✅ |
| Rapier 2.2.0 | `react ^19` | 19.3.0 | ✅ |
| postprocessing 3.1.3 | `react ^19.0.0` | 19.3.0 | ✅ |
| postprocessing 3.1.3 | `three >=0.156.0` | 0.186.1 | ✅ |
| postprocessing 3.1.3 | `@react-three/fiber >=9.7.0` | 9.8.1 | ✅ |
| postprocessing 3.1.3 | `postprocessing ^6.36.0` | 6.39.5 | ✅ |
| postprocessing 6.39.5 | `three >=0.168.0 <0.187.0` | 0.186.1 | ✅ |
| motion 14.0.0 | `react ^18 \|\| ^19` | 19.3.0 | ✅ |
| Next 16.3.8 | `react >=19` | 19.3.0 | ✅ |
| Next 16.3.8 | `node >=20.9.0` | 24.21.0 | ✅ |

### Optional peers — verified absent-by-design

Several packages declare peers that are **not** installed here. All are marked
`optional: true` in `peerDependenciesMeta`, so they produce no install warning and no
resolution failure. Listed so a future reviewer does not "fix" a non-problem:

| Package | Optional peers (all `optional: true`) |
|---|---|
| `next` 16.3.8 | `sass`, `@opentelemetry/api`, `babel-plugin-react-compiler`, `@playwright/test` |
| `zustand` 5.0.15 | `react`, `@types/react`, `immer`, `use-sync-external-store` |
| `motion` 14.0.0 | `react`, `react-dom` |
| `@react-three/fiber` 9.8.1 | `react-native`, `expo`, `expo-gl`, `expo-asset`, `expo-file-system` |

One peer deserves attention because it is **not** optional:

| Consumer | Requires | Provided | Note |
|---|---|---|---|
| `react-dom` 19.3.0 | `react ^19.3.0` | 19.3.0 | Lower bound, not a range — react must be ≥ 19.3.0 |

**`postprocessing` is a required, non-optional peer** of `@react-three/postprocessing`
(`peerDependenciesMeta` is `null`). Omitting it — as an early draft of this document did —
makes a clean `pnpm install` fail with an unmet-peer error. Pin it explicitly.

Two constraints are **upper bounds** and will break silently on upgrade:

| Bounded package | Bound | Consequence if breached |
|---|---|---|
| `react` | `<19.4` (R3F) | 3D renderer breaks; React 19.4 must not be auto-installed |
| `three` | `<0.187.0` (postprocessing) | postprocessing stops resolving |

Both must be pinned with a comment explaining the bound, and Dependabot must not
auto-upgrade across either.


---

## 3. Renderer decision

**WebGL2 renderer, not WebGPU.**

`WebGPURenderer` is real in three.js 0.186 and falls back to WebGPU→WebGL automatically.
It is not chosen because:

- WebGPU availability and driver maturity still vary enough to be a support burden
- Rapier and some postprocessing paths are better trodden on WebGL2
- A fallback path that silently changes rendering behaviour is a debugging tax

WebGPU is an opt-in experiment behind a flag, revisited once the WebGL2 path is stable.
Note for the record: **WebGL1 support was removed in r163**, so the floor is WebGL2 and
`WebGLRenderer` will not run on older mobile drivers.

---

## 4. Why each technology

| Choice | Reason | What it replaces |
|---|---|---|
| **Next.js 16** | SSR for the marketing/docs shell only. The simulation itself is a WebSocket-fed client island — it does not need SSR | CRA, Vite-only setups |
| **React Three Fiber** | Declarative scene graph over Three.js; component composition suits a world builder | Imperative Three.js |
| **Rapier** | Rust/WASM physics; only the player and vehicle bodies need true physics | Cannon.js, Ammo.js |
| **Tailwind 4 + shadcn/ui** | CSS-first config; shadcn components are copied in, not depended on | CSS modules, MUI |
| **motion 14** | The maintained successor to `framer-motion`; import path changed | — |
| **Biome** | Lint + format in one Rust binary; ESLint+Prettier is two tools and two configs | ESLint, Prettier |
| **Zustand** | Minimal store; avoids Redux ceremony for client-only UI state | Redux Toolkit |
| **FastAPI + Pydantic v2** | Async WS + typed validation, which the AI action pipeline needs anyway | Flask, raw `asyncio` |
| **NumPy + SciPy** | Vectorised occupancy and `csgraph` routing — the only way Python reaches the tick budget | Pure-Python loops, NetworkX |
| **`numpy.random.PCG64`** | Explicit seeded generator; determinism (NFR-1) depends on never touching global RNG | `random`, global `np.random` |

---

## 5. Version-specific hazards

Read before touching the install. Each of these is a real, current issue.

### 5.1 TypeScript 7 is not TypeScript 5

`typescript@7.0.2` is the native (Go) compiler. Three consequences:

1. **No JavaScript compiler API.** Tools that call the TS API programmatically cannot
   use TS 7.
2. **Next.js 16.3 defaults to invoking the `tsc` CLI**, which works with TS 7. To use the
   JS API instead, set `experimental.useTypeScriptCli: false`.
3. **Monorepo aliasing broke in 16.3** ([vercel/next.js#96589](https://github.com/vercel/next.js/issues/96589)).
   The common pattern of aliasing `typescript` to v6 while installing v7 under another
   name now fails at build with *"It looks like you're trying to use TypeScript but do
   not have the required package(s) installed."*

**Decision:** pin `typescript@7.0.2`, keep the default CLI path, and do **not** attempt
the v6-alias pattern. CI must run `tsc --noEmit` as a separate step so the check is not
dependent on `next build` succeeding.

### 5.2 Python 3.13, not 3.14

Python 3.14.8 is the latest **stable** release (3.13.16 is the current maintenance line;
3.12 remains supported). 3.14 is mature, so the constraint below is about wheel coverage,
not maturity. Wheel availability, observed 2026-10-03:

| Package | cp313 | cp314 | Note |
|---|---|---|---|
| `numpy` 2.5.3 | ✅ | ✅ (21 wheels) | Not a constraint |
| `rasterio` 1.5.2 | ✅ | ✅ (12 wheels) | Not a constraint |
| `pyogrio` 0.13.0 | ⚠️ abi3 fallback | ❌ standard | cp314 wheels are **free-threaded only** (`cp314t`); 3.13 resolves via the `cp311-abi3` wheel |

So on stock CPython 3.14, `pyogrio` has **no** standard wheel — it falls back to
`cp311-abi3`, which works but is an ABI3 build rather than a native one. On 3.13 the same
abi3 fallback applies, so neither version gets a native `pyogrio` wheel today.

**Decision:** `requires-python = ">=3.13,<3.14"` for V1. The reason is **not** that 3.13
native wheels exist where 3.14 lacks them — for `pyogrio` both use abi3. The reason is
that 3.13 is the last version with complete, conventionally-built wheels across the whole
pinned geo stack, and 3.14's `cp314t`-only coverage for `pyogrio` makes a clean,
toolchain-free install on the standard interpreter unproven. Revisit when `pyogrio`
publishes standard cp314 wheels.

### 5.3 GDAL has no PyPI wheels

**`GDAL` 3.13.3 on PyPI ships zero wheels** — source distribution only. Across all 98
releases and 120 files ever published, there has never been a `.whl`. Installing it
requires system `libgdal` headers, which means the GIS pipeline cannot run in a clean
Docker image or on a contributor's laptop without native toolchain setup.

**Decision:** use `rasterio` 1.5.2 (manylinux wheels, cp312–cp315) and `pyogrio` 0.13.0
(cp310, cp311-abi3, cp314t). Both bundle GDAL in their wheels. Raw `osgeo` imports are
banned; a lint rule enforces it.

### 5.4 LangGraph — used, with three hazards

**Decision: adopted.** `langgraph` 1.2.12 orchestrates the AETHER AI layer (ARCH §10.5).
It is confined to `app/ai/` and never imported by the engine, so deleting that directory
yields a working simulation (ADR-9).

**What it costs.** Six direct dependencies — `langchain-core`, `langgraph-checkpoint`,
`langgraph-prebuilt`, `langgraph-sdk`, `xxhash`, `pydantic` — plus `ormsgpack` via the
checkpointer. That weight is accepted for conditional edges, super-step checkpointing,
resumable `thread_id` state, and `interrupt()` for operator approval.

**Compatibility, verified 2026-10-03:**

| Constraint | Status |
|---|---|
| `requires-python >=3.10` | ✅ pinned to 3.13 |
| `langchain-core <2, >=1.4.7` | ✅ resolves in the AI-layer extra |
| Does not touch the tick loop | Enforced by lint: `engine/` and `wire/` may not import `langgraph` |

Three hazards, each verified against current LangGraph docs:

1. **Merging reducers cannot clear a field.** `Annotated[list, add]` treats `[]` as a
   no-op, so `["bad"]` persists across super-steps. Clearing requires
   `{"field": Overwrite([])}`. Forgetting this silently accumulates rejected actions across
   runs — a bug that presents as a policy leak.
2. **In-memory savers lose everything on restart.** `InMemorySaver` is for tests only.
   Production uses `SqliteSaver` (`langgraph-checkpoint-sqlite` 3.1.1) — a local file,
   zero cost. `PostgresSaver` is **not** used in V1; it would pull in the database that
   ARCH §11 deliberately defers.
3. **`thread_id` is required whenever a checkpointer is set.** Omitting
   `config={"configurable": {"thread_id": ...}}` raises at runtime. Keep it under 255
   characters if a Postgres saver is ever adopted.

**Bounded scope.** If the AI layer ever collapses back to a straight line with no
branches, no interrupts, and no resumability requirement, revisit ADR-6 — at that point
the framework carries its dependency weight for nothing.

### 5.5 Hosting: Cloud Run is a choice, and it has a price

Not a package hazard, but it shapes deployment. Cloud Run caps request duration at
**3600 s** (default 300 s), and WebSocket sessions are subject to it. Reconnect-and-resume
is therefore a Phase 0 requirement on Cloud Run (PRD FR-6.4) — **unless** you host on Fly
Machines or a VPS, where no such cap exists.

The cost side matters more than the cap. On request-based billing an open WebSocket keeps
the request *active* for its whole life, so vCPU bills at the **active** rate
($0.000024/vCPU-s) continuously — not just for the 66 ms of tick work. Free tier covers
≈2.1 h/day; always-warm costs ≈ **$63/mo**.

Full costed comparison, with the other supported targets, is in **ARCH §12.4**. Summary:

| Target | 24/7 cost | WS timeout |
|---|---|---|
| Cloud Run (request-based, warm) | ~$63/mo | ⚠️ 3600 s |
| Fly Machines `performance-1x` | ~$33/mo | ✅ none |
| Hetzner CAX11 | ~$4/mo | ✅ none |

Keep the container, health check, and shutdown hook portable in `infra/` so this stays a
deployment toggle rather than a rewrite.

**Requires a credit card?** Cloud Run does — Google verifies identity with a payment method
(an authorization hold, not a charge). **Hetzner does not** (PayPal/SEPA/wire, ~$4/mo) and
**Fly does not** (prepaid credits, $25 min). Railway and Render free tiers are card-free
but too small to run the engine. Full comparison with sources: **ARCH §12.4**.

---

## 6. Commands

**Toolchain** — `pnpm` 10.x (Node package manager; `packageManager` pinned in the root
`package.json`) and `uv` (Python package manager; resolves `requires-python` from
`pyproject.toml`). Both are prerequisites, not incidental.

```bash
# ---- frontend — run from apps/web, or repo root with --filter ----
pnpm install                        # workspace install, run once at repo root
pnpm --filter web dev               # Next dev server, :3000
pnpm --filter web build             # production build
pnpm --filter web lint              # biome check  (lint + format)
pnpm --filter web lint:fix          # biome check --write
pnpm --filter web typecheck         # tsc --noEmit  (CI runs this separately — §5.1)
pnpm --filter web test              # vitest run
pnpm --filter web test:e2e          # playwright test

# ---- simulation — run from apps/simulation ----
uv sync                             # or: pip install -e '.[dev]'
uv run uvicorn app.main:app --reload --port 8000
uv run pytest                       # includes the determinism gate (ARCH §8.3)
uv run pytest -m perf               # nightly tick-budget gate
uv run python -m benchmarks.scenario S1   # from REPO ROOT (§7) — scenario S1

# ---- full stack — from repo root ----
docker compose -f infra/compose.yaml up --build   # web :3000 + api :8000, no external services
```

Two paths are deliberate and easy to get wrong:

- `benchmarks/` lives at the **repo root**, not under `apps/simulation/` (ARCH §3). The
  scenario runner is therefore invoked from the root; `apps/simulation` cannot import it
  as a local module.
- The compose file lives at **`infra/compose.yaml`**, not at the repo root. There is no
  root-level `docker-compose.yml`.

`docker compose up` must work with **no** Postgres or Redis running. If it does not,
ARCH §11 has been violated.

---

## 7. Project structure

```
apps/web/src/
├── app/                 Next.js App Router (marketing/docs shell)
├── components/
│   ├── scene/           R3F components: Terrain, Buildings, AgentInstances, Lighting
│   ├── hud/             Inspector, mode switcher, event injection panel
│   └── ui/              shadcn/ui primitives
├── net/                 WebSocket client, snapshot buffer, interpolation
├── state/               Zustand stores (ui state only — never world state)
└── lib/

apps/simulation/app/
├── main.py              FastAPI app, WS endpoint, lifecycle
├── engine/
│   ├── clock.py         Fixed timestep (ARCH §4.1)
│   ├── world.py         Terrain, roads, buildings, zones
│   ├── scheduler.py     Staggered decision scheduling (§5 ARCH)
│   ├── traffic.py       Road occupancy, congestion
│   ├── routing.py       scipy csgraph, incremental
│   ├── events.py        EventEngine + append-only log
│   └── publisher.py     Dirty-set → binary snapshot encoder
├── agents/
│   ├── citizen.py tourist.py vehicle.py
│   ├── decision.py      FSM + behaviour tree + utility scoring
│   └── schedules.py
├── ai/                     AETHER AI layer — the ONLY place langgraph may be imported
│   ├── controller.py       StrategicController protocol (ADR-9 seam)
│   ├── rule_based.py       Default; zero LLM calls
│   ├── llm.py              LLMController + fallback wiring
│   ├── graph.py            LangGraph StateGraph: nodes, conditional edges (§5.4)
│   ├── state.py            StrategicState TypedDict + reducers
│   ├── summarizer.py       World → StrategicState aggregates
│   └── policy.py           Policy validators (outside the graph)
├── wire/
│   └── protocol.py      HEADER/ENTITY struct formats — single source of truth
└── persistence/         Event log, keyframes, run metrics

packages/shared-types/    TS types mirroring wire/protocol.py + stride constants
data/
├── raw/                    Source downloads; gitignored, checksummed
└── world/                  Versioned build artifacts (committed)
infra/
├── compose.yaml            Local full-stack: web + api. No external services.
├── docker/
│   ├── web.Dockerfile
│   └── simulation.Dockerfile
└── deploy/                 Target configs — all optional, same image (ARCH §12.4)
    ├── cloudrun/           service.yaml: CPU always-allocated, min-instances=1
    ├── fly/                fly.toml: performance-1x, no request cap
    └── vercel/             web only

benchmarks/
├── scenario/               S1 (surge + rain + accident) and friends
│   └── __main__.py         `python -m benchmarks.scenario S1`, run from repo root
└── perf/                   tick-budget and bandwidth gates

docs/                       This document set
package.json                pnpm workspace root; `packageManager` pinned
pyproject.toml               uv workspace; `requires-python = ">=3.13,<3.14"`
```

**The wire format is defined once per language and tested against each other.**
`packages/shared-types` and `wire/protocol.py` must not drift; a round-trip test is the
guard (ARCH §7.3).

---

## 8. Code style

One real example beats three paragraphs of description.

```python
# apps/simulation/app/agents/decision.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.engine.world import WorldView


class Action(Protocol):
    """An action an agent can take. `id` is a stable int, unique within a candidate set."""

    id: int

    def time_score(self, world: WorldView) -> float: ...
    def cost_score(self, world: WorldView) -> float: ...
    def weather_score(self, world: WorldView) -> float: ...
    def comfort_score(self, world: WorldView) -> float: ...
    def preference_score(self, world: WorldView) -> float: ...


@dataclass(frozen=True, slots=True)
class PreferenceWeights:
    """Per-agent weights. Behavioural diversity comes from here, not from randomness."""

    time: float = 1.0
    cost: float = 1.0
    weather: float = 1.0
    comfort: float = 1.0
    preference: float = 1.0


class UtilityScorer:
    """Scores candidate actions. Deterministic: no RNG, no wall clock, no set iteration."""

    __slots__ = ("_weights",)

    def __init__(self, weights: PreferenceWeights) -> None:
        self._weights = weights

    def choose(self, candidates: list[Action], world: WorldView) -> Action | None:
        # No viable action -> the agent idles. A bare max() raises on empty input,
        # and one stranded agent must not take down the tick.
        if not candidates:
            return None
        # Ties break on id, never on list order — see ARCH §6.1 (NFR-1.3).
        return max(candidates, key=lambda a: (self.score(a, world), -a.id))

    def score(self, action: Action, world: WorldView) -> float:
        w = self._weights
        return (
            w.time * action.time_score(world)
            + w.cost * action.cost_score(world)
            + w.weather * action.weather_score(world)
            + w.comfort * action.comfort_score(world)
            + w.preference * action.preference_score(world)
        )
```

This example is **runnable, not a sketch**: `Action`, `PreferenceWeights`, and
`UtilityScorer` are all defined within it; `WorldView` is imported from
`app.engine.world` (§7). Two behaviours it encodes deliberately:

- `choose` returns `None` on an empty candidate list. A bare `max()` raises `ValueError`
  on empty input, and a single agent with no options would crash the tick loop.
- Ties break on `-a.id`, making selection independent of candidate ordering. The
  determinism guarantee in ARCH §6.1 is only real because of that line.

| Rule | Detail |
|---|---|
| Formatting | Biome (TS) + `ruff`-equivalent line length 100 (Python); **no** manual formatting debates |
| Types | Strict TS everywhere; `mypy --strict` on `engine/`, `wire/`, `ai/` |
| Naming | `snake_case` Python, `camelCase` TS, `PascalCase` components |
| Imports | Absolute within a package; no cross-package reaching into internals |
| Errors | Typed exceptions; no bare `except:`; no silent `pass` |
| Comments | Docstrings on public APIs; no commented-out code in main |

---

## 9. Testing strategy

| Level | Tool | Lives in | Gate |
|---|---|---|---|
| Unit | `pytest` / `vitest` | `tests/unit/` | Every commit |
| Property | `hypothesis` | `tests/property/` | Every commit |
| **Determinism** | `pytest` | `tests/determinism/` | **Blocks merge** |
| Integration | `pytest` + `httpx` | `tests/integration/` | Every commit |
| E2E | `playwright` | `tests/e2e/` | Pre-release |
| Perf | `pytest-benchmark` | `benchmarks/` | Nightly |
| Visual | `playwright` screenshots | `tests/visual/` | Pre-release |

**The determinism test is the one that matters.** Two runs, same seed, identical
`state_digest` at tick 10,000. If it fails, something non-deterministic entered the
engine and every downstream claim — replay, Core-vs-AI evaluation, bug reproduction — is
now suspect. It is not a nice-to-have test.

Coverage: **80% on `engine/`, `agents/`, `ai/`** — behaviour and boundaries, not a
global percentage that rewards trivial tests.

---

## 10. Boundaries

**Always**
- Run `typecheck` and `pytest` before every commit
- Keep `wire/protocol.py` and `packages/shared-types` in sync, with a round-trip test
- Keep simulation code deterministic: seeded RNG, fixed timestep, sorted iteration
- Add a test alongside any behaviour change

**Ask first**
- Adding or upgrading a dependency
- Changing the wire protocol (breaks deployed clients — needs a version bump + migration)
- Changing NFR targets, tick rate, or record layout
- Any change to the AI layer that could let it mutate world state directly (violates R2)

**Never**
- Commit secrets, API keys, or `.env` files
- Read `osgeo`/GDAL directly (no wheels — TECH_STACK §5.3)
- Touch global `np.random` inside the engine
- Iterate a `set` in simulation code
- Delete or skip a failing determinism test without explicit approval
- Import `langgraph` anywhere outside `apps/simulation/app/ai/` — the engine and wire
  layers must never touch it (ARCH §10.5, ADR-9)
- Use `InMemorySaver` outside tests — it loses all state on restart (§5.4)
- Return `[]` to "clear" a merging-reducer field; use `Overwrite([])` (§5.4)

---

## 11. Success criteria for this stack

The stack is correct when, verified by running it:

1. `docker compose up` starts web + API with **no** external services running
2. `tsc --noEmit` passes on TS 7 via the CLI path (§5.1)
3. The full peer-dependency matrix in §2 resolves with no warnings
4. Encoded frame size matches the ARCH §7.3 arithmetic exactly, asserted by test
5. Determinism gate passes at tick 10,000, twice
6. With no API key set, `llm.calls_total == 0` across a 30-minute run
7. `numpy`, `rasterio`, and `pyogrio` all install from wheels on Python 3.13 with no
   system toolchain
