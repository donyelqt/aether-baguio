"""Deterministic simulation engine — ARCHITECTURE §4.

Module map, in tick order:

| Module | Role |
|---|---|
| `clock` | Fixed timestep. No wall clock anywhere (NFR-1.1) |
| `stage` | The per-stage protocol every tick step implements |
| `world` | Static geometry + the read-only `WorldView` agents score against |
| `scheduler` | Staggered decision scheduling; deterministic id bucketing (§5, §8.2) |
| `traffic` | Road occupancy and congestion (FR-3.1) |
| `routing` | Incremental route recomputation (FR-2.3) |
| `events` | Append-only log + total event ordering (§8.4) |
| `publisher` | Dirty-set → binary snapshot encoder (§7) |
| `digest` | Stable world-state digest; the determinism gate's instrument (§8.3) |

`digest` is deliberately part of the engine rather than the test suite: the
determinism claim is a property of the engine, and an instrument that only
exists inside the test harness is an instrument that can drift from it.
"""
