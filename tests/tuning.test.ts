import { describe, expect, it } from "vitest";
import {
  advance,
  createGame,
  dispatch,
  retryCheckpoint,
  startRun,
} from "../src/sim/game";
import type { Direction, GameState, RunPhase, WorldRow } from "../src/sim/types";

/**
 * Simulator evidence for the difficulty/economy tuning (ticket 10).
 *
 * Two deterministic player profiles drive the real simulation: a hesitant
 * "casual adult" (slow reaction, roughly acts on one look in two, pauses for
 * a second or two every few rows, never retreats) and a near-optimal "expert".
 * The casual medians are regression guards for the beginner targets in
 * SPEC section 9; the expert blocker asserts the cap end of the curve is not
 * touched by the beginner kindness.
 *
 * `TUNING_MEASURE=1 npx vitest run tests/tuning.test.ts` prints the raw
 * tables without asserting the targets, so a session can record a baseline.
 */
const MEASURE = process.env.TUNING_MEASURE === "1";

/* ------------------------------------------------------------------ dice */

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand: () => number, min: number, max: number): number =>
  min + rand() * (max - min);

/* ---------------------------------------------------------------- profiles */

interface Profile {
  /** Seconds between "looks" on solid ground. */
  lookSeconds: number;
  /** On a log the current drags; a player in the water reacts faster. */
  riverLookSeconds: number;
  /** Chance that a look becomes a hop (thinking time, not sleep). */
  actChance: number;
  /** Seconds of traffic lookahead before committing to a lane. */
  horizon: number;
  /** Tiles of courage beyond the car box when accepting a gap. */
  margin: number;
  /** Rows landed between hesitation pauses. */
  hesitateEvery: [number, number];
  /** Hesitation length, seconds. */
  hesitateFor: [number, number];
  /** Checkpoint retries a player uses before FINISH. */
  maxRetries: number;
}

const CASUAL: Profile = {
  lookSeconds: 0.5,
  riverLookSeconds: 0.25,
  actChance: 0.5,
  horizon: 0.6,
  margin: 1,
  hesitateEvery: [3, 5],
  hesitateFor: [1, 2],
  maxRetries: 3,
};

const EXPERT: Profile = {
  lookSeconds: 0.16,
  riverLookSeconds: 0.1,
  actChance: 1,
  horizon: 1.1,
  margin: 0.45,
  hesitateEvery: [999, 999],
  hesitateFor: [0, 0],
  maxRetries: 3,
};

/* --------------------------------------------------------------- geometry */

const CAR_HALF = 0.75;
const STRIP_MIN = -4;
const STRIP_MAX = 4;
const FIXED_DT = 1 / 60;
const LIFE_SECONDS_CAP = 150;

function wrapX(x: number): number {
  return ((((x + 9) % 18) + 18) % 18) - 9;
}

/* -------------------------------------------------------------- lookahead */

/**
 * False while any car stands inside the danger column during the horizon.
 * Cars keep their generated gaps, so sampling time is safe at these speeds.
 */
function openingExists(
  cars: readonly { x: number; dir: number; speed: number; length: number }[],
  x: number,
  margin: number,
  horizon: number,
): boolean {
  for (let t = 0; t <= horizon; t += 0.08) {
    for (const car of cars) {
      const cx = wrapX(car.x + car.dir * car.speed * t);
      if (Math.abs(cx - x) < CAR_HALF + margin) {
        return false;
      }
    }
  }
  return true;
}

function railOpening(state: GameState, z: number, x: number): boolean {
  const rail = state.rails.find((entry) => entry.z === z);
  if (!rail || rail.phase !== "crossing") {
    return true;
  }
  return Math.abs(rail.x - x) >= rail.length / 2 + 2.5;
}

/* ----------------------------------------------------------- world lookups */

function rowOf(state: GameState, z: number): WorldRow | undefined {
  return state.world.find((row) => row.z === z);
}

/* ------------------------------------------------------------------- bot */

