import { describe, expect, it } from "vitest";
import { createGame, startRun } from "../src/sim/game";
import {
  WINDOW_AHEAD,
  WINDOW_BEHIND,
  WORLD_START_Z,
  createWorld,
  syncCars,
  syncWorld,
} from "../src/sim/world";
import type { GameState } from "../src/sim/types";

function jumpTo(state: GameState, z: number): void {
  state.player.z = z;
  state.player.fromZ = z;
  state.player.toZ = z;

  if (syncWorld(state)) {
    syncCars(state);
  }
}

function playingGame(seed = 99): GameState {
  const state = createGame({ seed });
  expect(startRun(state)).toBe(true);
  return state;
}

describe("initial world window", () => {
  const world = createWorld(5);

  it("covers the camera behind the start and the visible rows ahead", () => {
    expect(world.rows[0]?.z).toBe(WORLD_START_Z);
    expect(world.rows.at(-1)?.z).toBeGreaterThanOrEqual(WINDOW_AHEAD);
  });

  it("has no duplicate depths", () => {
    const depths = world.rows.map((row) => row.z);
    expect(new Set(depths).size).toBe(depths.length);
  });

  it("keeps the camera's back edge covered", () => {
    // The camera sits 13.2 behind the player. Any window longer than that can
    // recycle without the edge entering the view.
    expect(WINDOW_BEHIND).toBeGreaterThan(14);
  });
});

describe("row recycling", () => {
  it("extends ahead and drops rows far behind the player", () => {
    const state = playingGame();
    jumpTo(state, 400);

    const first = state.world[0]?.z ?? 0;
    const last = state.world.at(-1)?.z ?? 0;

    expect(first).toBeGreaterThanOrEqual(400 - WINDOW_BEHIND);
    expect(last).toBeGreaterThanOrEqual(400 + WINDOW_AHEAD);
    expect(state.maxZ).toBe(400 + WINDOW_AHEAD);
  });

  it("keeps the window bounded over a very long run", () => {
    const state = playingGame();

    for (let z = 0; z <= 3000; z += 17) {
      jumpTo(state, z);

      const maxLength = WINDOW_BEHIND + WINDOW_AHEAD + 12;
      expect(state.world.length).toBeLessThanOrEqual(maxLength);
      expect(new Set(state.world.map((row) => row.z)).size).toBe(state.world.length);
    }
  });

  it("never leaves cars on recycled road rows", () => {
    const state = playingGame();
    jumpTo(state, 250);

    const roadRows = new Set(
      state.world.filter((row) => row.lane).map((row) => row.z),
    );

    expect(state.cars.length).toBeGreaterThan(0);
    for (const car of state.cars) {
      expect(roadRows.has(car.z), `orphan car at z=${car.z}`).toBe(true);
    }

    for (const road of roadRows) {
      expect(state.cars.some((car) => car.z === road)).toBe(true);
    }
  });

  it("keeps generating the same window for the same seed and movement", () => {
    const play = (): GameState => {
      const state = playingGame(2024);
      for (const z of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377]) {
        jumpTo(state, z);
      }
      return state;
    };

    const first = play();
    const second = play();

    expect(first.player.z).toBe(377);
    expect(first.world).toEqual(second.world);
    expect(first.generator.nextZ).toBe(second.generator.nextZ);
    expect(first.maxZ).toBe(second.maxZ);
  });

  it("recycles only behind the camera, never inside the view", () => {
    const state = playingGame();
    jumpTo(state, 120);

    expect(state.world[0]?.z).toBeGreaterThanOrEqual(120 - WINDOW_BEHIND);
    expect(WINDOW_BEHIND).toBeGreaterThan(13.2);
  });
});
