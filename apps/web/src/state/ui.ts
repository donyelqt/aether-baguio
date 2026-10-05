/**
 * Client-side UI state shape — never world state.
 *
 * The distinction is load-bearing. Authoritative world state belongs to the
 * engine and arrives over the wire; anything in this directory is presentation:
 * which panel is open, what the operator selected, whether the inspector is
 * showing. Writing world state into a client store would fork the simulation per
 * viewer and break the determinism contract (ARCH §8).
 *
 * Types only, deliberately. The Zustand store lands with its first consumer —
 * shipping a store nothing reads would be dead runtime code, and a placeholder
 * that cannot be typechecked against real usage is worth very little.
 */

/** Which of the three PRD §4 modes the session is in. */
export type ViewMode = 'observer' | 'player' | 'god';

/** Time-scale multipliers the engine accepts (PRD §4.1). */
export const TIME_SCALES = [1, 2, 5, 10] as const;

export type TimeScale = (typeof TIME_SCALES)[number];

/**
 * UI state. `timeScale` is a *request*, not a world mutation: the client asks,
 * and the server decides how many ticks to run. The accumulator that turns a
 * multiplier into a tick count lives in the engine, because it is part of
 * deterministic engine state (ARCH §4.1).
 */
export interface UiState {
  mode: ViewMode;
  paused: boolean;
  timeScale: TimeScale;
  /** Entity id under inspection, or null when the inspector is closed. */
  selectedId: number | null;
}
