import { describe, expect, it } from 'vitest';
import { interpolatePosition, SnapshotDecoder } from './decode';
import { ENTITY_STRIDE, FrameFlag, HEADER_SIZE, PROTOCOL_VERSION, SCENE_RECORD_SIZE } from './wire';

/**
 * These tests catch drift between the TypeScript decoder and the Python encoder
 * (`apps/simulation/app/wire/protocol.py`). If a field is added on one side
 * without the other, these fail — that is the point (ADR-16).
 */

interface TestEntity {
  id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  vx?: number;
  vy?: number;
  vz?: number;
  state?: number;
  type?: number;
  routeCursor?: number;
  occupancy?: number;
}

/** Build a frame byte-for-byte the way the Python encoder does. */
function buildFrame(
  entities: TestEntity[],
  opts: { tick?: number; simTime?: number; flags?: number; sceneKinds?: number[] } = {},
): ArrayBuffer {
  const flags = opts.flags ?? FrameFlag.KEYFRAME;
  const sceneCount = opts.sceneKinds?.length ?? 0;
  const buf = new ArrayBuffer(
    HEADER_SIZE + entities.length * ENTITY_STRIDE + sceneCount * SCENE_RECORD_SIZE,
  );
  const dv = new DataView(buf);

  dv.setUint32(0, PROTOCOL_VERSION, true);
  dv.setUint32(4, opts.tick ?? 1, true);
  dv.setFloat64(8, opts.simTime ?? 0, true);
  dv.setUint32(16, entities.length, true);
  dv.setUint32(20, flags, true);
  dv.setUint32(24, 0, true);

  let off = HEADER_SIZE;
  for (const e of entities) {
    dv.setUint32(off, e.id, true);
    dv.setInt32(off + 4, e.x, true);
    dv.setInt32(off + 8, e.y, true);
    dv.setInt32(off + 12, e.z, true);
    dv.setUint16(off + 16, Math.round((e.heading / (Math.PI * 2)) * 65536) & 0xffff, true);
    dv.setUint16(off + 18, 0, true); // reserved0
    dv.setInt32(off + 20, e.vx ?? 0, true);
    dv.setInt32(off + 24, e.vy ?? 0, true);
    dv.setInt32(off + 28, e.vz ?? 0, true);
    dv.setUint16(off + 32, e.state ?? 0, true);
    dv.setUint16(off + 34, e.type ?? 0, true);
    dv.setUint16(off + 36, e.routeCursor ?? 0, true);
    dv.setUint16(off + 38, e.occupancy ?? 0, true);
    off += ENTITY_STRIDE;
  }

  (opts.sceneKinds ?? []).forEach((kind, i) => {
    dv.setUint8(off, kind);
    dv.setUint8(off + 1, 1);
    dv.setUint32(off + 2, i + 1, true);
    dv.setUint32(off + 6, 0, true);
    dv.setUint32(off + 10, 1000, true);
    off += SCENE_RECORD_SIZE;
  });

  return buf;
}

