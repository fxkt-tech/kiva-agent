"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Download, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resourceApi, useResource } from "@/features/workspace/resources";
import type { SessionResource } from "@/shared/workspace-contract";
import type { SessionJsonlDocument } from "@/shared/session-jsonl";
import { RenderedJsonl } from "./jsonl-timeline";
import type { SessionViewerSelection } from "./session-viewer-link";

function size(bytes: number) { return bytes < 1_024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1_024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`; }

function validateDocument(data: SessionJsonlDocument, session: Pick<SessionResource, "id" | "projectId">): string | undefined {
  if (!data || typeof data !== "object") return "JSONL 返回格式无效";
  if (data.projectId !== session.projectId || data.sessionId !== session.id) return "JSONL 所属项目或会话不匹配";
  if (typeof data.content !== "string" || typeof data.truncated !== "boolean" || !Number.isFinite(data.bytes) || !Number.isFinite(data.totalBytes) || data.bytes < 0 || data.totalBytes < data.bytes || (data.fileName !== undefined && typeof data.fileName !== "string")) return "JSONL 返回格式无效";
}

export function SessionJsonlDialog({ session, onClose, returnFocus, initialSelection, linkError }: { session: Pick<SessionResource, "id" | "projectId" | "name">; onClose(): void; returnFocus?: HTMLElement | null; initialSelection?: SessionViewerSelection; linkError?: string }) {
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [version, setVersion] = useState(0);
  const result = useResource<SessionJsonlDocument>(linkError ? undefined : `${resourceApi({ projectId: session.projectId, sessionId: session.id })}/jsonl`, version);
  const validationError = result.data !== undefined ? validateDocument(result.data, session) : undefined;
  const data = validationError ? undefined : result.data;
  const error = linkError ?? result.error ?? validationError;
  const [downloadError, setDownloadError] = useState<string>();
  const id = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { setTab("rendered"); setVersion(0); }, [session.projectId, session.id]);
  function download() {
    if (!data) return;
    let url: string | undefined;
    try {
      url = URL.createObjectURL(new Blob([data.content], { type: "application/x-ndjson;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      const base = data.fileName ?? `${session.id}.jsonl`;
      anchor.download = data.truncated ? `${base.replace(/\.jsonl$/iu, "")}.partial.jsonl` : base;
      document.body.append(anchor); anchor.click(); anchor.remove(); setDownloadError(undefined);
    } catch { setDownloadError("下载失败，请在原始文本中手动复制当前快照。"); }
    finally { if (url) { const snapshotUrl = url; setTimeout(() => URL.revokeObjectURL(snapshotUrl), 0); } }
  }
  function tabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") next = 1 - index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault(); event.stopPropagation(); setTab(next === 0 ? "rendered" : "raw"); tabButtons.current[next]?.focus();
  }
  return <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="project-dialog session-jsonl-dialog" initialFocus={closeButton} finalFocus={returnFocus ? () => returnFocus.isConnected ? returnFocus : false : undefined} showCloseButton={false}>
      <header className="jsonl-header">
        <div className="jsonl-heading-copy"><DialogTitle>会话 JSONL</DialogTitle><DialogDescription className="jsonl-session-name" title={session.name}>{session.name}</DialogDescription></div>
        <div className="jsonl-tabs" role="tablist" aria-label="JSONL 显示方式">{(["rendered", "raw"] as const).map((value, index) => <button ref={(node) => { tabButtons.current[index] = node; }} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => setTab(value)} onKeyDown={(event) => tabKeys(event, index)}>{value === "rendered" ? "渲染视图" : "原始文本"}</button>)}</div>
        {data && <div className="jsonl-snapshot-actions"><div className="jsonl-meta"><span title={data.fileName}>{data.fileName ?? "尚未创建 JSONL 文件"}</span><span>{size(data.bytes)}{data.truncated ? ` / ${size(data.totalBytes)} · 部分快照` : ""}</span></div><Button className="jsonl-download" size="sm" variant="outline" onClick={download} aria-label={data.truncated ? "下载已读取的部分 JSONL 快照" : "下载 JSONL 快照"} title={data.truncated ? "下载已读取的部分 JSONL 快照" : "下载 JSONL 快照"}><Download size={13} aria-hidden="true" /><span className="jsonl-download-label">{data.truncated ? "下载部分快照" : "下载快照"}</span></Button></div>}
        <button className="jsonl-close" ref={closeButton} type="button" aria-label="关闭 JSONL" title="关闭 JSONL" onClick={onClose}><X size={16} aria-hidden="true" /></button>
      </header>
      {downloadError && <Alert variant="warning" title="无法下载" className="jsonl-notice" onDismiss={() => setDownloadError(undefined)}>{downloadError}</Alert>}
      {data?.truncated && <Alert variant="warning" title="仅显示 JSONL 的部分内容" className="jsonl-notice">文件共 {size(data.totalBytes)}，当前只读取前 {size(data.bytes)}。末行可能不完整；原文件未修改。</Alert>}
      <div className="jsonl-content">
        {error ? <Alert variant="error" title="JSONL 加载失败" className="jsonl-notice">{error}<div className="alert-actions">{!linkError && <Button size="sm" variant="outline" onClick={() => setVersion((value) => value + 1)}>重试</Button>}</div></Alert> : !data ? <p className="jsonl-empty" role="status">正在读取 JSONL…</p> : <>
          <div className="jsonl-tab-panel" role="tabpanel" id={`${id}-rendered-panel`} aria-labelledby={`${id}-rendered-tab`} hidden={tab !== "rendered"} tabIndex={0}><RenderedJsonl key={`${session.projectId}:${session.id}:${version}`} content={data.content} projectId={session.projectId} sessionId={session.id} initialSelection={initialSelection} /></div>
          <div className="jsonl-tab-panel" role="tabpanel" id={`${id}-raw-panel`} aria-labelledby={`${id}-raw-tab`} hidden={tab !== "raw"} tabIndex={0}><pre className="jsonl-raw" aria-label="JSONL 原始文本">{data.content}</pre>{!data.content && <p className="jsonl-empty">此会话还没有 JSONL 记录</p>}</div>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
