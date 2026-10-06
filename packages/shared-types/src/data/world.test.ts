import { describe, expect, it } from 'vitest';
import { WORLD_EXTENT_M } from '../world';
import { LANDMARKS, ORIGIN, ROADS } from './baguio';
import {
  buildLandmarks,
  buildRoadGraph,
  createProjector,
  ROAD_WIDTH_M,
  worldBounds,
} from './project';

/**
 * These tests validate the projection and the graph structure. They are the
 * check that the map is Baguio rather than an arbitrary grid: the distances
 * asserted below are the real-world separations between the landmarks.
 */

const project = createProjector();

describe('projection', () => {
  it('places the origin at zero', () => {
    const p = project(ORIGIN);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBeCloseTo(0, 6);
  });

  it('maps north to +z and east to +x', () => {
    const north = project({ lat: ORIGIN.lat + 0.001, lon: ORIGIN.lon });
    const east = project({ lat: ORIGIN.lat, lon: ORIGIN.lon + 0.001 });
    expect(north.z).toBeGreaterThan(0);
    expect(north.x).toBeCloseTo(0, 6);
    expect(east.x).toBeGreaterThan(0);
    expect(east.z).toBeCloseTo(0, 6);
  });

  it('reproduces the real distance between known landmarks', () => {
    const byId = new Map(LANDMARKS.map((l) => [l.id, l]));
    const dist = (a: string, b: string) => {
      const pa = project(byId.get(a)!.at);
      const pb = project(byId.get(b)!.at);
      return Math.hypot(pa.x - pb.x, pa.z - pb.z);
    };

    // Burnham Park to City Hall is ~0.8 km on the ground.
    expect(dist('burnham-park', 'baguio-city-hall')).toBeGreaterThan(600);
    expect(dist('burnham-park', 'baguio-city-hall')).toBeLessThan(1100);

    // The Cathedral sits a few hundred metres from Session Road.
    expect(dist('baguio-cathedral', 'session-road')).toBeLessThan(300);

    // Mines View Park is the far outlier, ~3.5 km east.
    expect(dist('burnham-park', 'mines-view-park')).toBeGreaterThan(3000);
  });
});

