# assets/

Visual assets, kept separate from `data/` for one reason: **`data/` feeds the
simulation, `assets/` feeds the renderer.** FR-1.3 requires GIS road geometry
(simulation) and visual 3D assets (render) to be genuinely distinct paths, and
merging them is how a render tweak ends up changing what the simulation
believes about the road network.

| Directory | Contents | Lands |
|---|---|---|
| `terrain/` | Heightfield tiles, satellite-derived textures | Phase 0 |
| `buildings/` | Landmark and block massing meshes | Phase 0 |
| `vehicles/` | Per-type vehicle meshes (Phase 1 instancing) | Phase 1 |
| `characters/` | Pedestrian meshes (Phase 1 instancing) | Phase 1 |
| `environment/` | Vegetation, street furniture, signage | Phase 4 |

## Constraints

- **Not simulation input.** Nothing here may be read by the engine. The engine
  reads `data/world/` (FR-1.4).
- **Instancing budget.** Criterion 7 caps the client at 120 draw calls with 500
  agents. Vehicle and character assets are therefore designed for
  `InstancedMesh` from Phase 1, not Phase 6 — NFR-3 cannot be met by a V1 that
  defers instancing.
- **Licence.** Every asset needs a recorded source and licence. Geo terms are
  an open legal gate (PRD Q1, R7).
- **Keep them small.** Prefer low-poly massing over detail: at 500 agents the
  budget is spent on instance count, not on triangles per mesh.

Directories are empty. Each holds a `.gitkeep` so the structure is reviewable
before any binary is committed.