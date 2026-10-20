export const INSTALL_HINT_KEY = "bossy-road.install-hint.v1";

export interface InstallHintEnv {
  userAgent: string;
  platform: string;
  touchPoints: number;
  standalone: boolean;
  dismissed: boolean;
}

interface ReadableStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isIos(env: InstallHintEnv): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) {
    return true;
  }

  // iPadOS 13+ reports a desktop Mac user agent but still has a touch screen.
  return /Macintosh/i.test(env.userAgent) && env.touchPoints > 1;
}

function isSafari(env: InstallHintEnv): boolean {
  if (/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(env.userAgent)) {
    return false;
  }

  return /Safari\//i.test(env.userAgent) && /Version\//i.test(env.userAgent);
}

/**
 * Add to Home Screen is only offered by Safari on iOS, and only matters when
 * the game is not already running standalone. The hint is shown once until the
 * player hides it; there is no repeated nagging.
 */
export function shouldShowInstallHint(env: InstallHintEnv): boolean {
  if (env.dismissed || env.standalone) {
    return false;
  }

  // On a non-iOS desktop or Android browser the platform owns installation;
  // this game only gives the manual iOS Safari instruction.
  return isIos(env) && isSafari(env);
}

export function readInstallHintDismissed(
  storage: ReadableStorage | null,
): boolean {
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(INSTALL_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function markInstallHintDismissed(storage: ReadableStorage | null): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(INSTALL_HINT_KEY, "1");
  } catch {
    // A blocked store only means the hint can show again next session.
  }
}

export function browserInstallHintEnv(
  storage: ReadableStorage | null,
): InstallHintEnv {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const standalone =
    typeof window !== "undefined" &&
    Boolean(
      window.matchMedia?.("(display-mode: standalone)").matches ||
        (nav as (Navigator & { standalone?: boolean }) | undefined)?.standalone,
    );

  return {
    userAgent: nav?.userAgent ?? "",
    platform: nav?.platform ?? "",
    touchPoints: nav?.maxTouchPoints ?? 0,
    standalone,
    dismissed: readInstallHintDismissed(storage),
  };
}
