"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { mergeClassName } from "./overlay-layer";

export function Switch({ className, size = "default", ...props }: SwitchPrimitive.Root.Props & { size?: "default" | "sm" }) {
  return (
    <SwitchPrimitive.Root data-slot="switch" data-size={size} className={mergeClassName("ui-switch", className)} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="ui-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
