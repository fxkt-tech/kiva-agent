"use client";

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Bot, Brain, Check, ChevronDown, ChevronRight, CircleX, FileJson2, GitBranch, MessageSquare, Settings2, UserRound, Wrench } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Markdown } from "@/components/shared/Markdown";
import { JSON_FIELD_MAX_DEPTH, JSON_FIELD_PAGE_SIZE, JSONL_PAGE_SIZE, jsonFieldRows, jsonValueSummary, parseJsonlPage, type JsonlRecord } from "./jsonl-structure";
import { presentJsonlPage, textPreview, type JsonlContentBlock, type JsonlPresentation, type TextPreview, type ToolRelation } from "./jsonl-presentation";

function label(value: string, limit = 120) { return value.length > limit ? `${value.slice(0, limit)}…` : value; }
// Preserve every nesting step without consuming the narrow card's entire width.
function fieldIndent(depth: number) { return `min(${depth * 16}px, ${depth * 3}%)`; }

function JsonFields({ record }: { record: JsonlRecord }) {
  const [expanded, setExpanded] = useState(() => new Set(["[]"]));
  const [pages, setPages] = useState(() => new Map<string, number>());
  const fields = useMemo(() => jsonFieldRows(record.value, expanded, pages), [record.value, expanded, pages]);
  return <div className="jsonl-field-tree" aria-label={`第 ${record.line} 行的 JSON 字段`}>
    {fields.rows.map((row) => row.kind === "pagination" ? <div className="jsonl-field jsonl-field-pagination" key={`${row.path}-page`} style={{ paddingInlineStart: fieldIndent(row.depth + 1) }}>
      <button type="button" disabled={row.page === 0} aria-label={`${label(row.label)} 上一页字段`} onClick={() => setPages((current) => new Map(current).set(row.path, row.page - 1))}>上一页</button>
      <span>{row.page * JSON_FIELD_PAGE_SIZE + 1}–{Math.min(row.count, (row.page + 1) * JSON_FIELD_PAGE_SIZE)} / {row.count}</span>
      <button type="button" disabled={(row.page + 1) * JSON_FIELD_PAGE_SIZE >= row.count} aria-label={`${label(row.label)} 下一页字段`} onClick={() => setPages((current) => new Map(current).set(row.path, row.page + 1))}>下一页</button>
    </div> : <div className="jsonl-field" key={row.path} style={{ paddingInlineStart: fieldIndent(row.depth) }}>
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

function ClippingNotice() { return <p className="jsonl-preview-limit">预览已截取，完整内容见原始文本。</p>; }

function ReadableText({ preview, plain = false }: { preview: TextPreview; plain?: boolean }) {
  return <>{plain ? <pre className="jsonl-tool-output">{preview.text || (preview.clipped ? "" : "（空输出）")}</pre> : <div className="markdown-body"><Markdown allowImages={false}>{preview.text}</Markdown></div>}{preview.clipped && <ClippingNotice />}</>;
}

function Relation({ relation, onNavigate }: { relation?: ToolRelation; onNavigate(line: number): void }) {
  if (!relation) return null;
  return relation.line !== undefined ? <button type="button" className="jsonl-source-link" onClick={(event) => { event.stopPropagation(); onNavigate(relation.line!); }}>{relation.note}<span>L{relation.line}</span><ArrowUpRight size={12} aria-hidden="true" /></button> : <span className="jsonl-relation-note">{relation.note}</span>;
}

function ToolCall({ block, onNavigate }: { block: Extract<JsonlContentBlock, { kind: "tool" }>; onNavigate(line: number): void }) {
  return <div className="jsonl-tool-call">
    <details className="jsonl-tool-input">
      <summary><Wrench size={14} aria-hidden="true" /><span className="jsonl-tool-name">{block.name}</span><span className="jsonl-tool-command">{block.command || "查看输入"}</span><ChevronRight size={14} className="jsonl-disclosure-chevron" aria-hidden="true" /></summary>
      <div className="jsonl-tool-input-body"><span className="jsonl-section-label">输入</span><pre>{block.input.text}</pre>{block.input.clipped && <ClippingNotice />}</div>
    </details>
    <div className="jsonl-tool-link"><Relation relation={block.relation} onNavigate={onNavigate} /></div>
  </div>;
}

function ContentBlocks({ view, onNavigate }: { view: JsonlPresentation; onNavigate(line: number): void }) {
  return <>{view.blocks.map((block, index) => {
    switch (block.kind) {
      case "text": return <ReadableText key={index} preview={block} plain={view.kind === "tool-result" || view.kind === "invalid" || view.kind === "unknown"} />;
      case "thinking": return <details key={index} className="jsonl-thinking"><summary><Brain size={13} aria-hidden="true" />思考过程<ChevronRight size={13} className="jsonl-disclosure-chevron" aria-hidden="true" /></summary><div className="jsonl-thinking-copy"><ReadableText preview={block} /></div></details>;
      case "tool": return <ToolCall key={index} block={block} onNavigate={onNavigate} />;
      case "placeholder": return <p key={index} className="jsonl-placeholder">{block.text}</p>;
    }
  })}</>;
}

function RecordDetails({ record, onNavigate }: { record: JsonlRecord; onNavigate(line: number): void }) {
  return <div className="jsonl-record-detail-body">
    <dl className="jsonl-record-metadata"><div><dt>记录类型</dt><dd>{record.type}</dd></div>{record.id !== undefined && <div><dt>ID</dt><dd><code>{label(record.id)}</code></dd></div>}</dl>
    {record.parentId !== undefined && <p className="jsonl-parent">父记录 {record.parentLine !== undefined && <button type="button" onClick={() => onNavigate(record.parentLine!)}>L{record.parentLine}</button>}<code>{label(record.parentId)}</code></p>}
    {record.issues.length > 0 && <Alert variant={record.issues.some((issue) => issue !== "父记录未在本页载入") ? "warning" : "info"} title="记录关系提示" className="jsonl-notice">{record.issues.join("；")}</Alert>}
    {record.error ? <pre className="jsonl-invalid-source">{textPreview(record.raw).text}</pre> : <JsonFields record={record} />}
    {record.error && textPreview(record.raw).clipped && <ClippingNotice />}
  </div>;
}

function RecordIcon({ view }: { view: JsonlPresentation }) {
  const Icon = view.kind === "user" ? UserRound : view.kind === "assistant" ? Bot : view.kind === "tool-result" ? ArrowDownLeft : view.record.type === "branch_summary" ? GitBranch : view.record.type === "model_change" || view.record.type === "thinking_level_change" ? Settings2 : view.kind === "invalid" ? CircleX : MessageSquare;
  return <Icon size={15} aria-hidden="true" />;
}

function RecordCard({ view, selected, inspectorId, onSelect, onNavigate }: { view: JsonlPresentation; selected: boolean; inspectorId: string; onSelect(line: number): void; onNavigate(line: number): void }) {
  const record = view.record;
  const compact = view.kind === "event" && !view.blocks.length;
  function selectCard(event: MouseEvent<HTMLElement>) {
    if ((event.target as Element).closest("button, a, summary, input, textarea, select")) return;
    if (event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false) return;
    onSelect(record.line);
  }
  return <article className="jsonl-record" data-kind={view.kind} data-compact={compact || undefined} data-jsonl-line={record.line} data-selected={selected || undefined} onClick={selectCard} tabIndex={-1} aria-label={`第 ${record.line} 行：${view.title}`}>
    <div className="jsonl-record-avatar"><RecordIcon view={view} /></div>
    <div className="jsonl-record-main">
      <header className="jsonl-record-heading"><strong className="jsonl-record-title">{view.title}</strong>{view.subtitle && <span className="jsonl-record-subtitle">{view.subtitle}</span>}
        {view.resultStatus && <span className="jsonl-result-status" data-status={view.resultStatus}>{view.resultStatus === "error" ? <CircleX size={11} aria-hidden="true" /> : <Check size={11} aria-hidden="true" />}{view.resultStatus === "error" ? "失败" : "成功"}</span>}
        <span className="jsonl-record-location">{view.timestamp && <time dateTime={view.timestamp} title={view.timestamp}>{view.timestamp.slice(11, 19)} UTC</time>}<button type="button" className="jsonl-record-line" aria-label={`查看第 ${record.line} 行详情`} aria-pressed={selected} aria-controls={inspectorId} onClick={(event) => { event.stopPropagation(); onSelect(record.line); }}>L{record.line}</button></span>
      </header>
      {view.kind === "invalid" ? <Alert variant="error" title={`第 ${record.line} 行无法解析`} className="jsonl-notice">{label(record.error ?? "", 300)}</Alert> : null}
      <div className="jsonl-record-content"><ContentBlocks view={view} onNavigate={onNavigate} /></div>
      {view.kind === "tool-result" && <div className="jsonl-result-relation"><Relation relation={view.relation} onNavigate={onNavigate} /></div>}
      {record.issues.length > 0 && <p className="jsonl-issue-count">{record.issues.length} 条关系提示 · 见右侧详情</p>}
    </div>
  </article>;
}

export function RenderedJsonl({ content }: { content: string }) {
  const [offset, setOffset] = useState(0);
  const [selectedLine, setSelectedLine] = useState<number>();
  const recordList = useRef<HTMLDivElement>(null);
  const inspectorScroll = useRef<HTMLDivElement>(null);
  const inspectorId = useId();
  const page = useMemo(() => parseJsonlPage(content, offset), [content, offset]);
  const views = useMemo(() => presentJsonlPage(page), [page]);
  const selected = page.records.find((record) => record.line === selectedLine) ?? page.records[0];
  useEffect(() => { if (recordList.current) recordList.current.scrollTop = 0; setSelectedLine(undefined); }, [offset, content]);
  useEffect(() => { if (inspectorScroll.current) inspectorScroll.current.scrollTop = 0; }, [selected?.line, content]);
  function navigate(line: number) {
    const element = recordList.current?.querySelector<HTMLElement>(`[data-jsonl-line="${line}"]`);
    if (element) { element.scrollIntoView({ block: "start", behavior: "auto" }); element.focus({ preventScroll: true }); }
    setSelectedLine(line);
  }
  if (!selected) return <div className="jsonl-empty"><FileJson2 size={24} aria-hidden="true" /><p>此会话还没有 JSONL 记录</p></div>;
  return <div className="jsonl-rendered">
    <section className="jsonl-conversation-pane" aria-label="对话记录">
      <div className="jsonl-reading-caption"><span>对话记录</span><span>按原文件顺序 · 含历史分支</span></div>
      <div ref={recordList} className="jsonl-record-list" role="region" aria-label="JSONL 对话记录"><div className="jsonl-reading-column">{views.map((view) => <RecordCard key={view.record.line} view={view} selected={selected.line === view.record.line} inspectorId={inspectorId} onSelect={setSelectedLine} onNavigate={navigate} />)}</div></div>
      <nav className="jsonl-pagination" aria-label="JSONL 记录分页"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - JSONL_PAGE_SIZE))}>上一页</button><span>记录 {offset + 1}–{offset + page.records.length}{page.hasMore ? " · 后面还有内容" : " · 已到末尾"}</span><button type="button" disabled={!page.hasMore} onClick={() => setOffset(offset + JSONL_PAGE_SIZE)}>下一页</button></nav>
    </section>
    <section className="jsonl-inspector" id={inspectorId} aria-label="记录详情" data-jsonl-inspector-line={selected.line}>
      <header className="jsonl-inspector-heading"><h3>记录详情</h3><span>第 {selected.line} 行 · {selected.type}</span></header>
      <div ref={inspectorScroll} className="jsonl-inspector-scroll"><RecordDetails key={selected.line} record={selected} onNavigate={navigate} /></div>
    </section>
  </div>;
}
