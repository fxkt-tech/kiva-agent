import assert from "node:assert/strict";
import { it } from "node:test";
import { SessionListStore } from "../features/sessions/session-lists";
import type { SessionCollection, SessionListItem } from "../shared/workspace-contract";

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function row(projectId: string, collection: SessionCollection, name = "One"): SessionListItem {
  return { id: "one", projectId, collection, name, preview: "preview", path: "one.jsonl", createdAt: "2026-10-24", updatedAt: "2026-10-24", legacy: true };
}
function fixture() {
  const reads: Array<{ projectId: string; collection: SessionCollection; signal: AbortSignal; resolve(result: { collection: SessionCollection; sessions: SessionListItem[] }): void; reject(error: Error): void }> = [];
  const store = new SessionListStore((projectId, collection, signal) => new Promise((resolve, reject) => reads.push({ projectId, collection, signal, resolve, reject })));
  return { store, reads };
}

it("shares list data and refresh state, and one collapsed consumer cannot cancel the remaining demand", async () => {
  const { store, reads } = fixture();
  store.setCurrentProject("alpha");
  let notifications = 0;
  const sidebar = store.subscribe("alpha", "archived", () => {});
  const content = store.subscribe("alpha", "archived", () => notifications++);
  await settle();
  assert.equal(reads.length, 1);
  sidebar();
  assert.equal(reads[0].signal.aborted, false);
  reads[0].resolve({ collection: "archived", sessions: [row("alpha", "archived")] });
  await settle();
  assert.equal(store.snapshot("alpha", "archived").data?.length, 1);
  assert.ok(notifications > 0);
  store.invalidate("alpha");
  await settle();
  assert.equal(reads.length, 2);
  assert.equal(store.snapshot("alpha", "archived").refreshing, true);
  content();
  assert.equal(reads[1].signal.aborted, true, "the final consumer releases the request");
  store.invalidate("alpha");
  await settle();
  assert.equal(reads.length, 2, "collapsed/unmounted consumers do not refetch");
  const reopened = store.subscribe("alpha", "archived", () => {});
  await settle();
  assert.equal(reads.length, 3, "re-expansion demands the current generation");
  reopened();
});

it("batches demand to prioritize the current project and starts at most two background reads", async () => {
  const { store, reads } = fixture();
  const off = ["other-one", "other-two", "other-three", "current"].map((id) => store.subscribe(id, "active", () => {}));
  store.setCurrentProject("current");
  await settle();
  assert.deepEqual(reads.map((read) => read.projectId), ["current", "other-one", "other-two"]);
  reads[1].resolve({ collection: "active", sessions: [] });
  await settle();
  assert.deepEqual(reads.map((read) => read.projectId), ["current", "other-one", "other-two", "other-three"]);
  off.forEach((unsubscribe) => unsubscribe());
});

it("invalidates every collection of the mutated project, preserves unrelated lists and rejects late generations", async () => {
  const { store, reads } = fixture();
  store.setCurrentProject("alpha");
  const off = [store.subscribe("alpha", "active", () => {}), store.subscribe("alpha", "trash", () => {}), store.subscribe("beta", "active", () => {})];
  await settle();
  assert.equal(reads.length, 3);
  reads[2].resolve({ collection: "active", sessions: [row("beta", "active", "Beta")] });
  store.invalidate("alpha");
  await settle();
  assert.equal(reads.length, 5);
  assert.equal(reads[0].signal.aborted, true);
  assert.equal(reads[1].signal.aborted, true);
  reads[3].resolve({ collection: "active", sessions: [row("alpha", "active", "Renamed")] });
  reads[4].resolve({ collection: "trash", sessions: [] });
  await settle();
  reads[0].resolve({ collection: "active", sessions: [row("alpha", "active", "STALE")] });
  reads[1].resolve({ collection: "trash", sessions: [row("alpha", "trash", "STALE")] });
  await settle();
  assert.equal(store.snapshot("alpha", "active").data?.[0].name, "Renamed");
  assert.deepEqual(store.snapshot("alpha", "trash").data, []);
  assert.equal(store.snapshot("beta", "active").data?.[0].name, "Beta");
  assert.equal(reads.filter((read) => read.projectId === "beta").length, 1);
  off.forEach((unsubscribe) => unsubscribe());
});

it("shares errors without a retry loop and retries on explicit refresh or renewed demand", async () => {
  const { store, reads } = fixture();
  const first = store.subscribe("alpha", "active", () => {}), second = store.subscribe("alpha", "active", () => {});
  await settle();
  reads[0].reject(new Error("read failed"));
  await settle();
  assert.equal(store.snapshot("alpha", "active").error, "read failed");
  assert.equal(reads.length, 1);
  store.invalidate("alpha");
  await settle();
  reads[1].resolve({ collection: "active", sessions: [row("beta", "active")] });
  await settle();
  assert.match(store.snapshot("alpha", "active").error!, /标识与请求不匹配/);
  first(); second();
  const again = store.subscribe("alpha", "active", () => {});
  await settle();
  assert.equal(reads.length, 3);
  reads[2].resolve({ collection: "active", sessions: [] });
  await settle();
  assert.deepEqual(store.snapshot("alpha", "active").data, []);
  again();
});

it("retains complete confirmed rows across subscriptions and refreshes all demanded scopes explicitly", async () => {
  const { store, reads } = fixture();
  const offAlpha = store.subscribe("alpha", "active", () => {}), offBeta = store.subscribe("beta", "active", () => {});
  await settle();
  reads[0].resolve({ collection: "active", sessions: Array.from({ length: 150 }, (_, index) => ({ ...row("alpha", "active"), id: `s${index}`, name: `Session ${index}` })) });
  reads[1].resolve({ collection: "active", sessions: [] });
  await settle();
  assert.equal(store.snapshot("alpha", "active").data?.length, 150);
  offAlpha();
  const again = store.subscribe("alpha", "active", () => {});
  await settle();
  assert.equal(reads.length, 2, "a confirmed generation is shared, not refetched on mount");
  store.invalidate();
  await settle();
  assert.equal(reads.length, 4);
  again(); offBeta();
});
