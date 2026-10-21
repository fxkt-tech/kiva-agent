"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ExtensionDialog } from "@/components/extension-dialog";
import { MessageContent } from "@/components/message-content";
import { useRuntime } from "@/lib/use-runtime";
import { formatMessageTime, normalizeMessageTimestamp } from "@/shared/message-time";
import type { SessionRuntimeRead } from "@/shared/runtime-types";
import type { SessionResource } from "@/shared/workspace-contract";
import { cn } from "@/lib/utils";
import { ResourceState, useWorkspace } from "@/features/workspace/shell";
import { mutate, resourceApi, sessionUrl, useResource } from "@/features/workspace/resources";
import { Composer } from "./composer";

export function SessionFeature({ projectId, sessionId }: { projectId: string; sessionId?: string }) {
  // A changed identity remounts local disclosures, while the shell retains its draft store.
  return <Conversation key={`${projectId}/${sessionId ?? "entry"}`} projectId={projectId} sessionId={sessionId} />;
}

function Conversation({ projectId, sessionId }: { projectId: string; sessionId?: string }) {
  const { project, projectError, projectLoading, version, refresh, openProjectPicker, navigate, locationKey, navigationCurrent } = useWorkspace();
  const target = sessionId ? { projectId, sessionId } : undefined;
  const detail = useResource<SessionRuntimeRead>(target ? resourceApi(target) : undefined, version);
  const runtime = useRuntime(target);
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState<string>();
  const operation = useRef<string | undefined>(undefined);
  const messageEnd = useRef<HTMLDivElement>(null);
  const session = detail.data?.session.projectId === projectId && detail.data.session.id === sessionId ? detail.data.session : undefined;
  const identityError = detail.data && (!session || detail.data.projectId !== projectId || detail.data.sessionId !== sessionId) ? "返回的会话标识与 URL 不匹配" : undefined;
  const messages = runtime.snapshot ? runtime.messages : detail.data?.snapshot.messages ?? [];
  const running = runtime.status === "running";
  const empty = messages.length === 0;
  const MessageViewport = empty ? "div" : ScrollArea;
  useEffect(() => { messageEnd.current?.scrollIntoView({ block: "end", behavior: running ? "smooth" : "auto" }); }, [messages, running]);
  useEffect(() => { if (runtime.sessionsVersion > 1) refresh(); }, [runtime.sessionsVersion, refresh]);
  if (projectError || detail.error || identityError) return <ResourceState error={projectError ?? detail.error ?? identityError} />;
  if (projectLoading || !project || (sessionId && !session)) return <ResourceState />;
  const quarantined = runtime.snapshot?.lifecycle === "quarantined" || detail.data?.lifecycle === "quarantined";
  const editable = !session || (session.executable && detail.data?.executable && !quarantined);
  async function continueSession() {
    if (!target || continuing) return;
    const source = locationKey;
    setContinuing(true); setError(undefined);
    operation.current ??= crypto.randomUUID();
    try {
      const result = await mutate<{ projectId: string; sessionId: string; session: SessionResource; cancelled?: boolean }>(`${resourceApi(target)}/continue`, { operationId: operation.current });
      if (result.cancelled) return;
      if (result.projectId !== projectId || result.session.projectId !== projectId || result.sessionId !== result.session.id || result.sessionId === sessionId) throw new Error("继续会话返回的标识不匹配");
      operation.current = undefined; refresh();
      if (navigationCurrent(source)) navigate(sessionUrl(projectId, result.sessionId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setContinuing(false); }
  }
  return <div className={cn("session-feature", empty && "is-empty", !editable && "read-only-session")}>
    <MessageViewport className="message-scroll"><div className="message-column">
      {session && <Alert variant={quarantined || !session.executable ? "warning" : "info"} title={quarantined ? "运行时已隔离" : session.legacy ? "旧会话 · 只读" : "会话工作区"} className="session-workspace-notice">
        {quarantined && <p>运行时会话标识发生变化，已停止接受操作。请检查运行状态后显式恢复。</p>}
        {session.legacy ? <><p>这是在原项目目录执行的旧会话，仅供查看。继续操作会创建新的隔离会话，并从项目当前提交开始；不会还原历史代码。</p>{session.collection !== "trash" && <Button variant="ghost" size="sm" disabled={continuing || project.capability.state !== "ready"} onClick={() => void continueSession()}>{continuing ? "正在创建…" : "在独立工作区继续"}</Button>}</> : <><span>会话工作区 · {session.workspace?.branch ?? "未就绪"}</span><code title={session.workspace?.executionRoot}>{session.workspace?.executionRoot ?? "工作区不可用"}</code>{session.sourceSessionId && <p>继承自会话 {session.sourceSessionId}；代码起点为创建时的已提交版本。</p>}{session.workspace?.state === "removed" && <p>工作区已删除。恢复历史不会恢复工作文件；可以显式继续为新会话。</p>}{!session.executable && session.collection === "active" && <Button variant="ghost" size="sm" disabled={continuing || project.capability.state !== "ready"} onClick={() => void continueSession()}>在新工作区继续</Button>}</>}
        {session.collection !== "active" && <p>当前会话位于{session.collection === "archived" ? "归档" : "回收站"}，恢复后才能执行。</p>}
      </Alert>}
      {project.capability.state !== "ready" && <Alert variant="warning" title="项目尚未准备好" className="session-workspace-notice"><p>{project.capability.message}。请先在项目中准备 Git 仓库和首次提交，再刷新此页。</p><Button size="sm" variant="ghost" onClick={refresh}>重新检查</Button></Alert>}
      {messages.length ? messages.map((message) => message.role === "user" ? <article key={message.id} className="user-message"><p>{message.text}</p></article> : <article key={message.id} className="assistant-message"><div className="assistant-body"><div className="message-meta"><strong>KivA</strong><MessageTime value={message.timestamp} /></div><MessageContent message={message} /></div></article>) : <div className="empty-state"><h2>今天想构建什么？</h2><button className="empty-project" title={project.path} onClick={openProjectPicker}><FolderOpen size={15} /><span>{project.name}</span><ChevronDown size={13} /></button></div>}
      {(runtime.error || error) && <Alert variant="error" title={error ? "无法继续会话" : "运行时出现问题"} className="conversation-alert">{error ?? runtime.error}</Alert>}
      {session?.executable && runtime.connected && !runtime.snapshot?.models.length && <div className="runtime-initialize"><Button size="sm" variant="ghost" onClick={() => void runtime.initialize()}>加载模型与运行设置</Button><span>仅在明确操作或发送时启动此会话运行时</span></div>}
      <div ref={messageEnd} />
    </div></MessageViewport>
    {editable && <Composer projectId={projectId} session={session} runtime={runtime} emptyConversation={empty} />}
    <ExtensionDialog request={runtime.uiRequest} respond={runtime.respondToUI} />
  </div>;
}

function MessageTime({ value }: { value?: number }) {
  const timestamp = normalizeMessageTimestamp(value);
  return <time dateTime={timestamp === undefined ? undefined : new Date(timestamp).toISOString()}>{formatMessageTime(timestamp)}</time>;
}
