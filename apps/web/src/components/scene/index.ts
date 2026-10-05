/**
 * Scene components — R3F rendering of the static world.
 *
 * The static world (terrain, roads, landmarks, day/night) already renders from
 * these modules; this barrel exists so scene code has one import path as
 * `AgentInstances` arrives in Phase 1.
 *
 * **Instancing is a Phase 1/4 requirement, not a Phase 6 one.** Criterion 7's
 * 120-draw-call budget at 500 agents is arithmetically unreachable without it,
 * so NFR-3 cannot be met by a V1 that defers it.
 */

export { CityScene } from './CityScene';
export { type SunState, skyColors, sunPosition } from './DayNight';
export { LANDMARK_NAMES, Landmarks } from './Landmarks';
export { buildRoadGeometry, ROAD_COLOR } from './roads';
export { SceneProbe } from './SceneProbe';
export { getTerrain, groundAt, Terrain } from './Terrain';
