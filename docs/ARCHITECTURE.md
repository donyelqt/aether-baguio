# Architecture — AETHER: Baguio

**Status:** Draft for review
**Version:** 0.1.0
**Date:** 2026-10-03
**Depends on:** [`PRD.md`](./PRD.md) · [`TECH_STACK.md`](./TECH_STACK.md)

---

## 1. Architectural thesis

The simulation is authoritative, deterministic, and LLM-free. The LLM is a bounded,
asynchronous, *advisory* overlay that proposes typed actions which must survive
validation before the engine will accept them.

Two rules follow, and every other decision defers to them:

> **R1 — The engine never depends on the AI layer.** Deleting the AI controller
> directory must produce a fully functional simulation at `0 LLM calls`.
>
> **R2 — An LLM never writes world state.** It emits a structured proposal. Schema
> validation, policy validation, and the engine itself each hold a veto.

---

## 2. System topology

```
┌──────────────────────────────────────────────────────────────────────┐
│ BROWSER — Next.js 16 · React 19 · R3F 9 · Three.js 0.186           │
│                                                                      │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Terrain    │  │ Buildings   │  │ Agents       │  │ HUD / UI   │  │
│  │ + DayNight │  │ + Landmarks │  │ InstancedMesh│  │ Tailwind   │  │
│  └────────────┘  └─────────────┘  └──────────────┘  └────────────┘  │
│         ▲                                                     ▲      │
│         └──────────── Snapshot buffer + interpolation ───────┘      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  WebSocket (binary, delta, culled)
                                │  REST (control plane only)
┌───────────────────────────────▼──────────────────────────────────────┐
│ REALTIME GATEWAY — FastAPI · uvicorn                                 │
│   · session lifecycle          · interest management (who sees what)  │
│   · snapshot encoder (binary)  · reconnect + resume                  │
└───────────────────────────────┬──────────────────────────────────────┘
┌───────────────────────────────▼──────────────────────────────────────┐
│ SIMULATION ENGINE — pure Python · deterministic · fixed 15 Hz         │
│                                                                      │
│   Clock ── World {Terrain, Roads, Buildings, Zones}                   │
│        ── Agents {Citizens, Tourists, Vehicles}                       │
│        ── Systems {Traffic, Routing, Weather, Transit, Emergency}     │
│        ── EventEngine ── AgentScheduler ── StatePublisher            │
│                                                                      │
│   ┌──────────────────────── Event Log (append-only) ───────────────┐  │
│   └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ StrategicState (coarse, throttled)
┌───────────────────────────────▼──────────────────────────────────────┐
│ AI CONTROLLER — optional · async · 30–120 s cadence                   │
│   Summarizer → LLM → TypedAction → Pydantic → Policy → Engine        │
│   Failure / timeout / absent  →  RuleBasedController (identical API)  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository layout

```
aether-baguio/
├── apps/
│   ├── web/              Next.js 16 client (R3F, Zustand, Tailwind 4)
│   └── simulation/       FastAPI gateway + engine (one deployable unit)
├── packages/
│   └── shared-types/     Wire protocol types, generated TS ⇄ Python
├── data/
│   ├── raw/              Source downloads (gitignored, checksummed)
│   └── world/            Versioned build artifacts (committed)
├── assets/
│   ├── terrain/ buildings/ vehicles/ characters/ environment/
├── infra/                Dockerfiles, compose, deploy config
├── docs/                 This document set
└── benchmarks/           Scenario harness + perf gates
```

`apps/simulation/` is one deployable unit, not two services. Splitting the gateway from
the engine at V1 buys nothing and costs a network hop inside the tick loop.

---

## 4. The tick loop

Fixed timestep. No `dt` from wall clock. This is the mechanism behind NFR-1.

```python
TICK_HZ = 15
DT = 1.0 / TICK_HZ          # constant, never wall-clock derived

class SimulationEngine:
    def __init__(self, world, seed: int):
        self.tick = 0
        self.sim_time = 0.0
        self.rng = np.random.Generator(np.random.PCG64(seed))   # NFR-1.2

    def step(self) -> Snapshot:
        # --- sense -------------------------------------------------
        self.environment.update()          # weather, time-of-day
        self.world.spatial_index.rebuild()  # deterministic grid, sorted ids

        # --- decide (staggered, see §5) ----------------------------
        self.scheduler.update()            # utility scoring, budgeted
        self.traffic.update()              # road occupancy, speeds
        self.routing.update()              # reroute on congestion delta
        self.infrastructure.update()       # transit, power, emergency

        # --- act ---------------------------------------------------
        self.events.resolve()              # expire, apply effects
        self.physics.integrate()           # vehicle + pedestrian motion
        self.world.resolve()               # commit, collision, occupancy

        # --- observe -----------------------------------------------
        self.state_publisher.publish()     # dirty-set -> binary deltas
        self.tick += 1
        self.sim_time += DT
        return self.state_publisher.snapshot()
