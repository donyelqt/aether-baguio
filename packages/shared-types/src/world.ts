/**
 * Static world model — the map. Loaded once, never mutated at runtime.
 *
 * Coordinates are local metres relative to `WORLD_ORIGIN`, anchored to a real
 * Baguio reference point so GIS data can be reprojected into this frame.
 * Degrees are never stored here: simulation and physics run in metres, and
 * float precision at EPSG:4326 is unacceptable at city scale.
 */

/**
 * Reference point for the local ENU frame — Burnham Park, Baguio.
 * From OpenStreetMap (Nominatim, retrieved 2026-10-06).
 */
export const WORLD_ORIGIN = {
  /** Latitude in degrees (WGS84). Provenance only; not used at runtime. */
  lat: 16.4080101,
  /** Longitude in degrees (WGS84). Provenance only; not used at runtime. */
  lon: 120.5959849,
  /** Metres east of origin. */
  x: 0,
  /** Metres north of origin. */
  z: 0,
} as const;

/**
 * Extent of the generated world, in metres. Terrain covers a square of this
 * size centred on the origin.
 *
 * The CBD landmark set spans roughly 4.24 km east-west including footprint
 * half-extents, so this is sized to contain the map rather than clip it. A
 * power-of-two value was rejected: it would have been 8192 m and doubled the
 * terrain vertex count for no benefit.
 */
export const WORLD_EXTENT_M = 4608;

/** Road classes. Lane count derives from these in the Phase 1 traffic model. */
export const RoadClass = {
  ARTERIAL: 'arterial',
  COLLECTOR: 'collector',
  LOCAL: 'local',
} as const;

export type RoadClassValue = (typeof RoadClass)[keyof typeof RoadClass];

/** Lane count per road class. */
export const LANES_BY_CLASS: Record<RoadClassValue, number> = {
  arterial: 4,
  collector: 2,
  local: 1,
};

/** A named place. `kind` selects which mesh the renderer builds. */
export interface Landmark {
  id: string;
  name: string;
  kind: 'park' | 'civic' | 'religious' | 'commercial' | 'nature';
  /** Centre in local metres. */
  x: number;
  z: number;
  /** Footprint half-extents in metres (x, z). */
  halfWidth: number;
  halfDepth: number;
  /** Height in metres. Ignored for parks and terrain features. */
  height: number;
}

/** A node in the road graph. */
export interface RoadNode {
  id: number;
  x: number;
  z: number;
  /** Terrain elevation in metres at this node, sampled from the heightfield. */
  y: number;
}

/** A road segment between two nodes. */
export interface RoadSegment {
  id: string;
  from: number;
  to: number;
  roadClass: RoadClassValue;
  /** Metres. */
  length: number;
}

/** The complete static world. */
export interface WorldData {
  extentM: number;
  origin: typeof WORLD_ORIGIN;
  nodes: RoadNode[];
  segments: RoadSegment[];
  landmarks: Landmark[];
  /** Heightfield resolution (samples per side). `heights[i * heightRes + j]`. */
  heightRes: number;
  /** Heightfield in metres, row-major, `heightRes * heightRes` entries. */
  heights: Float32Array;
}