/** A move the player must take right now, or lose the tile they stand on. */
function standingDanger(
  state: GameState,
  x: number,
  z: number,
  rand: () => number,
): Direction | null {
  const current = rowOf(state, z);
  if (!current) {
    return null;
  }

  if (current.kind === "road") {
    const cars = state.cars.filter((car) => car.z === z);
    if (openingExists(cars, x, 0.5, 0.9)) {
      return null;
    }

    // Dodge sideways if one side buys time; otherwise gamble forward.
    const left = x > STRIP_MIN && openingExists(cars, x - 1, 0.5, 0.9);
    const right = x < STRIP_MAX && openingExists(cars, x + 1, 0.5, 0.9);
    if (left && !right) {
      return "left";
    }
    if (right && !left) {
      return "right";
    }
    if (left && right) {
      return rand() < 0.5 ? "left" : "right";
    }
    return "forward";
  }

  if (current.kind === "rail") {
    const rail = state.rails.find((entry) => entry.z === z);
    if (
      rail &&
      rail.phase === "crossing" &&
      Math.abs(rail.x - x) < rail.length / 2 + 1.6
    ) {
      return rail.x >= x ? "left" : "right";
    }
  }

  return null;
}

/** Where to hop next, or null to stay put and wait for a better moment. */
function chooseMove(state: GameState, profile: Profile): Direction | null {
  const player = state.player;
  const ahead = rowOf(state, player.z + 1);
  if (!ahead) {
    return null;
  }

  switch (ahead.kind) {
    case "grass":
    case "river":
      // Rivers tile the wrap circle: landing always meets a log, and momentum
      // beats drift, so water is never a reason to stop.
      return "forward";
    case "road": {
      const cars = state.cars.filter((car) => car.z === ahead.z);
      return openingExists(cars, player.x, profile.margin, profile.horizon)
        ? "forward"
        : null;
    }
    case "rail":
      return railOpening(state, ahead.z, player.x) ? "forward" : null;
  }
}

/**
 * One playing segment: start (or a checkpoint resume) until the next death.
 * Emergency reflexes (a car closing on the standing tile, a train body, the
 * log strip edge) bypass the hesitation dice — a frozen player is not what
 * the profile models; occasional slowness is.
 */
function playLife(
  state: GameState,
  profile: Profile,
  rand: () => number,
): { bestRow: number; cause: string; seconds: number } {
  let t = 0;
  let bestRow = state.player.z;
  let nextLook = 0;
  let nextHesitate = pick(
    rand,
    profile.hesitateEvery[0],
    profile.hesitateEvery[1],
  );
  let rowsLanded = 0;
  let hesitateUntil = -1;
  let lastSeenZ = state.player.z;

  while (t < LIFE_SECONDS_CAP) {
    advance(state, FIXED_DT);
    t += FIXED_DT;

    if (state.phase !== "playing") {
      break;
    }

    const player = state.player;

    if (player.z > bestRow) {
      bestRow = player.z;
    }

    if (!player.hopping && player.z > lastSeenZ) {
      lastSeenZ = player.z;
      rowsLanded += 1;
      if (rowsLanded >= nextHesitate) {
        rowsLanded = 0;
        nextHesitate = pick(
          rand,
          profile.hesitateEvery[0],
          profile.hesitateEvery[1],
        );
        hesitateUntil =
          t + pick(rand, profile.hesitateFor[0], profile.hesitateFor[1]);
      }
    }

    if (player.hopping) {
      continue;
    }

    const afloat = player.logId !== null;
    const onRiver = afloat && rowOf(state, player.z)?.kind === "river";

    // A log carrying the player off the strip gets an instant hop inward.
    if (onRiver && Math.abs(player.x) >= 2.6) {
      dispatch(state, player.x > 0 ? "left" : "right");
      continue;
    }

    // The hesitation dice gate everything else: a hesitant player freezes
    // mid-run, including inside a lane, and only the water reflex above
    // still reaches them.
    if (t < hesitateUntil) {
      continue;
    }

    const dodge = standingDanger(state, player.x, player.z, rand);
    if (dodge) {
      dispatch(state, dodge);
      continue;
    }

    const lookInterval = onRiver ? profile.riverLookSeconds : profile.lookSeconds;
    if (t < nextLook) {
      continue;
    }
    nextLook = t + lookInterval;

    if (rand() >= profile.actChance) {
      continue;
    }

    const move = chooseMove(state, profile);
    if (move) {
      dispatch(state, move);
    }
  }

  return {
    bestRow,
    cause: state.deathCause ?? (t >= LIFE_SECONDS_CAP ? "survived-cap" : "eagle"),
    seconds: t,
  };
}

