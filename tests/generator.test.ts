import { describe, expect, it } from "vitest";
import {
  CAR_LENGTH,
  MIN_CAR_GAP,
  createLaneCars,
  laneCarCount,
  laneFreeGap,
} from "../src/sim/cars";
import {
  carGapAt,
  carSpeedAt,
  difficultyForScore,
  logRunAt,
  logSpeedAt,
  trainWarningAt,
} from "../src/sim/difficulty";
import {
  SAFE_START_ROWS,
  createWorldGenerator,
  generateRows,
} from "../src/sim/generator";
import {
  LOG_CHAIN_WIDTH,
  advanceLogs,
  createRiverLogs,
  hasLogCover,
  wrappedLogDelta,
} from "../src/sim/logs";
import { trainCrossSeconds } from "../src/sim/rails";
import { WORLD_START_Z } from "../src/sim/world";
import type { WorldRow } from "../src/sim/types";

function generate(seed: number, untilZ = 600): WorldRow[] {
  const generator = createWorldGenerator(seed, WORLD_START_Z);
  const rows: WorldRow[] = [];

  generateRows(generator, untilZ, rows);
  return rows;
}

function riverRuns(rows: readonly WorldRow[]): WorldRow[][] {
  const runs: WorldRow[][] = [];
  let run: WorldRow[] = [];

  for (const row of rows) {
    if (row.kind === "river") {
      run.push(row);
    } else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }

  if (run.length > 0) {
    runs.push(run);
  }

  return runs;
}

describe("endless generator", () => {
  const rows = generate(1234);

  it("is deterministic for a seed", () => {
    expect(generate(1234)).toEqual(rows);
  });

  it("gives different seeds different worlds", () => {
    expect(generate(99)).not.toEqual(rows);
  });

  it("produces one row per depth, in ascending order", () => {
    const depths = rows.map((row) => row.z);

    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    expect(new Set(depths).size).toBe(depths.length);
    expect(depths[0]).toBe(WORLD_START_Z);
  });

  it("keeps the opening rows safe grass", () => {
    for (let z = 0; z < SAFE_START_ROWS; z += 1) {
      expect(rows.find((row) => row.z === z)?.kind, `row ${z}`).toBe("grass");
    }

    expect(rows.find((row) => row.kind === "road")?.z).toBeGreaterThanOrEqual(
      SAFE_START_ROWS,
    );
    expect(rows.find((row) => row.kind === "river")?.z).toBeGreaterThanOrEqual(
      SAFE_START_ROWS,
    );
  });

  it("keeps contiguous road runs within the four-lane limit", () => {
    let run = 0;
    for (const row of rows) {
      run = row.kind === "road" ? run + 1 : 0;
      expect(run, `road run at z=${row.z}`).toBeLessThanOrEqual(4);
    }
  });
});

