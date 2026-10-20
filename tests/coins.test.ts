import { describe, expect, it } from "vitest";
import {
  COIN_PICKUP_RADIUS,
  advanceCoins,
  collectCoins,
  coinsForWorld,
  createRowCoins,
} from "../src/sim/coins";
import { HOP_SECONDS, advance, createGame, dispatch, startRun } from "../src/sim/game";
import type { LogState, WorldRow } from "../src/sim/types";

function log(overrides: Partial<LogState> = {}): LogState {
  return {
    id: 4001,
    z: 4,
    x: 1,
    prevX: 1,
    dir: 1,
    speed: 1,
    length: 3,
    ...overrides,
  };
}

function grassRow(z: number, coins: WorldRow["coins"] = undefined): WorldRow {
  const row: WorldRow = { z, kind: "grass", variant: 0, props: [] };

  if (coins) {
    row.coins = coins;
  }

  return row;
}

describe("coin placement", () => {
  it("puts a static coin on a row column", () => {
    const coins = createRowCoins(4, [{ x: -2 }], []);

    expect(coins).toEqual([
      {
        id: 400,
        z: 4,
        x: -2,
        collected: false,
        logId: null,
        logOffset: 0,
      },
    ]);
  });

  it("attaches a river coin to its moving log", () => {
    const coins = createRowCoins(
      4,
      [{ x: 0, logIndex: 1, logOffset: -0.5 }],
      [log()],
    );

    expect(coins[0]).toMatchObject({
      x: 0.5,
      logId: 4001,
      logOffset: -0.5,
    });
  });

  it("builds every row's pickups in row order", () => {
    const rows = [
      grassRow(1, [{ x: 0 }]),
      grassRow(2),
      grassRow(3, [{ x: 1 }, { x: 1 }]),
    ];

    expect(coinsForWorld(rows, []).map((coin) => coin.id)).toEqual([
      100, 300, 301,
    ]);
  });

  it("keeps a log coin riding with its log", () => {
    const coins = createRowCoins(
      4,
      [{ x: 0, logIndex: 1, logOffset: 0.4 }],
      [log()],
    );
    const moved = log({ x: 2, prevX: 1 });

    advanceCoins(coins, [moved]);

    expect(coins[0]?.x).toBeCloseTo(2.4);
  });

  it("ignores a log that has left the live window", () => {
    const coins = createRowCoins(
      4,
      [{ x: 0, logIndex: 1, logOffset: 0.4 }],
      [log()],
    );

    advanceCoins(coins, []);

    expect(coins[0]?.x).toBe(1.4);
  });
});

describe("coin collection", () => {
  it("collects coins on the landing row within reach", () => {
    const coins = createRowCoins(3, [{ x: 0 }, { x: 0.5 }, { x: 2 }], []);

    expect(collectCoins(coins, 0, 3)).toBe(2);
    expect(coins.map((coin) => coin.collected)).toEqual([true, true, false]);
  });

  it("uses a forgiving radius but not the whole strip", () => {
    const coins = createRowCoins(3, [{ x: 0 }], []);

    expect(collectCoins(coins, COIN_PICKUP_RADIUS + 0.01, 3)).toBe(0);
    expect(collectCoins(coins, COIN_PICKUP_RADIUS, 3)).toBe(1);
  });

  it("only collects on the row the player lands on", () => {
    const coins = createRowCoins(3, [{ x: 0 }], []);

    expect(collectCoins(coins, 0, 2)).toBe(0);
    expect(collectCoins(coins, 0, 4)).toBe(0);
  });

  it("never counts the same pickup twice", () => {
    const coins = createRowCoins(3, [{ x: 0 }], []);

    expect(collectCoins(coins, 0, 3)).toBe(1);
    expect(collectCoins(coins, 0, 3)).toBe(0);
  });
});

describe("coins in a run", () => {
  it("banks the first trail coin when the player lands on it", () => {
    const state = createGame({ coins: 7 });
    expect(startRun(state)).toBe(true);

    const coin = state.coinDrops.find((drop) => drop.z === 1 && drop.x === 0);
    expect(coin).toBeDefined();

    dispatch(state, "forward");
    advance(state, HOP_SECONDS + 0.001);

    expect(state.player).toMatchObject({ x: 0, z: 1, hopping: false });
    expect(state.coins).toBe(8);
    expect(state.runCoins).toBe(1);
    expect(coin?.collected).toBe(true);
  });

  it("keeps the saved balance across a retry and clears the run count", () => {
    const state = createGame({ coins: 12 });
    expect(startRun(state)).toBe(true);

    dispatch(state, "forward");
    advance(state, HOP_SECONDS + 0.001);
    expect(state.runCoins).toBe(1);

    // Retrying rebuilds the world from the same seed. The banked balance is
    // progress, not run state, so it must survive.
    state.phase = "gameover";
    state.phaseTime = 1;
    expect(startRun(state)).toBe(true);

    expect(state.coins).toBe(13);
    expect(state.runCoins).toBe(0);
    expect(state.coinDrops.every((drop) => !drop.collected)).toBe(true);
  });
});
