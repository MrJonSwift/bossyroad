import { wrapLogX } from "./logs";
import type { CoinSpec, CoinState, LogState, WorldRow } from "./types";

/**
 * How close the landed player must be to a coin's centre. Coins sit on tile
 * centres and trails share a column, so this is generous enough for a child
 * who lands "on" the tile without needing frame-perfect alignment.
 */
export const COIN_PICKUP_RADIUS = 0.62;
/** Visual centre height of a coin above the row. */
export const COIN_HEIGHT = 0.46;

export function coinId(z: number, index: number): number {
  return z * 100 + index;
}

/**
 * Build the pickups for one row. A coin with a `logIndex` rides that log, so
 * its x follows the current chain with a fixed offset; a coin without one is
 * a static column on a safe row.
 */
export function createRowCoins(
  z: number,
  specs: readonly CoinSpec[],
  logs: readonly LogState[],
): CoinState[] {
  return specs.map((spec, index) => {
    const logIndex = spec.logIndex;
    const log =
      logIndex === undefined
        ? undefined
        : logs.find(
            (candidate) => candidate.z === z && candidate.id === z * 1000 + logIndex,
          );
    const logOffset = spec.logOffset ?? 0;

    return {
      id: coinId(z, index),
      z,
      x: log ? wrapLogX(log.x + logOffset) : spec.x,
      collected: false,
      logId: log ? log.id : null,
      logOffset,
    };
  });
}

/** Build every pickup in a set of rows. */
export function coinsForWorld(
  rows: readonly WorldRow[],
  logs: readonly LogState[],
): CoinState[] {
  const coins: CoinState[] = [];

  for (const row of rows) {
    if (row.coins && row.coins.length > 0) {
      coins.push(...createRowCoins(row.z, row.coins, logs));
    }
  }

  return coins;
}

/**
 * Keep log coins attached to their logs. Static coins never move. Collected
 * coins are skipped, so a finished pickup costs nothing every fixed step.
 */
export function advanceCoins(coins: CoinState[], logs: readonly LogState[]): void {
  if (!coins.some((coin) => !coin.collected && coin.logId !== null)) {
    return;
  }

  const byId = new Map<number, LogState>();

  for (const log of logs) {
    byId.set(log.id, log);
  }

  for (const coin of coins) {
    if (coin.collected || coin.logId === null) {
      continue;
    }

    const log = byId.get(coin.logId);

    if (log) {
      coin.x = wrapLogX(log.x + coin.logOffset);
    }
  }
}

/**
 * Collect every unclaimed coin on the landing row within reach. Returns how
 * many were picked up so the caller can update the balance in one place.
 */
export function collectCoins(
  coins: CoinState[],
  x: number,
  z: number,
): number {
  let collected = 0;

  for (const coin of coins) {
    if (coin.collected || coin.z !== z) {
      continue;
    }

    if (Math.abs(coin.x - x) <= COIN_PICKUP_RADIUS) {
      coin.collected = true;
      collected += 1;
    }
  }

  return collected;
}
