import { jsonValueSummary, type JsonlPage, type JsonlRecord } from "./jsonl-structure";

export const JSONL_TEXT_LIMIT = 12_000;
export const JSONL_TEXT_LINE_LIMIT = 240;
export const JSONL_PAGE_TEXT_LIMIT = 120_000;
export const JSONL_PAGE_LINE_LIMIT = 2_400;
export const JSONL_BLOCK_LIMIT = 40;
export const JSONL_PAGE_BLOCK_LIMIT = 600;
const INPUT_LIMIT = 6_000;

export interface TextPreview { text: string; clipped: boolean }
export interface ToolRelation { line?: number; note: string }
export type JsonlContentBlock =
  | ({ kind: "text" | "thinking" } & TextPreview)
  | { kind: "placeholder"; text: string }
  | { kind: "tool"; name: string; sourceName?: string; id?: string; command?: string; input: TextPreview; relation?: ToolRelation };
export interface JsonlPresentation {
  record: JsonlRecord;
  kind: "user" | "assistant" | "tool-result" | "event" | "unknown" | "invalid";
  title: string;
  subtitle?: string;
  timestamp?: string;
  blocks: JsonlContentBlock[];
  resultId?: string;
  resultName?: string;
  resultStatus?: "success" | "error";
  relation?: ToolRelation;
}

function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function own(value: unknown, key: string): unknown { return object(value) && Object.hasOwn(value, key) ? value[key] : undefined; }
function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
export function textPreview(text: string, limit = JSONL_TEXT_LIMIT, lineLimit = JSONL_TEXT_LINE_LIMIT): TextPreview {
  let end = Math.min(text.length, limit);
  if (lineLimit <= 0) end = 0;
  else {
    const breaks = /\r\n|\n|\r/g; const prefix = text.slice(0, end); let lines = 1; let match;
    while ((match = breaks.exec(prefix))) { if (++lines > lineLimit) { end = match.index; break; } }
  }
  return { text: text.slice(0, end), clipped: text.length > end };
}
function label(value: unknown, fallback = "", limit = 160) { const text = string(value); return text === undefined ? fallback : text.length > limit ? `${text.slice(0, limit)}…` : text; }

/** A bounded preview, never JSON.stringify of an untrusted recursive subtree. */
export function jsonInputPreview(value: unknown): TextPreview {
  let remaining = INPUT_LIMIT; let nodes = 0; let clipped = false;
  function emit(text: string) { const part = text.slice(0, remaining); if (part.length < text.length) clipped = true; remaining -= part.length; return part; }
  function visit(node: unknown, depth: number): string {
    if (remaining <= 0 || ++nodes > 200) { clipped = true; return ""; }
    if (typeof node === "string") {
      const part = textPreview(node, Math.min(remaining, INPUT_LIMIT));
      if (part.clipped) clipped = true;
      return emit(JSON.stringify(part.text));
    }
    if (!object(node) && !Array.isArray(node)) return emit(String(node));
    const keys = Array.isArray(node) ? undefined : Object.keys(node);
    const count = Array.isArray(node) ? node.length : keys!.length;
    if (depth >= 6) { clipped = count > 0 || clipped; return emit(Array.isArray(node) ? `[${count} 项]` : `{${count} 个字段}`); }
    let result = emit(Array.isArray(node) ? "[" : "{");
    const end = Math.min(count, 40);
    for (let index = 0; index < end && remaining > 0 && nodes <= 200; index += 1) {
      if (index) result += emit(",");
      result += emit(`\n${"  ".repeat(depth + 1)}`);
      const key = keys?.[index] ?? String(index);
      if (keys) result += emit(`${JSON.stringify(key.slice(0, 120))}: `);
      if (key.length > 120) clipped = true;
      result += visit(Array.isArray(node) ? node[index] : (node as Record<string, unknown>)[key], depth + 1);
    }
    if (count > end || remaining <= 0 || nodes > 200) clipped = true;
    return result + emit(`${count ? `\n${"  ".repeat(depth)}` : ""}${Array.isArray(node) ? "]" : "}"}`);
  }
  return { text: visit(value, 0), clipped };
}

function timestamp(value: unknown): string | undefined {
  if ((typeof value !== "string" || value.length > 80) && typeof value !== "number") return undefined;
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) && Math.abs(time) <= 8.64e15 ? new Date(time).toISOString() : undefined;
}