describe("generated lanes", () => {
  const rows = generate(2026);

  it("gives every road row a complete lane", () => {
    for (const row of rows) {
      if (row.kind !== "road") {
        expect(row.lane, `non-road lane at z=${row.z}`).toBeUndefined();
        continue;
      }

      const lane = row.lane;
      expect(lane, `missing lane at z=${row.z}`).toBeDefined();
      expect(lane?.dir === 1 || lane?.dir === -1).toBe(true);
      expect(lane?.speed).toBeGreaterThanOrEqual(1.3);
      expect(lane?.speed).toBeLessThanOrEqual(4.4);
      expect(lane?.gap).toBeGreaterThanOrEqual(MIN_CAR_GAP);
      expect(lane?.phase).toBeGreaterThanOrEqual(0);
      expect(lane?.phase).toBeLessThan(1);
    }
  });

  it("never builds a wall of cars in a lane", () => {
    for (const row of rows) {
      if (!row.lane) {
        continue;
      }

      expect(laneFreeGap(row.lane)).toBeGreaterThanOrEqual(MIN_CAR_GAP);
      const cars = createLaneCars(row.z, row.lane).sort((a, b) => a.x - b.x);

      for (let i = 1; i < cars.length; i += 1) {
        const gap = (cars[i]?.x ?? 0) - (cars[i - 1]?.x ?? 0) - CAR_LENGTH;
        expect(gap, `gap at z=${row.z}`).toBeGreaterThanOrEqual(MIN_CAR_GAP - 1e-9);
      }
    }
  });

  it("varies direction, speed, spacing and car count between lanes", () => {
    const lanes = rows.flatMap((row) => (row.lane ? [row.lane] : []));

    expect(new Set(lanes.map((lane) => lane.dir))).toEqual(new Set([1, -1]));
    expect(new Set(lanes.map((lane) => lane.speed.toFixed(2))).size).toBeGreaterThan(3);
    expect(new Set(lanes.map((lane) => lane.gap.toFixed(2))).size).toBeGreaterThan(3);
    expect(new Set(lanes.map((lane) => laneCarCount(lane))).size).toBeGreaterThan(1);
  });

  it("keeps early roads at one or two lanes and opens up later", () => {
    let run = 0;
    for (const row of rows) {
      run = row.kind === "road" ? run + 1 : 0;
      if (row.z < 40) {
        expect(run, `early road run at z=${row.z}`).toBeLessThanOrEqual(2);
      }
    }

    let longest = 0;
    let current = 0;
    for (const row of rows) {
      if (row.z >= 120 && row.kind === "road") {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }

    expect(longest).toBeLessThanOrEqual(4);
  });
});

describe("river log chains", () => {
  const rows = generate(7);
  const runs = riverRuns(rows);

  it("has rivers to inspect", () => {
    expect(runs.length).toBeGreaterThan(3);
  });

  it("gives every river row a moving spec and no static log props", () => {
    for (const row of rows) {
      if (row.kind === "river") {
        expect(row.river, `missing river spec at z=${row.z}`).toBeDefined();
        expect(row.props).toEqual([]);
      } else {
        expect(row.river, `river spec on ${row.kind} at z=${row.z}`).toBeUndefined();
      }
    }
  });

  it("tiles the wrap circle with 1-4 tile logs and no gaps", () => {
    for (const row of rows.filter((row) => row.kind === "river")) {
      const spec = row.river;
      expect(spec).toBeDefined();
      if (!spec) {
        continue;
      }

      expect(spec.lengths.reduce((sum, length) => sum + length, 0)).toBe(
        LOG_CHAIN_WIDTH,
      );
      expect(spec.lengths.every((length) => length >= 1)).toBe(true);

      const maxRun = logRunAt(difficultyForScore(row.z));
      expect(Math.max(...spec.lengths)).toBeLessThanOrEqual(maxRun);

      const logs = createRiverLogs(row.z, spec).sort((a, b) => a.x - b.x);
      const segments = logs.map((log) => ({
        left: log.x - log.length / 2,
        right: log.x + log.length / 2,
      }));

      for (let i = 1; i < segments.length; i += 1) {
        expect(
          (segments[i]?.left ?? 0) - (segments[i - 1]?.right ?? 0),
          `river z=${row.z} log ${i}`,
        ).toBeCloseTo(0, 9);
      }

      const seam =
        (segments[0]?.left ?? 0) + LOG_CHAIN_WIDTH - (segments.at(-1)?.right ?? 0);
      expect(seam).toBeCloseTo(0, 9);
    }
  });

  it("covers every playable tile centre while the chain moves", () => {
    for (const row of rows.filter((row) => row.kind === "river")) {
      const spec = row.river;
      expect(spec).toBeDefined();
      if (!spec) {
        continue;
      }

      const logs = createRiverLogs(row.z, spec);

      for (let step = 0; step < 240; step += 1) {
        advanceLogs(logs, 1 / 60);

        for (let x = -4; x <= 4; x += 1) {
          expect(
            hasLogCover(logs, row.z, x),
            `river z=${row.z} x=${x} step=${step}`,
          ).toBe(true);
        }
      }
    }
  });

  it("moves each chain at its own speed and direction", () => {
    for (const row of rows.filter((row) => row.kind === "river")) {
      const spec = row.river;
      expect(spec).toBeDefined();
      if (!spec) {
        continue;
      }

      const logs = createRiverLogs(row.z, spec);
      const log = logs[0];
      expect(log).toBeDefined();
      if (!log) {
        continue;
      }

      const before = log.x;
      advanceLogs(logs, 1);
      expect(wrappedLogDelta(before, log.x)).toBeCloseTo(spec.dir * spec.speed, 6);
      expect(spec.speed).toBeGreaterThanOrEqual(logSpeedAt(0) - 0.2 - 1e-9);
      expect(spec.speed).toBeLessThanOrEqual(logSpeedAt(1) + 0.2 + 1e-9);
    }
  });

  it("puts a safe grass row after every river", () => {
    for (const run of runs) {
      const last = run.at(-1)!;
      const next = rows.find((row) => row.z === last.z + 1);
      expect(next?.kind, `after river ending z=${last.z}`).toBe("grass");
    }
  });
});

describe("rail timetables", () => {
  const rows = generate(808);

  it("gives every rail row a warning -> crossing -> cooldown spec", () => {
    let rails = 0;

    for (const row of rows) {
      if (row.kind !== "rail") {
        expect(row.rail, `rail spec on ${row.kind} at z=${row.z}`).toBeUndefined();
        continue;
      }

      rails += 1;
      const spec = row.rail;
      expect(spec, `missing rail spec at z=${row.z}`).toBeDefined();
      if (!spec) {
        continue;
      }

      expect(spec.warnSeconds).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(spec.speed).toBeGreaterThanOrEqual(8);
      expect(spec.speed).toBeLessThanOrEqual(12);
      expect(spec.length).toBeGreaterThanOrEqual(12);
      expect(spec.length).toBeLessThanOrEqual(20);
      expect(spec.cooldownSeconds).toBeGreaterThan(0);
      expect(spec.offset).toBeGreaterThanOrEqual(0);
      expect(spec.offset).toBeLessThan(1);
      expect(trainCrossSeconds(spec.speed, spec.length)).toBeGreaterThan(0);
    }

    expect(rails).toBeGreaterThan(0);
  });
});

describe("roadside decoration", () => {
  const rows = generate(4242);

  it("keeps trees, rocks, bushes and flowers outside the play strip", () => {
    for (const row of rows) {
      for (const prop of row.props) {
        expect(Math.abs(prop.x), `${prop.kind} at z=${row.z}`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(Math.abs(prop.x)).toBeLessThan(7);
      }
    }
  });

  it("never decorates a road or rail row", () => {
    for (const row of rows) {
      if (row.kind === "road" || row.kind === "rail") {
        expect(row.props).toEqual([]);
      }
    }
  });

  it("does not add props inside a lane", () => {
    for (const row of rows.filter((row) => row.kind === "road")) {
      expect(row.props.some((prop) => Math.abs(prop.x) < 4.5)).toBe(false);
    }
  });
});

describe("difficulty curve", () => {
  it("clamps score to zero and one", () => {
    expect(difficultyForScore(-20)).toBe(0);
    expect(difficultyForScore(0)).toBe(0);
    expect(difficultyForScore(100)).toBe(1);
    expect(difficultyForScore(1000)).toBe(1);
  });

  it("sags the early ramp so the opening rows sit near minimum (ticket 10)", () => {
    expect(difficultyForScore(19)).toBeLessThanOrEqual(0.1);
    expect(difficultyForScore(40)).toBeLessThan(0.25);
    // Mid rows sit below what the old linear score/100 mapping would give.
    expect(difficultyForScore(50)).toBeLessThan(0.5);
    expect(difficultyForScore(50)).toBe(0.5 ** 1.7);
  });

  it("peaked at the cap, the envelope is byte-for-byte the shipped one", () => {
    expect(carSpeedAt(difficultyForScore(100))).toBe(4.2);
    expect(carGapAt(difficultyForScore(100))).toBeCloseTo(2.2, 10);
    expect(logRunAt(difficultyForScore(100))).toBe(2);
    expect(logSpeedAt(difficultyForScore(100))).toBeCloseTo(2.2, 10);
    expect(trainWarningAt(difficultyForScore(100))).toBeCloseTo(1.2, 10);
  });

  it("stops numeric tuning at score 100", () => {
    expect(carSpeedAt(difficultyForScore(100))).toBe(carSpeedAt(difficultyForScore(900)));
    expect(carGapAt(difficultyForScore(100))).toBe(carGapAt(difficultyForScore(900)));
    expect(trainWarningAt(difficultyForScore(100))).toBe(
      trainWarningAt(difficultyForScore(900)),
    );
  });

  it("keeps generated lanes inside the capped envelope at any depth", () => {
    const rows = generate(5150, 500);

    for (const row of rows) {
      if (!row.lane || row.z < 100) {
        continue;
      }

      expect(row.lane.speed).toBeGreaterThanOrEqual(carSpeedAt(1) - 0.25 - 1e-9);
      expect(row.lane.speed).toBeLessThanOrEqual(carSpeedAt(1) + 0.25 + 1e-9);
      expect(row.lane.gap).toBeGreaterThanOrEqual(MIN_CAR_GAP);
    }
  });
});
