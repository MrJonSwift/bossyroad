import { createLaneCars } from "./cars";
import { coinsForWorld, createRowCoins } from "./coins";
import {
  createWorldGenerator,
  generateRows,
  type WorldGenerator,
} from "./generator";
import { createRiverLogs } from "./logs";
import { createRailState } from "./rails";
import type {
  CarState,
  CoinState,
  GameState,
  LogState,
  RailState,
  WorldRow,
} from "./types";

/** Rows kept behind the player. The camera sits 13.2 behind, so 16 is safe. */
export const WINDOW_BEHIND = 16;
/** Rows kept ahead of the player. The camera sees roughly 20 rows. */
export const WINDOW_AHEAD = 24;
/** The world always starts at this depth so the camera never sees an edge. */
export const WORLD_START_Z = -WINDOW_BEHIND;
/** The player cannot hop behind the start line. */
export const PLAYER_MIN_Z = -4;

export interface WorldWindow {
  rows: WorldRow[];
  generator: WorldGenerator;
  maxZ: number;
}

/** Build the initial window around the start line. */
export function createWorld(seed: number): WorldWindow {
  const generator = createWorldGenerator(seed, WORLD_START_Z);
  const rows: WorldRow[] = [];

  generateRows(generator, WINDOW_AHEAD, rows);

  return { rows, generator, maxZ: WINDOW_AHEAD };
}

/** Build the traffic for every road row in a set of rows. */
export function carsForWorld(rows: readonly WorldRow[]): CarState[] {
  const cars: CarState[] = [];

  for (const row of rows) {
    if (row.lane) {
      cars.push(...createLaneCars(row.z, row.lane));
    }
  }

  return cars;
}

/** Build every river row's moving log chain. */
export function logsForWorld(rows: readonly WorldRow[]): LogState[] {
  const logs: LogState[] = [];

  for (const row of rows) {
    if (row.river) {
      logs.push(...createRiverLogs(row.z, row.river));
    }
  }

  return logs;
}

/** Build every rail row's warning/crossing timetable. */
export function railsForWorld(rows: readonly WorldRow[]): RailState[] {
  const rails: RailState[] = [];

  for (const row of rows) {
    if (row.rail) {
      rails.push(createRailState(row.z, row.rail));
    }
  }

  return rails;
}

/**
 * Rebuild the whole live window from the run seed. Used by a retry; the same
 * seed therefore reproduces the same world from row zero.
 */
export function resetWorld(state: GameState): void {
  const world = createWorld(state.seed);

  state.world = world.rows;
  state.generator = world.generator;
  state.maxZ = world.maxZ;
  state.cars = carsForWorld(world.rows);
  state.logs = logsForWorld(world.rows);
  state.rails = railsForWorld(world.rows);
  state.coinDrops = coinsForWorld(world.rows, state.logs);
}

/**
 * Keep a fixed-size window of rows around the player. Extending is cheap:
 * rows are appended and the chunks are cached by the renderer. Recycling only
 * drops rows well behind the camera, so nothing pops in view.
 *
 * Returns true when rows were added or removed, which tells the caller to
 * re-sync traffic, logs and rails.
 */
export function syncWorld(state: GameState): boolean {
  const behind = Math.max(WORLD_START_Z, Math.floor(state.player.z) - WINDOW_BEHIND);
  const ahead = Math.floor(state.player.z) + WINDOW_AHEAD;
  let changed = false;

  const before = state.world.length;
  generateRows(state.generator, ahead, state.world);

  if (state.world.length !== before) {
    changed = true;
  }

  // Drop recycled rows. A large jump (debug teleport or a future long fall)
  // can also generate rows below the recycle line, so this filter runs after
  // generation too.
  const lowest = state.world[0]?.z ?? 0;
  if (lowest < behind) {
    state.world = state.world.filter((row) => row.z >= behind);
    changed = true;
  }

  state.maxZ = ahead;
  return changed;
}

/**
 * Match traffic to the live rows: generated road rows get their cars, and a
 * car is dropped when its row is recycled. Keeping cars whose depth is still
 * live (rather than only cars on road rows) lets tests and future session-4
 * hazards inject a car without the recycler eating it.
 */
export function syncCars(state: GameState): void {
  const depths = new Set(state.world.map((row) => row.z));
  const cars = state.cars.filter((car) => depths.has(car.z));
  const occupied = new Set(cars.map((car) => car.z));

  for (const row of state.world) {
    if (!row.lane || occupied.has(row.z)) {
      continue;
    }

    cars.push(...createLaneCars(row.z, row.lane));
  }

  state.cars = cars;
}

/** Match log chains to live river rows without resetting a chain mid-ride. */
export function syncLogs(state: GameState): void {
  const rivers = new Map<number, WorldRow>();

  for (const row of state.world) {
    if (row.river) {
      rivers.set(row.z, row);
    }
  }

  const logs = state.logs.filter((log) => rivers.has(log.z));
  const occupied = new Set(logs.map((log) => log.z));

  for (const [z, row] of rivers) {
    if (!row.river || occupied.has(z)) {
      continue;
    }

    logs.push(...createRiverLogs(z, row.river));
  }

  state.logs = logs;
}

/** Match rail timetables to live rail rows. */
export function syncRails(state: GameState): void {
  const railRows = new Map<number, WorldRow>();

  for (const row of state.world) {
    if (row.rail) {
      railRows.set(row.z, row);
    }
  }

  const rails = state.rails.filter((rail) => railRows.has(rail.z));
  const occupied = new Set(rails.map((rail) => rail.z));

  for (const [z, row] of railRows) {
    if (!row.rail || occupied.has(z)) {
      continue;
    }

    rails.push(createRailState(z, row.rail));
  }

  state.rails = rails;
}

/**
 * Match pickups to live rows. Collected coins stay in the list until their
 * row recycles, so the visual can pop and the balance can never count twice.
 * Log coins need the row's logs to exist, so call this after `syncLogs`.
 */
export function syncCoins(state: GameState): void {
  const live = new Set(state.world.map((row) => row.z));
  const coins: CoinState[] = state.coinDrops.filter((coin) => live.has(coin.z));
  const occupied = new Set(coins.map((coin) => coin.z));

  for (const row of state.world) {
    if (!row.coins || row.coins.length === 0 || occupied.has(row.z)) {
      continue;
    }

    coins.push(...createRowCoins(row.z, row.coins, state.logs));
  }

  state.coinDrops = coins;
}
