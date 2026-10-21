"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, FileJson2, MoreHorizontal, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import type { SessionResource, DeletionPreview, DeletionOutcome, SessionCollection } from "@/shared/workspace-contract";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { mutate, resourceApi, sessionUrl, useResource, projectUrl } from "@/features/workspace/resources";
import { ResourceState, useWorkspace } from "@/features/workspace/shell";
import { SessionJsonlDialog } from "./session-jsonl-dialog";

function relativeTime(value: string, renderedAt: string) {
  const minutes = Math.max(0, Math.round((Date.parse(renderedAt) - Date.parse(value)) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1_440)} 天`;
}

export interface Collections { active: SessionResource[]; archived: SessionResource[]; trash: SessionResource[] }
export function useCollections(projectId: string, version = 0) { return useResource<Collections>(`/api${projectUrl(projectId)}/sessions`, version); }

export function SessionRows({ projectId, sessions, loading, error }: { projectId: string; sessions: SessionResource[]; loading?: boolean; error?: string }) {
  const { route, navigate, refresh, bootstrap } = useWorkspace();
  const [menu, setMenu] = useState<string>();
  const [deleting, setDeleting] = useState<SessionResource>();
  const [renaming, setRenaming] = useState<SessionResource>();
  const [viewingJsonl, setViewingJsonl] = useState<SessionResource>();
  const sessionButtons = useRef(new Map<string, HTMLButtonElement>());
  const [actionError, setActionError] = useState<string>();
  const actionScope = useRef(0);
  useEffect(() => { actionScope.current += 1; setMenu(undefined); setDeleting(undefined); setRenaming(undefined); setViewingJsonl(undefined); setActionError(undefined); }, [projectId, route.projectId, route.sessionId, route.section]);
  async function act(session: SessionResource, body: object) {
    const source = actionScope.current;
    setActionError(undefined);
    try { await mutate(`${resourceApi({ projectId: session.projectId, sessionId: session.id })}/actions`, body); if (source === actionScope.current) setMenu((current) => current === session.id ? undefined : current); refresh(); }
    catch (cause) { if (source === actionScope.current) setActionError(cause instanceof Error ? cause.message : String(cause)); }
  }
  if (error) return <Alert variant="error" title="会话列表加载失败" className="sidebar-alert">{error}</Alert>;
  return <div className="session-rows">
    {sessions.map((session) => {
      const recovering = session.deletion && session.deletion.status !== "complete";
      return <div className="session-item-wrap" key={session.id}>
        <a href={sessionUrl(projectId, session.id)} title={session.preview} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) { event.preventDefault(); navigate(sessionUrl(projectId, session.id)); } }} className={cn("session-item", route.projectId === projectId && route.sessionId === session.id && "selected")}><span className="session-item-title">{session.name}</span><span className="session-item-time">{relativeTime(session.updatedAt, bootstrap?.renderedAt ?? session.updatedAt)}</span></a>
        <DropdownMenu open={menu === session.id} onOpenChange={(open) => setMenu((current) => open ? session.id : current === session.id ? undefined : current)}>
          <DropdownMenuTrigger ref={(node: HTMLButtonElement | null) => { if (node) sessionButtons.current.set(session.id, node); else sessionButtons.current.delete(session.id); }} className="session-more" aria-label={`会话操作 ${session.name}`}><MoreHorizontal size={14} /></DropdownMenuTrigger>
          <DropdownMenuContent className="session-actions-menu" align="end" aria-label={`会话操作 ${session.name}`} finalFocus={() => deleting?.id === session.id || renaming?.id === session.id || viewingJsonl?.id === session.id ? false : sessionButtons.current.get(session.id)}>
            <DropdownMenuItem onClick={() => { setViewingJsonl(session); setMenu(undefined); }}><FileJson2 size={12} />查看 JSONL</DropdownMenuItem>
            {recovering ? <DropdownMenuItem variant="destructive" onClick={() => { setDeleting(session); setMenu(undefined); }}><RotateCcw size={12} />重试删除</DropdownMenuItem> : <>
              {session.collection === "active" ? <><DropdownMenuItem onClick={() => { setRenaming(session); setMenu(undefined); }}><Pencil size={12} />重命名</DropdownMenuItem><DropdownMenuItem onClick={() => void act(session, { type: "archive" })}><Archive size={12} />归档</DropdownMenuItem></> : <DropdownMenuItem onClick={() => void act(session, { type: session.collection === "trash" ? "restore_deleted" : "restore" })}><RotateCcw size={12} />{session.collection === "trash" ? "恢复删除" : "恢复"}</DropdownMenuItem>}
              {session.collection !== "trash" && <DropdownMenuItem variant="destructive" onClick={() => { setDeleting(session); setMenu(undefined); }}><Trash2 size={12} />删除</DropdownMenuItem>}
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>;
    })}
    {!sessions.length && <p className="sidebar-summary">{loading ? "正在读取会话…" : "还没有会话。"}</p>}{actionError && <Alert variant="error" title="会话操作失败" className="session-action-alert" onDismiss={() => setActionError(undefined)}>{actionError}</Alert>}
    {deleting && <DeleteSessionDialog key={`${deleting.projectId}:${deleting.id}`} session={deleting} onClose={() => setDeleting(undefined)} onDeleted={() => { setDeleting((current) => current?.projectId === deleting.projectId && current.id === deleting.id ? undefined : current); refresh(); }} returnFocus={sessionButtons.current.get(deleting.id)} />}
    {renaming && <RenameSessionDialog key={`${renaming.projectId}:${renaming.id}`} session={renaming} onClose={() => setRenaming(undefined)} onRenamed={refresh} returnFocus={sessionButtons.current.get(renaming.id)} />}
    {viewingJsonl && <SessionJsonlDialog key={`${viewingJsonl.projectId}:${viewingJsonl.id}`} session={viewingJsonl} onClose={() => setViewingJsonl(undefined)} returnFocus={sessionButtons.current.get(viewingJsonl.id)} />}
  </div>;
}

export function SessionCollectionFeature({ projectId, collection }: { projectId: string; collection: SessionCollection }) {
  const { version, project, projectLoading, projectError } = useWorkspace();
  const result = useCollections(projectId, version);
  if (projectError || result.error) return <ResourceState error={projectError ?? result.error} />;
  if (projectLoading || !result.data) return <ResourceState />;
  return <div className="collection-page"><div className="workspace-browser-heading"><p>{collection === "archived" ? "已归档" : collection === "trash" ? "最近删除" : "会话"}</p><span>{project?.name}</span></div><SessionRows projectId={projectId} sessions={result.data[collection]} /><p className="workspace-location">恢复历史不会重建已删除的工作文件。保留的分支与工作区状态以会话详情为准。</p></div>;
}

function RenameSessionDialog({ session, onClose, onRenamed, returnFocus }: { session: SessionResource; onClose(): void; onRenamed(): void; returnFocus?: HTMLElement | null }) {
  const [name, setName] = useState(session.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function rename() {
    const candidate = name.trim();
    if (!candidate || pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(undefined);
    try {
      await mutate(`${resourceApi({ projectId: session.projectId, sessionId: session.id })}/actions`, { type: "rename", name: candidate });
      onRenamed();
      if (mounted.current) onClose();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pendingRef.current = false; if (mounted.current) setPending(false); }
  }
  return <Dialog open onOpenChange={(next) => { if (!next && !pendingRef.current) onClose(); }}>
    <DialogContent className="project-dialog rename-session-dialog" initialFocus={input} finalFocus={returnFocus ? () => returnFocus.isConnected ? returnFocus : false : undefined} showCloseButton={false} aria-busy={pending}>
      <div className="project-dialog-heading"><DialogTitle>重命名会话</DialogTitle><button aria-label="取消重命名" disabled={pending} onClick={onClose}><X size={16} /></button></div>
      <DialogDescription>{session.name}</DialogDescription>
      <form className="rename-session-form" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
        <Input ref={input} aria-label="新的会话名称" value={name} disabled={pending} onChange={(event) => setName(event.target.value)} />
        {error && <Alert variant="error" title="无法重命名会话" className="dialog-alert">{error}</Alert>}
        <div className="project-dialog-actions"><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>取消</Button><Button type="submit" disabled={pending || !name.trim()}>{pending ? "正在保存…" : "保存名称"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export function DeleteSessionDialog({ session, onClose, onDeleted, returnFocus }: { session: SessionResource; onClose(): void; onDeleted(): void; returnFocus?: HTMLElement | null }) {
  const [preview, setPreview] = useState<DeletionPreview & { deletion?: DeletionOutcome }>();
  const [outcome, setOutcome] = useState<DeletionOutcome>();
  const [removeWorktree, setRemoveWorktree] = useState(true);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const mounted = useRef(true);
  const endpoint = resourceApi({ projectId: session.projectId, sessionId: session.id });
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    setPreview(undefined); setError(undefined);
    void mutate<DeletionPreview>(`${endpoint}/deletion-preview`, {}).then((result) => {
      if (disposed) return;
      if (result.projectId !== session.projectId || result.sessionId !== session.id) throw new Error("删除预览标识不匹配");
      setPreview(result);
    }).catch((cause: unknown) => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { disposed = true; mounted.current = false; };
  }, [endpoint, previewVersion]);
  const owned = preview ? !["none", "removed"].includes(preview.workspace.state) : Boolean(session.workspace && session.workspace.state !== "removed");
  const retry = preview?.deletion ?? outcome ?? (session.deletion?.status !== "complete" ? session.deletion : undefined);
  const selectedRemoval = retry ? retry.removeWorktree : owned && removeWorktree;
  const cleanupBlocked = selectedRemoval && owned && preview?.workspace.state !== "clean";
  async function confirm() {
    if (!preview || cleanupBlocked || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true); setError(undefined);
    try {
      const outcome = await mutate<DeletionOutcome>(`${endpoint}/actions`, { type: "delete", confirmation: preview.confirmation, removeWorktree: selectedRemoval });
      if (outcome.status !== "complete") {
        setOutcome(outcome);
        setError(`删除尚未完成：历史 ${outcome.history}，工作区 ${outcome.workspace}。${outcome.error ?? "请重新检查状态后重试。"}`);
        setPreview(undefined);
        return;
      }
      onDeleted();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pendingRef.current = false; if (mounted.current) setPending(false); }
  }
  return <Dialog open onOpenChange={(next) => { if (!next && !pendingRef.current) onClose(); }}>
    <DialogContent className="project-dialog delete-dialog" initialFocus={cancel} finalFocus={returnFocus ? () => returnFocus.isConnected ? returnFocus : false : undefined} showCloseButton={false} aria-busy={pending}>
      <div className="project-dialog-heading"><DialogTitle>删除“{session.name}”</DialogTitle><button aria-label="取消删除" disabled={pending} onClick={onClose}><X size={16} /></button></div>
      <DialogDescription>会话历史将移入可恢复的回收站。正在运行或等待输入的任务必须先结束。</DialogDescription>
      <dl className="deletion-details"><dt>会话</dt><dd>{session.id}</dd><dt>工作区</dt><dd>{preview?.workspace.treeRoot ?? session.workspace?.treeRoot ?? "旧会话：原项目目录不会被删除"}</dd><dt>分支</dt><dd>{preview?.workspace.branch ?? session.workspace?.branch ?? "—"}</dd><dt>状态</dt><dd>{preview ? preview.workspace.state === "dirty" ? "含本地改动" : preview.workspace.state === "clean" ? "空闲 · 工作区干净" : preview.workspace.message ?? preview.workspace.state : error ? "无法确认，删除已阻止" : "正在检查任务和工作区状态…"}</dd></dl>
      {owned && <label className="delete-worktree-option"><Checkbox checked={selectedRemoval} disabled={pending || Boolean(retry)} onCheckedChange={setRemoveWorktree} />同时删除对应的工作区</label>}
      {retry && <Alert variant="warning" title="删除操作尚未完成" className="dialog-alert">正在恢复删除操作 {retry.operationId}：历史 {retry.history}，工作区 {retry.workspace}。沿用原选择：{retry.removeWorktree ? "同时清理工作区" : "保留工作区"}。{retry.error}</Alert>}
      {preview && preview.workspace.localChanges.length > 0 && <pre className="deletion-changes">{preview.workspace.localChanges.join("\n")}</pre>}
      {preview && cleanupBlocked && <Alert variant="warning" title="暂时不能清理工作区" className="dialog-alert">工作区包含本地内容或状态不可确认。处理后重试，或取消勾选以保留文件。</Alert>}
      <p className="workspace-location">{preview?.recovery ?? "历史恢复不会重建已删除的工作文件；分支引用会保留。"}</p>
      {error && <Alert variant="error" title="无法完成删除" className="dialog-alert">{error}</Alert>}
      <div className="project-dialog-actions"><Button ref={cancel} variant="ghost" disabled={pending} onClick={onClose}>取消</Button>{error && <Button variant="ghost" disabled={pending} onClick={() => setPreviewVersion((value) => value + 1)}>重新检查</Button>}<Button disabled={!preview || cleanupBlocked || pending} onClick={() => void confirm()}>{pending ? "正在删除…" : "删除会话"}</Button></div>
    </DialogContent>
  </Dialog>;
}
