"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { mergeClassName, OverlayLayer, overlayStyle, useOverlayLayer } from "./overlay-layer";

export function Popover<Payload = unknown>(props: PopoverPrimitive.Root.Props<Payload>) {
  return <OverlayLayer><PopoverPrimitive.Root {...props} /></OverlayLayer>;
}

export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps extends PopoverPrimitive.Popup.Props,
  Pick<PopoverPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset"> {}

export function PopoverContent({
  className, style, side = "bottom", align = "start", sideOffset = 6, alignOffset = 0, ...props
}: PopoverContentProps) {
  const layer = useOverlayLayer();
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} alignOffset={alignOffset} className="ui-popup-positioner" style={{ zIndex: layer }}>
        <PopoverPrimitive.Popup data-slot="popover-content" className={mergeClassName("ui-popover-content", className)} style={overlayStyle(layer, style)} {...props} />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return <PopoverPrimitive.Title data-slot="popover-title" className={mergeClassName("ui-dialog-title", className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return <PopoverPrimitive.Description data-slot="popover-description" className={mergeClassName("ui-dialog-description", className)} {...props} />;
}