/** File-order presentation only: never reduce through the SDK's current-leaf projection. */
export function presentJsonlPage(page: JsonlPage): JsonlPresentation[] {
  let remaining = JSONL_PAGE_TEXT_LIMIT;
  let remainingLines = JSONL_PAGE_LINE_LIMIT;
  let remainingBlocks = JSONL_PAGE_BLOCK_LIMIT;
  let completeBlocks = true;
  const take = (text: string): TextPreview => {
    const preview = textPreview(text, Math.min(JSONL_TEXT_LIMIT, remaining), Math.min(JSONL_TEXT_LINE_LIMIT, remainingLines));
    remaining -= preview.text.length;
    remainingLines -= preview.text ? 1 + (preview.text.match(/\r\n|\n|\r/g)?.length ?? 0) : 0;
    return preview;
  };
  function content(value: unknown, allowTools = false): JsonlContentBlock[] {
    if (typeof value === "string") return [{ kind: "text", ...take(value) }];
    if (!Array.isArray(value)) return value === undefined ? [] : [{ kind: "placeholder", text: `未识别的内容格式：${jsonValueSummary(value, 160)}，见记录详情` }];
    const limit = Math.min(JSONL_BLOCK_LIMIT, remainingBlocks);
    remainingBlocks -= Math.min(limit, value.length);
    const blocks: JsonlContentBlock[] = value.slice(0, limit).map((block): JsonlContentBlock => {
      const type = own(block, "type");
      if (type === "text" && typeof own(block, "text") === "string") return { kind: "text", ...take(own(block, "text") as string) };
      if (type === "thinking" && typeof own(block, "thinking") === "string") return { kind: "thinking", ...take(own(block, "thinking") as string) };
      if (type === "toolCall" && allowTools) {
        const args = own(block, "arguments");
        const input = jsonInputPreview(args);
        const boundedInput = take(input.text);
        return { kind: "tool", name: label(own(block, "name"), "未命名工具"), sourceName: string(own(block, "name")), id: string(own(block, "id")), command: typeof own(args, "command") === "string" ? label(own(args, "command"), "", 240) : undefined, input: { ...boundedInput, clipped: input.clipped || boundedInput.clipped } };
      }
      return { kind: "placeholder", text: type === "image" ? "图片附件 · 数据与格式见记录详情" : `未识别的内容块（${label(type, "unknown")}）· 见记录详情` };
    });
    if (value.length > limit) {
      completeBlocks = false;
      blocks.push({ kind: "placeholder", text: `内容块已截取：仅显示前 ${limit} / ${value.length} 项，完整内容见原始文本` });
    }
    return blocks;
  }
  const views = page.records.map((record): JsonlPresentation => {
    const value = record.value; const message = own(value, "message");
    const view: JsonlPresentation = { record, kind: "event", title: record.type, timestamp: timestamp(own(value, "timestamp")) ?? timestamp(own(message, "timestamp")), blocks: [] };
    if (record.error) return { ...view, kind: "invalid", title: "无法解析的记录", blocks: [{ kind: "text", ...take(record.raw) }] };
    if (record.type === "message") {
      const role = own(message, "role");
      view.kind = role === "user" || role === "assistant" ? role : role === "toolResult" ? "tool-result" : "unknown";
      view.title = role === "user" ? "你" : role === "assistant" ? "助手" : role === "toolResult" ? "工具输出" : label(role, "消息");
      view.subtitle = role === "assistant" ? [label(own(message, "provider")), label(own(message, "model"))].filter(Boolean).join(" / ") : undefined;
      view.blocks = content(own(message, "content"), role === "assistant");
      if (role === "toolResult") {
        view.resultId = string(own(message, "toolCallId")); view.resultName = string(own(message, "toolName"));
        view.subtitle = label(view.resultName, "未命名工具");
        view.resultStatus = own(message, "isError") === true ? "error" : own(message, "isError") === false ? "success" : undefined;
      }
      if (!view.blocks.length) view.blocks.push({ kind: "placeholder", text: "此消息没有可显示的正文，字段见记录详情" });
      const error = own(message, "errorMessage");
      if (typeof error === "string") view.blocks.push({ kind: "text", ...take(`消息错误：${error}`) });
      return view;
    }
    switch (record.type) {
      case "session": view.title = "会话开始"; view.subtitle = label(own(value, "cwd"), "会话元数据"); break;
      case "session_info": view.title = "会话名称"; view.subtitle = label(own(value, "name"), "名称更新"); break;
      case "model_change": view.title = "切换模型"; view.subtitle = [label(own(value, "provider")), label(own(value, "modelId"))].filter(Boolean).join(" / ") || "模型信息见记录详情"; break;
      case "thinking_level_change": view.title = "思考级别"; view.subtitle = label(own(value, "thinkingLevel"), "级别更新"); break;
      case "compaction": view.title = "上下文压缩"; view.subtitle = typeof own(value, "tokensBefore") === "number" ? `压缩前 ${own(value, "tokensBefore")} tokens` : undefined; view.blocks = content(own(value, "summary")); break;
      case "branch_summary": view.title = "分支摘要"; view.subtitle = label(own(value, "fromId")); view.blocks = content(own(value, "summary")); break;
      case "custom_message": view.title = "扩展消息"; view.subtitle = label(own(value, "customType")); view.blocks = content(own(value, "content")); break;
      case "custom": view.title = "扩展事件"; view.subtitle = label(own(value, "customType")); break;
      case "label": view.title = "记录标签"; view.subtitle = label(own(value, "label"), "标签已移除"); break;
      case "usage": view.title = "用量记录"; view.subtitle = [label(own(value, "provider")), label(own(value, "model")), label(own(value, "note"))].filter(Boolean).join(" · "); break;
      case "context_edit": view.title = "上下文编辑"; view.subtitle = own(value, "replacement") === null ? "恢复原始内容" : "替换上下文内容"; break;
      default: view.kind = "unknown"; view.title = record.type; view.subtitle = "未识别的记录 · 保留原始字段"; view.blocks = [{ kind: "text", ...take(jsonValueSummary(value, 500)) }];
    }
    return view;
  });
  associateTools(views, completeBlocks);
  return views;
}