```

### 4.1 Why fixed timestep

Variable-delta stepping makes the simulation a function of wall-clock jitter. That
destroys replay (FR-7.3), breaks Core-vs-AI comparison (any run is unfair), and makes
bugs unreproducible. Speed is controlled by **running N steps per frame**, never by
scaling `dt`.

Speed multiplier `m` at a 60 FPS client produces `m × 15 / 60` ticks per frame. Every
setting except 4× is fractional, so a deterministic accumulator is required, not optional:

| Speed | Ticks/frame | Accumulator behaviour |
|---|---|---|
| 1× | 0.25 | Step 1 tick every 4th frame |
| 2× | 0.50 | Step 1 tick every 2nd frame |
| 5× | 1.25 | Step 1 tick most frames, 2 every 4th |
| 10× | 2.50 | Step 2 ticks most frames, 3 every 2nd |

The accumulator is an integer tick counter, advanced by a rational increment. It lives in
the **server**, not the client — the client requests a speed and the server decides how many
ticks to run, so the accumulator's state is part of deterministic engine state (§8).

> **Speed multipliers multiply engine cost; 10× is not free.** At 10× the engine runs
> **150 ticks/s**. Even at the NFR-2 mean of 20 ms/tick that is **3.0 s of work per wall
> second** — three times a single core, and 9.9 s/s at the 66 ms worst case. Sustained 10×
> therefore needs ≥ 4 cores or a reduced agent count. The honest position: **10× is a
> burst/inspection speed, not a sustained operating point**, and the UI should say so.
> Simulating one simulated day at 10× on 4 cores takes ~72 s of wall time at the 20 ms mean.

**Speed changes must not alter results.** A lower multiplier paces the same tick sequence —
fine. Dropping ticks to catch up is not: that forks the deterministic sequence. If the
engine cannot keep up, it falls behind wall-clock and sim-time visibly lags; it never
discards work.

### 4.2 Tick budget — 66.6 ms total at 15 Hz

| Stage | Budget | Notes |
|---|---|---|
| Environment + spatial index | 3 ms | Rebuild only dirty cells |
| Scheduler (utility decisions) | 12 ms | **Staggered** — not all agents every tick |
| Traffic | 10 ms | Vectorised occupancy via NumPy |
| Routing | 15 ms | Incremental; budget-capped per tick |
| Events + infrastructure | 8 ms | |
| Physics integrate | 10 ms | |
| Publish | 8 ms | Dirty-set only |
| **Total** | **66 ms** | **0.67 ms headroom (99% allocated)** |

> **Two budgets, and they are not the same number.** PRD NFR-2 gates **mean** tick
> duration at **≤ 20 ms**; this table budgets the **worst-case** tick at 66 ms. Both are
> real: NFR-2 is the average the perf gate enforces, and the table is the ceiling a single
> tick may consume before deferring. A tick averaging 20 ms with a 66 ms worst case is
> normal and expected — the deferral rule exists precisely because spikes happen.
>
> The 66 ms figure leaves 0.67 ms (1%) of slack against the 66.67 ms period, so spikes are
> anticipated. **If mean tick duration exceeds 20 ms, or defers exceed 1% of ticks, NFR-2
> is not met** and the tick rate must be lowered — an operator decision, not an automatic one.

**Hard rule — and it is a determinism rule, not a performance rule.** If a stage exceeds
its budget it is **deferred to a later tick and logged**, never compounded, and never
allowed to skip work that changes world state.

> **A wall-clock-triggered skip is forbidden.** Stage overrun is measured in real time, so
> skipping on it would make world state a function of machine load: the same seed would
> diverge between a loaded CI runner and an idle laptop. That is exactly the failure NFR-1
> exists to prevent, and it is invisible to the §8.3 gate when both trials run in one
> process.
>
> What *is* permitted:
>
> | Situation | Response | Deterministic? |
> |---|---|---|
> | Stage exceeds budget | Defer remaining work to the next tick; log `sim.stage.deferred_total` | ✅ work is never dropped |
> | Traffic/routing backlog grows | Process a bounded, **deterministically selected** slice — lowest entity ids first | ✅ selection is by id, not timing |
> | Hard overrun persisting > 1% of ticks | Operator action: lower tick rate. **Never** an automatic behaviour change | ✅ |
>
> Every deferral is a *later* execution of the same work, never a cancellation. Only
`publish()` may be dropped (the next keyframe supersedes it), because publish carries no
simulation state — that is the sole exception, and it is why "a skipped publish is
invisible" is the only safe form of skipping in this engine.

---

## 5. Decision scheduling (staggering)

If all 500 agents run full utility scoring every tick, the scheduler alone exceeds the
budget. The fix is temporal spreading, not optimisation:

```
tick % 4 == agent.id_hash % 4   →  this agent performs a full utility re-evaluation
otherwise                        →  this agent reuses its cached action
```

- 500 agents ÷ 4 ticks = **125 full evaluations per tick**
- Perception (what changed near me) still runs **every** tick — reaction stays real-time
- Utility re-scoring is a 4-tick-stale preference; at 15 Hz that is 267 ms of staleness,
  imperceptible for mode choice and irrelevant for driving

Perception is cheap (a uniform-grid neighbour query, vectorised). Scoring is expensive
(K candidate actions × 5 weighted terms). Splitting them by frequency is the entire
optimisation.

---

## 6. Agent decision architecture

Three mechanisms, non-overlapping responsibilities:

| Mechanism | Use for | Example |
|---|---|---|
| **FSM** | Coarse lifecycle states | HOME → COMMUTE → WORK → COMMUTE → HOME |
| **Behaviour tree** | Reactive priority | Emergency? → Obstacle? → Navigate? |
| **Utility AI** | Competing scored options | Walk 0.31 / Jeepney 0.82 / Taxi 0.54 / Car 0.67 |

### 6.1 Utility scoring

```python
def score(self, action: Action, world: WorldView) -> float:
    """Per-agent weighted utility. Weights are the source of behavioural diversity."""
    # math.fsum, not `sum`: plain float addition is order-dependent and the operand
    # order here is not guaranteed stable across refactors (NFR-1.4).
    return math.fsum((
        self.w.time        * action.time_score(world),
        self.w.cost       * action.cost_score(world),
        self.w.weather    * action.weather_score(world),
        self.w.comfort    * action.comfort_score(world),
        self.w.preference * action.preference_score(world),
    ))

def choose(self, candidates: list[Action], world: WorldView) -> Action | None:
    # No viable action -> the agent idles. A bare max() raises ValueError on an
    # empty list, and one stranded agent would take down the whole tick.
    if not candidates:
        return None
    # Ties break on id, never on iteration order (NFR-1.3).
    return max(candidates, key=lambda a: (self.score(a, world), -a.id))
```

**Why the tiebreak is load-bearing:** `max()` returns the *first* maximum it encounters, so
with equal scores the result depends on list order. Reordering a candidate list would
silently change the simulation. Verified behaviour:

| Case | Result | Deterministic? |
|---|---|---|
| Distinct scores | Highest score wins | ✅ |
| Equal scores, distinct ids | Lowest `id` wins, **either** input order | ✅ the `-a.id` key |
| **Identical score *and* id** | First in list order | ❌ **unreachable by construction** |
| **Empty candidate list** | `None` — agent idles | ✅ guard prevents `ValueError` |

The last two rows are why agent and action **ids must be unique** (see §8): the tiebreak
cannot resolve a collision, and duplicate ids would reintroduce list-order dependence.

**NaN must be rejected before it reaches the ordering key.** A NaN score makes the tuple
ordering non-total, so `max()` falls back to whatever it encounters first — reintroducing
exactly the list-order dependence the tiebreak exists to remove. NaN arises legitimately
(unreachable destination → infinite travel time → `inf - inf` in a cost score), so the
guard belongs in the key rather than in every score function:

```python
def _key(self, action: Action, world: WorldView) -> tuple[float, int]:
    s = self.score(action, world)
    if not math.isfinite(s):
        s = -math.inf      # unusable action sorts last, deterministically
    return (s, -action.id)
```

The §14 property test must cover `score()` output, not only agent state: every scored value
is finite, **or** it was mapped by `_key`. An unguarded NaN is a silent determinism break
that presents as a scoring bug.


### 6.2 Routing

Precomputed graph; **incremental** recomputation, never full re-solve per agent.

- Road network → `scipy.sparse.csgraph` structure at load
- Congestion is an edge weight, updated on dirty cells only
- Reroute triggers: edge cost exceeds threshold, edge closed, destination unreachable
- Reroute is amortised across ticks under the §4.2 routing budget

NetworkX is for **offline** analysis (graph validation, scenario authoring). It is not
on the tick path — its per-call overhead is wrong for 500 agents at 15 Hz.

---

## 7. The wire protocol

This is the single highest-risk performance surface in the project, and where the
original draft was most wrong.

### 7.1 The problem with JSON

Measured against the record layout below (500 agents, 15 Hz):

| Transport | Payload | Client cost |
|---|---|---|
| JSON objects | **≈ 454 KB/s per client** | **7,500 `JSON.parse` calls/sec**, each allocating an object graph |
| Binary, unfiltered | ≈ 323 KB/s | One `ArrayBuffer`, zero allocation |
| Binary + interest culling | **≈ 33 KB/s** ✅ NFR-4 | ~**50** records/frame (10% pass) |

Two things worth stating precisely, because the naive version of this argument is wrong:

- **Binary buys CPU, not bandwidth.** Unfiltered, binary is only **1.4×** smaller than
   JSON (44 B vs 62 B per record). The real win is eliminating 7,500 parses/sec and the
   GC pressure they cause on the main thread — that is what breaks the 60 FPS budget.
- **Culling buys bandwidth.** It is the only lever that reaches NFR-4, and it is the
   reason §7.4 is mandatory rather than an optimisation.

> **Budget constraint.** At 44 B/record and 15 Hz, NFR-4 (≤ 50 KB/s) permits at most
> **76 of 500 entities** — 15% of the world — per client. Above that pass rate the target
> is unreachable at this record size and tick rate. LOD radii must be tuned against this
> number, and `net.bytes_out_per_sec` (§13) is the metric that proves it.

### 7.2 Binary snapshot format

Fixed-width little-endian records in a single `ArrayBuffer`. One frame = one message.
No per-entity JSON, no per-entity allocation.

```
Header (28 B)
  u32  protocol_version
  u32  tick
  f64  sim_time
  u32  entity_count
  u32  flags            // bit0 = full keyframe, bit1 = delta, bit2 = scene event
  u32  reserved