describe('road graph', () => {
  const { nodes, segments } = buildRoadGraph(project);

  it('builds nodes and segments from every road', () => {
    expect(nodes.length).toBeGreaterThan(20);
    expect(segments.length).toBeGreaterThan(ROADS.length);
  });

  it('references only existing nodes', () => {
    for (const s of segments) {
      expect(s.from).toBeGreaterThanOrEqual(0);
      expect(s.from).toBeLessThan(nodes.length);
      expect(s.to).toBeGreaterThanOrEqual(0);
      expect(s.to).toBeLessThan(nodes.length);
      expect(s.from).not.toBe(s.to);
    }
  });

  it('emits positive segment lengths', () => {
    for (const s of segments) {
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('merges coincident endpoints into shared junction nodes', () => {
    // Session Road is authored as two polylines that share their western
    // origin. Both must collapse onto one node, otherwise the graph carries
    // two disconnected copies of the same street.
    const session = ROADS.filter((r) => r.id.startsWith('session-road'));
    expect(session).toHaveLength(2);
    const w = project(session[0]!.path[0]!);
    const e = project(session[1]!.path[0]!);
    expect(Math.hypot(w.x - e.x, w.z - e.z)).toBeLessThan(1);

    // Which is the real assertion: exactly one node sits at that position.
    const shared = nodes.filter((n) => Math.hypot(n.x - w.x, n.z - w.z) < 1);
    expect(shared).toHaveLength(1);
  });

  it('leaves every node inside the declared world extent', () => {
    for (const n of nodes) {
      expect(Math.abs(n.x)).toBeLessThan(WORLD_EXTENT_M);
      expect(Math.abs(n.z)).toBeLessThan(WORLD_EXTENT_M);
    }
  });

  it('gives arterials the most lanes and locals the fewest', () => {
    expect(ROAD_WIDTH_M.arterial).toBeGreaterThan(ROAD_WIDTH_M.collector);
    expect(ROAD_WIDTH_M.collector).toBeGreaterThan(ROAD_WIDTH_M.local);
  });

  it('is connected as one component, so Phase 1 routing can reach anywhere', () => {
    const adjacency = new Map<number, number[]>();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const s of segments) {
      adjacency.get(s.from)!.push(s.to);
      adjacency.get(s.to)!.push(s.from);
    }
    const seen = new Set<number>([nodes[0]!.id]);
    const queue = [nodes[0]!.id];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const nb of adjacency.get(cur)!) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    expect(seen.size).toBe(nodes.length);
  });
});

describe('landmarks', () => {
  const landmarks = buildLandmarks(project);

  it('projects every landmark into the world extent', () => {
    for (const l of landmarks) {
      expect(Math.abs(l.x)).toBeLessThan(WORLD_EXTENT_M);
      expect(Math.abs(l.z)).toBeLessThan(WORLD_EXTENT_M);
    }
  });

  it('gives every landmark a positive footprint', () => {
    for (const l of landmarks) {
      expect(l.halfWidth).toBeGreaterThan(0);
      expect(l.halfDepth).toBeGreaterThan(0);
    }
  });

  it('gives every landmark a height consistent with its kind', () => {
    // Ground-level features render as flat slabs, whatever their category. A
    // commercial corridor is a surface, not a block: modelling it with height
    // put a building in the carriageway it names.
    const groundLevel = new Set([
      'burnham-park',
      'camp-john-hay',
      'mines-view-park',
      'session-road',
    ]);
    for (const l of landmarks) {
      if (groundLevel.has(l.id)) {
        expect(l.height, `${l.id} should be flat`).toBe(0);
      } else {
        expect(l.height, `${l.id} should have height`).toBeGreaterThan(0);
      }
    }
  });

  it('has unique ids', () => {
    expect(new Set(landmarks.map((l) => l.id)).size).toBe(landmarks.length);
  });

  it('fits inside the declared extent including footprints', () => {
    const { nodes } = buildRoadGraph(project);
    const b = worldBounds(nodes, landmarks);
    expect(b.spanX).toBeLessThan(WORLD_EXTENT_M);
    expect(b.spanZ).toBeLessThan(WORLD_EXTENT_M);
  });

  it('includes SM City Baguio and University of the Cordilleras', () => {
    const ids = landmarks.map((l) => l.id);
    expect(ids).toContain('sm-city-baguio');
    expect(ids).toContain('university-of-the-cordilleras');
  });

  it('places every landmark within walking distance of a road node', () => {
    // A landmark further than 250 m from the nearest node is unreachable in
    // Phase 1: agents route on the graph, so they could never reach it.
    const { nodes } = buildRoadGraph(project);
    for (const l of landmarks) {
      let best = Infinity;
      for (const n of nodes) {
        best = Math.min(best, Math.hypot(n.x - l.x, n.z - l.z));
      }
      expect(best, `${l.id} is ${Math.round(best)} m from the nearest road`).toBeLessThan(250);
    }
  });

  it('fits every road node and landmark inside the terrain extent', () => {
    // Regression: WORLD_EXTENT_M was sized from landmark centres, which left
    // the eastern third of the network (Camp John Hay, the Mines View spur)
    // outside the terrain, where sampling clamps and roads sit on the rim.
    const { nodes } = buildRoadGraph(project);
    const half = WORLD_EXTENT_M / 2;
    for (const n of nodes) {
      expect(Math.abs(n.x), `node ${n.id} x`).toBeLessThanOrEqual(half);
      expect(Math.abs(n.z), `node ${n.id} z`).toBeLessThanOrEqual(half);
    }
    for (const l of landmarks) {
      expect(
        Math.max(Math.abs(l.x) + l.halfWidth, Math.abs(l.z) + l.halfDepth),
        `${l.id} footprint`,
      ).toBeLessThanOrEqual(half);
    }
  });
});
