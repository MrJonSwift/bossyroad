import {
  CHARACTERS,
  type Character,
  type CharacterId,
} from "../characters/catalogue";
import { drawPortrait } from "../characters/portrait";
import { shortfallFor, type Progression } from "../sim/progression";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing characters element: ${selector}`);
  }

  return element;
}

interface Card {
  character: Character;
  button: HTMLButtonElement;
  price: HTMLSpanElement;
  priceValue: Text;
  state: HTMLSpanElement;
}

export interface CharactersHandlers {
  onEquip: (id: CharacterId) => void;
  onUnlock: (id: CharacterId) => void;
  onInsufficient: (id: CharacterId, shortfall: number) => void;
  onClose: () => void;
}

/**
 * The character shop.
 *
 * The panel owns only presentation and the two-tap confirm; money rules live
 * in `src/sim/progression.ts` and the save record is written by the caller.
 * Prices always come from the catalogue, so a card cannot invent a discount.
 */
export class CharactersPanel {
  private readonly overlay = requiredElement<HTMLDivElement>("#characters-screen");
  private readonly grid = requiredElement<HTMLDivElement>("#character-grid");
  private readonly coins = requiredElement<HTMLSpanElement>("#shop-coins");
  private readonly note = requiredElement<HTMLParagraphElement>("#shop-note");
  private readonly closeButton =
    requiredElement<HTMLButtonElement>("#characters-close");
  private readonly cards: Card[] = [];
  private progress: Progression = { coins: 0, unlocked: ["bossy"], selected: "bossy" };
  private confirming: CharacterId | null = null;
  private denied: { id: CharacterId; shortfall: number } | null = null;
  private denyTimer: number | null = null;

  constructor(private readonly handlers: CharactersHandlers) {
    this.closeButton.addEventListener("click", () => this.close());
    this.buildCards();
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(progress: Progression): void {
    this.cancelConfirm();
    this.setNote("");
    this.setProgress(progress);
    this.overlay.hidden = false;
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }

    this.overlay.hidden = true;
    this.cancelConfirm();
    this.setNote("");
    this.handlers.onClose();
  }

  /** Refresh after an unlock, an equip or a coin change. */
  setProgress(progress: Progression): void {
    this.progress = progress;
    this.render();
  }

  notify(message: string, tone: "good" | "warn" | "plain" = "plain"): void {
    this.setNote(message, tone);
  }

  private buildCards(): void {
    for (const character of CHARACTERS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-card";
      button.dataset.character = character.id;
      button.style.setProperty("--accent", character.accent);

      const frame = document.createElement("span");
      frame.className = "portrait-frame";
      const canvas = document.createElement("canvas");
      canvas.className = "portrait";
      canvas.setAttribute("aria-hidden", "true");
      drawPortrait(canvas, character.id);
      frame.append(canvas);

      const name = document.createElement("span");
      name.className = "character-name";
      name.textContent = character.name;

      const price = document.createElement("span");
      price.className = "character-price";
      const dot = document.createElement("span");
      dot.className = "coin-dot";
      const priceValue = document.createTextNode(String(character.price));
      price.append(dot, priceValue);

      const state = document.createElement("span");
      state.className = "character-state";

      button.append(frame, name, price, state);
      button.addEventListener("click", () => this.handleCard(character));

      this.grid.append(button);
      this.cards.push({ character, button, price, priceValue, state });
    }

    this.render();
  }

  private handleCard(character: Character): void {
    if (
      this.confirming !== null &&
      this.confirming !== character.id
    ) {
      this.confirming = null;
      this.setNote("");
    }

    this.denied = null;

    if (this.progress.unlocked.includes(character.id)) {
      this.setNote("");
      this.render();
      this.handlers.onEquip(character.id);
      return;
    }

    const shortfall = shortfallFor(this.progress, character.id);

    if (shortfall > 0) {
      this.denied = { id: character.id, shortfall };
      this.setNote(`NEED ${shortfall} MORE COIN${shortfall === 1 ? "" : "S"}`, "warn");
      this.handlers.onInsufficient(character.id, shortfall);
      this.render();
      this.shake(character.id);
      return;
    }

    if (this.confirming === character.id) {
      this.confirming = null;
      this.setNote("");
      this.render();
      this.handlers.onUnlock(character.id);
      return;
    }

    this.confirming = character.id;
    this.setNote(
      `UNLOCK ${character.name} FOR ${character.price} COINS? TAP AGAIN`,
    );
    this.render();
  }

  private shake(id: CharacterId): void {
    const card = this.cards.find((entry) => entry.character.id === id);

    if (!card) {
      return;
    }

    card.button.classList.remove("is-deny");
    // Force a reflow so a second tap restarts the shake.
    void card.button.offsetWidth;
    card.button.classList.add("is-deny");

    if (this.denyTimer !== null) {
      window.clearTimeout(this.denyTimer);
    }

    this.denyTimer = window.setTimeout(() => {
      card.button.classList.remove("is-deny");
      this.denyTimer = null;
    }, 340);
  }

  private cancelConfirm(): void {
    this.confirming = null;
    this.denied = null;

    for (const card of this.cards) {
      card.button.classList.remove("is-deny");
    }
  }

  private setNote(
    text: string,
    tone: "good" | "warn" | "plain" = "plain",
  ): void {
    this.note.textContent = text;
    this.note.classList.toggle("is-good", tone === "good");
    this.note.classList.toggle("is-warn", tone === "warn");
  }

  private render(): void {
    this.coins.textContent = String(this.progress.coins);

    for (const card of this.cards) {
      const { character } = card;
      const owned = this.progress.unlocked.includes(character.id);
      const selected = this.progress.selected === character.id;
      const confirming = this.confirming === character.id;
      const denied = this.denied?.id === character.id ? this.denied : null;

      card.button.classList.toggle("is-locked", !owned);
      card.button.classList.toggle("is-selected", selected);
      card.button.classList.toggle("is-confirm", confirming);
      card.button.setAttribute("aria-pressed", String(selected));

      // Price stays visible on every locked card before the player commits.
      card.price.hidden = owned;

      if (selected) {
        card.state.textContent = "WEARING";
      } else if (owned) {
        card.state.textContent = "TAP TO WEAR";
      } else if (denied) {
        card.state.textContent = `NEED ${denied.shortfall} MORE`;
      } else if (confirming) {
        card.state.textContent = `TAP TO UNLOCK · ${character.price}`;
      } else {
        card.state.textContent = "TAP TO UNLOCK";
      }

      card.button.setAttribute(
        "aria-label",
        owned
          ? `${character.name}, owned${selected ? ", wearing" : ""}`
          : `${character.name}, ${character.price} coins, locked`,
      );
    }
  }
}
