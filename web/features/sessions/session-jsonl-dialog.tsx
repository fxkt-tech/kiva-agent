"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resourceApi, useResource } from "@/features/workspace/resources";
import type { SessionResource } from "@/shared/workspace-contract";
import type { SessionJsonlDocument } from "@/shared/session-jsonl";
import { RenderedJsonl } from "./jsonl-timeline";

function size(bytes: number) { return bytes < 1_024 ? `${bytes} B` : bytes < 1_048_576 ? `${(bytes / 1_024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`; }

function validateDocument(data: SessionJsonlDocument, session: SessionResource): string | undefined {
  if (!data || typeof data !== "object") return "JSONL 返回格式无效";
  if (data.projectId !== session.projectId || data.sessionId !== session.id) return "JSONL 所属项目或会话不匹配";
  if (typeof data.content !== "string" || typeof data.truncated !== "boolean" || !Number.isFinite(data.bytes) || !Number.isFinite(data.totalBytes) || data.bytes < 0 || data.totalBytes < data.bytes || (data.fileName !== undefined && typeof data.fileName !== "string")) return "JSONL 返回格式无效";
}

export function SessionJsonlDialog({ session, onClose, returnFocus }: { session: SessionResource; onClose(): void; returnFocus?: HTMLElement | null }) {
  const [tab, setTab] = useState<"rendered" | "raw">("rendered");
  const [version, setVersion] = useState(0);
  const result = useResource<SessionJsonlDocument>(`${resourceApi({ projectId: session.projectId, sessionId: session.id })}/jsonl`, version);
  const validationError = result.data !== undefined ? validateDocument(result.data, session) : undefined;
  const data = validationError ? undefined : result.data;
  const error = result.error ?? validationError;
  const id = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { setTab("rendered"); setVersion(0); }, [session.projectId, session.id]);
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
      <div className="project-dialog-heading"><div className="jsonl-heading-copy"><DialogTitle>会话 JSONL</DialogTitle><DialogDescription className="jsonl-session-name" title={session.name}>{session.name}</DialogDescription></div><button ref={closeButton} type="button" aria-label="关闭 JSONL" onClick={onClose}><X size={16} /></button></div>
      <div className="jsonl-toolbar"><div className="jsonl-tabs" role="tablist" aria-label="JSONL 显示方式">{(["rendered", "raw"] as const).map((value, index) => <button ref={(node) => { tabButtons.current[index] = node; }} type="button" role="tab" id={`${id}-${value}-tab`} aria-controls={`${id}-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} onClick={() => setTab(value)} onKeyDown={(event) => tabKeys(event, index)}>{value === "rendered" ? "渲染视图" : "原始文本"}</button>)}</div>{data && <span className="jsonl-meta" title={data.fileName}>{data.fileName ?? "尚未创建 JSONL 文件"} · {size(data.bytes)}{data.truncated ? ` / ${size(data.totalBytes)}` : ""}</span>}</div>
      {data?.truncated && <Alert variant="warning" title="仅显示 JSONL 的部分内容" className="jsonl-notice">文件共 {size(data.totalBytes)}，当前只读取前 {size(data.bytes)}。末行可能不完整；原文件未修改。</Alert>}
      <div className="jsonl-content">
        {error ? <Alert variant="error" title="JSONL 加载失败" className="jsonl-notice">{error}<div className="alert-actions"><Button size="sm" variant="outline" onClick={() => setVersion((value) => value + 1)}>重试</Button></div></Alert> : !data ? <p className="jsonl-empty" role="status">正在读取 JSONL…</p> : <>
          <div className="jsonl-tab-panel" role="tabpanel" id={`${id}-rendered-panel`} aria-labelledby={`${id}-rendered-tab`} hidden={tab !== "rendered"} tabIndex={0}><RenderedJsonl key={`${session.projectId}:${session.id}:${version}`} content={data.content} /></div>
          <div className="jsonl-tab-panel" role="tabpanel" id={`${id}-raw-panel`} aria-labelledby={`${id}-raw-tab`} hidden={tab !== "raw"} tabIndex={0}><pre className="jsonl-raw" aria-label="JSONL 原始文本">{data.content}</pre>{!data.content && <p className="jsonl-empty">此会话还没有 JSONL 记录</p>}</div>
        </>}
      </div>
    </DialogContent>
  </Dialog>;
}
