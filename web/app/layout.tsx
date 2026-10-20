import type { Metadata } from "next";
import { legacyCacheRecoveryScript } from "@/lib/legacy-cache-recovery";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiva — Agent Workspace",
  description: "A project-local workspace for Kiva Agent",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><head><script id="kiva-legacy-cache-recovery" dangerouslySetInnerHTML={{ __html: legacyCacheRecoveryScript }} /></head><body>{children}</body></html>;
}
