import { describe, expect, it } from "vitest";
import { intRange, mulberry32, pick, substream } from "../src/sim/rng";

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const a = Array.from({ length: 16 }, () => first());
    const b = Array.from({ length: 16 }, () => second());

    expect(a).toEqual(b);
  });

  it("produces different streams for different seeds", () => {
    const first = mulberry32(1);
    const second = mulberry32(2);

    expect(first()).not.toBe(second());
  });

  it("stays inside [0, 1)", () => {
    const rng = mulberry32(7);

    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("picks a value from the supplied list", () => {
    const rng = mulberry32(3);
    const value = pick(rng, ["a", "b", "c"] as const);

    expect(["a", "b", "c"]).toContain(value);
  });

  it("throws when picking from an empty list", () => {
    const rng = mulberry32(3);

    expect(() => pick(rng, [])).toThrow(/at least one item/);
  });

  it("keeps integer ranges inclusive", () => {
    const rng = mulberry32(11);

    for (let i = 0; i < 500; i += 1) {
      const value = intRange(rng, 2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(5);
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe("substreams", () => {
  it("is deterministic for a seed and stream id", () => {
    const first = substream(77, 1);
    const second = substream(77, 1);

    expect(Array.from({ length: 8 }, () => first())).toEqual(
      Array.from({ length: 8 }, () => second()),
    );
  });

  it("gives unrelated streams for different ids and seeds", () => {
    const layout = substream(77, 1)();
    const decoration = substream(77, 2)();
    const otherSeed = substream(78, 1)();

    expect(layout).not.toBe(decoration);
    expect(layout).not.toBe(otherSeed);
  });
});
