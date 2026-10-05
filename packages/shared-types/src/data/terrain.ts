/**
 * Procedural terrain for central Baguio.
 *
 * Baguio sits in a highland bowl at roughly 1,400 m, ringed by ridges that
 * rise steeply east toward the Cordillera. The CBD itself is comparatively
 * flat, which matters: agents walk and drive on it, so a plausible bowl with a
 * rugged rim reproduces the real constraint that the city is built on a shelf.
 *
 * The field is deterministic given a seed (NFR-1). Nothing here reads a clock
 * or the global RNG, so the same seed reproduces the same terrain on every
 * run and in every replay.
 */

/** Metres above sea level at the CBD floor (Burnham Park sits near 1,400 m). */
export const BASE_ELEVATION_M = 1400;

/** Peak additional height of the eastern ridge. */
export const RIDGE_HEIGHT_M = 320;

/**
 * Integer hash → [0, 1). Uses integer arithmetic only, so it is stable across
 * platforms and independent of `PYTHONHASHSEED` or any language's string hash.
 */
function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Quintic smoothstep — C2 continuous, so normals do not show grid banding. */
function smooth(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Value noise with smooth interpolation. Cheap, deterministic, and smooth
 * enough for terrain at this scale; gradient noise would be better for ridges
 * but is not worth the complexity until the terrain is actually inspected.
 */
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);

  const u = smooth(xf);
  const v = smooth(yf);

  return v00 * (1 - u) * (1 - v) + v10 * u * (1 - v) + v01 * (1 - u) * v + v11 * u * v;
}

/** Fractal sum of octaves. Each doubles frequency and halves amplitude. */
function fbm(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export interface Heightfield {
  /** Samples per side. Total samples are `res * res`. */
  res: number;
  /** Extent in metres; the field covers [-extent/2, +extent/2] on both axes. */
  extentM: number;
  /** Elevations in metres, row-major, `heights[i * res + j]`. */
  heights: Float32Array;
}

/**
 * Builds the heightfield.
 *
 * The shape is a bowl: elevation rises with distance from the CBD centre, most
 * steeply to the east and north where the real ridges are. Value noise adds
 * local relief, damped near the centre so the walkable CBD stays flat enough
 * for roads to sit on it.
 */
export function generateHeightfield(extentM: number, res: number, seed = 1337): Heightfield {
  if (res < 2) throw new RangeError(`res must be >= 2, got ${res}`);
  if (extentM <= 0) throw new RangeError(`extentM must be > 0, got ${extentM}`);

  const heights = new Float32Array(res * res);
  const half = extentM / 2;
  // Metres per noise cell. ~380 m gives large landforms; the octave stack
  // supplies the detail.
  const NOISE_SCALE = 1 / 380;

  for (let i = 0; i < res; i++) {
    // North-to-south so row 0 is the northern edge.
    const z = half - (i / (res - 1)) * extentM;
    for (let j = 0; j < res; j++) {
      const x = -half + (j / (res - 1)) * extentM;

      // Radial rise from the CBD centre, biased east and north.
      const east = x / half; // -1 west .. +1 east
      const north = z / half;
      // Radial distance from the centre, weighted so the north-south axis
      // contributes less than east-west. The weighting is symmetric, so the
      // east and west edges reach the same height; this is not an asymmetry.
      const bowl = Math.sqrt(east * east * 0.85 + north * north * 0.55);

      // Rim elevation. Smoothstep keeps the city floor flat and the rim steep.
      const rim = smooth(Math.min(1, Math.max(0, (bowl - 0.28) / 0.72)));
      let h = BASE_ELEVATION_M + RIDGE_HEIGHT_M * rim;

      // Local relief, damped inside the bowl so the CBD stays level.
      const relief = fbm(x * NOISE_SCALE, z * NOISE_SCALE, seed, 5) - 0.5;
      h += relief * 70 * (0.25 + 0.75 * rim);

      heights[i * res + j] = h;
    }
  }

  return { res, extentM, heights };
}

/**
 * Samples the field with bilinear interpolation and edge clamping.
 *
 * Clamping rather than wrapping matters: wrapping would make the far edge of the
 * terrain continuous with the near edge, which is visibly wrong at a 4 km span.
 */
export function sampleHeight(field: Heightfield, x: number, z: number): number {
  const half = field.extentM / 2;
  const u = ((x + half) / field.extentM) * (field.res - 1);
  const v = ((half - z) / field.extentM) * (field.res - 1);

  const uClamped = Math.min(field.res - 1, Math.max(0, u));
  const vClamped = Math.min(field.res - 1, Math.max(0, v));

  const j0 = Math.floor(uClamped);
  const i0 = Math.floor(vClamped);
  const j1 = Math.min(field.res - 1, j0 + 1);
  const i1 = Math.min(field.res - 1, i0 + 1);

  const fu = uClamped - j0;
  const fv = vClamped - i0;

  // Indices are in range by construction: uClamped/vClamped are clamped to
  // [0, res-1] above and i1/j1 are min(i0+1, res-1), so no bounds fallback is
  // needed here.
  const h00 = field.heights[i0 * field.res + j0]!;
  const h01 = field.heights[i0 * field.res + j1]!;
  const h10 = field.heights[i1 * field.res + j0]!;
  const h11 = field.heights[i1 * field.res + j1]!;

  const top = h00 + (h01 - h00) * fu;
  const bottom = h10 + (h11 - h10) * fu;
  return top + (bottom - top) * fv;
}

/**
 * Central-difference normal, used for terrain shading.
 *
 * The step is one grid sample rather than one metre. That keeps the stencil
 * aligned with the data and avoids aliasing, but it does mean the normal is
 * resolution-dependent: a finer field samples a tighter neighbourhood. This is
 * intended, since finer terrain should shade finer detail.
 */
export function sampleNormal(
  field: Heightfield,
  x: number,
  z: number,
): { nx: number; ny: number; nz: number } {
  const step = field.extentM / (field.res - 1);
  const hl = sampleHeight(field, x - step, z);
  const hr = sampleHeight(field, x + step, z);
  const hd = sampleHeight(field, x, z - step);
  const hu = sampleHeight(field, x, z + step);

  const nx = hl - hr;
  const nz = hd - hu;
  const ny = 2 * step;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len };
}
