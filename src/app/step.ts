import { advance } from "../sim/game";
import type { GameState } from "../sim/types";

export const FIXED_STEP = 1 / 60;
export const MAX_STEPS = 6;

export interface StepResult {
  accumulator: number;
  steps: number;
}

/**
 * Consume elapsed wall time into fixed simulation steps.
 *
 * Pausing drops the accumulator instead of carrying it: a pause of ten seconds
 * must not become one giant catch-up step when the player resumes. The loop
 * uses the same rule, and this function keeps it testable in Node.
 */
export function advanceFixed(
  state: GameState,
  accumulator: number,
  elapsedSeconds: number,
  paused: boolean,
): StepResult {
  if (paused) {
    return { accumulator: 0, steps: 0 };
  }

  let remaining = accumulator + Math.max(0, elapsedSeconds);
  let steps = 0;

  while (remaining >= FIXED_STEP && steps < MAX_STEPS) {
    advance(state, FIXED_STEP);
    remaining -= FIXED_STEP;
    steps += 1;
  }

  return { accumulator: remaining, steps };
}
