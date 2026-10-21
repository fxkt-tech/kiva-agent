"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { mergeClassName, OverlayLayer, overlayStyle, useOverlayLayer } from "./overlay-layer";

export function DropdownMenu<Payload = unknown>(props: MenuPrimitive.Root.Props<Payload>) {
  return <OverlayLayer><MenuPrimitive.Root {...props} /></OverlayLayer>;
}

export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export interface DropdownMenuContentProps extends MenuPrimitive.Popup.Props,
  Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset"> {}

export function DropdownMenuContent({
  className, style, side = "bottom", align = "start", sideOffset = 4, alignOffset = 0, ...props
}: DropdownMenuContentProps) {
  const layer = useOverlayLayer();
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} alignOffset={alignOffset} className="ui-popup-positioner" style={{ zIndex: layer }}>
        <MenuPrimitive.Popup data-slot="dropdown-menu-content" className={mergeClassName("ui-dropdown-menu", className)} style={overlayStyle(layer, style)} {...props} />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, variant = "default", ...props }: MenuPrimitive.Item.Props & { variant?: "default" | "destructive" }) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" data-variant={variant} className={mergeClassName("ui-dropdown-menu-item", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={mergeClassName("ui-dropdown-menu-separator", className)} {...props} />;
}
