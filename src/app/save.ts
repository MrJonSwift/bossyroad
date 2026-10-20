import {
  DEFAULT_CHARACTER_ID,
  isCharacterId,
} from "../characters/catalogue";
import type { Progression } from "../sim/progression";

export const SAVE_KEY = "bossy-road.save.v1";
export const SAVE_VERSION = 1 as const;

const MAX_SAVE_NUMBER = 1_000_000_000;

export interface SaveSettings {
  sound: boolean;
  reducedMotion: boolean;
}

export interface SaveV1 {
  version: 1;
  best: number;
  coins: number;
  unlocked: string[];
  selected: string;
  settings: SaveSettings;
}

export type SaveStatus = "missing" | "ok" | "corrupt" | "future";
export type SaveTrigger =
  | "run-end"
  | "visibility"
  | "settings"
  | "coins"
  | "shop"
  | "reset";

export interface LoadedSave {
  save: SaveV1;
  status: SaveStatus;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultSave(): SaveV1 {
  return {
    version: SAVE_VERSION,
    best: 0,
    coins: 0,
    unlocked: [DEFAULT_CHARACTER_ID],
    selected: DEFAULT_CHARACTER_ID,
    settings: { sound: true, reducedMotion: false },
  };
}

/** localStorage can throw in private modes; a missing store is not fatal. */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function wholeNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(MAX_SAVE_NUMBER, Math.max(0, Math.floor(value)));
}

/** Fill missing fields and drop junk, so a partial save is still playable. */
export function sanitizeSave(value: unknown): SaveV1 {
  const fallback = defaultSave();

  if (!isRecord(value)) {
    return fallback;
  }

  const unlockedSource = Array.isArray(value.unlocked) ? value.unlocked : [];
  const unlocked = [
    ...new Set(
      unlockedSource.filter(
        (id): id is string => typeof id === "string" && isCharacterId(id),
      ),
    ),
  ];

  if (!unlocked.includes(DEFAULT_CHARACTER_ID)) {
    unlocked.unshift(DEFAULT_CHARACTER_ID);
  }

  const selected =
    typeof value.selected === "string" && unlocked.includes(value.selected)
      ? value.selected
      : DEFAULT_CHARACTER_ID;

  const settings = isRecord(value.settings) ? value.settings : {};

  return {
    version: SAVE_VERSION,
    best: wholeNumber(value.best, fallback.best),
    coins: wholeNumber(value.coins, fallback.coins),
    unlocked,
    selected,
    settings: {
      sound:
        typeof settings.sound === "boolean"
          ? settings.sound
          : fallback.settings.sound,
      reducedMotion:
        typeof settings.reducedMotion === "boolean"
          ? settings.reducedMotion
          : fallback.settings.reducedMotion,
    },
  };
}

export function loadSave(
  storage: StorageLike | null = browserStorage(),
): LoadedSave {
  const fallback = defaultSave();

  if (!storage) {
    return { save: fallback, status: "missing" };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { save: fallback, status: "missing" };
  }

  if (raw === null || raw.trim() === "") {
    return { save: fallback, status: "missing" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { save: fallback, status: "corrupt" };
  }

  if (!isRecord(parsed)) {
    return { save: fallback, status: "corrupt" };
  }

  const version = parsed.version;
  if (
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    version < SAVE_VERSION
  ) {
    return { save: fallback, status: "corrupt" };
  }

  if (version > SAVE_VERSION) {
    // A newer build wrote this. Keep the raw record untouched and run on
    // defaults rather than silently downgrading it.
    return { save: fallback, status: "future" };
  }

  return { save: sanitizeSave(parsed), status: "ok" };
}

export function writeSave(
  save: SaveV1,
  storage: StorageLike | null = browserStorage(),
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/**
 * Corrupt data stays untouched on background flushes; finishing a run or
 * changing a setting is an intentional write and may repair it. Future
 * versions are never overwritten.
 */
export function canWriteSave(status: SaveStatus, trigger: SaveTrigger): boolean {
  if (status === "future") {
    return false;
  }
  if (status === "corrupt" && trigger === "visibility") {
    return false;
  }
  return true;
}

export function withBest(save: SaveV1, best: number): SaveV1 {
  const next = wholeNumber(best, save.best);

  if (next <= save.best) {
    return save;
  }

  return { ...save, best: next };
}

/** Settings are written immediately, unlike best which can wait for a run end. */
export function withSettings(
  save: SaveV1,
  patch: Partial<SaveSettings>,
): SaveV1 {
  return {
    ...save,
    settings: { ...save.settings, ...patch },
  };
}

/**
 * Keep the saved balance in step with the simulation after a pickup or a
 * purchase. Clamped and floored, so a bad value can never become negative.
 */
export function withCoins(save: SaveV1, coins: number): SaveV1 {
  const next = wholeNumber(coins, save.coins);

  if (next === save.coins) {
    return save;
  }

  return { ...save, coins: next };
}

/**
 * Apply a progression result (unlock or equip) to the save record. The record
 * is sanitised again, so an unknown id or a locked selection can never be
 * written even if a caller gets it wrong.
 */
export function withProgression(
  save: SaveV1,
  progress: Progression,
): SaveV1 {
  return sanitizeSave({
    ...save,
    coins: progress.coins,
    unlocked: progress.unlocked,
    selected: progress.selected,
  });
}

/**
 * Reset the player's progress but keep their comfort settings. Coins, best,
 * unlocks and the selected character all return to the schema defaults.
 */
export function resetProgress(save: SaveV1): SaveV1 {
  const defaults = defaultSave();

  return {
    ...defaults,
    settings: { ...save.settings },
  };
}
