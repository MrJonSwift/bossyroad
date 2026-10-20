import type { GameRenderer } from "../render/renderer";
import type { GameState, RunPhase } from "../sim/types";
import type { Hud } from "../ui/hud";
import { advanceFixed } from "./step";

export interface LoopHooks {
  onPhaseChange?: (phase: RunPhase, previous: RunPhase) => void;
  /** Called once per rendered frame while the simulation is not paused. */
  onFrame?: (state: GameState, dt: number) => void;
  /** Read every frame so the pause card can freeze the simulation. */
  isPaused?: () => boolean;
}

export function startLoop(
  state: GameState,
  renderer: GameRenderer,
  hud: Hud,
  hooks: LoopHooks = {},
): () => void {
  let last = performance.now();
  let accumulator = 0;
  let time = 0;
  let fps = 60;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let phase = state.phase;
  let wasPaused = hooks.isPaused?.() ?? false;
  let stopped = false;

  const onVisibilityChange = (): void => {
    last = performance.now();
    accumulator = 0;
  };

  const tick = (now: number): void => {
    if (stopped) {
      return;
    }

    const paused = hooks.isPaused?.() ?? false;

    if (paused !== wasPaused) {
      // Resuming must not replay the paused wall time as a burst of steps.
      wasPaused = paused;
      last = now;
      accumulator = 0;
    }

    const dt = Math.min(Math.max(0, (now - last) / 1000), 0.1);
    last = now;

    if (!paused) {
      time += dt;
    }

    const step = advanceFixed(state, accumulator, dt, paused);
    accumulator = step.accumulator;

    if (state.phase !== phase) {
      const previous = phase;
      phase = state.phase;
      hooks.onPhaseChange?.(phase, previous);
    }

    if (!paused) {
      hooks.onFrame?.(state, dt);
    }

    // A paused frame still renders so the card sits over a stable snapshot,
    // but dt = 0 freezes damped camera moves and cosmetic animation time.
    renderer.render(state, time, paused ? 0 : dt);

    fpsFrames += 1;
    fpsElapsed += dt;
    if (fpsElapsed >= 0.5) {
      fps = fpsFrames / fpsElapsed;
      fpsFrames = 0;
      fpsElapsed = 0;
    }

    hud.update(state, fps, renderer.info(), paused ? 0 : dt);
    requestAnimationFrame(tick);
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  requestAnimationFrame(tick);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
