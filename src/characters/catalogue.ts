/**
 * The original cast. Every character is cosmetic: the simulation never reads
 * this list, so unlocks and selection cannot change the hitbox, hop or score.
 *
 * Prices are the kid-friendly pacing values recorded in `docs/SPEC.md`.
 * Bossy is always owned and free.
 */
export type CharacterId =
  | "bossy"
  | "pip"
  | "moss"
  | "dash"
  | "ruby"
  | "bolt"
  | "nori"
  | "king-cluck";

export interface Character {
  id: CharacterId;
  name: string;
  /** Fixed coin price. Bossy is 0 and is owned from the start. */
  price: number;
  /** One short line for the shop card. */
  look: string;
  /** UI accent used by the card and portrait backdrop. */
  accent: string;
}

export const CHARACTERS: readonly Character[] = [
  {
    id: "bossy",
    name: "BOSSY",
    price: 0,
    look: "CREAM CHICKEN · RED COMB",
    accent: "#f2c75c",
  },
  {
    id: "pip",
    name: "PIP",
    price: 10,
    look: "BLUE PENGUIN · ORANGE BEAK",
    accent: "#5aa7e0",
  },
  {
    id: "moss",
    name: "MOSS",
    price: 25,
    look: "GREEN FROG · BIG EYES",
    accent: "#7cc95a",
  },
  {
    id: "dash",
    name: "DASH",
    price: 50,
    look: "ORANGE FOX · WHITE TIP",
    accent: "#ef9147",
  },
  {
    id: "ruby",
    name: "RUBY",
    price: 80,
    look: "RED-BROWN HEN · GOLD BEAK",
    accent: "#d0684a",
  },
  {
    id: "bolt",
    name: "BOLT",
    price: 125,
    look: "TEAL ROBOT · ANTENNA",
    accent: "#58c8b6",
  },
  {
    id: "nori",
    name: "NORI",
    price: 180,
    look: "BLACK CAT · PINK EARS",
    accent: "#8c95a8",
  },
  {
    id: "king-cluck",
    name: "KING CLUCK",
    price: 260,
    look: "ROYAL CHICKEN · CROWN",
    accent: "#b98cf0",
  },
] as const;

export const DEFAULT_CHARACTER_ID: CharacterId = "bossy";

const BY_ID = new Map<string, Character>(
  CHARACTERS.map((character) => [character.id, character]),
);

export function characterById(id: string): Character | undefined {
  return BY_ID.get(id);
}

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && BY_ID.has(value);
}

export function characterName(id: CharacterId): string {
  return characterById(id)?.name ?? "BOSSY";
}
