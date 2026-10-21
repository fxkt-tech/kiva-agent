"use client";
export default function WorkspaceError({ error, reset }: { error: Error; reset(): void }) { return <div className="resource-state resource-error" role="alert"><p>{error.message || "无法打开此资源"}</p><button onClick={reset}>重试</button><a href="/projects">查看项目</a></div>; }
