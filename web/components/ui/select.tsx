"use client";

import type { AriaAttributes, Ref } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlayLayer } from "./overlay-layer";

export interface SelectOption<Value extends string | number> {
  value: Value;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<Value extends string | number> extends AriaAttributes {
  value: Value | null;
  options: readonly SelectOption<Value>[];
  onValueChange: (value: Value | null) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  name?: string;
  form?: string;
  size?: "default" | "sm";
  ref?: Ref<HTMLButtonElement>;
}

/** A single controlled field; callers own labels, option data and value decoding. */
export function Select<Value extends string | number>({
  value, options, onValueChange, placeholder = "请选择", disabled, readOnly, required,
  className, id, name, form, size = "default", ref, ...aria
}: SelectProps<Value>) {
  const layer = useOverlayLayer() + 20;
  return (
    <SelectPrimitive.Root<Value>
      value={value} items={options} onValueChange={onValueChange} disabled={disabled}
      readOnly={readOnly} required={required} id={id} name={name} form={form}
    >
      <SelectPrimitive.Trigger ref={ref} data-slot="select-trigger" data-size={size} className={cn("ui-select-trigger", className)} {...aria}>
        <SelectPrimitive.Value data-slot="select-value" className="ui-select-value" placeholder={placeholder} />
        <SelectPrimitive.Icon className="ui-control-icon"><ChevronDown size={14} aria-hidden="true" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={4} align="start" alignItemWithTrigger={false} className="ui-popup-positioner" style={{ zIndex: layer }}>
          <SelectPrimitive.Popup data-slot="select-content" className="ui-select-popup ui-option-popup">
            <SelectPrimitive.List className="ui-option-list">
              {options.map((option) => (
                <SelectPrimitive.Item key={`${typeof option.value}:${option.value}`} value={option.value} disabled={option.disabled} className="ui-option" data-slot="select-item">
                  <SelectPrimitive.ItemText className="ui-option-label">{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ui-option-indicator"><Check size={14} aria-hidden="true" /></SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
