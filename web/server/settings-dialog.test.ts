import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { installUiMocks } from "./helpers/mock-ui";
import { settingsApi } from "../features/settings/api";
import { useInstallationModels } from "../features/settings/use-installation-models";
import { shortcutRegistry } from "../lib/shortcuts";
import { webPreferences } from "../lib/web-preferences";
import type { InstallationModelCatalog, InstallationSettings } from "../shared/installation-settings";

// Business state uses the public control contracts; browser coverage owns portal/focus behavior.
installUiMocks();
const { SettingsDialog } = await import("../features/settings/dialog");
const { Dialog } = await import("../components/ui/dialog");
const { Select } = await import("../components/ui/select");
const { Combobox } = await import("../components/ui/combobox");
const { Switch } = await import("../components/ui/switch");

const original = { fetch: globalThis.fetch, window: globalThis.window, navigator: globalThis.navigator };
const catalog: InstallationModelCatalog = { revision: "catalog_revision_1234", defaults: { provider: "fixture", modelId: "smart", thinkingLevel: "medium" }, models: [ { provider: "fixture", id: "smart", reasoning: true, contextWindow: 100000, thinkingLevels: ["off", "medium", "high"] }, { provider: "fixture", id: "plain", reasoning: false, contextWindow: 100000, thinkingLevels: ["off"] } ] };
function metadata(): InstallationSettings {
  return { revision: "settings_revision_1234", canAddProvider: true, versions: { app: "0.1.0", pi: "1.3.0" }, check: { status: "ok", checkedAt: "2026-10-21T12:00:00.000Z" }, providers: [
    { id: "fixture", name: "Fixture", kind: "configured", editable: true, definition: { id: "fixture", api: "openai-completions", baseUrl: "https://api.example.com/v1", models: [{ id: "smart", reasoning: true }] }, credential: { source: "none", configured: false, editable: true, revision: "credential_revision_1234" } },
    { id: "oauth-only", name: "OAuth only", kind: "builtin", editable: false, readOnlyReason: "内置定义只读", credential: { source: "oauth", configured: true, editable: false, revision: "credential_oauth_1234", readOnlyReason: "OAuth 不支持 API Key 编辑" } },
  ] };
}
function text(node: ReactTestInstance): string { return node.children.map((child) => typeof child === "string" ? child : text(child)).join(""); }
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };

