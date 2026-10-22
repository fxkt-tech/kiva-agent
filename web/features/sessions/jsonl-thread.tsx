"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Bot, Brain, Check, ChevronRight, CircleX, Copy, GitBranch, Link, MessageSquare, Settings2, UserRound, Wrench } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Markdown } from "@/components/shared/Markdown";
import { jsonlObject, type JsonlRecord } from "./jsonl-structure";
import type { JsonlContentBlock, JsonlPresentation, TextPreview, ToolRelation } from "./jsonl-presentation";

function ClippingNotice() { return <p className="jsonl-preview-limit">预览已截取，完整内容见原始文本。</p>; }
function ReadableText({ preview, plain = false }: { preview: TextPreview; plain?: boolean }) {
  return <>{plain ? <pre className="jsonl-tool-output">{preview.text || (preview.clipped ? "" : "（空输出）")}</pre> : <div className="markdown-body"><Markdown allowImages={false}>{preview.text}</Markdown></div>}{preview.clipped && <ClippingNotice />}</>;
}
function Relation({ relation, onNavigate }: { relation?: ToolRelation; onNavigate(line: number): void }) {
  if (!relation) return null;
  return relation.line !== undefined ? <button type="button" className="jsonl-source-link" onClick={() => onNavigate(relation.line!)}>{relation.note}<span>L{relation.line}</span><ArrowUpRight size={12} aria-hidden="true" /></button> : <span className="jsonl-relation-note">{relation.note}</span>;
}
function ResultStatus({ view }: { view: JsonlPresentation }) {
  return view.resultStatus && <span className="jsonl-result-status" data-status={view.resultStatus}>{view.resultStatus === "error" ? <CircleX size={11} aria-hidden="true" /> : <Check size={11} aria-hidden="true" />}{view.resultStatus === "error" ? "失败" : "成功"}</span>;
}
function ToolCall({ block, output, toolOutputs, onNavigate, onDetails }: { block: Extract<JsonlContentBlock, { kind: "tool" }>; output?: JsonlPresentation; toolOutputs: boolean; onNavigate(line: number): void; onDetails(line: number, trigger: HTMLButtonElement): void }) {
  return <div className="jsonl-tool-call" data-result-line={output?.record.line}>
    <details className="jsonl-tool-input">
      <summary><Wrench size={14} aria-hidden="true" /><span className="jsonl-tool-name">{block.name}</span><span className="jsonl-tool-command">{block.command || "查看输入"}</span>{output && <ResultStatus view={output} />}<ChevronRight size={14} className="jsonl-disclosure-chevron" aria-hidden="true" /></summary>
      <div className="jsonl-tool-input-body"><span className="jsonl-section-label">输入</span><pre>{block.input.text}</pre>{block.input.clipped && <ClippingNotice />}</div>
    </details>
    {output && <details className="jsonl-tool-result" open={toolOutputs} key={String(toolOutputs)}><summary>工具输出 <span>L{output.record.line}</span><ChevronRight size={12} className="jsonl-disclosure-chevron" aria-hidden="true" /></summary><div className="jsonl-tool-result-copy">{output.blocks.map((part, index) => part.kind === "text" ? <ReadableText key={index} preview={part} plain /> : part.kind === "placeholder" ? <p className="jsonl-placeholder" key={index}>{part.text}</p> : null)}<button type="button" className="jsonl-source-link" aria-label={`查看第 ${output.record.line} 行详情`} onClick={(event) => onDetails(output.record.line, event.currentTarget)}>查看输出记录 L{output.record.line}</button></div></details>}
    {!output && <div className="jsonl-tool-link"><Relation relation={block.relation} onNavigate={onNavigate} /></div>}
  </div>;
}
function RecordIcon({ view }: { view: JsonlPresentation }) {
  const Icon = view.kind === "user" ? UserRound : view.kind === "assistant" ? Bot : view.kind === "tool-result" ? ArrowDownLeft : view.record.type === "branch_summary" ? GitBranch : view.record.type === "model_change" || view.record.type === "thinking_level_change" ? Settings2 : view.kind === "invalid" ? CircleX : MessageSquare;
  return <Icon size={15} aria-hidden="true" />;
}
/** Copy source text rather than a clipped rendering preview. */
function copyText(record: JsonlRecord): string {
  const value = record.value;
  if (!jsonlObject(value)) return record.raw;
  const message = jsonlObject(value.message) ? value.message : value;
  const content = message.content ?? value.summary;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.flatMap((block) => jsonlObject(block) && typeof block.text === "string" ? [block.text] : []).join("\n\n");
  return record.raw;
}

