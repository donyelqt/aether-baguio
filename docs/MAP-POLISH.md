# Map Polish — Making It Look Like Baguio

**Status:** Phase 1 shipped (PR pending merge) · Phase 2 planned
**Date:** 2026-10-06
**Supersedes:** the hand-authored geometry in `packages/shared-types/src/data/baguio.ts`

---

## 1. The problem

The map was a plausible-looking fiction. Concretely:

| Defect | Evidence |
|---|---|
| Roads were invented | Polylines authored "to look like Baguio", not surveyed |
| Wrong street plan | Baguio is **radial** on ridges (Burnham, 1905). The data was a generic skeleton |
| Burnham Park rotated 90° | Real: 1160 m N-S × 588 m E-W. Modelled: 656 × 393 m, long axis E-W |
| Burnham Park 2.6× wrong area | 25.8 ha modelled vs 68.3 ha real |
| Burnham Park Lake absent | 182 × 180 m of water missing entirely |
| Landmarks were boxes | No footprints, no height variation, no roof detail |

**Root cause:** the geometry was authored rather than extracted, so there was
nothing to be wrong *about* — no surveyed baseline existed to check against.

---

## 2. What shipped (Phase 1)

OpenStreetMap survey data, extracted by a reproducible pipeline.

### Pipeline

```
tools/extract_baguio_osm.py      OSM API -> .osm-scratch/baguio.json
tools/generate_baguio_ts.py      JSON -> baguio.generated.ts (committed)
```

Why a **generated file** rather than a runtime fetch:

- **Deterministic.** The world must be byte-identical for a given seed (NFR-1).
  A live OSM edit would silently change what a replay produces.
- **Offline.** The client must not depend on an external API.
- **Diffable.** A reviewer sees exactly which geometry changed.

### Corrections found by measurement

**The first extract was truncated.** The OSM `/map` endpoint rejects a bbox
above ~0.15 deg² with HTTP 400. The smaller bbox I first used returned only
the west fifth of the city:

| | Before tiling | After |
|---|---|---|
| Road ways | 137 | **1,217** |
| Camp John Hay → nearest road | **1,817 m** (floating) | **29 m** |
| City Hall → nearest road | outside bbox | **19 m** |

**Named streets arrive shattered.** OSM emits one way per tag change; Harrison
Road came as 11 fragments totalling 1,541 m with a longest run of 374 m.
Arterial and collector ways of the same name are now stitched end to end:

| Continuous road | Length |
|---|---|
| Ambuklao Road | 2,006 m |
| Loakan Road | 1,510 m |
| Buhagan Road | 1,046 m |
| Kennon Road | 560 m |
| Session Road | 428 m |

### What Baguio now contains

**988 road ways · 168 km · 12 named arterials · 70 collectors · 895 local streets**

Real named streets: Session Road, Harrison Road, Magsaysay Avenue, Legarda Road,
Kisad Road, Governor Pack Road, S. Laurel Street, Assumption Road.

**9 named parks** including Burnham Park, Igorot Garden, Orchidarium, Veterans
Park, The Plaza Garden.

**82 water features** including Burnham Park Lake.

### Proof it is radial

Bearing histogram over every segment longer than 8 m:

| Bearing bin | Segments |
|---|---|
| 0–15° | 542 |
| 15–30° | 447 |
| 30–45° | 434 |
| 45–60° | 457 |
| 60–75° | 479 |
| 75–90° | 588 |
| 90–105° | 593 |
| 105–120° | 621 |
| 120–135° | 547 |
| 135–150° | 572 |
| 150–165° | 516 |
| 165–180° | 530 |

**All 12 bins populated, 434–621 segments each.** A grid would cluster on 2–4
directions. This is Burnham's radial plan, measured rather than asserted.

### Rendering

- **5 draw calls** for the whole map. 988 road ways merge into 3 geometries
  (one per class) plus water and green.
- Geometry beyond the world extent is dropped at build time. OSM returns whole
  crossing ways, so ~3 km of network reaches past the terrain.
