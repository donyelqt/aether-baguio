import { describe, expect, it } from 'vitest';
import { TIME_SCALES, useHud } from './hud';
import type { TimeScale } from './ui';

describe('hud store', () => {
  it('starts unpaused at 1x', () => {
    const s = useHud.getState();
    expect(s.paused).toBe(false);
    expect(s.timeScale).toBe(1);
  });

  it('cycles through every scale and wraps', () => {
    useHud.setState({ timeScale: 1 });
    const seen: TimeScale[] = [];
    for (let i = 0; i < TIME_SCALES.length; i++) {
      useHud.getState().cycleTimeScale();
      seen.push(useHud.getState().timeScale);
    }
    expect(seen).toEqual([2, 5, 10, 1]);
  });

  it('toggles pause both ways', () => {
    useHud.setState({ paused: false });
    useHud.getState().togglePause();
    expect(useHud.getState().paused).toBe(true);
    useHud.getState().togglePause();
    expect(useHud.getState().paused).toBe(false);
  });

  it('sets a scale directly', () => {
    useHud.getState().setTimeScale(10);
    expect(useHud.getState().timeScale).toBe(10);
  });

  it('only accepts the documented scales', () => {
    // Guards the type against widening: PRD §4.1 specifies exactly these.
    expect([...TIME_SCALES]).toEqual([1, 2, 5, 10]);
  });
});
