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
  async function editDefaults() {
    await click(root().findByProps({ id: "settings-tab-models" }));
    if (!field("默认思考强度")) await click(button("修改默认模型"));
  }
  async function providers() {
    await click(root().findByProps({ id: "settings-tab-models" }));
    const back = root().findAllByProps({ "aria-label": "返回模型首页" })[0];
    if (back) await click(back);
    await click(button("管理提供方"));
  }
  async function manageProvider(id: string) {
    await providers();
    await click(root().findByProps({ "aria-label": `管理提供方 ${id}` }));
  }
  async function startNewProvider() { await providers(); await click(button("新增提供方")); }
  async function change(label: string, value: string) {
    if (label === "选择提供方") { await manageProvider(value); return; }
    if (label === "默认模型" || label === "默认思考强度") await editDefaults();
    await act(async () => {
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
        const definition = body.definition; const existing = settings.providers.find((provider) => provider.id === definition.id); settings = { ...settings, revision: "settings_confirmed_1234", providers: [...settings.providers.filter((item) => item.id !== definition.id), { id: definition.id, name: definition.id, kind: "configured", editable: true, definition, credential: existing?.credential ?? { source: "none", configured: false, editable: true, revision: "credential_new_1234" } }] };
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

  function openAIMetadata(source: "none" | "stored" | "oauth" = "none") {
    settings = { ...settings, providers: [...settings.providers.filter((entry) => entry.id !== "openai"), { id: "openai", name: "OpenAI", kind: "builtin", editable: false, authorization: { canLogin: true, canLogout: source === "oauth" }, credential: { source, configured: source !== "none", editable: source !== "oauth", revision: `openai_revision_${source}_1234` } }] };
    return settings;
  }
  const authRoute = "/api/settings/providers/openai/oauth";
  const authAttempt = (id = "auth_attempt_first_123456") => ({ id, status: "awaiting_authorization", expiresAt: "2027-01-01T00:00:00.000Z", authorizationUrl: "https://auth.openai.com/api/accounts/authorize?state=fixture", promptId: "auth_prompt_first_123456" });

  it("lists every available model with its provider, marks the default and searches without changing configuration", async () => {
    const models = [...catalog.models, { ...catalog.models[0], provider: "another-provider" }, ...["third", "fourth", "fifth"].map((id) => ({ ...catalog.models[0], id }))];
    extra = async (path) => path === "/api/settings/models" ? Response.json({ ...catalog, models }) : undefined;
    await openWithCatalogReads(); await click(root().findByProps({ id: "settings-tab-models" }));
    const list = () => root().findByProps({ "aria-label": "可用模型列表" });
    const rows = () => list().findAllByProps({ className: "settings-row" }).map((row) => ({ id: text(row.findByType("strong")), provider: text(row.findByType("p")), status: text(row.findByProps({ className: "settings-row-control" })) }));
    assert.deepEqual(rows().map(({ id, provider }) => ({ id, provider })), models.map((model) => ({ id: model.id, provider: `提供方 · ${model.provider}` })));
    assert.deepEqual(rows().filter((row) => row.status === "默认").map(({ id, provider }) => ({ id, provider })), [{ id: "smart", provider: "提供方 · fixture" }]);
    await act(() => root().findByProps({ "aria-label": "搜索可用模型" }).props.onChange({ target: { value: "ANOTHER-provider" } }));
    assert.deepEqual(rows(), [{ id: "smart", provider: "提供方 · another-provider", status: "" }]);
    await act(() => root().findByProps({ "aria-label": "搜索可用模型" }).props.onChange({ target: { value: "missing" } }));
    assert.match(text(list()), /没有匹配的模型/);
    const reads = requests.filter((request) => request.path === "/api/settings/models").length;
    await click(button("刷新列表"));
    assert.equal(requests.filter((request) => request.path === "/api/settings/models").length, reads + 1);
    assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("opens a passive model home with explicit setup entries and no visible connection or login forms", async () => {
    openAIMetadata(); await open(); await click(root().findByProps({ id: "settings-tab-models" }));
    const panel = root().findByProps({ id: "settings-panel-models" });
    assert.ok(button("添加模型")); assert.ok(button("管理提供方")); assert.ok(button("修改默认模型"));
    assert.match(text(panel), /fixture \/ smart · medium/);
    assert.equal(field("API Key"), undefined); assert.equal(field("API 地址"), undefined);
    assert.equal(button("使用 ChatGPT 登录"), undefined); assert.equal(field("默认模型"), undefined);
    assert.equal(requests.filter((request) => request.body).length, 0);
    await click(button("添加模型"));
    assert.deepEqual(field("添加到提供方").props.options.map((option: { value: string }) => option.value), ["fixture", "__new"]);
    assert.ok(button("管理提供方认证")); assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("uses the same single heading and continuous setting-row composition as the other settings categories", async () => {
    await open();
    for (const id of ["appearance", "conversation"]) {
      const panel = root().findByProps({ id: `settings-panel-${id}` });
      assert.equal(panel.findAllByProps({ className: "settings-section-heading" }).length, 1);
      assert.ok(panel.findByProps({ className: "settings-section-heading" }).findByType("p"));
      assert.ok(panel.findAllByProps({ className: "settings-row" }).length > 0);
    }
    await click(root().findByProps({ id: "settings-tab-models" }));
    const home = root().findByProps({ className: "settings-model-view" });
    const headings = home.findAllByProps({ className: "settings-section-heading" });
    assert.equal(headings.length, 1); assert.equal(text(headings[0].findByType("h3")), "模型"); assert.ok(headings[0].findByType("p"));
    assert.equal(home.findAllByProps({ className: "settings-section" }).length, 0);
    assert.equal(root().findAllByProps({ className: "settings-models-navigation" }).length, 0);
    const rows = home.findAllByProps({ className: "settings-row" });
    assert.deepEqual(rows.map((row) => text(row.findByType("strong"))), ["默认模型", "ChatGPT / Codex 订阅", "提供方", "可用模型", "smart", "plain"]);
    const catalogActions = rows[3].findByProps({ className: "settings-row-control" }).findByProps({ className: "settings-shortcut-actions" });
    assert.deepEqual(catalogActions.findAllByType("button").map(text), ["添加模型", "刷新列表"]);
    assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("keeps category focus on its tab and focuses headings only for inner model navigation", async () => {
    let headingFocus = 0;
    await act(async () => {
      renderer = create(createElement(SettingsDialog, { catalog, modelsLoading: false, onCatalog() {}, onReloadCatalog() {}, onClose() {} }), {
        createNodeMock: (element) => element.type === "h3" ? { focus() { headingFocus++; } } : null,
      });
      await settle();
    });
    await click(root().findByProps({ id: "settings-tab-models" }));
    assert.equal(headingFocus, 0, "entering Models must preserve the category tab's focus");
    await click(button("管理提供方"));
    assert.equal(headingFocus, 1, "inner navigation announces its new context through the heading");
    await click(root().findByProps({ id: "settings-tab-about" }));
    await click(root().findByProps({ id: "settings-tab-models" }));
    assert.equal(headingFocus, 1, "returning to the category must not steal tab focus");
    await click(root().findByProps({ "aria-label": "管理提供方 fixture" }));
    assert.equal(headingFocus, 2);
  });

  it("adds one model to the complete existing definition without changing connection, old models or defaults", async () => {
    settings.providers[0] = { ...settings.providers[0], credential: { ...settings.providers[0].credential, configured: true, source: "stored" } };
    const baseline = structuredClone(settings.providers[0].definition!);
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("添加模型"));
    await change("添加到提供方", "fixture"); await click(button("下一步"));
    assert.equal(field("API 地址"), undefined); assert.equal(field("API Key"), undefined);
    await change("模型 2 ID", "smart"); assert.equal(button("保存模型").props.disabled, true);
    await click(button("保存模型")); assert.equal(requests.filter((request) => request.body).length, 0);
    await change("模型 2 ID", "new-model"); await change("模型 2 名称", "New model"); await click(button("保存模型"));
    assert.deepEqual(requests.find((request) => request.path === "/api/settings/providers")?.body, { revision: "settings_revision_1234", definition: { ...baseline, models: [...baseline.models, { id: "new-model", name: "New model" }] } });
    assert.equal(requests.filter((request) => request.path === "/api/settings/defaults").length, 0);
    assert.equal(requests.filter((request) => request.path.endsWith("/credential")).length, 0);
    assert.equal(field("API Key"), undefined); assert.ok(button("完成"));
  });

  it("keeps a saved new provider and retries only credential persistence after a key failure", async () => {
    let keyAttempts = 0;
    extra = async (path) => {
      if (path === "/api/settings/providers/new-provider/credential") {
        if (++keyAttempts === 1) return Response.json({ code: "configuration_conflict" }, { status: 409 });
        settings = { ...settings, providers: settings.providers.map((provider) => provider.id === "new-provider" ? { ...provider, credential: { ...provider.credential, configured: true, source: "stored" } } : provider) };
        return Response.json({ settings, catalog });
      }
    };
    await open(); await startNewProvider();
    await change("提供方 ID", "new-provider"); await change("API 地址", "https://new.test/v1"); await change("模型 1 ID", "first-model");
    assert.equal(requests.filter((request) => request.body).length, 0);
    await click(button("保存模型")); assert.match(text(root()), /已保存，待配置认证/);
    await change("API Key", "NEW_KEY_SENTINEL"); await click(button("保存 API Key"));
    assert.equal(field("API Key").props.value, "NEW_KEY_SENTINEL"); assert.match(text(root()), /配置已在其他位置更改/);
    await click(button("保存 API Key"));
    assert.equal(field("API Key"), undefined); assert.ok(button("完成"));
    assert.equal(requests.filter((request) => request.path === "/api/settings/providers").length, 1);
    assert.equal(requests.filter((request) => request.path.endsWith("/credential")).length, 2);
    assert.equal(requests.filter((request) => request.path.endsWith("/credential"))[0].body?.revision, "credential_new_1234");
    assert.equal(requests.filter((request) => request.path === "/api/settings/defaults").length, 0);
  });

  it("exposes immutable built-in definitions and editable authentication as separate capabilities", async () => {
    openAIMetadata(); await open(); await manageProvider("openai");
    assert.equal(field("API 地址"), undefined); assert.equal(button("保存提供方"), undefined);
    assert.ok(field("API Key")); assert.ok(button("使用 ChatGPT 登录"));
    await change("API Key", "UNSAVED_BUILTIN_KEY");
    await click(root().findByProps({ "aria-label": "返回模型首页" }));
    assert.match(text(root().findByProps({ role: "alertdialog" })), /放弃当前修改/);
    await click(button("继续编辑")); assert.equal(field("API Key").props.value, "UNSAVED_BUILTIN_KEY");
    await click(root().findByProps({ "aria-label": "返回模型首页" })); await click(button("放弃当前修改"));
    assert.equal(field("API Key"), undefined); await manageProvider("openai"); assert.equal(field("API Key").props.value, "");
    assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("retains a single authorization attempt and reachable cancellation across inner and category navigation", async () => {
    openAIMetadata();
    extra = async (path) => path === authRoute ? Response.json(authAttempt()) : path.endsWith("/cancel") ? Response.json({ ...authAttempt(), status: "cancelled", authorizationUrl: undefined, promptId: undefined }) : undefined;
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录"));
    await click(root().findByProps({ "aria-label": "返回模型首页" }));
    assert.equal(button("取消授权"), undefined); assert.ok(button("返回授权"));
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, true);
    await click(root().findByProps({ id: "settings-tab-about" })); await click(root().findByProps({ id: "settings-tab-models" }));
    await click(button("返回授权")); assert.ok(button("取消授权"));
    assert.equal(requests.filter((request) => request.path === authRoute).length, 1);
    await click(button("取消授权")); assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
    assert.equal(requests.filter((request) => request.path.endsWith("/cancel")).length, 1);
  });

  it("retains dirty defaults while visiting provider management and only saves defaults explicitly", async () => {
    await open(); await change("默认思考强度", "high");
    await click(button("管理提供方")); await click(root().findByProps({ "aria-label": "管理提供方 fixture" }));
    await click(root().findByProps({ "aria-label": "返回模型首页" }));
    assert.equal(field("默认思考强度").props.value, "high");
    await click(root().findByProps({ "aria-label": "关闭设置" })); assert.ok(root().findByProps({ role: "alertdialog" })); await click(button("继续编辑"));
    assert.equal(requests.filter((request) => request.body).length, 0);
    await click(button("取消修改")); assert.equal(field("默认思考强度"), undefined);
    assert.match(text(root().findByProps({ "aria-label": "默认模型设置" })), /fixture \/ smart · medium/);
  });

  it("can cancel a retained default edit after its available catalog becomes empty", async () => {
    await openWithCatalogReads(); await change("默认思考强度", "high");
    extra = async (path) => path === "/api/settings/models" ? Response.json({ ...catalog, revision: "catalog_empty_revision", models: [] }) : undefined;
    await click(button("刷新列表"));
    assert.equal(field("默认模型"), undefined);
    assert.equal(button("保存默认模型").props.disabled, true);
    await click(button("取消修改"));
    assert.ok(button("修改默认模型"));
    await click(root().findByProps({ "aria-label": "关闭设置" }));
    assert.equal(closes, 1, "the unavailable-model candidate must not leave a stale dirty close guard");
    assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("blocks definitions that lose edit capability during a staged add, while retaining the candidate", async () => {
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("添加模型"));
    await change("添加到提供方", "fixture"); await click(button("下一步")); await change("模型 2 ID", "candidate");
    extra = async (path) => {
      if (path === "/api/settings/providers") return Response.json({ code: "configuration_conflict" }, { status: 409 });
      if (path === "/api/settings") { settings = { ...settings, providers: settings.providers.map((provider) => provider.id === "fixture" ? { ...provider, editable: false, readOnlyReason: "高级配置只读" } : provider) }; return Response.json(settings); }
    };
    await click(button("保存模型")); await click(button("重新加载配置"));
    assert.equal(field("模型 2 ID").props.value, "candidate"); assert.equal(button("保存模型").props.disabled, true);
    assert.match(text(root()), /高级配置只读/);
    await click(button("保存模型")); assert.equal(requests.filter((request) => request.path === "/api/settings/providers").length, 1);
  });

  it("keeps definition saved-with-warning distinct from unsaved model setup", async () => {
    extra = async (path, body) => {
      if (path === "/api/settings/providers" && body) {
        const definition = body.definition as NonNullable<InstallationSettings["providers"][number]["definition"]>;
        settings = { ...settings, providers: [...settings.providers, { id: definition.id, name: definition.id, kind: "configured", editable: true, definition, credential: { source: "none", configured: false, editable: true, revision: "credential_warning_1234" } }] };
        return Response.json({ settings, warning: "模型配置已保存，但列表需要重新加载。" });
      }
    };
    await open(); await startNewProvider(); await change("提供方 ID", "warning-provider"); await change("API 地址", "https://warning.test/v1"); await change("模型 1 ID", "warning-model");
    await click(button("保存模型"));
    assert.ok(root().findByProps({ "aria-label": "模型认证步骤" })); assert.match(text(root()), /已保存，状态待确认.*模型配置已保存/);
    assert.equal(field("提供方 ID"), undefined); await change("API Key", "WARNING_KEY_SENTINEL");
    assert.equal(requests.filter((request) => request.path === "/api/settings/providers").length, 1);
  });

  it("rejects a full provider even when the disabled selection is invoked programmatically", async () => {
    const provider = settings.providers[0];
    settings.providers[0] = { ...provider, definition: { ...provider.definition!, models: Array.from({ length: 200 }, (_, index) => ({ id: `model-${index}` })) } };
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("添加模型"));
    assert.equal(field("添加到提供方").props.options.find((option: { value: string }) => option.value === "fixture").disabled, true);
    await change("添加到提供方", "fixture"); await click(button("下一步"));
    assert.equal(root().findAllByProps({ "aria-label": "添加模型表单" }).length, 0);
    assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("checks the merged model limit after reloading a concurrently expanded provider", async () => {
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("添加模型"));
    await change("添加到提供方", "fixture"); await click(button("下一步")); await change("模型 2 ID", "candidate");
    extra = async (path) => {
      if (path === "/api/settings/providers") return Response.json({ code: "configuration_conflict" }, { status: 409 });
      if (path === "/api/settings") {
        const provider = settings.providers[0];
        settings = { ...settings, revision: "settings_expanded_1234", providers: [{ ...provider, definition: { ...provider.definition!, models: [{ id: "smart" }, ...Array.from({ length: 199 }, (_, index) => ({ id: `external-${index}` }))] } }, ...settings.providers.slice(1)] };
        return Response.json(settings);
      }
    };
    await click(button("保存模型")); await click(button("重新加载配置"));
    assert.equal(field("模型 2 ID").props.value, "candidate");
    assert.equal(button("保存模型").props.disabled, true, "the preserved candidate would merge into 201 models");
    await click(button("保存模型"));
    assert.equal(requests.filter((request) => request.path === "/api/settings/providers").length, 1);
  });

  it("guards pending model saves from duplicate writes and leaving the staged form", async () => {
    const gate = deferred<Response>();
    extra = async (path) => path === "/api/settings/providers" ? gate.promise : undefined;
    await open(); await startNewProvider(); await change("提供方 ID", "pending-provider"); await change("API 地址", "https://pending.test/v1"); await change("模型 1 ID", "pending-model");
    await click(button("保存模型"));
    assert.equal(root().findByProps({ "aria-label": "返回模型首页" }).props.disabled, true);
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, true);
    await click(button("正在保存…")); assert.equal(requests.filter((request) => request.body).length, 1);
    const definition = { id: "pending-provider", api: "openai-completions" as const, baseUrl: "https://pending.test/v1", models: [{ id: "pending-model" }] };
    settings = { ...settings, providers: [...settings.providers, { id: definition.id, name: definition.id, kind: "configured", editable: true, definition, credential: { source: "none", configured: false, editable: true, revision: "credential_pending_1234" } }] };
    await act(async () => { gate.resolve(Response.json({ settings, catalog })); await settle(); });
    assert.ok(root().findByProps({ "aria-label": "模型认证步骤" }));
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
    assert.equal(requests.filter((request) => request.body).length, 1);
  });

  it("keeps setup reachable when the available catalog fails to load", async () => {
    await act(async () => { renderer = create(createElement(SettingsDialog, { modelsLoading: false, modelsError: "无法读取模型列表，请重新加载。", onCatalog() {}, onReloadCatalog() {}, onClose() { closes++; } })); await settle(); });
    await click(root().findByProps({ id: "settings-tab-models" }));
    assert.match(text(root().findByProps({ "aria-label": "可用模型列表" })), /模型列表加载失败/);
    assert.equal(button("修改默认模型").props.disabled, true);
    await click(button("添加模型")); assert.ok(field("添加到提供方"));
    assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("makes Codex subscription login discoverable from model home without exposing a generic key form", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    openAIMetadata();
    extra = async (path) => path === authRoute ? Response.json(authAttempt()) : path.endsWith("/cancel") ? Response.json({ ...authAttempt(), status: "cancelled", authorizationUrl: undefined, promptId: undefined }) : undefined;
    await open(); await click(root().findByProps({ id: "settings-tab-models" }));
    const home = root().findByProps({ className: "settings-model-view" });
    assert.match(text(home), /ChatGPT \/ Codex 订阅/);
    await click(button("连接订阅"));
    assert.ok(root().findByProps({ "aria-label": "OpenAI ChatGPT 授权" }));
    assert.equal(field("API Key"), undefined); assert.equal(field("API 地址"), undefined);
    assert.ok(button("使用 ChatGPT 登录"));
    assert.equal(requests.filter((request) => request.body).length, 0);
    await click(button("使用 ChatGPT 登录"));
    assert.deepEqual(requests.filter((request) => request.body).map((request) => request.path), [authRoute]);
    await click(button("取消授权"));
  });

  it("keeps subscription state and disabled-login reasons visible without hiding the subscription entry", async () => {
    openAIMetadata("oauth");
    settings = { ...settings, providers: settings.providers.map((provider) => provider.id === "openai" ? { ...provider, authorization: { canLogin: false, canLogout: true, reason: "当前提供方使用受保护配置，不能重新登录。" } } : provider) };
    await open(); await click(root().findByProps({ id: "settings-tab-models" }));
    assert.match(text(root().findByProps({ "aria-label": "ChatGPT Codex 订阅" })), /已连接 ChatGPT.*当前提供方使用受保护配置，不能重新登录/);
    await click(button("管理登录"));
    assert.equal(button("重新授权").props.disabled, true); assert.ok(button("退出登录"));
    assert.match(text(root().findByProps({ "aria-label": "OpenAI ChatGPT 授权" })), /当前提供方使用受保护配置，不能重新登录/);
    assert.equal(field("API Key"), undefined); assert.equal(requests.filter((request) => request.body).length, 0);
  });

  it("keeps an unsupported subscription entry actionable without inventing a legacy login capability", async () => {
    settings = { ...settings, providers: [...settings.providers, { id: "openai-codex", name: "Legacy Codex", kind: "builtin", editable: false, credential: { source: "oauth", configured: true, editable: false, revision: "legacy_codex_revision" } }] };
    await open(); await click(root().findByProps({ id: "settings-tab-models" }));
    const entry = root().findByProps({ "aria-label": "ChatGPT Codex 订阅" });
    assert.match(text(entry), /当前提供方配置不支持订阅登录/);
    await click(button("查看订阅设置"));
    assert.match(text(root().findByProps({ "aria-label": "订阅登录说明" })), /订阅登录暂不可用/);
    assert.equal(button("使用 ChatGPT 登录"), undefined);
    assert.equal(field("API Key"), undefined);
    assert.equal(requests.filter((request) => request.body).length, 0);
    await click(button("管理提供方"));
    assert.ok(root().findByProps({ "aria-label": "管理提供方 openai-codex" }));
    assert.equal(requests.some((request) => request.path.includes("/openai-codex/oauth")), false);
  });

  it("retains one subscription authorization across home, provider detail and category navigation", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    openAIMetadata();
    extra = async (path) => path === authRoute ? Response.json(authAttempt()) : path.endsWith("/cancel") ? Response.json({ ...authAttempt(), status: "cancelled", authorizationUrl: undefined, promptId: undefined }) : undefined;
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("连接订阅")); await click(button("使用 ChatGPT 登录"));
    await click(root().findByProps({ "aria-label": "返回模型首页" }));
    assert.ok(button("返回授权")); assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, true);
    await manageProvider("openai"); assert.ok(button("取消授权"));
    await click(root().findByProps({ "aria-label": "返回模型首页" })); await click(button("返回授权"));
    assert.equal(field("API Key"), undefined); assert.equal(root().findAllByProps({ "aria-label": "提供方设置" }).length, 0);
    await click(root().findByProps({ id: "settings-tab-about" })); await click(root().findByProps({ id: "settings-tab-models" }));
    assert.ok(button("取消授权")); assert.equal(requests.filter((request) => request.path === authRoute).length, 1);
    await click(button("取消授权"));
    assert.equal(requests.filter((request) => request.path.endsWith("/cancel")).length, 1);
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
  });

  it("guards returning to a pending subscription authorization from a dirty model form", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    openAIMetadata();
    extra = async (path) => path === authRoute ? Response.json(authAttempt()) : path.endsWith("/cancel") ? Response.json({ ...authAttempt(), status: "cancelled", authorizationUrl: undefined, promptId: undefined }) : undefined;
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await click(button("连接订阅")); await click(button("使用 ChatGPT 登录"));
    await click(root().findByProps({ "aria-label": "返回模型首页" })); await startNewProvider(); await change("提供方 ID", "unsaved-subscription-switch");
    await click(button("返回授权")); assert.ok(root().findByProps({ role: "alertdialog" }));
    await click(button("继续编辑")); assert.equal(field("提供方 ID").props.value, "unsaved-subscription-switch");
    await click(button("返回授权")); await click(button("放弃当前修改"));
    assert.equal(field("提供方 ID"), undefined); assert.equal(field("API Key"), undefined); assert.ok(button("取消授权"));
    await click(button("取消授权")); assert.equal(requests.filter((request) => request.path === authRoute).length, 1);
  });

  it("connects ChatGPT from Models, confirms replacement and local logout, and leaves model defaults explicit", async () => {
    openAIMetadata("stored");
    extra = async (path) => {
      if (path === authRoute) { openAIMetadata("oauth"); return Response.json({ ...authAttempt(), status: "succeeded", authorizationUrl: undefined, promptId: undefined, result: { settings, catalog: { ...catalog, revision: "catalog_auth_confirmed" } } }); }
      if (path === `${authRoute}/logout`) { openAIMetadata(); return Response.json({ settings, catalog }); }
    };
    await open(); await manageProvider("openai");
    assert.equal(requests.filter((request) => request.body).length, 0);
    await click(button("使用 ChatGPT 登录")); assert.equal(requests.filter((request) => request.body).length, 0);
    assert.match(text(root()), /替换 OpenAI 认证/);
    await click(button("继续授权"));
    assert.match(text(root().findByProps({ "aria-label": "OpenAI ChatGPT 授权" })), /已连接 ChatGPT/);
    await click(button("退出登录")); assert.match(text(root()), /不会撤销 OpenAI 端授权/);
    await click(button("确认退出")); assert.match(text(root()), /尚未连接 ChatGPT/);
    assert.equal(requests.filter((request) => request.path === "/api/settings/defaults").length, 0);
  });

  it("keeps cancelled or newer attempts safe from delayed polling responses", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    openAIMetadata(); const delayed = deferred<Response>(); let begins = 0;
    extra = async (path) => {
      if (path === authRoute) return Response.json(authAttempt(++begins === 1 ? "auth_attempt_first_123456" : "auth_attempt_second_123456"));
      if (path === `${authRoute}/auth_attempt_first_123456`) return delayed.promise;
      if (path.endsWith("/cancel")) return Response.json({ ...authAttempt(path.includes("second") ? "auth_attempt_second_123456" : undefined), status: "cancelled", authorizationUrl: undefined, promptId: undefined });
    };
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录"));
    await act(async () => { t.mock.timers.tick(250); await settle(); });
    await click(button("取消授权")); assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
    await click(button("使用 ChatGPT 登录"));
    await act(async () => { delayed.resolve(Response.json(authAttempt())); await settle(); });
    const link = root().findByProps({ href: authAttempt().authorizationUrl }); assert.equal(link.props.rel, "noopener noreferrer");
    await click(button("取消授权")); assert.match(text(root()), /授权已取消/);
  });

  it("shows saved-with-warning and reloads safe metadata after login and logout confirmation failures", async () => {
    openAIMetadata();
    extra = async (path) => {
      if (path === authRoute) {
        openAIMetadata("oauth");
        return Response.json({ ...authAttempt(), status: "succeeded", authorizationUrl: undefined, promptId: undefined, refreshRequired: true });
      }
      if (path === `${authRoute}/logout`) { openAIMetadata(); return Response.json({ refreshRequired: true }); }
    };
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录"));
    assert.match(text(root()), /已连接 ChatGPT/);
    assert.match(text(root()), /授权设置已保存，但状态暂时无法刷新/);
    assert.equal(text(root()).includes("ChatGPT 授权未确认"), false);
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
    assert.equal(requests.filter((request) => request.path === "/api/settings" && !request.body).length, 2);
    await click(button("退出登录")); await click(button("确认退出"));
    assert.match(text(root()), /尚未连接 ChatGPT/);
    assert.match(text(root()), /授权设置已保存，但状态暂时无法刷新/);
    assert.equal(text(root()).includes("ChatGPT 授权未确认"), false);
    assert.equal(requests.filter((request) => request.path === "/api/settings" && !request.body).length, 3);
    assert.equal(requests.filter((request) => request.path === "/api/settings/defaults").length, 0);
  });

  it("recovers missing authorization records after a server restart so Settings can close and login can restart", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); openAIMetadata();
    extra = async (path) => path === authRoute ? Response.json(authAttempt()) : path.startsWith(authRoute + "/") ? Response.json({ code: "authorization_not_found", error: "SECRET_NOT_FOR_UI" }, { status: 404 }) : undefined;
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录"));
    await act(async () => { t.mock.timers.tick(250); await settle(); });
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false);
    assert.ok(button("使用 ChatGPT 登录")); assert.equal(text(root()).includes("SECRET_NOT_FOR_UI"), false);
    await click(root().findByProps({ "aria-label": "关闭设置" })); assert.equal(closes, 1);
  });

  it("recovers a cancel response that no longer has a server-side attempt", async () => {
    openAIMetadata();
    extra = async (path) => path === authRoute ? Response.json(authAttempt()) : path.endsWith("/cancel") ? Response.json({ code: "authorization_not_found" }, { status: 404 }) : undefined;
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录")); await click(button("取消授权"));
    assert.equal(root().findByProps({ "aria-label": "关闭设置" }).props.disabled, false); assert.ok(button("使用 ChatGPT 登录"));
  });

  it("clears transient polling failures after recovery and never retains callback codes after submission", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] }); openAIMetadata(); let polls = 0;
    extra = async (path) => {
      if (path === authRoute) return Response.json(authAttempt());
      if (path.endsWith("/input")) return Response.json({ ...authAttempt(), promptId: undefined });
      if (path === `${authRoute}/auth_attempt_first_123456`) return ++polls === 1 ? Response.json({ code: "authorization_failed", error: "SECRET_NOT_FOR_UI" }, { status: 503 }) : Response.json(authAttempt());
      if (path.endsWith("/cancel")) return Response.json({ ...authAttempt(), status: "cancelled", authorizationUrl: undefined, promptId: undefined });
    };
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录"));
    await act(async () => { t.mock.timers.tick(250); await settle(); }); assert.match(text(root()), /ChatGPT 授权未确认/);
    await act(async () => { t.mock.timers.tick(750); await settle(); }); assert.equal(text(root()).includes("ChatGPT 授权未确认"), false);
    await change("ChatGPT 授权回调地址", "http://127.0.0.1:1455/auth/callback?code=CALLBACK_PRIVATE&state=fixture");
    await click(button("提交回调地址"));
    assert.equal(text(root()).includes("CALLBACK_PRIVATE"), false);
    assert.equal(root().findAllByProps({ "aria-label": "ChatGPT 授权回调地址" }).length, 0);
    await click(button("取消授权"));
  });

  it("retries an ambiguous authorization begin using the same operation identity", async () => {
    openAIMetadata(); const ids: string[] = [];
    extra = async (path, body) => {
      if (path === authRoute) { ids.push(String(body?.operationId)); if (ids.length === 1) throw new Error("SECRET_NOT_FOR_UI"); return Response.json(authAttempt()); }
      if (path.endsWith("/cancel")) return Response.json({ ...authAttempt(), status: "cancelled", authorizationUrl: undefined, promptId: undefined });
    };
    await open(); await manageProvider("openai"); await click(button("使用 ChatGPT 登录")); assert.equal(text(root()).includes("SECRET_NOT_FOR_UI"), false);
    await click(button("重试授权")); assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]); await click(button("取消授权"));
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
    await open(); await click(root().findByProps({ id: "settings-tab-models" })); await startNewProvider();
    await change("提供方 ID", "new-provider"); await change("API 地址", "https://example.test/v1"); await change("模型 1 ID", "new-model");
    await click(root().findByProps({ id: "settings-tab-about" })); await click(root().findByProps({ id: "settings-tab-models" })); assert.equal(field("API 地址").props.value, "https://example.test/v1");
    assert.equal(field("API Key"), undefined); await click(button("保存模型"));
    assert.equal(requests.filter((item) => item.body).length, 1); assert.equal(requests.find((item) => item.body)?.path, "/api/settings/providers");
    assert.ok(root().findByProps({ "aria-label": "模型认证步骤" })); assert.equal(field("API Key").props.value, "");
    assert.match(text(root()), /待配置认证/); assert.equal(button("保存 API Key").props.disabled, true);
  });

  it("rejects an existing provider ID in the add form instead of silently updating that provider", async () => {
    await open(); await startNewProvider();
    await change("提供方 ID", "fixture"); await change("API 地址", "https://replacement.test/v1"); await change("模型 1 ID", "different-model");
    assert.equal(field("提供方 ID").props["aria-invalid"], true);
    assert.match(text(root()), /提供方 ID 已存在.*请使用不同 ID，或选择现有提供方进行编辑/);
    assert.equal(button("保存模型").props.disabled, true);
    await click(button("保存模型"));
    assert.equal(requests.filter((item) => item.body).length, 0, "the submit handler must also reject a duplicate add candidate");
    assert.equal(settings.providers[0].definition?.baseUrl, "https://api.example.com/v1");
    await change("提供方 ID", "oauth-only"); assert.equal(button("保存模型").props.disabled, true);
    await change("提供方 ID", "Fixture"); assert.equal(button("保存模型").props.disabled, false, "identity is case-sensitive; do not invent lower-case normalization");
    assert.equal(field("提供方 ID").props["aria-invalid"], undefined);
    assert.equal(requests.filter((item) => item.body).length, 0);
  });

  it("keeps advanced model fields collapsed until explicitly opened and retains manual disclosure while typing", async () => {
    await open(); await startNewProvider();
    const editor = () => root().findByProps({ className: "settings-model-editor" });
    assert.equal(editor().props.open, false);
    await act(() => editor().props.onToggle({ currentTarget: { open: true } }));
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
    assert.equal(field("API 地址").props.value, "https://changed.test/v1"); assert.match(text(root().findByProps({ className: "settings-provider-meta" })), /fixture.*自定义提供方/);
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