function associateTools(views: JsonlPresentation[], completeBlocks: boolean) {
  type Call = { view: JsonlPresentation; block: Extract<JsonlContentBlock, { kind: "tool" }> };
  const calls = new Map<string, Call[]>(); const results = new Map<string, JsonlPresentation[]>();
  const ids = new Map<string, JsonlRecord[]>();
  for (const view of views) {
    if (view.record.id !== undefined) ids.set(view.record.id, [...(ids.get(view.record.id) ?? []), view.record]);
    for (const block of view.blocks) if (block.kind === "tool" && block.id !== undefined) calls.set(block.id, [...(calls.get(block.id) ?? []), { view, block }]);
    if (view.kind === "tool-result" && view.resultId !== undefined) results.set(view.resultId, [...(results.get(view.resultId) ?? []), view]);
  }
  function relation(call: Call, result: JsonlPresentation): string | undefined {
    if (call.view.record.line >= result.record.line) return "结果早于调用，未关联";
    if (result.resultName !== undefined && call.block.sourceName !== undefined && result.resultName !== call.block.sourceName) return "工具名称不一致，未关联";
    const seen = new Set<JsonlRecord>(); let current = result.record;
    if ([call.view.record, current].some((record) => record.issues.some((issue) => ["ID 重复", "父 ID 不唯一", "父子关系成环"].includes(issue)))) return "记录关系有歧义，未关联";
    while (!seen.has(current)) {
      if (current === call.view.record) return undefined;
      seen.add(current);
      if (own(current.value, "parentId") === null) return "位于不同分支，未关联";
      if (current.parentId === undefined) return undefined;
      const parents = ids.get(current.parentId);
      if (!parents) return undefined;
      if (parents.length !== 1) return "父记录不唯一，未关联";
      current = parents[0];
    }
    return "父子关系成环，未关联";
  }
  for (const view of views) {
    for (const block of view.blocks) if (block.kind === "tool") block.relation = { note: block.id === undefined ? "缺少调用 ID，未关联输出" : "本页未找到对应输出" };
    if (view.kind === "tool-result") view.relation = { note: view.resultId === undefined ? "缺少调用 ID，未关联输入" : "本页未找到对应调用" };
  }
  for (const [id, matches] of calls) {
    const outputs = results.get(id) ?? [];
    const issue = !completeBlocks ? "内容块已截取，未确认关联" : matches.length !== 1 || outputs.length > 1 ? "调用 ID 不唯一，未关联" : outputs.length === 1 ? relation(matches[0], outputs[0]) : undefined;
    if (issue) {
      for (const call of matches) call.block.relation = { note: issue };
      for (const output of outputs) output.relation = { note: issue };
    } else if (outputs.length === 1) {
      matches[0].block.relation = { line: outputs[0].record.line, note: "查看输出" };
      outputs[0].relation = { line: matches[0].view.record.line, note: "查看输入" };
    }
  }
}
