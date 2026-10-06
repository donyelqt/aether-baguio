'use client';

import { create } from 'zustand';
import { TIME_SCALES, type TimeScale } from './ui';

/**
 * Operator-facing UI state.
 *
 * Presentation only, never world state. `timeScale` is a *request*: the client
 * asks, the engine decides how many ticks to run, and the accumulator that
 * converts a multiplier into a tick count stays in the engine because it is
 * deterministic engine state (ARCH §4.1, §8).
 *
 * Zustand rather than `useState` because this is read by three sibling
 * components (title, controls, readout) and threading it through props would
 * couple the HUD's layout to its data.
 */
export interface HudStore {
  paused: boolean;
  timeScale: TimeScale;
  /** Cycles through TIME_SCALES; used by the keyboard shortcut and the buttons. */
  cycleTimeScale: () => void;
  setTimeScale: (scale: TimeScale) => void;
  togglePause: () => void;
}

const NEXT: Record<TimeScale, TimeScale> = {
  1: 2,
  2: 5,
  5: 10,
  10: 1,
};

export const useHud = create<HudStore>((set) => ({
  paused: false,
  timeScale: 1,
  cycleTimeScale: () => set((s) => ({ timeScale: NEXT[s.timeScale] })),
  setTimeScale: (timeScale) => set({ timeScale }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));

export type { TimeScale };
export { TIME_SCALES };
