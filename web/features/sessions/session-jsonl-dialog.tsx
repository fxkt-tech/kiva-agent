"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, FileJson2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { resourceApi, useResource } from "@/features/workspace/resources";
import type { SessionResource } from "@/shared/workspace-contract";
import type { SessionJsonlDocument } from "@/shared/session-jsonl";
import { JSON_FIELD_MAX_DEPTH, JSON_FIELD_PAGE_SIZE, JSONL_PAGE_SIZE, jsonFieldRows, jsonValueSummary, parseJsonlPage, type JsonlRecord } from "./jsonl-structure";

function label(value: string, limit = 120) { return value.length > limit ? `${value.slice(0, limit)}…` : value; }

function JsonFields({ record }: { record: JsonlRecord }) {
  const [expanded, setExpanded] = useState(() => new Set(["[]"]));
  const [pages, setPages] = useState(() => new Map<string, number>());
  const fields = useMemo(() => jsonFieldRows(record.value, expanded, pages), [record.value, expanded, pages]);
  return <div className="jsonl-field-tree" aria-label={`第 ${record.line} 行的 JSON 字段`}>
    {fields.rows.map((row) => row.kind === "pagination" ? <div className="jsonl-field jsonl-field-pagination" key={`${row.path}-page`} style={{ paddingInlineStart: (row.depth + 1) * 16 }}>
      <button type="button" disabled={row.page === 0} aria-label={`${label(row.label)} 上一页字段`} onClick={() => setPages((current) => new Map(current).set(row.path, row.page - 1))}>上一页</button>
      <span>{row.page * JSON_FIELD_PAGE_SIZE + 1}–{Math.min(row.count, (row.page + 1) * JSON_FIELD_PAGE_SIZE)} / {row.count}</span>
      <button type="button" disabled={(row.page + 1) * JSON_FIELD_PAGE_SIZE >= row.count} aria-label={`${label(row.label)} 下一页字段`} onClick={() => setPages((current) => new Map(current).set(row.path, row.page + 1))}>下一页</button>
    </div> : <div className="jsonl-field" key={row.path} style={{ paddingInlineStart: row.depth * 16 }}>
      {row.count > 0 ? <button className="jsonl-field-toggle" type="button" aria-label={`${row.expanded ? "收起" : "展开"}字段 ${label(row.label)}`} aria-expanded={row.expanded && row.depth < JSON_FIELD_MAX_DEPTH} disabled={row.depth >= JSON_FIELD_MAX_DEPTH} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next; })}>
        {row.expanded && row.depth < JSON_FIELD_MAX_DEPTH ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
      </button> : <span className="jsonl-field-spacer" />}
      <span className="jsonl-field-key">{label(row.label)}{row.label.length > 120 && <span className="jsonl-field-limit">（字段名已截取）</span>}</span><span className="jsonl-field-separator">: </span>
      <span className={`jsonl-value jsonl-value-${typeof row.value}`}>{jsonValueSummary(row.value)}</span>
      {row.count > 0 && row.depth >= JSON_FIELD_MAX_DEPTH && <span className="jsonl-field-limit">展开已达深度限制，完整内容见原始文本</span>}
    </div>)}
    {fields.limited && <p className="jsonl-field-limit">当前展开内容过多，请收起部分字段后继续，或查看原始文本</p>}
  </div>;
}

function RenderedJsonl({ content }: { content: string }) {
  const [offset, setOffset] = useState(0);
  const [selectedLine, setSelectedLine] = useState<number>();
  const recordList = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const page = useMemo(() => parseJsonlPage(content, offset), [content, offset]);
  const selected = page.records.find((record) => record.line === selectedLine) ?? page.records[0];
  useEffect(() => { if (recordList.current) recordList.current.scrollTop = 0; }, [offset, content]);
  useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0; }, [selected?.line]);
  function changePage(next: number) { setOffset(next); setSelectedLine(undefined); }
  if (!selected) return <div className="jsonl-empty"><FileJson2 size={24} aria-hidden="true" /><p>此会话还没有 JSONL 记录</p></div>;
  return <div className="jsonl-rendered">
    <nav className="jsonl-records" aria-label="JSONL 记录">
      <div ref={recordList} className="jsonl-record-list">{page.records.map((record) => <button type="button" className="jsonl-record" key={record.line} aria-current={selected.line === record.line ? "true" : undefined} data-invalid={Boolean(record.error) || undefined} style={{ "--jsonl-depth": record.depth } as CSSProperties} onClick={() => setSelectedLine(record.line)}>
        <span className="jsonl-record-top"><span className="jsonl-record-line">L{record.line}</span><span className="jsonl-record-type">{record.type}</span></span>
        <span className="jsonl-record-summary">{record.summary}</span>
        {record.id !== undefined && <span className="jsonl-record-id">{label(record.id)}</span>}
        {(record.error || record.issues.length > 0) && <span className="jsonl-record-issue">{record.error ? "此行不是有效 JSON" : record.issues.join(" · ")}</span>}
      </button>)}</div>
      <div className="jsonl-pagination"><button type="button" disabled={offset === 0} onClick={() => changePage(Math.max(0, offset - JSONL_PAGE_SIZE))}>上一页</button><span>{offset + 1}–{offset + page.records.length}</span><button type="button" disabled={!page.hasMore} onClick={() => changePage(offset + JSONL_PAGE_SIZE)}>下一页</button></div>
    </nav>
    <section ref={inspector} className="jsonl-inspector" aria-label={`第 ${selected.line} 行详情`}>
      <div className="jsonl-inspector-heading"><strong>第 {selected.line} 行</strong><span>{selected.type}</span></div>
      {selected.parentId !== undefined && <p className="jsonl-parent">父记录 {selected.parentLine !== undefined ? <button type="button" onClick={() => setSelectedLine(selected.parentLine)}>L{selected.parentLine}</button> : null}<code>{label(selected.parentId)}</code></p>}
      {selected.issues.length > 0 && <Alert variant={selected.issues.some((issue) => issue !== "父记录未在本页载入") ? "warning" : "info"} title="记录关系提示" className="jsonl-notice">{selected.issues.join("；")}</Alert>}
      {selected.error ? <><Alert variant="error" title={`第 ${selected.line} 行无法解析`} className="jsonl-notice">{selected.error}</Alert><pre className="jsonl-invalid-source">{selected.raw}</pre></> : <JsonFields key={selected.line} record={selected} />}
    </section>
  </div>;
}

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
