import type { GameState, RunPhase } from "../sim/types";

export type Cue =
  | "start"
  | "hop"
  | "land"
  | "coin"
  | "splash"
  | "crash"
  | "eagle"
  | "horn"
  | "nearMiss";

interface Previous {
  phase: RunPhase;
  hopping: boolean;
  hopT: number;
  coins: number;
}

/** How close a car must be before the polite horn is worth playing. */
const HORN_NEAR = 2;
const HORN_FAR = 4.2;
const HORN_COOLDOWN = 2.4;

/**
 * Player half-width (0.22) plus car half-length (0.75). Anything beyond this
 * is not a collision, and inside the near-miss band it is worth a quiet whoosh.
 */
const CAR_CLEARANCE = 0.98;
/** A near miss is a car passing just outside the forgiving hitbox. */
const MISS_NEAR = CAR_CLEARANCE;
const MISS_FAR = 1.6;
const MISS_COOLDOWN = 0.9;

/**
 * Turns render-frame state changes into sound cues. The simulation stays pure:
 * this is an app-layer observer that diffs the previous frame, so rules never
 * need an event bus.
 */
export class Feedback {
  private previous: Previous | null = null;
  private hornTimer = 0;
  private missTimer = 0;

  update(state: GameState, dt: number): Cue[] {
    const cues: Cue[] = [];
    const prev = this.previous;

    this.hornTimer = Math.max(0, this.hornTimer - dt);
    this.missTimer = Math.max(0, this.missTimer - dt);

    if (!prev) {
      this.remember(state);
      return cues;
    }

    if (state.phase !== prev.phase) {
      if (state.phase === "playing") {
        cues.push("start");
      } else if (state.phase === "dying") {
        cues.push(deathCue(state));
      }
    }

    if (state.phase === "playing") {
      const hopping = state.player.hopping;

      if (hopping && (!prev.hopping || state.player.hopT < prev.hopT - 0.05)) {
        cues.push("hop");
      } else if (!hopping && prev.hopping) {
        cues.push("land");
      }

      if (state.coins > prev.coins) {
        cues.push("coin");
      }

      const traffic = this.trafficCue(state);
      if (traffic) {
        cues.push(traffic);
      }
    }

    this.remember(state);
    return cues;
  }

  /** Forget the run on retry so the first frame cannot replay old cues. */
  reset(): void {
    this.previous = null;
    this.hornTimer = 0;
    this.missTimer = 0;
  }

  private remember(state: GameState): void {
    this.previous = {
      phase: state.phase,
      hopping: state.player.hopping,
      hopT: state.player.hopT,
      coins: state.coins,
    };
  }

  private trafficCue(state: GameState): Cue | null {
    const player = state.player;

    for (const car of state.cars) {
      if (Math.abs(car.z - player.z) > 0.55) {
        continue;
      }

      const distance = Math.abs(car.x - player.x);

      if (
        distance >= MISS_NEAR &&
        distance <= MISS_FAR &&
        this.missTimer === 0
      ) {
        this.missTimer = MISS_COOLDOWN;
        return "nearMiss";
      }

      const approaching = car.dir === 1 ? car.x < player.x : car.x > player.x;

      if (
        approaching &&
        distance >= HORN_NEAR &&
        distance <= HORN_FAR &&
        this.hornTimer === 0
      ) {
        this.hornTimer = HORN_COOLDOWN;
        return "horn";
      }
    }

    return null;
  }
}

function deathCue(state: GameState): Cue {
  if (state.deathCause === "drown") {
    return "splash";
  }
  if (state.deathCause === "eagle") {
    return "eagle";
  }
  return "crash";
}
