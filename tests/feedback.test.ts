import { describe, expect, it } from "vitest";
import { Feedback } from "../src/app/feedback";
import { HOP_SECONDS, advance, createGame, dispatch, startRun } from "../src/sim/game";
import type { CarState, GameState } from "../src/sim/types";

function playingGame(): GameState {
  const state = createGame();
  expect(startRun(state)).toBe(true);
  return state;
}

function stillCar(overrides: Partial<CarState> = {}): CarState {
  return {
    id: 1,
    z: 0,
    x: 0,
    dir: 1,
    speed: 0,
    length: 1.5,
    variant: 0,
    ...overrides,
  };
}

function primed(state: GameState): Feedback {
  const feedback = new Feedback();
  expect(feedback.update(state, 0)).toEqual([]);
  return feedback;
}

describe("feedback cues", () => {
  it("does not replay a cue on the first observed frame", () => {
    const state = playingGame();
    const feedback = new Feedback();

    state.cars = [stillCar({ x: 2.5, dir: -1 })];

    expect(feedback.update(state, 0.016)).toEqual([]);
  });

  it("emits hop and land around the hop arc", () => {
    const state = playingGame();
    const feedback = primed(state);

    expect(dispatch(state, "forward")).toBe(true);
    expect(feedback.update(state, 0.016)).toContain("hop");

    advance(state, HOP_SECONDS + 0.001);

    expect(state.player.hopping).toBe(false);
    expect(feedback.update(state, 0.016)).toContain("land");
  });

  it("maps each death cause to its own cue", () => {
    const car = playingGame();
    const carFeedback = primed(car);
    car.cars = [stillCar()];
    advance(car, 1 / 60);
    expect(carFeedback.update(car, 0.016)).toContain("crash");

    const water = playingGame();
    const waterFeedback = primed(water);
    water.phase = "dying";
    water.deathCause = "drown";
    expect(waterFeedback.update(water, 0.016)).toContain("splash");

    const eagle = playingGame();
    const eagleFeedback = primed(eagle);
    eagle.phase = "dying";
    eagle.deathCause = "eagle";
    expect(eagleFeedback.update(eagle, 0.016)).toContain("eagle");
  });

  it("plays a polite horn once when a car approaches", () => {
    const state = playingGame();
    const feedback = primed(state);

    state.cars = [stillCar({ x: 2.6, dir: -1 })];

    expect(feedback.update(state, 0.016)).toContain("horn");
    expect(feedback.update(state, 0.016)).not.toContain("horn");
  });

  it("gives a near miss its own quieter cue", () => {
    const state = playingGame();
    const feedback = primed(state);

    state.cars = [stillCar({ x: 1.2, dir: -1 })];

    const cues = feedback.update(state, 0.016);

    expect(cues).toContain("nearMiss");
    expect(cues).not.toContain("horn");
  });
});
