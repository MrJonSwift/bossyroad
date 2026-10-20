import type { Direction } from "../sim/types";

const SWIPE_THRESHOLD = 22;
const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "forward",
  KeyW: "forward",
  Space: "forward",
  Enter: "forward",
  ArrowDown: "back",
  KeyS: "back",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea"));
}

export function setupInput(
  element: HTMLElement,
  onDirection: (direction: Direction) => void,
  onAnyInput?: () => void,
  onTogglePause?: () => void,
): () => void {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;

  const reset = (): void => {
    pointerId = null;
  };

  const handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isInteractive(event.target)) {
      return;
    }

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;

    if (event.cancelable) {
      event.preventDefault();
    }

    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is a nice-to-have; Safari sometimes refuses it.
    }
  };

  const handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    reset();

    if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) {
      onDirection("forward");
    } else if (Math.abs(dx) > Math.abs(dy)) {
      onDirection(dx > 0 ? "right" : "left");
    } else {
      onDirection(dy > 0 ? "back" : "forward");
    }

    onAnyInput?.();
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === pointerId) {
      reset();
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    if (isInteractive(event.target)) {
      return;
    }

    if (
      onTogglePause &&
      (event.code === "Escape" || event.code === "KeyP")
    ) {
      event.preventDefault();
      onTogglePause();
      onAnyInput?.();
      return;
    }

    const direction = KEY_DIRECTIONS[event.code];
    if (!direction) {
      return;
    }

    event.preventDefault();
    onDirection(direction);
    onAnyInput?.();
  };

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointerup", handlePointerUp);
  element.addEventListener("pointercancel", handlePointerCancel);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("blur", reset);

  return () => {
    element.removeEventListener("pointerdown", handlePointerDown);
    element.removeEventListener("pointerup", handlePointerUp);
    element.removeEventListener("pointercancel", handlePointerCancel);
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("blur", reset);
  };
}
