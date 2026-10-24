"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ArrowDown, ChevronDown, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ExtensionDialog } from "@/components/extension-dialog";
import { MessageContent } from "@/components/message-content";
import { useRuntime, type ChatMessage } from "@/lib/use-runtime";
import { useWebPreferences } from "@/lib/web-preferences";
import { formatMessageTime, normalizeMessageTimestamp } from "@/shared/message-time";
import type { SessionRuntimeRead } from "@/shared/runtime-types";
import type { SessionResource, SessionWorkspaceMode } from "@/shared/workspace-contract";
import { cn } from "@/lib/utils";
import { ResourceState, useWorkspace } from "@/features/workspace/shell";
import { mutate, resourceApi, sessionUrl, useResource } from "@/features/workspace/resources";
import { Composer } from "./composer";
import { useMessageScroll } from "./use-message-scroll";
import { SessionArtifacts } from "@/features/artifacts/session-artifacts";

export function SessionFeature({ projectId, sessionId }: { projectId: string; sessionId?: string }) {
  // A changed identity remounts local disclosures, while the shell retains its draft store.
  return <Conversation key={`${projectId}/${sessionId ?? "entry"}`} projectId={projectId} sessionId={sessionId} />;
}

function Conversation({ projectId, sessionId }: { projectId: string; sessionId?: string }) {
  const { preferences } = useWebPreferences();
  const { project, projectError, projectLoading, version, refresh, refreshProject, openProjectPicker, navigate, locationKey, navigationCurrent } = useWorkspace();
  const target = sessionId ? { projectId, sessionId } : undefined;
  const detail = useResource<SessionRuntimeRead>(target ? resourceApi(target) : undefined, version);
  const runtime = useRuntime(target);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string>();
  const operation = useRef<{ operationId: string; workspaceMode: SessionWorkspaceMode } | undefined>(undefined);
  const { setViewport, setContent, awayFromBottom, scrollToBottom } = useMessageScroll();
  const session = detail.data?.session.projectId === projectId && detail.data.session.id === sessionId ? detail.data.session : undefined;
  const identityError = detail.data && (!session || detail.data.projectId !== projectId || detail.data.sessionId !== sessionId) ? "返回的会话标识与 URL 不匹配" : undefined;
  const messages = runtime.snapshot ? runtime.messages : detail.data?.snapshot.messages ?? [];
  const empty = messages.length === 0;
  const MessageViewport = empty ? "div" : ScrollArea;
  const viewportProps = empty ? {} : { viewportRef: setViewport };
  useEffect(() => { if (runtime.sessionsVersion > 1) refreshProject(projectId); }, [runtime.sessionsVersion, refreshProject, projectId]);
  if (projectError || detail.error || identityError) return <ResourceState error={projectError ?? detail.error ?? identityError} />;
  if (projectLoading || !project || (sessionId && !session)) return <ResourceState />;
  const quarantined = runtime.snapshot?.lifecycle === "quarantined" || detail.data?.lifecycle === "quarantined";
  const editable = !session || (session.executable && detail.data?.executable && !quarantined);
  const currentBranch = session?.workspace?.mode === "current-branch";
  const continuationMode = operation.current?.workspaceMode ?? preferences.conversation.workspaceMode;
  const continuationLabel = continuationMode === "current-branch" ? "在当前分支继续" : "在独立 worktree 继续";
  const continuationDescription = continuationMode === "current-branch" ? "继续操作会创建新会话，直接使用项目当前文件，包含未提交改动；多个会话共享同一目录。" : "继续操作会创建新的独立 worktree，并从项目当前提交开始；不会还原历史代码。";
  async function continueSession() {
    if (!target || continuing) return;
    const source = locationKey;
    setContinuing(true); setError(undefined);
    operation.current ??= { operationId: crypto.randomUUID(), workspaceMode: preferences.conversation.workspaceMode };
    try {
      const result = await mutate<{ projectId: string; sessionId: string; session: SessionResource; cancelled?: boolean }>(`${resourceApi(target)}/continue`, operation.current);
      if (result.cancelled) return;
      if (result.projectId !== projectId || result.session.projectId !== projectId || result.sessionId !== result.session.id || result.sessionId === sessionId) throw new Error("继续会话返回的标识不匹配");
      operation.current = undefined;
      if (navigationCurrent(source)) navigate(sessionUrl(projectId, result.sessionId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { refreshProject(projectId); setContinuing(false); }
  }
  const artifactRefreshKey = `${version}:${runtime.sessionsVersion}:${messages.flatMap((message) => message.tools.filter((tool) => tool.status !== "running").map((tool) => `${tool.id}:${tool.status}`)).join(",")}`;
  const conversation = <div className={cn("session-feature", empty && "is-empty", !editable && "read-only-session", preferences.appearance.wrapCode && "conversation-wrap-code")} style={{ "--conversation-font-size": `${preferences.appearance.conversationFontSize}px` } as React.CSSProperties}>
    <div className="message-timeline">
      <MessageViewport className="message-scroll" {...viewportProps}><div className="message-column" ref={setContent}>
      {session && <Alert variant={quarantined || !session.executable ? "warning" : "info"} title={quarantined ? "运行时已隔离" : session.legacy ? "旧会话 · 只读" : currentBranch ? "当前分支 · 共享项目目录" : "独立 worktree"} className="session-workspace-notice">
        {quarantined && <p>运行时会话标识发生变化，已停止接受操作。请检查运行状态后显式恢复。</p>}
        {session.legacy ? <><p>这是在原项目目录执行的旧会话，仅供查看。{continuationDescription}</p>{session.collection !== "trash" && <Button variant="ghost" size="sm" disabled={continuing || project.capability.state !== "ready"} onClick={() => void continueSession()}>{continuing ? "正在创建…" : continuationLabel}</Button>}</> : <><span>{currentBranch ? "当前分支" : "会话工作区"} · {session.workspace?.branch ?? "未就绪"}</span><code title={session.workspace?.executionRoot}>{session.workspace?.executionRoot ?? "工作区不可用"}</code>{currentBranch && <p>直接使用项目当前文件，包含未提交改动；多个会话共享同一目录。</p>}{session.sourceSessionId && <p>继承自会话 {session.sourceSessionId}；{currentBranch ? "文件使用项目当前内容。" : "代码起点为创建时的已提交版本。"}</p>}{session.workspace?.state === "removed" && <p>工作区已删除。恢复历史不会恢复工作文件；可以显式继续为新会话。</p>}{!session.executable && session.collection === "active" && <><p>{continuationDescription}</p><Button variant="ghost" size="sm" disabled={continuing || project.capability.state !== "ready"} onClick={() => void continueSession()}>{continuing ? "正在创建…" : continuationLabel}</Button></>}</>}
        {session.collection !== "active" && <p>当前会话位于{session.collection === "archived" ? "归档" : "回收站"}，恢复后才能执行。</p>}
      </Alert>}
      {project.capability.state !== "ready" && <Alert variant="warning" title="项目尚未准备好" className="session-workspace-notice"><p>{project.capability.message}。请先在项目中准备 Git 仓库和首次提交，再刷新此页。</p><Button size="sm" variant="ghost" onClick={refresh}>重新检查</Button></Alert>}
      {messages.length ? messages.map((message) => <MessageRow key={message.id} message={message} />) : <div className="empty-state"><h2>今天想构建什么？</h2><button className="empty-project" title={project.path} onClick={openProjectPicker}><FolderOpen size={15} /><span>{project.name}</span><ChevronDown size={13} /></button></div>}
      {(runtime.error || error) && <Alert variant="error" title={error ? "无法继续会话" : "运行时出现问题"} className="conversation-alert">{error ?? runtime.error}</Alert>}
      {session?.executable && runtime.connected && !runtime.snapshot?.models.length && <div className="runtime-initialize"><Button size="sm" variant="ghost" onClick={() => void runtime.initialize()}>加载模型与运行设置</Button><span>仅在明确操作或发送时启动此会话运行时</span></div>}
      </div></MessageViewport>
      {!empty && awayFromBottom && <Button type="button" variant="outline" size="icon" className="scroll-to-bottom" aria-label="回到底部" title="回到底部" onClick={scrollToBottom}><ArrowDown size={17} aria-hidden="true" /></Button>}
    </div>
    {editable && <Composer projectId={projectId} session={session} runtime={runtime} emptyConversation={empty} />}
    <ExtensionDialog request={runtime.uiRequest} respond={runtime.respondToUI} />
  </div>;
  return target && session
    ? <SessionArtifacts scope={target} refreshKey={artifactRefreshKey} onSource={(href) => navigate(href)}>{conversation}</SessionArtifacts>
    : <div className="conversation-workspace">{conversation}</div>;
}

const MessageRow = memo(function MessageRow({ message }: { message: ChatMessage }) {
  return message.role === "user" ? <article className="user-message"><p>{message.text}</p></article> : <article className="assistant-message"><div className="assistant-body"><div className="message-meta"><strong>KivA</strong><MessageTime value={message.timestamp} /></div><MessageContent message={message} /></div></article>;
});

function MessageTime({ value }: { value?: number }) {
  const timestamp = normalizeMessageTimestamp(value);
  return <time dateTime={timestamp === undefined ? undefined : new Date(timestamp).toISOString()}>{formatMessageTime(timestamp)}</time>;
}
