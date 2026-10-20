import { describe, expect, it } from "vitest";
import { Sfx, type SoundName } from "../src/app/audio";

const SOUNDS: SoundName[] = [
  "start",
  "hop",
  "land",
  "splash",
  "crash",
  "eagle",
  "horn",
  "nearMiss",
  "bell",
];

describe("synthesized sound", () => {
  it("starts muted state from the saved setting", () => {
    const sfx = new Sfx();

    expect(sfx.isMuted()).toBe(false);
    sfx.setMuted(true);
    expect(sfx.isMuted()).toBe(true);
  });

  it("is a safe no-op without a browser AudioContext", () => {
    const sfx = new Sfx();

    expect(() => sfx.unlock()).not.toThrow();

    for (const sound of SOUNDS) {
      expect(() => sfx.play(sound)).not.toThrow();
    }
  });

  it("stays silent while muted, even after unlock is attempted", () => {
    const sfx = new Sfx();
    sfx.setMuted(true);
    sfx.unlock();

    expect(sfx.isMuted()).toBe(true);
    expect(() => sfx.play("hop")).not.toThrow();
  });
});
