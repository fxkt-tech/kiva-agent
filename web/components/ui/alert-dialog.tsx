"use client";

import type { ComponentProps } from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { Button } from "./button";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogTitle,
  type DialogContentProps,
} from "./dialog";
import { OverlayLayer } from "./overlay-layer";

export function AlertDialog<Payload = unknown>(props: AlertDialogPrimitive.Root.Props<Payload>) {
  return <OverlayLayer><AlertDialogPrimitive.Root {...props} /></OverlayLayer>;
}

export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogClose = AlertDialogPrimitive.Close;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;
export const AlertDialogOverlay = DialogOverlay;
export const AlertDialogHeader = DialogHeader;
export const AlertDialogFooter = DialogFooter;
export const AlertDialogTitle = DialogTitle;
export const AlertDialogDescription = DialogDescription;

export function AlertDialogContent(props: DialogContentProps) {
  return <DialogContent data-slot="alert-dialog-content" {...props} />;
}

/** Confirmation stays open until its owner confirms completion. */
export function AlertDialogAction(props: ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />;
}

export function AlertDialogCancel({ variant = "outline", size = "default", ...props }: AlertDialogPrimitive.Close.Props & Pick<ComponentProps<typeof Button>, "variant" | "size">) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-cancel" render={<Button variant={variant} size={size} />} {...props} />;
}
