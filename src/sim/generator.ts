import { CAR_VARIANTS, MIN_CAR_GAP } from "./cars";
import {
  MIN_TRAIN_WARNING,
  carGapAt,
  carSpeedAt,
  difficultyForScore,
  lerp,
  logSpeedAt,
  trainWarningAt,
} from "./difficulty";
import {
  MAX_LOG_SPEED,
  MIN_LOG_SPEED,
  createLogLengths,
  logCentreInChain,
  logSpeedNear,
  wrapLogX,
} from "./logs";
import { clamp, intRange, range, substream, type Rng } from "./rng";
import {
  type CoinSpec,
  type LaneSpec,
  type Prop,
  type RailSpec,
  type RiverSpec,
  type RowKind,
  type WorldRow,
} from "./types";

/** Chunks are 8-12 rows; this is the visual "beat" of the world. */
export const CHUNK_MIN_ROWS = 8;
export const CHUNK_MAX_ROWS = 12;
/** The first rows are always plain grass. The renderer needs some behind too. */
export const SAFE_START_ROWS = 6;

/** Independent RNG streams. Never share a stream between unrelated systems. */
const STREAM_LAYOUT = 1;
const STREAM_DECORATION = 2;
/** Coins have their own stream so tuning pickups cannot move a road. */
const STREAM_COINS = 3;

/** Chance that a grass row starts a short coin trail. */
const COIN_TRAIL_CHANCE = 0.13;
/** Chance that a river row puts one coin on a wide log. */
const COIN_ON_LOG_CHANCE = 0.16;
/** A short trail teaches the rule on the first run. */
const FIRST_COIN_ROW = 1;
const FIRST_COIN_TRAIL = 3;

export interface WorldGenerator {
  seed: number;
  /** Depth of the next row to generate. Always increases. */
  nextZ: number;
  /** Row layout: chunk order, lane data and log chains. */
  layout: Rng;
  /** Cosmetic props only, so changing them cannot move a road. */
  decoration: Rng;
  /** Pickups only, so tuning the economy cannot move a road either. */
  coins: Rng;
  /** Column of the trail in progress, or null when no trail is running. */
  coinTrailX: number | null;
  /** Coins still to place in the current trail. */
  coinTrailLeft: number;
  /** Last generated row kind (used for the safe landing strip). */
  lastKind: RowKind;
  /** Last chunk feature (used to vary consecutive chunks). */
  lastFeature: RowKind;
}

export function createWorldGenerator(seed: number, startZ: number): WorldGenerator {
  return {
    seed,
    nextZ: startZ,
    layout: substream(seed, STREAM_LAYOUT),
    decoration: substream(seed, STREAM_DECORATION),
    coins: substream(seed, STREAM_COINS),
    coinTrailX: null,
    coinTrailLeft: 0,
    lastKind: "grass",
    lastFeature: "grass",
  };
}

/**
 * Generate every row up to and including `untilZ`, appending to `out` in
 * ascending order. Chunk generation may overshoot by a few rows; that is fine
 * and keeps the RNG sequence stable no matter when the player asks for more.
 */
export function generateRows(
  gen: WorldGenerator,
  untilZ: number,
  out: WorldRow[],
): void {
  let guard = 0;

  while (gen.nextZ <= untilZ) {
    generateOne(gen, out);
    guard += 1;

    if (guard > 10_000) {
      throw new Error("World generator failed to advance");
    }
  }
}

function generateOne(gen: WorldGenerator, out: WorldRow[]): void {
  if (gen.nextZ < SAFE_START_ROWS) {
    addRow(gen, out, "grass");
    return;
  }

  const difficulty = difficultyForScore(gen.nextZ);
  // The first chunk after the safe opening is a short road, so the player
  // meets traffic before the generator starts rolling the dice.
  const firstFeature = gen.nextZ === SAFE_START_ROWS;
  const kind = firstFeature ? "road" : pickChunkKind(gen, difficulty);
  const length = chunkLength(gen.layout, difficulty);
  gen.lastFeature = kind;

  if (kind === "grass") {
    for (let i = 0; i < length; i += 1) {
      addRow(gen, out, "grass");
    }
    return;
  }

  if (kind === "road") {
    const laneCount = firstFeature ? 2 : roadLaneCount(gen.layout, difficulty);
    let dir: 1 | -1 = gen.layout() < 0.5 ? 1 : -1;

    for (let i = 0; i < laneCount; i += 1) {
      addRow(gen, out, "road", { lane: makeLane(gen.layout, difficulty, dir) });
      dir = dir === 1 ? -1 : 1;
    }

    // A grass pad closes every road chunk, so the player always has a breath.
    padWithGrass(gen, out, length - laneCount);
    return;
  }

  if (kind === "river") {
    const width = riverWidth(gen.layout, difficulty);

    for (let i = 0; i < width; i += 1) {
      addRow(gen, out, "river", {
        river: makeRiver(gen.layout, difficulty),
      });
    }

    // Hard rule: the row immediately after a river is safe grass.
    addRow(gen, out, "grass");
    padWithGrass(gen, out, length - width - 1);
    return;
  }

  // Rail: one or two tracks, each with its own warning/crossing timetable.
  const rails = intRange(gen.layout, 1, 2);
  for (let i = 0; i < rails; i += 1) {
    addRow(gen, out, "rail", { rail: makeRail(gen.layout, difficulty) });
  }
  padWithGrass(gen, out, length - rails);
}

