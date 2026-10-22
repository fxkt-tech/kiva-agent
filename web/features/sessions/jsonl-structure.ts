/** Read-only projections: source text and unknown JSON fields are never rewritten. */
export interface JsonlRecord {
  line: number;
  raw: string;
  value?: unknown;
  error?: string;
  type: string;
  summary: string;
  id?: string;
  parentId?: string;
  parentLine?: number;
  depth: number;
  issues: string[];
}

export interface JsonlPage { records: JsonlRecord[]; offset: number; hasMore: boolean }
export const JSONL_PAGE_SIZE = 200;

export function jsonlObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function jsonlField(value: unknown, key: string): unknown { return jsonlObject(value) && Object.hasOwn(value, key) ? value[key] : undefined; }
const object = jsonlObject;
const own = jsonlField;
function brief(value: string, length = 160) { return value.length > length ? `${value.slice(0, length)}…` : value; }

export function jsonValueSummary(value: unknown, stringLimit = 2_000): string {
  if (value === null) return "null";
  if (typeof value === "string") return `${JSON.stringify(value.slice(0, stringLimit))}${value.length > stringLimit ? ` …（${value.length} 字符，完整内容见原始文本）` : ""}`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (object(value)) return `Object(${Object.keys(value).length})`;
  return String(value);
}

function describe(value: unknown) {
  const message = own(value, "message");
  const type = own(value, "type");
  const role = own(message, "role");
  const content = own(message, "content");
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.slice(0, 100).map((block) => own(block, "text")).find((part) => typeof part === "string") : undefined;
  return {
    type: typeof type === "string" ? brief(type, 80) : value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
    summary: [typeof role === "string" ? brief(role, 40) : undefined, typeof text === "string" ? brief(text) : undefined].filter(Boolean).join(" · ") || jsonValueSummary(value, 160),
  };
}

/** Shared scanner: parse admitted records once and preserve their original raw slices. */
function readJsonlRecords(content: string, offset = 0, limit = Infinity): JsonlPage {
  const records: JsonlRecord[] = [];
  const breaks = /\r\n|\n|\r/g;
  let start = 0; let line = 1; let skipped = 0; let hasMore = false;
  while (start <= content.length) {
    const end = breaks.exec(content);
    const raw = content.slice(start, end?.index ?? content.length);
    if (raw.trim()) {
      if (skipped < offset) skipped += 1;
      else if (records.length === limit) { hasMore = true; break; }
      else {
        const record: JsonlRecord = { line, raw, type: "解析错误", summary: "", depth: 0, issues: [] };
        try {
          const value: unknown = JSON.parse(raw);
          record.value = value;
          Object.assign(record, describe(value));
          const id = own(value, "id"); const parentId = own(value, "parentId");
          if (typeof id === "string") record.id = id;
          if (typeof parentId === "string") record.parentId = parentId;
        } catch (cause) { record.error = cause instanceof Error ? cause.message : String(cause); record.summary = brief(raw); }
        records.push(record);
      }
    }
    if (!end) break;
    start = breaks.lastIndex; line += 1;
  }
  return { records, offset, hasMore };
}

/** Index the complete returned snapshot; render windows are applied after indexing. */
export function parseJsonlSnapshot(content: string): JsonlRecord[] {
  return readJsonlRecords(content).records;
}

/** Parse only one page. Blank lines still count toward original line numbers. */
export function parseJsonlPage(content: string, offset = 0, requestedLimit = JSONL_PAGE_SIZE): JsonlPage {
  offset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const limit = Number.isFinite(requestedLimit) ? Math.min(JSONL_PAGE_SIZE, Math.max(1, Math.floor(requestedLimit))) : JSONL_PAGE_SIZE;
  const page = readJsonlRecords(content, offset, limit);
  const { records, hasMore } = page;
  const ids = new Map<string, JsonlRecord[]>();
  for (const record of records) {
    if (record.id === undefined) continue;
    const values = ids.get(record.id) ?? []; values.push(record); ids.set(record.id, values);
  }
  const parents = new Map<JsonlRecord, JsonlRecord>();
  for (const record of records) {
    if (record.id !== undefined && ids.get(record.id)!.length > 1) record.issues.push("ID 重复");
    if (record.parentId === undefined) continue;
    const matches = ids.get(record.parentId);
    if (!matches) record.issues.push(offset > 0 || hasMore ? "父记录未在本页载入" : "父记录缺失");
    else if (matches.length > 1) record.issues.push("父 ID 不唯一");
    else { parents.set(record, matches[0]); record.parentLine = matches[0].line; }
  }
  const cyclic = new Set<JsonlRecord>();
  for (const record of records) {
    const path: JsonlRecord[] = []; const positions = new Map<JsonlRecord, number>();
    let current: JsonlRecord | undefined = record;
    while (current && !positions.has(current)) { positions.set(current, path.length); path.push(current); current = parents.get(current); }
    if (current) for (const member of path.slice(positions.get(current)!)) cyclic.add(member);
    record.depth = Math.min(8, Math.max(0, path.length - 1));
  }
  for (const record of cyclic) { record.issues.push("父子关系成环"); record.depth = 0; }
  return page;
}

export const JSON_FIELD_PAGE_SIZE = 50;
export const JSON_FIELD_MAX_DEPTH = 16;
export interface JsonFieldRow {
  kind: "value" | "pagination";
  path: string;
  label: string;
  depth: number;
  value: unknown;
  count: number;
  page: number;
  expanded: boolean;
}

/** Iterative, globally budgeted traversal; even hostile nesting cannot recurse the renderer. */
export function jsonFieldRows(value: unknown, expanded: ReadonlySet<string>, pages: ReadonlyMap<string, number>, budget = 300): { rows: JsonFieldRow[]; limited: boolean } {
  const rows: JsonFieldRow[] = [];
  const stack: Array<{ value: unknown; segments: string[]; label: string; depth: number } | JsonFieldRow> = [{ value, segments: [], label: "$", depth: 0 }];
  while (stack.length && rows.length < budget) {
    const node = stack.pop()!;
    if ("kind" in node) { rows.push(node); continue; }
    const path = JSON.stringify(node.segments);
    const keys = Array.isArray(node.value) ? undefined : object(node.value) ? Object.keys(node.value) : [];
    const count = Array.isArray(node.value) ? node.value.length : keys!.length;
    const page = Math.min(Math.max(0, pages.get(path) ?? 0), Math.max(0, Math.ceil(count / JSON_FIELD_PAGE_SIZE) - 1));
    const row: JsonFieldRow = { kind: "value", path, label: node.label, depth: node.depth, value: node.value, count, page, expanded: expanded.has(path) };
    rows.push(row);
    if (!count || !row.expanded || node.depth >= JSON_FIELD_MAX_DEPTH) continue;
    const start = page * JSON_FIELD_PAGE_SIZE; const end = Math.min(count, start + JSON_FIELD_PAGE_SIZE);
    if (count > JSON_FIELD_PAGE_SIZE) stack.push({ ...row, kind: "pagination" });
    for (let index = end - 1; index >= start; index -= 1) {
      const key = keys?.[index] ?? String(index);
      const child = Array.isArray(node.value) ? node.value[index] : (node.value as Record<string, unknown>)[key];
      stack.push({ value: child, segments: [...node.segments, key], label: key, depth: node.depth + 1 });
    }
  }
  return { rows, limited: stack.length > 0 };
}
