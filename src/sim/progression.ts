import {
  CHARACTERS,
  characterById,
  type Character,
  type CharacterId,
} from "../characters/catalogue";

/**
 * Pure progression rules: fixed-price unlocks and equipping owned characters.
 *
 * The shop UI and the save service both call these functions, so a price can
 * never be taken from a card and a balance can never go below zero. There is
 * no randomness, no timer, no reroll and no real money here.
 */
export interface Progression {
  coins: number;
  unlocked: readonly string[];
  selected: string;
}

export type UnlockFailure = "owned" | "poor" | "unknown";

export type UnlockResult =
  | { ok: true; progression: Progression }
  | { ok: false; reason: UnlockFailure; shortfall: number };

export function shortfallFor(progress: Progression, id: CharacterId): number {
  const character = characterById(id);

  if (!character || progress.unlocked.includes(id)) {
    return 0;
  }

  return Math.max(0, character.price - Math.max(0, Math.floor(progress.coins)));
}

/**
 * Buy a character at its fixed price. A failure never changes the input, so a
 * double tap cannot charge twice.
 */
export function unlockCharacter(
  progress: Progression,
  id: string,
): UnlockResult {
  const character = characterById(id);

  if (!character) {
    return { ok: false, reason: "unknown", shortfall: 0 };
  }

  if (progress.unlocked.includes(character.id)) {
    return { ok: false, reason: "owned", shortfall: 0 };
  }

  const coins = Math.max(0, Math.floor(progress.coins));

  if (coins < character.price) {
    return {
      ok: false,
      reason: "poor",
      shortfall: character.price - coins,
    };
  }

  return {
    ok: true,
    progression: {
      coins: coins - character.price,
      unlocked: [...progress.unlocked, character.id],
      selected: progress.selected,
    },
  };
}

/**
 * Equip an owned character. Returns null for a locked or unknown id, so a
 * stale UI or a tampered save cannot equip something the player has not paid
 * for.
 */
export function selectCharacter(
  progress: Progression,
  id: string,
): Progression | null {
  if (!characterById(id) || !progress.unlocked.includes(id)) {
    return null;
  }

  if (progress.selected === id) {
    return progress;
  }

  return { ...progress, selected: id };
}

/** The cheapest character the player has not unlocked yet. */
export function nextUnlock(progress: Progression): Character | null {
  let best: Character | null = null;

  for (const character of CHARACTERS) {
    if (progress.unlocked.includes(character.id)) {
      continue;
    }

    if (!best || character.price < best.price) {
      best = character;
    }
  }

  return best;
}
