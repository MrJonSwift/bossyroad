import { describe, expect, it } from "vitest";
import {
  requestPersistentStorage,
  type PersistentStorageLike,
} from "../src/app/storage";

function storage(
  options: { persisted?: boolean; grant?: boolean; throws?: boolean } = {},
): PersistentStorageLike & { persistCalls: () => number } {
  let persistCalls = 0;

  return {
    persisted: async () => {
      if (options.throws) {
        throw new Error("blocked");
      }
      return options.persisted ?? false;
    },
    persist: async () => {
      persistCalls += 1;
      if (options.throws) {
        throw new Error("blocked");
      }
      return options.grant ?? true;
    },
    persistCalls: () => persistCalls,
  };
}

describe("persistent storage request", () => {
  it("is unsupported when the browser has no storage manager", async () => {
    expect(await requestPersistentStorage(null)).toBe("unsupported");
  });

  it("does not ask again when storage is already persistent", async () => {
    const store = storage({ persisted: true });
    expect(await requestPersistentStorage(store)).toBe("already");
    expect(store.persistCalls()).toBe(0);
  });

  it("reports a granted request", async () => {
    const store = storage({ grant: true });
    expect(await requestPersistentStorage(store)).toBe("granted");
    expect(store.persistCalls()).toBe(1);
  });

  it("reports a denied request without throwing", async () => {
    expect(await requestPersistentStorage(storage({ grant: false }))).toBe(
      "denied",
    );
  });

  it("treats an exception as unsupported", async () => {
    expect(await requestPersistentStorage(storage({ throws: true }))).toBe(
      "unsupported",
    );
  });
});
