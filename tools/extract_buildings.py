#!/usr/bin/env python3
"""
Extract building footprints from OpenStreetMap.

Separate from extract_baguio_osm.py because buildings are 20,000+ ways against
the road network's ~1,200, and they fail the pipeline differently.

Design notes
------------
Footprints are emitted as closed rings in WGS84 degrees, ready for the same
`createProjector` the roads and landmarks use. That keeps one projection.

Height is NOT taken from OSM for 98% of buildings — only 353 of 20,382 carry a
`building:levels` or `height` tag. The rest get an inferred height from building
type and footprint area, which is what the renderer uses. Recording that
distinction here matters: a reader of the generated file should be able to tell
measured height from inferred.

Filtering
---------
- Footprints under 40 m^2 are sheds, toilets and map noise; they read as dirt.
- Footprints over 4 ha are malls and compounds whose roof polygon would swallow
  the streets inside it.
- Ways with `building=no` are not buildings.
"""

from __future__ import annotations

import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SRC_TILES = Path(".osm-scratch/tiles")
OUT = Path(".osm-scratch/buildings.json")

# Same origin as shared-types/world.ts WORLD_ORIGIN, so local metres agree.
ORIGIN_LAT, ORIGIN_LON = 16.4080101, 120.5959849

# Footprint area bounds in square metres.
MIN_AREA_M2 = 40.0
MAX_AREA_M2 = 40_000.0

# OSM building types, grouped into render bands. Each band shares one material,
# so the whole city is a handful of draw calls rather than one per building.
BANDS: dict[str, str] = {
    # civic / institutional
    "school": "civic",
    "college": "civic",
    "university": "civic",
    "government": "civic",
    "public": "civic",
    "hospital": "civic",
    "civic": "civic",
    # commercial
    "commercial": "commercial",
    "retail": "commercial",
    "office": "commercial",
    "supermarket": "commercial",
    "hotel": "commercial",
    "apartments": "commercial",
    # residential
    "residential": "residential",
    "house": "residential",
    "detached": "residential",
    "apartments_1": "residential",
    "dormitory": "residential",
    # religious
    "church": "religious",
    "chapel": "religious",
    "cathedral": "religious",
    "religious": "religious",
    # industrial / utilitarian
    "industrial": "utility",
    "warehouse": "utility",
    "shed": "utility",
    "garage": "utility",
    "roof": "utility",
    "greenhouse": "utility",
}

# Band -> (base height m, area span m).
#
# Only 2% of OSM buildings carry a height tag (317 of 16,115), so height is
# mostly inferred. It comes mostly from the band, because that is what the data
# supports: the default band is 12,987 untyped buildings with a median footprint
# of 95 m^2, which is residential scale, and typing them as commercial produced
# a field of four-storey blocks. `span` is how much taller the largest footprints
# in a band get.
#
# Calibrated to read as a Philippine highland town: low-rise overall, a thin
# tail of genuinely tall buildings where OSM records one.
BAND_HEIGHT: dict[str, tuple[float, float]] = {
    "default": (5.0, 4.0),       # mostly 1-2 storey houses
    "residential": (5.5, 4.5),
    "utility": (4.5, 2.0),       # sheds, garages
    "civic": (11.0, 9.0),        # schools, halls
    "religious": (13.0, 9.0),     # cathedral, chapels
    "commercial": (16.0, 22.0),   # the CBD, where the towers are
}

# Footprint area over which the span is fully applied. Set from the observed
# distribution: the default band's p90 is 252 m^2 and its commercial p90 is
# 1123 m^2, so 1200 m^2 spans the bulk of real variation.
AREA_SPAN_M2 = 1200.0

# Half the terrain extent (shared-types WORLD_EXTENT_M / 2).
WORLD_HALF_M = 3584.0

# Footprints whose vertices spill past the terrain edge are dropped. Measured:
# 353 of 16,115 (2.2%) reach past it, the easternmost being 277 m out. A
# building with a vertex off the terrain would be extruded onto clamped ground
# with no hill under it. Extending the world to keep them would push the shadow
# texel from 3.50 m to 3.91 m and invalidate the bias tuned in PR #17, so
# dropping 2.2% is the cheaper honest trade.

# Building height implied by one storey, metres. OSM `building:levels` counts
# floors; 3.2 m is a realistic storey for this building type.
M_PER_LEVEL = 3.2


def metres_per_deg(lat: float) -> tuple[float, float]:
    rad = math.radians(lat)
    return (
        111132.92 - 559.82 * math.cos(2 * rad) + 1.175 * math.cos(4 * rad),
        111412.84 * math.cos(rad) - 93.5 * math.cos(3 * rad),
    )


def ring_area_m2(pts: list[tuple[float, float]]) -> float:
    """Shoelace area in square metres, using a local scale at the ring centroid."""
    if len(pts) < 3:
        return 0.0
    m_lat, m_lon = metres_per_deg(sum(p[0] for p in pts) / len(pts))
    acc = 0.0
    for i, (y1, x1) in enumerate(pts):
        y2, x2 = pts[(i + 1) % len(pts)]
        acc += x1 * y2 - x2 * y1
    return abs(acc) * m_lat * m_lon / 2