function padWithGrass(gen: WorldGenerator, out: WorldRow[], count: number): void {
  for (let i = 0; i < count; i += 1) {
    addRow(gen, out, "grass");
  }
}

function addRow(
  gen: WorldGenerator,
  out: WorldRow[],
  kind: RowKind,
  options: {
    lane?: LaneSpec;
    river?: RiverSpec;
    rail?: RailSpec;
    props?: Prop[];
  } = {},
): void {
  const row: WorldRow = {
    z: gen.nextZ,
    kind,
    variant: Math.abs(gen.nextZ) % 2,
    props: options.props ?? [],
  };

  if (options.lane) {
    row.lane = options.lane;
  }
  if (options.river) {
    row.river = options.river;
  }
  if (options.rail) {
    row.rail = options.rail;
  }

  if (kind === "grass") {
    decorate(gen, row);
    addGrassCoin(gen, row);
  } else if (kind === "river") {
    addRiverCoin(gen, row);
  } else {
    // A trail is a readable line; never jump it across traffic or water.
    gen.coinTrailLeft = 0;
    gen.coinTrailX = null;
  }

  out.push(row);
  gen.nextZ += 1;
  gen.lastKind = kind;
}

function chunkLength(rng: Rng, difficulty: number): number {
  const min = Math.round(lerp(9, CHUNK_MIN_ROWS, difficulty));
  const max = Math.round(lerp(CHUNK_MAX_ROWS, 10, difficulty));
  return intRange(rng, min, max);
}

function roadLaneCount(rng: Rng, difficulty: number): number {
  // 1-2 lanes early, up to 4 at the cap.
  const maxLanes = 1 + Math.floor(1 + difficulty * 2);
  return intRange(rng, 1, maxLanes);
}

function riverWidth(rng: Rng, difficulty: number): number {
  // 1 row early; up to 3 rows at the cap.
  return intRange(rng, 1, 1 + Math.round(difficulty * 2));
}

function pickChunkKind(gen: WorldGenerator, difficulty: number): RowKind {
  // Keep the start calm: the first post-safe chunk is grass or a short road.
  const railWeight = gen.nextZ >= 12 ? 0.9 + difficulty * 0.5 : 0;
  const entries: Array<{ kind: RowKind; weight: number }> = [
    { kind: "grass", weight: 2.6 - difficulty * 1.2 },
    { kind: "road", weight: 2.6 + difficulty * 1.4 },
    { kind: "river", weight: 1.1 + difficulty * 0.9 },
    { kind: "rail", weight: railWeight },
  ];

  for (const entry of entries) {
    if (entry.kind === gen.lastFeature) {
      // Repeat features are possible but rare, so the world keeps a rhythm.
      entry.weight *= 0.4;
    }
  }

  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = gen.layout() * total;

  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.kind;
    }
  }

  return "grass";
}

function makeLane(rng: Rng, difficulty: number, dir: 1 | -1): LaneSpec {
  const speed = clamp(
    range(rng, carSpeedAt(difficulty) - 0.25, carSpeedAt(difficulty) + 0.25),
    1.3,
    4.4,
  );
  const gap = clamp(
    range(rng, carGapAt(difficulty) - 0.4, carGapAt(difficulty) + 0.4),
    MIN_CAR_GAP,
    7,
  );

  return {
    dir,
    speed,
    gap,
    phase: rng(),
    variant: intRange(rng, 0, CAR_VARIANTS - 1),
  };
}

/**
 * One river row's current and chain. The chain tiles the whole wrap circle
 * with zero gaps, so every column has a log under it at every instant. Session
 * 3's "cover every tile centre" invariant survives the move to moving logs.
 */
