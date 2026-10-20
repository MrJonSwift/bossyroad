import { describe, expect, it } from "vitest";
import {
  SAVE_KEY,
  SAVE_VERSION,
  canWriteSave,
  defaultSave,
  loadSave,
  resetProgress,
  sanitizeSave,
  withBest,
  withCoins,
  withProgression,
  withSettings,
  writeSave,
  type StorageLike,
} from "../src/app/save";

function memoryStorage(initial: string | null = null): StorageLike & {
  raw: () => string | null;
} {
  let value = initial;

  return {
    getItem: (key) => (key === SAVE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === SAVE_KEY) {
        value = next;
      }
    },
    raw: () => value,
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
  };
}

describe("save loading", () => {
  it("starts from defaults when there is no save", () => {
    const loaded = loadSave(memoryStorage());

    expect(loaded.status).toBe("missing");
    expect(loaded.save).toEqual(defaultSave());
  });

  it("starts from defaults when storage is unavailable", () => {
    expect(loadSave(null)).toEqual({
      save: defaultSave(),
      status: "missing",
    });
  });

  it("reads a valid save", () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        best: 42,
        coins: 7,
        unlocked: ["bossy", "pip"],
        selected: "pip",
        settings: { sound: false, reducedMotion: true },
      }),
    );

    const loaded = loadSave(storage);

    expect(loaded.status).toBe("ok");
    expect(loaded.save).toEqual({
      version: 1,
      best: 42,
      coins: 7,
      unlocked: ["bossy", "pip"],
      selected: "pip",
      settings: { sound: false, reducedMotion: true },
    });
  });

  it("falls back safely on corrupt JSON and leaves it untouched", () => {
    const storage = memoryStorage("{ this is not json");
    const loaded = loadSave(storage);

    expect(loaded.status).toBe("corrupt");
    expect(loaded.save).toEqual(defaultSave());
    expect(storage.raw()).toBe("{ this is not json");
    expect(canWriteSave(loaded.status, "visibility")).toBe(false);
    expect(canWriteSave(loaded.status, "run-end")).toBe(true);
  });

  it("treats a non-object or unversioned record as corrupt", () => {
    expect(loadSave(memoryStorage("null")).status).toBe("corrupt");
    expect(loadSave(memoryStorage("[]")).status).toBe("corrupt");
    expect(loadSave(memoryStorage('{"best":10}')).status).toBe("corrupt");
    expect(loadSave(memoryStorage('{"version":0,"best":10}')).status).toBe(
      "corrupt",
    );
  });

  it("never overwrites a future save", () => {
    const future = JSON.stringify({ version: SAVE_VERSION + 1, best: 900 });
    const storage = memoryStorage(future);
    const loaded = loadSave(storage);

    expect(loaded.status).toBe("future");
    expect(loaded.save).toEqual(defaultSave());
    expect(canWriteSave(loaded.status, "run-end")).toBe(false);
    expect(canWriteSave(loaded.status, "visibility")).toBe(false);
    expect(storage.raw()).toBe(future);
  });

  it("survives storage that throws", () => {
    const loaded = loadSave(throwingStorage());

    expect(loaded.status).toBe("missing");
    expect(loaded.save).toEqual(defaultSave());
    expect(writeSave(defaultSave(), throwingStorage())).toBe(false);
  });
});

describe("save sanitising", () => {
  it("fills missing fields with defaults", () => {
    const save = sanitizeSave({ version: 1, best: 12 });

    expect(save).toEqual({ ...defaultSave(), best: 12 });
  });

  it("drops invalid numbers and clamps negatives", () => {
    const save = sanitizeSave({
      version: 1,
      best: -5,
      coins: "lots",
      settings: { sound: "yes" },
    });

    expect(save.best).toBe(0);
    expect(save.coins).toBe(0);
    expect(save.settings.sound).toBe(true);
    expect(save.settings.reducedMotion).toBe(false);
  });

  it("always unlocks Bossy and keeps the selection valid", () => {
    expect(sanitizeSave({ version: 1, unlocked: [], selected: "king" })).toMatchObject(
      {
        unlocked: ["bossy"],
        selected: "bossy",
      },
    );

    expect(
      sanitizeSave({
        version: 1,
        unlocked: ["pip", "pip", 7, ""],
        selected: "pip",
      }),
    ).toMatchObject({ unlocked: ["bossy", "pip"], selected: "pip" });
  });

  it("caps absurd values instead of overflowing the HUD", () => {
    const save = sanitizeSave({ version: 1, best: Number.MAX_VALUE, coins: -1 });

    expect(save.best).toBe(1_000_000_000);
    expect(save.coins).toBe(0);
  });
});

describe("save writing", () => {
  it("round-trips a save through the adapter", () => {
    const storage = memoryStorage();
    const save = { ...defaultSave(), best: 33 };

    expect(writeSave(save, storage)).toBe(true);
    expect(loadSave(storage)).toEqual({ save, status: "ok" });
  });

  it("repairs corrupt data only after an intentional run end", () => {
    const storage = memoryStorage("{broken");
    const loaded = loadSave(storage);
    expect(loaded.status).toBe("corrupt");

    const repaired = withBest(loaded.save, 9);
    expect(writeSave(repaired, storage)).toBe(true);

    const reloaded = loadSave(storage);
    expect(reloaded.status).toBe("ok");
    expect(reloaded.save.best).toBe(9);
  });

  it("keeps best monotonic and ignores junk", () => {
    const save = { ...defaultSave(), best: 10 };

    expect(withBest(save, 9)).toBe(save);
    expect(withBest(save, 11).best).toBe(11);
    expect(withBest(save, Number.NaN).best).toBe(10);
    expect(withBest(save, -3).best).toBe(10);
  });
});

