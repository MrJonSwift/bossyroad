import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_BUILD, APP_VERSION } from "../src/app/version";

/**
 * The chip and the settings label cannot silently go stale again: the app
 * constants and the package record have to agree after every user-visible
 * session (the live build once said 1.0.1 while the deployed release was 1.1.0).
 */
describe("version record", () => {
  const pkg = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../package.json", import.meta.url)),
      "utf8",
    ) as string,
  ) as { version: string };

  it("matches the package.json version", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("tracks the latest session build", () => {
    expect(APP_BUILD).toBe("session 10");
    expect(pkg.version).toBe("1.2.0");
  });
});
