# PRD — AETHER: Baguio

**Status:** Draft for review
**Version:** 0.1.0
**Date:** 2026-10-03
**Owner:** Principal Engineering
**Related:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`TECH_STACK.md`](./TECH_STACK.md)

---

## 1. Vision

A browser-native 3D multi-agent simulation of Baguio City where citizens, tourists,
vehicles, transit, weather, and emergency systems share one authoritative world state
and produce legible urban behaviour **without any LLM in the loop**.

The LLM is an *optional strategic overlay*, not a dependency. That inversion is the
project's central architectural thesis and it is a testable claim, not a slogan:

> The city is autonomous at `0 LLM calls`. Adding sparse LLM strategists is an
> experiment layered on a deterministic world, never the thing that makes it alive.

### 1.1 Product identity

| | |
|---|---|
| **Name** | AETHER: Baguio |
| **Category** | Real-time 3D multi-agent urban simulation |
| **Venue** | Central Baguio — Burnham Park, Session Road, City Hall, Cathedral, CBD |
| **Surface** | Desktop web browser (Chrome/Edge/Firefox, WebGL2) |
| **Versions** | `AETHER Core` (no LLM) · `AETHER AI` (Core + strategic LLM agents) |

---

## 2. Goals

| ID | Goal | Measure |
|---|---|---|
| **G1** | Visually spectacular on first load | First meaningful frame ≤ 3s on mid-tier laptop; viewer reads "real 3D city" within 10s unaided |
| **G2** | Genuine multi-agent autonomy | Every agent perceives → updates state → scores goals → acts, reacts, and adapts. No scripted sequences |
| **G3** | Emergent behaviour | Tourism surge and road accident produce downstream traffic/transit responses with no handler coding the consequence |
| **G4** | Interactive | Observe, walk the city, drive a vehicle, inspect any entity, inject events — without pausing the world |
| **G5** | LLM optional | Identical behaviour with no API key, dead endpoint, 10s inference latency, or AI mode toggled off |
| **G6** | Legible | Any agent's state is inspectable with a causal reason string |

---

## 3. Non-goals (V1)

Explicitly **out of scope**. Any of these appearing in a V1 PR is a scope violation.

- 1:1 or photoreal reconstruction of Baguio
- Complete barangay coverage (129 barangays)
- Replacement for Google Maps or any official municipal system
- Real economic forecasting, real emergency command, real-world operational control
- Thousands of LLM-driven NPCs
- Multiplayer / social features / user accounts
- Mobile or touch-first UX

---

## 4. Users and modes

Three modes, one continuous world. **The world never stops when the user enters it.**

### 4.1 Observer (default)

Free-fly camera.

| Input | Action |
|---|---|
| `W A S D` | Move |
| Mouse drag | Look |
| Scroll | Zoom / dolly |
| `Space` | Pause / resume |
| `1` `2` `5` `10` | Time scale 1× / 2× / 5× / 10× |
| Click entity | Open inspector |

### 4.2 Player

First-person/third-person embodied agent.

