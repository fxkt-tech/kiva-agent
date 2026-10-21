"use client";

import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { mergeClassName, OverlayLayer, overlayStyle, useOverlayLayer } from "./overlay-layer";

export function Dialog<Payload = unknown>(props: DialogPrimitive.Root.Props<Payload>) {
  return <OverlayLayer><DialogPrimitive.Root {...props} /></OverlayLayer>;
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, style, ...props }: DialogPrimitive.Backdrop.Props) {
  const layer = useOverlayLayer();
  return <DialogPrimitive.Backdrop data-slot="dialog-overlay" className={mergeClassName("ui-dialog-overlay", className)} style={overlayStyle(layer, style)} {...props} />;
}

export interface DialogContentProps extends DialogPrimitive.Popup.Props {
  showCloseButton?: boolean;
  overlayClassName?: string;
}

export function DialogContent({ className, style, children, showCloseButton = true, overlayClassName, ...props }: DialogContentProps) {
  const layer = useOverlayLayer();
  return (
    <DialogPortal>
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Popup data-slot="dialog-content" className={mergeClassName("ui-dialog-content", className)} style={overlayStyle(layer + 1, style)} {...props}>
        {children}
        {showCloseButton && (
          <DialogClose aria-label="关闭对话框" render={<Button variant="ghost" size="icon-sm" className="ui-dialog-close" />}>
            <X size={16} aria-hidden="true" />
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("ui-dialog-header", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("ui-dialog-footer", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={mergeClassName("ui-dialog-title", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={mergeClassName("ui-dialog-description", className)} {...props} />;
}
