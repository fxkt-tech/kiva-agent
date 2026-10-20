import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kiva — Agent Workspace",
  description: "A project-local workspace for Kiva Agent",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
