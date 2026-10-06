#!/usr/bin/env python3
"""
Extract Baguio map geometry from OpenStreetMap.

The previous world data was hand-authored: polylines invented to "look like"
Baguio. This replaces invention with survey. Run it to regenerate
`packages/shared-types/src/data/baguio.generated.ts` from OSM.

Source: OpenStreetMap contributors, ODbL 1.0. Retrieved 2026-10-06.

Why a generated file rather than a runtime fetch:
- Deterministic. The world must be byte-identical for a given seed (NFR-1), so
  upstream OSM edits cannot silently change what a replay produces.
- Offline. The client must not depend on an external API being up.
- Diffable. A reviewer can see exactly which geometry changed and why.

Usage:
    python3 tools/extract_baguio_osm.py
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "aether-baguio-map/1.0 (research extraction)"
OSM_API = "https://api.openstreetmap.org/api/0.6/map"

# Central Baguio: Burnham Park, Session Road, the civic core, Camp John Hay,
# Mines View Park.
#
# The OSM /map endpoint rejects a bbox above roughly 0.15 deg^2 with HTTP 400,
# and the city needs a wider area than that. So the extraction is tiled and the
# tiles are merged. A single oversized bbox silently loses the outer landmarks:
# with an earlier bbox, Baguio City Hall and Camp John Hay both fell outside and
# would have rendered as boxes on empty ground.
BBOX_BOUNDS = (16.3980, 120.5890, 16.4280, 120.6320)
BBOX_TILE = (16.3980, 120.5890, 16.4130, 16.6120)  # half-height tile

BBOX = "120.5890,16.3980,120.6320,16.4280"

# Highway classes mapped to our three road classes.
#   arterial  <- trunk, primary       (Session Road, Harrison, Magsaysay)
#   collector <- secondary, tertiary  (Legarda, Kisad, Governor Pack)
#   local     <- residential, unclassified, service
CLASS_MAP = {
    "trunk": "arterial",
    "primary": "arterial",
    "secondary": "collector",
    "tertiary": "collector",
    "unclassified": "local",
    "residential": "local",
    "service": "local",
}

# Ways shorter than this are driveways and stubs; they add draw calls and
# vertices without reading as streets at any camera distance we support.
MIN_WAY_LENGTH_M = 45.0

# Douglas-Peucker tolerance in degrees. ~0.44 m at this latitude, well under one
# 37.5 m terrain quad, so simplification cannot move a road off its ground.
SIMPLIFY_TOL = 4e-6

# Named arterial and collector roads arrive from OSM split into many fragments,
# one per tag change: Harrison Road comes as 11 pieces totalling 1,541 m with a
# longest run of 374 m. Rendered unmerged they read as disconnected stubs, so
# same-class same-name ways are stitched end to end. Local streets are left
# alone — they are short by nature and stitching them merges distinct roads that
# share a name.
STITCH_CLASSES = ("arterial", "collector")

# Two endpoints closer than this are treated as the same junction, allowing for
# OSM's duplicated nodes on either side of a tag change.
JUNCTION_M = 12.0


def tile_grid() -> list[str]:
    """Split the target bbox into API-sized tiles: two rows, three columns."""
    s, w, n, e = BBOX_BOUNDS
    mid_lat = (s + n) / 2
    lon_step = (e - w) / 3
    tiles: list[str] = []
    for lat_lo, lat_hi in ((s, mid_lat), (mid_lat, n)):
        lon_lo = w
        while lon_lo < e - 1e-9:
            lon_hi = min(lon_lo + lon_step, e)
            tiles.append(f"{lon_lo:.4f},{lat_lo:.4f},{lon_hi:.4f},{lat_hi:.4f}")
            lon_lo = lon_hi
    return tiles

def stitch(ways: list[tuple[str, list]], cls: str) -> list[tuple[str, list]]:
    """
    Join fragments of the same named road into continuous runs.

    OSM splits a street into one way per tag change. Endpoints of adjacent
    fragments are within a metre or two of each other, so matching them on
    proximity reconstructs the street. Reversed fragments are handled by
    checking both orientations.
    """
    if cls not in STITCH_CLASSES:
        return ways

    by_name: dict[str, list[list]] = {}
    for name, pts in ways:
        if name:
            by_name.setdefault(name, []).append(pts)

    joined: list[tuple[str, list]] = []
    for name, parts in by_name.items():
        # Longest first: the spine of the road anchors the chain.
        parts.sort(key=len, reverse=True)
        chain = list(parts[0])
        rest = parts[1:]
        grew = True
        while grew and rest:
            grew = False
            for i, part in enumerate(rest):
                joined_part = _try_join(chain, part)
                if joined_part is not None:
                    chain = joined_part
                    rest.pop(i)
                    grew = True
                    break
        joined.append((name, chain))

    # Unnamed ways are emitted untouched, in their original order.
    for name, pts in ways:
        if not name:
            joined.append((name, pts))
    return joined


def _try_join(chain: list, part: list) -> list | None:
    """Append `part` to `chain` if their endpoints coincide, else return None."""
    m_lat, m_lon = metres_per_deg(chain[0][0])
    tol2 = (JUNCTION_M / m_lat) ** 2 + (JUNCTION_M / m_lon) ** 2

    def near(a, b):
        return ((a[0] - b[0]) * m_lat) ** 2 + ((a[1] - b[1]) * m_lon) ** 2 <= tol2

    tail = chain[-1]
    if near(tail, part[0]):
        return chain + part[1:]
    if near(tail, part[-1]):
        return chain + list(reversed(part))[1:]
    head = chain[0]
    if near(head, part[-1]):
        return part[:-1] + chain
    if near(head, part[0]):
        return list(reversed(part))[:-1] + chain
    return None


def fetch() -> ET.Element:
    """Fetch every tile and merge them into one synthetic OSM document."""
    cache_dir = Path(".osm-scratch/tiles")
    merged = ET.Element("osm", {"version": "0.6"})
    seen_nodes: set[str] = set()
    seen_ways: set[str] = set()

    for i, bbox in enumerate(tile_grid()):
        slug = bbox.replace(",", "_").replace(".", "")
        cache = cache_dir / f"{slug}.xml"
        if cache.exists():
            print(f"  [{i + 1}] cached {bbox}")
            root = ET.parse(cache).getroot()
        else:
            print(f"  [{i + 1}] GET {bbox}")
            req = urllib.request.Request(
                f"{OSM_API}?bbox={bbox}", headers={"User-Agent": UA}
            )
            last: Exception | None = None
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(req, timeout=180) as r:
                        raw = r.read()
                    break
                except Exception as exc:  # noqa: BLE001 - retry any transport failure
                    last = exc
                    time.sleep(2 ** (attempt + 1))
            else:
                raise RuntimeError(f"could not fetch tile {bbox}: {last}")
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(raw)
            root = ET.fromstring(raw)

        for node in root.findall("node"):
            if node.get("id") not in seen_nodes:
                seen_nodes.add(node.get("id") or "")
                merged.append(node)
        for way in root.findall("way"):
            if way.get("id") not in seen_ways:
                seen_ways.add(way.get("id") or "")
                merged.append(way)
        time.sleep(1.2)  # be polite to a public API

    print(f"  merged {len(seen_nodes)} nodes, {len(seen_ways)} ways from {len(tile_grid())} tiles")
    return merged


def metres_per_deg(lat: float) -> tuple[float, float]:
    """Local scale factors, matching the TS projection in project.ts."""
    rad = math.radians(lat)
    m_lat = 111132.92 - 559.82 * math.cos(2 * rad) + 1.175 * math.cos(4 * rad)
    m_lon = 111412.84 * math.cos(rad) - 93.5 * math.cos(3 * rad)
    return m_lat, m_lon


def path_length_m(pts: list[tuple[float, float]]) -> float:
    if len(pts) < 2:
        return 0.0
    m_lat, m_lon = metres_per_deg(pts[0][0])
    return sum(
        math.hypot((b[0] - a[0]) * m_lat, (b[1] - a[1]) * m_lon)
        for a, b in zip(pts, pts[1:])
    )


def simplify(pts: list[tuple[float, float]], tol: float = SIMPLIFY_TOL) -> list[tuple[float, float]]:
    """Ramer-Douglas-Peucker. Keeps road shape, drops collinear vertices."""
    if len(pts) < 3:
        return pts

    def rdp(seq: list[tuple[float, float]]) -> list[tuple[float, float]]:
        if len(seq) < 3:
            return seq
        (x0, y0), (x1, y1) = seq[0], seq[-1]
        dx, dy = x1 - x0, y1 - y0
        norm = math.hypot(dx, dy)
        worst_i, worst = 0, -1.0
        for i, (px, py) in enumerate(seq[1:-1], 1):
            if norm < 1e-12:
                d = math.hypot(px - x0, py - y0)
            else:
                d = abs(dy * px - dx * py + x1 * y0 - y1 * x0) / norm
            if d > worst:
                worst, worst_i = d, i
        if worst <= tol:
            return [seq[0], seq[-1]]
        return rdp(seq[: worst_i + 1])[:-1] + rdp(seq[worst_i:])

    return rdp(pts)


def main() -> int:
    print("Baguio map extraction from OpenStreetMap")
    root = fetch()

    nodes = {n.get("id"): (float(n.get("lat")), float(n.get("lon"))) for n in root.findall("node")}
    print(f"  {len(nodes)} nodes")

    NamedPts = tuple[str, list[tuple[float, float]]]
    roads: dict[str, list[NamedPts]] = {"arterial": [], "collector": [], "local": []}
    water: list[NamedPts] = []
    green: list[NamedPts] = []

    for w in root.findall("way"):
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        pts = [nodes[nd.get("ref")] for nd in w.findall("nd") if nd.get("ref") in nodes]
        if len(pts) < 2:
            continue

        hw = tags.get("highway")
        if hw in CLASS_MAP:
            length = path_length_m(pts)
            if length < MIN_WAY_LENGTH_M:
                continue
            simp = simplify(pts)
            if len(simp) < 2:
                continue
            name = tags.get("name") or tags.get("name:en") or ""
            roads[CLASS_MAP[hw]].append((name, simp))
            continue

        natural = tags.get("natural")
        leisure = tags.get("leisure")
        waterway = tags.get("waterway")

        # Burnham Park Lake and any other standing water.
        if waterway or natural in ("water", "wetland"):
            water.append((tags.get("name", ""), pts))
            continue
        # Parks and other green space.
        if leisure in ("park", "garden", "pitch", "golf_course", "nature_reserve"):
            green.append((tags.get("name", ""), pts))

    # Stitch fragments before reporting counts, so the numbers reflect the
    # continuous roads that actually get rendered.
    for cls in ("arterial", "collector", "local"):
        roads[cls] = stitch(roads[cls], cls)

    print(f"  roads   arterial={len(roads['arterial'])} collector={len(roads['collector'])} local={len(roads['local'])}")
    print(f"  water   {len(water)}")
    print(f"  green   {len(green)}")

    # Sort every list so a re-extraction of the same OSM data produces a
    # byte-identical file. Without this, upstream response ordering alone
    # produces a diff that looks like a data change but is only reordering.
    for cls in roads:
        roads[cls].sort(key=lambda w: (w[0], w[1][0][0], w[1][0][1]))
    water.sort(key=lambda w: (w[0], w[1][0][0]))
    green.sort(key=lambda w: (w[0], w[1][0][0]))

    payload = {
        "attribution": "OpenStreetMap contributors, ODbL 1.0. Retrieved 2026-10-06.",
        "bbox": BBOX,
        "roads": roads,
        "water": [{"name": n, "points": p} for n, p in water],
        "green": [{"name": n, "points": p} for n, p in green],
    }
    out = Path(".osm-scratch/baguio.json")
    out.write_text(json.dumps(payload, sort_keys=False, separators=(",", ":")), encoding="utf-8")
    print(f"\n  wrote {out} ({out.stat().st_size // 1024} KB)")
    print("  Next: generate the TS module from this payload.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
