import { describe, expect, it } from "vitest";
import {
  INSTALL_HINT_KEY,
  browserInstallHintEnv,
  markInstallHintDismissed,
  readInstallHintDismissed,
  shouldShowInstallHint,
  type InstallHintEnv,
} from "../src/app/install-hint";

function env(overrides: Partial<InstallHintEnv> = {}): InstallHintEnv {
  return {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    touchPoints: 5,
    standalone: false,
    dismissed: false,
    ...overrides,
  };
}

function memoryStorage(initial: string | null = null): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  raw: () => string | null;
} {
  let value = initial;

  return {
    getItem: (key) => (key === INSTALL_HINT_KEY ? value : null),
    setItem: (key, next) => {
      if (key === INSTALL_HINT_KEY) {
        value = next;
      }
    },
    raw: () => value,
  };
}

describe("install hint", () => {
  it("offers the Safari instruction on an iPhone", () => {
    expect(shouldShowInstallHint(env())).toBe(true);
  });

  it("recognises iPadOS Safari from a desktop user agent with touch", () => {
    const ipad = env({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      platform: "MacIntel",
      touchPoints: 5,
    });

    expect(shouldShowInstallHint(ipad)).toBe(true);
  });

  it("stays quiet on desktop Safari without a touch screen", () => {
    const mac = env({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      platform: "MacIntel",
      touchPoints: 0,
    });

    expect(shouldShowInstallHint(mac)).toBe(false);
  });

  it("stays quiet when already installed or dismissed", () => {
    expect(shouldShowInstallHint(env({ standalone: true }))).toBe(false);
    expect(shouldShowInstallHint(env({ dismissed: true }))).toBe(false);
  });

  it("does not offer the iOS instruction in another iOS browser", () => {
    expect(
      shouldShowInstallHint(
        env({
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1",
        }),
      ),
    ).toBe(false);
  });

  it("does not offer it on Android or a desktop Chrome", () => {
    expect(
      shouldShowInstallHint(
        env({
          userAgent:
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
          platform: "Linux armv8l",
        }),
      ),
    ).toBe(false);
  });

  it("persists a dismissal and tolerates a blocked store", () => {
    const storage = memoryStorage();

    expect(readInstallHintDismissed(storage)).toBe(false);
    markInstallHintDismissed(storage);
    expect(storage.raw()).toBe("1");
    expect(readInstallHintDismissed(storage)).toBe(true);

    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readInstallHintDismissed(blocked)).toBe(false);
    expect(() => markInstallHintDismissed(blocked)).not.toThrow();
    expect(readInstallHintDismissed(null)).toBe(false);
  });

  it("builds a browser environment without touching storage when absent", () => {
    const built = browserInstallHintEnv(null);
    expect(built.dismissed).toBe(false);
    expect(built.standalone).toBe(false);
  });
});
