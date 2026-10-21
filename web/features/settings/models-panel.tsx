"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ModelConfigurationFields } from "@/components/shared/ModelConfigurationFields";
import { isProviderDefinition, providerApis, type InstallationModelCatalog, type InstallationSettings, type ProviderDefinition, type ProviderModelDefinition, type ProviderSaveResult, type ProviderSettings } from "@/shared/installation-settings";
import type { ModelConfiguration } from "@/shared/model-configuration";
import { settingsApi } from "./api";

export type FormStateChange = (form: string, dirty: boolean, pending: boolean) => void;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function DefaultsEditor({ catalog, loading, error: catalogError, onReload, onCatalog, onState, onNotice }: { catalog?: InstallationModelCatalog; loading: boolean; error?: string; onReload(): void; onCatalog(catalog: InstallationModelCatalog): void; onState: FormStateChange; onNotice(message: string): void }) {
  const [candidate, setCandidate] = useState<ModelConfiguration>();
  const [baseline, setBaseline] = useState<ModelConfiguration>();
  const [observed, setObserved] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const busy = useRef(false);
  const rebase = useRef(false);
  const models = catalog?.models ?? [];
  const selected = models.find((model) => model.provider === candidate?.provider && model.id === candidate.modelId);
  const levels = selected?.thinkingLevels ?? [];
  const dirty = Boolean(candidate && !same(candidate, baseline));
  useEffect(() => {
    if (!catalog || observed === catalog.revision) return;
    // Keep an unsaved candidate and its observed revision until its own confirmed save.
    if (dirty && !rebase.current) return;
    rebase.current = false;
    setObserved(catalog.revision); setBaseline(catalog.defaults);
    if (!dirty) setCandidate(catalog.defaults);
  }, [catalog, observed, dirty]);
  useEffect(() => { onState("defaults", dirty, pending); }, [dirty, pending, onState]);
  async function save() {
    if (!candidate || !observed || !selected || !levels.includes(candidate.thinkingLevel) || busy.current) return;
    busy.current = true; setPending(true); setError(undefined);
    try {
      const saved = await settingsApi.defaults({ ...candidate, revision: observed });
      onCatalog(saved); setBaseline(saved.defaults); setCandidate(saved.defaults); setObserved(saved.revision); onNotice("默认模型已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "默认模型未保存，请重试。"); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="settings-section" aria-label="默认模型设置"><div className="settings-section-heading"><h3>默认模型</h3><p>用于新会话，已有会话的模型设置保持不变。</p></div>
    {catalogError && <Alert title="模型列表加载失败" variant="error"><p>{catalogError}</p><Button size="sm" variant="outline" onClick={onReload}>重新加载模型</Button></Alert>}
    {loading && !catalog ? <p className="settings-muted" role="status">正在加载模型…</p> : !models.length ? <p className="settings-muted">暂无可用模型，请先配置提供方和凭证。</p> : <>
      <ModelConfigurationFields className="settings-form-grid" models={models} value={candidate} onChange={setCandidate} disabled={pending} modelLabel="默认模型" thinkingLabel="默认思考强度" />
      {selected && !selected.reasoning && <p className="settings-muted">此模型仅支持关闭思考强度。</p>}
      {error && <Alert title="默认模型未保存" variant="error"><p>{error}</p><Button size="sm" variant="outline" disabled={pending} onClick={() => { rebase.current = true; onReload(); }}>重新加载模型</Button></Alert>}
      <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={pending || !dirty} onClick={() => { setCandidate(catalog?.defaults); setBaseline(catalog?.defaults); setObserved(catalog?.revision); setError(undefined); }}>取消修改</Button><Button size="sm" disabled={pending || !dirty || !selected || !candidate || !levels.includes(candidate.thinkingLevel)} onClick={() => void save()}>{pending ? "正在保存…" : "保存默认模型"}</Button></div>
    </>}
  </section>;
}

const emptyDefinition = (): ProviderDefinition => ({ id: "", api: "openai-completions", baseUrl: "", models: [{ id: "" }] });
const sourceLabels: Record<ProviderSettings["credential"]["source"], string> = { stored: "已保存的 API Key", configuration: "提供方配置", environment: "环境变量", oauth: "OAuth", none: "未配置凭证", unsupported: "高级认证" };
interface ProviderDraft { candidate: ProviderDefinition; baseline: ProviderDefinition; revision: string }
interface CredentialDraft { apiKey: string; revision: string }
function ModelEditor({ label, initialOpen, children }: { label: string; initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return <details className="settings-model-editor" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><span>{label}</span><ChevronDown size={13} /></summary><div className="settings-model-fields">{children}</div></details>;
}

export function ProvidersEditor({ settings, loading, error: settingsError, onReload, onSaved, onState, onNotice }: { settings?: InstallationSettings; loading: boolean; error?: string; onReload(): void; onSaved(result: ProviderSaveResult): void; onState: FormStateChange; onNotice(message: string): void }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({});
  const [keys, setKeys] = useState<Record<string, CredentialDraft>>({});
  const [pending, setPending] = useState<"definition" | "credential">();
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const busy = useRef(false);
  const rebase = useRef(false);
  const selected = settings?.providers.find((provider) => provider.id === selectedId);
  const draftKey = selectedId ?? "";
  const draft = Object.hasOwn(drafts, draftKey) ? drafts[draftKey] : undefined;
  const keyDraft = Object.hasOwn(keys, draftKey) ? keys[draftKey] : undefined;
  const apiKey = keyDraft?.apiKey ?? "";
  const isNew = selectedId === "__new";
  const duplicateId = Boolean(isNew && draft && settings?.providers.some((provider) => provider.id === draft.candidate.id));
  const dirty = Object.values(drafts).some((value) => !same(value.candidate, value.baseline)) || Object.values(keys).some((value) => Boolean(value.apiKey));
  useEffect(() => { onState("providers", dirty, Boolean(pending)); }, [dirty, pending, onState]);
  useEffect(() => {
    if (!settings || !rebase.current) return;
    rebase.current = false;
    setDrafts((items) => Object.fromEntries(Object.entries(items).map(([id, value]) => [id, { ...value, revision: settings.revision, baseline: structuredClone(settings.providers.find((item) => item.id === id)?.definition ?? value.baseline) }])));
    setKeys((items) => Object.fromEntries(Object.entries(items).map(([id, value]) => [id, { ...value, revision: settings.providers.find((item) => item.id === id)?.credential.revision ?? value.revision }])));
  }, [settings]);
  function reload() { rebase.current = true; onReload(); }
  function select(id: string) {
    if (busy.current || !settings) return;
    setSelectedId(id); setError(undefined); setWarning(undefined);
    const source = settings.providers.find((item) => item.id === id)?.definition;
    if (!Object.hasOwn(drafts, id) && (source || id === "__new")) {
      const definition = source ? structuredClone(source) : emptyDefinition();
      setDrafts((items) => ({ ...items, [id]: { candidate: definition, baseline: structuredClone(definition), revision: settings.revision } }));
    }
  }
  function edit(change: Partial<ProviderDefinition>) {
    setDrafts((items) => ({ ...items, [draftKey]: { ...items[draftKey], candidate: { ...items[draftKey].candidate, ...change } } }));
  }
  function editModel(index: number, change: Partial<ProviderModelDefinition>) {
    if (!draft) return;
    edit({ models: draft.candidate.models.map((model, at) => at === index ? { ...model, ...change } : model) });
  }
  function clearKey() { setKeys((items) => { const next = { ...items }; delete next[draftKey]; return next; }); }
  function editKey(value: string) {
    if (!selected) return;
    setKeys((items) => {
      const previous = Object.hasOwn(items, draftKey) ? items[draftKey] : undefined;
      return { ...items, [draftKey]: { apiKey: value, revision: previous?.apiKey ? previous.revision : selected.credential.revision } };
    });
  }
  function cancel() {
    if (!draft) { clearKey(); return; }
    const definition = selected?.definition ? structuredClone(selected.definition) : emptyDefinition();
    setDrafts((items) => ({ ...items, [draftKey]: { candidate: definition, baseline: structuredClone(definition), revision: settings?.revision ?? draft.revision } }));
    clearKey(); setError(undefined); setWarning(undefined);
  }
  async function saveDefinition() {
    if (!draft || duplicateId || busy.current || !isProviderDefinition(draft.candidate)) return;
    busy.current = true; setPending("definition"); setError(undefined); setWarning(undefined);
    try {
      const result = await settingsApi.provider({ definition: draft.candidate, revision: draft.revision });
      onSaved(result);
      const id = draft.candidate.id;
      const confirmed = result.settings.providers.find((item) => item.id === id)?.definition ?? draft.candidate;
      setDrafts((items) => { const next = { ...items }; delete next[draftKey]; next[id] = { candidate: structuredClone(confirmed), baseline: structuredClone(confirmed), revision: result.settings.revision }; return next; });
      setSelectedId(id); setWarning(result.warning); onNotice("提供方已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提供方未保存，请重试。"); }
    finally { busy.current = false; setPending(undefined); }
  }
  async function saveKey() {
    if (!selected || !selected.credential.editable || !apiKey.trim() || !keyDraft || busy.current) return;
    busy.current = true; setPending("credential"); setError(undefined); setWarning(undefined);
    try {
      const result = await settingsApi.credential(selected.id, { revision: keyDraft.revision, apiKey });
      onSaved(result); clearKey(); setWarning(result.warning); onNotice("API Key 已保存");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "API Key 未保存，请重试。"); }
    finally { busy.current = false; setPending(undefined); }
  }
  return <section className="settings-section settings-providers" aria-label="提供方设置"><div className="settings-section-heading settings-section-heading-action"><div><h3>提供方</h3><p>接口定义与 API Key 分开保存。保存不会自动测试连接。</p></div><Button size="sm" variant="outline" disabled={!settings?.canAddProvider || Boolean(pending)} onClick={() => select("__new")}><Plus size={13} />新增提供方</Button></div>
    {loading && !settings && <p className="settings-muted" role="status">正在加载提供方…</p>}
    {(settingsError || settings?.issue) && <Alert title="提供方配置不可用" variant="error"><p>{settingsError ?? settings?.issue}</p><Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={reload}>重新加载配置</Button></Alert>}
    {settings && <><label className="settings-field"><span>选择提供方</span><Select aria-label="选择提供方" disabled={Boolean(pending)} value={selectedId ?? null} placeholder="选择一个提供方" onValueChange={(id) => { if (id) select(id); }} options={[...(isNew ? [{ value: "__new", label: "新增提供方" }] : []), ...settings.providers.map((provider) => ({ value: provider.id, label: `${provider.name} · ${provider.kind === "builtin" ? "内置" : "已配置"}` }))]} /></label>
    {(selected || isNew) && <div className="settings-provider-editor">
      {selected && <div className="settings-provider-meta"><strong>{selected.name}</strong><span>{selected.kind === "builtin" ? "内置提供方" : "自定义提供方"} · {selected.credential.configured ? "已配置认证" : "未配置认证"}</span></div>}
      {selected && !selected.editable && <p className="settings-muted">{selected.readOnlyReason ?? "此提供方的接口定义由 Pi 或高级配置管理，只读显示。"}</p>}
      {draft && (isNew || selected?.editable) && <fieldset disabled={Boolean(pending)} className="settings-provider-definition"><legend className="sr-only">提供方接口定义</legend>
        <div className="settings-form-grid"><label className="settings-field"><span>提供方 ID</span><Input aria-label="提供方 ID" aria-invalid={duplicateId || undefined} aria-describedby={duplicateId ? "settings-duplicate-provider-id" : undefined} autoComplete="off" spellCheck={false} value={draft.candidate.id} disabled={!isNew || Boolean(pending)} placeholder="my-provider" onChange={(event) => edit({ id: event.target.value })} /></label><label className="settings-field"><span>接口类型</span><Select aria-label="接口类型" disabled={Boolean(pending)} value={draft.candidate.api} options={providerApis.map((api) => ({ value: api, label: api }))} onValueChange={(api) => { if (api) edit({ api }); }} /></label></div>
        {duplicateId && <Alert title="提供方 ID 已存在" variant="error"><p id="settings-duplicate-provider-id">请使用不同 ID，或选择现有提供方进行编辑。</p></Alert>}
        <label className="settings-field"><span>API 地址</span><Input aria-label="API 地址" type="url" autoComplete="off" spellCheck={false} value={draft.candidate.baseUrl} placeholder="https://api.example.com/v1" onChange={(event) => edit({ baseUrl: event.target.value })} /><small>仅 HTTP(S) 地址，不含账号、密码、查询参数或片段。</small></label>
        <div className="settings-models-heading"><strong>模型</strong><button className="settings-text-button" type="button" disabled={draft.candidate.models.length >= 200} onClick={() => edit({ models: [...draft.candidate.models, { id: "" }] })}><Plus size={12} />添加模型</button></div>
        {draft.candidate.models.map((model, index) => <ModelEditor key={`${draftKey}/${index}`} label={model.name || model.id || "新模型"} initialOpen={!model.id}>
          <div className="settings-form-grid"><label className="settings-field"><span>模型 ID</span><Input aria-label={`模型 ${index + 1} ID`} value={model.id} disabled={Boolean(pending) || Boolean(draft.baseline.models[index]?.id)} autoComplete="off" spellCheck={false} onChange={(event) => editModel(index, { id: event.target.value })} /></label><label className="settings-field"><span>显示名称（可选）</span><Input aria-label={`模型 ${index + 1} 名称`} value={model.name ?? ""} onChange={(event) => editModel(index, { name: event.target.value || undefined })} /></label></div>
          <div className="settings-form-grid"><label className="settings-field"><span>上下文窗口（可选）</span><Input aria-label={`模型 ${index + 1} 上下文窗口`} type="number" min={1} value={model.contextWindow ?? ""} onChange={(event) => editModel(index, { contextWindow: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label className="settings-field"><span>最大输出（可选）</span><Input aria-label={`模型 ${index + 1} 最大输出`} type="number" min={1} value={model.maxTokens ?? ""} onChange={(event) => editModel(index, { maxTokens: event.target.value === "" ? undefined : Number(event.target.value) })} /></label></div>
          <div className="settings-model-options"><label><Checkbox aria-label={`模型 ${index + 1} 支持思考`} disabled={Boolean(pending)} checked={model.reasoning ?? false} onCheckedChange={(reasoning) => editModel(index, { reasoning })} />支持思考</label><label><Checkbox aria-label={`模型 ${index + 1} 支持图像输入`} disabled={Boolean(pending)} checked={model.input?.includes("image") ?? false} onCheckedChange={(image) => editModel(index, { input: image ? ["text", "image"] : ["text"] })} />支持图像输入</label></div>
          {!draft.baseline.models[index]?.id && draft.candidate.models.length > 1 && <button type="button" className="settings-text-button" onClick={() => edit({ models: draft.candidate.models.filter((_, at) => at !== index) })}>移除此新增模型</button>}
        </ModelEditor>)}
        <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={!dirty} onClick={cancel}>取消修改</Button><Button size="sm" disabled={duplicateId || !isProviderDefinition(draft.candidate) || same(draft.candidate, draft.baseline)} onClick={() => void saveDefinition()}>{pending === "definition" ? "正在保存…" : "保存提供方"}</Button></div>
      </fieldset>}
      {selected && <section className="settings-credential" aria-label="提供方凭证"><div className="settings-section-heading"><h4>API Key</h4><p>认证来源：{sourceLabels[selected.credential.source]}。已保存的密钥不会回显。</p></div>
        {selected.credential.editable ? <><label className="settings-field"><span>{selected.credential.configured ? "替换 API Key" : "配置 API Key"}</span><Input type="password" aria-label="API Key" autoComplete="new-password" spellCheck={false} disabled={Boolean(pending)} value={apiKey} placeholder="留空保持不变" onChange={(event) => editKey(event.target.value)} /></label><p className="settings-muted">单独保存到安装配置。留空不修改，保存不代表远程服务已验证。</p><div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={Boolean(pending) || !apiKey} onClick={clearKey}>取消密钥修改</Button><Button size="sm" disabled={Boolean(pending) || !apiKey.trim()} onClick={() => void saveKey()}>{pending === "credential" ? "正在保存…" : "保存 API Key"}</Button></div></> : <p className="settings-muted">{selected.credential.readOnlyReason ?? "此认证方式不能通过单个 API Key 安全修改。"}</p>}
      </section>}
      {isNew && <p className="settings-muted">请先保存提供方定义，再单独配置 API Key。</p>}
      {error && <Alert title="配置保存未确认" variant="error"><p>{error}</p><Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={reload}>重新加载配置</Button></Alert>}
      {warning && <Alert title="已保存，状态待确认" variant="warning"><p>{warning}</p><Button size="sm" variant="outline" disabled={Boolean(pending)} onClick={reload}>重新加载配置</Button></Alert>}
    </div>}</>}
  </section>;
}
