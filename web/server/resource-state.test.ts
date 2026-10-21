import assert from "node:assert/strict";
import { it } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { useResource } from "../features/workspace/resources";

function Probe({ url }: { url: string }) {
  const result = useResource<{ label: string }>(url);
  return createElement("button", { "data-label": result.data?.label, onClick: () => result.replace({ label: "confirmed save" }) });
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
