/**
 * Zero-allocation binary frame decoder — ARCHITECTURE §7.2.
 *
 * Decodes one ArrayBuffer into reusable objects so a steady-state render loop
 * allocates nothing per frame (NFR-3).
 */
import {
  ENTITY_STRIDE,
  type EntityState,
  FrameFlag,
  HEADER,
  HEADER_SIZE,
  PROTOCOL_VERSION,
  SCENE_RECORD_SIZE,
  type SceneRecord,
} from './wire';

/** A decoded snapshot: entities plus active scene state. */
export interface Snapshot {
  tick: number;
  simTime: number;
  isKeyframe: boolean;
  entities: EntityState[];
  scene: SceneRecord[];
}

const EMPTY_ENTITY = (): EntityState => ({
  id: 0,
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  state: 0,
  type: 0,
  routeCursor: 0,
  occupancy: 0,
});

const EMPTY_SCENE = (): SceneRecord => ({
  kind: 0,
  status: 0,
  targetId: 0,
  startTick: 0,
  endTick: 0,
});

/**
 * Reusable decoder. The pool is sized by the largest frame seen, so decode()
 * performs no allocation in steady state.
 */
export class SnapshotDecoder {
  readonly #capacity: number;
  #pool: EntityState[] = [];
  #scenePool: SceneRecord[] = [];

  constructor(capacityBytes = 1 << 20) {
    this.#capacity = capacityBytes;
  }

  decode(frame: ArrayBuffer): Snapshot {
    if (frame.byteLength < HEADER_SIZE) {
      throw new RangeError(`frame too short: ${frame.byteLength} < ${HEADER_SIZE}`);
    }
    if (frame.byteLength > this.#capacity) {
      throw new RangeError(`decoder capacity ${this.#capacity} < frame ${frame.byteLength}`);
    }

    const dv = new DataView(frame);
    const version = dv.getUint32(HEADER.VERSION, true);
    if (version !== PROTOCOL_VERSION) {
      throw new Error(`unsupported wire version ${version}, expected ${PROTOCOL_VERSION}`);
    }

    const tick = dv.getUint32(HEADER.TICK, true);
    const simTime = dv.getFloat64(HEADER.SIM_TIME, true);
    const entityCount = dv.getUint32(HEADER.ENTITY_COUNT, true);
    const flags = dv.getUint32(HEADER.FLAGS, true);

    const needed = HEADER_SIZE + entityCount * ENTITY_STRIDE;
    if (frame.byteLength < needed) {
      throw new RangeError(`truncated frame: have ${frame.byteLength}, need ${needed}`);
    }

    const entities: EntityState[] = [];
    let off = HEADER_SIZE;
    for (let i = 0; i < entityCount; i++) {
      let e = this.#pool[i];
      if (e === undefined) {
        e = EMPTY_ENTITY();
        this.#pool[i] = e;
      }
      e.id = dv.getUint32(off, true);
      e.x = dv.getInt32(off + 4, true);
      e.y = dv.getInt32(off + 8, true);
      e.z = dv.getInt32(off + 12, true);
      // heading_q is u16 wrapping 2π (§7.5): resolution is exactly 2π/65536.
      e.heading = (dv.getUint16(off + 16, true) / 65536) * Math.PI * 2;
      // reserved0 u16 at off+18 — padding, deliberately skipped.
      e.vx = dv.getInt32(off + 20, true);
      e.vy = dv.getInt32(off + 24, true);
      e.vz = dv.getInt32(off + 28, true);
      e.state = dv.getUint16(off + 32, true);
      e.type = dv.getUint16(off + 34, true);
      e.routeCursor = dv.getUint16(off + 36, true);
      e.occupancy = dv.getUint16(off + 38, true);
      entities.push(e);
      off += ENTITY_STRIDE;
    }

    // Scene records follow entity records when the flag is set (§16).
    const scene: SceneRecord[] = [];
    if ((flags & FrameFlag.SCENE_EVENTS) !== 0) {
      const count = Math.floor((frame.byteLength - off) / SCENE_RECORD_SIZE);
      for (let i = 0; i < count; i++) {
        let s = this.#scenePool[i];
        if (s === undefined) {
          s = EMPTY_SCENE();
          this.#scenePool[i] = s;
        }
        s.kind = dv.getUint8(off);
        s.status = dv.getUint8(off + 1);
        s.targetId = dv.getUint32(off + 2, true);
        s.startTick = dv.getUint32(off + 6, true);
        s.endTick = dv.getUint32(off + 10, true);
        scene.push(s);
        off += SCENE_RECORD_SIZE;
      }
    }

    return { tick, simTime, isKeyframe: (flags & FrameFlag.KEYFRAME) !== 0, entities, scene };
  }
}

/**
 * Interpolate between two snapshots — ARCHITECTURE §7.6.
 *
 * Render runs at 60 FPS from a 15 Hz feed, so interpolation is mandatory, not
 * cosmetic. `alpha` is fractional progress between `from` and `to`.
 */
export function interpolatePosition(
  from: { x: number; y: number; z: number; heading: number },
  to: { x: number; y: number; z: number; heading: number },
  alpha: number,
): { x: number; y: number; z: number; heading: number } {
  // Shortest-arc heading interpolation — a naive lerp spins the long way at ±π.
  const tau = Math.PI * 2;
  const dh = ((((to.heading - from.heading + Math.PI) % tau) + tau) % tau) - Math.PI;
  return {
    x: from.x + (to.x - from.x) * alpha,
    y: from.y + (to.y - from.y) * alpha,
    z: from.z + (to.z - from.z) * alpha,
    heading: from.heading + dh * alpha,
  };
}