describe("settings and progress", () => {
  it("persists sound and reduced motion independently", () => {
    const storage = memoryStorage();
    let save = defaultSave();

    save = withSettings(save, { sound: false });
    expect(save.settings).toEqual({ sound: false, reducedMotion: false });
    expect(defaultSave().settings.sound).toBe(true);

    save = withSettings(save, { reducedMotion: true });
    expect(writeSave(save, storage)).toBe(true);

    const reloaded = loadSave(storage);
    expect(reloaded.status).toBe("ok");
    expect(reloaded.save.settings).toEqual({
      sound: false,
      reducedMotion: true,
    });
  });

  it("resets progress but keeps comfort settings", () => {
    const save = {
      ...defaultSave(),
      best: 87,
      coins: 24,
      unlocked: ["bossy", "pip", "moss"],
      selected: "pip",
      settings: { sound: false, reducedMotion: true },
    };

    const reset = resetProgress(save);

    expect(reset.best).toBe(0);
    expect(reset.coins).toBe(0);
    expect(reset.unlocked).toEqual(["bossy"]);
    expect(reset.selected).toBe("bossy");
    expect(reset.settings).toEqual({ sound: false, reducedMotion: true });
  });

  it("allows an explicit settings write to repair corrupt data", () => {
    expect(canWriteSave("corrupt", "settings")).toBe(true);
    expect(canWriteSave("future", "settings")).toBe(false);
    expect(canWriteSave("future", "reset")).toBe(false);
  });
});

describe("session migration", () => {
  it("upgrades a session-2 best-only save without losing the score", () => {
    const loaded = loadSave(
      memoryStorage(JSON.stringify({ version: 1, best: 64 })),
    );

    expect(loaded.status).toBe("ok");
    expect(loaded.save).toMatchObject({
      version: 1,
      best: 64,
      coins: 0,
      unlocked: ["bossy"],
      selected: "bossy",
      settings: { sound: true, reducedMotion: false },
    });
  });

  it("keeps session-5 settings while filling in coin progress", () => {
    const loaded = loadSave(
      memoryStorage(
        JSON.stringify({
          version: 1,
          best: 120,
          settings: { sound: false, reducedMotion: true },
        }),
      ),
    );

    expect(loaded.status).toBe("ok");
    expect(loaded.save).toMatchObject({
      best: 120,
      coins: 0,
      unlocked: ["bossy"],
      selected: "bossy",
      settings: { sound: false, reducedMotion: true },
    });
  });

  it("drops character ids this build does not know", () => {
    const save = sanitizeSave({
      version: 1,
      best: 5,
      coins: 40,
      unlocked: ["bossy", "dragon", "pip", "pip"],
      selected: "dragon",
    });

    expect(save.unlocked).toEqual(["bossy", "pip"]);
    expect(save.selected).toBe("bossy");
    expect(save.coins).toBe(40);
  });

  it("will not equip a character that is not unlocked", () => {
    expect(
      sanitizeSave({
        version: 1,
        unlocked: ["bossy"],
        selected: "king-cluck",
      }).selected,
    ).toBe("bossy");
  });
});

describe("coin and progression writes", () => {
  it("clamps the saved balance to a whole, non-negative number", () => {
    const save = { ...defaultSave(), coins: 12 };

    expect(withCoins(save, 18).coins).toBe(18);
    expect(withCoins(save, 18.9).coins).toBe(18);
    expect(withCoins(save, -4).coins).toBe(0);
    expect(withCoins(save, Number.NaN).coins).toBe(12);
    expect(withCoins(save, 12)).toBe(save);
  });

  it("persists an unlock and its price without touching best or settings", () => {
    const save = {
      ...defaultSave(),
      best: 31,
      coins: 30,
      settings: { sound: false, reducedMotion: true },
    };

    const next = withProgression(save, {
      coins: 20,
      unlocked: ["bossy", "pip"],
      selected: "pip",
    });

    expect(next).toMatchObject({
      best: 31,
      coins: 20,
      unlocked: ["bossy", "pip"],
      selected: "pip",
      settings: { sound: false, reducedMotion: true },
    });
  });

  it("sanitises a bad progression result before writing it", () => {
    const next = withProgression(defaultSave(), {
      coins: 500,
      unlocked: ["bossy", "dragon"],
      selected: "dragon",
    });

    expect(next.coins).toBe(500);
    expect(next.unlocked).toEqual(["bossy"]);
    expect(next.selected).toBe("bossy");
  });

  it("round-trips coin progress through storage", () => {
    const storage = memoryStorage();
    const save = withCoins(defaultSave(), 42);

    expect(writeSave(save, storage)).toBe(true);

    const reloaded = loadSave(storage);
    expect(reloaded.status).toBe("ok");
    expect(reloaded.save.coins).toBe(42);
  });
});