describe("global settings dialog", () => {
  let renderer: ReactTestRenderer | undefined;
  let settings: InstallationSettings;
  let requests: { path: string; body?: Record<string, unknown> }[];
  let extra: ((path: string, body?: Record<string, unknown>) => Promise<Response | undefined>) | undefined;
  let closes: number;
  let copied: string;
  let clipboardFails: boolean;
  const events = new Map<string, Set<(event: unknown) => void>>();
  const root = () => renderer!.root;
  const button = (label: string) => root().findAllByType("button").find((node) => text(node) === label)!;
  const field = (label: string) => root().findAll((node) => (node.type === "input" || node.type === Select || node.type === Combobox) && (node.props["aria-label"] === label || node.props.label === label))[0];
  async function click(node: ReactTestInstance) { assert.ok(node, "expected control exists"); await act(async () => { node.props.onClick({ preventDefault() {}, stopPropagation() {} }); await settle(); }); }
  async function change(label: string, value: string) { await act(async () => {
    const control = field(label);
    if (control.props.onValueChange) {
      const option = control.props.options.find((option: { value: string | number }) => String(option.value) === value);
      control.props.onValueChange(option?.value ?? value);
    } else control.props.onChange({ target: { value } });
    await settle();
  }); }
  async function open() {
    function Harness() { const [models, setModels] = useState(catalog); return createElement(SettingsDialog, { catalog: models, modelsLoading: false, onCatalog: setModels, onReloadCatalog() {}, onClose() { closes++; } }); }
    await act(async () => { renderer = create(createElement(Harness)); await settle(); });
  }
  async function openWithCatalogReads() {
    function Harness() { const models = useInstallationModels(); return createElement(SettingsDialog, { catalog: models.data, modelsLoading: models.loading, onCatalog: models.replace, onReloadCatalog: models.reload, onClose() { closes++; } }); }
    await act(async () => { renderer = create(createElement(Harness)); await settle(); });
  }
  beforeEach(() => {
    settings = metadata(); requests = []; closes = 0; copied = ""; clipboardFails = false; extra = undefined; events.clear();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener(name: string, fn: (event: unknown) => void) { const items = events.get(name) ?? new Set(); items.add(fn); events.set(name, items); }, removeEventListener(name: string, fn: (event: unknown) => void) { events.get(name)?.delete(fn); } } });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { platform: "MacIntel", clipboard: { async writeText(value: string) { if (clipboardFails) throw new Error("denied"); copied = value; } } } });
    webPreferences.destroy(); webPreferences.resetGroup("appearance"); webPreferences.resetGroup("conversation"); webPreferences.resetGroup("shortcuts");
    globalThis.fetch = async (input, init) => {
      const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined; requests.push({ path, body });
      const override = await extra?.(path, body); if (override) return override;
      if (path === "/api/settings" && !body) return Response.json(settings);
      if (path === "/api/settings/models") return Response.json(catalog);
      if (path === "/api/settings/defaults") return Response.json({ ...catalog, revision: "catalog_confirmed_1234", defaults: { provider: body.provider, modelId: body.modelId, thinkingLevel: body.thinkingLevel } });
      if (path === "/api/settings/providers") {
        const definition = body.definition; settings = { ...settings, revision: "settings_confirmed_1234", providers: [...settings.providers.filter((item) => item.id !== definition.id), { id: definition.id, name: definition.id, kind: "configured", editable: true, definition, credential: { source: "none", configured: false, editable: true, revision: "credential_new_1234" } }] };
        return Response.json({ settings, catalog });
      }
      if (path.endsWith("/credential")) {
        settings = { ...settings, providers: settings.providers.map((provider) => provider.id === "fixture" ? { ...provider, credential: { ...provider.credential, configured: true, source: "stored", revision: "credential_saved_1234" } } : provider) };
        return Response.json({ settings, catalog });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    };
  });
  afterEach(async () => {
    if (renderer) await act(() => renderer!.unmount()); renderer = undefined;
    webPreferences.destroy(); globalThis.fetch = original.fetch;
    for (const [name, value] of [["window", original.window], ["navigator", original.navigator]] as const) Object.defineProperty(globalThis, name, { configurable: true, value });
  });

  it("opens five keyboard categories without commands and blocks global dispatch until unmount", async () => {
    await open();
    assert.deepEqual(root().findAllByProps({ role: "tab" }).map(text), ["外观", "快捷键", "模型", "会话", "关于"]);
    assert.equal(root().findByProps({ id: "settings-panel-models" }).props.hidden, true);
    const dispatch = () => shortcutRegistry.dispatch({ key: ",", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, preventDefault() {} });
    let invoked = 0; const unregister = shortcutRegistry.register("openSettings", { run() { invoked++; } });
    assert.equal(dispatch(), false); assert.equal(invoked, 0);
    let prevented = false;
    await act(() => root().findByProps({ role: "tablist" }).props.onKeyDown({ key: "End", preventDefault() { prevented = true; }, currentTarget: { querySelector: () => ({ focus() {} }) } }));
    assert.equal(prevented, true); assert.equal(root().findByProps({ id: "settings-tab-about" }).props["aria-selected"], true);
    assert.deepEqual(requests.map((item) => item.path), ["/api/settings"]);
    await act(() => renderer!.unmount()); renderer = undefined;
    assert.equal(dispatch(), true); assert.equal(invoked, 1); unregister();
  });

  it("auto-saves preferences with per-group reset and keeps only browser-safe fields", async () => {
    await open();
    assert.equal(field("视觉风格").props.value, "flat");
    assert.deepEqual(field("视觉风格").props.options.map((option: { label: string }) => option.label), ["扁平化", "新拟态", "瑞士风格"]);
    for (const style of ["neumorphic", "swiss", "flat", "swiss"]) {
      await change("视觉风格", style);
      assert.equal(field("视觉风格").props.value, style);
      assert.equal(field("主题").props.value, "system");
    }
    await change("主题", "dark"); await change("会话字号", "18");
    assert.equal(field("视觉风格").props.value, "swiss");
    await act(() => { const control = root().findAllByType(Switch).find((node) => node.props["aria-label"] === "代码自动换行")!; control.props.onCheckedChange(!control.props.checked); });
    await click(root().findByProps({ id: "settings-tab-conversation" })); await change("默认消息队列模式", "follow_up");
    assert.equal(webPreferences.getSnapshot().preferences.appearance.theme, "dark");
    assert.equal(webPreferences.getSnapshot().preferences.appearance.visualStyle, "swiss");
    assert.equal(webPreferences.getSnapshot().preferences.conversation.queueMode, "follow_up");
    await click(root().findByProps({ id: "settings-tab-appearance" }));
    await click(root().findByProps({ id: "settings-panel-appearance" }).findAllByType("button").find((node) => text(node) === "恢复本组默认")!);
    assert.equal(webPreferences.getSnapshot().preferences.appearance.theme, "system");
    assert.equal(field("视觉风格").props.value, "flat");
    assert.equal(webPreferences.getSnapshot().preferences.conversation.queueMode, "follow_up");
    assert.ok(root().findAllByProps({ role: "alert" }).some((node) => text(node).includes("偏好未持久保存")), "blocked storage must be honest");
    assert.equal(requests.filter((item) => item.body).length, 0);
  });

  it("configures the default workspace for new sessions and resets the conversation group", async () => {
    await open(); await click(root().findByProps({ id: "settings-tab-conversation" }));
    assert.equal(field("默认工作区").props.value, "current-branch");
    assert.deepEqual(field("默认工作区").props.options.map((option: { label: string }) => option.label), ["当前分支", "独立 worktree"]);
    assert.match(text(root().findByProps({ id: "settings-panel-conversation" })), /仅用于新建和继续会话.*包含未提交改动.*共享同一目录/);
    await change("默认工作区", "worktree");
    assert.equal(webPreferences.getSnapshot().preferences.conversation.workspaceMode, "worktree");
    await click(root().findByProps({ id: "settings-panel-conversation" }).findAllByType("button").find((node) => text(node) === "恢复本组默认")!);
    assert.equal(field("默认工作区").props.value, "current-branch");
    assert.equal(requests.filter((item) => item.body).length, 0, "workspace preference is browser-local");
  });

  it("records, rejects conflicts and protected keys, clears and resets shortcuts without executing", async () => {
    await open(); await click(root().findByProps({ id: "settings-tab-shortcuts" }));
    const recorder = () => root().findByProps({ "aria-label": "录制聚焦输入框快捷键" });
    async function record(key: string) { await click(recorder()); await act(() => recorder().props.onKeyDown({ key, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, nativeEvent: {}, preventDefault() {}, stopPropagation() {} })); }
    await record("k"); assert.match(text(root()), /已被其他操作使用/); assert.equal(webPreferences.getSnapshot().preferences.shortcuts.bindings.focusComposer, null);
    await record("r"); assert.match(text(root()), /浏览器或系统保留/);
    await record("g"); assert.equal(webPreferences.getSnapshot().preferences.shortcuts.bindings.focusComposer?.key, "g");
    await click(root().findByProps({ "aria-label": "清除聚焦输入框快捷键" })); assert.equal(webPreferences.getSnapshot().preferences.shortcuts.bindings.focusComposer, null);
    await change("发送消息快捷键", "mod-enter"); assert.equal(webPreferences.getSnapshot().preferences.shortcuts.sendMode, "mod-enter");
    await click(root().findByProps({ id: "settings-panel-shortcuts" }).findAllByType("button").find((node) => text(node) === "恢复本组默认")!);
    assert.equal(webPreferences.getSnapshot().preferences.shortcuts.sendMode, "enter"); assert.equal(requests.filter((item) => item.body).length, 0);
  });

  it("saves a complete supported model pair explicitly, retaining a failed candidate", async () => {
    await open(); await click(root().findByProps({ id: "settings-tab-models" }));
    await change("默认模型", JSON.stringify(["fixture", "plain"])); assert.equal(field("默认思考强度").props.value, "off");
    assert.equal(requests.filter((item) => item.body).length, 0);
    extra = async (path) => path === "/api/settings/defaults" ? Response.json({ code: "stale_revision", error: "SECRET_NOT_FOR_UI" }, { status: 409 }) : undefined;
    await click(button("保存默认模型")); assert.equal(field("默认模型").props.value, JSON.stringify(["fixture", "plain"])); assert.match(text(root()), /配置已在其他位置更改/); assert.doesNotMatch(text(root()), /SECRET_NOT_FOR_UI/);
    extra = undefined; await click(button("保存默认模型"));
    assert.deepEqual(requests.filter((item) => item.path === "/api/settings/defaults").at(-1)?.body, { provider: "fixture", modelId: "plain", thinkingLevel: "off", revision: catalog.revision });
    assert.ok(root().findAllByProps({ role: "status" }).some((node) => text(node).includes("默认模型已保存")));
    assert.equal(button("保存默认模型").props.disabled, true);
  });

  it("never displays malformed response snippets and retains the candidate for a safe retry", async () => {
    await open(); await change("默认思考强度", "high");
    extra = async (path) => path === "/api/settings/defaults" ? new Response("FAKE_SECRET_FROM_MALFORMED_RESPONSE", { status: 500 }) : undefined;
    await click(button("保存默认模型"));
    assert.match(text(root()), /无法读取设置服务的响应/); assert.doesNotMatch(text(root()), /FAKE_SECRET_FROM_MALFORMED_RESPONSE/);
    assert.equal(field("默认思考强度").props.value, "high"); assert.equal(button("保存默认模型").props.disabled, false);
    extra = undefined; await click(button("保存默认模型")); assert.equal(button("保存默认模型").props.disabled, true);
  });

  it("reports ambiguous credential failures as unconfirmed persistence rather than definitely unsaved", async () => {
    await open(); await change("选择提供方", "fixture"); await change("API Key", "FAKE_AMBIGUOUS_KEY");
    extra = async (path) => path.endsWith("/credential") ? Response.json({ code: "credential_save_failed", error: "UNTRUSTED_SECRET_DETAIL" }, { status: 409 }) : undefined;
    await click(button("保存 API Key"));
    const feedback = root().findAllByProps({ role: "alert" }).find((node) => text(node).includes("配置保存未确认"))!;
    assert.match(text(feedback), /API Key 保存未确认，请重新加载认证状态后重试/);
    assert.doesNotMatch(text(feedback), /API Key 未保存|UNTRUSTED_SECRET_DETAIL/);
    assert.equal(field("API Key").props.value, "FAKE_AMBIGUOUS_KEY");
  });

  it("requires discard for dirty server forms, never for automatic preferences", async () => {
    await open(); await change("主题", "dark"); await click(root().findByProps({ "aria-label": "关闭设置" })); assert.equal(closes, 1);
    await click(root().findByProps({ id: "settings-tab-models" })); await change("默认思考强度", "high");
    await click(root().findByProps({ "aria-label": "关闭设置" })); assert.equal(closes, 1); assert.ok(root().findByProps({ role: "alertdialog" }));
    await click(button("继续编辑")); assert.equal(root().findAllByProps({ role: "alertdialog" }).length, 0); assert.equal(field("默认思考强度").props.value, "high");
    await click(root().findByProps({ "aria-label": "关闭设置" })); await click(button("放弃修改")); assert.equal(closes, 2);
  });

  it("blocks duplicate mutation and Escape/backdrop dismissal until persistence is confirmed", async () => {
    await open(); await change("默认思考强度", "high");
    const gate = deferred<Response>(); extra = async (path) => path === "/api/settings/defaults" ? gate.promise : undefined;
    await act(async () => { button("保存默认模型").props.onClick(); await settle(); });
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, true);
    for (const reason of ["escape-key", "outside-press"]) {
      await act(() => root().findByType(Dialog).props.onOpenChange(false, { reason, cancel() {} }));
      assert.equal(closes, 0);
    }
    await act(async () => { button("正在保存…").props.onClick(); await settle(); }); assert.equal(requests.filter((item) => item.body).length, 1);
    await act(async () => { gate.resolve(Response.json({ ...catalog, revision: "catalog_confirmed_1234", defaults: { ...catalog.defaults!, thinkingLevel: "high" } })); await settle(); });
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
  });

  it("saves provider definition before offering a separate key action and retains drafts across categories", async () => {
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("新增提供方"));
    await change("提供方 ID", "new-provider"); await change("API 地址", "https://example.test/v1"); await change("模型 1 ID", "new-model");
    await click(root().findByProps({ id: "settings-tab-about" })); await click(root().findByProps({ id: "settings-tab-models" })); assert.equal(field("API 地址").props.value, "https://example.test/v1");
    assert.equal(field("API Key"), undefined); await click(button("保存提供方"));
    assert.equal(requests.filter((item) => item.body).length, 1); assert.equal(requests.find((item) => item.body)?.path, "/api/settings/providers");
    assert.equal(field("提供方 ID").props.disabled, true); assert.equal(field("API Key").props.value, "");
    assert.match(text(root()), /未配置认证/); assert.equal(button("保存 API Key").props.disabled, true);
  });

  it("rejects an existing provider ID in the add form instead of silently updating that provider", async () => {
    await open(); await click(button("新增提供方"));
    await change("提供方 ID", "fixture"); await change("API 地址", "https://replacement.test/v1"); await change("模型 1 ID", "different-model");
    assert.equal(field("提供方 ID").props["aria-invalid"], true);
    assert.match(text(root()), /提供方 ID 已存在.*请使用不同 ID，或选择现有提供方进行编辑/);
    assert.equal(button("保存提供方").props.disabled, true);
    await click(button("保存提供方"));
    assert.equal(requests.filter((item) => item.body).length, 0, "the submit handler must also reject a duplicate add candidate");
    assert.equal(settings.providers[0].definition?.baseUrl, "https://api.example.com/v1");
    await change("提供方 ID", "oauth-only"); assert.equal(button("保存提供方").props.disabled, true);
    await change("提供方 ID", "Fixture"); assert.equal(button("保存提供方").props.disabled, false, "identity is case-sensitive; do not invent lower-case normalization");
    assert.equal(field("提供方 ID").props["aria-invalid"], undefined);
    assert.equal(requests.filter((item) => item.body).length, 0);
  });

  it("keeps the new model editor open while typing and respects manual collapse", async () => {
    await open(); await click(button("新增提供方"));
    const editor = () => root().findByProps({ className: "settings-model-editor" });
    assert.equal(editor().props.open, true);
    await change("模型 1 ID", "m"); assert.equal(editor().props.open, true);
    await change("模型 1 ID", "model-complete"); assert.equal(editor().props.open, true);
    await act(() => editor().props.onToggle({ currentTarget: { open: false } }));
    await change("提供方 ID", "test-provider"); assert.equal(editor().props.open, false);
  });

  it("recovers a stale default save only after explicit reload while retaining the candidate", async () => {
    await openWithCatalogReads(); await change("默认思考强度", "high");
    let fresh = false;
    extra = async (path, body) => {
      if (path === "/api/settings/defaults" && !fresh) return Response.json({ code: "configuration_conflict" }, { status: 409 });
      if (path === "/api/settings/models") { fresh = true; return Response.json({ ...catalog, revision: "catalog_external_1234", defaults: { ...catalog.defaults!, thinkingLevel: "off" } }); }
      if (path === "/api/settings/defaults" && body) { assert.equal(body.revision, "catalog_external_1234"); return Response.json({ ...catalog, revision: "catalog_saved_1234", defaults: { ...catalog.defaults!, thinkingLevel: body.thinkingLevel } }); }
    };
    await click(button("保存默认模型")); assert.match(text(root()), /配置已在其他位置更改/);
    await click(button("重新加载模型")); assert.equal(field("默认思考强度").props.value, "high");
    await click(button("保存默认模型")); assert.equal(button("保存默认模型").props.disabled, true); assert.equal(requests.filter((item) => item.path === "/api/settings/defaults").length, 2);
  });

  it("recovers stale provider and key saves by explicitly reloading safe metadata without discarding candidates", async () => {
    await open(); await change("选择提供方", "fixture"); await change("API 地址", "https://candidate.test/v1");
    let stale = true;
    extra = async (path, body) => {
      if (path === "/api/settings/providers" && stale) return Response.json({ code: "configuration_conflict" }, { status: 409 });
      if (path === "/api/settings" && !body) { stale = false; settings = { ...settings, revision: "settings_external_1234" }; return Response.json(settings); }
      if (path === "/api/settings/providers" && body) { assert.equal(body.revision, "settings_external_1234"); return undefined; }
    };
    await click(button("保存提供方")); await click(button("重新加载配置")); assert.equal(field("API 地址").props.value, "https://candidate.test/v1");
    await click(button("保存提供方")); assert.equal(button("保存提供方").props.disabled, true);
    await change("API Key", "KEY_RETRY_SENTINEL");
    let keyStale = true;
    extra = async (path, body) => {
      if (path.endsWith("/credential") && keyStale) return Response.json({ code: "configuration_conflict" }, { status: 409 });
      if (path === "/api/settings" && !body) { keyStale = false; settings = { ...settings, providers: settings.providers.map((provider) => provider.id === "fixture" ? { ...provider, credential: { ...provider.credential, revision: "credential_external_1234" } } : provider) }; return Response.json(settings); }
      if (path.endsWith("/credential") && body) assert.equal(body.revision, "credential_external_1234");
    };
    await click(button("保存 API Key")); await click(button("重新加载配置")); assert.equal(field("API Key").props.value, "KEY_RETRY_SENTINEL");
    await click(button("保存 API Key")); assert.equal(field("API Key").props.value, "");
  });

  it("pins a dirty credential's observed revision across automatic metadata refreshes", async () => {
    await open(); await change("选择提供方", "fixture"); await change("API Key", "FAKE_STALE_CANDIDATE"); await change("API 地址", "https://candidate.test/v1");
    const savedDefinition = { ...settings.providers[0].definition!, baseUrl: "https://candidate.test/v1" };
    extra = async (path) => {
      if (path === "/api/settings/providers") {
        settings = { ...settings, revision: "settings_external_1234", providers: settings.providers.map((provider) => provider.id === "fixture" ? { ...provider, definition: savedDefinition, credential: { ...provider.credential, revision: "credential_external_1234" } } : provider) };
        return Response.json({ settings, catalog });
      }
      if (path.endsWith("/credential")) return Response.json({ code: "configuration_conflict" }, { status: 409 });
    };
    await click(button("保存提供方")); assert.equal(field("API Key").props.value, "FAKE_STALE_CANDIDATE");
    await click(button("保存 API Key")); assert.equal(requests.at(-1)?.body?.revision, "credential_revision_1234", "an automatic metadata refresh must not rebase a dirty credential");
    await click(button("重新加载配置")); assert.equal(field("API Key").props.value, "FAKE_STALE_CANDIDATE");
    extra = async (path, body) => { if (path.endsWith("/credential")) assert.equal(body?.revision, "credential_external_1234"); return undefined; };
    await click(button("保存 API Key")); assert.equal(field("API Key").props.value, "");
  });

  it("keeps secret input only in component memory and clears on successful key save/cancel/remount", async () => {
    await open(); await change("选择提供方", "fixture"); await change("API Key", "FAKE_SECRET_SENTINEL");
    assert.doesNotMatch(JSON.stringify(webPreferences.getSnapshot()), /FAKE_SECRET_SENTINEL/);
    await click(button("保存 API Key")); assert.equal(field("API Key").props.value, "");
    assert.equal(requests.at(-1)?.path, "/api/settings/providers/fixture/credential"); assert.deepEqual(requests.at(-1)?.body, { revision: "credential_revision_1234", apiKey: "FAKE_SECRET_SENTINEL" });
    assert.match(text(root()), /已配置认证/); assert.doesNotMatch(text(root()), /FAKE_SECRET_SENTINEL/);
    await change("API Key", "CANCEL_SECRET"); await click(button("取消密钥修改")); assert.equal(field("API Key").props.value, "");
    await change("API Key", "UNMOUNT_SECRET"); await act(() => renderer!.unmount()); renderer = undefined;
    await open(); await change("选择提供方", "fixture"); assert.equal(field("API Key").props.value, "");
  });

  it("treats prototype-like but valid provider IDs as exact identities rather than inherited draft fields", async () => {
    const provider = settings.providers[0];
    settings = { ...settings, providers: [{ ...provider, id: "toString", definition: { ...provider.definition!, id: "toString" } }] };
    await open(); await change("选择提供方", "toString");
    assert.equal(field("提供方 ID").props.value, "toString"); assert.equal(field("API Key").props.value, ""); assert.equal(button("保存 API Key").props.disabled, true);
    await change("API Key", "FAKE_LITERAL"); await click(button("取消密钥修改")); assert.equal(field("API Key").props.value, "");
  });

  it("does not flatten read-only auth, and truthfully separates saved credentials from catalog refresh", async () => {
    await open(); await change("选择提供方", "oauth-only"); assert.equal(field("API Key"), undefined); assert.equal(field("API 地址"), undefined); assert.match(text(root()), /OAuth 不支持 API Key 编辑/);
    await change("选择提供方", "fixture"); await change("API Key", "FAKE_ONLY");
    extra = async (path) => path.endsWith("/credential") ? Response.json({ settings, warning: "凭证已保存，但模型列表暂不可用。" }) : undefined;
    await click(button("保存 API Key")); assert.equal(field("API Key").props.value, ""); assert.ok(root().findAllByProps({ role: "alert" }).some((node) => text(node).includes("已保存，状态待确认")));
  });

  it("copies an allowlisted diagnostic only and reports real clipboard failures", async () => {
    await open(); await change("选择提供方", "fixture"); await change("API Key", "SECRET_NOT_IN_DIAGNOSTIC"); await click(root().findByProps({ id: "settings-tab-about" }));
    clipboardFails = true; await click(button("复制诊断信息")); assert.equal(copied, ""); assert.match(text(root()), /浏览器未允许剪贴板/);
    clipboardFails = false; await click(button("复制诊断信息")); const diagnostic = JSON.parse(copied);
    assert.deepEqual(Object.keys(diagnostic), ["application", "versions", "preferences", "backend"]); assert.doesNotMatch(copied, /SECRET|api\.example|fixture|\/repo|providers/);
    assert.equal(requests.filter((item) => item.body).length, 0); await click(button("检查后端")); assert.equal(requests.filter((item) => item.path === "/api/settings").length, 2);
  });

  it("ignores a late metadata read after a confirmed provider save", async () => {
    await open(); await change("选择提供方", "fixture"); await change("API 地址", "https://changed.test/v1");
    const gate = deferred<Response>(); extra = async (path, body) => path === "/api/settings" && !body ? gate.promise : undefined;
    await click(button("重新加载配置") ?? button("检查后端"));
    await click(button("保存提供方")); assert.equal(field("API 地址").props.value, "https://changed.test/v1");
    await act(async () => { gate.resolve(Response.json(metadata())); await settle(); });
    assert.equal(field("API 地址").props.value, "https://changed.test/v1"); assert.equal(field("选择提供方").props.options.find((option: { value: string }) => option.value === "fixture")?.label, "fixture · 已配置");
  });
});

