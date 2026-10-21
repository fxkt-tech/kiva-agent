"use client";

import { useId, useMemo, type AriaAttributes, type Ref } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayLayer } from "./overlay-layer";
import type { SelectOption } from "./select";

export type ComboboxOption<Value extends string | number> = SelectOption<Value>;

export interface ComboboxProps<Value extends string | number> extends AriaAttributes {
  label: string;
  value: Value | null;
  options: readonly ComboboxOption<Value>[];
  onValueChange: (value: Value | null) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  clearable?: boolean;
  emptyText?: string;
  className?: string;
  id?: string;
  name?: string;
  size?: "default" | "sm";
  ref?: Ref<HTMLInputElement>;
}

/** Searchable selection with the same scalar value contract as Select. */
export function Combobox<Value extends string | number>({
  label, value, options, onValueChange, loading = false, disabled = false, readOnly,
  required, clearable = true, emptyText = "无匹配选项", placeholder, className,
  id, name, size = "default", ref, ...aria
}: ComboboxProps<Value>) {
  const generatedId = useId();
  const layer = useOverlayLayer() + 20;
  const selectedOption = options.find((option) => Object.is(option.value, value)) ?? null;
  // Base UI synchronizes input text when the selected object identity changes.
  // Keep a scalar selection stable when a parent rebuilds otherwise equal options,
  // so unrelated renders cannot replace an in-progress search with its label.
  const selected = useMemo(() => selectedOption, [selectedOption?.value, selectedOption?.label, selectedOption?.disabled]);
  return (
    <ComboboxPrimitive.Root<ComboboxOption<Value>>
      items={options} value={selected} onValueChange={(option, details) => {
        if (!clearable && option === null) {
          details.cancel();
          if (details.reason === "escape-key") details.allowPropagation();
          return;
        }
        onValueChange(option?.value ?? null);
      }}
      onInputValueChange={(_inputValue, details) => {
        // Base UI clears the input before its selection on a closed-popup Escape.
        // Preserve both for required selections and let the hosting overlay dismiss.
        if (!clearable && details.reason === "escape-key") {
          details.cancel();
          details.allowPropagation();
        }
      }}
      itemToStringLabel={(option) => option.label} itemToStringValue={(option) => String(option.value)}
      isItemEqualToValue={(option, chosen) => Object.is(option.value, chosen.value)}
      autoHighlight disabled={disabled} readOnly={readOnly} required={required} name={name}
    >
      <ComboboxPrimitive.InputGroup data-slot="combobox-field" data-size={size} data-disabled={disabled ? "" : undefined} className={cn("ui-combobox-field", className)}>
        <ComboboxPrimitive.Input
          ref={ref} id={id ?? generatedId} aria-label={label} aria-busy={loading || undefined}
          placeholder={placeholder ?? label} className="ui-combobox-input" {...aria}
        />
        {clearable && selected !== null && !readOnly && (
          <ComboboxPrimitive.Clear aria-label={`清空${label}`} className="ui-combobox-action"><X size={13} aria-hidden="true" /></ComboboxPrimitive.Clear>
        )}
        <ComboboxPrimitive.Trigger aria-label={`展开${label}选项`} className="ui-combobox-action">
          {loading ? <LoaderCircle size={14} className="ui-spinner" aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </ComboboxPrimitive.Trigger>
      </ComboboxPrimitive.InputGroup>
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} align="start" className="ui-popup-positioner" style={{ zIndex: layer }}>
          <ComboboxPrimitive.Popup data-slot="combobox-content" className="ui-combobox-popup ui-option-popup">
            <ComboboxPrimitive.Empty className="ui-option-empty">{loading ? "加载中…" : emptyText}</ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List className="ui-option-list">
              {(option: ComboboxOption<Value>) => (
                <ComboboxPrimitive.Item key={`${typeof option.value}:${option.value}`} value={option} disabled={option.disabled} className="ui-option" data-slot="combobox-item">
                  <span className="ui-option-label">{option.label}</span>
                  <ComboboxPrimitive.ItemIndicator className="ui-option-indicator"><Check size={14} aria-hidden="true" /></ComboboxPrimitive.ItemIndicator>
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
