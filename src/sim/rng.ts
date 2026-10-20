/**
 * Small, fast, seeded random number generator.
 *
 * Keeping this pure and deterministic means a seed can reproduce a whole run,
 * which is invaluable when a player reports "the impossible bit at row 63".
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("pick() needs at least one item");
  }
  return items[Math.floor(rng() * items.length)]!;
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function intRange(rng: Rng, min: number, max: number): number {
  return Math.floor(range(rng, min, max + 1));
}

/**
 * Derive an independent stream from a run seed.
 *
 * Layout, decoration and (later) coins each own a substream so adding a
 * flower can never move a road, and a cosmetic tweak cannot change the world.
 * The mixer is a small integer hash; streams for different ids are unrelated
 * but reproducible.
 */
export function substream(seed: number, stream: number): Rng {
  let h = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return mulberry32((h ^ (h >>> 16)) >>> 0);
}

/** Clamp helper shared by RNG-driven tuning. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
