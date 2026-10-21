"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { configurationForModel, ModelConfigurationFields } from "@/components/shared/ModelConfigurationFields";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = models.find((model) => model.provider === candidate?.provider && model.id === candidate.modelId);
  const levels = selected?.thinkingLevels ?? [];
  const valid = Boolean(selected && candidate && levels.includes(candidate.thinkingLevel));
  function close() { setOpen(false); }
  function changeOpen(next: boolean) {
    if (saving || (next && (disabled || loading || !models.length))) return;
    if (next) {
      const model = models.find((model) => model.provider === selection?.provider && model.id === selection.modelId) ?? models[0];
      if (model) setCandidate(configurationForModel(model, selection?.thinkingLevel));
      setError(undefined);
    }
    setOpen(next);
  }
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
  return <div className="model-settings-control"><Popover open={open} onOpenChange={(next, details) => { if (saving) { details.cancel(); return; } changeOpen(next); }}>
    <PopoverTrigger render={<button type="button" className="model-settings-trigger" ref={trigger} aria-label="模型与思考强度" disabled={disabled || loading || !models.length} title={selection ? `${selection.provider} / ${selection.modelId} · ${selection.thinkingLevel}` : "同时选择模型和思考强度"} />}>
      <span className="model-settings-name">{selection?.modelId ?? (loading ? "正在加载模型…" : models.length ? "选择模型" : "无可用模型")}</span>{selection && <span className="model-settings-level">· {selection.thinkingLevel}</span>}<ChevronDown size={12} aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent className="model-settings-popover" side="top" align="end" finalFocus={trigger} aria-label="设置模型与思考强度" aria-busy={saving}>
      <div className="model-settings-heading"><strong>模型设置</strong></div>
      <ModelConfigurationFields models={models} value={candidate} onChange={setCandidate} disabled={saving} />
      {selected && !selected.reasoning && <p className="model-settings-hint">此模型不支持思考强度，保存时使用关闭。</p>}
      {error && <Alert variant="error" title="模型设置未保存" className="dialog-alert">{error}</Alert>}
      <div className="model-settings-actions"><Button type="button" size="sm" variant="ghost" disabled={saving} onClick={close}>取消</Button><Button type="button" size="sm" disabled={disabled || !valid || saving} onClick={() => void save()}>{saving ? "正在保存…" : "保存并应用"}</Button></div>
    </PopoverContent>
  </Popover>
  </div>;
}
