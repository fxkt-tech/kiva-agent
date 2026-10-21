"use client";

import { FileCode2, GitBranch } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { BootstrapData } from "@/shared/types";
import type { SessionRuntimeRead } from "@/shared/runtime-types";
import type { ResourceTarget } from "@/shared/workspace-contract";
import { ResourceState, useWorkspace } from "@/features/workspace/shell";
import { resourceApi, sessionUrl, projectUrl, useResource } from "@/features/workspace/resources";
import { selectedQuery } from "@/features/workspace/route";

export function WorkspaceBrowser({ target, kind }: { target: ResourceTarget; kind: "files" | "changes" }) {
  const { query, navigate, drafts, project, projectError, version } = useWorkspace();
  let path: string | undefined, queryError: string | undefined;
  try { path = selectedQuery(query, "path"); } catch (cause) { queryError = cause instanceof Error ? cause.message : String(cause); }
  const api = resourceApi(target);
  const workspace = useResource<BootstrapData>(`${api}/workspace`, version);
  const detail = useResource<SessionRuntimeRead>(target.sessionId ? api : undefined, version);
  const preview = useResource<{ path: string; content: string; truncated?: boolean }>(path !== undefined && !queryError ? `${api}/${kind}?path=${encodeURIComponent(path)}` : undefined);
  const url = target.sessionId ? sessionUrl(target.projectId, target.sessionId) : projectUrl(target.projectId);
  const session = detail.data?.session;
  if (projectError || workspace.error || detail.error || queryError) return <ResourceState error={projectError ?? workspace.error ?? detail.error ?? queryError} />;
  if (!workspace.data || !project || (target.sessionId && !session)) return <ResourceState />;
  const files = workspace.data.project.files;
  const changes = workspace.data.project.changes;
  const branch = session?.workspace?.branch ?? workspace.data.project.branch;
  function select(next: string) { const params = new URLSearchParams(query); params.set("path", next); navigate(`${url}/${kind}?${params}`); }
  function ask() {
    if (!path) return;
    drafts.update(drafts.key(target.projectId, target.sessionId), { text: kind === "files" ? `请查看文件 ${path}` : `请检查 ${path} 的代码变更` });
    navigate(target.sessionId ? sessionUrl(target.projectId, target.sessionId) : `${projectUrl(target.projectId)}/sessions`);
  }
  const unavailableDiff = kind === "changes" && !target.sessionId && project.capability.state !== "ready";
  return <div className="workspace-browser"><div className="workspace-browser-heading"><p>{kind === "files" ? "文件浏览" : "代码变更"}</p><span>{target.sessionId ? "会话工作区" : "原项目目录"} · {branch}</span></div><div className="workspace-browser-grid"><ScrollArea className="workspace-file-scroll"><div className="workspace-file-list">{kind === "files" ? files.map((file) => <button className={cn(path === file && "selected")} key={file} onClick={() => select(file)}><FileCode2 size={15} /><span>{file}</span></button>) : unavailableDiff ? <p className="resource-error">{project.capability.state !== "ready" && project.capability.message}。准备 Git 和首次提交后刷新以查看变更。</p> : changes.length ? changes.map((change) => <button className={cn(path === change.path && "selected")} key={`${change.status}:${change.path}`} onClick={() => select(change.path)}><strong>{change.status}</strong><span>{change.path}</span></button>) : <div className="workspace-empty"><GitBranch size={24} /><p>工作区没有未提交变更</p></div>}</div></ScrollArea><div className="workspace-preview">{path !== undefined ? <><div className="workspace-preview-header"><span>{path}</span>{(!session || session.executable) && <button onClick={ask}>交给 KivA</button>}</div>{preview.loading ? <p className="workspace-preview-state">正在读取…</p> : preview.error ? <p className="workspace-preview-error" role="alert">{preview.error}</p> : <>{preview.data?.truncated && <p className="workspace-preview-state">内容已截断</p>}<pre>{preview.data?.content}</pre></>}</> : <div className="workspace-preview-placeholder"><FileCode2 size={25} /><p>选择一个{kind === "files" ? "文件进行预览" : "变更查看差异"}</p><code>{session?.workspace?.executionRoot ?? project.path}</code></div>}</div></div></div>;
}
