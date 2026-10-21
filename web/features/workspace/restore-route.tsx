"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function RestoreRoute() {
  const router = useRouter();
  useEffect(() => {
    let route = "/projects";
    try { const remembered = sessionStorage.getItem("kiva:last-route"); if (remembered && /^\/projects(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}(?:\/(?:sessions(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}(?:\/(?:files|changes))?)?|files|changes|archive|trash))?)?(?:\?[^#]*)?$/.test(remembered)) route = remembered; } catch { /* A private browser may block navigation memory. */ }
    router.replace(route);
  }, [router]);
  return <main className="workbench-loading"><div className="workbench-loading-mark" /><p>正在打开 KivA…</p></main>;
}
