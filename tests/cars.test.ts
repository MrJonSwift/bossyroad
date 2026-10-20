import { describe, expect, it } from "vitest";
import {
  CAR_DEPTH,
  CAR_LENGTH,
  CAR_WRAP,
  MIN_CAR_GAP,
  advanceCars,
  carHitsPlayer,
  createLaneCars,
  laneCarCount,
  laneFreeGap,
  laneSpacing,
} from "../src/sim/cars";
import type { CarState, LaneSpec } from "../src/sim/types";

function lane(overrides: Partial<LaneSpec> = {}): LaneSpec {
  return {
    dir: 1,
    speed: 2,
    gap: 3,
    phase: 0.25,
    variant: 0,
    ...overrides,
  };
}

describe("lane car layout", () => {
  it("derives a count whose centre spacing leaves the requested free gap", () => {
    for (const gap of [2.2, 3, 4.5, 6.5]) {
      const spec = lane({ gap });
      const spacing = laneSpacing(spec);

      expect(laneCarCount(spec)).toBeGreaterThanOrEqual(1);
      expect(spacing - CAR_LENGTH).toBeGreaterThanOrEqual(gap - 1e-9);
      expect(laneFreeGap(spec)).toBeCloseTo(spacing - CAR_LENGTH);
    }
  });

  it("never packs cars closer than the fair-play floor", () => {
    const spec = lane({ gap: 0 });
    expect(laneFreeGap(spec)).toBeGreaterThanOrEqual(MIN_CAR_GAP - 1e-9);
  });

  it("builds cars evenly around the wrap circle, including the seam", () => {
    const spec = lane({ gap: 3.5, phase: 0.4 });
    const cars = createLaneCars(7, spec);
    const xs = cars.map((car) => car.x).sort((a, b) => a - b);

    expect(cars).toHaveLength(laneCarCount(spec));

    for (let i = 1; i < xs.length; i += 1) {
      const gap = (xs[i] ?? 0) - (xs[i - 1] ?? 0);
      expect(gap).toBeCloseTo(laneSpacing(spec));
    }

    const seam = (xs[0] ?? 0) + CAR_WRAP * 2 - (xs.at(-1) ?? 0);
    expect(seam).toBeCloseTo(laneSpacing(spec));
  });

  it("gives every car a lane row, direction, speed and palette variant", () => {
    const spec = lane({ dir: -1, speed: 3.1, variant: 3 });
    const cars = createLaneCars(-2, spec);

    for (const car of cars) {
      expect(car.z).toBe(-2);
      expect(car.dir).toBe(-1);
      expect(car.speed).toBe(3.1);
      expect(car.length).toBe(CAR_LENGTH);
      expect(car.variant).toBeGreaterThanOrEqual(0);
      expect(car.variant).toBeLessThan(5);
    }

    expect(new Set(cars.map((car) => car.id)).size).toBe(cars.length);
  });

  it("is deterministic for a row and lane", () => {
    expect(createLaneCars(12, lane())).toEqual(createLaneCars(12, lane()));
  });

  it("gives different depths different ids", () => {
    const first = createLaneCars(5, lane()).map((car) => car.id);
    const second = createLaneCars(6, lane()).map((car) => car.id);

    expect(first.some((id) => second.includes(id))).toBe(false);
  });
});

describe("car movement", () => {
  const specs = new Map<number, LaneSpec>([
    [3, lane({ dir: 1, speed: 2, gap: 3 })],
    [4, lane({ dir: -1, speed: 3.4, gap: 2.5, variant: 2 })],
  ]);

  function movingCars(): CarState[] {
    return [...createLaneCars(3, specs.get(3)!), ...createLaneCars(4, specs.get(4)!)];
  }

  it("moves each car at its lane speed and direction", () => {
    const cars = movingCars();
    const before = cars.map((car) => car.x);

    advanceCars(cars, 1);

    for (let i = 0; i < cars.length; i += 1) {
      const car = cars[i];
      const start = before[i] ?? 0;
      let delta = (car?.x ?? 0) - start;

      while (delta > CAR_WRAP) {
        delta -= CAR_WRAP * 2;
      }
      while (delta < -CAR_WRAP) {
        delta += CAR_WRAP * 2;
      }

      expect(delta).toBeCloseTo((car?.dir ?? 1) * (car?.speed ?? 0));
    }
  });

  it("wraps without losing cars or changing ids", () => {
    const cars = movingCars();
    const ids = cars.map((car) => car.id);

    for (let i = 0; i < 60 * 40; i += 1) {
      advanceCars(cars, 1 / 60);
    }

    expect(cars.map((car) => car.id)).toEqual(ids);

    for (const car of cars) {
      expect(car.x).toBeGreaterThanOrEqual(-CAR_WRAP);
      expect(car.x).toBeLessThanOrEqual(CAR_WRAP);
    }
  });

  it("keeps generated gaps intact after wrapping for a long time", () => {
    const cars = movingCars();

    for (let i = 0; i < 60 * 60; i += 1) {
      advanceCars(cars, 1 / 60);

      for (const [z, spec] of specs) {
        const spacing = laneSpacing(spec);
        const xs = cars
          .filter((car) => car.z === z)
          .map((car) => car.x)
          .sort((a, b) => a - b);

        for (let j = 1; j < xs.length; j += 1) {
          expect((xs[j] ?? 0) - (xs[j - 1] ?? 0)).toBeCloseTo(spacing, 6);
        }

        const seam = (xs[0] ?? 0) + CAR_WRAP * 2 - (xs.at(-1) ?? 0);
        expect(seam).toBeCloseTo(spacing, 6);
      }
    }
  });
});

describe("car collision box", () => {
  const car: CarState = {
    id: 0,
    z: 0,
    x: 0,
    dir: 1,
    speed: 0,
    length: CAR_LENGTH,
    variant: 0,
  };

  it("hits a player inside the car footprint", () => {
    expect(carHitsPlayer([car], 0, 0)).toBe(true);
    expect(carHitsPlayer([car], 0.9, 0)).toBe(true);
    expect(carHitsPlayer([car], 0, CAR_DEPTH / 2 + 0.2)).toBe(true);
  });

  it("forgives near misses on both axes", () => {
    expect(carHitsPlayer([car], 1.0, 0)).toBe(false);
    expect(carHitsPlayer([car], 0, CAR_DEPTH / 2 + 0.26)).toBe(false);
    expect(carHitsPlayer([car], 0, 1)).toBe(false);
  });

  it("ignores cars in other lanes", () => {
    expect(carHitsPlayer([{ ...car, z: 4 }], 0, 0)).toBe(false);
  });
});
