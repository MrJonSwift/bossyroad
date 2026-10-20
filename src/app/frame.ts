const LABELS: Record<string, string> = {
  "390x844": "IPHONE 13 · 390 × 844",
  "393x852": "IPHONE 15 · 393 × 852",
  "430x932": "IPHONE 15 PRO MAX · 430 × 932",
  "768x1024": "IPAD · 768 × 1024",
  "820x1180": "IPAD AIR · 820 × 1180",
};

const PHONE_INSETS = { top: 47, bottom: 34 };
const TABLET_INSETS = { top: 24, bottom: 20 };

/**
 * `?frame=` puts the game in a device-sized box. `?safe=1` additionally
 * simulates the OS safe-area insets, because a desktop browser reports zero
 * and the HUD padding would otherwise look tighter than on a real phone.
 */
function applySafeArea(app: HTMLElement, width: number): void {
  const insets = width >= 600 ? TABLET_INSETS : PHONE_INSETS;

  app.style.setProperty("--safe-top", `${insets.top}px`);
  app.style.setProperty("--safe-bottom", `${insets.bottom}px`);
  app.dataset.safeArea = "preview";
}

export function setupFrameMode(app: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("frame");
  const safe = params.get("safe") === "1";

  if (!raw) {
    if (safe) {
      applySafeArea(app, 390);
    }
    return;
  }

  const match = /^(\d{3,4})x(\d{3,4})$/.exec(raw);
  if (!match) {
    console.warn(`Ignoring invalid frame size "${raw}". Use e.g. ?frame=390x844`);
    return;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);

  if (safe) {
    applySafeArea(app, width);
  }

  document.body.classList.add("framed");
  const label = LABELS[`${width}x${height}`] ?? `VIEWPORT ${width} × ${height}`;
  document.body.dataset.frameLabel = safe ? `${label} · SAFE AREA` : label;
  app.style.setProperty("--frame-w", `${width}px`);
  app.style.setProperty("--frame-h", `${height}px`);

  const fit = (): void => {
    const scale = Math.min(
      1,
      (window.innerWidth - 48) / width,
      (window.innerHeight - 48) / height,
    );
    app.style.transform = `scale(${Math.max(0.35, scale)})`;
  };

  fit();
  window.addEventListener("resize", fit);
  window.visualViewport?.addEventListener("resize", fit);
}