export function JsonlThread({ views, selectedLine, thinking, toolOutputs, hidden, onNavigate, onDetails, onCopyLink }: { views: JsonlPresentation[]; selectedLine?: number; thinking: boolean; toolOutputs: boolean; hidden: boolean; onNavigate(line: number): void; onDetails(line: number, trigger: HTMLButtonElement): void; onCopyLink(line: number): Promise<void> }) {
  const [copyStatus, setCopyStatus] = useState("");
  const byLine = new Map(views.map((view) => [view.record.line, view]));
  const paired = new Set<number>();
  for (const view of views) for (const block of view.blocks) if (block.kind === "tool" && block.relation?.line !== undefined) {
    const result = byLine.get(block.relation.line);
    if (result?.kind === "tool-result" && result.relation?.line === view.record.line) paired.add(result.record.line);
  }
  async function copy(view: JsonlPresentation, link = false) {
    try { if (link) await onCopyLink(view.record.line); else await navigator.clipboard.writeText(copyText(view.record)); setCopyStatus(link ? "记录链接已复制" : "消息文本已复制"); }
    catch { setCopyStatus("复制失败，请使用原始文本手动复制"); }
  }
  return <div className="jsonl-reading-column">
    <p className="jsonl-copy-status" role="status" aria-live="polite">{copyStatus}</p>
    {views.filter((view) => (!view.hidden || hidden || view.record.line === selectedLine) && !paired.has(view.record.line)).map((view) => <article key={view.record.line} className="jsonl-record" data-kind={view.kind} data-compact={view.kind === "event" && !view.blocks.length || undefined} data-jsonl-line={view.record.line} data-selected={selectedLine === view.record.line || view.blocks.some((block) => block.kind === "tool" && block.relation?.line === selectedLine) || undefined} tabIndex={-1} aria-label={`第 ${view.record.line} 行：${view.title}`}>
      <div className="jsonl-record-avatar"><RecordIcon view={view} /></div>
      <div className="jsonl-record-main">
        <header className="jsonl-record-heading"><strong className="jsonl-record-title">{view.title}</strong>{view.subtitle && <span className="jsonl-record-subtitle">{view.subtitle}</span>}<ResultStatus view={view} />{view.hidden && <span className="jsonl-hidden-label">隐藏消息</span>}<span className="jsonl-record-location">{view.timestamp && <time dateTime={view.timestamp} title={view.timestamp}>{view.timestamp.slice(11, 19)} UTC</time>}<button type="button" className="jsonl-record-line" aria-label={`查看第 ${view.record.line} 行详情`} onClick={(event) => onDetails(view.record.line, event.currentTarget)}>L{view.record.line}</button></span></header>
        {view.kind === "invalid" && <Alert variant="error" title={`第 ${view.record.line} 行无法解析`} className="jsonl-notice">{view.record.error?.slice(0, 300)}</Alert>}
        <div className="jsonl-record-content">{view.kind === "tool-result" ? <details className="jsonl-tool-result" open={toolOutputs} key={String(toolOutputs)}><summary>工具输出<ChevronRight size={12} className="jsonl-disclosure-chevron" aria-hidden="true" /></summary>{view.blocks.map((block, index) => block.kind === "text" ? <ReadableText key={index} preview={block} plain /> : block.kind === "placeholder" ? <p key={index} className="jsonl-placeholder">{block.text}</p> : null)}</details> : view.blocks.map((block, index) => {
          if (block.kind === "text") return <ReadableText key={index} preview={block} plain={["tool-result", "invalid", "unknown"].includes(view.kind)} />;
          if (block.kind === "thinking") return <details key={`${index}:${thinking}`} className="jsonl-thinking" open={thinking}><summary><Brain size={13} aria-hidden="true" />思考过程<ChevronRight size={13} className="jsonl-disclosure-chevron" aria-hidden="true" /></summary><div className="jsonl-thinking-copy"><ReadableText preview={block} /></div></details>;
          if (block.kind === "tool") { const result = block.relation?.line === undefined ? undefined : byLine.get(block.relation.line); return <ToolCall key={index} block={block} output={result?.relation?.line === view.record.line ? result : undefined} toolOutputs={toolOutputs} onNavigate={onNavigate} onDetails={onDetails} />; }
          return <p key={index} className="jsonl-placeholder">{block.text}</p>;
        })}</div>
        {view.kind === "tool-result" && <div className="jsonl-result-relation"><Relation relation={view.relation} onNavigate={onNavigate} /></div>}
        {view.record.issues.length > 0 && <button type="button" className="jsonl-issue-count" onClick={(event) => onDetails(view.record.line, event.currentTarget)}>{view.record.issues.length} 条记录关系提示</button>}
        <div className="jsonl-message-actions"><button type="button" aria-label={`复制第 ${view.record.line} 行文本`} onClick={() => void copy(view)}><Copy size={12} />复制文本</button><button type="button" aria-label={`复制第 ${view.record.line} 行链接`} onClick={() => void copy(view, true)}><Link size={12} />复制链接</button></div>
      </div>
    </article>)}
  </div>;
}
