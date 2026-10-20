import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";
import { GET } from "../app/sw.js/route";
import { legacyCacheRecoveryScript, legacyCacheRetirementWorker } from "../lib/legacy-cache-recovery";

describe("legacy Pi Web cache migration", () => {
  it("serves a non-cacheable replacement at the old worker URL", async () => {
    const response = GET();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/javascript/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("service-worker-allowed"), "/");
    assert.equal(await response.text(), legacyCacheRetirementWorker);
  });

  it("unregisters legacy workers and clears only Pi Web caches before reloading", async () => {
    const actions: string[] = [];
    const controller = { scriptURL: "http://localhost:30141/sw.js?v=0.12.2" };
    await runInNewContext(legacyCacheRecoveryScript, {
      URL,
      location: { origin: "http://localhost:30141", reload: () => actions.push("reload") },
      navigator: { serviceWorker: {
        controller,
        getRegistrations: async () => [
          { active: controller, unregister: async () => actions.push("unregister-legacy") },
          { active: { scriptURL: "http://localhost:30141/other-worker.js" }, unregister: async () => actions.push("unregister-other") },
        ],
      } },
      caches: { keys: async () => ["pi-web-static-dev", "pi-web-static-0.12.2", "unrelated"], delete: async (key: string) => actions.push(`delete:${key}`) },
    });
    assert.deepEqual(actions, ["unregister-legacy", "delete:pi-web-static-dev", "delete:pi-web-static-0.12.2", "reload"]);
  });

  it("reloads an already-unregistered legacy controller exactly once", async () => {
    let reloads = 0;
    const serviceWorker: { controller: { scriptURL: string } | null; getRegistrations: () => Promise<never[]> } = {
      controller: { scriptURL: "http://localhost:30141/sw.js?v=dev" },
      getRegistrations: async () => [],
    };
    const environment = {
      URL,
      location: { origin: "http://localhost:30141", reload: () => { reloads += 1; } },
      navigator: { serviceWorker },
      caches: { keys: async () => [], delete: async () => true },
    };
    await runInNewContext(legacyCacheRecoveryScript, environment);
    serviceWorker.controller = null;
    await runInNewContext(legacyCacheRecoveryScript, environment);
    assert.equal(reloads, 1);
  });

  it("does not touch unrelated registrations or caches", async () => {
    await runInNewContext(legacyCacheRecoveryScript, {
      URL,
      location: { origin: "http://localhost:30141", reload: () => assert.fail("Unexpected reload") },
      navigator: { serviceWorker: {
        controller: { scriptURL: "http://localhost:30141/other-worker.js" },
        getRegistrations: async () => [
          { active: { scriptURL: "http://localhost:30141/other-worker.js" }, unregister: async () => assert.fail("Unexpected unregister") },
          { active: { scriptURL: "https://other.example/sw.js" }, unregister: async () => assert.fail("Unexpected foreign unregister") },
        ],
      } },
      caches: { keys: async () => ["unrelated"], delete: async () => assert.fail("Unexpected cache deletion") },
    });
  });

  it("cleans an orphaned cache recreated by an in-flight retired worker without reloading", async () => {
    const deleted: string[] = [];
    await runInNewContext(legacyCacheRecoveryScript, {
      URL,
      location: { origin: "http://localhost:30141", reload: () => assert.fail("Unexpected reload") },
      navigator: { serviceWorker: { controller: null, getRegistrations: async () => [] } },
      caches: { keys: async () => ["pi-web-static-dev", "unrelated"], delete: async (key: string) => deleted.push(key) },
    });
    assert.deepEqual(deleted, ["pi-web-static-dev"]);
  });

  it("keeps normal loading available when browser recovery APIs fail", async () => {
    await runInNewContext(legacyCacheRecoveryScript, { navigator: {} });
    await runInNewContext(legacyCacheRecoveryScript, {
      navigator: { serviceWorker: { getRegistrations: async () => { throw new Error("Browser storage unavailable"); } } },
    });
  });

  it("retires the old worker without caching requests or navigating open drafts", async () => {
    const listeners = new Map<string, (event: { waitUntil: (promise: Promise<unknown>) => void }) => void>();
    const actions: string[] = [];
    runInNewContext(legacyCacheRetirementWorker, {
      self: {
        addEventListener: (type: string, listener: (event: { waitUntil: (promise: Promise<unknown>) => void }) => void) => listeners.set(type, listener),
        skipWaiting: async () => actions.push("skip-waiting"),
        clients: { claim: async () => actions.push("claim") },
        registration: { unregister: async () => actions.push("unregister") },
      },
      caches: { keys: async () => ["pi-web-static-dev", "unrelated"], delete: async (key: string) => actions.push(`delete:${key}`) },
    });
    assert.equal(listeners.has("fetch"), false, "Replacement must let requests reach the server");
    let pending: Promise<unknown> = Promise.resolve();
    const event = { waitUntil: (promise: Promise<unknown>) => { pending = promise; } };
    listeners.get("install")?.(event);
    await pending;
    listeners.get("activate")?.(event);
    await pending;
    assert.deepEqual(actions, ["skip-waiting", "delete:pi-web-static-dev", "claim", "unregister"]);
  });
});
