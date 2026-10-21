"use client";

import { useRef, type ReactNode } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm(): void | Promise<void>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, children, confirmLabel = "确认", cancelLabel = "取消", pending = false, confirmDisabled = false, onConfirm }: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
    <AlertDialogContent initialFocus={cancel} showCloseButton={false} aria-busy={pending}>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
      </AlertDialogHeader>
      {children}
      <AlertDialogFooter>
        <Button ref={cancel} variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
        <Button disabled={pending || confirmDisabled} onClick={() => { void onConfirm(); }}>{confirmLabel}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