Entity record (44 B)
  u32  id
  i32  x_q              // quantised position, cm, world origin offset applied
  i32  y_q
  i32  z_q
  u16  heading_q        // quantised radians
  u16  reserved0        // explicit padding, keeps the record self-documenting
  i32  vx_q             // quantised velocity, cm/s
  i32  vy_q
  i32  vz_q
  u16  state
  u16  type
  u16  route_cursor
  u16  occupancy
  u32  flags
```

Equivalent struct formats, for the Python encoder and the TypeScript decoder:

```python
import struct

HEADER = "<IIdIII"            # 28 B — version, tick, sim_time, count, flags, reserved
ENTITY = "<IiiiHHiiiHHHHI"    # 44 B — id,x,y,z,heading,pad,vx,vy,vz,state,type,route,occ,flags

assert struct.calcsize(HEADER) == 28
assert struct.calcsize(ENTITY) == 44   # CI gate, ADR-16
```

```ts
// Stride comes from the shared package — never inline the literal 44 here.
import { HEADER_SIZE, ENTITY_STRIDE } from "@aether/shared-types";
```

The two `H` codes after `heading_q` are `heading_q` and `reserved0`; getting this wrong
silently yields a 46-byte record and a ~4.5% bandwidth overrun that still "looks plausible".
That assertion is why it is in CI.

**Why `i32` position, not `i16`:** world extent ≈ 4 km = 400,000 cm. `i16` tops out at
±32,767 cm = ±327 m — it overflows on a city block. `i32` at 1 cm resolution is not
negotiable.

### 7.3 Bandwidth budget

Computed from the layout above at 500 agents / 15 Hz:

| Quantity | Value |
|---|---|
| Bytes per entity | 44 |
| Bytes per frame | 21.5 KB |
| Unfiltered | **≈ 323 KB/s** |
| Culled to 10% pass rate | **≈ 33 KB/s** ✅ |
| Culled to 15% pass rate (NFR-4 ceiling) | ≈ 49 KB/s ✅ |
| Culled to 20% pass rate | ≈ 65 KB/s ❌ over NFR-4 |

These figures are arithmetic over a fixed record size, not estimates — `packages/shared-types/`
must export the stride constant and a test must assert the encoded frame size against it,
so the budget cannot silently drift when a field is added.

### 7.4 Interest management

The encoder never emits an entity the client cannot see.

1. Reject by distance from the client camera (tiered LOD radii, §9 — these are **V1**, not
   a Phase 6 concern; without them the NFR-4 budget is unreachable)
2. Reject by frustum (server-side, coarse AABB — never full geometry)
3. Emit aggregate counts for rejected regions (occupancy, mean speed) rather than nothing

### 7.5 Quantisation precision

| Field | Type | Resolution | Justification |
|---|---|---|---|
| Position | `i32` cm | 1 cm | 4 km world; `i16` overflows. Far finer than the eye resolves at LOD distance |
| Heading | `u16` rad, **wrapped** | **9.587e-5 rad** = 2π/65536 | The real `u16` resolution. A flat "0.0001 rad" would need 62,832 steps and does not fit. Quantise `round((θ mod 2π) × 65536/2π)`, decode `v/65536 × 2π`; far below visible angular error |
| Velocity | `i32` cm/s | 1 cm/s | Max ~200 km/h = 5,555 cm/s, fits comfortably |
| State / type | `u16` | — | Enum index |

### 7.6 Keyframes and delta

- Keyframe (full state) every **60 ticks** (4 s) and on client connect
- Delta frames otherwise; changed fields marked in `flags`. **Note:** with a fixed 44 B
  stride, per-field flags save no *bytes* — a delta frame costs the same per entity as a
  full one. Flags save client work, not bandwidth. §7.3's figures assume 44 B for every
  emitted record and are therefore the conservative bound; a variable-length encoding is
  the only way to beat them, and is deferred.
- Client holds a **snapshot buffer** and interpolates between the last two snapshots
- Render at 60 FPS from a 15 Hz feed — interpolation is mandatory, not cosmetic

---

## 8. Determinism architecture (NFR-1)

Enforced structurally, verified by CI:

| Mechanism | Implementation |
|---|---|
| Fixed timestep | `DT` constant; speed = tick count (§4.1) |
| Seeded PRNG | `np.random.Generator(PCG64(seed))`, never the global `np.random` |
| Deterministic iteration | Sorted ids everywhere; no `set` iteration; no `dict`-order reliance |
| Deterministic reductions | `math.fsum` for float sums; no `np.sum` over variable-stride slices; fixed shapes |
| **Hash randomisation** | **`PYTHONHASHSEED=0` set in the container and CI.** String-keyed `set`/`dict` iteration order varies per process otherwise — this silently breaks replay and is invisible in single-process testing |
| **No parallelism on the tick path** | Tick loop is single-threaded. Thread pools and `asyncio.gather` over float math are forbidden; they reorder reductions |
| Unique ids | Every agent/action id is unique and monotonic. The §6.1 tiebreak is only deterministic if `id` cannot collide |
| Event log | `(tick, type, payload, entity_ids)` append-only, replayable |
| **All inputs logged** | Player input and god-mode injections are logged (PRD FR-7.4); replay replays the log, never re-derives them |
| Monotonic ordering | Events resolve by `order_key = (tick, priority, source_id, seq)` — total, never insertion order (§8.4) |
| **BLAS/NumPy threading** | `OMP_NUM_THREADS=1`, `MKL_/OPENBLAS_NUM_THREADS=1` in Docker + CI (§8.1) |
| **Seed-independent bucketing** | Stagger bucket from integer `agent_id` only — never `hash()` (§8.2) |
| No GPU state | No shader or GPU computation feeds simulation state (PRD NFR-1, item 7) |

**Scope:** determinism is guaranteed **per engine build on a given CPU architecture**.
Bit-identical replay across different microarchitectures, Python builds, or BLAS versions
is not claimed and is not tested.

Two concrete failure modes this table exists to prevent, both verified as real:

- `math.fsum` is not optional. Plain float summation is order-dependent —
  `[1e16, 1.0, -1e16, 1.0]` sums to `1.0` forward and `0.0` reversed. Any reduction whose
  operand order could vary silently destroys replay.
- `max(candidates, key=...)` raises `ValueError` on an empty list (§6.1). An agent with no
  viable action must idle, not crash the tick.

### 8.1 BLAS and NumPy threading

NumPy reductions are **not** automatically deterministic across machines:

- `np.sum` / `np.dot` dispatch SIMD loops whose width and alignment vary by CPU
  (AVX2 vs AVX-512), and pairwise blocking depends on array length. Identical inputs on
  different CPUs can differ in the last ULP.
- BLAS-backed paths (`dot`, `matmul`) partition reductions by **thread count**, so
  `OMP_NUM_THREADS=1` vs `8` can yield different results.

**Rules:**

- Container and CI set `OMP_NUM_THREADS=1`, `MKL_NUM_THREADS=1`,
  `OPENBLAS_NUM_THREADS=1`, `PYTHONHASHSEED=0`. Enforced in `Dockerfile` and CI config.
- Simulation-critical reductions use `math.fsum` (exact) or fixed-shape integer ops.
- The tick loop is single-threaded regardless; these vars exist so an accidental BLAS
  call elsewhere cannot silently vary results.

### 8.2 Deterministic id bucketing

The §5 stagger predicate must not use Python's `hash()` — it is `PYTHONHASHSEED`-dependent
for strings, and any hash-derived bucket makes the per-tick distribution (and therefore
the §4.2 scheduler cost) vary between processes:

```python
def stagger_bucket(agent_id: int, buckets: int = 4) -> int:
    """Deterministic and seed-independent: integer id in, integer bucket out."""
    return (agent_id * 2654435761) % buckets   # Knuth multiplicative hash, ints only
