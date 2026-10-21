export interface PwaHooks {
  /** Fired when a newer build is waiting to take over. Never reloads by itself. */
  onUpdateReady?: () => void;
  /** Fired after registration succeeds, worker active or not. */
  onRegistered?: () => void;
}

export interface PwaEnvironment {
  /** Path the worker and its scope live under, e.g. "/" or "/bossy-road/". */
  baseUrl?: string;
  /** Defaults to the browser's service worker container. */
  container?: ServiceWorkerContainer | null;
  /** "loading" defers registration until the window load event. */
  readyState?: DocumentReadyState;
}

function browserContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  return navigator.serviceWorker;
}

/**
 * Register the generated Workbox worker.
 *
 * The update policy is deliberately "next launch": a new worker installs and
 * waits, and the browser activates it once every Bossy Road tab is closed. We
 * never call `skipWaiting` and never reload from here, so a deploy cannot swap
 * the JS or reset the page in the middle of a run. The settings card shows a
 * quiet "update ready" line so a parent knows a reopen will pick it up.
 *
 * The worker is registered after the load event so the first paint and the
 * first playable frame are not competing with a multi-hundred-KB precache.
 */
export function registerServiceWorker(
  hooks: PwaHooks = {},
  env: PwaEnvironment = {},
): void {
  const container = "container" in env ? env.container : browserContainer();

  // The dev server does not emit sw.js (that is a build artifact), so an
  // implicit dev registration would only surface a confusing MIME-type
  // console error. Test and preview setups pass an explicit container and
  // are never skipped.
  if (import.meta.env.DEV && !("container" in env)) {
    return;
  }

  const baseUrl = env.baseUrl ?? import.meta.env?.BASE_URL ?? "/";

  if (!container) {
    return;
  }

  let announced = false;

  const announceUpdate = (): void => {
    if (announced) {
      return;
    }

    announced = true;
    hooks.onUpdateReady?.();
  };

  const register = (): void => {
    container
      .register(`${baseUrl}sw.js`, { scope: baseUrl })
      .then((registration) => {
        hooks.onRegistered?.();

        // A worker already waiting means a newer build finished installing.
        if (registration.waiting && container.controller) {
          announceUpdate();
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;

          if (!installing) {
            return;
          }

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && container.controller) {
              announceUpdate();
            }
          });
        });
      })
      .catch(() => {
        // The game is fully client-side; a worker failure only costs offline
        // launch, so it must never interrupt play or show a scary dialog.
      });
  };

  const readyState =
    env.readyState ??
    (typeof document === "undefined" ? "complete" : document.readyState);

  if (readyState === "complete") {
    register();
    return;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("load", register, { once: true });
  } else {
    register();
  }
}
