"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { JSON_FIELD_MAX_DEPTH, JSON_FIELD_PAGE_SIZE, jsonFieldRows, jsonValueSummary, type JsonlRecord } from "./jsonl-structure";
import { textPreview } from "./jsonl-presentation";

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

export function RecordDetails({ record, onNavigate }: { record: JsonlRecord; onNavigate(line: number): void }) {
  return <div className="jsonl-record-detail-body">
    <dl className="jsonl-record-metadata"><div><dt>记录类型</dt><dd>{record.type}</dd></div>{record.id !== undefined && <div><dt>ID</dt><dd><code>{label(record.id)}</code></dd></div>}</dl>
    {record.parentId !== undefined && <p className="jsonl-parent">父记录 {record.parentLine !== undefined && <button type="button" onClick={() => onNavigate(record.parentLine!)}>L{record.parentLine}</button>}<code>{label(record.parentId)}</code></p>}
    {record.issues.length > 0 && <Alert variant={record.issues.some((issue) => issue !== "父记录未在本页载入") ? "warning" : "info"} title="记录关系提示" className="jsonl-notice">{record.issues.join("；")}</Alert>}
    {record.error ? <pre className="jsonl-invalid-source">{textPreview(record.raw).text}</pre> : <JsonFields record={record} />}
    {record.error && textPreview(record.raw).clipped && <p className="jsonl-preview-limit">预览已截取，完整内容见原始文本。</p>}
  </div>;
}

