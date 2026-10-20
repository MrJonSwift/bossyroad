import { describe, expect, it } from "vitest";
import {
  DROWN_SECONDS,
  HOP_SECONDS,
  advance,
  createGame,
  dispatch,
  startRun,
} from "../src/sim/game";
import {
  LOG_CHAIN_WIDTH,
  advanceLogs,
  createRiverLogs,
  hasLogCover,
  logAt,
  wrappedLogDelta,
} from "../src/sim/logs";
import type { GameState, LogState, RiverSpec, WorldRow } from "../src/sim/types";

function playingGame(seed = 7): GameState {
  const state = createGame({ seed });
  expect(startRun(state)).toBe(true);
  return state;
}

function firstRiver(state: GameState): WorldRow {
  const row = state.world.find((candidate) => candidate.kind === "river");
  expect(row).toBeDefined();
  return row!;
}

function settle(state: GameState): void {
  advance(state, HOP_SECONDS + 0.001);
}

function clearTraffic(state: GameState): void {
  state.cars = [];
  state.rails = [];
}

function spec(overrides: Partial<RiverSpec> = {}): RiverSpec {
  return {
    dir: 1,
    speed: 1.2,
    offset: 0,
    lengths: [4, 4, 4, 4, 2],
    ...overrides,
  };
}

/** Put the player just before a river row and clear unrelated hazards. */
function standBeforeRiver(state: GameState, river: WorldRow, x = 0): void {
  state.player.x = x;
  state.player.z = river.z - 1;
  state.player.fromX = x;
  state.player.fromZ = river.z - 1;
  state.player.toX = x;
  state.player.toZ = river.z - 1;
  state.player.hopping = false;
  state.player.logId = null;
  state.player.carrierLogId = null;
  state.player.offStrip = false;
  clearTraffic(state);
}

function attachToRiver(state: GameState, river: WorldRow, x = 0): LogState {
  standBeforeRiver(state, river, x);
  expect(dispatch(state, "forward")).toBe(true);
  settle(state);

  expect(state.phase, `attach at river z=${river.z}`).toBe("playing");
  expect(state.player.z).toBe(river.z);
  expect(state.player.logId).not.toBeNull();

  const log = state.logs.find((candidate) => candidate.id === state.player.logId);
  expect(log).toBeDefined();
  return log!;
}

