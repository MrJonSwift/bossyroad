import { describe, expect, it } from "vitest";
import { RESET_CONFIRM_MS, ResetConfirm } from "../src/ui/reset-confirm";

describe("reset confirmation", () => {
  it("arms on the first tap and resets on the second", () => {
    const confirm = new ResetConfirm();

    expect(confirm.tap(1000)).toBe("armed");
    expect(confirm.isArmed(1200)).toBe(true);
    expect(confirm.tap(1400)).toBe("reset");
    expect(confirm.isArmed(1400)).toBe(false);
  });

  it("expires the arm after the confirmation window", () => {
    const confirm = new ResetConfirm();

    expect(confirm.tap(1000)).toBe("armed");
    expect(confirm.isArmed(1000 + RESET_CONFIRM_MS + 1)).toBe(false);
    expect(confirm.tap(1000 + RESET_CONFIRM_MS + 1)).toBe("armed");
  });

  it("can be disarmed when the panel closes", () => {
    const confirm = new ResetConfirm();

    confirm.tap(1000);
    confirm.cancel();

    expect(confirm.isArmed(1100)).toBe(false);
    expect(confirm.tap(1100)).toBe("armed");
  });
});
