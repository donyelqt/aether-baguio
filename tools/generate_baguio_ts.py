#!/usr/bin/env python3
"""
Generate the Baguio world-data module from extracted OSM geometry.

Input:  .osm-scratch/baguio.json   (produced by extract_baguio_osm.py)
Output: packages/shared-types/src/data/baguio.generated.ts

Coordinates are emitted as WGS84 degrees to match the existing landmark
format, so `createProjector` in project.ts handles the local-metre transform
exactly as it already does for landmarks. That keeps one projection path rather
than two that could disagree.

Run order:
    python3 tools/extract_baguio_osm.py
    python3 tools/generate_baguio_ts.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

SRC = Path(".osm-scratch/baguio.json")
OUT = Path("packages/shared-types/src/data/baguio.generated.ts")

LAT0, LON0 = 16.4080101, 120.5959849


def metres_per_deg(lat: float) -> tuple[float, float]:
    rad = math.radians(lat)
    return (
        111132.92 - 559.82 * math.cos(2 * rad) + 1.175 * math.cos(4 * rad),
        111412.84 * math.cos(rad) - 93.5 * math.cos(3 * rad),
    )


def local(lat: float, lon: float) -> tuple[float, float]:
    """Same projection as project.ts, used only for reporting extents here."""
    m_lat, m_lon = metres_per_deg(LAT0)
    return ((lon - LON0) * m_lon, (lat - LAT0) * m_lat)


def pts_to_ts(pts: list[list[float]], indent: str) -> str:
    body = ", ".join(f"[{lat:.6f}, {lon:.6f}]" for lat, lon in pts)
    return f"{indent}[{body}]"


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}; run extract_baguio_osm.py first", file=sys.stderr)
        return 1

    data = json.loads(SRC.read_text(encoding="utf-8"))
    lines: list[str] = []

    a = lines.append
    a("/**")
    a(" * Baguio world geometry, generated from OpenStreetMap. Do not edit by hand.")
    a(" *")
    a(" * Regenerate with:")
    a(" *     python3 tools/extract_baguio_osm.py")
    a(" *     python3 tools/generate_baguio_ts.py")
    a(" *")
    a(f" * {data['attribution']}")
    a(f" * Bounding box: {data['bbox']}")
    a(" *")
    a(" * Coordinates are WGS84 degrees. `createProjector` in project.ts converts to")
    a(" * local metres, the same path landmarks use, so there is one projection and")
    a(" * not two that could disagree.")
    a(" *")
    a(" * Road polylines are real surveyed geometry. The hand-authored polylines this")
    a(" * replaced were invented to look plausible, and put roads through buildings.")
    a(" */")
    a("")
    a("export interface RoadPath {")
    a("  /** OSM name, or '' when the way is unnamed. */")
    a("  name: string;")
    a("  /** Ordered [lat, lon] pairs in degrees. */")
    a("  points: readonly (readonly [number, number])[];")
    a("}")
    a("")

    # Roads ---------------------------------------------------------------
    a("export interface RoadClassPaths {")
    a("  arterial: readonly RoadPath[];")
    a("  collector: readonly RoadPath[];")
    a("  local: readonly RoadPath[];")
    a("}")
    a("")
    a("export const OSM_ROADS: RoadClassPaths = {")
    for cls in ("arterial", "collector", "local"):
        ways = data["roads"][cls]
        a(f"  {cls}: [")
        for name, pts in ways:
            label = (name or "").replace("\\", "").replace("'", "")
            a(f"    {{ name: '{label}', points: {pts_to_ts(pts, ' ')} }},")
        a("  ],")
    a("};")
    a("")

    # Water ---------------------------------------------------------------
    a("export interface AreaPath {")
    a("  name: string;")
    a("  points: readonly (readonly [number, number])[];")
    a("}")
    a("")
    a("/** Standing water. Burnham Park Lake is the centrepiece of the park. */")
    a("export const OSM_WATER: readonly AreaPath[] = [")
    for w in data["water"]:
        label = (w["name"] or "").replace("\\", "").replace("'", "")
        a(f"  {{ name: '{label}', points: {pts_to_ts(w['points'], ' ')} }},")
    a("];")
    a("")

    # Green ---------------------------------------------------------------
    a("/** Parks, gardens and other open green space. */")
    a("export const OSM_GREEN: readonly AreaPath[] = [")
    for g in data["green"]:
        label = (g["name"] or "").replace("\\", "").replace("'", "")
        a(f"  {{ name: '{label}', points: {pts_to_ts(g['points'], ' ')} }},")
    a("];")
    a("")

    # Provenance stats, so a reviewer can see the extraction was not a no-op.
    a("/** Extraction statistics, asserted in tests so the data cannot silently empty. */")
    a("export const OSM_STATS = {")
    road_count = sum(len(v) for v in data["roads"].values())
    a(f"  roadWays: {road_count},")
    a(f"  waterAreas: {len(data['water'])},")
    a(f"  greenAreas: {len(data['green'])},")
    a("  attribution:")
    a(f"    '{data['attribution']}',")
    a("} as const;")
    a("")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines), encoding="utf-8")

    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT} ({kb:.0f} KB)")
    print(f"  roads {road_count}  water {len(data['water'])}  green {len(data['green'])}")

    # Report the world extent so a reviewer can sanity-check the scale.
    all_pts = [p for cls in data["roads"].values() for _, ps in cls for p in ps]
    xs = [local(p[0], p[1])[0] for p in all_pts]
    zs = [local(p[0], p[1])[1] for p in all_pts]
    print(f"  extent x [{min(xs):.0f}, {max(xs):.0f}]  z [{min(zs):.0f}, {max(zs):.0f}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
