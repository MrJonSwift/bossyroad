export const RESET_CONFIRM_MS = 4000;

export type ResetTap = "armed" | "reset";

/**
 * Reset progress is destructive, so it takes two taps. The second tap must
 * land inside the window; otherwise the first tap only arms the button again.
 */
export class ResetConfirm {
  private armedAt: number | null = null;

  tap(now: number): ResetTap {
    if (this.armedAt !== null && now - this.armedAt <= RESET_CONFIRM_MS) {
      this.armedAt = null;
      return "reset";
    }

    this.armedAt = now;
    return "armed";
  }

  isArmed(now: number): boolean {
    return this.armedAt !== null && now - this.armedAt <= RESET_CONFIRM_MS;
  }

  cancel(): void {
    this.armedAt = null;
  }
}
