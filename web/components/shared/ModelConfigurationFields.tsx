"use client";

import { useId } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Select } from "@/components/ui/select";
import type { ModelConfiguration } from "@/shared/model-configuration";
import type { RuntimeModel } from "@/shared/runtime-types";

/** Preserve supported effort when changing models, otherwise use Pi's available levels. */
export function configurationForModel(model: RuntimeModel, thinkingLevel?: string): ModelConfiguration {
  const levels = model.thinkingLevels ?? [];
  return {
    provider: model.provider,
    modelId: model.id,
    thinkingLevel: thinkingLevel && levels.includes(thinkingLevel) ? thinkingLevel : levels.includes("medium") ? "medium" : levels[0] ?? "",
  };
}

export function ModelConfigurationFields({ models, value, onChange, disabled = false, loading = false, modelLabel = "选择模型", thinkingLabel = "思考强度", className }: {
  models: RuntimeModel[];
  value?: ModelConfiguration;
  onChange(value: ModelConfiguration): void;
  disabled?: boolean;
  loading?: boolean;
  modelLabel?: string;
  thinkingLabel?: string;
  className?: string;
}) {
  const id = useId();
  const selected = models.find((model) => model.provider === value?.provider && model.id === value.modelId);
  const levels = selected?.thinkingLevels ?? [];
  return <div className={["model-configuration-fields", className].filter(Boolean).join(" ")}>
    <label className="model-configuration-field" htmlFor={`${id}-model`}><span>模型</span><Combobox
      id={`${id}-model`}
      label={modelLabel}
      value={selected ? JSON.stringify([selected.provider, selected.id]) : null}
      options={models.map((model) => ({ value: JSON.stringify([model.provider, model.id]), label: `${model.provider} / ${model.id}` }))}
      placeholder="选择模型"
      emptyText="没有匹配的模型"
      disabled={disabled}
      loading={loading}
      clearable={false}
      onValueChange={(next) => {
        const model = models.find((model) => JSON.stringify([model.provider, model.id]) === next);
        if (model) onChange(configurationForModel(model, value?.thinkingLevel));
      }}
    /></label>
    <label className="model-configuration-field" htmlFor={`${id}-thinking`}><span>思考强度</span><Select
      id={`${id}-thinking`}
      aria-label={thinkingLabel}
      value={value && levels.includes(value.thinkingLevel) ? value.thinkingLevel : null}
      options={levels.map((level) => ({ value: level, label: level === "off" ? "关闭（off）" : level }))}
      disabled={disabled || !levels.length}
      placeholder="选择思考强度"
      onValueChange={(thinkingLevel) => { if (value && thinkingLevel) onChange({ ...value, thinkingLevel }); }}
    /></label>
  </div>;
}
