import { describe, expect, it } from "vitest";
import { HOP_SECONDS, advance, createGame, dispatch, startRun } from "../src/sim/game";
import {
  TRAIN_DEPTH,
  TRAIN_STRIP_HALF,
  advanceRails,
  createRailState,
  railHitsPlayer,
  trainCrossSeconds,
  warningLightsOn,
} from "../src/sim/rails";
import { syncCars, syncLogs, syncRails, syncWorld } from "../src/sim/world";
import type { GameState, RailSpec, RailState, WorldRow } from "../src/sim/types";

function spec(overrides: Partial<RailSpec> = {}): RailSpec {
  return {
    dir: 1,
    speed: 10,
    length: 16,
    warnSeconds: 1.2,
    cooldownSeconds: 2,
    offset: 0,
    ...overrides,
  };
}

function playingGame(seed = 31): GameState {
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
  state.idleTime = 0;

  if (syncWorld(state)) {
    syncCars(state);
    syncLogs(state);
    syncRails(state);
  }
}

/** Jump far enough for rail chunks to exist, then return the first one. */
function firstRail(state: GameState): { row: WorldRow; rail: RailState } {
  jumpTo(state, 40);
  const row = state.world.find((candidate) => candidate.kind === "rail");
  expect(row).toBeDefined();
  const rail = state.rails.find((candidate) => candidate.z === row?.z);
  expect(rail).toBeDefined();
  return { row: row!, rail: rail! };
}

function crossingRail(): RailState {
  const rail = createRailState(20, spec());
  rail.timer = rail.warnSeconds + rail.crossSeconds / 2;
  rail.phase = "crossing";
  rail.x = 0;
  rail.prevX = 0;
  return rail;
}

describe("rail timetable", () => {
  it("starts in warning when generated at offset zero", () => {
    const rail = createRailState(12, spec());
    expect(rail.phase).toBe("warning");
    expect(rail.timer).toBe(0);
  });

  it("warns for the full generated duration before crossing", () => {
    const rail = createRailState(12, spec({ warnSeconds: 1.2 }));
    advanceRails([rail], 1.2 - 0.001);
    expect(rail.phase).toBe("warning");

    advanceRails([rail], 0.002);
    expect(rail.phase).toBe("crossing");
  });

  it("crosses for the strip plus train length, then cools down", () => {
    const rail = createRailState(12, spec());
    const cross = trainCrossSeconds(10, 16);
    expect(rail.crossSeconds).toBeCloseTo(cross);

    advanceRails([rail], rail.warnSeconds + cross / 2);
    expect(rail.phase).toBe("crossing");
    expect(Math.abs(rail.x)).toBeLessThan(0.001);

    advanceRails([rail], cross / 2 + 0.001);
    expect(rail.phase).toBe("cooldown");
  });

  it("runs warning -> crossing -> cooldown forever", () => {
    const rail = createRailState(12, spec({ offset: 0.99 }));
    const seen = new Set<string>();

    for (let step = 0; step < 60 * 12; step += 1) {
      advanceRails([rail], 1 / 60);
      seen.add(rail.phase);
    }

    expect(seen).toEqual(new Set(["warning", "crossing", "cooldown"]));
  });

  it("puts the nose at the strip edge when a crossing starts", () => {
    const rail = createRailState(12, spec({ length: 16 }));
    advanceRails([rail], rail.warnSeconds + 0.0001);
    expect(rail.phase).toBe("crossing");
    expect(rail.x).toBeCloseTo(-TRAIN_STRIP_HALF - 8, 2);
  });

  it("alternates warning lamps so one side is always lit", () => {
    const rail = createRailState(12, spec());

    for (let time = 0; time < 2; time += 0.05) {
      const left = warningLightsOn(rail, 0, time);
      const right = warningLightsOn(rail, 1, time);
      expect(left || right).toBe(true);
      expect(left && right).toBe(false);
    }
  });
});

describe("swept train collision", () => {
  it("catches a player the train passed through this step", () => {
    const rail = crossingRail();
    rail.length = 2;
    rail.prevX = 2;
    rail.x = 6;

    expect(railHitsPlayer(rail, 3, rail.z)).toBe(true);
  });

  it("would miss a tunnelling fast train without the swept interval", () => {
    const rail = crossingRail();
    rail.length = 2;
    rail.prevX = 6;
    rail.x = 6;

    expect(railHitsPlayer(rail, 3, rail.z)).toBe(false);

    rail.prevX = 2;
    rail.x = 6;
    expect(railHitsPlayer(rail, 3, rail.z)).toBe(true);
  });

  it("ignores other rows and distant columns", () => {
    const rail = crossingRail();
    rail.length = 2;
    rail.prevX = 0;
    rail.x = 0;

    expect(railHitsPlayer(rail, 0, rail.z + TRAIN_DEPTH)).toBe(false);
    expect(railHitsPlayer(rail, 3, rail.z)).toBe(false);
  });

  it("never hits outside the crossing phase", () => {
    const rail = crossingRail();
    rail.prevX = -8;
    rail.x = 8;
    rail.phase = "warning";

    expect(railHitsPlayer(rail, 0, rail.z)).toBe(false);
  });
});

describe("trains in the run", () => {
  it("kills a player standing on the track during a crossing", () => {
    const state = playingGame();
    const { row, rail } = firstRail(state);

    state.cars = [];
    state.player.x = 0;
    state.player.z = row.z;
    state.player.fromX = 0;
    state.player.fromZ = row.z;
    state.player.toX = 0;
    state.player.toZ = row.z;
    state.player.hopping = false;
    state.score = row.z;

    rail.timer = rail.warnSeconds + rail.crossSeconds / 2;
    rail.phase = "crossing";
    rail.x = 0;
    rail.prevX = 0;

    advance(state, 1 / 60);

    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("train");
  });

  it("does not reach a player on the next row", () => {
    const state = playingGame();
    const { row, rail } = firstRail(state);

    state.cars = [];
    state.player.x = 0;
    state.player.z = row.z + 1;
    state.player.fromX = 0;
    state.player.fromZ = row.z + 1;
    state.player.toX = 0;
    state.player.toZ = row.z + 1;
    state.player.hopping = false;
    state.score = row.z + 1;

    rail.timer = rail.warnSeconds + rail.crossSeconds / 2;
    rail.phase = "crossing";
    rail.x = 0;
    rail.prevX = 0;

    advance(state, 1 / 60);

    expect(state.phase).toBe("playing");
  });

  it("kills a player who hops into a crossing", () => {
    const state = playingGame();
    const { row, rail } = firstRail(state);

    state.cars = [];
    state.player.x = 0;
    state.player.z = row.z - 1;
    state.player.fromX = 0;
    state.player.fromZ = row.z - 1;
    state.player.toX = 0;
    state.player.toZ = row.z - 1;
    state.player.hopping = false;
    state.score = row.z + 1;

    rail.timer = rail.warnSeconds + rail.crossSeconds / 2;
    rail.phase = "crossing";
    rail.x = 0;
    rail.prevX = 0;
    rail.length = 20;

    expect(dispatch(state, "forward")).toBe(true);
    advance(state, HOP_SECONDS / 2);

    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("train");
  });
});
