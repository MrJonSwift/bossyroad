import { advanceCars, carHitsPlayer } from "./cars";
import { advanceCoins, collectCoins, coinsForWorld } from "./coins";
import { difficultyForScore, eagleGraceAt } from "./difficulty";
import { advanceLogs, logAt, wrappedLogDelta } from "./logs";
import { advanceRails, trainsHitPlayer } from "./rails";
import {
  PLAY_MAX_X,
  PLAY_MIN_X,
  type DeathCause,
  type Direction,
  type GameState,
  type PlayerPose,
  type PlayerState,
} from "./types";
import {
  PLAYER_MIN_Z,
  carsForWorld,
  createWorld,
  logsForWorld,
  railsForWorld,
  resetWorld,
  syncCars,
  syncCoins,
  syncLogs,
  syncRails,
  syncWorld,
} from "./world";

export const HOP_SECONDS = 0.14;
export const HOP_HEIGHT = 0.55;
/** Time between the hit and the game-over card. */
export const DEATH_SECONDS = 0.9;
/** Water is readable without holding the card back as long as a car hit. */
export const DROWN_SECONDS = 0.6;
/** Backtracking this far behind the furthest row calls the eagle. */
export const EAGLE_BACKTRACK_ROWS = 3;
/** The retry prompt needs a beat before it accepts a tap. */
export const RESTART_LOCK_SECONDS = 0.2;