```

Identical on every process and machine. The `id_hash` name used in §5 means this function,
never the builtin `hash()`.

### 8.3 The CI gate

```python
def test_replay_determinism(world_fixture, scenario):
    """FR-7.3 / NFR-1. Two runs, same seed, compared at tick 10,000."""
    a = run(world_fixture, scenario, seed=42)
    b = run(world_fixture, scenario, seed=42)
    assert state_digest(a, tick=10_000) == state_digest(b, tick=10_000)
```

`state_digest` hashes every agent id, position, velocity, and state. This test is the
only thing standing between a refactor and silent replay corruption. It runs on every CI
build and it is not optional.

**It must also run under differing hash seeds.** Two runs inside one interpreter share a
single `PYTHONHASHSEED`, so a `set`/`dict` iteration-order dependency would affect both
identically — the comparison passes while the bug is live. CI runs the suite three times:

```bash
PYTHONHASHSEED=0     pytest tests/determinism -q   # pinned for the container
PYTHONHASHSEED=12345 pytest tests/determinism -q   # deliberately different
PYTHONHASHSEED=999   pytest tests/determinism -q
```

All three digests must agree. This is the only cheap way to catch hash-order
nondeterminism.

### 8.4 Event ordering must be total

An event whose ordering key references a field not in its own schema cannot be totally
ordered, and two events that tie fall back to insertion order — the exact thing §8 forbids.

```python
@dataclass(frozen=True, slots=True)
class Event:
    tick: int
    priority: int          # explicit: emergency before routine
    source_id: int         # unique emitter id (§8) — agent, system, or client session
    seq: int               # per-(tick, source_id) monotonic counter
    type: str
    payload: bytes
    entity_ids: tuple[int, ...]

    @property
    def order_key(self) -> tuple[int, int, int, int]:
        return (self.tick, self.priority, self.source_id, self.seq)
```

`seq` is what removes the last trace of insertion-order dependence: two events from one
source in the same tick are separated by an explicit counter rather than by append order.
Resolution is a stable sort on `order_key`, which is total because `(source_id, seq)` is
unique within a tick. `type` and `payload` are deliberately **not** in the key — they are
data, not ordering.

Player input and god-mode injections are events too (PRD FR-7.4), with
`source_id = client_session_id`, so replay reconstructs them in the correct order relative
to engine events.

---

## 9. Simulation LOD

LOD tiers exist for two **separate** purposes, and conflating them is what breaks
determinism. They must never share a mechanism:

| | Simulation LOD (§9.1) | Interest culling (§9.2) |
|---|---|---|
| **Affects world state?** | **Yes** | **No** |
| Driven by | Authoritative agent positions only | Whatever the client is looking at |
| Deterministic? | Must be — it is part of the simulation | Irrelevant — nothing upstream depends on it |
| Cost | Tick budget (§4.2) | Bandwidth (NFR-4) |

### 9.1 Simulation LOD — authoritative, deterministic

Simulation LOD is a function of **authoritative world state only**: each agent's distance
to the nearest *simulated* point of interest — the player entity when one exists, otherwise
a fixed world-origin anchor for observer mode. It is recorded in engine state, updated on
the tick, and reproduced exactly on replay.

> **A free-flying observer camera must not drive simulation LOD.** If it did, world state
> would become a function of where one client happened to look and when its packet
> arrived. Two clients watching the same seed could diverge, and the Core-vs-AI comparison
> (§4.1) would be confounded by camera path. §8.3's gate has no camera parameter and
> could not detect this class of bug.

| Tier | Distance | Fidelity | Cost |
|---|---|---|---|
| **Full** | 0–200 m | Every agent: perceive, score, act | ~1.0× |
| **Reduced** | 200 m–1 km | Act + coarse perceive; utility re-score every 8 ticks | ~0.3× |
| **Aggregate** | > 1 km | Region statistics only; no individual agents | ~0.02× |

These tiers ship in V1, not Phase 6 — they are what make the §4.2 budget reachable at 500
agents.

**Hysteresis is required**, because a bare threshold is not a pure function of distance:
an agent sitting exactly on a boundary flips tier every tick, thrashing the scheduler and
reintroducing order-dependence through whichever tick the flip lands on.

| Transition | Enter | Drop |
|---|---|---|
| Full → Reduced | > 200 m | < 180 m |
| Reduced → Aggregate | > 1,000 m | < 900 m |

Tier is therefore a function of `(distance, previous_tier)` — both authoritative engine
state, both reproducible under replay.

**Transition cost is bounded.** A tier promotion adds agents to the scheduler in the tick it
lands, so a large promotion must be **staged**: at most one eighth of newly-promoted agents
enter Full per tick, selected by ascending id. The rest stay Reduced for a tick or two.
This caps the per-tick scheduler load regardless of how fast the player moves, and the
staging order is by id, so it stays deterministic.

### 9.2 Interest culling — client-facing, non-authoritative

The bandwidth-side culling in §7.4 is driven by the client's reported view. It is explicitly
**not** part of the simulation: it decides what is *sent*, never what is *computed*. A
client that disconnects, looks away, or lies about its camera changes only its own
rendering — never the world.

The client reports its view origin over the WebSocket as a client message
(`{"type": "view", "origin": [x,y,z], "tick": n}`, §16); the server applies culling
per-tick against that value and never feeds it back into engine state.

---

## 10. AETHER AI layer

### 10.1 Data flow — the LLM is on a leash

```
   World State (full, per-tick, authoritative)
            │
            ▼
   ┌─────────────────────┐   throttled 30–120 sim-seconds
   │  State Summarizer   │   coarse aggregates only:
   │                     │   congestion by corridor, incident list,
   │                     │   transit load, weather, agent census
   └──────────┬──────────┘
              ▼
        LLM (async, timeout-bounded)
              ▼
   ┌─────────────────────┐
   │ Pydantic schema     │   ← HARD VETO on malformed output
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ Policy Validator    │   ← HARD VETO on out-of-policy proposals
   └──────────┬──────────┘
              ▼
   ┌─────────────────────┐
   │ Engine.apply()      │   ← FINAL authority: may still refuse
   └─────────────────────┘