def band_for(building: str) -> str:
    return BANDS.get(building, "default")


def height_for(tags: dict[str, str], band: str, area: float) -> tuple[float, bool]:
    """
    Return (height in metres, measured).

    A measured height comes from OSM and is authoritative. Otherwise it is
    inferred, and `measured=False` says so, so nothing downstream mistakes an
    estimate for survey data.
    """
    levels = tags.get("building:levels")
    if levels:
        try:
            return max(3.0, float(levels) * M_PER_LEVEL), True
        except ValueError:
            pass

    raw = tags.get("height")
    if raw:
        try:
            # Strip trailing units if OSM carries them ("12 m").
            value = float(raw.split()[0])
            if 2.0 <= value <= 200.0:
                return value, True
        except ValueError:
            pass

    # Height comes mostly from the band, with footprint area as a bounded
    # modifier on top.
    #
    # The first attempt derived height almost entirely from area, normalising
    # over 2500 m^2. Because the default band's median footprint is 95 m^2,
    # 99% of buildings scored a scale below 0.05 and collapsed onto the 4 m
    # floor — a field of identical one-storey huts. Changing the divisor could
    # not fix it, because the spread came from `base - lo` being only 3.5 m.
    base, span = BAND_HEIGHT[band]
    area_term = span * min(1.0, max(0.0, (area - MIN_AREA_M2) / AREA_SPAN_M2))
    return base + area_term, False


M_LAT, M_LON = metres_per_deg(ORIGIN_LAT)


def main() -> int:
    tiles = sorted(SRC_TILES.glob("*.xml"))
    if not tiles:
        print(f"no tiles in {SRC_TILES}; run extract_baguio_osm.py first", file=sys.stderr)
        return 1

    buildings: list[dict] = []
    seen: set[str] = set()
    skipped_small = skipped_large = skipped_outside = 0

    for tile in tiles:
        root = ET.parse(tile).getroot()
        nodes = {
            n.get("id"): (float(n.get("lat")), float(n.get("lon")))
            for n in root.findall("node")
        }
        for way in root.findall("way"):
            wid = way.get("id")
            if wid in seen:
                continue
            tags = {t.get("k"): t.get("v") for t in way.findall("tag")}
            b = tags.get("building")
            if not b or b == "no":
                continue
            ring = [
                nodes[nd.get("ref")]
                for nd in way.findall("nd")
                if nd.get("ref") in nodes
            ]
            # OSM ways may include nodes shared between building parts; dedupe
            # consecutive duplicates so the shoelace does not cancel itself.
            deduped: list[tuple[float, float]] = []
            for p in ring:
                if not deduped or deduped[-1] != p:
                    deduped.append(p)
            if len(deduped) > 2 and deduped[0] == deduped[-1]:
                deduped.pop()
            if len(deduped) < 3:
                continue

            area = ring_area_m2(deduped)
            if area < MIN_AREA_M2:
                skipped_small += 1
                continue
            if area > MAX_AREA_M2:
                skipped_large += 1
                continue

            # Drop footprints that spill past the terrain edge, so nothing is
            # extruded onto clamped ground with no hill beneath it.
            if any(
                abs((lo - ORIGIN_LON) * M_LON) > WORLD_HALF_M
                or abs((la - ORIGIN_LAT) * M_LAT) > WORLD_HALF_M
                for la, lo in deduped
            ):
                skipped_outside += 1
                continue

            band = band_for(b)
            height, measured = height_for(tags, band, area)
            seen.add(wid)
            buildings.append(
                {
                    "name": tags.get("name", ""),
                    "band": band,
                    "area": round(area, 1),
                    "height": round(height, 2),
                    "measured": measured,
                    "points": [[round(lat, 6), round(lon, 6)] for lat, lon in deduped],
                }
            )

    buildings.sort(key=lambda b: (b["band"], b["name"], b["points"][0]))

    measured_n = sum(1 for b in buildings if b["measured"])
    payload = {
        "attribution": "OpenStreetMap contributors, ODbL 1.0. Retrieved 2026-10-06.",
        "count": len(buildings),
        "measured": measured_n,
        "inferred": len(buildings) - measured_n,
        "skippedSmall": skipped_small,
        "skippedLarge": skipped_large,
        "skippedOutsideWorld": skipped_outside,
        "buildings": buildings,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")

    print(f"buildings kept     {len(buildings)}")
    print(f"  measured height  {measured_n} ({100 * measured_n / len(buildings):.0f}%)")
    print(f"  inferred height  {len(buildings) - measured_n}")
    print(f"  skipped <{MIN_AREA_M2:.0f} m2   {skipped_small}")
    print(f"  skipped >{MAX_AREA_M2 / 10000:.0f} ha   {skipped_large}")
    print(f"  skipped outside world  {skipped_outside}")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")

    bands: dict[str, int] = {}
    for b in buildings:
        bands[b["band"]] = bands.get(b["band"], 0) + 1
    print("  by band:", bands)
    return 0


if __name__ == "__main__":
    sys.exit(main())
