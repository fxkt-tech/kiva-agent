import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--action-radius,0.5rem)] text-[13px] font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        ghost: "text-muted-foreground hover:bg-hover hover:text-foreground",
        outline: "border border-border bg-transparent text-foreground hover:bg-subtle",
        secondary: "bg-subtle text-foreground hover:bg-hover",
        destructive: "bg-[var(--danger)] text-[var(--background)] hover:opacity-90",
      },
      size: { default: "h-8 px-3.5", icon: "size-8", sm: "h-7 px-2.5 text-xs", "icon-sm": "size-7" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" data-variant={variant ?? "default"} className={cn("ui-button", buttonVariants({ variant, size }), className)} {...props} />;
}