| Input | Action |
|---|---|
| `W A S D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| `E` | Interact |
| `F` | Enter / exit nearest vehicle |
| `Esc` | Menu |

The player is registered as a real simulation entity: it appears in traffic, occupies
road space, and can be collided with. It is **not** a god-mode camera.

### 4.3 God mode

Simulation operator. Full authority over environment, not over agent internals.

| Axis | Options |
|---|---|
| Weather | Clear · Cloudy · Rain · Storm |
| Time | Dawn · Day · Sunset · Night |
| Events | Accident · Road Closure · Heavy Rain · Tourism Surge · Transit Failure · Power Failure · Emergency |

---

## 5. Agent model (V1)

### 5.1 Citizens

```ts
interface Citizen {
  id: string
  position: Vec3
  home: BuildingRef
  workplace: BuildingRef
  destination: BuildingRef
  occupation: string
  money: number
  health: number
  preferences: PreferenceWeights
  schedule: ScheduleEntry[]
  goal: GoalRef
  state: CitizenState
}
```

States: `HOME · COMMUTING · WORKING · SHOPPING · EATING · RESTING · WALKING · WAITING · EVACUATING`

### 5.2 Tourists

```ts
interface Tourist {
  id: string
  origin: string
  hotel: BuildingRef
  budget: number
  interests: InterestWeights
  groupSize: number
  itinerary: Stop[]
  currentLocation: BuildingRef
}
```

Tourism is a **simulation variable**, not a spawn script. A tourism surge must raise
Burnham demand → Session Road demand → pedestrian density → traffic, purely emergently.

### 5.3 Vehicles

```ts
interface Vehicle {
  id: string
  type: VehicleType
  position: Vec3
  velocity: Vec3
  destination: NodeRef
  route: NodeRef[]
  occupancy: number
  capacity: number
  state: VehicleState
}
```

Types: `private · taxi · jeepney · bus · motorcycle · delivery · ambulance · firetruck · police`

### 5.4 System agents (non-physical)

`traffic · transit · emergency · power · weather · city-operations`

Operate at higher abstraction over the world; never simulate individual bodies.

### 5.5 Decision architecture

Three mechanisms, chosen per decision type:

- **FSM** — predictable sequencing (HOME → COMMUTE → WORK → COMMUTE → HOME)
- **Behaviour tree** — hierarchical priority (Emergency? → Obstacle? → Navigate?)
- **Utility AI** — competing scored options

Utility form:

```
utility(a) = Σ  w_i · score_i(a)
             i ∈ {time, cost, weather, comfort, preference}
