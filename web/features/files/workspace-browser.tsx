"use client";

import { FileCode2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import type { BootstrapData } from "@/shared/types";
import type { SessionRuntimeRead } from "@/shared/runtime-types";
import type { ResourceTarget } from "@/shared/workspace-contract";
import { ResourceState, useWorkspace } from "@/features/workspace/shell";
import { resourceApi, sessionUrl, projectUrl, useResource } from "@/features/workspace/resources";
import { selectedQuery } from "@/features/workspace/route";
import { WorkspaceTree } from "./workspace-tree";

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
  const statuses = new Map(changes.map((change) => [change.path, change.status]));
  function select(next: string) { const params = new URLSearchParams(query); params.set("path", next); navigate(`${url}/${kind}?${params}`); }
  function ask() {
    if (!path) return;
    drafts.update(drafts.key(target.projectId, target.sessionId), { text: kind === "files" ? `请查看文件 ${path}` : `请检查 ${path} 的代码变更` });
    navigate(target.sessionId ? sessionUrl(target.projectId, target.sessionId) : `${projectUrl(target.projectId)}/sessions`);
  }
  const unavailableDiff = kind === "changes" && !target.sessionId && project.capability.state !== "ready";
  return <div className="workspace-browser">
    <div className="workspace-browser-grid">
      <WorkspaceTree key={`${api}/${kind}`} entries={kind === "files" ? files.map((file) => ({ path: file, status: statuses.get(file) })) : changes} selectedPath={path} onSelect={select} rootName={project.name} scope={target.sessionId ? session?.workspace?.mode === "current-branch" ? "当前分支 · 共享项目目录" : "会话工作区" : "原项目目录"} rootTitle={`${session?.workspace?.executionRoot ?? project.path} · ${branch}`} label={kind === "files" ? "文件" : "代码变更"} emptyMessage={kind === "files" ? "此工作区没有可显示的文件" : "工作区没有未提交变更"} unavailable={unavailableDiff ? <Alert variant="warning" title="暂时无法查看变更" className="workspace-tree-alert">{project.capability.state !== "ready" && project.capability.message}。准备 Git 和首次提交后刷新以查看变更。</Alert> : undefined} />
      <div className="workspace-preview">{path !== undefined ? <>
        <div className="workspace-preview-header"><span>{path}</span>{(!session || session.executable) && <button onClick={ask}>交给 KivA</button>}</div>
        {preview.loading ? <p className="workspace-preview-state">正在读取…</p> : preview.error ? <Alert variant="error" title={kind === "files" ? "文件读取失败" : "差异读取失败"} className="preview-alert">{preview.error}</Alert> : <>{preview.data?.truncated && <Alert variant="warning" title="预览内容已截断" className="preview-alert">文件较大，这里仅显示部分内容。</Alert>}<pre>{preview.data?.content}</pre></>}
      </> : <div className="workspace-preview-placeholder"><FileCode2 size={25} /><p>选择一个{kind === "files" ? "文件进行预览" : "变更查看差异"}</p><code>{session?.workspace?.executionRoot ?? project.path}</code></div>}</div>
    </div>
  </div>;
}