/* ------------------------------------------------------------------ runs */

interface LifeRecord {
  bestRow: number;
  cause: string;
  first: boolean;
}

interface RunRecord {
  lives: LifeRecord[];
  coins: number;
}

function playRun(seed: number, profile: Profile): RunRecord {
  const state = createGame({ seed });
  const rand = mulberry((seed * 2654435761) >>> 0);
  expect(startRun(state)).toBe(true);

  const lives: LifeRecord[] = [];
  let retries = 0;

  for (;;) {
    const first = retries === 0;
    const life = playLife(state, profile, rand);

    // Walk the death beat through to the card, then past the retry lock (the
    // card transition resets phaseTime), so a TRY AGAIN tap is accepted.
    if (state.phase === "dying") {
      let guard = 0;
      // `advance` mutates state in place, but TypeScript has narrowed the
      // original property to "dying" inside this branch, so read it through
      // a function whose declared return type is the full phase union.
      const readPhase = (s: GameState): RunPhase => s.phase;
      while (
        (readPhase(state) !== "gameover" || state.phaseTime < 0.25) &&
        guard < 60 * 6
      ) {
        advance(state, FIXED_DT);
        guard += 1;
      }
    }

    lives.push({ ...life, first });

    const canRetry = state.checkpoint !== null && retries < profile.maxRetries;
    if (!canRetry) {
      break;
    }

    retries += 1;
    expect(retryCheckpoint(state)).toBe(true);
  }

  return { lives, coins: state.coins };
}

/* ----------------------------------------------------------------- stats */

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(p * (sorted.length - 1))),
  );
  return sorted[index] ?? 0;
}

const SEED_COUNT = 40;

function survey(profile: Profile, label: string): RunRecord[] {
  const runs: RunRecord[] = [];
  for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
    runs.push(playRun(seed, profile));
  }

  const lifeRows = runs.flatMap((run) => run.lives.map((life) => life.bestRow));
  const firstRows = runs.map(
    (run) => run.lives.find((life) => life.first)?.bestRow ?? 0,
  );
  const runCoins = runs.map((run) => run.coins);

  const causes = new Map<string, number>();
  for (const run of runs) {
    const first = run.lives.find((life) => life.first);
    if (first) {
      causes.set(first.cause, (causes.get(first.cause) ?? 0) + 1);
    }
  }

  console.log(
    [
      `${label} over ${SEED_COUNT} seeds:`,
      `  lives: ${lifeRows.length}   median best row/life: ${median(lifeRows).toFixed(1)}`,
      `  first-life median best row: ${median(firstRows).toFixed(1)}  (p10 ${percentile(firstRows, 0.1)}, p90 ${percentile(firstRows, 0.9)})`,
      `  median coins/run: ${median(runCoins).toFixed(1)}  (p10 ${percentile(runCoins, 0.1)}, p90 ${percentile(runCoins, 0.9)})`,
      `  first-life causes: ${[...causes.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}=${n}`).join(", ")}`,
      `  rows: [${lifeRows.join(", ")}]`,
    ].join("\n"),
  );

  return runs;
}

/* ----------------------------------------------------------------- tests */

describe("tuning targets (ticket 10)", () => {
  it("meets the beginner targets without taming the expert cap", () => {
    if (MEASURE) {
      survey(CASUAL, "casual measurement");
      survey(EXPERT, "expert measurement");
      return;
    }

    const casual = survey(CASUAL, "casual");
    const expert = survey(EXPERT, "expert");

    const casualLifeRows = casual
      .flatMap((run) => run.lives.map((life) => life.bestRow));
    const casualCoins = casual.map((run) => run.coins);

    // A hesitant adult must reach zone 2-3 territory across their lives, and
    // Pip's 10-coin price must fall inside about two beginner runs.
    expect(median(casualLifeRows)).toBeGreaterThanOrEqual(12);
    expect(median(casualCoins)).toBeGreaterThanOrEqual(5);
    // The expert profile must not be tamed: mid-curve for the expert bot
    // measured 84 rows per life at s10, so a future tuning change that
    // softens it below ~70 gets flagged at review time.
    expect(median(expert.map((run) => run.lives[0]?.bestRow ?? 0)))
      .toBeGreaterThanOrEqual(70);
  });
});
