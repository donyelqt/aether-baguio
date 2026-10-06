# AETHER: Baguio

A browser-native 3D multi-agent simulation of Baguio City, where citizens,
tourists, vehicles, transit, weather, and emergency systems share one
authoritative world state and produce legible urban behaviour.

The architectural thesis is an inversion:

> The city is autonomous at **0 LLM calls**. The LLM is an optional strategic
> overlay, never the thing that makes it alive.

Everything below follows from that. Deleting the AI layer must leave a fully
functional simulation, and an LLM may never write world state directly — it emits
a typed proposal that must survive schema validation, policy validation, and the
engine's own veto.

---

## Status

**The world renders and is navigable. The simulation does not run yet.**

| | |
|---|---|
| Working | Static city — terrain, road network, 11 landmarks, physically-correct day/night, free-orbit camera with WASD/pointer/wheel input |
| Not built | The 15 Hz tick loop, agents, traffic, events, WebSocket snapshot stream, god mode, AETHER AI |
| Tests | 174 passing — 74 TypeScript (53 shared-types, 21 web), 100 Python |
| Gates | typecheck 0 · biome 0 findings / 42 files · build succeeds · CI green on `main` |

`docs/PRD.md` describes the finished product. This README describes what exists.
`docs/PLAN.md` tracks requirement-by-requirement status.

---

## Quick start

Requires **Node ≥ 20.9** and **Python 3.13** (pinned `>=3.13,<3.14`).

```bash
# 1. TypeScript workspace
pnpm install

# 2. Client — Next.js on :3000
pnpm dev

# 3. Simulation service — FastAPI on :8000
pip install -e "apps/simulation[dev]"
python -m uvicorn app.main:app --app-dir apps/simulation --port 8000
```

Then:

```bash
curl http://localhost:8000/healthz
```

```json
{
  "status": "ok", "mode": "core", "llm_calls": 0,
  "tick_hz": 15, "dt": 0.06666666666666667, "protocol_version": 1,
  "wire": { "header_bytes": 28, "entity_bytes": 44, "scene_bytes": 14 },
  "tick_loop": "not implemented (Phase 0)"
}
```

`/ws` accepts a connection and immediately closes with a stated reason. There is
nothing to stream until Phase 0 lands — it refuses rather than opening a socket
that silently emits no frames.

**Full stack via Docker** — `docker compose -f infra/compose.yaml up --build`.
The compose file validates and its guard tests pass, but **no image has been
built yet**, so treat this path as unproven. There is deliberately no database
service; ARCHITECTURE §11 defers all of them, and a guard test enforces that.

---

## Commands

All verified by execution.

| Command | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server on `:3000` |
| `pnpm --filter web build` | Production build |
| `pnpm -r typecheck` | `tsc --noEmit` across the workspace |
| `pnpm lint` | Biome lint + format check |
| `pnpm lint:fix` | Biome with `--write` |
| `pnpm -r test` | Vitest across the workspace |
| `python -m pytest apps/simulation` | 100 Python tests |
| `python -m ruff check apps/simulation` | Python lint |
| `python -m mypy --strict apps/simulation/app/engine apps/simulation/app/wire apps/simulation/app/ai` | Strict types on the determinism-critical packages |
| `python -m benchmarks.scenario S1` | Scenario harness — **exits 2**, unimplemented by design |

Two deliberate non-zero behaviours:

- **`benchmarks/scenario` exits 2.** An unimplemented harness that exits 0 reads
  as a green gate that gates nothing.
- **`pnpm -r typecheck` is separate from the build.** TypeScript 7 is the native
  Go compiler with no JavaScript API, so Next.js shells out to the `tsc` CLI.
  Separate steps mean a type error is reported as a type error.

---

## Architecture

```
BROWSER — Next.js 16 · React 19 · R3F 9 · three 0.186
  terrain · buildings · landmarks · day/night · camera
  snapshot buffer + interpolation  ← 15 Hz in, 60 FPS out
             ▲
             │  WebSocket (binary, delta, culled)  +  REST control plane
┌────────────┴─────────────────────────────────────────┐
│ GATEWAY — FastAPI · uvicorn                          │
│  session lifecycle · interest management · reconnect │
├──────────────────────────────────────────────────────┤
│ ENGINE — pure Python · deterministic · fixed 15 Hz    │
│  Clock · World · Agents · Systems · Events · Publish │
│  ┌──────────── append-only event log ──────────────┐  │
├──────────────────────────────────────────────────────┤
│ AI LAYER — optional · async · 30–120 s cadence        │
│  Summarize → LLM → TypedAction → Policy → Engine     │
│  failure/timeout/absent → RuleBasedController        │
└──────────────────────────────────────────────────────┘
```

`apps/simulation` is **one deployable unit**, not two services. Splitting the
gateway from the engine would cost a network hop *inside* the tick loop.

### The determinism contract

This is the spine of the project. Replay, debugging, and any future Core-vs-AI
comparison are meaningless without it, so it is enforced structurally and gated
in CI.

