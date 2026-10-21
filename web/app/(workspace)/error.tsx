"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ error, reset }: { error: Error; reset(): void }) {
  return <div className="resource-state"><Alert variant="error" title="无法打开此资源"><p>{error.message || "加载时发生错误，请重试。"}</p><div className="alert-actions"><Button size="sm" variant="outline" onClick={reset}>重试</Button><Button asChild size="sm" variant="ghost"><a href="/projects">查看项目</a></Button></div></Alert></div>;
}
