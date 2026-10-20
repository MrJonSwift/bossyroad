import type { Cue } from "./feedback";

export type SoundName = Cue | "bell" | "unlock";

interface ToneOptions {
  type: OscillatorType;
  from: number;
  to: number;
  duration: number;
  gain: number;
  delay?: number;
  filter?: { type: BiquadFilterType; frequency: number; q?: number };
}

interface NoiseOptions {
  duration: number;
  gain: number;
  filter: BiquadFilterType;
  from: number;
  to: number;
  q?: number;
}

/** One shared, deliberately gentle master level. This is a game for children. */
const MASTER_GAIN = 0.62;

/**
 * Original synthesized sound. Every cue is generated at runtime with WebAudio,
 * so there is no audio file, no network request and nothing to precache.
 *
 * The context is created on the first user gesture (an iOS requirement). Until
 * then every method is a safe no-op, which also keeps the module testable in
 * Node where there is no AudioContext.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private readonly lastPlayed = new Map<SoundName, number>();

  setMuted(muted: boolean): void {
    this.muted = muted;

    if (this.context && this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, now, 0.015);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Call from a user gesture. Repeated calls are cheap and safe. */
  unlock(): void {
    try {
      if (typeof window === "undefined") {
        return;
      }

      if (!this.context) {
        const Ctor =
          window.AudioContext ??
          (window as Window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;

        if (!Ctor) {
          return;
        }

        this.context = new Ctor();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
        this.master.connect(this.context.destination);
      }

      if (this.context.state === "suspended") {
        void this.context.resume();
      }
    } catch {
      // Audio is a nice-to-have; a blocked context must never break play.
    }
  }

  play(name: SoundName): void {
    const context = this.context;

    if (!context || !this.master || this.muted || context.state !== "running") {
      return;
    }

    if (!this.throttle(name, context.currentTime)) {
      return;
    }

    switch (name) {
      case "start":
        this.uiPop();
        return;
      case "hop":
        this.tone({ type: "sine", from: 430, to: 760, duration: 0.09, gain: 0.07 });
        return;
      case "land":
        this.tone({ type: "triangle", from: 190, to: 92, duration: 0.1, gain: 0.06 });
        this.noiseBurst({
          duration: 0.08,
          gain: 0.035,
          filter: "lowpass",
          from: 620,
          to: 220,
        });
        return;
      case "splash":
        this.noiseBurst({
          duration: 0.34,
          gain: 0.11,
          filter: "bandpass",
          from: 1800,
          to: 340,
          q: 0.9,
        });
        this.tone({ type: "sine", from: 320, to: 120, duration: 0.22, gain: 0.04 });
        return;
      case "crash":
        this.tone({ type: "square", from: 150, to: 62, duration: 0.16, gain: 0.055 });
        this.noiseBurst({
          duration: 0.14,
          gain: 0.06,
          filter: "lowpass",
          from: 900,
          to: 180,
        });
        return;
      case "eagle":
        this.eagleScreech();
        return;
      case "horn":
        this.carHorn();
        return;
      case "nearMiss":
        this.noiseBurst({
          duration: 0.2,
          gain: 0.04,
          filter: "bandpass",
          from: 900,
          to: 2400,
          q: 0.7,
        });
        return;
      case "coin":
        this.coinChime();
        return;
      case "bell":
        this.tone({ type: "triangle", from: 880, to: 880, duration: 0.18, gain: 0.1 });
        this.tone({
          type: "triangle",
          from: 1320,
          to: 1320,
          duration: 0.14,
          gain: 0.075,
          delay: 0.045,
        });
        return;
      case "unlock":
        this.unlockChime();
        return;
      default:
        return;
    }
  }

  /** A short two-note UI pop, used for start, retry and screen transitions. */
  private uiPop(): void {
    this.tone({ type: "sine", from: 520, to: 660, duration: 0.08, gain: 0.055 });
    this.tone({
      type: "sine",
      from: 780,
      to: 990,
      duration: 0.1,
      gain: 0.045,
      delay: 0.055,
    });
  }

  /** A bright two-note pickup, deliberately quieter than the hop. */
  private coinChime(): void {
    this.tone({ type: "triangle", from: 1050, to: 1050, duration: 0.07, gain: 0.05 });
    this.tone({
      type: "triangle",
      from: 1560,
      to: 1560,
      duration: 0.1,
      gain: 0.042,
      delay: 0.055,
    });
  }

  /** A rising four-note arpeggio for a permanent unlock. */
  private unlockChime(): void {
    const notes = [523, 659, 784, 1047];

    for (let i = 0; i < notes.length; i += 1) {
      this.tone({
        type: "triangle",
        from: notes[i] ?? 523,
        to: notes[i] ?? 523,
        duration: 0.14,
        gain: 0.045,
        delay: i * 0.075,
      });
    }
  }

  /** Two soft, distant tones rather than a real car horn blast. */
  private carHorn(): void {
    const context = this.context;
    const master = this.master;

    if (!context || !master) {
      return;
    }

    const now = context.currentTime;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, now);
    filter.connect(master);

    for (const frequency of [392, 494]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
      gain.gain.setValueAtTime(0.045, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start(now);
      oscillator.stop(now + 0.22);
    }
  }

  /** Descending, slightly comic; never a horror-movie shriek. */
  private eagleScreech(): void {
    const context = this.context;

    if (!context) {
      return;
    }

    const now = context.currentTime;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.5);
    filter.connect(this.master ?? context.destination);

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(1350, now);
    oscillator.frequency.exponentialRampToValueAtTime(420, now + 0.5);

    // A little wobble keeps it cartoonish instead of harsh.
    const wobble = context.createOscillator();
    const wobbleGain = context.createGain();
    wobble.type = "sine";
    wobble.frequency.value = 11;
    wobbleGain.gain.value = 38;
    wobble.connect(wobbleGain);
    wobbleGain.connect(oscillator.frequency);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);

    oscillator.connect(gain);
    gain.connect(filter);
    oscillator.start(now);
    wobble.start(now);
    oscillator.stop(now + 0.55);
    wobble.stop(now + 0.55);
  }

  private tone(options: ToneOptions): void {
    const context = this.context;
    const master = this.master;

    if (!context || !master) {
      return;
    }

    const start = context.currentTime + (options.delay ?? 0);
    const end = start + options.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(Math.max(1, options.from), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.to), end);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(options.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    if (options.filter) {
      const filter = context.createBiquadFilter();
      filter.type = options.filter.type;
      filter.frequency.value = options.filter.frequency;
      filter.Q.value = options.filter.q ?? 1;
      oscillator.connect(gain);
      gain.connect(filter);
      filter.connect(master);
    } else {
      oscillator.connect(gain);
      gain.connect(master);
    }

    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private noiseBurst(options: NoiseOptions): void {
    const context = this.context;
    const master = this.master;

    if (!context || !master) {
      return;
    }

    if (!this.noise) {
      const length = Math.floor(context.sampleRate * 0.6);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }

      this.noise = buffer;
    }

    const now = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = this.noise;
    filter.type = options.filter;
    filter.frequency.setValueAtTime(Math.max(20, options.from), now);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(20, options.to),
      now + options.duration,
    );
    filter.Q.value = options.q ?? 1;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now);
    source.stop(now + options.duration + 0.02);
  }

  private throttle(name: SoundName, now: number): boolean {
    const limits: Partial<Record<SoundName, number>> = {
      bell: 0.14,
      horn: 1.2,
      nearMiss: 0.4,
      start: 0.16,
    };
    const limit = limits[name];

    if (limit === undefined) {
      return true;
    }

    const last = this.lastPlayed.get(name) ?? -Infinity;

    if (now - last < limit) {
      return false;
    }

    this.lastPlayed.set(name, now);
    return true;
  }
}