| Rule | Enforcement |
|---|---|
| Fixed timestep. Speed = tick count, never a scaled `dt` | `engine/clock.py`; no wall clock on the tick path |
| Only an explicitly seeded PRNG, never global `np.random` | guard test greps `engine/` |
| Deterministic iteration — sorted ids, no `set` iteration | guard test + `engine/digest.py` |
| Deterministic reductions — `math.fsum`, no variable-stride `np.sum` | review + CI |
| **Total** event ordering via `(tick, priority, source_id, seq)` | `engine/events.py` |
| Seed-independent id bucketing, never builtin `hash()` | `scheduler.stagger_bucket` |
| No parallelism on the tick path | single worker in the Dockerfile |
| `PYTHONHASHSEED=0` + BLAS threads pinned to 1 | Dockerfile, compose, cloudrun, fly, CI |

The determinism suite runs **under three `PYTHONHASHSEED` values** (0, 12345,
999). Two runs inside one interpreter share a single hash seed, so a `set`/`dict`
iteration-order dependency affects both identically — the comparison passes while
the bug is live. Only separate processes with different seeds can catch it. One
green run is not a pass.

Scope, stated honestly: determinism is guaranteed **per engine build on a given
CPU architecture**. Bit-identical replay across different microarchitectures,
Python builds, or BLAS versions is not claimed and not tested.

### The wire protocol

Binary, fixed-width little-endian. One frame is one message, one `ArrayBuffer`,
zero per-entity allocation.

```
Header (28 B)   protocol_version · tick · sim_time · entity_count · flags
Entity record (44 B)   id · x/y/z (i32 cm) · heading_q · pad · vx/vy/vz · state · type …
```

The layout is asserted on **both** sides — `assert struct.calcsize(...) == 28/44`
in Python, and a test that reads `wire.ts` and compares. Two languages, no shared
compiler, nothing but that test preventing drift.

The 44-byte record has two `u16` codes after `heading_q`: the heading and an
explicit pad. Drop the pad and records become 42 B — a ~4.5% bandwidth overrun
that still decodes without error and still looks plausible. Hence the assertion.

NFR-4 (≤ 50 KB/s per client) permits at most **75 of 500** entities at 15 Hz.
That arithmetic is why interest culling is mandatory in V1 rather than an
optimisation.

---

## Layout

```
apps/
  web/            Next.js client — R3F scene, HUD, (net/state/lib reserved)
  simulation/     FastAPI gateway + deterministic engine
packages/
  shared-types/   Wire protocol types + stride constants, shared TS ⇄ Python
benchmarks/       Scenario harness + perf gates
data/
  raw/            Source geo downloads — gitignored, licence pending
  world/          Versioned build artifacts — committed
assets/           Render assets, kept separate from simulation input
infra/            Dockerfiles, compose, deploy targets
docs/             PRD · ARCHITECTURE · TECH_STACK · PLAN
```

`data/` and `assets/` have opposite policies on purpose. `raw/` is licensed and
bulky and stays out of git; `world/` is the derived artifact the app loads and is
committed. `assets/` feeds the renderer, `data/` feeds the simulation — FR-1.3
requires those to be genuinely separate paths.

---

## Documentation

| Document | What it settles |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Requirements, non-goals, success criteria. **Wins on conflict.** |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Topology, tick loop, determinism, wire format, persistence, deploy costs |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Pinned versions, peer-dependency matrix, version-specific hazards |
| [`docs/PLAN.md`](docs/PLAN.md) | Requirement-by-requirement status and what is next |

**Known documentation debt:** the architecture and tech-stack docs cite ADRs
`ADR-1` … `ADR-29`, but **no ADR files exist in this repository**. Decisions are
therefore only justified in prose. That is a real gap — an ADR is the record of a
decision *and its rejected alternatives*, and right now the rejections are
unrecoverable.

---

## Not built yet

Listed so nobody has to infer it from silence.

- **The tick loop.** `engine/` stages are typed stubs that raise
  `NotImplementedError` rather than return plausible-looking wrong answers.
- **Agents.** No citizens, tourists, or vehicles. The HUD's agent readout is `-`.
- **Zones** (FR-1.1d) — the last Phase 0 data gap.
- **Time scaling** (`1/2/5/10`) — camera landed in #15; the time multiplier has not.
- **WebSocket stream.** Transport types are defined in `apps/web/src/net/`; no socket is opened.
- **AETHER AI.** `app/ai/` holds only the seam. `langgraph` is deliberately not
  even declared, which is what keeps the R1 guarantee verifiable.
- **Docker image build** and the **browser runtime probe** — both unexecuted.

---

## Contributing

Every change must pass these locally before a PR:

```bash
pnpm -r typecheck && pnpm lint && pnpm -r test && pnpm --filter web build
python -m pytest apps/simulation -q
```

CI runs the same gates across three jobs, including the determinism job. Branches
are per-concern and short-lived; PRs squash-merge.

Guard tests that encode architectural bans are **mutation-tested** — each was
verified to fire by deliberately breaking what it protects. If you add one, prove
it fails before you trust it. The first `np.random` ban written here silently
never fired, because joining tokens with spaces turned `np.random.rand()` into
`np . random . rand ()`. A determinism guard that protected nothing would have
shipped.