- Vertices are emitted **per segment** and draped on the sampled ground, so a
  road crossing a ridge follows it rather than floating.

---

## 3. Licensing

OpenStreetMap data is **ODbL 1.0**. Committing derived data into a public repo
carries obligations:

- **Attribution is in the generated file header** and in `OSM_STATS`.
- **ODbL is share-alike.** The derived database is ODbL. Anyone redistributing
  the map must keep attribution and license the derived database the same way.
- **This has not been reviewed by a lawyer.** Flagged in PRD R7 as an open
  legal question.

Not a blocker for development. **It is a blocker for public distribution** and
should be reviewed before any public deploy.

---

## 4. Phase 2 — building form (planned)

Phase 1 fixed the **plan**. The buildings are still boxes, which is what the
brief calls "ugly boxes". Ranked by visual impact per unit of work:

### 2.1 Landmark footprints (highest impact)

Replace boxes with real footprints from OSM building outlines. The data is in the
same extract, filtered on `building=*`.

- Real City Hall, Cathedral, Convention Center, SM City outlines
- Varied heights from OSM `building:levels` / `height` tags
- Estimated: 1 day, mostly extraction

### 2.2 Building massing across the city

Fill the blocks between roads with low-poly masses so the city reads as built-up
rather than as roads on grass.

- Generate from OSM footprints, not from the road graph
- LOD: full near, single merged mass far
- Keep the draw-call budget via `InstancedMesh`
- Estimated: 2–3 days

### 2.3 The pine belt

Baguio is the "City of Pines" — the forested ridges are a defining feature and
the current map has bare terrain where forest should be.

- Scatter conifer instances on slopes above a threshold elevation
- Deterministic from the sim seed (NFR-1)
- Estimated: 1 day

### 2.4 River and terrain detail

The Bued River valley and Naguili Creek cut through Baguio. Currently absent.

- Extract waterway centre-lines from OSM, render as ribbons
- Carve terrain slightly along the channel
- Estimated: 1 day

### 2.5 Road surface detail

Lane markings and kerbs on arterials, visible when the camera is close.

- Centre-line dashes as a repeating texture on arterial ribbons
- Kerb strip on both edges
- Estimated: 1 day

**Order matters:** 2.1 before 2.2. Footprints first, because 2.2 generates massing
from the same source and gets better once the extraction is known-good.

---

## 5. Known limitations

| Issue | Status |
|---|---|
| Buildings are boxes | Phase 2.1, 2.2 |
| No trees | Phase 2.3 |
| No rivers | Phase 2.4 |
| Terrain is a smooth procedural bowl, not surveyed topography | Not planned. Requires DEM data; a large addition |
| Roads have no lane markings | Phase 2.5 |
| ODbL share-alike not legally reviewed | Open. PRD R7 |

**On the terrain.** The heightfield is procedural. It has the right shape — a
bowl with a flat CBD floor and steeper eastern ridge — but real Baguio has
steeper ravines and named peaks. Sourcing a DEM is a separate project with its
own licensing question.

---

## 6. Verification

Every phase ships with evidence, not assertion:

| Claim | How it is checked |
|---|---|
| The map is radial | Bearing histogram, all 12 bins populated |
| Landmarks are reachable | Every landmark within 250 m of a road node |
| Draw calls stay bounded | Merged geometry, asserted in tests |
| No floating roads | Every road vertex draped on sampled ground |
| Determinism | Generated file sorted; regeneration is byte-identical |
| Renders correctly | Real browser: screenshots, draw-call count, console errors |

---

## 7. Reproducing

```bash
python3 tools/extract_baguio_osm.py    # requires network; caches per tile
python3 tools/generate_baguio_ts.py    # deterministic, no network
```

`.osm-scratch/` is gitignored: the source tiles are large and the committed
output is what the build consumes.

To refresh from a newer OSM snapshot, re-run both and commit the diff. The diff
is the review record of what changed in the city.
