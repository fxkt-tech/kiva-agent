import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useResource } from "../features/workspace/resources";

function Probe({ url, version = 0 }: { url: string; version?: number }) {
  const result = useResource<{ label: string }>(url, version);
  return createElement("button", { "data-label": result.data?.label, "data-loading": result.loading, "data-refreshing": result.refreshing, onClick: () => result.replace({ label: "confirmed save" }) });
}

it("keeps server-confirmed saves newer than in-flight reads and ignores replacements from another URL", async () => {
  const previous = globalThis.fetch;
  let resolve!: (response: Response) => void;
  globalThis.fetch = async (url) => url === "/old" ? new Promise<Response>((done) => { resolve = done; }) : Response.json({ label: "another project" });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(Probe, { url: "/old" })); });
    const replaceOld = renderer!.root.findByType("button").props.onClick;
    await act(() => replaceOld());
    assert.equal(renderer!.root.findByType("button").props["data-label"], "confirmed save");
    await act(async () => { resolve(Response.json({ label: "stale read" })); await new Promise<void>((done) => setImmediate(done)); });
    assert.equal(renderer!.root.findByType("button").props["data-label"], "confirmed save");
    await act(async () => { renderer!.update(createElement(Probe, { url: "/new" })); });
    await act(() => replaceOld());
    assert.equal(renderer!.root.findByType("button").props["data-label"], "another project");
  } finally { if (renderer) await act(() => renderer!.unmount()); globalThis.fetch = previous; }
});

it("marks retained data as refreshing, ignores older reads and preserves confirmed writes", async () => {
  const previous = globalThis.fetch;
  const pending: Array<(response: Response) => void> = [];
  let initial = true;
  globalThis.fetch = async () => {
    if (initial) { initial = false; return Response.json({ label: "initial" }); }
    return new Promise<Response>((resolve) => pending.push(resolve));
  };
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = create(createElement(Probe, { url: "/same", version: 0 })); });
    const oldReplace = renderer!.root.findByType("button").props.onClick;
    await act(async () => { renderer!.update(createElement(Probe, { url: "/same", version: 1 })); });
    assert.equal(renderer!.root.findByType("button").props["data-label"], "initial");
    assert.equal(renderer!.root.findByType("button").props["data-loading"], false);
    assert.equal(renderer!.root.findByType("button").props["data-refreshing"], true);
    await act(async () => { renderer!.update(createElement(Probe, { url: "/same", version: 2 })); });
    await act(async () => { pending[0](Response.json({ label: "older refresh" })); await new Promise<void>((done) => setImmediate(done)); });
    assert.equal(renderer!.root.findByType("button").props["data-label"], "initial");
    assert.equal(renderer!.root.findByType("button").props["data-refreshing"], true);
    await act(async () => { pending[1](Response.json({ label: "latest refresh" })); await new Promise<void>((done) => setImmediate(done)); });
    assert.equal(renderer!.root.findByType("button").props["data-label"], "latest refresh");
    assert.equal(renderer!.root.findByType("button").props["data-refreshing"], false);
    await act(async () => { renderer!.update(createElement(Probe, { url: "/same", version: 3 })); });
    await act(() => oldReplace());
    assert.equal(renderer!.root.findByType("button").props["data-label"], "confirmed save", "same-URL confirmed writes remain authoritative across refresh versions");
    assert.equal(renderer!.root.findByType("button").props["data-refreshing"], false);
    await act(async () => { pending[2](Response.json({ label: "read before save" })); await new Promise<void>((done) => setImmediate(done)); });
    assert.equal(renderer!.root.findByType("button").props["data-label"], "confirmed save");
  } finally { if (renderer) await act(() => renderer!.unmount()); globalThis.fetch = previous; }
});
