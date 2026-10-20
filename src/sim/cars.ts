import type { CarState, LaneSpec } from "./types";

/** Footprint along x. The model is 1.62 wide, so this is slightly forgiving. */
export const CAR_LENGTH = 1.5;
/** Footprint along z. */
export const CAR_DEPTH = 0.7;
/** Cars wrap this far outside the nine-tile strip, hidden by the camera. */
export const CAR_WRAP = 9;
/** Smallest free gap between two car boxes. Player width is 0.44. */
export const MIN_CAR_GAP = 2.2;
/** Car palette size; mirrors the render model colours. */
export const CAR_VARIANTS = 5;

/**
 * A lane's cars are spread evenly around the wrap circle. With an even count
 * the seam gap equals every other gap, so a generated lane can never contain a
 * wall of cars: free space is always at least `MIN_CAR_GAP`.
 */
export function laneCarCount(lane: LaneSpec): number {
  const spacing = CAR_LENGTH + Math.max(MIN_CAR_GAP, lane.gap);
  return Math.max(1, Math.floor((CAR_WRAP * 2) / spacing));
}

/** Centre-to-centre distance between cars in a lane. */
export function laneSpacing(lane: LaneSpec): number {
  return (CAR_WRAP * 2) / laneCarCount(lane);
}

/** Free space between car boxes in a lane, after rounding to a whole count. */
export function laneFreeGap(lane: LaneSpec): number {
  return laneSpacing(lane) - CAR_LENGTH;
}

/**
 * Build the cars for one generated road row. Ids are derived from the row, so
 * a row keeps the same cars while it lives and recycling can drop them
 * wholesale without leaking ids.
 */
export function createLaneCars(z: number, lane: LaneSpec): CarState[] {
  const count = laneCarCount(lane);
  const spacing = (CAR_WRAP * 2) / count;
  const cars: CarState[] = [];

  for (let i = 0; i < count; i += 1) {
    const offset = ((i + lane.phase) % count) * spacing;

    cars.push({
      id: z * 1000 + i,
      z,
      x: -CAR_WRAP + offset,
      dir: lane.dir,
      speed: lane.speed,
      length: CAR_LENGTH,
      variant: (lane.variant + i) % CAR_VARIANTS,
    });
  }

  return cars;
}

export function advanceCars(cars: CarState[], dt: number): void {
  for (const car of cars) {
    car.x += car.dir * car.speed * dt;

    // Wrap on the centre, not on the box edge. Keeping the circle exactly
    // 2 * CAR_WRAP wide preserves the generated gaps forever; wrapping on the
    // edge would slowly shift the spacing and could close a fair gap.
    if (car.x >= CAR_WRAP) {
      car.x -= CAR_WRAP * 2;
    } else if (car.x <= -CAR_WRAP) {
      car.x += CAR_WRAP * 2;
    }
  }
}

/**
 * A forgiving player box. The chicken is about 0.55 tiles wide; shrinking the
 * test box to 0.44 makes near misses feel kind without letting real contact
 * slip through. Cars move at most 0.07 tiles per fixed step, so the boxes
 * cannot tunnel through each other at 60 Hz.
 */
export const PLAYER_HITBOX_HALF_X = 0.22;
export const PLAYER_HITBOX_HALF_Z = 0.24;

export function carHitsPlayer(
  cars: readonly CarState[],
  x: number,
  z: number,
): boolean {
  for (const car of cars) {
    if (
      Math.abs(car.x - x) < car.length / 2 + PLAYER_HITBOX_HALF_X &&
      Math.abs(car.z - z) < CAR_DEPTH / 2 + PLAYER_HITBOX_HALF_Z
    ) {
      return true;
    }
  }

  return false;
}
