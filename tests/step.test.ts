import { describe, expect, it } from "vitest";
import { FIXED_STEP, advanceFixed } from "../src/app/step";
import { createGame, dispatch, startRun } from "../src/sim/game";
import type { GameState } from "../src/sim/types";

function playingGame(): GameState {
  const state = createGame();
  expect(startRun(state)).toBe(true);
  return state;
}

describe("fixed stepping", () => {
  it("runs the simulation while unpaused", () => {
    const state = playingGame();
    dispatch(state, "forward");

    const result = advanceFixed(state, 0, FIXED_STEP * 2, false);

    expect(result.steps).toBe(2);
    expect(result.accumulator).toBeCloseTo(0);
    expect(state.player.hopT).toBeGreaterThan(0);
    expect(state.phaseTime).toBeCloseTo(FIXED_STEP * 2);
  });

  it("freezes the simulation and drops the accumulator while paused", () => {
    const state = playingGame();
    dispatch(state, "forward");
    const before = {
      hopT: state.player.hopT,
      phaseTime: state.phaseTime,
    };

    const result = advanceFixed(state, 5, 5, true);

    expect(result).toEqual({ accumulator: 0, steps: 0 });
    expect(state.player.hopT).toBe(before.hopT);
    expect(state.phaseTime).toBe(before.phaseTime);
    expect(state.player.hopping).toBe(true);
  });

  it("does not replay paused time when the player resumes", () => {
    const state = playingGame();
    dispatch(state, "forward");
    advanceFixed(state, 0, 3, true);

    const resumed = advanceFixed(state, 0, FIXED_STEP, false);

    expect(resumed.steps).toBe(1);
    expect(state.player.hopT).toBeLessThan(1);
    expect(state.phase).toBe("playing");
  });

  it("caps catch-up work at six steps", () => {
    const state = playingGame();
    const result = advanceFixed(state, 0, 1, false);

    expect(result.steps).toBe(6);
    expect(result.accumulator).toBeGreaterThan(0);
  });
});
