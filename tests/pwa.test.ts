import { describe, expect, it } from "vitest";
import { registerServiceWorker } from "../src/app/pwa";

class FakeWorker extends EventTarget {
  state = "installing";
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}

interface RegisterCall {
  url: string;
  options?: RegistrationOptions;
}

function fakeContainer(registration: FakeRegistration) {
  const calls: RegisterCall[] = [];

  const container = {
    controller: {} as ServiceWorker,
    register: async (url: string, options?: RegistrationOptions) => {
      calls.push({ url, options });
      return registration as unknown as ServiceWorkerRegistration;
    },
  } as unknown as ServiceWorkerContainer;

  return { container, calls };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("service worker registration", () => {
  it("registers the worker under the build base path", async () => {
    const registration = new FakeRegistration();
    const { container, calls } = fakeContainer(registration);

    registerServiceWorker({}, { container, baseUrl: "/bossy-road/", readyState: "complete" });
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/bossy-road/sw.js");
    expect(calls[0]?.options?.scope).toBe("/bossy-road/");
  });

  it("does nothing when the browser has no worker support", () => {
    let ready = false;

    registerServiceWorker(
      { onRegistered: () => (ready = true) },
      { container: null, readyState: "complete" },
    );

    expect(ready).toBe(false);
  });

  it("announces a waiting update once, and never reloads", async () => {
    const registration = new FakeRegistration();
    const { container } = fakeContainer(registration);
    const worker = new FakeWorker();
    registration.installing = worker;

    let updates = 0;
    registerServiceWorker(
      { onUpdateReady: () => (updates += 1) },
      { container, baseUrl: "/", readyState: "complete" },
    );
    await flush();

    registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));
    worker.dispatchEvent(new Event("statechange"));

    expect(updates).toBe(1);
  });

  it("stays quiet for a first install with no controller", async () => {
    const registration = new FakeRegistration();
    const { container } = fakeContainer(registration);
    const worker = new FakeWorker();
    registration.installing = worker;

    let updates = 0;
    const containerWithoutController = {
      controller: null,
      register: container.register.bind(container),
    } as unknown as ServiceWorkerContainer;

    registerServiceWorker(
      { onUpdateReady: () => (updates += 1) },
      {
        container: containerWithoutController,
        baseUrl: "/",
        readyState: "complete",
      },
    );
    await flush();

    registration.dispatchEvent(new Event("updatefound"));
    worker.state = "installed";
    worker.dispatchEvent(new Event("statechange"));

    expect(updates).toBe(0);
  });
});
