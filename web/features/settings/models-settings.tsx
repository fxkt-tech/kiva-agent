"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { InstallationModelCatalog, InstallationSettings, ProviderSaveResult } from "@/shared/installation-settings";
import { AvailableModels, DefaultsEditor, type FormStateChange } from "./models-panel";
import { ModelDefinitionFields, ModelEditor, ProviderConnectionFields, ProviderCredentialFields, ProviderSaveFeedback, sourceLabels, useProviderEditor } from "./provider-editor";
import { OpenAIAuthorization } from "./openai-authorization";
import { SettingRow } from "./preferences-panels";

type View = { kind: "home" | "providers" | "provider" | "choose" | "subscription" } | { kind: "model"; index: number } | { kind: "authentication"; modelId: string };
type Props = {
  active: boolean; settings?: InstallationSettings; loading: boolean; error?: string; onReload(): void;
  catalog?: InstallationModelCatalog; modelsLoading: boolean; modelsError?: string; onReloadCatalog(): void;
  onCatalog(catalog: InstallationModelCatalog): void; onSaved(result: ProviderSaveResult): void;
  onState: FormStateChange; onNotice(message: string): void;
};

export function ModelsSettings({ active, settings, loading, error, onReload, catalog, modelsLoading, modelsError, onReloadCatalog, onCatalog, onSaved, onState, onNotice }: Props) {
  const [view, setView] = useState<View>({ kind: "home" });
  const [choice, setChoice] = useState<string>();
  const [forms, setForms] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [leave, setLeave] = useState<() => void>();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousView = useRef(view);
  const formState = useCallback<FormStateChange>((id, dirty, pending) => {
    setForms((items) => items[id]?.dirty === dirty && items[id]?.pending === pending ? items : { ...items, [id]: { dirty, pending } });
    onState(id, dirty, pending);
  }, [onState]);
  const editor = useProviderEditor({ settings, onReload, onSaved, onState: formState, onNotice });
  const saving = Boolean(editor.pending || forms.defaults?.pending);
  const selected = editor.selected;
  const subscription = settings?.providers.find((provider) => provider.id === "openai");
  const subscriptionConnected = subscription?.credential.source === "oauth" && subscription.credential.configured;
  const subscriptionStatus = !settings ? loading ? "正在读取订阅状态…" : "订阅状态暂不可用。" : subscriptionConnected ? "已连接 ChatGPT" : subscription?.credential.configured ? `当前认证：${sourceLabels[subscription.credential.source]}` : "尚未连接 ChatGPT";
  const subscriptionReason = !settings ? undefined : subscription?.authorization ? subscription.authorization.canLogin ? undefined : subscription.authorization.reason ?? "当前配置不支持订阅登录。" : subscription?.readOnlyReason ?? subscription?.credential.readOnlyReason ?? "当前提供方配置不支持订阅登录。";
  const editableProviders = settings?.providers.filter((provider) => provider.editable && provider.definition) ?? [];
  useEffect(() => {
    if (!active) setLeave(undefined);
    else if (previousView.current !== view) heading.current?.focus({ preventScroll: true });
    previousView.current = view;
  }, [active, view]);
  function navigate(next: View) {
    if (saving) return;
    if ((view.kind === "model" || view.kind === "authentication" || view.kind === "provider") && editor.currentDirty) setLeave(() => () => setView(next));
    else setView(next);
  }
  function add(providerId?: string) {
    if (saving) return;
    const action = () => {
      if (!providerId) { setChoice(undefined); setView({ kind: "choose" }); return; }
      const index = editor.beginAdd(providerId);
      if (index !== undefined) setView({ kind: "model", index });
    };
    if (editor.currentDirty && view.kind !== "home" && view.kind !== "providers") setLeave(() => action);
    else action();
  }
  function openProvider(id: string) {
    if (saving) return;
    const action = () => { editor.select(id); setView({ kind: "provider" }); };
    if ((view.kind === "model" || view.kind === "authentication" || view.kind === "provider") && editor.currentDirty) setLeave(() => action);
    else action();
  }
  const titles = { home: "模型", providers: "管理提供方", provider: selected?.name ?? "提供方", choose: "添加模型", model: editor.isNew ? "新提供方与模型" : "添加模型", authentication: "配置认证", subscription: "ChatGPT / Codex 订阅" };
  const model = view.kind === "model" ? editor.draft?.candidate.models[view.index] : undefined;
  const duplicateModel = Boolean(model && editor.draft?.candidate.models.some((item, index) => view.kind === "model" && index !== view.index && item.id === model.id));
  return <div className="settings-models-feature">
    {view.kind !== "home" && <div className="settings-models-navigation">
      <Button size="icon" variant="ghost" aria-label="返回模型首页" disabled={saving} onClick={() => navigate({ kind: "home" })}><ArrowLeft size={16} aria-hidden="true" /></Button>
      <h3 ref={heading} tabIndex={-1}>{titles[view.kind]}</h3>
    </div>}
    <div className="settings-model-view" hidden={view.kind !== "home"}>
      <div className="settings-section-heading"><h3 ref={view.kind === "home" ? heading : undefined} tabIndex={-1}>模型</h3><p>管理可用模型、订阅登录和新会话的默认设置。</p></div>
      <DefaultsEditor catalog={catalog} loading={modelsLoading} onReload={onReloadCatalog} onCatalog={onCatalog} onState={formState} onNotice={onNotice} />
      <div role="region" aria-label="ChatGPT Codex 订阅"><SettingRow title="ChatGPT / Codex 订阅" description={[subscriptionStatus, subscriptionReason].filter(Boolean).join(" · ")}><Button size="sm" variant="ghost" disabled={saving || !settings} onClick={() => navigate({ kind: "subscription" })}>{subscriptionConnected ? "管理登录" : subscription?.authorization?.canLogin ? "连接订阅" : "查看订阅设置"}</Button></SettingRow></div>
      <SettingRow title="提供方" description="管理连接、认证与模型定义。"><Button size="sm" variant="ghost" disabled={saving} onClick={() => navigate({ kind: "providers" })}>管理提供方</Button></SettingRow>
      <AvailableModels catalog={catalog} loading={modelsLoading} error={modelsError} onReload={onReloadCatalog} onAdd={() => add()} disabled={saving} />
    </div>
    {view.kind !== "home" && (error || settings?.issue) && <Alert title="提供方配置不可用" variant="error"><p>{error ?? settings?.issue}</p><Button size="sm" variant="outline" disabled={saving} onClick={onReload}>重新加载配置</Button></Alert>}
    {view.kind !== "home" && loading && !settings && <p className="settings-muted" role="status">正在加载提供方…</p>}
    {view.kind === "subscription" && settings && !subscription?.authorization && <section className="settings-section" aria-label="订阅登录说明"><Alert title="订阅登录暂不可用" variant="info"><p>{subscriptionReason}</p><Button size="sm" variant="outline" onClick={() => navigate({ kind: "providers" })}>管理提供方</Button></Alert></section>}
    {view.kind === "choose" && <section className="settings-section" aria-label="选择模型提供方">
      <div className="settings-section-heading"><h4>先选择提供方</h4><p>使用已有连接添加模型，或配置一个新的提供方。</p></div>
      <label className="settings-field"><span>提供方</span><Select aria-label="添加到提供方" value={choice ?? null} disabled={!settings || saving} placeholder="选择已有提供方或新建" options={[...editableProviders.map((provider) => ({ value: provider.id, label: provider.definition!.models.length >= 200 ? `${provider.name}（已达模型上限）` : provider.name, disabled: provider.definition!.models.length >= 200 })), ...(settings?.canAddProvider ? [{ value: "__new", label: "新建提供方" }] : [])]} onValueChange={(id) => setChoice(id ?? undefined)} /></label>
      <div className="settings-form-actions"><Button size="sm" disabled={!choice || saving} onClick={() => { if (choice) add(choice); }}>下一步</Button></div>
      <SettingRow title="使用内置模型" description="内置模型无需手动添加，配置对应提供方认证后即可选择。"><Button size="sm" variant="ghost" onClick={() => navigate({ kind: "providers" })}>管理提供方认证</Button></SettingRow>
    </section>}
    {view.kind === "model" && model && editor.draft && <section className="settings-section" aria-label="添加模型表单">
      <p className="settings-muted">{editor.isNew ? "先保存连接与第一个模型，再单独配置认证。" : `添加到 ${selected?.name ?? editor.selectedId}，保留已有连接和模型。`}</p>
      {!editor.isNew && !selected?.editable && <Alert title="提供方不能编辑" variant="warning"><p>{selected?.readOnlyReason ?? "提供方配置已变化，请重新加载。"}</p></Alert>}
      <fieldset className="settings-provider-definition" disabled={saving || (!editor.isNew && !selected?.editable)}><legend className="sr-only">模型与提供方定义</legend>
        {editor.isNew ? <ProviderConnectionFields editor={editor} /> : <p className="settings-muted">{editor.draft.candidate.baseUrl}</p>}
        <div className="settings-section-heading"><h4>模型信息</h4></div>
        <ModelDefinitionFields model={model} index={view.index} advanced={false} onChange={(change) => editor.editModel(view.index, change)} />
        <ModelEditor key={`${editor.draftKey}/add/${view.index}`} label="更多模型设置" initialOpen={false}>
          <ModelDefinitionFields model={model} index={view.index} basic={false} onChange={(change) => editor.editModel(view.index, change)} />
        </ModelEditor>
        {duplicateModel && <Alert title="模型 ID 已存在" variant="error"><p>此提供方已配置同名模型，请使用不同的模型 ID。</p></Alert>}
        <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={saving} onClick={() => navigate({ kind: "choose" })}>上一步</Button><Button size="sm" disabled={saving || !editor.canSave} onClick={async () => { const id = model.id; const saved = await editor.saveDefinition(); if (saved) setView({ kind: "authentication", modelId: id }); }}>{editor.pending === "definition" ? "正在保存…" : "保存模型"}</Button></div>
      </fieldset>
    </section>}
    {view.kind === "authentication" && <section className="settings-section" aria-label="模型认证步骤">
      <div className="settings-section-heading"><h4>{view.modelId}</h4><p>{selected?.credential.configured ? "模型已保存，提供方已配置认证。" : "已保存，待配置认证。配置后请返回首页刷新可用模型列表。"}</p></div>
      {selected && !selected.credential.configured && <ProviderCredentialFields editor={editor} />}
      <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={saving} onClick={() => navigate({ kind: "provider" })}>查看提供方</Button><Button size="sm" disabled={saving} onClick={() => navigate({ kind: "home" })}>{selected?.credential.configured ? "完成" : "稍后配置"}</Button></div>
    </section>}
    {view.kind === "providers" && <section className="settings-section" aria-label="提供方列表">
      <div className="settings-section-heading settings-section-heading-action"><div><h4>提供方</h4><p>连接、认证与模型定义在对应提供方中管理。</p></div><Button size="sm" variant="outline" disabled={!settings?.canAddProvider || saving} onClick={() => add("__new")}>新增提供方</Button></div>
      {settings?.providers.map((provider) => <SettingRow key={provider.id} title={provider.name} description={`${provider.id} · ${provider.credential.configured ? "已配置认证" : "未配置认证"} · ${sourceLabels[provider.credential.source]}`}><Button size="sm" variant="ghost" aria-label={`管理提供方 ${provider.id}`} onClick={() => openProvider(provider.id)}>管理</Button></SettingRow>)}
    </section>}
    {view.kind === "provider" && selected && <section className="settings-section settings-providers" aria-label="提供方设置">
      <div className="settings-provider-meta"><strong>{selected.id}</strong><span>{selected.kind === "builtin" ? "内置提供方" : "自定义提供方"} · {selected.credential.configured ? "已配置认证" : "未配置认证"}</span></div>
      {editor.draft && selected.editable ? <>
        <fieldset className="settings-provider-definition" disabled={saving}><legend className="sr-only">提供方接口定义</legend>
          <ProviderConnectionFields editor={editor} />
          <div className="settings-models-heading"><strong>模型定义</strong><Button size="sm" variant="ghost" disabled={editor.draft.candidate.models.length >= 200} onClick={() => add(selected.id)}>添加模型</Button></div>
          {editor.draft.candidate.models.map((entry, index) => <ModelEditor key={`${editor.draftKey}/${index}`} label={entry.name || entry.id} initialOpen={false}><ModelDefinitionFields model={entry} index={index} disabled={Boolean(editor.draft?.baseline.models[index]?.id)} onChange={(change) => editor.editModel(index, change)} /></ModelEditor>)}
          <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={saving || !editor.currentDirty} onClick={editor.cancel}>取消修改</Button><Button size="sm" disabled={saving || !editor.canSave} onClick={() => void editor.saveDefinition()}>{editor.pending === "definition" ? "正在保存…" : "保存提供方"}</Button></div>
        </fieldset>
      </> : <p className="settings-muted">{selected.readOnlyReason ?? "此提供方使用内置模型与接口定义，无需手动修改。"}</p>}
      <ProviderCredentialFields editor={editor} />
    </section>}
    {(view.kind === "provider" || view.kind === "model" || view.kind === "authentication") && <ProviderSaveFeedback editor={editor} />}
    <OpenAIAuthorization settings={settings} loading={loading} visible={active && (view.kind === "subscription" || view.kind === "provider" && selected?.id === "openai")} onReturn={() => navigate({ kind: "subscription" })} navigationDisabled={saving} onSaved={onSaved} onReload={onReload} onState={formState} onNotice={onNotice} />
    <ConfirmDialog open={Boolean(leave)} onOpenChange={(open) => { if (!open) setLeave(undefined); }} title="放弃当前修改？" description="已保存的模型和凭证会保留，当前未保存的内容将被清除。" cancelLabel="继续编辑" confirmLabel="放弃当前修改" onConfirm={() => { editor.cancel(); const next = leave; setLeave(undefined); next?.(); }} />
  </div>;
}
