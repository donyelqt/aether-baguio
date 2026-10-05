/**
 * Binary snapshot wire protocol — ARCHITECTURE §7.2.
 *
 * The byte layout here is the contract with the Python encoder
 * (`apps/simulation/app/wire/protocol.py`). Both sides MUST derive their stride
 * from these constants; never inline a literal (ADR-16).
 */

/** Header size in bytes. Mirrors Python `struct.calcsize("<IIdIII") == 28`. */
export const HEADER_SIZE = 28;

/** Entity record size in bytes. Mirrors `struct.calcsize("<IiiiHHiiiHHHHI") == 44`. */
export const ENTITY_STRIDE = 44;

/** Scene-event record size. Mirrors `struct.calcsize("<BBIII") == 14`. */
export const SCENE_RECORD_SIZE = 14;

/** Wire protocol version. Bump on any breaking layout change. */
export const PROTOCOL_VERSION = 1;

/** Simulation tick rate. Kept here so client timing cannot drift from the engine. */
export const TICK_HZ = 15;

/** Fixed timestep in seconds. Derived, never measured from a clock (NFR-1). */
export const DT = 1 / TICK_HZ;

/** Frame header field offsets (little-endian). */
export const HEADER = {
  VERSION: 0, // u32
  TICK: 4, // u32
  SIM_TIME: 8, // f64
  ENTITY_COUNT: 16, // u32
  FLAGS: 20, // u32
  RESERVED: 24, // u32
} as const;

/** Header flag bits. */
export const FrameFlag = {
  /** Full state — every entity present, no delta semantics. */
  KEYFRAME: 1 << 0,
  /** Incremental: only changed entities present. */
  DELTA: 1 << 1,
  /** Body carries scene-event records after the entity block. */
  SCENE_EVENTS: 1 << 2,
} as const;

/** Active-state records replayed on reconnect — ARCHITECTURE §16. */
export const SceneKind = {
  LANE_CLOSED: 1,
  SIGNAL_TIMING_OVERRIDE: 2,
  ACTIVE_INCIDENT: 3,
  UNIT_DISPATCHED: 4,
  SERVICE_LEVEL_CHANGE: 5,
} as const;

export type SceneKindValue = (typeof SceneKind)[keyof typeof SceneKind];

/** A decoded entity transform. Velocities are cm/s, position cm, heading radians. */
export interface EntityState {
  id: number;
  /** Position in world centimetres. World origin is the map's SW corner. */
  x: number;
  y: number;
  z: number;
  /** Heading in radians, wrapped to [0, 2π). */
  heading: number;
  vx: number;
  vy: number;
  vz: number;
  state: number;
  type: number;
  routeCursor: number;
  occupancy: number;
}

/** An active intervention carried in scene-event frames — ARCHITECTURE §16. */
export interface SceneRecord {
  kind: number;
  /** 0 = inactive/expired, 1 = active. */
  status: number;
  targetId: number;
  startTick: number;
  endTick: number;
}
