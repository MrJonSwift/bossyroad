import { APP_LABEL } from "../app/version";
import type { SaveSettings } from "../app/save";
import { ResetConfirm } from "./reset-confirm";

function requiredElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing settings element: ${selector}`);
  }

  return element;
}

export interface SettingsHandlers {
  onSound: (sound: boolean) => void;
  onMotion: (reducedMotion: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * The settings card. It owns only DOM state; the save record is written by the
 * caller through the handlers so persistence stays in one place.
 */
export class SettingsPanel {
  private readonly overlay = requiredElement<HTMLDivElement>("#settings-screen");
  private readonly soundToggle =
    requiredElement<HTMLButtonElement>("#sound-toggle");
  private readonly motionToggle =
    requiredElement<HTMLButtonElement>("#motion-toggle");
  private readonly soundValue = requiredElement<HTMLSpanElement>("#sound-value");
  private readonly motionValue =
    requiredElement<HTMLSpanElement>("#motion-value");
  private readonly resetButton =
    requiredElement<HTMLButtonElement>("#reset-button");
  private readonly resetLabel = requiredElement<HTMLSpanElement>("#reset-label");
  private readonly resetValue = requiredElement<HTMLSpanElement>("#reset-value");
  private readonly resetNote = requiredElement<HTMLParagraphElement>("#reset-note");
  private readonly closeButton =
    requiredElement<HTMLButtonElement>("#settings-close");
  private readonly versionLabel =
    requiredElement<HTMLParagraphElement>("#version-label");
  private readonly updateNote =
    requiredElement<HTMLParagraphElement>("#update-note");
  private readonly confirm = new ResetConfirm();
  private values: SaveSettings = { sound: true, reducedMotion: false };
  private noteTimer: number | null = null;
  private updateReady = false;

  constructor(private readonly handlers: SettingsHandlers) {
    this.versionLabel.textContent = APP_LABEL;

    this.soundToggle.addEventListener("click", () => {
      this.values = { ...this.values, sound: !this.values.sound };
      this.render();
      this.handlers.onSound(this.values.sound);
    });

    this.motionToggle.addEventListener("click", () => {
      this.values = {
        ...this.values,
        reducedMotion: !this.values.reducedMotion,
      };
      this.render();
      this.handlers.onMotion(this.values.reducedMotion);
    });

    this.resetButton.addEventListener("click", () => this.handleReset());
    this.closeButton.addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  /**
   * A new build is installed and waiting. We do not reload; the note simply
   * tells the player that closing and reopening the app will pick it up.
   */
  setUpdateReady(): void {
    this.updateReady = true;
    this.updateNote.hidden = false;
  }

  /** Exposed for the debug bridge and tests; the note is otherwise passive. */
  get hasUpdateReady(): boolean {
    return this.updateReady;
  }

  open(settings: SaveSettings): void {
    this.values = { ...settings };
    this.confirm.cancel();
    this.resetButton.classList.remove("is-armed");
    this.resetLabel.textContent = "RESET PROGRESS";
    this.resetValue.textContent = "TAP TWICE";
    this.setNote("");
    this.render();
    this.overlay.hidden = false;
  }

  close(): void {
    if (!this.isOpen) {
      return;
    }

    this.overlay.hidden = true;
    this.confirm.cancel();
    this.setNote("");
    this.handlers.onClose();
  }

  private handleReset(): void {
    const result = this.confirm.tap(performance.now());

    if (result === "armed") {
      this.resetButton.classList.add("is-armed");
      this.resetLabel.textContent = "TAP AGAIN TO RESET";
      this.resetValue.textContent = "SURE?";
      this.setNote("BEST SCORE AND PROGRESS WILL BE CLEARED");
      return;
    }

    this.resetButton.classList.remove("is-armed");
    this.resetLabel.textContent = "RESET PROGRESS";
    this.resetValue.textContent = "TAP TWICE";
    this.handlers.onReset();
    this.setNote("PROGRESS RESET");
  }

  private setNote(text: string): void {
    this.resetNote.textContent = text;

    if (this.noteTimer !== null) {
      window.clearTimeout(this.noteTimer);
      this.noteTimer = null;
    }

    if (text === "PROGRESS RESET") {
      this.noteTimer = window.setTimeout(() => {
        this.resetNote.textContent = "";
        this.noteTimer = null;
      }, 1800);
    }
  }

  private render(): void {
    this.soundValue.textContent = this.values.sound ? "ON" : "OFF";
    this.motionValue.textContent = this.values.reducedMotion ? "ON" : "OFF";
    this.soundToggle.setAttribute("aria-pressed", String(this.values.sound));
    this.motionToggle.setAttribute(
      "aria-pressed",
      String(this.values.reducedMotion),
    );
  }
}

export interface PauseHandlers {
  onResume: () => void;
  onSettings: () => void;
}

/** The pause card. The loop is responsible for actually freezing the sim. */
export class PausePanel {
  private readonly overlay = requiredElement<HTMLDivElement>("#pause-screen");
  private readonly resumeButton =
    requiredElement<HTMLButtonElement>("#resume-button");
  private readonly settingsButton =
    requiredElement<HTMLButtonElement>("#pause-settings-button");

  constructor(handlers: PauseHandlers) {
    this.resumeButton.addEventListener("click", handlers.onResume);
    this.settingsButton.addEventListener("click", handlers.onSettings);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(): void {
    this.overlay.hidden = false;
  }

  close(): void {
    this.overlay.hidden = true;
  }
}