```

The summarizer feeds the LLM **aggregates, never raw per-agent state**. Sending 500
agent records per decision is both expensive and pointless — a traffic strategist needs
corridor-level congestion, not every jeepney's position.

### 10.2 Typed action

```python
class StrategicAction(BaseModel):
    action: Literal[
        "CHANGE_SIGNAL_TIMING", "PRIORITIZE_ROUTE", "CLOSE_LANE",
        "DISPATCH_UNIT", "REROUTE_AMBULANCE", "PRIORITIZE_EMERGENCY_ROUTE",
        "INCREASE_SERVICE", "REROUTE_BUS", "PRIORITIZE_TRANSIT",
        "NO_ACTION",
    ]
    target: str
    duration_seconds: int = Field(ge=5, le=600)
    rationale: str = Field(max_length=280)

    model_config = ConfigDict(extra="forbid")   # reject unknown fields outright
```

`extra="forbid"` matters: without it a hallucinated field is silently dropped, and the
action executes against a target the model may have intended differently.

### 10.3 Policy layer

| Rule | Example |
|---|---|
| Rate limit | ≤ 1 action per strategic agent per 30 sim-seconds |
| Scope | Action targets must exist in the current world |
| Bounded effect | Duration ≤ 600 s; magnitude ≤ policy cap |
| Budget | Max concurrent LLM-driven interventions per scenario |
| Idempotence | Duplicate `(action, target)` within window is a no-op |
| Determinism | LLM actions are **logged as events**; replay re-executes the log rather than re-querying the model |

That last rule is essential: without it, replay of an AI session is impossible, because
the model will not return the same answer twice.

### 10.4 Graceful degradation

Identical interface, two implementations:

```python
class StrategicController(Protocol):
    async def propose(self, state: StrategicState) -> list[StrategicAction]: ...

class RuleBasedController:      # default. Zero LLM calls. Always available.
    ...

class LLMController:            # optional overlay
    ...

class LLMController:            # optional overlay
    async def propose(self, state: StrategicState) -> list[StrategicAction]:
        try:
            raw = await asyncio.wait_for(self._call_model(state), timeout=self._timeout)
        except (TimeoutError, HTTPError, RateLimitError):
            return await self._fallback.propose(state)      # constructed at build time
        try:
            actions = [StrategicAction.model_validate(a) for a in raw]
        except ValidationError:
            return await self._fallback.propose(state)
        return [a for a in actions if self._policy.permits(a)]

def build_controller(mode: Mode, provider: Provider | None) -> StrategicController:
    """Constructed once per session. The fallback is built first, always."""
    fallback = RuleBasedController()
    if mode is Mode.CORE or provider is None:
        return fallback
    return LLMController(provider, fallback=fallback)
```

Failure modes handled identically: no API key · non-2xx response · timeout · malformed
output · policy rejection · context-length overflow. **The fallback is not an error path —
it is the default state.**

Three properties this design guarantees, each of which is easy to get wrong:

- **The fallback cannot fail to exist.** It is constructed first, unconditionally, before
  any provider is touched. There is no code path where `LLMController` exists without one.
- **A filtered action list is a valid result.** If policy rejects everything,
  `propose` returns `[]` and the engine simply applies no intervention that interval. It
  does **not** fall back — falling back would let a policy rejection be silently converted
  into a rule-based action the model did not ask for. Only transport and schema failures
  fall back.
- **Toggling AI mode mid-session is safe**, because it swaps the whole controller behind
  the `StrategicController` protocol rather than mutating a live one. A toggle from AI to
  Core cannot strand an in-flight request; it is dropped at the next `propose` boundary.

> **Determinism consequence:** a degraded AI session is *not* byte-identical to a Core
> session of the same seed, because the rule-based controller makes different choices than
> the model did. PRD Criterion 14 tests a narrower, still meaningful property: that a
> **failed** AI run matches a **Core** run exactly, proving no partial state leaked.

### 10.5 Orchestration — LangGraph

**Decision: LangGraph `1.2.12` orchestrates the AETHER AI layer.** It is a deliberate
choice, and this section states exactly what it buys and what it must not touch.

**What it buys.** Once the AI layer grows beyond a straight line — a Traffic coordinator
that escalates to Emergency on a corridor failure, a retry-and-revalidate loop, a
human-in-the-loop approval pause — the graph *is* the orchestration. LangGraph supplies
the parts that are genuinely painful to hand-roll: conditional edges, super-step
checkpointing, resumable `thread_id` state, and `interrupt()` for operator approval.

**What it must never touch.** The simulation tick loop (§4). The engine does not import
LangGraph; the AI layer imports the engine. This preserves ADR-9: deleting `app/ai/`
leaves a working simulation.

```python
# app/ai/graph.py — thin. Policy, validation, and fallbacks live outside the graph.
from operator import add
from typing import Annotated

from langgraph.graph import END, START, StateGraph
from langgraph.types import Overwrite
from typing_extensions import TypedDict


class StrategicState(TypedDict):
    """Graph state. Never contains raw world state — only aggregates (§10.1)."""
    tick: int
    summary: str
    actions: Annotated[list[StrategicAction], add]   # accumulate across nodes
    rejected: Annotated[list[str], add]


def build_graph(llm: LLMController, policy: PolicyEngine) -> CompiledGraph:
    g = StateGraph(StrategicState)
    g.add_node("summarize", summarize_node)
    g.add_node("propose", make_propose_node(llm))
    g.add_node("validate", make_validate_node(policy))
    g.add_node("approve", approve_node)          # interrupt() for operator sign-off

    g.add_edge(START, "summarize")
    g.add_edge("summarize", "propose")
    g.add_conditional_edges("propose", route_after_propose)
    g.add_edge("validate", "approve")
    g.add_conditional_edges("approve", route_after_approve)
    g.add_edge("approve", END)

    return g.compile(checkpointer=SqliteSaver(...))   # resumable per thread_id


def route_after_propose(state: StrategicState) -> Literal["validate", "__end__"]:
    """A transport/schema failure already fell back inside `propose` (ADR-26).
    A policy rejection ends the run — it must NOT inject a rule-based action."""
    return "validate" if state["actions"] else END
