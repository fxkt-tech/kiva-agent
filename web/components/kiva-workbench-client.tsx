"use client";

import dynamic from "next/dynamic";
import type { BootstrapData } from "@/shared/types";

const ClientWorkbench = dynamic(
  () => import("@/components/kiva-workbench").then((module) => module.KivaWorkbench),
  {
    ssr: false,
    loading: () => <main className="workbench-loading"><div className="workbench-loading-mark" /><p>正在打开 Kiva…</p></main>,
  },
);

export function KivaWorkbenchClient({ data }: { data: BootstrapData }) {
  return <ClientWorkbench data={data} />;
}
