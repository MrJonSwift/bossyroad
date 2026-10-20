import { PLAYER_HITBOX_HALF_X, PLAYER_HITBOX_HALF_Z } from "./cars";
import type { RailPhase, RailSpec, RailState } from "./types";

/** Train footprint across the row. */
export const TRAIN_DEPTH = 1;
/** The train starts/ends this far outside the nine-tile strip. */
export const TRAIN_STRIP_HALF = 4.8;

/**
 * How long the train takes to fully cross: the visible strip plus its own
 * length. Warning time is deliberately separate, so the train never appears
 * without the lights and bell first.
 */
export function trainCrossSeconds(speed: number, length: number): number {
  return (TRAIN_STRIP_HALF * 2 + length) / speed;
}

export function railCycleSeconds(spec: RailSpec): number {
  return (
    spec.warnSeconds + trainCrossSeconds(spec.speed, spec.length) + spec.cooldownSeconds
  );
}

/**
 * The train's centre for a crossing progress of 0..1. It enters from `-dir`
 * and exits on the far side, so at 0 the nose is at the strip edge and at 1
 * the tail has just left.
 */
function crossingX(dir: 1 | -1, length: number, progress: number): number {
  const travel = TRAIN_STRIP_HALF * 2 + length;
  const distance = progress * travel;

  // For dir = 1, the centre starts at -(half + length/2) and finishes at
  // +(half + length/2). That puts the nose exactly at -half at t = 0.
  if (dir === 1) {
    return -TRAIN_STRIP_HALF - length / 2 + distance;
  }

  return TRAIN_STRIP_HALF + length / 2 - distance;
}

function phaseFor(timer: number, warnSeconds: number, crossSeconds: number): RailPhase {
  if (timer < warnSeconds) {
    return "warning";
  }
  if (timer < warnSeconds + crossSeconds) {
    return "crossing";
  }
  return "cooldown";
}

function updatePosition(rail: RailState): void {
  rail.prevX = rail.x;

  if (rail.phase === "crossing") {
    const progress =
      (rail.timer - rail.warnSeconds) /
      Math.max(1e-6, rail.crossSeconds);
    rail.x = crossingX(rail.dir, rail.length, Math.min(1, Math.max(0, progress)));
    return;
  }

  // Park the train at the entry/exit point while it is not crossing. The
  // renderer hides it, but collision stays honest if a phase boundary is hit.
  const progress = rail.phase === "warning" ? 0 : 1;
  rail.x = crossingX(rail.dir, rail.length, progress);
}

export function createRailState(z: number, spec: RailSpec): RailState {
  const crossSeconds = trainCrossSeconds(spec.speed, spec.length);
  const cycle = spec.warnSeconds + crossSeconds + spec.cooldownSeconds;
  const timer = spec.offset * cycle;
  const phase = phaseFor(timer, spec.warnSeconds, crossSeconds);
  const rail: RailState = {
    z,
    dir: spec.dir,
    speed: spec.speed,
    length: spec.length,
    warnSeconds: spec.warnSeconds,
    crossSeconds,
    cooldownSeconds: spec.cooldownSeconds,
    timer,
    phase,
    x: 0,
    prevX: 0,
  };

  updatePosition(rail);
  rail.prevX = rail.x;
  return rail;
}

/** Advance one timetable. Phases are warning -> crossing -> cooldown, forever. */
export function advanceRails(rails: RailState[], dt: number): void {
  for (const rail of rails) {
    const cycle =
      rail.warnSeconds + rail.crossSeconds + rail.cooldownSeconds;

    rail.prevX = rail.x;
    rail.timer = (rail.timer + dt) % cycle;
    rail.phase = phaseFor(rail.timer, rail.warnSeconds, rail.crossSeconds);
    updatePosition(rail);
  }
}

export function railCycleTime(rail: RailState): number {
  return rail.warnSeconds + rail.crossSeconds + rail.cooldownSeconds;
}

/**
 * Swept train collision. A train at 12 tiles/s moves 0.2 tiles per fixed step,
 * but the swept interval keeps the rule safe if the fixed step grows later.
 * A hit is only possible while the train is actually crossing.
 */
export function railHitsPlayer(rail: RailState, x: number, z: number): boolean {
  if (rail.phase !== "crossing") {
    return false;
  }

  if (Math.abs(rail.z - z) >= TRAIN_DEPTH / 2 + PLAYER_HITBOX_HALF_Z) {
    return false;
  }

  const left = Math.min(rail.prevX, rail.x) - rail.length / 2;
  const right = Math.max(rail.prevX, rail.x) + rail.length / 2;
  const playerLeft = x - PLAYER_HITBOX_HALF_X;
  const playerRight = x + PLAYER_HITBOX_HALF_X;

  return right > playerLeft && left < playerRight;
}

/** True when any train on the line hits the player this step. */
export function trainsHitPlayer(
  rails: readonly RailState[],
  x: number,
  z: number,
): boolean {
  return rails.some((rail) => railHitsPlayer(rail, x, z));
}

/** True when the warning lights for this row should be lit this instant. */
export function warningLightsOn(rail: RailState, side: 0 | 1, time: number): boolean {
  if (rail.phase === "crossing") {
    return true;
  }
  if (rail.phase === "cooldown") {
    return false;
  }

  // 2 Hz alternating lamps, inside the spec's 3 Hz flashing ceiling.
  const on = Math.sin(time * Math.PI * 4) >= 0;
  return side === 0 ? on : !on;
}
