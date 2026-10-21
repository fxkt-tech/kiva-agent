import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { legacyCacheRecoveryScript } from "@/lib/legacy-cache-recovery";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiva — Agent Workspace",
  description: "A project-local workspace for Kiva Agent",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}><head><script id="kiva-legacy-cache-recovery" dangerouslySetInnerHTML={{ __html: legacyCacheRecoveryScript }} /></head><body>{children}</body></html>;
}
