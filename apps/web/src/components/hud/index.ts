/**
 * HUD components — inspector, mode switcher, event injection.
 *
 * `Hud` currently renders a static world readout. The interactive pieces land
 * with the phases that own them: the entity inspector with FR-5.2 (Phase 1),
 * the mode switcher and event-injection panel with Phase 4 god mode.
 *
 * Kept as a barrel so HUD code has one import path as those land.
 */

export { Hud } from '../Hud';
