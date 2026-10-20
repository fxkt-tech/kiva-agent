import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("badge inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground", className)} {...props} />;
}
