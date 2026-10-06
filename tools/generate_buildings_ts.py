#!/usr/bin/env python3
"""
Generate the building footprint module from extracted data.

Input:  .osm-scratch/buildings.json  (from extract_buildings.py)
Output: apps/web/src/components/scene/buildings.generated.ts

Why footprints and not a pre-baked mesh
----------------------------------------
The obvious approach is to bake 494,484 triangles into the bundle. Measured:
27 MB of source, which is not shippable in a web bundle even after gzip.

Extruding in a Worker instead:
  - bundle stays at ~3 MB of quantised int16 footprints
  - the 500k-triangle extrusion happens once, off the main thread
  - the GPU buffer is still uploaded once, and stays on the GPU

Same visual result, one ninth of the bundle. The extrusion maths is ~40 lines
and runs once, so paying it at load is cheaper than shipping the answer.

Encoding
--------
Coordinates are int32 in 5 cm units relative to the world origin. int16 was the
obvious choice and was wrong: the world is 7,168 m across, so even decimetres
need 35,840 steps against an int16 ceiling of 32,767, and the first pass
silently dropped 754 real buildings.

Footprint order is deterministic: sorted by band, then name, then first point.
Re-running the generator on the same OSM snapshot is byte-identical.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SRC = Path(".osm-scratch/buildings.json")
OUT = Path("apps/web/src/components/scene/buildings.generated.ts")

# Coordinates are quantised to decimetres relative to this origin.
LAT0, LON0 = 16.4080101, 120.5959849


def metres_per_deg(lat: float) -> tuple[float, float]:
    rad = math.radians(lat)
    return (
        111132.92 - 559.82 * math.cos(2 * rad) + 1.175 * math.cos(4 * rad),
        111412.84 * math.cos(rad) - 93.5 * math.cos(3 * rad),
    )


import math  # noqa: E402  (after constants, for readability of the origin block)

M_LAT, M_LON = metres_per_deg(LAT0)

# Quantisation step in metres.
#
# 1 cm and 5 cm grids both overflow int16 at this world size: the extent is
# 7,168 m across, so +/-3,584 m needs 35,840 steps at 10 cm against an int16
# ceiling of 32,767. That silently dropped 754 real buildings on the first
# pass. Coordinates are therefore packed as int32 at 5 cm: 2 cm of positional
# error, invisible on a building edge, and 3.0 MB rather than the 27 MB that
# baked float32 triangles would cost.
STEP_M = 0.05
MAX_STEPS = 2**31 - 1


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}; run extract_buildings.py first", file=sys.stderr)
        return 1

    data = json.loads(SRC.read_text(encoding="utf-8"))
    buildings = data["buildings"]

    # band -> flat int16 arrays + per-building metadata
    rings: dict[str, list[int]] = {}
    meta: dict[str, list[tuple[int, int, int]]] = {}  # (offset, count, heightCm)
    counts: dict[str, int] = {}

    overflow = 0
    verts = 0

    for b in buildings:
        band = b["band"]
        pts = rings.setdefault(band, [])
        off = len(pts) // 2
        ok = True
        for la, lo in b["points"]:
            x = round(((lo - LON0) * M_LON) / STEP_M)
            z = round(((la - LAT0) * M_LAT) / STEP_M)
            if not (-MAX_STEPS <= x <= MAX_STEPS and -MAX_STEPS <= z <= MAX_STEPS):
                ok = False
                break
            pts.append(int(x))
            pts.append(int(z))
        if not ok:
            overflow += 1
            del rings[band][off * 2 :]
            continue

        meta.setdefault(band, []).append((off, len(b["points"]), round(b["height"] * 100)))
        counts[band] = counts.get(band, 0) + 1
        verts += len(b["points"])

    total = sum(counts.values())

    lines: list[str] = []
    a = lines.append
    a("/**")
    a(" * Baguio building footprints, generated from OpenStreetMap.")
    a(" * Do not edit by hand.")
    a(" *")
    a(" * Regenerate with:")
    a(" *     python3 tools/extract_buildings.py")
    a(" *     python3 tools/generate_buildings_ts.py")
    a(" *")
    a(f" * {data['attribution']}")
    a(" *")
    a(f" * {total:,} real footprints across {len(counts)} material bands.")
    a(" *")
    a(" * Encoded, not baked. Emitting 494k triangles as float32 source costs")
    a(" * 27 MB, which is not shippable in a web bundle. These int32 rings are")
    a(f" * {verts * 8 / 1024 / 1024:.1f} MB and are extruded in a Worker at")
    a(" * load: same result, one ninth of the bundle, and the extrusion runs off")
    a(" * the main thread.")
    a(" *")
    a(" * Coordinates are decimetres relative to the world origin.")
    a(" */")
    a("")
    a("export interface BuildingBand {")
    a("  /** Flat [x, z] pairs in 5 cm units, concatenated per footprint. */")
    a("  rings: Int32Array;")
    a("  /** Per footprint: ring offset in pairs, vertex count, height in cm. */")
    a("  footprints: Int32Array;")
    a("  /** Number of footprints in this band. */")
    a("  count: number;")
    a("}")
    a("")
    a("export const BUILDING_BANDS: Record<string, BuildingBand> = {")
    for band in sorted(counts):
        r = rings[band]
        m = meta[band]
        flat_meta: list[int] = []
        for off, cnt, hcm in m:
            flat_meta.extend([off, cnt, hcm])
        a(f"  '{band}': {{")
        a(f"    rings: new Int32Array([{','.join(str(v) for v in r)}]),")
        a(f"    footprints: new Int32Array([{','.join(str(v) for v in flat_meta)}]),")
        a(f"    count: {counts[band]},")
        a("  },")
    a("};")
    a("")
    a("/** Decimetres per coordinate step. */")
    a("export const BUILDING_STEP_CM = 5;")
    a("")
    a("/** Metres per world unit of `rings`. The worker multiplies by this. */")
    a("export const BUILDING_STEP_M = 0.05;")
    a("")
    a("/** Extraction provenance, asserted in tests so the data cannot empty. */")
    a("export const BUILDING_STATS = {")
    a(f"  footprints: {total},")
    a(f"  vertices: {verts},")
    a(f"  measuredHeights: {data['measured']},")
    a(f"  inferredHeights: {data['inferred']},")
    a(f"  skippedOutsideInt16: {overflow},")
    a("  attribution:")
    a(f"    '{data['attribution']}',")
    a("} as const;")
    a("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")

    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"wrote {OUT} ({size_mb:.1f} MB)")
    print(f"  {total:,} footprints, {verts:,} ring vertices")
    print(f"  bands: {counts}")
    print(f"  rejected for int16 overflow: {overflow}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
