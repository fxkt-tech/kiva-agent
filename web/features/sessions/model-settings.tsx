"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ModelCatalog, ModelConfiguration } from "@/shared/model-configuration";
import type { RuntimeModel } from "@/shared/runtime-types";
import { mutate, projectUrl } from "@/features/workspace/resources";

export function ModelSettings({ projectId, sessionId, models, selection, disabled, loading, onSaved, onPending }: {
  projectId: string; sessionId?: string; models: RuntimeModel[]; selection?: ModelConfiguration;
  disabled: boolean; loading: boolean; onSaved(catalog: ModelCatalog): void; onPending(pending: boolean): void;
}) {
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState<ModelConfiguration>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = models.find((model) => model.provider === candidate?.provider && model.id === candidate.modelId);
  const levels = selected?.thinkingLevels ?? [];
  const valid = Boolean(selected && candidate && levels.includes(candidate.thinkingLevel));
  function close() { setOpen(false); trigger.current?.focus(); }
  function chooseModel(model: RuntimeModel, level?: string) {
    const levels = model.thinkingLevels ?? [];
    setCandidate({ provider: model.provider, modelId: model.id, thinkingLevel: level && levels.includes(level) ? level : levels.includes("medium") ? "medium" : levels[0] ?? "" });
  }
  function toggle() {
    if (open) { close(); return; }
    const model = models.find((model) => model.provider === selection?.provider && model.id === selection.modelId) ?? models[0];
    if (model) chooseModel(model, selection?.thinkingLevel);
    setError(undefined); setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape" && !saving) { event.preventDefault(); close(); } };
    const outside = (event: globalThis.PointerEvent) => { if (!saving && event.target instanceof Node && !control.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("keydown", escape); window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", escape); window.removeEventListener("pointerdown", outside); };
  }, [open, saving]);
  useEffect(() => { if (disabled && !saving) setOpen(false); }, [disabled, saving]);
  async function save() {
    if (!candidate || !valid || saving || disabled) return;
    setSaving(true); onPending(true); setError(undefined);
    try {
      const result = await mutate<ModelCatalog>(`/api${projectUrl(projectId)}/models`, { ...candidate, ...(sessionId ? { sessionId } : {}) });
      onSaved(result); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); onPending(false); }
  }
  return <div className="model-settings-control" ref={control}>
    <button type="button" className="model-settings-trigger" ref={trigger} aria-label="模型与思考强度" aria-haspopup="dialog" aria-expanded={open} disabled={disabled || loading || !models.length} title={selection ? `${selection.provider} / ${selection.modelId} · ${selection.thinkingLevel}` : "同时选择模型和思考强度"} onClick={toggle}>
      <span className="model-settings-name">{selection?.modelId ?? (loading ? "正在加载模型…" : models.length ? "选择模型" : "无可用模型")}</span>{selection && <span className="model-settings-level">· {selection.thinkingLevel}</span>}<ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <section className="model-settings-popover" role="dialog" aria-label="设置模型与思考强度" aria-busy={saving}>
      <div className="model-settings-heading"><strong>模型设置</strong></div>
      <label className="model-settings-field"><span>模型</span><span className="model-settings-select"><select autoFocus aria-label="选择模型" disabled={saving} value={candidate ? JSON.stringify([candidate.provider, candidate.modelId]) : ""} onChange={(event) => { const model = models.find((model) => JSON.stringify([model.provider, model.id]) === event.target.value); if (model) chooseModel(model, candidate?.thinkingLevel); }}>{models.map((model) => <option key={`${model.provider}:${model.id}`} value={JSON.stringify([model.provider, model.id])}>{model.provider} / {model.id}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
      <label className="model-settings-field"><span>思考强度</span><span className="model-settings-select"><select aria-label="思考强度" disabled={saving || !levels.length} value={candidate?.thinkingLevel ?? ""} onChange={(event) => setCandidate((value) => value && { ...value, thinkingLevel: event.target.value })}>{levels.map((level) => <option key={level} value={level}>{level === "off" ? "关闭（off）" : level}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></span></label>
      {selected && !selected.reasoning && <p className="model-settings-hint">此模型不支持思考强度，保存时使用关闭。</p>}
      {error && <Alert variant="error" title="模型设置未保存" className="dialog-alert">{error}</Alert>}
      <div className="model-settings-actions"><Button type="button" size="sm" variant="ghost" disabled={saving} onClick={close}>取消</Button><Button type="button" size="sm" disabled={disabled || !valid || saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存并应用"}</Button></div>
    </section>}
  </div>;
}
