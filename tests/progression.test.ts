import { describe, expect, it } from "vitest";
import { CHARACTERS, characterById } from "../src/characters/catalogue";
import {
  nextUnlock,
  selectCharacter,
  shortfallFor,
  unlockCharacter,
  type Progression,
} from "../src/sim/progression";

const FRESH: Progression = {
  coins: 0,
  unlocked: ["bossy"],
  selected: "bossy",
};

function progress(overrides: Partial<Progression> = {}): Progression {
  return { ...FRESH, ...overrides };
}

describe("unlocking characters", () => {
  it("charges exactly the fixed catalogue price", () => {
    const result = unlockCharacter(progress({ coins: 10 }), "pip");

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.progression.coins).toBe(0);
    expect(result.progression.unlocked).toEqual(["bossy", "pip"]);
    expect(result.progression.selected).toBe("bossy");
  });

  it("keeps the paid price for every character", () => {
    for (const character of CHARACTERS) {
      const before = progress({ coins: character.price });

      if (character.price === 0) {
        continue;
      }

      const result = unlockCharacter(before, character.id);
      expect(result.ok).toBe(true);

      if (result.ok) {
        expect(result.progression.coins).toBe(0);
        expect(result.progression.unlocked).toContain(character.id);
      }
    }
  });

  it("refuses with a visible shortfall and does not mutate the input", () => {
    const before = progress({ coins: 4 });
    const result = unlockCharacter(before, "pip");

    expect(result).toEqual({ ok: false, reason: "poor", shortfall: 6 });
    expect(before.coins).toBe(4);
    expect(before.unlocked).toEqual(["bossy"]);
  });

  it("cannot charge twice for the same character", () => {
    const first = unlockCharacter(progress({ coins: 25 }), "moss");
    expect(first.ok).toBe(true);

    if (!first.ok) {
      return;
    }

    const second = unlockCharacter(first.progression, "moss");

    expect(second).toEqual({ ok: false, reason: "owned", shortfall: 0 });
    expect(first.progression.coins).toBe(0);
  });

  it("treats Bossy as already owned and unknown ids as unknown", () => {
    expect(unlockCharacter(progress({ coins: 50 }), "bossy")).toMatchObject({
      ok: false,
      reason: "owned",
    });
    expect(unlockCharacter(progress({ coins: 50 }), "dragon")).toMatchObject({
      ok: false,
      reason: "unknown",
    });
  });

  it("reports the shortfall without going negative", () => {
    expect(shortfallFor(progress({ coins: 0 }), "king-cluck")).toBe(260);
    expect(shortfallFor(progress({ coins: 200 }), "king-cluck")).toBe(60);
    expect(shortfallFor(progress({ coins: 2000 }), "king-cluck")).toBe(0);
    expect(shortfallFor(progress({ coins: 2000 }), "bossy")).toBe(0);
  });

  it("suggests the cheapest locked character", () => {
    expect(nextUnlock(progress())?.id).toBe("pip");
    expect(
      nextUnlock(progress({ unlocked: ["bossy", "pip"] }))?.id,
    ).toBe("moss");
    expect(
      nextUnlock(progress({ unlocked: CHARACTERS.map((character) => character.id) })),
    ).toBeNull();
  });
});

describe("equipping characters", () => {
  it("equips an owned character", () => {
    const next = selectCharacter(
      progress({ unlocked: ["bossy", "pip"] }),
      "pip",
    );

    expect(next?.selected).toBe("pip");
  });

  it("cannot equip a locked or unknown character", () => {
    expect(selectCharacter(progress({ coins: 999 }), "pip")).toBeNull();
    expect(
      selectCharacter(progress({ unlocked: ["bossy", "pip"] }), "dragon"),
    ).toBeNull();
  });

  it("returns the same progression when the choice is unchanged", () => {
    const before = progress({ unlocked: ["bossy", "pip"], selected: "pip" });

    expect(selectCharacter(before, "pip")).toBe(before);
  });
});

describe("character catalogue", () => {
  it("contains the eight original characters at the fixed prices", () => {
    expect(CHARACTERS.map((character) => [character.id, character.name, character.price])).toEqual([
      ["bossy", "BOSSY", 0],
      ["pip", "PIP", 10],
      ["moss", "MOSS", 25],
      ["dash", "DASH", 50],
      ["ruby", "RUBY", 80],
      ["bolt", "BOLT", 125],
      ["nori", "NORI", 180],
      ["king-cluck", "KING CLUCK", 260],
    ]);
  });

  it("has a lookup for every id and nothing else", () => {
    for (const character of CHARACTERS) {
      expect(characterById(character.id)).toBe(character);
    }

    expect(characterById("dragon")).toBeUndefined();
  });
});
