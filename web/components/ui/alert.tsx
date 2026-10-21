import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";
const icons = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert };

/** Shared inline feedback; never steals focus or expires before it can be read. */
export function Alert({ title, variant = "info", children, className, onDismiss }: {
  title: string;
  variant?: AlertVariant;
  children?: ReactNode;
  className?: string;
  onDismiss?(): void;
}) {
  const Icon = icons[variant];
  return <div className={cn("alert", className)} data-slot="alert" data-variant={variant} role={variant === "error" || variant === "warning" ? "alert" : "status"} aria-label={title} aria-atomic="true">
    <Icon className="alert-icon" size={17} strokeWidth={1.8} aria-hidden="true" />
    <div className="alert-content"><p className="alert-title">{title}</p>{children && <div className="alert-description">{children}</div>}</div>
    {onDismiss && <button className="alert-dismiss" type="button" aria-label={`关闭提示：${title}`} onClick={onDismiss}><X size={14} aria-hidden="true" /></button>}
  </div>;
}
