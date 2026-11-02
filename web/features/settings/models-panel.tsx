"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModelConfigurationFields } from "@/components/shared/ModelConfigurationFields";
import { type InstallationModelCatalog } from "@/shared/installation-settings";
import type { ModelConfiguration } from "@/shared/model-configuration";
import { settingsApi } from "./api";
import { SettingRow } from "./preferences-panels";

export type FormStateChange = (form: string, dirty: boolean, pending: boolean) => void;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function AvailableModels({ catalog, loading, error, onReload, onAdd, disabled }: { catalog?: InstallationModelCatalog; loading: boolean; error?: string; onReload(): void; onAdd(): void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const models = catalog?.models ?? [];
  const search = query.trim().toLowerCase();
  const visible = models.filter((model) => `${model.id} ${model.provider}`.toLowerCase().includes(search));
  return <>
    <SettingRow title="可用模型" description={catalog ? `共 ${models.length} 个可选择的模型。` : loading ? "正在加载模型列表…" : "查看和添加可用模型。"}><div className="settings-shortcut-actions"><Button size="sm" disabled={disabled} onClick={onAdd}><Plus size={13} aria-hidden="true" />添加模型</Button><Button size="sm" variant="outline" disabled={loading || disabled} onClick={onReload}>{loading ? "正在刷新…" : "刷新列表"}</Button></div></SettingRow>
    <div role="region" aria-label="可用模型列表" aria-busy={loading}>
    {error && <Alert title="模型列表加载失败" variant="error"><p>{error}</p><Button size="sm" variant="outline" disabled={loading} onClick={onReload}>重新加载模型</Button></Alert>}
    {catalog ? models.length ? <>
      {(models.length > 5 || query) && <label className="settings-field"><span>搜索模型</span><Input aria-label="搜索可用模型" placeholder="模型名称或提供方" value={query} onChange={(event) => setQuery(event.target.value)} /></label>}
      {visible.map((model) => <SettingRow key={JSON.stringify([model.provider, model.id])} title={model.id} description={`提供方 · ${model.provider}`}>
        {catalog.defaults?.provider === model.provider && catalog.defaults.modelId === model.id && <span className="settings-muted">默认</span>}
      </SettingRow>)}
      {!visible.length && <p className="settings-muted" role="status">没有匹配的模型。</p>}
    </> : <p className="settings-muted">暂无可用模型，请先配置提供方和凭证。</p> : loading ? <p className="settings-muted" role="status">正在加载模型…</p> : null}
    </div>
  </>;
}

export function DefaultsEditor({ catalog, loading, onReload, onCatalog, onState, onNotice }: { catalog?: InstallationModelCatalog; loading: boolean; onReload(): void; onCatalog(catalog: InstallationModelCatalog): void; onState: FormStateChange; onNotice(message: string): void }) {
  const [editing, setEditing] = useState(false);
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
  return <div role="region" aria-label="默认模型设置">
    <SettingRow title="默认模型" description={catalog?.defaults ? `${catalog.defaults.provider} / ${catalog.defaults.modelId} · ${catalog.defaults.thinkingLevel}` : catalog ? "尚未设置，用于新会话。" : loading ? "正在加载默认设置…" : "默认设置暂不可用。"}>{!editing && <Button size="sm" variant="ghost" disabled={pending || !models.length} onClick={() => setEditing(true)}>修改默认模型</Button>}</SettingRow>
    {editing && <div className="settings-default-editor"><p className="settings-muted">仅用于新会话，不改变已有会话。</p>
    {loading && !catalog ? <p className="settings-muted" role="status">正在加载模型…</p> : !models.length ? <p className="settings-muted">暂无可用模型，请先配置提供方和凭证。</p> : <>
      <ModelConfigurationFields className="settings-form-grid" models={models} value={candidate} onChange={setCandidate} disabled={pending} modelLabel="默认模型" thinkingLabel="默认思考强度" />
      {selected && !selected.reasoning && <p className="settings-muted">此模型仅支持关闭思考强度。</p>}
      {error && <Alert title="默认模型未保存" variant="error"><p>{error}</p><Button size="sm" variant="outline" disabled={pending} onClick={() => { rebase.current = true; onReload(); }}>重新加载模型</Button></Alert>}
    </>}
      <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={pending} onClick={() => { setCandidate(catalog?.defaults); setBaseline(catalog?.defaults); setObserved(catalog?.revision); setError(undefined); setEditing(false); }}>取消修改</Button><Button size="sm" disabled={pending || !dirty || !selected || !candidate || !levels.includes(candidate.thinkingLevel)} onClick={() => void save()}>{pending ? "正在保存…" : "保存默认模型"}</Button></div>
    </div>}
  </div>;
}
