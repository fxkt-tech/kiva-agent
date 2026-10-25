"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { LoadingIndicator } from "@/components/shared/LoadingIndicator";

const ClientWorkbench = dynamic(
  () => import("@/components/kiva-workbench").then((module) => module.KivaWorkbench),
  {
    ssr: false,
    loading: () => <main className="workbench-loading"><LoadingIndicator label="正在打开 KivA…" /></main>,
  },
);

export function KivaWorkbenchClient({ children }: { children: ReactNode }) {
  return <ClientWorkbench>{children}</ClientWorkbench>;
}
