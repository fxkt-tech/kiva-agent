"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const ClientWorkbench = dynamic(
  () => import("@/components/kiva-workbench").then((module) => module.KivaWorkbench),
  {
    ssr: false,
    loading: () => <main className="workbench-loading"><div className="workbench-loading-mark" /><p>正在打开 KivA…</p></main>,
  },
);

export function KivaWorkbenchClient({ children }: { children: ReactNode }) {
  return <ClientWorkbench>{children}</ClientWorkbench>;
}