describe('wire layout', () => {
  it('uses the documented byte sizes', () => {
    // Matches Python: calcsize("<IIdIII") == 28, ("<IiiiHHiiiHHHHI") == 44, ("<BBIII") == 14
    expect(HEADER_SIZE).toBe(28);
    expect(ENTITY_STRIDE).toBe(44);
    expect(SCENE_RECORD_SIZE).toBe(14);
  });

  it('round-trips a single entity', () => {
    const frame = buildFrame([
      { id: 4821, x: 18240, y: 0, z: -9120, heading: 1.82, vx: 100, state: 3 },
    ]);
    const e = new SnapshotDecoder(1024).decode(frame).entities[0]!;
    expect(e.id).toBe(4821);
    expect(e.x).toBe(18240);
    expect(e.z).toBe(-9120);
    expect(e.vx).toBe(100);
    expect(e.state).toBe(3);
  });

  it('quantises heading to u16 across the full range', () => {
    // pi/2 is exactly on the lattice (16384/65536 * 2pi), so asserting only on
    // it would pass even with no quantisation at all. These headings sit
    // between lattice points, where the error is genuinely non-zero.
    const headings = [1.0, 0.7, Math.PI / 3, 2.9, 0.123];
    const step = (Math.PI * 2) / 65536;
    for (const heading of headings) {
      const frame = buildFrame([{ id: 1, x: 0, y: 0, z: 0, heading }]);
      const e = new SnapshotDecoder(1024).decode(frame).entities[0]!;
      // Half a step is the worst case for round-to-nearest.
      expect(Math.abs(e.heading - heading)).toBeLessThanOrEqual(step / 2);
      expect(Math.abs(e.heading - heading)).toBeGreaterThan(0);
    }
  });

  it('returns exactly pi/2 for a value on the lattice', () => {
    const frame = buildFrame([{ id: 1, x: 0, y: 0, z: 0, heading: Math.PI / 2 }]);
    const e = new SnapshotDecoder(1024).decode(frame).entities[0]!;
    expect(e.heading).toBeCloseTo(Math.PI / 2, 12);
  });

  it('round-trips a full 500-entity frame within the section 7.3 budget', () => {
    const entities = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      x: i * 10,
      y: 0,
      z: i * -5,
      heading: 0,
    }));
    const frame = buildFrame(entities);
    const snap = new SnapshotDecoder().decode(frame);
    expect(snap.entities).toHaveLength(500);
    expect(snap.entities[499]!.z).toBe(-2495);

    // §7.3: 44 B/entity. A 500-entity frame is ~21.5 KB.
    const kb = frame.byteLength / 1024;
    expect(kb).toBeGreaterThan(21);
    expect(kb).toBeLessThan(23);
  });

  it('decodes scene events appended after the entity block', () => {
    const frame = buildFrame([{ id: 1, x: 0, y: 0, z: 0, heading: 0 }], {
      flags: FrameFlag.KEYFRAME | FrameFlag.SCENE_EVENTS,
      sceneKinds: [1, 3],
    });
    const snap = new SnapshotDecoder(1024).decode(frame);
    expect(snap.entities).toHaveLength(1);
    expect(snap.scene).toHaveLength(2);
    expect(snap.scene[0]!.kind).toBe(1);
    expect(snap.scene[1]!.targetId).toBe(2);
  });

  it('omits scene records when the flag is clear', () => {
    const frame = buildFrame([{ id: 1, x: 0, y: 0, z: 0, heading: 0 }], { sceneKinds: [1] });
    // sceneKinds with no flag set would overrun the buffer, so build without them
    const snap = new SnapshotDecoder(1024).decode(frame);
    expect(snap.scene).toHaveLength(0);
  });

  it('rejects a truncated frame rather than reading garbage', () => {
    const full = buildFrame([{ id: 1, x: 0, y: 0, z: 0, heading: 0 }]);
    expect(() => new SnapshotDecoder(1024).decode(full.slice(0, HEADER_SIZE + 10))).toThrow(
      RangeError,
    );
  });

  it('rejects an unsupported protocol version', () => {
    const frame = buildFrame([]);
    new DataView(frame).setUint32(0, 99, true);
    expect(() => new SnapshotDecoder(1024).decode(frame)).toThrow(/unsupported wire version/);
  });

  it('rejects a frame larger than decoder capacity', () => {
    const frame = buildFrame(
      Array.from({ length: 10 }, (_, i) => ({ id: i, x: 0, y: 0, z: 0, heading: 0 })),
    );
    expect(() => new SnapshotDecoder(64).decode(frame)).toThrow(RangeError);
  });

  it('reports the keyframe flag', () => {
    expect(
      new SnapshotDecoder(1024).decode(buildFrame([], { flags: FrameFlag.KEYFRAME })).isKeyframe,
    ).toBe(true);
    expect(
      new SnapshotDecoder(1024).decode(buildFrame([], { flags: FrameFlag.DELTA })).isKeyframe,
    ).toBe(false);
  });
});

describe('interpolation', () => {
  it('takes the shortest arc across the ±π wrap', () => {
    const from = { x: 0, y: 0, z: 0, heading: 0.1 };
    const to = { x: 0, y: 0, z: 0, heading: Math.PI * 2 - 0.1 };
    // A naive lerp passes through π (a 180° spin); the shortest arc stays near 0.
    expect(Math.cos(interpolatePosition(from, to, 0.5).heading)).toBeGreaterThan(0.9);
  });

  it('interpolates position linearly', () => {
    const from = { x: 0, y: 0, z: 0, heading: 0 };
    const to = { x: 100, y: 50, z: -200, heading: 0 };
    const mid = interpolatePosition(from, to, 0.5);
    expect(mid.x).toBe(50);
    expect(mid.y).toBe(25);
    expect(mid.z).toBe(-100);
  });
});
