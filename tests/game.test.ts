import { describe, expect, it } from "vitest";
import {
  DEATH_SECONDS,
  HOP_SECONDS,
  RESTART_LOCK_SECONDS,
  advance,
  createGame,
  dispatch,
  playerPose,
  startRun,
} from "../src/sim/game";
import { carsForWorld } from "../src/sim/world";
import type { CarState, GameState } from "../src/sim/types";

function playingGame(): GameState {
  const state = createGame();
  expect(startRun(state)).toBe(true);
  return state;
}

function settle(state: GameState): void {
  advance(state, HOP_SECONDS + 0.001);
}

function stillCar(overrides: Partial<CarState> = {}): CarState {
  return {
    id: 99,
    z: 0,
    x: 0,
    dir: 1,
    speed: 0,
    length: 1.5,
    variant: 0,
    ...overrides,
  };
}

describe("run phases", () => {
  it("opens on the title screen and ignores movement until a run starts", () => {
    const state = createGame();

    expect(state.phase).toBe("title");
    expect(dispatch(state, "forward")).toBe(false);
    expect(state.player.hopping).toBe(false);

    advance(state, 1);
    expect(state.player).toMatchObject({ x: 0, z: 0, hopping: false });
  });

  it("keeps the road alive behind the title card", () => {
    const state = createGame();
    const first = state.cars[0];

    expect(first).toBeDefined();
    const before = first?.x ?? 0;
    const expected = (first?.dir ?? 1) * (first?.speed ?? 0) * 0.5;

    advance(state, 0.5);

    expect((first?.x ?? 0) - before).toBeCloseTo(expected);
    expect(state.phase).toBe("title");
  });

  it("starts a run from the title with a fresh player and traffic", () => {
    const state = createGame();
    const ids = state.cars.map((car) => car.id);

    expect(startRun(state)).toBe(true);
    expect(state.phase).toBe("playing");
    expect(state.phaseTime).toBe(0);
    expect(state.score).toBe(0);
    expect(state.player).toMatchObject({ x: 0, z: 0, hopping: false });
    expect(state.cars.map((car) => car.id)).toEqual(ids);
    expect(state.cars).toEqual(carsForWorld(state.world));
  });

  it("ignores a second start while already playing", () => {
    const state = playingGame();
    dispatch(state, "forward");
    advance(state, HOP_SECONDS / 2);

    expect(startRun(state)).toBe(false);
    expect(state.phase).toBe("playing");
  });
});

describe("game simulation", () => {
  it("starts on the centre tile with no score", () => {
    const state = createGame();

    expect(state.player).toMatchObject({ x: 0, z: 0, hopping: false, facing: "forward" });
    expect(state.score).toBe(0);
    expect(state.best).toBe(0);
  });

  it("hops forward one row and scores it", () => {
    const state = playingGame();

    expect(dispatch(state, "forward")).toBe(true);
    expect(state.player.hopping).toBe(true);

    settle(state);

    expect(state.player).toMatchObject({ x: 0, z: 1, hopping: false });
    expect(state.score).toBe(1);
    expect(state.best).toBe(1);
  });

  it("moves through the air rather than teleporting", () => {
    const state = playingGame();
    dispatch(state, "forward");

    advance(state, HOP_SECONDS / 2);
    const pose = playerPose(state);

    expect(pose.hopping).toBe(true);
    expect(pose.z).toBeGreaterThan(0);
    expect(pose.z).toBeLessThan(1);
    expect(pose.y).toBeGreaterThan(0.4);
  });

  it("buffers exactly one move while airborne", () => {
    const state = playingGame();
    dispatch(state, "forward");
    advance(state, HOP_SECONDS / 2);

    expect(dispatch(state, "right")).toBe(false);
    expect(state.player.queued).toBe("right");

    advance(state, HOP_SECONDS);
    expect(state.player).toMatchObject({ x: 0, z: 1, hopping: true });

    settle(state);
    expect(state.player).toMatchObject({ x: 1, z: 1, hopping: false });
  });

  it("keeps the player inside the nine-tile play strip", () => {
    const state = playingGame();

    for (let i = 0; i < 8; i += 1) {
      dispatch(state, "left");
      settle(state);
    }

    expect(state.player.x).toBe(-4);

    for (let i = 0; i < 8; i += 1) {
      dispatch(state, "right");
      settle(state);
    }

    expect(state.player.x).toBe(4);
  });

  it("calls the eagle before the player can walk off the back", () => {
    const state = playingGame();

    for (let i = 0; i < 10 && state.phase === "playing"; i += 1) {
      dispatch(state, "back");
      settle(state);
    }

    // Backtracking three rows behind the furthest row ends the run at -3;
    // the -4 clamp still exists as a hard bound for any other route.
    expect(state.player.z).toBe(-3);
    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");
    expect(state.score).toBe(0);
  });

  it("keeps score based on the furthest row, even after moving back", () => {
    const state = playingGame();

    dispatch(state, "forward");
    settle(state);
    dispatch(state, "forward");
    settle(state);
    dispatch(state, "back");
    settle(state);

    expect(state.player.z).toBe(1);
    expect(state.score).toBe(2);
  });

  it("turns to face the direction of travel immediately", () => {
    const state = playingGame();

    dispatch(state, "left");
    expect(state.player.facing).toBe("left");

    settle(state);
    expect(playerPose(state).facing).toBe("left");
  });

  it("does nothing while standing still", () => {
    const state = playingGame();
    advance(state, 1);

    expect(state.player).toMatchObject({ x: 0, z: 0, hopping: false });
  });
});