function makeRiver(rng: Rng, difficulty: number): RiverSpec {
  const target = logSpeedAt(difficulty);
  const speed = clamp(logSpeedNear(rng, target), MIN_LOG_SPEED, MAX_LOG_SPEED);

  return {
    dir: rng() < 0.5 ? 1 : -1,
    speed,
    offset: rng(),
    lengths: createLogLengths(rng, difficulty),
  };
}

/**
 * One rail row's timetable. The warning duration always satisfies the spec
 * floor; speed and length stay inside the train envelope from the spec.
 */
function makeRail(rng: Rng, difficulty: number): RailSpec {
  return {
    dir: rng() < 0.5 ? 1 : -1,
    speed: range(rng, 8, 12),
    length: intRange(rng, 12, 20),
    warnSeconds: Math.max(MIN_TRAIN_WARNING, trainWarningAt(difficulty)),
    cooldownSeconds: range(rng, 1.8, 2.8),
    offset: rng(),
  };
}

/**
 * Coins on grass. A trail continues down the same column on the next grass
 * row, so it reads as one line instead of scattered dots. Trails never jump a
 * hazard because the caller clears the trail on non-grass rows.
 */
function addGrassCoin(gen: WorldGenerator, row: WorldRow): void {
  if (row.z < 0) {
    return;
  }

  if (row.z === FIRST_COIN_ROW) {
    gen.coinTrailX = 0;
    gen.coinTrailLeft = FIRST_COIN_TRAIL;
  }

  if (gen.coinTrailX !== null && gen.coinTrailLeft > 0) {
    pushCoin(row, { x: gen.coinTrailX });
    gen.coinTrailLeft -= 1;

    if (gen.coinTrailLeft === 0) {
      gen.coinTrailX = null;
    }

    return;
  }

  if (gen.coins() >= COIN_TRAIL_CHANCE) {
    return;
  }

  const x = intRange(gen.coins, -3, 3);
  const total = intRange(gen.coins, 2, 3);
  pushCoin(row, { x });
  gen.coinTrailX = x;
  gen.coinTrailLeft = total - 1;
}

/**
 * One coin on a wide log. Logs of three or four tiles are the only ones that
 * can hold a pickup comfortably; short late-game logs are left bare.
 */
function addRiverCoin(gen: WorldGenerator, row: WorldRow): void {
  const river = row.river;

  if (!river || gen.coins() >= COIN_ON_LOG_CHANCE) {
    return;
  }

  const wide: Array<{ index: number; length: number }> = [];

  for (let index = 0; index < river.lengths.length; index += 1) {
    const length = river.lengths[index] ?? 1;

    if (length >= 3) {
      wide.push({ index, length });
    }
  }

  if (wide.length === 0) {
    return;
  }

  const pick = wide[intRange(gen.coins, 0, wide.length - 1)];

  if (!pick) {
    return;
  }

  const limit = pick.length / 2 - 0.5;
  const logOffset = range(gen.coins, -limit, limit);

  row.coins = [
    {
      x: wrapLogX(logCentreInChain(river, pick.index) + logOffset),
      logIndex: pick.index,
      logOffset,
    },
  ];
}

function pushCoin(row: WorldRow, coin: CoinSpec): void {
  if (!row.coins) {
    row.coins = [];
  }

  row.coins.push(coin);
}

/**
 * Trees, rocks, bushes and flowers stay off the playable strip for now. The
 * strip's tiles span x = -4.5..4.5; every decorated prop is at |x| >= 4.9.
 * Session 4 owns the decision about blocking obstacles, so this session adds
 * no new collision rule.
 */
function decorate(gen: WorldGenerator, row: WorldRow): void {
  const rng = gen.decoration;
  const nearStart = row.z <= SAFE_START_ROWS;
  const roll = rng();

  if (!nearStart && roll > 0.6) {
    return;
  }

  const side = rng() < 0.5 ? -1 : 1;
  const rollProp = rng();

  if (rollProp < 0.42) {
    row.props.push({
      kind: "tree",
      x: side * range(rng, 5.2, 6.4),
      variant: intRange(rng, 0, 4),
    });
  } else if (rollProp < 0.64) {
    row.props.push({ kind: "bush", x: side * range(rng, 4.9, 5.7) });
  } else if (rollProp < 0.8) {
    row.props.push({ kind: "rock", x: side * range(rng, 4.9, 5.8) });
  }

  if (rng() < 0.55) {
    row.props.push({
      kind: "flower",
      x: -side * range(rng, 4.9, 5.8),
      variant: intRange(rng, 0, 2),
    });
  }

  if (rng() < 0.22) {
    row.props.push({
      kind: "flower",
      x: side * range(rng, 4.9, 5.8),
      variant: intRange(rng, 0, 2),
    });
  }
}
