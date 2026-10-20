"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowUp,
  Bot,
  Braces,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  FileCode2,
  GitBranch,
  MoreHorizontal,
  PanelRightClose,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  SquareTerminal,
  StopCircle,
  Trash2,
  X,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useRuntime } from "@/lib/use-runtime";
import { MessageContent } from "@/components/message-content";
import type { BootstrapData, SessionAction, SessionCollections, SessionSummary } from "@/shared/types";

function relativeTime(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1_440)} 天`;
}

function formatTokens(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

export function KivaWorkbench({ data }: { data: BootstrapData }) {
  const [selectedId, setSelectedId] = useState<string>();
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [queueMode, setQueueMode] = useState<"steer" | "follow_up">("steer");
  const [sessions, setSessions] = useState(data.sessions);
  const [archivedSessions, setArchivedSessions] = useState<SessionSummary[]>([]);
  const [deletedSessions, setDeletedSessions] = useState<SessionSummary[]>([]);
  const [sessionView, setSessionView] = useState<"active" | "archived" | "trash">("active");
  const [sessionMenu, setSessionMenu] = useState<string>();
  const messageEnd = useRef<HTMLDivElement>(null);
  const runtime = useRuntime();
  const selected = useMemo(() => sessions.find((session) => session.id === selectedId), [sessions, selectedId]);
  const visibleSessions = sessionView === "active" ? sessions : sessionView === "archived" ? archivedSessions : deletedSessions;
  const running = runtime.status === "running";
  const runtimeLabel = !runtime.connected ? "连接中" : running ? "运行中" : runtime.status === "error" ? "异常" : "已就绪";

  useEffect(() => { void refreshSessions(); }, [runtime.sessionsVersion]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ block: "end", behavior: running ? "smooth" : "auto" }); }, [runtime.messages, running]);
  useEffect(() => {
    const active = sessions.find((session) => session.id === runtime.snapshot?.session.id);
    setSelectedId(active?.id);
  }, [runtime.snapshot?.session.id, sessions]);

  async function refreshSessions() {
    try {
      const response = await fetch("/api/sessions");
      if (!response.ok) return;
      const collections = await response.json() as SessionCollections;
      setSessions(collections.active);
      setArchivedSessions(collections.archived);
      setDeletedSessions(collections.trash);
    } catch {
      // The runtime connection indicator already communicates server availability.
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    const message = draft;
    setDraft("");
    try {
      if (running) await runtime.queueMessage(message, queueMode);
      else await runtime.sendPrompt(message);
    }
    catch { setDraft(message); }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function selectSession(session: SessionSummary) {
    await runtime.switchSession(session.path);
    setSelectedId(session.id);
  }

  async function createSession() {
    try {
      await runtime.newSession();
      setSelectedId(undefined);
      setSessionView("active");
      await refreshSessions();
    } catch {
      // Runtime error is displayed in the conversation.
    }
  }

  async function renameSession(session: SessionSummary) {
    const name = window.prompt("新的会话名称", session.name)?.trim();
    if (!name) return;
    try {
      if (selectedId !== session.id) await selectSession(session);
      await runtime.renameSession(name);
      await refreshSessions();
    } catch {
      // Switching or renaming errors are already exposed by the runtime hook.
    } finally {
      setSessionMenu(undefined);
    }
  }

  async function mutateSession(action: SessionAction) {
    const response = await fetch("/api/sessions/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    const result = await response.json() as SessionCollections & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "会话操作失败");
    setSessions(result.active);
    setArchivedSessions(result.archived);
    setDeletedSessions(result.trash);
    setSessionMenu(undefined);
  }

  async function deleteSession(session: SessionSummary, collection: "active" | "archived") {
    if (!window.confirm(`删除“${session.name}”？会话会移动到可恢复的本地垃圾目录。`)) return;
    try {
      await mutateSession({ type: "delete", sessionPath: session.path, collection });
      if (selectedId === session.id) setSelectedId(undefined);
    } catch {
      await refreshSessions();
    }
  }

  function changeModel(value: string) {
    try {
      const model = JSON.parse(value) as { provider: string; id: string };
      void runtime.setModel(model.provider, model.id);
    } catch {
      // Options are generated from the trusted runtime snapshot.
    }
  }

  function compactSession() {
    if (window.confirm("压缩会调用当前模型生成会话摘要。确定继续吗？")) void runtime.compact();
  }

  return (
    <main className={cn("workbench", !inspectorOpen && "inspector-closed")}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={16} /></div>
          <div><p className="brand-name">Kiva</p><p className="brand-caption">Agent workspace</p></div>
          <Button variant="ghost" size="icon" className="ml-auto"><Command size={16} /></Button>
        </div>

        <div className="project-card">
          <div className="project-icon"><Braces size={17} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{data.project.name}</p><p className="truncate text-xs text-muted-foreground">{data.project.path}</p></div>
          <ChevronDown size={15} className="text-muted-foreground" />
        </div>

        <Button className="mx-3 mt-3 justify-start" onClick={() => void createSession()}><Plus size={16} />新建会话<span className="ml-auto text-[10px] opacity-60">⌘ N</span></Button>

        <nav className="nav-list">
          <button className={cn("nav-item", sessionView === "active" && "active")} onClick={() => setSessionView("active")}><Bot size={16} />会话</button>
          <button className="nav-item"><FileCode2 size={16} />文件</button>
          <button className="nav-item"><GitBranch size={16} />代码变更<Badge className="ml-auto">{data.project.dirtyFiles}</Badge></button>
          <button className={cn("nav-item", sessionView === "archived" && "active")} onClick={() => setSessionView("archived")}><Archive size={16} />归档<Badge className="ml-auto">{archivedSessions.length}</Badge></button>
          <button className={cn("nav-item", sessionView === "trash" && "active")} onClick={() => setSessionView("trash")}><Trash2 size={16} />回收站<Badge className="ml-auto">{deletedSessions.length}</Badge></button>
        </nav>

        <div className="section-label"><span>{sessionView === "active" ? "最近会话" : sessionView === "archived" ? "已归档" : "最近删除"}</span><Search size={13} /></div>
        <ScrollArea className="session-scroll">
          <div className="space-y-1 px-2 pb-4">
            {visibleSessions.length ? visibleSessions.map((session) => (
              <div className="session-item-wrap" key={`${sessionView}:${session.path}`}>
                <button onClick={() => sessionView === "active" && void selectSession(session).catch(() => {})} className={cn("session-item", selectedId === session.id && "selected")}>
                  <span className="truncate pr-6 text-sm font-medium">{session.name}</span>
                  <span className="line-clamp-2 text-left text-xs leading-5 text-muted-foreground">{session.preview}</span>
                  <span className="mt-1 text-[10px] text-muted-foreground/70">{relativeTime(session.updatedAt)}</span>
                </button>
                <button className="session-more" aria-label="会话操作" onClick={() => setSessionMenu((value) => value === session.path ? undefined : session.path)}><MoreHorizontal size={14} /></button>
                {sessionMenu === session.path && <div className="session-menu">
                  {sessionView === "active" ? <>
                    <button onClick={() => void renameSession(session)}><Pencil size={12} />重命名</button>
                    <button onClick={() => void mutateSession({ type: "archive", sessionPath: session.path }).then(() => selectedId === session.id && setSelectedId(undefined)).catch(() => refreshSessions())}><Archive size={12} />归档</button>
                  </> : sessionView === "archived" ? <button onClick={() => void mutateSession({ type: "restore", sessionPath: session.path }).catch(() => refreshSessions())}><RotateCcw size={12} />恢复</button> : <button onClick={() => void mutateSession({ type: "restore_deleted", sessionPath: session.path }).catch(() => refreshSessions())}><RotateCcw size={12} />恢复删除</button>}
                  {sessionView !== "trash" && <button className="danger" onClick={() => void deleteSession(session, sessionView)}><Trash2 size={12} />删除</button>}
                </div>}
              </div>
            )) : <p className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground">{sessionView === "active" ? <>还没有会话。<br />创建一个开始工作。</> : sessionView === "archived" ? "还没有归档会话。" : "回收站是空的。"}</p>}
          </div>
        </ScrollArea>

        <div className="sidebar-footer">
          <button className="nav-item"><Settings2 size={16} />设置</button>
          <div className="runtime-line"><span className="status-dot" />Pi {data.runtime.piVersion}<span className="ml-auto">本地</span></div>
        </div>
      </aside>

      <section className="conversation">
        <header className="conversation-header">
          <div className="min-w-0"><h1>{selected?.name ?? runtime.snapshot?.session.name ?? "新的开始"}</h1><p>{data.project.name} · {data.project.branch}</p></div>
          <div className="header-actions"><Badge className="hidden sm:inline-flex"><CircleDot size={10} className={cn("mr-1", runtime.status === "error" ? "text-red-400" : running ? "text-amber-300" : "text-emerald-400")} />{runtimeLabel}</Badge><Button variant="ghost" size="icon"><MoreHorizontal size={18} /></Button><Button variant="ghost" size="icon" onClick={() => setInspectorOpen((value) => !value)}><PanelRightClose size={18} /></Button></div>
        </header>

        <ScrollArea className="message-scroll">
          <div className="message-column">
            <div className="date-divider"><span>今天</span></div>
            {runtime.messages.length ? runtime.messages.map((message) => message.role === "user" ? (
              <article key={message.id} className="user-message"><p>{message.text}</p></article>
            ) : (
              <article key={message.id} className="assistant-message">
                <div className="assistant-avatar"><Sparkles size={14} /></div>
                <div className="assistant-body">
                  <div className="message-meta"><strong>Kiva</strong><span>{message.streaming ? "正在回答" : "刚刚"}</span></div>
                  <MessageContent message={message} />
                </div>
              </article>
            )) : (
              <div className="empty-state">
                <div className="empty-orbit"><Sparkles size={24} /></div>
                <p className="eyebrow">KIVA AGENT</p>
                <h2>把想法交给一个<br />了解项目的搭档。</h2>
                <p className="empty-copy">从任务、问题或者一段不完整的思路开始。Kiva 会读取项目上下文，并把工作过程清晰地呈现在这里。</p>
                <div className="suggestions"><button onClick={() => setDraft("解释当前代码结构")}>解释当前代码结构</button><button onClick={() => setDraft("检查最近的代码变更")}>检查最近的代码变更</button><button onClick={() => setDraft("规划下一个功能")}>规划下一个功能</button></div>
              </div>
            )}
            {runtime.error && <div className="runtime-error">{runtime.error}</div>}
            <div ref={messageEnd} />
          </div>
        </ScrollArea>

        <div className="composer-wrap">
          {(runtime.snapshot?.queue.steering.length || runtime.snapshot?.queue.followUp.length) ? <div className="queue-panel">
            <div className="queue-heading"><Clock3 size={13} /><span>{runtime.snapshot.queue.steering.length} 条纠正 · {runtime.snapshot.queue.followUp.length} 条后续</span></div>
            <div className="queue-items">
              {runtime.snapshot.queue.steering.map((message, index) => <div key={`steer-${index}`}><span>纠正</span><p>{message}</p></div>)}
              {runtime.snapshot.queue.followUp.map((message, index) => <div key={`follow-up-${index}`}><span>后续</span><p>{message}</p></div>)}
            </div>
            <button onClick={() => void runtime.clearQueue()} aria-label="清空队列"><X size={13} /></button>
          </div> : null}
          <form className="composer" onSubmit={submit}>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={running ? (queueMode === "steer" ? "立即纠正当前任务…" : "添加任务完成后的后续消息…") : "告诉 Kiva 你想完成什么…"} rows={2} />
            <div className="composer-actions">
              <Button type="button" variant="ghost" size="icon"><Paperclip size={17} /></Button>
              {running ? <select className="composer-mode" value={queueMode} onChange={(event) => setQueueMode(event.target.value as "steer" | "follow_up")}><option value="steer">立即纠正</option><option value="follow_up">完成后追加</option></select> : <Button type="button" variant="ghost" size="sm"><SquareTerminal size={15} />工具</Button>}
              <div className="ml-auto flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:block">⌘ Enter</span>{running && <Button type="button" variant="ghost" size="icon" onClick={runtime.abort} aria-label="停止"><StopCircle size={17} /></Button>}<Button type="submit" size="icon" disabled={!draft.trim() || !runtime.connected}><ArrowUp size={17} /></Button></div>
            </div>
          </form>
          <p className="composer-note">Kiva 可能会修改文件或执行命令，请在提交前检查变更。</p>
        </div>
      </section>

      {inspectorOpen && <aside className="inspector">
        <div className="inspector-heading"><div><p className="eyebrow">SESSION CONTEXT</p><h2>运行上下文</h2></div><Button variant="ghost" size="icon" onClick={() => setInspectorOpen(false)}><PanelRightClose size={16} /></Button></div>
        <div className="inspector-section"><p className="inspector-label">模型</p><div className="model-card"><span className="model-glyph">A</span><label><strong>{runtime.snapshot?.model?.id ?? "等待模型配置"}</strong><small>{runtime.snapshot?.model?.provider ?? (data.runtime.modelConfigFound ? "可从 models.json 选择" : "尚未找到 models.json")}</small></label><select aria-label="选择模型" disabled={running || !runtime.snapshot?.models.length} value={runtime.snapshot?.model ? JSON.stringify({ provider: runtime.snapshot.model.provider, id: runtime.snapshot.model.id }) : ""} onChange={(event) => changeModel(event.target.value)}><option value="" disabled>选择模型</option>{runtime.snapshot?.models.map((model) => <option key={`${model.provider}:${model.id}`} value={JSON.stringify({ provider: model.provider, id: model.id })}>{model.provider} / {model.id}</option>)}</select></div><div className="thinking-row"><span>思考强度</span><select aria-label="思考强度" disabled={running || !runtime.snapshot?.thinkingLevels.length} value={runtime.snapshot?.thinkingLevel ?? ""} onChange={(event) => void runtime.setThinking(event.target.value)}>{runtime.snapshot?.thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select></div></div>
        <div className="inspector-section"><div className="flex items-center justify-between"><p className="inspector-label">上下文使用量</p><span className="text-xs text-muted-foreground">{formatPercent(runtime.snapshot?.context?.percent)}</span></div><div className="context-track"><span style={{ width: `${Math.min(100, runtime.snapshot?.context?.percent ?? 0)}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{formatTokens(runtime.snapshot?.context?.tokens)} tokens</span><span>{runtime.snapshot?.context ? `${formatTokens(runtime.snapshot.context.contextWindow)} 上限` : "等待首次请求"}</span></div>{runtime.snapshot?.context && <div className="context-details"><span>累计 {formatTokens(runtime.snapshot.context.total)}</span><span>${runtime.snapshot.context.cost.toFixed(4)}</span></div>}<Button type="button" variant="ghost" size="sm" className="compact-button" disabled={running || !runtime.snapshot?.context} onClick={compactSession}>压缩上下文</Button></div>
        <div className="inspector-section"><p className="inspector-label">项目</p><dl className="detail-list"><div><dt>分支</dt><dd><GitBranch size={12} />{data.project.branch}</dd></div><div><dt>变更</dt><dd>{data.project.dirtyFiles} 个文件</dd></div><div><dt>工作区</dt><dd className="truncate">{data.project.name}</dd></div></dl></div>
        <div className="inspector-section"><p className="inspector-label">可用能力</p><div className="capability-grid"><span><FileCode2 size={14} />文件</span><span><SquareTerminal size={14} />命令</span><span><GitBranch size={14} />Git</span><span><Wrench size={14} />工具</span></div></div>
        <div className="inspector-footer"><span className={cn("status-dot", !runtime.connected && "offline")} /><span>{runtimeLabel}</span><span className="ml-auto text-muted-foreground">127.0.0.1</span></div>
      </aside>}
    </main>
  );
}
