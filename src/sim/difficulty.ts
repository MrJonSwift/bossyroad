/**
 * The single difficulty curve.
 *
 * Score is the row index the player has reached, so generated row `z` can use
 * its own depth as the score it is being tuned for. That keeps generation
 * deterministic: the world depends on how far it has been built, not on how
 * fast the player got there.
 *
 * Numeric tuning stops at score 100. Variety (chunk order, lane direction,
 * log patterns) keeps going because it is driven by the layout stream.
 */
export const DIFFICULTY_MAX_SCORE = 100;

export function difficultyForScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(1, Math.max(0, score / DIFFICULTY_MAX_SCORE));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Slow, readable traffic early; quick traffic at the cap. Tiles per second. */
export function carSpeedAt(difficulty: number): number {
  return lerp(1.4, 4.2, difficulty);
}

/**
 * Free space between car boxes, in tiles. Never below the fair-play floor;
 * `laneCarCount` also enforces that floor.
 */
export function carGapAt(difficulty: number): number {
  return lerp(6.5, 2.2, difficulty);
}

/** Long, forgiving logs early; short logs at the cap. */
export function logRunAt(difficulty: number): number {
  return Math.round(lerp(4, 2, difficulty));
}

/** River current: gentle early, brisk at the cap. Tiles per second. */
export function logSpeedAt(difficulty: number): number {
  return lerp(0.8, 2.2, difficulty);
}

/**
 * Hard fairness floor from the spec. `trainWarningAt(1)` is exactly 1.2 s, so
 * generation clamps against this constant rather than trusting float maths.
 */
export const MIN_TRAIN_WARNING = 1.2;

/** Train warning: generous early, but never below MIN_TRAIN_WARNING. */
export function trainWarningAt(difficulty: number): number {
  return Math.max(MIN_TRAIN_WARNING, lerp(2.0, 1.2, difficulty));
}

/** Eagle idle grace: relaxed early, still fair at the cap. */
export function eagleGraceAt(difficulty: number): number {
  return lerp(5.5, 4, difficulty);
}