```

**Three LangGraph-specific correctness rules**, each of which is a real footgun:

1. **Merging reducers cannot clear a field.** `Annotated[list, add]` means returning `[]`
   is a no-op, not a reset — `["bad"]` survives. To clear, return
   `{"rejected": Overwrite([])}`. The `validate` node uses `Overwrite` when resetting
   per-run buffers.
2. **Policy rejection routes to `END`, not to a fallback node.** Falling back there would
   inject an unlogged action and break replay determinism (§10.4, ADR-26).
3. **`checkpointer` + `thread_id` is what makes an interrupted run resumable.** In-memory
   savers lose everything on restart; the V1 default is a file-backed SQLite saver, which
   costs nothing and survives the process.

**Determinism is unchanged by this choice.** LLM actions are still logged as events and
replay still re-executes the log rather than re-invoking the graph (§10.3). LangGraph adds
nondeterminism to the *proposal* step only, which was already nondeterministic. Nothing on
the tick path changed.

**Cost.** langgraph 1.2.12 pulls six direct dependencies — `langchain-core`,
`langgraph-checkpoint`, `langgraph-prebuilt`, `langgraph-sdk`, `xxhash`, `pydantic` — plus
`langgraph-checkpoint` transitively brings `ormsgpack`. This is real dependency weight and
it is accepted deliberately: it buys resumable, inspectable, human-interruptible
orchestration that would otherwise be hand-rolled and hand-maintained.

---

## 11. Persistence

Decision: **V1 ships with file-based state. No database.**

| Data | V1 storage | Rationale |
|---|---|---|
| World geometry, roads, landmarks | Versioned files in `data/world/` | Static, small, cacheable, diffable |
| Scenario definitions | JSON files | Authored by hand, reviewable in git |
| Event log | Append-only JSONL, per run | Replay input |
| Replay recordings | Compressed JSONL + keyframes | Post-hoc analysis |
| Run metrics | JSONL | Perf gates and evaluation |

**PostgreSQL + PostGIS and Redis are deferred.** For 50–150 road segments and 10–20
landmarks, a spatial database is pure operational overhead — a connection pool, a
migration tool, and a container that must be running before the app boots. Static world
data does not need one.

They return when a requirement actually demands them:

| Trigger | Component |
|---|---|
| Scenario authoring needs concurrent multi-user editing | PostgreSQL |
| World geometry exceeds ~50k features or needs ad-hoc spatial queries | PostGIS |
| Multiple simulation instances need shared pub/sub or state | Redis |
| Cross-session analytics on run history | PostgreSQL |

This is the **defer-until-forced** rule: infrastructure is added when a requirement
breaks without it, not when it is architecturally tidy.

---

## 12. Deployment

| Layer | Target | Rationale |
|---|---|---|
| Web | Vercel (Next.js) | Zero-config CDN, edge, preview deploys |
| API + Engine | **See §12.4 — Cloud Run, Fly Machines, or a small VPS. All three work.** | §12.1 explains why the naive choice is expensive |
| Database | **None in V1** | §11 |

### 12.1 Cloud Run is a hostile host for a tick loop

Three platform facts constrain this design, and ignoring any of them makes the §4.2 budget
unachievable:

| Fact | Consequence |
|---|---|
| CPU is **not** allocated by default outside request handling | The tick loop runs *between* requests. Without `cpu-throttling: false` / always-allocated CPU, the 66 ms budget has no platform-level basis at all — the container is throttled to zero while no request is in flight |
| `min-instances=1` **forbids scaling to zero** | Choose one. V1 chooses warm-always: a cold start kills the session, and sessions are long |
| Request duration caps at **3600 s** | A session will exceed it. Certain, not a risk — and absent on Fly/VPS (§12.4) |

**Consequence:** the engine is an always-on background worker. It cannot be modelled as
"a request handler that happens to tick". The instance holds a live session registry in
memory, and because local disk on Cloud Run is ephemeral, **session state cannot live only
on local disk** (see §11 and 12.2).

> **Cloud Run is retained as a supported target, not mandated.** It is the right choice for
> short or intermittent sessions and for zero-ops operation. For 24/7 warmth, Fly Machines
> costs roughly half and removes the request-duration cap entirely — see the costed
> comparison in **§12.4**. Nothing in the engine depends on which one you pick.

### 12.2 The 60-minute wall

Cloud Run caps request duration at **3600 s**, and a 3-hour observation session is a
normal use case. Therefore **FR-6.4 (reconnect + resume) is a Phase 0 requirement.**

1. Server assigns each session a monotonically increasing `tick`
2. Client tracks the highest `tick` it successfully applied
3. On reconnect the client sends `{session_id, last_applied_tick}`
4. Server sends a fresh keyframe **plus active scene state** — not a history of frames
5. Client resumes from current tick; the world did not stop while it was away

Two corrections to the naive version of this design, both of which would otherwise fail
silently:

- **Step 4 must include active interventions, not just entity records.** An entity
   keyframe restores positions and states, but `CLOSE_LANE`, `CHANGE_SIGNAL_TIMING`,
   `DISPATCH_UNIT`, and `INCREASE_SERVICE` are **not entity fields**. Without an explicit
   active-intervention block, a reconnecting client would render every closed lane as open
   and show no active incident — a client-side/world divergence that looks like a rendering
   bug. The scene-event encoding is defined in §16.
- **Step 3 requires session affinity or external state.** Cloud Run can recycle an
   instance or route the reconnect to a different one. With `min-instances=1` and a single
   instance this holds by construction; the moment the engine scales horizontally,
   reconnect needs a shared session store. **FR-6.4 is therefore a single-instance
   guarantee**, and multi-instance resume is deferred with the rest of §11's triggers.

Since the client renders from interpolated snapshots, a 60-minute disconnect is a
seamless catch-up — provided the two corrections above are implemented.

### 12.3 Local development

`docker compose -f infra/compose.yaml up --build` → web on `:3000`, API + engine on
`:8000`. No external services, no database. **If local setup requires a running Postgres or
Redis, §11 has been violated.**

### 12.4 Deployment targets — costed

All three targets below run the **same** container from `infra/docker/simulation.Dockerfile`.
The choice is operational, not architectural: nothing in the engine changes. Costs are
computed from published rates on **2026-10-03** for 1 worker, 1 GiB, US region.

#### Why Cloud Run costs what it does

This is not a Cloud Run complaint — it is arithmetic. On **request-based billing** (the
only mode that suits a background tick loop), an open WebSocket keeps the request *active*
for its entire life, so **vCPU bills at the active rate ($0.000024/vCPU-s) for the whole
session** — not for the 66 ms of work per tick. The free tier covers **180,000 vCPU-seconds
≈ 50 CPU-hours/month ≈ 2.1 h/day**. Past that you pay for wall-clock time:

| Always warm, hours/day | Cloud Run /mo |
|---|---|
| 1 | **$0.00** (inside free tier) |
| 2 | $0.86 |
| 4 | $6.23 |
| 8 | $17.68 |
| 12 | $29.12 |
| **24** | **$63.47** |

Computed as `vcpu × 0.000024 × s + GiB × 0.0000025 × s`, minus free tier. Note this is
*lower* than Google Cloud's own calculator estimate for a continuously-loaded service,
which quotes ~$82/mo — the difference is workload shape, so treat these as order-of-magnitude.

#### The options

| Target | Cost (24/7) | Dedicated CPU? | WebSocket cap | Ops burden | Verdict |
|---|---|---|---|---|---|
| **Cloud Run** `min-instances=1` | **$63.47** | Yes (always-allocated) | ⚠️ **3600 s** — §12.2 | None | Keep as the zero-ops default. Correct if you run ≤ ~4 h/day |
| **Fly Machines** `performance-1x` 2 GB | **$33.00** | Yes | ✅ None | Low | **Best balance.** Half the cost, no timeout, volumes for persistence |
| **Fly Machines** `shared-cpu-1x` 256 MB | **$2.19** | ❌ Shared/burst | ✅ None | Low | Cheapest sane option. ⚠️ 256 MB is tight for the engine — expect OOM; use only for Core-mode demos |
| **Hetzner** CAX11 (2 vCPU / 4 GB) | **~$4.31** | Shared vCPU | ✅ None | **High** — you own the box | Cheapest by far. Requires you to patch, monitor, and back up it |
| Render / Railway (PaaS) | $5–7 | Varies | ⚠️ Varies | None | Viable, but WS timeouts and sleep-on-idle need verifying per tier |

Hetzner raised CPX/CCX prices up to +176% in June 2026, so the figure above is the
current shared-vCPU CAX line, not the older CX/CPX pricing. Re-verify before committing —
VPS providers reprice more often than hyperscalers.

#### Onboarding requirements — verified 2026-10-03

"Do I need a credit card?" is a hard gate for some people, so here is the answer per
platform, taken from each provider's own documentation rather than secondhand reports:

| Platform | Card required? | Source |
|---|---|---|
| **Hetzner** | **No** — PayPal, SEPA direct debit (EUR), or bank/wire transfer | [payment-overview](https://docs.hetzner.com/general/billing-and-account-management/billing-at-hetzner/payment-overview/): "We do not accept other forms of payment, even if they are linked to a credit card (e.g. Apple Pay)" |
| **Fly.io** | **No** — buy credits with a prepaid card or PayPal instead | [billing](https://fly.io/docs/about/billing) §"If you don't have a credit card": minimum purchase **$25**. Prepaid cards cannot be a *saved* method, only used to add credits |
| **Railway** | **No** — for the free tier and trial | [pricing FAQ](https://railway.com/pricing): *"Can I try Railway without a credit card? **Yes.**"* $5 trial credit, then $1/mo |
| **Render** | **No** — free tier | [free tier docs](https://render.com/docs/free) — but see the limits below |
| **Cloud Run / Google Cloud** | **Yes** — a payment method is required for identity verification | [signup FAQ](https://cloud.google.com/signup-faqs): "we ask for your name, address, and payment method **to verify your identity**". It is an authorization hold (~$0, released 1–14 days), not a charge |

**So: Cloud Run is the one option on this list that genuinely requires a card.** That is
worth stating plainly, since it is the default most people reach for first.

**But "no card" is not the same as "will run your engine."** Two card-free free tiers are
sized far below what a 15 Hz simulation needs:

| Card-free option | Spec | Verdict for AETHER |
|---|---|---|
| Render Free | **0.1 CPU / 512 MB**; spins down after **15 min idle** — *including while a WebSocket is open*; **ephemeral filesystem**, no persistent disk | ❌ **Cannot run this.** 0.1 CPU is ~30× under the 0.3-core sustained need, and spin-down destroys in-memory session state (§12.2). Fine for the marketing site, useless for the engine |
| Railway Free | 1 vCPU / **0.5 GB**, $1/mo credit, no persistent disk, 3-day logs | ⚠️ **Marginal.** 0.5 GB is tight for the engine, and $1/mo ≈ 1.5 h of vCPU at our rate. Viable for a dev demo, not for the real thing |
| **Hetzner CAX11** | 2 shared vCPU / **4 GB**, ~$4.31/mo, PayPal | ✅ **Best card-free option.** 4 GB comfortably fits the engine, no timeout, real disk, no spin-down |
| **Fly + prepaid credits** | `shared-cpu-1x` 256 MB $2.19 / `performance-1x` 2 GB $33.00 | ✅ works, but 256 MB risks OOM on the engine; $25 minimum credit top-up |

> **Recommendation for a no-card setup: Hetzner CAX11, paid with PayPal (~$4/mo).** It is
> the only card-free option with enough RAM and a persistent filesystem for the engine. Fly
> is the better *managed* experience if you are willing to prepay credits.
>
> If you want zero cost *and* zero commitment, the honest answer is **run it locally**
> (`docker compose -f infra/compose.yaml up`) and put it on LAN or a tunnel. That is
> sufficient for every V1 success criterion in the PRD except multi-client testing.

#### Recommendation — and the constraint that decides it

**Cloud Run if the engine runs ≤ 4 h/day** (≈ $6/mo, inside or near free tier, zero ops).
**Fly Machines `performance-1x` if it must stay warm 24/7** ($33/mo) — it removes the
3600 s cap entirely, which deletes §12.2's reconnect constraint and its two corrections.
That is not just $30/mo; it is removing a whole class of Phase 0 work.

**Do not pay for horizontal scaling in V1.** The engine is single-instance by design
(ADR-24) and §11 defers the database. Any target whose value depends on replicas is
wasted spend here. A small VPS is the cheapest correct answer *if* you want the CPU
guarantee and are willing to own the machine.

**Anti-requirement:** no infra is adopted in V1 that the PRD does not need. Specifically —
no load balancer, no Redis, no Postgres, no multi-region, no autoscale policy. Each has a
stated trigger in §11 and none of those triggers are met.

#### Portability, so this stays a decision and not a commitment

Because all targets run the same image and the engine is a single process behind FastAPI,
switching is a `fly deploy`, a `gcloud run deploy`, or an SSH session. Keep the WebSocket
endpoint, the health check, and the graceful-shutdown hook in `infra/` — not in app code —
so any target can host it.

---

## 13. Observability (NFR-8)

Structured metrics emitted per tick and per scenario run:

| Metric | Type | Use |
|---|---|---|
| `sim.tick.duration_ms` | histogram | §4.2 budget enforcement |
| `sim.tick.rate_hz` | gauge | Detect drift from 15 Hz |
| `sim.agents.active` | gauge | Population tracking |
| `sim.stage.deferred_total` | counter | Budget overruns — **deferrals, not skips** (§4.2). Gate: > 1% of ticks fails NFR-2 |
| `sim.agents.by_tier` | gauge | Full / Reduced / Aggregate counts (§9) |
| `net.bytes_out_per_sec` | gauge | NFR-4 enforcement |
| `ws.reconnect_total` | counter | §12.1 |
| `llm.calls_total` | counter | **NFR-6: must be 0 in Core** |
| `llm.latency_ms` | histogram | AI cost analysis |
| `llm.cost_usd` | counter | Evaluation (§11 PRD) |
| `llm.fallback_total` | counter | Degradation health |

`llm.calls_total == 0` in Core mode is a **CI-enforced assertion**, not a manual check.

---

## 14. Testing strategy

| Level | Tool | Scope | Gate |
|---|---|---|---|
| Unit | `pytest` | Utility scoring, FSM transitions, quantisation round-trip, policy rules | Every commit |
| Property | `hypothesis` | Serialiser round-trip; no NaN/inf in agent state; bounded positions | Every commit |
| **Determinism** | `pytest` | Seeded replay identical at tick 10,000 (§8.1) | **Every commit — blocks merge** |
| Integration | `pytest` + `httpx` | WS connect → snapshot → reconnect → resume | Every commit |
| Simulation scenario | `pytest` | S1 (surge + rain + accident) produces expected event classes | Every commit |
| E2E | `Playwright` | Load, click-to-inspect, inject event, toggle AI mode, reconnect | Pre-release |
| Perf | `pytest-benchmark` | Tick ≤ 20 ms at 500 agents; bytes ≤ 50 KB/s | Nightly |
| Visual | `Playwright` screenshots | Day/night, rain, god-mode overlays | Pre-release |

Coverage target: 80% on `packages/simulation/agent/` and `ai/`. No global coverage
number — it incentivises testing trivia.

---

## 15. Architectural decisions

| # | Decision | Rationale | Revisit when |
|---|---|---|---|
| ADR-1 | Engine is authoritative; client renders interpolated snapshots | One source of truth; cheating and divergence impossible | Never |
| ADR-2 | Fixed timestep, speed via tick count | Determinism (NFR-1) | Never |
| ADR-3 | Binary quantised wire protocol, 44 B/entity | JSON costs 7,500 `JSON.parse`/sec and 454 KB/s (§7.1) | Bandwidth > 100 KB/s |
| ADR-4 | Staggered decision scheduling | Full re-score per agent blows the tick budget | Agent count < 100 |
| ADR-5 | Interest management server-side | The only path to the bandwidth target | Never |
| ADR-6 | **LangGraph `1.2.12` orchestrates the AI layer only** — never the tick loop | Accepts ~6 deps for conditional edges, resumable `thread_id` checkpoints, and `interrupt()`; hand-rolling that is more code and less reliable (§10.5) | Only if graph complexity collapses to a straight line again |
| ADR-7 | No database in V1 | Operational overhead with zero benefit at this scale | §11 triggers |
| ADR-8 | Reconnect/resume built in Phase 0, including active-intervention state | Cloud Run's 60-min cap is certain (§12.2) | Never |
| ADR-9 | AETHER AI is a plugin behind a protocol | Enforces R1; deletion yields a working sim | Never |
| ADR-10 | Simulation LOD from authoritative state + hysteresis, staged promotion; client camera drives **culling only** | Camera-driven simulation LOD makes world state depend on where one client looked (§9) | Never |
| ADR-11 | `rasterio`/`pyogrio` instead of raw GDAL | GDAL ships **no PyPI wheels** — sdist only | Never |
| ADR-12 | Python first, Rust/C++/WASM for the traffic kernel only | Bounded migration path; not a rewrite | Mean tick > 20 ms at 500 agents (PRD R1) |
| ADR-13 | `PYTHONHASHSEED=0`, single-threaded tick loop, `math.fsum` for reductions | String-hash order and float summation order silently break replay (§8) | Never |
| ADR-14 | All player input and injections logged to the event log | FR-7.3 replay is unachievable for interactive sessions otherwise | Never |
| ADR-15 | Empty candidate set → agent idles, never raises | `max()` on `[]` raises `ValueError`; one stranded agent would kill the tick (§6.1) | Never |
| ADR-16 | Wire stride constant defined once and asserted by test | Bandwidth budget silently drifts when a field is added (§7.3) | Never |
| ADR-17 | `postprocessing` pinned explicitly | Non-optional peer of `@react-three/postprocessing`; omitting it breaks install (TECH_STACK §2) | Never |
| ADR-18 | Budget overrun → **defer**, never skip; only `publish()` may drop | A wall-clock-triggered skip makes world state a function of machine load (§4.2) | Never |
| ADR-19 | `OMP/MKL/OPENBLAS_NUM_THREADS=1`; `math.fsum` for critical reductions | BLAS partitions reductions by thread count; SIMD width varies by CPU (§8.1) | Never |
| ADR-20 | Stagger bucket from integer id, never `hash()` | `hash()` is `PYTHONHASHSEED`-dependent, making per-tick load vary (§8.2) | Never |
| ADR-21 | NaN scores mapped to `-inf` before ordering | NaN breaks tuple total ordering, reintroducing list-order dependence (§6.1) | Never |
| ADR-22 | Determinism tested under 3 different `PYTHONHASHSEED` values in separate processes | Two runs in one interpreter share a hash seed and cannot detect the bug (§8.3) | Never |
| ADR-23 | Event ordering key `(tick, priority, source_id, seq)` — total, all fields present | A key referencing an absent field falls back to insertion order (§8.4) | Never |
| ADR-24 | Reconnect is a **single-instance** guarantee | Cloud Run local disk is ephemeral and no session store exists in V1 (§12.2) | Horizontal scaling of the engine |
| ADR-25 | Engine host requires **always-allocated CPU** and a single warm instance | Default Cloud Run CPU throttling would void the §4.2 budget between requests (§12.1) | Never |
| ADR-26 | Policy rejection returns `[]`; it does **not** fall back | Fallback on rejection would inject an unlogged action and diverge replay (§10.4) | Never |
| ADR-27 | **Host target is a cost decision, not an architectural one.** Cloud Run ≤4 h/day; Fly `performance-1x` for 24/7; Hetzner CAX11 (~$4, PayPal) when no card is available | Cloud Run bills vCPU at the active rate for a live WebSocket's whole life — $63/mo warm vs $33 on Fly vs $4 on Hetzner. Cloud Run also requires a card for identity verification; Hetzner and Fly do not (§12.4) | Usage changes, a rate change, or card availability |
| ADR-28 | **No infra adopted in V1 without a PRD requirement** | Load balancer, Redis, Postgres, multi-region, autoscaling all have §11 triggers that are unmet | §11 trigger fires |
| ADR-29 | **Render/Railway free tiers are web-tier only, not engine hosts** | Render Free is 0.1 CPU/512 MB and spins down after 15 min idle even with a WebSocket open — far under the engine's sustained need (§12.4) | Never — these are not engine hosts at any price |

---

## 16. Scene events and intervention state

Entity records alone are insufficient to reconstruct what the client draws. Interventions
applied by the AI layer are **not** entity fields, so a reconnecting client would render
every closed lane as open. This section defines the second frame type.

Header `flags` bit 2 marks a **scene-event frame**; the body carries an ordered list of
active-state records, sent in full on every keyframe and incrementally on deltas:

```python
SCENE = "<BBIII"   # 14 B — kind u8, status u8, target_id u32, start_tick u32, end_tick u32

