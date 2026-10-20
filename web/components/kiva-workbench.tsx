"use client";

import { type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
  Folder,
  FolderOpen,
  GitBranch,
  MoreHorizontal,
  PanelLeft,
  PanelRightClose,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SquareTerminal,
  SquarePen,
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
import { ExtensionDialog } from "@/components/extension-dialog";
import type { RuntimeAttachment } from "@/shared/runtime-types";
import type { BootstrapData, SessionAction, SessionCollections, SessionSummary } from "@/shared/types";

const ATTACHMENT_ACCEPT = "image/*,text/*,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.yaml,.yml,.toml,.go,.py,.rs,.java,.sh";

function relativeTime(value: string, renderedAt: string) {
  const minutes = Math.round((new Date(renderedAt).getTime() - new Date(value).getTime()) / 60_000);
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [queueMode, setQueueMode] = useState<"steer" | "follow_up">("steer");
  const [attachments, setAttachments] = useState<RuntimeAttachment[]>([]);
  const [workspaceView, setWorkspaceView] = useState<"sessions" | "files" | "changes">("sessions");
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectPath, setProjectPath] = useState(data.project.path);
  const [projectError, setProjectError] = useState<string>();
  const [projectSwitching, setProjectSwitching] = useState(false);
  const [projectDirectory, setProjectDirectory] = useState<{ path: string; parent: string | null; directories: Array<{ name: string; path: string }> }>();
  const [projectDirectoryLoading, setProjectDirectoryLoading] = useState(false);
  const [workspacePreview, setWorkspacePreview] = useState<{ path: string; content?: string; error?: string; loading: boolean }>();
  const [sessionSearchOpen, setSessionSearchOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [sessions, setSessions] = useState(data.sessions);
  const [archivedSessions, setArchivedSessions] = useState<SessionSummary[]>([]);
  const [deletedSessions, setDeletedSessions] = useState<SessionSummary[]>([]);
  const [sessionView, setSessionView] = useState<"active" | "archived" | "trash">("active");
  const [sessionMenu, setSessionMenu] = useState<string>();
  const messageEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const runtime = useRuntime();
  const selected = useMemo(() => sessions.find((session) => session.id === selectedId), [sessions, selectedId]);
  const visibleSessions = (sessionView === "active" ? sessions : sessionView === "archived" ? archivedSessions : deletedSessions)
    .filter((session) => `${session.name} ${session.preview}`.toLowerCase().includes(sessionSearch.toLowerCase()));
  const running = runtime.status === "running";
  const emptyConversation = workspaceView === "sessions" && runtime.messages.length === 0;
  const MessageViewport = emptyConversation ? "div" : ScrollArea;
  const runtimeLabel = !runtime.connected ? "连接中" : running ? "运行中" : runtime.status === "error" ? "异常" : "已就绪";
  const visibleCommands = useMemo(() => runtime.snapshot?.commands.filter((command) => `${command.name} ${command.description ?? ""}`.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 12) ?? [], [commandQuery, runtime.snapshot?.commands]);

  useEffect(() => { void refreshSessions(); }, [runtime.sessionsVersion]);
  useEffect(() => { messageEnd.current?.scrollIntoView({ block: "end", behavior: running ? "smooth" : "auto" }); }, [runtime.messages, running]);
  useEffect(() => {
    const active = sessions.find((session) => session.id === runtime.snapshot?.session.id);
    setSelectedId(active?.id);
  }, [runtime.snapshot?.session.id, sessions]);
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        setProjectDialogOpen(false);
        setWorkspaceMenu(false);
        setCommandOpen(false);
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setWorkspaceView("sessions");
        void createSession();
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setWorkspaceView("sessions");
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

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
    if (!draft.trim() && !attachments.length) return;
    const message = draft;
    const images = attachments;
    setDraft("");
    setAttachments([]);
    setCommandOpen(false);
    try {
      if (running) await runtime.queueMessage(message, queueMode, images);
      else await runtime.sendPrompt(message, images);
    }
    catch { setDraft(message); setAttachments(images); }
  }

  async function attachImages(event: ChangeEvent<HTMLInputElement>) {
    await addFiles([...(event.target.files ?? [])]);
    event.target.value = "";
  }

  async function addFiles(files: File[]) {
    const available = files.slice(0, Math.max(0, 5 - attachments.length));
    const valid = available.filter((file) => file.type.startsWith("image/") ? file.size <= 10_000_000 : isTextFile(file) && file.size <= 1_000_000);
    const next = await Promise.all(valid.map(readAttachment));
    setAttachments((current) => [...current, ...next].slice(0, 5));
  }

  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...event.clipboardData.files];
    if (files.length) {
      event.preventDefault();
      void addFiles(files);
    }
  }

  function changeDraft(value: string) {
    setDraft(value);
    const slashQuery = /^\/([^\s]*)$/.exec(value);
    if (slashQuery) {
      setCommandOpen(true);
      setCommandQuery(slashQuery[1]);
    }
  }

  function chooseCommand(name: string) {
    setDraft(`/${name} `);
    setCommandOpen(false);
    setCommandQuery("");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function selectSession(session: SessionSummary) {
    if (session.id === runtime.snapshot?.session.id) {
      setSelectedId(session.id);
      return;
    }
    if (!session.path) throw new Error("该会话尚未保存");
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

  function askKivaAbout(path: string, kind: "file" | "change") {
    setWorkspaceView("sessions");
    setDraft(kind === "file" ? `请查看文件 ${path}` : `请检查 ${path} 的代码变更`);
  }

  async function loadWorkspacePreview(path: string, kind: "file" | "change") {
    setWorkspacePreview({ path, loading: true });
    try {
      const endpoint = kind === "file" ? "/api/project/file" : "/api/project/diff";
      const response = await fetch(`${endpoint}?path=${encodeURIComponent(path)}`);
      const result = await response.json() as { content?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "无法读取项目内容");
      setWorkspacePreview({ path, content: result.content ?? "", loading: false });
    } catch (error) {
      setWorkspacePreview({ path, error: error instanceof Error ? error.message : String(error), loading: false });
    }
  }

  async function openProject(path = projectPath) {
    setProjectError(undefined);
    setProjectSwitching(true);
    try {
      const response = await fetch("/api/project/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "无法打开项目");
      window.location.reload();
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
      setProjectSwitching(false);
    }
  }

  async function browseProjectDirectory(path: string) {
    setProjectError(undefined);
    setProjectDirectoryLoading(true);
    try {
      const response = await fetch(`/api/project/directories?path=${encodeURIComponent(path)}`);
      const result = await response.json() as { path?: string; parent?: string | null; directories?: Array<{ name: string; path: string }>; error?: string };
      if (!response.ok || !result.path || !Array.isArray(result.directories)) throw new Error(result.error ?? "无法读取该目录");
      setProjectDirectory({ path: result.path, parent: result.parent ?? null, directories: result.directories });
      setProjectPath(result.path);
    } catch (error) {
      setProjectError(error instanceof Error ? error.message : String(error));
    } finally {
      setProjectDirectoryLoading(false);
    }
  }

  function openProjectPicker() {
    setMobileSidebarOpen(false);
    setProjectDialogOpen(true);
    setProjectPath(data.project.path);
    void browseProjectDirectory(data.project.path);
  }

  return (
    <main className={cn("workbench", !inspectorOpen && "inspector-closed", mobileSidebarOpen && "sidebar-mobile-open")}>
      {mobileSidebarOpen && <button type="button" className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><SquareTerminal size={21} strokeWidth={1.65} /></div>
          <p className="brand-name">Kiva</p>
          <Button variant="ghost" size="icon" className="ml-auto" aria-label="打开命令面板" onClick={() => { setWorkspaceView("sessions"); setMobileSidebarOpen(false); setCommandOpen(true); }}><Command size={16} /></Button>
          <button type="button" className="mobile-sidebar-close" aria-label="关闭导航" onClick={() => setMobileSidebarOpen(false)}><X size={17} /></button>
        </div>

        <Button variant="ghost" className="sidebar-new-session" onClick={() => { setWorkspaceView("sessions"); setMobileSidebarOpen(false); void createSession(); }}><SquarePen size={16} />新建会话<kbd>⌘ N</kbd></Button>

        <nav className="nav-list" aria-label="工作区导航" onClick={() => setMobileSidebarOpen(false)}>
          <button className={cn("nav-item", workspaceView === "sessions" && sessionView === "active" && "active")} onClick={() => { setWorkspaceView("sessions"); setSessionView("active"); }}><Bot size={16} />会话</button>
          <button className={cn("nav-item", workspaceView === "files" && "active")} onClick={() => setWorkspaceView("files")}><FileCode2 size={16} />文件</button>
          <button className={cn("nav-item", workspaceView === "changes" && "active")} onClick={() => setWorkspaceView("changes")}><GitBranch size={16} />代码变更<Badge className="ml-auto">{data.project.dirtyFiles}</Badge></button>
          <button className={cn("nav-item", workspaceView === "sessions" && sessionView === "archived" && "active")} onClick={() => { setWorkspaceView("sessions"); setSessionView("archived"); }}><Archive size={16} />归档<Badge className="ml-auto">{archivedSessions.length}</Badge></button>
          <button className={cn("nav-item", workspaceView === "sessions" && sessionView === "trash" && "active")} onClick={() => { setWorkspaceView("sessions"); setSessionView("trash"); }}><Trash2 size={16} />回收站<Badge className="ml-auto">{deletedSessions.length}</Badge></button>
        </nav>

        <div className="sidebar-project-heading"><span>项目</span><button type="button" aria-label="添加项目" title="打开本地项目" onClick={openProjectPicker}><Plus size={14} /></button></div>
        <button type="button" className="project-card" aria-label="打开本地项目" title={data.project.path} onClick={openProjectPicker}>
          <div className="project-icon"><FolderOpen size={16} /></div>
          <div className="min-w-0 flex-1"><p className="project-name">{data.project.name}</p><p className="project-path">{data.project.path}</p></div>
          <span className="project-action-label">打开本地项目</span><ChevronDown size={13} className="text-muted-foreground" />
        </button>

        <div className="section-label"><span>{workspaceView === "files" ? "项目文件" : workspaceView === "changes" ? "工作区状态" : sessionView === "active" ? "最近会话" : sessionView === "archived" ? "已归档" : "最近删除"}</span>{workspaceView === "sessions" && <button type="button" aria-label="搜索会话" onClick={() => setSessionSearchOpen((value) => !value)}><Search size={13} /></button>}</div>
        {sessionSearchOpen && workspaceView === "sessions" && <div className="session-search"><Search size={13} /><input autoFocus value={sessionSearch} onChange={(event) => setSessionSearch(event.target.value)} placeholder="搜索会话" /></div>}
        <ScrollArea className="session-scroll">
          <div className="space-y-1 px-2 pb-4">
            {workspaceView === "files" ? <p className="sidebar-summary">{data.project.files.length} 个项目文件</p> : workspaceView === "changes" ? <p className="sidebar-summary">{data.project.changes.length} 个未提交变更</p> : visibleSessions.length ? visibleSessions.map((session) => (
              <div className="session-item-wrap" key={`${sessionView}:${session.id}`}>
                <button title={session.preview} onClick={() => { setMobileSidebarOpen(false); if (sessionView === "active") void selectSession(session).catch(() => {}); }} className={cn("session-item", selectedId === session.id && "selected")}>
                  <span className="session-item-title">{session.name}</span>
                  <span className="session-item-time">{relativeTime(session.updatedAt, data.renderedAt)}</span>
                </button>
                {session.persisted !== false && <button className="session-more" aria-label="会话操作" onClick={() => setSessionMenu((value) => value === session.path ? undefined : session.path)}><MoreHorizontal size={14} /></button>}
                {session.persisted !== false && sessionMenu === session.path && <div className="session-menu">
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
          <button className={cn("nav-item", inspectorOpen && "active")} onClick={() => { setMobileSidebarOpen(false); setInspectorOpen((value) => !value); }}><Settings2 size={16} />运行上下文</button>
          <div className="runtime-line"><span className={cn("status-dot", !runtime.connected && "offline")} />{runtimeLabel}<span className="ml-auto">本地 · Pi {data.runtime.piVersion}</span></div>
        </div>
      </aside>

      <section className={cn("conversation", emptyConversation && "is-empty")}>
        <header className="conversation-header">
          <div className="header-title"><Button variant="ghost" size="icon" className="mobile-sidebar-toggle" aria-label="打开导航" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><PanelLeft size={18} /></Button><div className="min-w-0"><h1>{workspaceView === "files" ? "文件浏览" : workspaceView === "changes" ? "代码变更" : selected?.name ?? runtime.snapshot?.session.name ?? "新会话"}</h1>{!emptyConversation && <p>{data.project.name} · {data.project.branch}</p>}</div></div>
          <div className="header-actions"><span className="runtime-badge" data-status={runtime.status}><CircleDot size={11} />{runtimeLabel}</span><div className="workspace-menu-wrap"><Button variant="ghost" size="icon" onClick={() => setWorkspaceMenu((value) => !value)} aria-label="会话菜单"><MoreHorizontal size={18} /></Button>{workspaceMenu && <div className="workspace-menu"><button onClick={() => { setWorkspaceMenu(false); void createSession(); }}>新建会话</button><button onClick={() => { setWorkspaceMenu(false); setInspectorOpen(true); }}>运行上下文</button><button disabled={running || !runtime.snapshot?.context} onClick={() => { setWorkspaceMenu(false); compactSession(); }}>压缩上下文</button></div>}</div><Button variant="ghost" size="icon" aria-label="切换运行上下文" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen((value) => !value)}><PanelRightClose size={17} /></Button></div>
        </header>

        {workspaceView === "sessions" ? <MessageViewport className="message-scroll">
          <div className="message-column">
            {runtime.messages.length ? runtime.messages.map((message) => message.role === "user" ? (
              <article key={message.id} className="user-message"><p>{message.text}</p></article>
            ) : (
              <article key={message.id} className="assistant-message">
                <div className="assistant-body">
                  <div className="message-meta"><strong>Kiva</strong><span>{message.streaming ? "正在回答" : "刚刚"}</span></div>
                  <MessageContent message={message} />
                </div>
              </article>
            )) : (
              <div className="empty-state">
                <h2>今天想构建什么？</h2>
                <button type="button" className="empty-project" title={data.project.path} onClick={openProjectPicker}><FolderOpen size={15} /><span>{data.project.name}</span><ChevronDown size={13} /></button>
              </div>
            )}
            {runtime.error && <div className="runtime-error">{runtime.error}</div>}
            <div ref={messageEnd} />
          </div>
        </MessageViewport> : <div className="workspace-browser">
          <div className="workspace-browser-heading"><p>{workspaceView === "files" ? "文件浏览" : "代码变更"}</p><span>{workspaceView === "files" ? `${data.project.files.length} 个文件` : `${data.project.changes.length} 个变更`}</span></div>
          <div className="workspace-browser-grid">
            <ScrollArea className="workspace-file-scroll"><div className="workspace-file-list">
              {workspaceView === "files" ? data.project.files.map((path) => <button type="button" className={cn(workspacePreview?.path === path && "selected")} key={path} onClick={() => void loadWorkspacePreview(path, "file")}><FileCode2 size={15} /><span>{path}</span></button>) : data.project.changes.length ? data.project.changes.map((change) => <button type="button" className={cn(workspacePreview?.path === change.path && "selected")} key={`${change.status}:${change.path}`} onClick={() => void loadWorkspacePreview(change.path, "change")}><strong>{change.status}</strong><span>{change.path}</span></button>) : <div className="workspace-empty"><GitBranch size={24} /><p>工作区没有未提交变更</p></div>}
            </div></ScrollArea>
            <div className="workspace-preview">
              {workspacePreview ? <><div className="workspace-preview-header"><span>{workspacePreview.path}</span><button type="button" onClick={() => askKivaAbout(workspacePreview.path, workspaceView === "files" ? "file" : "change")}>交给 Kiva</button></div>{workspacePreview.loading ? <p className="workspace-preview-state">正在读取…</p> : workspacePreview.error ? <p className="workspace-preview-error">{workspacePreview.error}</p> : <pre>{workspacePreview.content}</pre>}</> : <div className="workspace-preview-placeholder"><FileCode2 size={25} /><p>选择一个{workspaceView === "files" ? "文件进行预览" : "变更查看差异"}</p></div>}
            </div>
          </div>
        </div>}

        {workspaceView === "sessions" && <div className="composer-wrap">
          {commandOpen && <div className="command-palette">
            <div className="command-search"><Command size={14} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="搜索命令、技能和模板" /></div>
            <div className="command-list">{visibleCommands.length ? visibleCommands.map((command) => <button type="button" key={`${command.source}:${command.name}`} onClick={() => chooseCommand(command.name)}><span>/{command.name}</span><small>{command.description ?? "无说明"}</small><em>{command.source === "skill" ? "技能" : command.source === "prompt" ? "模板" : "扩展"}</em></button>) : <p>没有匹配的命令</p>}</div>
          </div>}
          {(runtime.snapshot?.queue.steering.length || runtime.snapshot?.queue.followUp.length) ? <div className="queue-panel">
            <div className="queue-heading"><Clock3 size={13} /><span>{runtime.snapshot.queue.steering.length} 条纠正 · {runtime.snapshot.queue.followUp.length} 条后续</span></div>
            <div className="queue-items">
              {runtime.snapshot.queue.steering.map((message, index) => <div key={`steer-${index}`}><span>纠正</span><p>{message}</p></div>)}
              {runtime.snapshot.queue.followUp.map((message, index) => <div key={`follow-up-${index}`}><span>后续</span><p>{message}</p></div>)}
            </div>
            <button onClick={() => void runtime.clearQueue()} aria-label="清空队列"><X size={13} /></button>
          </div> : null}
          <form className="composer" onSubmit={submit}>
            {attachments.length > 0 && <div className="attachment-list">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`}>{attachment.kind === "image" ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" /> : <span className="attachment-file"><FileCode2 size={14} /></span>}<span>{attachment.name}</span><button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button></div>)}</div>}
            <textarea value={draft} onChange={(event) => changeDraft(event.target.value)} onPaste={pasteImages} onKeyDown={handleComposerKeyDown} placeholder={running ? (queueMode === "steer" ? "立即纠正当前任务…" : "添加任务完成后的后续消息…") : "告诉 Kiva 你想完成什么…"} rows={2} />
            <div className="composer-actions">
              <input ref={fileInput} className="sr-only" type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={attachImages} />
              <Button type="button" variant="ghost" size="icon" onClick={() => fileInput.current?.click()} disabled={attachments.length >= 5} aria-label="添加附件"><Paperclip size={17} /></Button>
              {running ? <select className="composer-mode" value={queueMode} onChange={(event) => setQueueMode(event.target.value as "steer" | "follow_up")}><option value="steer">立即纠正</option><option value="follow_up">完成后追加</option></select> : <Button type="button" variant="ghost" size="sm" className="composer-command" onClick={() => setCommandOpen((value) => !value)}><SquareTerminal size={14} />命令</Button>}
              <div className="ml-auto flex min-w-0 items-center gap-2"><button type="button" className="composer-model" aria-label="模型与思考设置" onClick={() => setInspectorOpen(true)}><span>{runtime.snapshot?.model?.id ?? "选择模型"}</span><ChevronDown size={12} /></button>{running && <Button type="button" variant="ghost" size="icon" onClick={runtime.abort} aria-label="停止"><StopCircle size={17} /></Button>}<Button type="submit" size="icon" className="composer-send" aria-label="发送消息" disabled={(!draft.trim() && !attachments.length) || !runtime.connected}><ArrowUp size={17} /></Button></div>
            </div>
          </form>
          <div className="composer-note"><span className="composer-project-context"><SquareTerminal size={11} />本地<span>·</span><GitBranch size={11} /><span>{data.project.branch}</span></span><span className="composer-keyboard-hint">⌘ / Ctrl + Enter 发送</span></div>
          {emptyConversation && <div className="suggestions"><button type="button" onClick={() => setDraft("解释当前代码结构")}><FileCode2 size={13} />了解代码库</button><button type="button" onClick={() => setDraft("检查最近的代码变更")}><GitBranch size={13} />检查代码变更</button><button type="button" onClick={() => setDraft("规划下一个功能")}><Wrench size={13} />规划一个功能</button></div>}
        </div>}
      </section>

      {inspectorOpen && <aside className="inspector">
        <div className="inspector-heading"><h2>运行上下文</h2><Button variant="ghost" size="icon" aria-label="关闭运行上下文" onClick={() => setInspectorOpen(false)}><X size={16} /></Button></div>
        <div className="inspector-section"><p className="inspector-label">模型</p><div className="model-card"><span className="model-glyph">A</span><label><strong>{runtime.snapshot?.model?.id ?? "等待模型配置"}</strong><small>{runtime.snapshot?.model?.provider ?? (data.runtime.modelConfigFound ? "可从 models.json 选择" : "尚未找到 models.json")}</small></label><ChevronDown size={14} className="model-picker-chevron" aria-hidden="true" /><select aria-label="选择模型" disabled={running || !runtime.snapshot?.models.length} value={runtime.snapshot?.model ? JSON.stringify({ provider: runtime.snapshot.model.provider, id: runtime.snapshot.model.id }) : ""} onChange={(event) => changeModel(event.target.value)}><option value="" disabled>选择模型</option>{runtime.snapshot?.models.map((model) => <option key={`${model.provider}:${model.id}`} value={JSON.stringify({ provider: model.provider, id: model.id })}>{model.provider} / {model.id}</option>)}</select></div><div className="thinking-row"><span>思考强度</span><select aria-label="思考强度" disabled={running || !runtime.snapshot?.thinkingLevels.length} value={runtime.snapshot?.thinkingLevel ?? ""} onChange={(event) => void runtime.setThinking(event.target.value)}>{runtime.snapshot?.thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}</select></div></div>
        <div className="inspector-section"><div className="flex items-center justify-between"><p className="inspector-label">上下文使用量</p><span className="text-xs text-muted-foreground">{formatPercent(runtime.snapshot?.context?.percent)}</span></div><div className="context-track"><span style={{ width: `${Math.min(100, runtime.snapshot?.context?.percent ?? 0)}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>{formatTokens(runtime.snapshot?.context?.tokens)} tokens</span><span>{runtime.snapshot?.context ? `${formatTokens(runtime.snapshot.context.contextWindow)} 上限` : "等待首次请求"}</span></div>{runtime.snapshot?.context && <div className="context-details"><span>累计 {formatTokens(runtime.snapshot.context.total)}</span><span>${runtime.snapshot.context.cost.toFixed(4)}</span></div>}<Button type="button" variant="ghost" size="sm" className="compact-button" disabled={running || !runtime.snapshot?.context} onClick={compactSession}>压缩上下文</Button></div>
        <div className="inspector-section"><p className="inspector-label">项目</p><dl className="detail-list"><div><dt>分支</dt><dd><GitBranch size={12} />{data.project.branch}</dd></div><div><dt>变更</dt><dd>{data.project.dirtyFiles} 个文件</dd></div><div><dt>工作区</dt><dd className="truncate">{data.project.name}</dd></div></dl></div>
        <div className="inspector-section"><p className="inspector-label">可用能力</p><div className="capability-grid"><span><FileCode2 size={14} />文件</span><span><SquareTerminal size={14} />命令</span><span><GitBranch size={14} />Git</span><span><Wrench size={14} />工具</span></div></div>
        <div className="inspector-footer"><span className={cn("status-dot", !runtime.connected && "offline")} /><span>{runtimeLabel}</span><span className="ml-auto text-muted-foreground">127.0.0.1</span></div>
      </aside>}
      {projectDialogOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setProjectDialogOpen(false)}><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><div className="project-dialog-heading"><div><p className="eyebrow">LOCAL WORKSPACE</p><h2 id="project-dialog-title">打开本地项目</h2></div><button type="button" aria-label="关闭项目选择器" onClick={() => setProjectDialogOpen(false)}><X size={16} /></button></div><p>浏览运行 Kiva 的这台电脑，选择 Pi 要读取和修改的项目目录。</p><form className="project-location" onSubmit={(event) => { event.preventDefault(); void browseProjectDirectory(projectPath); }}><input autoFocus value={projectPath} onChange={(event) => setProjectPath(event.target.value)} placeholder="/path/to/project" spellCheck={false} /><Button type="submit" variant="ghost" disabled={projectDirectoryLoading || !projectPath.trim()}>转到</Button></form>{projectError && <div className="project-dialog-error">{projectError}</div>}<div className="directory-browser"><div className="directory-browser-header"><button type="button" disabled={!projectDirectory?.parent || projectDirectoryLoading} onClick={() => projectDirectory?.parent && void browseProjectDirectory(projectDirectory.parent)} aria-label="上级目录">↑</button><span title={projectDirectory?.path}>{projectDirectory?.path ?? "正在读取目录…"}</span></div><div className="directory-list">{projectDirectoryLoading ? <p>正在读取目录…</p> : projectDirectory?.directories.length ? projectDirectory.directories.map((directory) => <button type="button" key={directory.path} onClick={() => void browseProjectDirectory(directory.path)}><Folder size={15} /><span>{directory.name}</span><ChevronDown size={13} /></button>) : <p>这个目录中没有子目录</p>}</div></div><div className="project-dialog-actions"><span>选择：{projectDirectory?.path ?? projectPath}</span><Button type="button" disabled={projectSwitching || projectDirectoryLoading || !projectDirectory?.path} onClick={() => projectDirectory?.path && void openProject(projectDirectory.path)}>{projectSwitching ? "正在打开…" : "使用此文件夹"}</Button></div><div className="recent-projects"><span>最近项目</span>{data.recentProjects.map((path) => <button type="button" key={path} className={cn(path === data.project.path && "active")} disabled={projectSwitching} onClick={() => void browseProjectDirectory(path)}><Braces size={14} /><div><strong>{path.split(/[\\/]/).filter(Boolean).at(-1) ?? path}</strong><small>{path}</small></div>{path === data.project.path && <em>当前</em>}</button>)}</div></section></div>}
      <ExtensionDialog request={runtime.uiRequest} respond={runtime.respondToUI} />
    </main>
  );
}

function readAttachment(file: File): Promise<RuntimeAttachment> {
  if (!file.type.startsWith("image/")) return file.text().then((data) => ({ kind: "text", name: file.name, mimeType: file.type || "text/plain", data }));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve({ kind: "image", name: file.name, mimeType: file.type, data: String(reader.result).split(",", 2)[1] ?? "" });
    reader.readAsDataURL(file);
  });
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || /\.(md|json|jsx?|tsx?|css|html?|xml|ya?ml|toml|go|py|rs|java|sh)$/i.test(file.name);
}
