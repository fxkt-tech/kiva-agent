import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { legacyCacheRecoveryScript } from "@/lib/legacy-cache-recovery";
import { themeBootstrapScript } from "@/lib/theme-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "KivA Agent",
  description: "A project-local workspace for Kiva Agent",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Only this root attribute boundary differs before hydration: the allowlisted
  // boot script applies browser-local appearance attributes. Body/workbench warnings remain enabled.
  return <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning><head><script id="kiva-theme-bootstrap" dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /><script id="kiva-legacy-cache-recovery" dangerouslySetInnerHTML={{ __html: legacyCacheRecoveryScript }} /></head><body>{children}</body></html>;
}
