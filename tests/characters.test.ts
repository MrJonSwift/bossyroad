import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../src/characters/catalogue";
import { characterBoxes } from "../src/characters/models";

describe("character models", () => {
  it("builds a valid box list for every character", () => {
    for (const character of CHARACTERS) {
      const boxes = characterBoxes(character.id);

      expect(boxes.length).toBeGreaterThan(8);

      for (const box of boxes) {
        expect(Number.isFinite(box.x)).toBe(true);
        expect(Number.isFinite(box.y)).toBe(true);
        expect(Number.isFinite(box.z)).toBe(true);
        expect(box.w).toBeGreaterThan(0);
        expect(box.h).toBeGreaterThan(0);
        expect(box.d).toBeGreaterThan(0);
        expect(Number.isInteger(box.color)).toBe(true);
        expect(box.color).toBeGreaterThanOrEqual(0);
        expect(box.color).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it("gives each character its own silhouette", () => {
    const signatures = CHARACTERS.map((character) =>
      JSON.stringify(characterBoxes(character.id)),
    );

    expect(new Set(signatures).size).toBe(CHARACTERS.length);
  });

  it("keeps the cast on a similar scale so none reads as a giant", () => {
    const heights = CHARACTERS.map((character) => {
      const boxes = characterBoxes(character.id);
      return Math.max(...boxes.map((box) => box.y + box.h / 2));
    });

    expect(Math.max(...heights)).toBeLessThan(1.5);
    expect(Math.min(...heights)).toBeGreaterThan(0.7);
  });
});