describe("moving log chains", () => {
  it("is deterministic for a row and spec", () => {
    expect(createRiverLogs(12, spec())).toEqual(createRiverLogs(12, spec()));
  });

  it("gives every log a stable unique id and a row", () => {
    const logs = createRiverLogs(9, spec());
    expect(new Set(logs.map((log) => log.id)).size).toBe(logs.length);

    for (const log of logs) {
      expect(log.z).toBe(9);
      expect(log.prevX).toBe(log.x);
      expect(log.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("tiles the whole chain width including the seam", () => {
    const logs = createRiverLogs(4, spec({ offset: 0.37, lengths: [3, 1, 4, 2, 4, 4] }));
    const segments = logs
      .map((log) => ({ left: log.x - log.length / 2, right: log.x + log.length / 2 }))
      .sort((a, b) => a.left - b.left);

    expect(logs.reduce((sum, log) => sum + log.length, 0)).toBe(LOG_CHAIN_WIDTH);

    for (let i = 1; i < segments.length; i += 1) {
      expect((segments[i]?.left ?? 0) - (segments[i - 1]?.right ?? 0)).toBeCloseTo(
        0,
        9,
      );
    }

    const seam =
      (segments[0]?.left ?? 0) + LOG_CHAIN_WIDTH - (segments.at(-1)?.right ?? 0);
    expect(seam).toBeCloseTo(0, 9);
  });

  it("moves, wraps and keeps covering the strip", () => {
    const logs = createRiverLogs(3, spec({ dir: -1, speed: 2.2, offset: 0.8 }));

    for (let step = 0; step < 600; step += 1) {
      advanceLogs(logs, 1 / 60);
      expect(logs.every((log) => log.x >= -9 && log.x <= 9)).toBe(true);

      for (let x = -4; x <= 4; x += 1) {
        expect(hasLogCover(logs, 3, x), `x=${x} step=${step}`).toBe(true);
      }
    }
  });

  it("reports the shortest delta across the wrap seam", () => {
    expect(wrappedLogDelta(8.9, -8.9)).toBeCloseTo(0.2);
    expect(wrappedLogDelta(-8.9, 8.9)).toBeCloseTo(-0.2);
    expect(wrappedLogDelta(1, 0.9)).toBeCloseTo(-0.1);
  });
});

describe("log riding", () => {
  it("attaches the player when they land on a log", () => {
    const state = playingGame();
    const river = firstRiver(state);
    const log = attachToRiver(state, river, 0);

    expect(logAt(state.logs, river.z, state.player.x)).toBe(log);
  });

  it("detaches on a grass landing", () => {
    const state = playingGame();
    const river = firstRiver(state);
    attachToRiver(state, river, 0);

    const next = state.world.find((row) => row.z === river.z + 1);
    expect(next?.kind).toBe("grass");

    expect(dispatch(state, "forward")).toBe(true);
    settle(state);

    expect(state.player.z).toBe(river.z + 1);
    expect(state.player.logId).toBeNull();
  });

  it("carries a standing rider with the current", () => {
    const state = playingGame();
    const river = firstRiver(state);
    const log = attachToRiver(state, river, 0);
    const beforeX = state.player.x;
    const beforeLogX = log.x;

    expect(state.phase).toBe("playing");
    advance(state, 1);

    expect(state.phase).toBe("playing");
    expect(state.player.logId).toBe(log.id);
    expect(state.player.x - beforeX).toBeCloseTo(wrappedLogDelta(beforeLogX, log.x), 6);
  });

  it("carries the current's motion through the whole hop", () => {
    const state = playingGame();
    const river = firstRiver(state);
    const log = attachToRiver(state, river, 0);
    const logBefore = log.x;
    const playerBefore = state.player.x;

    expect(dispatch(state, "forward")).toBe(true);
    advance(state, HOP_SECONDS / 2);

    expect(state.player.hopping).toBe(true);
    expect(state.player.x - playerBefore).toBeCloseTo(
      wrappedLogDelta(logBefore, log.x),
      6,
    );

    settle(state);
    expect(state.phase).toBe("playing");
  });

  it("drowns after a short splash when landing in water", () => {
    const state = playingGame();
    const river = firstRiver(state);
    standBeforeRiver(state, river, 4);

    // Leave the river's row with a single log far from the landing column.
    const lonely: LogState = {
      id: river.z * 1000,
      z: river.z,
      x: -4,
      prevX: -4,
      dir: 1,
      speed: 1,
      length: 1,
    };
    state.logs = state.logs.filter((log) => log.z !== river.z);
    state.logs.push(lonely);

    expect(dispatch(state, "forward")).toBe(true);
    settle(state);

    expect(state.player.z).toBe(river.z);
    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("drown");

    advance(state, DROWN_SECONDS - 0.01);
    expect(state.phase).toBe("dying");

    advance(state, 0.02);
    expect(state.phase).toBe("gameover");
  });

  it("drowns when a log pushes the rider outside the strip", () => {
    const state = playingGame();
    const river = firstRiver(state);
    attachToRiver(state, river, 0);

    const log: LogState = {
      id: 9001,
      z: river.z,
      x: 3.6,
      prevX: 3.6,
      dir: 1,
      speed: 2.2,
      length: 1,
    };
    state.logs = state.logs.filter((candidate) => candidate.z !== river.z);
    state.logs.push(log);
    state.player.x = 3.9;
    state.player.logId = log.id;
    state.player.carrierLogId = null;
    state.score = river.z;

    advance(state, 0.3);

    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("drown");
    expect(state.player.x).toBe(4);
  });

  it("keeps the nine-column bound while hopping off a log", () => {
    const state = playingGame();
    const river = firstRiver(state);
    attachToRiver(state, river, 4);

    const log: LogState = {
      id: 9002,
      z: river.z,
      x: 4.2,
      prevX: 4.2,
      dir: 1,
      speed: 2.2,
      length: 1,
    };
    state.logs = state.logs.filter((candidate) => candidate.z !== river.z);
    state.logs.push(log);
    state.player.x = 4;
    state.player.logId = log.id;
    state.score = river.z;

    expect(dispatch(state, "right")).toBe(true);
    advance(state, HOP_SECONDS / 2);

    expect(state.player.toX).toBe(4);
    expect(state.player.offStrip).toBe(true);
  });
});
