import { describe, expect, it } from "vitest";
import { difficultyForScore, eagleGraceAt } from "../src/sim/difficulty";
import {
  DEATH_SECONDS,
  HOP_SECONDS,
  RESTART_LOCK_SECONDS,
  advance,
  createGame,
  dispatch,
  retryCheckpoint,
  startRun,
} from "../src/sim/game";
import { syncCars, syncCoins, syncLogs, syncRails, syncWorld } from "../src/sim/world";
import { ZONE_ROWS } from "../src/sim/zones";
import type {
  CarState,
  GameState,
  WorldRow,
} from "../src/sim/types";

const stillCar = (overrides: Partial<CarState> = {}): CarState => ({
  id: 99,
  z: 0,
  x: 0,
  dir: 1,
  speed: 0,
  length: 1.5,
  variant: 0,
  ...overrides,
});

function playingGame(seed = 1): GameState {
  const state = createGame({ seed });
  expect(startRun(state)).toBe(true);
  return state;
}

function settle(state: GameState): void {
  advance(state, HOP_SECONDS + 0.001);
}

/** A fresh, hazard-free grass row. Never mutates a shared generated row. */
function plainRow(z: number): WorldRow {
  return { z, kind: "grass", variant: Math.abs(z) % 2, props: [] };
}

function flatten(state: GameState, fromZ: number, untilZ: number): void {
  state.world = state.world.map((row) =>
    row.z >= fromZ && row.z <= untilZ ? plainRow(row.z) : row,
  );
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
  state.player.queued = null;
  state.score = Math.max(state.score, z);
  state.idleTime = 0;

  if (syncWorld(state)) {
    syncCars(state);
    syncLogs(state);
    syncRails(state);
    syncCoins(state);
  }
}

/** Clear hazards so scripted hops cannot die for layout reasons. */
function clearHazards(state: GameState): void {
  state.cars = [];
  state.rails = [];
  state.logs = [];
}

/**
 * Land the player on the first row of `zone` so the simulation captures the
 * checkpoint. The approach and the boundary row are replaced with safe grass
 * rows so the capture only tests the zone rule, not one seed's layout. The
 * decorate hook runs before the capture, so fixture rows and pickups can be
 * prepared like a genuine layout.
 */
function enterZone(
  state: GameState,
  zone: number,
  decorate?: (state: GameState) => void,
): number {
  const z = zone * ZONE_ROWS;
  jumpTo(state, z - 1);
  flatten(state, z - 1, z);
  if (decorate) {
    decorate(state);
  }
  // The flattened rows no longer carry their generated pickups, so drop any
  // stale drops on them and materialize the fixtures like the app loop would.
  state.coinDrops = state.coinDrops.filter(
    (coin) => coin.z < z - 1 || coin.z > z,
  );
  syncCoins(state);
  clearHazards(state);

  expect(dispatch(state, "forward")).toBe(true);
  settle(state);
  expect(state.player.z, `zone ${zone} entry`).toBe(z);
  return z;
}

/**
 * Serialise a state, keeping every looping RNG stream exposed as plain data so
 * two timelines can be compared bit for bit.
 */
function trace(state: GameState): string {
  return JSON.stringify(state, (_key, value) =>
    typeof value === "function" ? { rngState: (value as { t?: number }).t } : value,
  );
}