const DELTAS: Record<Direction, readonly [number, number]> = {
  forward: [0, 1],
  back: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

function makePlayer(): PlayerState {
  return {
    x: 0,
    z: 0,
    fromX: 0,
    fromZ: 0,
    toX: 0,
    toZ: 0,
    hopT: 0,
    hopping: false,
    facing: "forward",
    queued: null,
    logId: null,
    carrierLogId: null,
    offStrip: false,
  };
}

function resetPlayer(player: PlayerState): void {
  Object.assign(player, makePlayer());
}

function safeBest(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function safeCoins(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function createGame(
  options: { seed?: number; best?: number; coins?: number } = {},
): GameState {
  const seed = options.seed ?? 1;
  const world = createWorld(seed);
  const logs = logsForWorld(world.rows);

  return {
    seed,
    runId: 0,
    phase: "title",
    phaseTime: 0,
    deathCause: null,
    player: makePlayer(),
    cars: carsForWorld(world.rows),
    logs,
    rails: railsForWorld(world.rows),
    coinDrops: coinsForWorld(world.rows, logs),
    coins: safeCoins(options.coins),
    runCoins: 0,
    idleTime: 0,
    score: 0,
    best: safeBest(options.best),
    world: world.rows,
    generator: world.generator,
    minZ: PLAYER_MIN_Z,
    maxZ: world.maxZ,
  };
}

/**
 * Begin (or retry) a run. Title starts immediately; the game-over card has a
 * short lock so a mashed tap cannot skip the result.
 *
 * The world is rebuilt from the same seed, so a retry walks the identical
 * layout and the renderer can tell it is a fresh generation via `runId`.
 */
export function startRun(state: GameState): boolean {
  const fromTitle = state.phase === "title";
  const retryReady =
    state.phase === "gameover" && state.phaseTime >= RESTART_LOCK_SECONDS;

  if (!fromTitle && !retryReady) {
    return false;
  }

  resetPlayer(state.player);
  resetWorld(state);
  state.runId += 1;
  state.minZ = PLAYER_MIN_Z;
  state.score = 0;
  state.runCoins = 0;
  state.idleTime = 0;
  state.deathCause = null;
  state.phase = "playing";
  state.phaseTime = 0;
  return true;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rowAt(state: GameState, z: number) {
  return state.world.find((row) => row.z === z);
}

function endRun(state: GameState, cause: DeathCause): void {
  if (state.phase !== "playing") {
    return;
  }

  state.phase = "dying";
  state.phaseTime = 0;
  state.deathCause = cause;
  state.best = Math.max(state.best, state.score);
}

export function deathSeconds(cause: DeathCause | null): number {
  return cause === "drown" ? DROWN_SECONDS : DEATH_SECONDS;
}

function startHop(state: GameState, direction: Direction): void {
  const player = state.player;
  const [dx, dz] = DELTAS[direction];

  player.facing = direction;
  player.fromX = player.x;
  player.fromZ = player.z;
  player.toX = clamp(player.x + dx, PLAY_MIN_X, PLAY_MAX_X);
  player.toZ = clamp(player.z + dz, state.minZ, state.maxZ);
  player.hopT = 0;
  player.hopping = true;
  player.queued = null;
  player.carrierLogId = player.logId;
  player.logId = null;
  player.offStrip = false;
  state.idleTime = 0;
}

/**
 * Queue or begin a move. Returns true when a new hop starts immediately.
 * While airborne, at most one move is buffered; this keeps taps responsive
 * without letting a mashed input queue turn into a teleport.
 */
export function dispatch(state: GameState, direction: Direction): boolean {
  if (state.phase !== "playing") {
    return false;
  }

  if (state.player.hopping) {
    state.player.queued = direction;
    return false;
  }

  startHop(state, direction);
  return true;
}

/**
 * Apply the current's motion to a rider. While hopping, the same delta is
 * added to the hop's start and target so the launch keeps its momentum. If a
 * log would carry the player outside the strip, the player is pushed back to
 * the edge and marked for a splash on landing.
 */
function carryWithLog(state: GameState): void {
  const player = state.player;
  const carrierId = player.hopping ? player.carrierLogId : player.logId;

  if (carrierId === null) {
    return;
  }

  const log = state.logs.find((candidate) => candidate.id === carrierId);

  if (!log) {
    if (!player.hopping) {
      player.logId = null;
    }
    return;
  }

  const delta = wrappedLogDelta(log.prevX, log.x);

  if (delta === 0) {
    return;
  }

  if (player.hopping) {
    player.fromX += delta;
    player.toX += delta;
    player.x += delta;

    if (player.toX < PLAY_MIN_X || player.toX > PLAY_MAX_X) {
      player.toX = clamp(player.toX, PLAY_MIN_X, PLAY_MAX_X);
      player.offStrip = true;
    }
    return;
  }

  player.x += delta;

  if (player.x < PLAY_MIN_X || player.x > PLAY_MAX_X) {
    player.x = clamp(player.x, PLAY_MIN_X, PLAY_MAX_X);
    endRun(state, "drown");
  }
}

function landPlayer(state: GameState): void {
  const player = state.player;
  const row = rowAt(state, player.z);

  player.logId = null;

  if (row?.kind === "river") {
    const log = logAt(state.logs, player.z, player.x);

    if (!log || player.offStrip) {
      player.offStrip = false;
      endRun(state, "drown");
      return;
    }

    player.logId = log.id;
  }

  player.offStrip = false;

  // Pickups are collected on landing, so the rule reads as "land on the coin".
  const picked = collectCoins(state.coinDrops, player.x, player.z);

  if (picked > 0) {
    state.coins += picked;
    state.runCoins += picked;
  }

  // Landing is a successful move; the eagle only catches a player who stops.
  state.idleTime = 0;
}

function advancePlayer(state: GameState, dt: number): void {
  const player = state.player;

  carryWithLog(state);

  if (state.phase !== "playing") {
    return;
  }

  if (!player.hopping) {
    return;
  }

  player.hopT = Math.min(1, player.hopT + dt / HOP_SECONDS);

  if (player.hopT < 1) {
    return;
  }

  player.x = player.toX;
  player.z = player.toZ;
  player.hopping = false;
  player.hopT = 0;
  player.carrierLogId = null;

  if (player.z > state.score) {
    state.score = player.z;
  }
  if (player.z > state.best) {
    state.best = player.z;
  }

  landPlayer(state);

  if (state.phase !== "playing") {
    return;
  }

  if (player.queued) {
    const next = player.queued;
    player.queued = null;
    startHop(state, next);
  }
}

function checkEagle(state: GameState): void {
  const player = state.player;

  // A player in the air is never "camping"; the rule waits for a landing.
  if (player.hopping || state.phase !== "playing") {
    return;
  }

  if (state.score - player.z >= EAGLE_BACKTRACK_ROWS) {
    endRun(state, "eagle");
    return;
  }

  const grace = eagleGraceAt(difficultyForScore(state.score));

  if (state.idleTime >= grace) {
    endRun(state, "eagle");
  }
}

export function advance(state: GameState, dt: number): void {
  if (dt <= 0) {
    return;
  }

  state.phaseTime += dt;

  // The title screen keeps the road alive behind the card. The game-over card
  // freezes the scene so the result reads as a snapshot.
  if (state.phase === "gameover") {
    return;
  }

  if (syncWorld(state)) {
    syncCars(state);
    syncLogs(state);
    syncRails(state);
    syncCoins(state);
  }

  advanceCars(state.cars, dt);
  advanceLogs(state.logs, dt);
  advanceRails(state.rails, dt);
  advanceCoins(state.coinDrops, state.logs);

  if (state.phase === "title") {
    return;
  }

  if (state.phase === "dying") {
    if (state.phaseTime >= deathSeconds(state.deathCause)) {
      state.phase = "gameover";
      state.phaseTime = 0;
    }
    return;
  }

  if (state.player.hopping) {
    state.idleTime = 0;
  } else {
    state.idleTime += dt;
  }

  advancePlayer(state, dt);

  if (state.phase !== "playing") {
    return;
  }

  const pose = playerPose(state);

  if (carHitsPlayer(state.cars, pose.x, pose.z)) {
    endRun(state, "car");
    return;
  }

  if (trainsHitPlayer(state.rails, pose.x, pose.z)) {
    endRun(state, "train");
    return;
  }

  checkEagle(state);
}

export function playerPose(state: GameState): PlayerPose {
  const player = state.player;
  const t = player.hopping ? player.hopT : 0;
  const smooth = t * t * (3 - 2 * t);

  return {
    x: player.hopping ? player.fromX + (player.toX - player.fromX) * smooth : player.x,
    z: player.hopping ? player.fromZ + (player.toZ - player.fromZ) * smooth : player.z,
    y: player.hopping ? Math.sin(Math.PI * t) * HOP_HEIGHT : 0,
    hopT: t,
    facing: player.facing,
    hopping: player.hopping,
  };
}
