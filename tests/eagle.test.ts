import { describe, expect, it } from "vitest";
import { eagleGraceAt } from "../src/sim/difficulty";
import {
  DEATH_SECONDS,
  EAGLE_BACKTRACK_ROWS,
  HOP_SECONDS,
  advance,
  createGame,
  dispatch,
  startRun,
} from "../src/sim/game";
import { syncCars, syncLogs, syncRails, syncWorld } from "../src/sim/world";
import type { GameState } from "../src/sim/types";

function playingGame(seed = 21): GameState {
  const state = createGame({ seed });
  expect(startRun(state)).toBe(true);
  return state;
}

function jumpTo(state: GameState, z: number): void {
  state.player.x = 0;
  state.player.z = z;
  state.player.fromX = 0;
  state.player.fromZ = z;
  state.player.toX = 0;
  state.player.toZ = z;
  state.player.hopping = false;
  state.player.logId = null;
  state.player.carrierLogId = null;
  state.player.offStrip = false;
  state.score = z;
  state.idleTime = 0;

  if (syncWorld(state)) {
    syncCars(state);
    syncLogs(state);
    syncRails(state);
  }
}

/** Teleport to a grass row near a depth, then clear unrelated hazards. */
function standOnGrassNear(state: GameState, depth: number): number {
  jumpTo(state, depth);
  const grass = state.world.find(
    (row) => row.kind === "grass" && row.z >= depth - 10,
  );
  expect(grass).toBeDefined();
  const z = grass?.z ?? depth;

  jumpTo(state, z);
  state.score = z;
  state.cars = [];
  state.rails = [];
  return z;
}

describe("eagle triggers", () => {
  it("swoops after the idle grace", () => {
    const state = playingGame();
    const grace = eagleGraceAt(0);

    advance(state, grace - 0.1);
    expect(state.phase).toBe("playing");

    advance(state, 0.2);
    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");
    expect(state.player.hopping).toBe(false);

    advance(state, DEATH_SECONDS);
    expect(state.phase).toBe("gameover");
  });

  it("uses the shorter grace at the difficulty cap", () => {
    const state = playingGame();
    standOnGrassNear(state, 140);

    advance(state, 3.9);
    expect(state.phase).toBe("playing");

    advance(state, 0.2);
    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");
  });

  it("swoops when the player backtracks three rows", () => {
    const state = playingGame();
    const z = standOnGrassNear(state, 60);
    const from = z - EAGLE_BACKTRACK_ROWS;

    jumpTo(state, from);
    state.score = z;
    state.cars = [];
    state.rails = [];

    advance(state, 1 / 60);

    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");
  });

  it("forgives two rows of backtracking", () => {
    const state = playingGame();
    const z = standOnGrassNear(state, 60);

    jumpTo(state, z - 2);
    state.score = z;
    state.cars = [];
    state.rails = [];

    advance(state, 1 / 60);

    expect(state.phase).toBe("playing");
  });

  it("never swoops while the player is in the air", () => {
    const state = playingGame();

    expect(dispatch(state, "forward")).toBe(true);
    state.idleTime = eagleGraceAt(0) + 10;
    advance(state, HOP_SECONDS / 2);

    expect(state.player.hopping).toBe(true);
    expect(state.phase).toBe("playing");
  });

  it("resets the idle timer on a successful hop", () => {
    const state = playingGame();

    advance(state, 4);
    expect(state.phase).toBe("playing");

    expect(dispatch(state, "forward")).toBe(true);
    advance(state, HOP_SECONDS + 0.001);
    advance(state, 1);

    expect(state.phase).toBe("playing");
    expect(state.idleTime).toBeLessThan(2);
  });

  it("locks input during the eagle animation", () => {
    const state = playingGame();
    state.idleTime = eagleGraceAt(0) + 1;
    advance(state, 1 / 60);

    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");
    expect(dispatch(state, "forward")).toBe(false);
    expect(state.player.hopping).toBe(false);
  });
});
