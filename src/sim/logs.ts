import { logRunAt } from "./difficulty";
import { intRange, range, type Rng } from "./rng";
import type { LogState, RiverSpec } from "./types";

/** Logs travel on a circle twice this wide, hidden outside the strip. */
export const LOG_WRAP = 9;
/** Circumference of the log chain. Must match the generated lengths' sum. */
export const LOG_CHAIN_WIDTH = LOG_WRAP * 2;
export const MIN_LOG_SPEED = 0.8;
export const MAX_LOG_SPEED = 2.2;
/** Landing tolerance; the player's centre must be over the log deck. */
const LOG_COVER_SLOP = 1e-6;

/**
 * Build the log lengths for one river row. The runs tile the full wrap circle
 * with no gaps, which is the session-4 version of the session-3 invariant: a
 * player can always find a log under them, even while the chain moves.
 */
export function createLogLengths(rng: Rng, difficulty: number): number[] {
  const maxRun = Math.max(1, logRunAt(difficulty));
  const lengths: number[] = [];
  let remaining = LOG_CHAIN_WIDTH;

  while (remaining > maxRun) {
    // Leave at least one tile for the final run.
    const run = intRange(rng, 1, Math.min(maxRun, remaining - 1));
    lengths.push(run);
    remaining -= run;
  }

  lengths.push(remaining);
  return lengths;
}

/** Wrap a log centre onto the chain circle's visible representation. */
export function wrapLogX(x: number): number {
  let wrapped = x;

  while (wrapped >= LOG_WRAP) {
    wrapped -= LOG_CHAIN_WIDTH;
  }
  while (wrapped < -LOG_WRAP) {
    wrapped += LOG_CHAIN_WIDTH;
  }

  return wrapped;
}

/**
 * Centre of the log at `index` in a river row's chain. The coin generator uses
 * this to place a pickup on a log without having to build the whole chain, and
 * `createRiverLogs` uses it to keep both definitions identical.
 */
export function logCentreInChain(spec: RiverSpec, index: number): number {
  let cursor = -LOG_WRAP + spec.offset * LOG_CHAIN_WIDTH;

  for (let i = 0; i < index; i += 1) {
    cursor += spec.lengths[i] ?? 1;
  }

  return wrapLogX(cursor + (spec.lengths[index] ?? 1) / 2);
}

/**
 * Lay one river row's chain out on the wrap circle. Logs keep stable ids for
 * their row so the renderer can reuse meshes across frames.
 */
export function createRiverLogs(z: number, spec: RiverSpec): LogState[] {
  const logs: LogState[] = [];

  for (let i = 0; i < spec.lengths.length; i += 1) {
    const x = logCentreInChain(spec, i);
    const length = spec.lengths[i] ?? 1;

    logs.push({
      id: z * 1000 + i,
      z,
      x,
      prevX: x,
      dir: spec.dir,
      speed: spec.speed,
      length,
    });
  }

  return logs;
}

/**
 * Move every chain at its current speed. Wrapping on the log centre keeps the
 * chain's coverage intact because the lengths tile the whole circle.
 */
export function advanceLogs(logs: LogState[], dt: number): void {
  for (const log of logs) {
    log.prevX = log.x;
    log.x = wrapLogX(log.x + log.dir * log.speed * dt);
  }
}

/** Shortest signed distance between two positions on the log circle. */
export function wrappedLogDelta(previous: number, next: number): number {
  let delta = next - previous;

  if (delta > LOG_WRAP) {
    delta -= LOG_CHAIN_WIDTH;
  } else if (delta < -LOG_WRAP) {
    delta += LOG_CHAIN_WIDTH;
  }

  return delta;
}

/** The log on `z` that covers `x`, or undefined for open water. */
export function logAt(
  logs: readonly LogState[],
  z: number,
  x: number,
): LogState | undefined {
  for (const log of logs) {
    if (log.z === z && Math.abs(x - log.x) <= log.length / 2 + LOG_COVER_SLOP) {
      return log;
    }
  }

  return undefined;
}

/** True when `x` has a log under it on `z`. Used by reachability tests. */
export function hasLogCover(
  logs: readonly LogState[],
  z: number,
  x: number,
): boolean {
  return logAt(logs, z, x) !== undefined;
}

/** Speed range used by the generator; kept next to the chain helpers. */
export function logSpeedRange(): { min: number; max: number } {
  return { min: MIN_LOG_SPEED, max: MAX_LOG_SPEED };
}

/** Small helper for the generator so it stays readable. */
export function logSpeedNear(rng: Rng, target: number): number {
  return range(rng, target - 0.2, target + 0.2);
}