describe("checkpoint snapshots", () => {
  it("captures the zone-entry state when the player lands on a boundary row", () => {
    const state = playingGame();
    enterZone(state, 8);

    const checkpoint = state.checkpoint;
    expect(checkpoint).not.toBeNull();
    expect(checkpoint?.zone).toBe(8);
    expect(checkpoint?.player).toMatchObject({ x: 0, z: 80, hopping: false });
    expect(checkpoint?.score).toBe(80);
    expect(checkpoint?.coins).toBe(state.coins);
    expect(checkpoint?.generator.nextZ).toBe(state.generator.nextZ);
    expect(checkpoint?.world.length).toBe(state.world.length);
    expect(checkpoint?.generator.nextZ).toBeGreaterThan(0);
  });

  it("does not capture inside the opening stretch", () => {
    const state = playingGame();
    flatten(state, 6, 9);
    clearHazards(state);

    for (let i = 0; i < 9; i += 1) {
      expect(dispatch(state, "forward")).toBe(true);
      settle(state);
    }

    expect(state.player.z).toBe(9);
    expect(state.checkpoint).toBeNull();

    // Row 10 opens zone 1, so it is itself a checkpoint row.
    expect(dispatch(state, "forward")).toBe(true);
    settle(state);
    expect(state.player.z).toBe(10);
    expect(state.checkpoint?.player.z).toBe(10);
    expect(state.checkpoint?.zone).toBe(1);
  });

  it("keeps only the latest zone snapshot", () => {
    const state = playingGame();
    enterZone(state, 8);
    expect(state.checkpoint?.zone).toBe(8);

    // Ten safe rows ahead: wandering through this zone keeps the zone-8
    // snapshot until the player touches the zone-9 boundary row.
    flatten(state, 80, 90);
    clearHazards(state);
    const entryZ = state.player.z;

    for (let i = 0; i < 9; i += 1) {
      expect(dispatch(state, "forward")).toBe(true);
      settle(state);
      expect(state.checkpoint?.player.z, `hop ${i}`).toBe(entryZ);
      clearHazards(state);
    }

    // Landing on row 90 opens zone 9 and replaces the snapshot.
    expect(dispatch(state, "forward")).toBe(true);
    settle(state);
    expect(state.player.z).toBe(90);
    expect(state.checkpoint?.player.z).toBe(90);
    expect(state.checkpoint?.zone).toBe(9);
  });

  it("restores the snapshot exactly on a zone retry", () => {
    const state = playingGame();
    enterZone(state, 8);

    const entry = {
      coins: state.coins,
      runCoins: state.runCoins,
      idleTime: state.idleTime,
      score: state.score,
      phaseTime: state.phaseTime,
      world: state.world,
      cars: state.cars,
    };

    // Advance two rows into the zone and die there.
    flatten(state, 81, 82);
    clearHazards(state);
    dispatch(state, "forward");
    settle(state);
    dispatch(state, "forward");
    settle(state);
    expect(state.player.z).toBe(82);

    state.cars = [stillCar({ z: 82, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    expect(state.phase).toBe("gameover");

    // The checkpoint card's lock matches the game-over card's.
    expect(retryCheckpoint(state)).toBe(false);
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);

    expect(state.phase).toBe("playing");
    expect(state.deathCause).toBeNull();
    expect(state.player).toMatchObject({ x: 0, z: 80, hopping: false });
    expect(state.score).toBe(entry.score);
    expect(state.coins).toBe(entry.coins);
    expect(state.runCoins).toBe(entry.runCoins);
    expect(state.idleTime).toBe(entry.idleTime);
    expect(state.cars).toEqual(entry.cars);
    expect(state.world.map((row) => row.z)).toEqual(entry.world.map((row) => row.z));

    // The same snapshot can restore a second time after dying again.
    state.cars = [stillCar({ z: 80, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);
    expect(state.phase).toBe("playing");
    expect(state.player.z).toBe(80);
  });

  it("refuses a zone retry before the shot is worth taking", () => {
    const state = playingGame();
    enterZone(state, 8);

    state.cars = [stillCar({ z: 80, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    expect(state.phase).toBe("gameover");

    expect(retryCheckpoint(state)).toBe(false);
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);
    expect(state.player.z).toBe(80);
  });

  it("a full retry from the game-over card clears the checkpoint", () => {
    const state = playingGame();
    enterZone(state, 8);

    state.cars = [stillCar({ z: 80, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    advance(state, RESTART_LOCK_SECONDS);

    expect(startRun(state)).toBe(true);
    expect(state.checkpoint).toBeNull();
    expect(state.player.z).toBe(0);
  });

  it("re-earned coins cannot double-count across a zone retry", () => {
    const state = playingGame();

    // A coin on the first row inside the zone, set before the capture so the
    // checkpoint carries the row spec the way a genuine layout would.
    const z0 = enterZone(state, 8, (s) => {
      s.world = s.world.map((row) =>
        row.z === 81 ? { ...plainRow(81), coins: [{ x: 0 }] } : row,
      );
    });
    expect(z0).toBe(80);
    const entryCoins = state.coins;
    const entryRunCoins = state.runCoins;

    dispatch(state, "forward");
    settle(state);
    expect(state.player.z).toBe(81);
    expect(state.coins).toBe(entryCoins + 1);

    state.cars = [stillCar({ z: 81, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);

    // The restore rolls the balance and run total back to zone-entry state.
    expect(state.coins).toBe(entryCoins);
    expect(state.runCoins).toBe(entryRunCoins);

    dispatch(state, "forward");
    settle(state);
    expect(state.player.z).toBe(81);
    expect(state.coins).toBe(entryCoins + 1);
  });
});

describe("checkpoint restores replay exactly", () => {
  it("resumed frames equal uninterrupted frames from the same point", () => {
    const first = playingGame(1);
    const second = playingGame(1);

    enterZone(first, 8);
    enterZone(second, 8);
    expect(trace(first)).toBe(trace(second));

    // The second timeline dies inside the zone and restores the checkpoint.
    second.cars = [stillCar({ z: 80, x: 0 })];
    advance(second, 1 / 60);
    advance(second, DEATH_SECONDS);
    expect(second.phase).toBe("gameover");
    advance(second, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(second)).toBe(true);
    expect(second.phase).toBe("playing");
    expect(trace(first)).toBe(trace(second));

    const script: Array<"forward" | "left" | "right" | "back"> = [
      "forward",
      "forward",
      "right",
      "forward",
      "left",
      "forward",
      "forward",
      "back",
    ];

    for (const direction of script) {
      expect(dispatch(first, direction)).toBe(true);
      expect(dispatch(second, direction)).toBe(true);
      advance(first, HOP_SECONDS + 0.02);
      advance(second, HOP_SECONDS + 0.02);
      first.cars = first.cars.filter((car) => car.id !== 99);
      second.cars = second.cars.filter((car) => car.id !== 99);
    }

    for (let i = 0; i < 60; i += 1) {
      first.cars = first.cars.filter((car) => car.id !== 99);
      second.cars = second.cars.filter((car) => car.id !== 99);
      advance(first, 1 / 60);
      advance(second, 1 / 60);
    }

    expect(trace(second)).toBe(trace(first));
  });
});

describe("the eagle still rules the respawn tile", () => {
  it("never fires on the restore itself", () => {
    const state = playingGame();
    enterZone(state, 8);

    state.cars = [stillCar({ z: 80, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    expect(state.phase).toBe("gameover");
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);

    advance(state, 1 / 60);
    expect(state.phase).toBe("playing");
    expect(state.deathCause).toBeNull();
    expect(state.player.hopping).toBe(false);
  });

  it("swoops once the player camps on the respawn tile past the grace", () => {
    const state = playingGame();
    enterZone(state, 8);
    const grace = eagleGraceAt(difficultyForScore(80));

    advance(state, grace - 0.1);
    expect(state.phase).toBe("playing");

    advance(state, 0.2);
    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");

    advance(state, DEATH_SECONDS);
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);
    expect(state.player.z).toBe(80);
  });

  it("measures backtracking from the snapshot's furthest row", () => {
    const state = playingGame();
    enterZone(state, 8);

    // The retreat below lands on 77..79; make those safe before the run.
    flatten(state, 77, 79);

    // Walk three rows into the zone on safe rows, then die there.
    flatten(state, 81, 83);
    for (let i = 0; i < 3; i += 1) {
      dispatch(state, "forward");
      settle(state);
      clearHazards(state);
    }
    expect(state.player.z).toBe(83);

    state.cars = [stillCar({ z: 83, x: 0 })];
    advance(state, 1 / 60);
    advance(state, DEATH_SECONDS);
    advance(state, RESTART_LOCK_SECONDS);
    expect(retryCheckpoint(state)).toBe(true);

    // Two rows back from the zone entry still breathes.
    for (let i = 0; i < 2; i += 1) {
      expect(dispatch(state, "back")).toBe(true);
      settle(state);
    }
    expect(state.player.z).toBe(78);
    expect(state.phase).toBe("playing");

    // A third row behind the snapshot furthest calls the eagle.
    expect(dispatch(state, "back")).toBe(true);
    settle(state);
    expect(state.player.z).toBe(77);
    expect(state.phase).toBe("dying");
    expect(state.deathCause).toBe("eagle");
  });
});
