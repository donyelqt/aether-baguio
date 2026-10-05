# AETHER: Baguio — Implementation Plan

**Status:** Active
**Last audited:** 2026-10-06 against `main` @ `88b4db4`
**Governing documents:** [`docs/PRD.md`](../docs/PRD.md) · [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) · [`docs/TECH_STACK.md`](../docs/TECH_STACK.md)

---

## How to read this

Every checkbox states what was observed and where. A box is ticked only if the
behaviour exists in tracked source on `main` and was verified — by a test, a build,
or a live browser probe. Where a requirement is partially met, the box says so and
names the gap. A ticked box is a claim you can audit; an unticked one is not a
failure, just an honest gap.

**Legend:** `[x]` verified done · `[~]` partially done, gap named · `[ ]` not started

---

## Current state

| | |
|---|---|
| Merged PRs | 5 (#1 wire protocol, #2 world data, #3 terrain, #4 scene, #5 test binding) |
| Tests | 54 passing (45 shared-types, 9 web) |
| Typecheck | 0 errors (`strict` + `noUncheckedIndexedAccess`) |
| Lint | 0 findings across 28 files |
| Build | `pnpm --filter web build` succeeds |
| Live render | 15 meshes · 73,182 triangles · 21 draw calls · 0 console errors |
| Interactive controls | **0** |
| CI | **none** |

### Live browser probe (2026-10-06)

Measured by driving a real Chromium against `pnpm start`. These are **observations
from that session, not values the repository asserts** — no committed instrumentation
produces them.

```
probe : meshes=15 tris=73182 draws=21 drawn=73254 bg=87b8e0 lost=false
hud   : Landmarks 11 | Road nodes 42 | Road segments 44 | Agents —
inputs: 0 buttons/inputs on the page; no WASD hints in the DOM
pixels: 100% lit, 72 colour buckets
console: 0 errors
```

The `meshes`/`tris`/`draws`/`bg` line is published by `SceneProbe.tsx`, which is
committed. The `inputs`, `pixels`, and `console` lines come from a one-off browser
session and are **not reproducible from the repo** until the probe and CI grow to
cover them — tracked as task I.8 below.

---

## Phase 0 — World

**Exit criteria:** Criterion 1 (cold load ≤ 3 s, visibly alive city), Criterion 9
(reconnect after forced socket drop).

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1.1a | Terrain for central Baguio | `[x]` | `Terrain.tsx` — 192² mesh, 73,182 tris, verified in browser |
| 1.1b | Road network | `[x]` | `roads.ts` — 44 segments, 3 draw calls, draped on terrain |
| 1.1c | Landmarks | `[x]` | `Landmarks.tsx` — 11 places, OSM coordinates |
| 1.1d | **Zones** | `[ ]` | **Not implemented.** No `zone` type or data anywhere. FR-1.1 requires it |
| 1.2a | Day/night cycle renders | `[x]` | `DayNight.ts` — clock advances 0.9 sim-hours/sec in `useFrame`; a browser session showed mean frame brightness cycling 104 → 136 → 104 |
| 1.2b | Correct sun position at 16°N | `[x]` | `DayNight.test.ts` — 9 tests; asserts noon sun is **north** of zenith |
| 1.2c | Day/night is user-controllable | `[ ]` | No pause or time-scale UI. `HOURS_PER_SECOND` is a constant |
| 1.3a | Simulation vs render road split | `[x]` | `project.ts` graph vs `roads.ts` mesh — genuinely separate paths |
| 1.3b | GIS road geometry | `[ ]` | Deferred by design (PRD §13). Roads are a stylised skeleton |
| 1.4 | Versioned build artifact | `[ ]` | No `data/world/` directory, no manifest. Data is hand-authored TS |
| 5.1a | Free camera (pan/look/zoom) | `[ ]` | **`CameraRig` is a hard-coded auto-orbit.** No event handlers in the source tree |
| 5.1b | 1×–10× time scaling | `[ ]` | No key handler, no UI. PRD §4.1 specifies `1/2/5/10` |
| 6.4 | Reconnect + resume | `[ ]` | No WebSocket client or server. `SnapshotDecoder` is used only by tests |

### Phase 0 exit criteria

| Criterion | Status | Why |
|---|---|---|
| 1 — cold load ≤ 3 s, visibly alive | `[ ]` | **Never measured.** No load-time instrumentation exists; `SceneProbe` reports no timing. "Visibly alive" also fails with zero agents |
| 9 — reconnect after socket drop | `[ ]` | **Not testable.** No socket exists to drop |

### Phase 0 verdict: **NOT COMPLETE**

**6 of 13** tracked requirements are done (1.1a–c, 1.2a–b, 1.3a). **Both exit criteria
are unmet.** The rendering half of the phase is built; the interactive half — camera,
time control, zones, reconnect — does not exist.

An auto-orbit camera is a placeholder, and the code comment on `CameraRig` says so.

---

## Phase 1 — Agent core

**Exit criteria:** Criterion 2 (500 agents ≥ 15 Hz, ≤ 20 ms), Criterion 7 (60 FPS,
≤ 120 draws), Criterion 8 (≤ 50 KB/s).

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1 | Citizens, tourists, vehicles | `[ ]` | HUD shows `Agents —`. No agent system |
| 2.2 | Utility AI scoring | `[ ]` | Not started |
| 2.3 | Pathfinding | `[ ]` | Road graph exists and is verified connected — good foundation, no pathfinder |
| 2.4 | Agents perceive and react | `[ ]` | Not started |
| 2.5 | FSM + behaviour tree | `[ ]` | Not started |
| 2.6 | Tourist attributes | `[ ]` | Not started |
| 3.1–3.3 | Traffic, congestion, routing | `[ ]` | Not started |
| — | InstancedMesh rendering | `[ ]` | Required by Criterion 7. Not started |

**Verdict: NOT STARTED** — 0 of 11 requirements done. The road graph it will route over
exists, but that is a Phase 0 deliverable, not partial Phase 1 progress.

---

## Phase 2 — Emergence

| # | Requirement | Status |
|---|---|---|
| 4.1–4.5 | Events, weather, emergency response | `[ ]` |
| 5 | Congestion self-stabilises (FR-3.3) | `[ ]` — pass condition defined in PRD, no implementation |


**Verdict: NOT STARTED**

---

## Phase 3 — Player

| # | Requirement | Status |
|---|---|---|
| 5.3–5.5 | Player controller, vehicle entry, player-as-entity | `[ ]` |

**Verdict: NOT STARTED**

---

## Phase 4 — God mode

| # | Requirement | Status |
|---|---|---|
| 4.2 | Event injection UI | `[ ]` |
| 4.x | Weather/time control, speed control, inspection | `[ ]` |

**Verdict: NOT STARTED**

---

## Phase 5 — AETHER AI

| # | Requirement | Status |
|---|---|---|
| 8.1–8.6 | Strategic LLM agents, validation, fallback | `[ ]` |

**Verdict: NOT STARTED.** `langgraph` 1.2.12 is pinned and specified (ARCH §10.5)
but not installed.

---

## Phase 6 — Scale

| # | Requirement | Status |
|---|---|---|
| — | 1k → 10k agents, LOD, spatial partitioning | `[ ]` |

**Verdict: NOT STARTED**

---

## Infrastructure

| # | Item | Status | Evidence |
|---|---|---|---|
| I.1 | pnpm workspace + Biome + strict TS | `[x]` | PR #1, 29 files linted |
| I.2 | Binary wire protocol | `[x]` | Layout asserted in `wire.test.ts` (28/44/14 B). **No Python encoder exists yet** — the constants were cross-checked ad hoc against `struct.calcsize`, not by a committed test |
| I.3 | Deterministic terrain | `[x]` | `terrain.test.ts` — same seed yields equal elevation arrays |
| I.4 | Connected road graph | `[x]` | `world.test.ts` — proven single component |
| I.5 | Landmark reachability | `[x]` | Every landmark < 250 m from a road node |
| I.6 | Extent contains the map | `[x]` | Regression test asserts every node and footprint fits. The overflow it guards against was measured during the PR #4 audit (~1 km east of the old extent) and is not recorded in the test itself |
| I.7 | CI quality gates | `[ ]` | **No `.github/workflows`.** No CI at all |
| I.8 | Load-time instrumentation | `[ ]` | Needed for Criterion 1 |
| I.9 | `apps/simulation` (FastAPI engine) | `[ ]` | Directory does not exist |
| I.10 | `data/world/` build artifacts | `[ ]` | Directory does not exist |

---

## Next task

### Do the next thing: **observer camera controls (FR-5.1)**, not map polish

Map polish was the instinct. It is the wrong next task, for three reasons:

1. **You cannot judge a map you cannot move.** At a fixed 2,100 m orbit radius the
   whole city is a thumbnail — building placement, road widths, terrain seams, and
   landmark scale are all unassessable. Polish decisions made from that view are
   guesses.
2. **Two Phase 0 requirements are unmet and blocking.** Camera control and time
   scaling are scope the phase committed to. They are cheap and they unblock
   everything visual.
3. **Criterion 1 is unmeasurable without instrumentation.** Load time has never
   been recorded, so "≤ 3 s" is currently an untestable claim.

Map polish becomes the right task **immediately after** the camera lands, and
becomes a better task once agents exist — a city's readability at 500 moving
entities is a different problem from a static diorama.

### Proposed slice order

| # | Task | Why first | Done when |
|---|---|---|---|
| **1** | **Observer camera** — WASD pan, drag look, scroll zoom, `1/2/5/10` time scale, `Space` pause | Unblocks visual judgement; closes FR-5.1 | Moving the camera changes the view; HUD shows live clock and speed |
| **2** | Load-time instrumentation + CI | Makes Criterion 1 falsifiable | `performance.now()` at first frame, reported; 20-run median in CI |
| **3** | Zones (FR-1.1d) | Closes the last Phase 0 data gap | Zone type + data; rendered as ground overlay |
| **4** | **Map polish pass** — only now | Needs camera + daylight to evaluate | A written visual checklist passes at three zoom levels |
| 5 | `apps/simulation` skeleton | Unblocks Phase 1 | FastAPI app imports; tick loop runs headless |
| 6 | First agents | Phase 1 | One agent moves along the road graph |

Each task ships as its own branch and PR, verified in a browser before merge.

---

## Cleanup

Both items found during this audit, now fixed:

- [x] Lint: `apps/web/next-env.d.ts` is generated by Next.js and marked "should not be
      edited", so it is excluded in `biome.json` rather than reformatted in place.
      Lint now reports **28 files, 0 findings**.
- [x] `_tmp_terr.mjs` — a scratch terrain probe committed by mistake in PR #4 — removed.

### Still open

- [ ] **No CI.** `.github/workflows` does not exist, so every gate in this document
      runs only on a developer machine. This is the highest-value non-feature task:
      it is what would have stopped `_tmp_terr.mjs` from merging.

---

## Verification protocol

Every slice must pass all of these before its PR merges:

| Gate | Command | Threshold |
|---|---|---|
| Tests | `pnpm -r test` | all pass, no skips |
| Types | `pnpm -r typecheck` | 0 errors |
| Lint | `pnpm lint` | 0 findings |
| Build | `pnpm --filter web build` | succeeds |
| Runtime | browser probe | 0 console errors, context not lost, draw calls ≤ 120 |
| Behaviour | the task's own acceptance | verified in a real browser, not inferred |

A build passing is **not** evidence a feature works. The Phase 4 scene built
cleanly while the canvas rendered black until `preserveDrawingBuffer` was set —
only a browser probe caught it.