class SceneKind(IntEnum):
    LANE_CLOSED = 1
    SIGNAL_TIMING_OVERRIDE = 2
    ACTIVE_INCIDENT = 3
    UNIT_DISPATCHED = 4
    SERVICE_LEVEL_CHANGE = 5
```

Keyframe sends **all** currently-active records. Delta sends only transitions since the
last frame (opened, modified, expired). This is what makes §12.2 step 4 sufficient, and it
must be implemented alongside reconnect — it is not an optional extra.

Client messages (`view` origin, mode toggle, event injection) ride the same socket in the
opposite direction with their own small type tag; `view` is explicitly non-authoritative
(§9.2).

---

## 17. Known limitations

Stated plainly rather than discovered later:

1. **Single simulation instance per process, and reconnect assumes it.** Horizontal scaling
   requires partitioning the world, which conflicts with emergent cross-boundary
   behaviour — and Cloud Run's ephemeral disk means a session cannot survive an instance
   recycle without a shared store (ADR-24). Accepted for V1.
2. **10k+ agents is unproven.** ADR-12 is a hypothesis with a trigger condition, not a plan.
   Instrument from tick one. V1 is gated at 500–700 agents, so this does not block shipping.
3. **Replay stores events, not full state.** Rewind re-executes from a keyframe; very old
   rewinds are expensive.
4. **Client-side player prediction is not netcode-complete.** No lag compensation, no
   rollback. Adequate for a single player, wrong for competitive multiplayer.
5. **Road network is hand-curated for V1.** GIS ingestion is designed but unbuilt; real
   Baguio topology will stress the routing assumptions.
6. **10× speed is not sustainable on one core** (§4.1) — 3.0 s of work per wall second at
   the NFR-2 mean. It is an inspection speed, not an operating point.
7. **Delta frames do not save bandwidth** at a fixed 44 B stride (§7.6). Variable-length
   encoding is the only lever and is deferred.
8. **Determinism is per-build and per-architecture** (§8). Cross-machine bit-exact replay is
   explicitly not claimed.
9. **The 66 ms worst-case budget assumes one core** doing all engine work. Agent
   parallelism is out of scope and would need per-shard determinism to preserve replay.
