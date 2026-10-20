export type PersistResult = "already" | "granted" | "denied" | "unsupported";

/** The subset of `navigator.storage` the game uses. */
export interface PersistentStorageLike {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

export function browserPersistentStorage(): PersistentStorageLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const storage = navigator.storage as Partial<PersistentStorageLike> | undefined;

  if (
    !storage ||
    typeof storage.persisted !== "function" ||
    typeof storage.persist !== "function"
  ) {
    return null;
  }

  return storage as PersistentStorageLike;
}

/**
 * Ask the browser to keep the save when storage gets tight.
 *
 * This is deliberately quiet: a denial is not an error, the save is small and
 * the game keeps working. It is called once after the first completed run.
 */
export async function requestPersistentStorage(
  storage: PersistentStorageLike | null,
): Promise<PersistResult> {
  if (!storage) {
    return "unsupported";
  }

  try {
    if (await storage.persisted()) {
      return "already";
    }

    return (await storage.persist()) ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}