```

Weights are per-agent. **Same environment must be able to produce different behaviour.**

---

## 6. V1 world scope

| Quantity | Target | Counts toward "total agents" budget |
|---|---|---|
| Landmarks | 10–20 | No |
| Road segments | 50–150 | No |
| Pedestrians (citizens **+** tourists combined) | 100–500 | Yes |
| Vehicles | 50–200 | Yes |
| **Total agent ceiling** | **700** | — |
| Day/night cycle | Required | No |

**The performance budget in NFR-2 and Criterion 2 is stated at 500 total agents, which is
the realistic operating point, not the §6 ceiling of 700.** Both numbers are tested; the
700-agent case is the "degrades gracefully" case and has its own criterion (Criterion 10).

Geographic data sources ([Baguio Open Data Portal](https://data.baguio.gov.ph/),
[Geoportal Philippines](https://geoportal.gov.ph/)) are **inputs to a transformed
simulation model**, never copied verbatim into the world.

---

## 7. Functional requirements

Each requirement is independently verifiable. `V1` = must ship in Phase 0–4.

### FR-1 World
| ID | Requirement | V1 |
|---|---|---|
| FR-1.1 | Render terrain, road network, landmarks, and zones for central Baguio | ✅ |
| FR-1.2 | Full day/night cycle with correct sun position and lighting | ✅ |
| FR-1.3 | Distinguish GIS road geometry (simulation) from visual 3D assets (render) | ✅ |
| FR-1.4 | Load the world from a versioned, reproducible build artifact | ✅ |

### FR-2 Agents
| ID | Requirement | V1 |
|---|---|---|
| FR-2.1 | Spawn and sustain 100–500 citizens and 50–200 vehicles | ✅ |
| FR-2.2 | Agents select goals via utility scoring with per-agent weights | ✅ |
| FR-2.3 | Agents navigate the road graph via pathfinding, not waypoint scripts | ✅ |
| FR-2.4 | Agents perceive local agents and react to them (congestion, obstacles, hazards) | ✅ |
| FR-2.5 | Agent state transitions are driven by FSM + behaviour tree | ✅ |
| FR-2.6 | Tourists hold budget, interests, group size, and an itinerary | ✅ |

### FR-3 Traffic and emergent routing
| ID | Requirement | V1 |
|---|---|---|
| FR-3.1 | Each road segment has a capacity; congestion reduces speed above it | ✅ |
| FR-3.2 | Vehicles independently reroute when a route is congested or blocked | ✅ |
| FR-3.3 | Congestion self-stabilises without central control | ✅ |

**FR-3.3 pass condition:** controlled scenario (uniform demand, 200 vehicles, no injected
events). Mean per-segment speed across all segments converges to within ±10% of the mean
of its own final 30 sim-seconds, measured over ticks 4,500–5,400; no segment exceeds
1.5× the fleet mean at any point in the final 60 seconds. Asserted against the per-tick
metric stream — **not** against an event log, which records inputs rather than emergent
consequences.

### FR-4 Events and environment
| ID | Requirement | V1 |
|---|---|---|
| FR-4.1 | Events are first-class objects with type, location, severity, window, effects | ✅ |
| FR-4.2 | Inject every event type listed in §4.3 from the UI | ✅ |
| FR-4.3 | Weather affects agent utility scoring (travel time, comfort, mode choice) | ✅ |
| FR-4.4 | Emergency agents detect incidents and dispatch units autonomously | ✅ |
| FR-4.5 | Events resolve and expire deterministically on expiry | ✅ |

### FR-5 Interaction
| ID | Requirement | V1 |
|---|---|---|
| FR-5.1 | Free camera with pan/look/zoom and 1×–10× time scaling | ✅ |
| FR-5.2 | Click any entity → inspector showing type, destination, speed, occupancy, state, and a **causal reason** | ✅ |
| FR-5.3 | Player controller: walk, sprint, jump, interact | ✅ |
| FR-5.4 | Player can enter a vehicle and drive it | ✅ |
| FR-5.5 | The player is a first-class simulation entity visible to other agents | ✅ |

### FR-6 Networked state
| ID | Requirement | V1 |
|---|---|---|
| FR-6.1 | Authoritative world state, published at exactly the sim tick rate (15 Hz per NFR-2) | ✅ |
| FR-6.2 | Client interpolates between snapshots to a smooth 60 FPS render | ✅ |
| FR-6.3 | Delta updates; full state is never sent per frame | ✅ |
| FR-6.4 | Clients reconnect and resume after a dropped session | ✅ |

### FR-7 Replay
| ID | Requirement | V1 |
|---|---|---|
| FR-7.1 | Every meaningful event enters an append-only event log | ✅ |
| FR-7.2 | Replay: rewind, play, pause, 2× | ✅ |
| FR-7.3 | A replay from a seed + recorded inputs reproduces world state exactly (NFR-1) | ✅ |
| FR-7.4 | **All player input and all god-mode injections are recorded to the event log** | ✅ |

**FR-7.4 exists because FR-7.3 is otherwise unachievable for any interactive session.**
The player is a first-class entity (FR-5.5); its movement and every injected event are
inputs to the world. Without them in the log, a seeded replay silently diverges from the
original run. Recorded per tick: input type, value, and originating client/session id.

### FR-8 AETHER AI (optional layer)
| ID | Requirement | V1 |
|---|---|---|
| FR-8.1 | Strategic agents: Traffic, Emergency, Transit, City Operations | Phase 5 |
| FR-8.2 | Strategic agents act every 30–120 simulated seconds, never per-tick | Phase 5 |
| FR-8.3 | LLM output **never** mutates world state directly | Phase 5 |
| FR-8.4 | All output passes structured schema validation → policy validation → engine | Phase 5 |
| FR-8.5 | LLM failure, timeout, or absence → rule-based controller takes over seamlessly | Phase 5 |
| FR-8.6 | Every LLM decision is logged with cost, latency, and outcome | Phase 5 |

---

## 8. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| **NFR-1** | **Determinism** — same seed + same inputs ⇒ bit-identical **server-side simulation state** at every tick | Hard. Replay, debugging, and Core-vs-AI evaluation depend on it |
| **NFR-2** | Sim tick at 15 Hz, ≤ 20 ms CPU per tick at **500** agents; ≤ 33 ms at the 700-agent ceiling | Both points tested (Criteria 2, 10) |
| **NFR-3** | Client 60 FPS at 1920×1080, ≤ 120 draw calls, ≤ 400 MB VRAM | Mid-tier laptop |
| **NFR-4** | Network ≤ 50 KB/s per client (binary + culled) | Measured, not estimated |
| **NFR-5** | First meaningful frame ≤ 3 s | Cold load, mid-tier laptop |
| **NFR-6** | Graceful degradation — no API key ⇒ zero LLM calls, zero errors, zero blocked features | Hard |
| **NFR-7** | Simulation runs fully client-replayable from the event log | Hard |
| **NFR-8** | Observability — per-tick CPU, agent counts, bandwidth, LLM cost/latency emitted as metrics | Hard |

### NFR-1 determinism contract

Non-negotiable, because FR-7 replay and any Core-vs-AI comparison are meaningless without it.

**Scope — read this first.** "World state" means the **authoritative simulation state held
by the Python engine** (agent ids, positions, velocities, FSM states, event queue). It
explicitly **excludes** everything the client computes: rendering, interpolation between
snapshots, camera, and UI. The engine runs server-side; the browser is a renderer and an
input device. Nothing in the tick path executes on a GPU.

1. Fixed timestep. No wall-clock reads inside simulation code.
2. All randomness from an explicitly seeded PRNG — `numpy.random.Generator(PCG64)` in the
   Python engine. (No browser-side PRNG exists or is needed; see scope above.)
3. Deterministic iteration order everywhere — sorted keys, no `set` iteration, no reliance
   on `dict` ordering across versions.
4. No floating-point reductions whose order varies with thread count.
5. Event log records `(tick, type, payload, affected_entity_ids)`.
6. **All external inputs are logged, not just engine events** — player input and god-mode
   injections (FR-7.4). Replay replays the log; it never re-derives them.
7. **No GPU or shader computation contributes to simulation state.** WebGL2 float results
   are not guaranteed bit-identical across vendors (Khronos GPUWeb #1048), so any
   GPU-derived quantity is excluded from state by construction. Agent motion is integrated
   on the CPU; the GPU only draws the result.
8. **Determinism is guaranteed per engine build**, on identical CPU architecture. Bit-identical
   replay across differing CPU microarchitectures, Python builds, or BLAS versions is
   **not** claimed. Criterion 7 tests two runs of the same build.

---

## 9. Success criteria

Every criterion is **falsifiable and measured**, with the measuring instrument named.
Criteria are split by phase so that no V1 gate depends on a Phase 5 feature.

### 9.1 V1 criteria (Phases 0–4) — all must pass

| # | Criterion | Measurement |
|---|---|---|
| **1** | Cold load reaches first rendered 3D frame in **≤ 3 s** | `performance.now()` at first `onRender` after navigation, hard reload, 20-run median |
| **2** | **500 total agents** sustained at **≥ 15 Hz** with **≤ 20 ms** mean tick CPU over 600 consecutive ticks | `sim.tick.duration_ms` histogram (NFR-8) |
| **3** | *Tourism Surge* raises mean pedestrian density on Session Road by **≥ 20%** vs. a no-event control run at tick 3,600, **with no handler coding the consequence** | Paired A/B, same seed, two runs; metric = mean density per segment. **Not** the event log — that records the input, not the effect |
| **4** | *Accident* triggers emergency dispatch **without operator input** | `DISPATCH_UNIT` appears in the event log with `origin=autonomous`; operator-initiated dispatches are tagged `origin=operator` and are excluded |
| **5** | Congestion self-stabilises per the **FR-3.3 pass condition** | Per-tick metric stream |
| **6** | The player is a first-class entity: AI vehicles demonstrably react to the player's presence on the road network | A/B — same seed; presence/absence of a parked player vehicle produces ≥ 1 logged vehicle state change (`REROUTING`, `YIELDING`) within 30 sim-seconds |
| **7** | Client holds **60 FPS** (p95 frame time ≤ 16.7 ms) at 1920×1080 with 500 agents, **≤ 120 draw calls**, ≤ 400 MB VRAM | Browser performance profiler, 60 s capture |
| **8** | Measured network **≤ 50 KB/s** per client at 500 agents | `net.bytes_out_per_sec` gauge, 5-min mean |
| **9** | After a forced socket drop, the client reconnects and resumes **without a full keyframe resend** | Bytes on reconnect < 25 KB; world tick continues advancing server-side throughout |
| **10** | **700 total agents** (the §6 ceiling) sustains **≥ 15 Hz** with **≤ 33 ms** mean tick CPU, and **defers** no more than 1% of ticks | `sim.tick.duration_ms` + `sim.stage.deferred_total` (ARCH §4.2) |
| **11** | Same seed replayed twice on the **same build** yields **identical** `state_digest` at tick 10,000 | Automated determinism test, CI-blocking |
| **12** | An interactive session (player movement + 3 injected events) replays to an identical digest | Automated replay test, CI-blocking |

### 9.2 Phase 5 criteria (AETHER AI) — evaluated only after Phase 5 ships

These are **not** V1 gates. Listed separately so V1 cannot be declared done on a
feature that does not exist yet.

| # | Criterion | Measurement |
|---|---|---|
| **13** | With **no API key set**, a 30-minute session logs **exactly zero** `llm.calls_total` and zero errors | Metrics |
| **14** | With AI mode on and the endpoint returning **500s for 10 minutes**, simulation state at tick 5,400 is **bit-identical** to a Core run of the same seed | Paired Core/AI digest comparison — "unchanged" means exactly this |
| **15** | Every applied LLM action has a matching logged decision with schema verdict, policy verdict, latency, token count, and cost | `llm.*` metrics + decision log |
| **16** | Scenario S1 executed under Core and AI produces a comparable metrics report | §11 evaluation programme |

### 9.3 What "unchanged" means (Criterion 14)

Not "looks the same". **Bit-identical `state_digest` at a fixed tick between a Core run
and a degraded AI run of the same seed.** Any divergence means the failed LLM call leaked
into the world, which is exactly what FR-8.3 forbids.

---

## 10. Delivery phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — World** | Terrain, roads, Burnham, Session Road, landmarks, day/night, camera, **FR-6.4 reconnect/resume** | 1, 9 |
| **1 — Agent core** | Citizens, tourists, vehicles, utility AI, behaviour trees, pathfinding, traffic | 2, 7, 8 |
| **2 — Emergence** | Weather, accidents, closures, emergency response, tourism surge, dynamic routing | 3, 4, 5, 11 |
| **3 — Player** | Controller, vehicle entry, driving, interaction, player-as-entity, FR-7.4 input logging | 6, 12 |
| **4 — God mode** | Event injection, weather/time control, speed, inspection, traffic visualisation, instancing | 10 |
| **5 — AETHER AI** | Strategic LLM agents, summarisation, structured actions, policy validation, fallback, decision log | 13, 14, 15, 16 |
| **6 — Scale** | 1k → 5k → 10k agents via LOD, spatial partitioning, scheduling | Documented scale thresholds + a re-run of Criterion 10 |

**Phases 0–2 constitute AETHER Core and must ship complete before Phase 5 begins.** If
Phase 5 starts before Core is genuinely autonomous, the project's thesis is untestable.

**Instancing and LOD ship in Phase 1 and 4, not Phase 6.** Criterion 7's 120-draw-call
budget at 500 agents is arithmetically unreachable without instancing, so it is a Phase 1
requirement; NFR-3 cannot be met by a V1 that defers it.

---

## 11. Evaluation programme (Phase 5+)

Not a nice-to-have — this is the research contribution.

Run **identical seeded scenarios** under Core and AI. Scenario S1:
*+30% tourism, heavy rain, road accident on a Session Road segment.*

| Metric | Category |
|---|---|
| Average travel time | Core quality |
| Peak congestion index | Core quality |
| Emergency response time | Core quality |
| Route changes | Behavioural |
| Simulation stability (no deadlock/NaN) | Core quality |
| Agent decision latency | Performance |
| CPU / memory | Performance |
| LLM calls, latency, cost | AI cost |

The question is **not** "which is better." It is:

> What does sparse strategic LLM reasoning measurably add to an otherwise
> autonomous multi-agent urban simulation?

---

## 12. Risks

| ID | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Python cannot sustain 10k agents at 15 Hz | **High** | Instrument from tick one (NFR-8). **This is a risk transfer, not a fix** — see below |
| R1a | *(R1 escalation)* Rust/C++/WASM rewrite breaks determinism or costs more than it saves | Medium | Bounded to the traffic kernel only, behind the same interface; determinism gate (Criterion 11) must pass across the language boundary or the migration is rejected |
| R1b | *(R1 fallback)* If the rewrite fails, V1 still ships | — | **V1 is defined and gated at 500–700 agents (Criteria 2, 10).** 10k is a Phase 6 stretch with no V1 commitment |
| R2 | JSON wire format melts the client | **High if unaddressed** | Binary quantised protocol + interest culling, from the first commit (NFR-4) |
| R3 | Cloud Run's 60-min request cap drops long sessions | **Certain** | Reconnect-with-resume is a Phase 0 requirement (FR-6.4), not a later fix |
| R4 | GIS pipeline stalls on system GDAL | Medium | `rasterio`/`pyogrio` wheels; system GDAL is not on the critical path |
| R5 | Nondeterminism creeps in and destroys replay | Medium | NFR-1 enforced in CI by a seeded-replay regression test |
| R6 | LLM latency degrades the sim | Medium | Async, 30–120s cadence, hard timeout, rule-based fallback |
| R7 | GIS licensing restricts public release | Medium | Legal review is a **gate, not a fix**. Fallback if terms are restrictive: synthetic/approximate geometry for the public build, real data held privately — the simulation does not depend on survey accuracy |
| R8 | No auth + reconnect/resume = unauthorised session hijack | **High if publicly deployed** | Assumption 5 permits this **only** for local/private deployment. Any public deploy adds an opaque session token on the WS handshake before launch |
| R9 | 700-agent ceiling blows the tick budget with no graceful path | Medium | Criterion 10 is an explicit gate at 700; NFR-2 sets a second bound. §4.2 defer-and-log prevents cascade |

---

## 13. Assumptions

Stated explicitly per spec-driven-development. **Correct these before implementation.**

1. **Desktop browser only**, WebGL2 required, WebGPU optional and non-blocking.
2. **Single-region deployment** to begin; multi-region is out of scope for V1.
3. **Road and landmark geometry is hand-curated for V1**, GIS-derived later. This
   de-risks the GDAL/R7 problems entirely for the first shippable milestone.
4. **The player is client-side-predicted with server reconciliation.** "Authoritative" in
   FR-6.1 refers to *world* state (every agent, road, and event). The player's own
   transform is predicted locally and reconciled to the server, which remains the
   authority. Both can be true; the distinction is stated here so it is not re-litigated.
5. **No auth in V1**, and reconnect/resume is therefore restricted to **local or
   private-network deployment**. See R8 — a public deploy is blocked on a session token.
6. **The evaluation harness ships in Phase 0; the evaluation *programme* runs in Phase 5.**
   The harness (seeded scenario runner + metric capture) is infrastructure and must exist
   early so that Core and AI runs are comparable against an identical world. The Core-vs-AI
   experiment itself needs an AI layer to compare against and cannot run before Phase 5.
7. `AGENTS`/`CLAUDE.md`-style agent context files and CI quality gates are assumed
   part of "done" but are not specified here.

---

## 14. Open questions

| # | Question | Blocks | Owner |
|---|---|---|---|
| Q1 | GIS licence terms for Baguio Open Data / Geoportal — ODbL attribution and share-alike obligations for a public demo? | Public release | Legal |
| Q2 | Does the player *damage* AI agents on contact, or does the player act as a soft obstacle that only forces reroutes? §4.2 already settles collision as **yes**; the open question is only the *consequence* | FR-5.5 severity model | Design |
| Q3 | Does Core vs AI evaluation require fixed LLM model pinning, or model-agnostic ranges? | Phase 5 | Research |
| Q4 | Target max concurrent clients per simulation instance — changes the LOD/culling budget | NFR-4 | Eng |
| Q5 | Public deployment target: Vercel + Cloud Run, or single-region container set? | Deployment | Eng |

---

## 15. Traceability

Every FR/NFR maps to an architectural mechanism in [`ARCHITECTURE.md`](./ARCHITECTURE.md);
every component and pin maps to [`TECH_STACK.md`](./TECH_STACK.md).
Where those documents **contradict** this PRD, the PRD wins and the other document is wrong.
