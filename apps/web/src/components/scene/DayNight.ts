'use client';

/**
 * Day/night cycle.
 *
 * The sun is placed with a real solar-position formula for Baguio's latitude,
 * rather than rotating a light on an arbitrary axis. That means dawn actually
 * comes from the east, the sun tracks across the northern sky as it does at
 * 16°N, and night is genuinely dark — all of which fall out of the maths
 * instead of being hand-tuned.
 *
 * Baguio sits at 16.4°N, so the sun is north of the zenith for much of the
 * year. A naive "sun goes over the top" arc would be wrong for this latitude
 * and would read as obviously artificial.
 */

/** Baguio latitude, degrees north. */
const LATITUDE_DEG = 16.4080101;

/** Solar declination at the June solstice, where it is greatest. */
const MAX_DECLINATION_DEG = 23.44;

/** Day of year, 1-365. 172 is the June solstice. */
export interface SunState {
  /** Unit vector pointing from the origin toward the sun. */
  x: number;
  y: number;
  z: number;
  /** 0 at night, 1 at full daylight. Drives sky and light intensity. */
  daylight: number;
}

const DEG = Math.PI / 180;

/**
 * Sun direction for a day of year and local hour.
 *
 * Uses the standard declination approximation plus a simple hour-angle model.
 * It is not an ephemeris and does not need to be: what matters is that the
 * sun rises east, sets west, and swings north at this latitude.
 */
export function sunPosition(dayOfYear: number, localHour: number): SunState {
  // Declination: sinusoidal, max at the solstice.
  const declination = MAX_DECLINATION_DEG * Math.sin((360 / 365) * (dayOfYear - 81) * DEG);

  // Hour angle: 0 at solar noon, ±180° at midnight.
  const hourAngle = (localHour - 12) * 15 * DEG;

  const lat = LATITUDE_DEG * DEG;
  const dec = declination * DEG;

  const sinAlt =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // Azimuth measured clockwise from north.
  const cosAz =
    (Math.sin(dec) - Math.sin(altitude) * Math.sin(lat)) /
    (Math.cos(altitude) * Math.cos(lat) || 1e-6);
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

  // World frame: x east, y up, z north. Azimuth 0 = north = +z, 90 = east = +x.
  const cosAlt = Math.cos(altitude);
  const x = Math.sin(azimuth) * cosAlt;
  const z = Math.cos(azimuth) * cosAlt;
  const y = Math.sin(altitude);

  // Daylight ramps through civil twilight rather than snapping at the horizon.
  const daylight = Math.max(0, Math.min(1, (sinAlt + 0.12) / 0.24));

  return { x, y, z, daylight };
}

/** Sky and light colours interpolated across the day. */
export function skyColors(daylight: number): {
  sky: string;
  fog: string;
  sun: string;
  ambient: number;
  sunIntensity: number;
} {
  if (daylight > 0.5) {
    const t = (daylight - 0.5) / 0.5;
    return {
      sky: '#87b8e0',
      fog: '#a8c4d8',
      sun: '#fff6e0',
      ambient: 0.35 + 0.35 * t,
      sunIntensity: 1.6 + 0.9 * t,
    };
  }
  const t = daylight / 0.5;
  return {
    sky: '#0a1024',
    fog: '#141c33',
    sun: '#ffb877',
    ambient: 0.1 + 0.25 * t,
    sunIntensity: 0.15 + 1.45 * t,
  };
}