describe("car collision", () => {
  it("ends the run when a car reaches the player from any side", () => {
    const sides: Array<Partial<CarState>> = [
      { x: -0.9, z: 0 },
      { x: 0.9, z: 0 },
      { x: 0, z: 0.5 },
      { x: 0, z: -0.5 },
    ];

    for (const side of sides) {
      const state = playingGame();
      state.cars = [stillCar(side)];

      advance(state, 1 / 60);

      expect(state.phase, `car at ${JSON.stringify(side)}`).toBe("dying");
    }
  });

  it("lets a near miss pass", () => {
    const misses: Array<Partial<CarState>> = [
      { x: -1.0, z: 0 },
      { x: 1.0, z: 0 },
      { x: 0, z: 0.6 },
      { x: 0, z: -0.6 },
    ];

    for (const miss of misses) {
      const state = playingGame();
      state.cars = [stillCar(miss)];

      advance(state, 1 / 60);

      expect(state.phase, `car at ${JSON.stringify(miss)}`).toBe("playing");
    }
  });

  it("catches a player hopping into an occupied lane", () => {
    const state = playingGame();
    state.player.x = 0;
    state.player.z = 2;
    state.player.fromX = 0;
    state.player.fromZ = 2;
    state.cars = [stillCar({ z: 3, x: 0 })];

    dispatch(state, "forward");
    advance(state, HOP_SECONDS / 2);

    expect(state.phase).toBe("dying");
  });

  it("records the run's best and holds the death beat before game over", () => {
    const state = playingGame();
    state.score = 7;
    state.cars = [stillCar()];

    advance(state, 1 / 60);
    expect(state.phase).toBe("dying");
    expect(state.best).toBe(7);

    advance(state, DEATH_SECONDS / 2);
    expect(state.phase).toBe("dying");

    advance(state, DEATH_SECONDS);
    expect(state.phase).toBe("gameover");
    expect(state.best).toBe(7);
  });

  it("ignores input while dying and on the game-over card", () => {
    const state = playingGame();
    state.cars = [stillCar()];

    advance(state, 1 / 60);
    expect(dispatch(state, "forward")).toBe(false);

    advance(state, DEATH_SECONDS);
    expect(state.phase).toBe("gameover");
    expect(dispatch(state, "left")).toBe(false);
    expect(state.player.hopping).toBe(false);
  });
});

describe("retry", () => {
  function reachGameOver(): GameState {
    const state = playingGame();
    dispatch(state, "forward");
    settle(state);
    dispatch(state, "forward");
    settle(state);

    state.cars = [stillCar({ z: state.player.z })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);

    expect(state.phase).toBe("gameover");
    return state;
  }

  it("locks retry for a short beat so the result is readable", () => {
    const state = reachGameOver();

    expect(startRun(state)).toBe(false);
    advance(state, RESTART_LOCK_SECONDS);

    expect(startRun(state)).toBe(true);
    expect(state.phase).toBe("playing");
    expect(state.score).toBe(0);
    expect(state.player).toMatchObject({ x: 0, z: 0, hopping: false });
    expect(state.cars).toEqual(carsForWorld(state.world));
  });

  it("keeps the best score across a retry", () => {
    const state = reachGameOver();

    expect(state.best).toBe(2);
    advance(state, RESTART_LOCK_SECONDS);
    expect(startRun(state)).toBe(true);

    expect(state.best).toBe(2);
    expect(state.score).toBe(0);
  });

  it("is playable again immediately after the retry starts", () => {
    const state = reachGameOver();
    advance(state, RESTART_LOCK_SECONDS);
    startRun(state);

    expect(dispatch(state, "forward")).toBe(true);
    settle(state);

    expect(state.score).toBe(1);
  });
});