it("installation catalog confirmed writes defeat older reads even without a project", async () => {
  const gate = deferred<Response>(); const fetch = globalThis.fetch;
  let renderer: ReactTestRenderer | undefined;
  let observed: ReturnType<typeof useInstallationModels>;
  globalThis.fetch = async () => gate.promise;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  function Harness() { observed = useInstallationModels(); return createElement("span", null, observed.data?.defaults?.thinkingLevel ?? "loading"); }
  try {
    await act(() => { renderer = create(createElement(Harness)); });
    const confirmed: InstallationModelCatalog = { ...catalog, revision: "catalog_confirmed_1234", defaults: { ...catalog.defaults!, thinkingLevel: "high" } };
    await act(() => observed.replace(confirmed));
    await act(async () => { gate.resolve(Response.json(catalog)); await settle(); });
    assert.equal(text(renderer!.root), "high"); assert.equal(observed!.loading, false);
  } finally { if (renderer) await act(() => renderer!.unmount()); globalThis.fetch = fetch; }
});

it("settings transport hides network error details but preserves cancellation semantics", async () => {
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("NETWORK_SECRET_SENTINEL https://private.example/?key=secret"); };
    await assert.rejects(settingsApi.read(), (error: unknown) => error instanceof Error && error.message === "无法读取设置服务的响应，请重新加载后重试。");
    const controller = new AbortController(); controller.abort();
    const cancellation = new DOMException("cancelled", "AbortError");
    globalThis.fetch = async () => { throw cancellation; };
    await assert.rejects(settingsApi.read(controller.signal), (error: unknown) => error === cancellation);
  } finally { globalThis.fetch = fetch; }
});
