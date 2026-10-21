import { describe, expect, it } from "vitest";
import { createWorldGenerator, generateRows } from "../src/sim/generator";
import { WORLD_START_Z } from "../src/sim/world";
import {
  ZONE_ROWS,
  isZoneBoundary,
  zoneIndex,
  zoneLabel,
  zoneStart,
} from "../src/sim/zones";
import type { WorldRow } from "../src/sim/types";

describe("zone maths", () => {
  it("groups rows into fixed ten-row zones", () => {
    expect(ZONE_ROWS).toBe(10);
    expect(zoneIndex(0)).toBe(0);
    expect(zoneIndex(9)).toBe(0);
    expect(zoneIndex(10)).toBe(1);
    expect(zoneIndex(82)).toBe(8);
    expect(zoneIndex(99)).toBe(9);
    expect(zoneIndex(100)).toBe(10);
  });

  it("gives the first row of every zone as its start", () => {
    expect(zoneStart(0)).toBe(0);
    expect(zoneStart(7)).toBe(0);
    expect(zoneStart(12)).toBe(10);
    expect(zoneStart(82)).toBe(80);
  });

  it("marks exactly the first row of every zone past the start", () => {
    expect(isZoneBoundary(0)).toBe(false);
    expect(isZoneBoundary(1)).toBe(false);
    expect(isZoneBoundary(9)).toBe(false);
    expect(isZoneBoundary(10)).toBe(true);
    expect(isZoneBoundary(20)).toBe(true);
    expect(isZoneBoundary(18)).toBe(false);
    expect(isZoneBoundary(-10)).toBe(false);
  });

  it("labels zones for people, starting at one", () => {
    expect(zoneLabel(0)).toBe("ZONE 1");
    expect(zoneLabel(19)).toBe("ZONE 2");
    expect(zoneLabel(82)).toBe("ZONE 9");
  });
});

/**
 * Boundary fairness needs many seeds, not one lucky layout: every seed
 * guarantees the checkpoint row is the same safe grass as a river's landing
 * strip, with no moving hazard of any kind.
 */
function generateWorlds(): WorldRow[][] {
  return Array.from({ length: 32 }, (_, i) => {
    const generator = createWorldGenerator(i + 1, WORLD_START_Z);
    const rows: WorldRow[] = [];
    generateRows(generator, 400, rows);
    return rows;
  });
}

describe("zone boundaries are always safe grass", () => {
  const worlds = generateWorlds();

  it("has boundary rows worth checking at every depth", () => {
    for (const rows of worlds) {
      for (let z = 10; z <= 400; z += ZONE_ROWS) {
        expect(rows.find((row) => row.z === z), `row ${z}`).toBeDefined();
      }
    }
  });

  it("never puts a road, river or rail on a boundary row", () => {
    for (const rows of worlds) {
      for (let z = 10; z <= 400; z += ZONE_ROWS) {
        const row = rows.find((candidate) => candidate.z === z);
        expect(row, `boundary row ${z}`).toBeDefined();
        expect(row?.kind, `boundary row ${z}`).toBe("grass");
        expect(row?.lane, `lane on boundary ${z}`).toBeUndefined();
        expect(row?.river, `river on boundary ${z}`).toBeUndefined();
        expect(row?.rail, `rail on boundary ${z}`).toBeUndefined();
      }
    }
  });

  it("keeps every boundary row free of props inside the strip", () => {
    for (const rows of worlds) {
      for (let z = 10; z <= 400; z += ZONE_ROWS) {
        const row = rows.find((candidate) => candidate.z === z);

        for (const prop of row?.props ?? []) {
          expect(
            Math.abs(prop.x),
            `prop ${prop.kind} on boundary ${z}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("still follows the safe row after every river", () => {
    const rows = worlds[0] ?? [];
    let inRiver = false;

    for (const row of rows) {
      if (row.kind === "river") {
        inRiver = true;
        continue;
      }

      if (inRiver) {
        expect(row.kind, `after river at z=${row.z}`).toBe("grass");
        inRiver = false;
      }
    }
  });
});
