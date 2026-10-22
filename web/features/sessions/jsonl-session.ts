/** Owned session navigation, informed by Pi 1.3.0's MIT-licensed HTML reader.
 * Source identity is always the original line, never an ambiguous protocol ID.
 */
import { jsonlField as own, jsonlObject as object, parseJsonlSnapshot, type JsonlRecord } from "./jsonl-structure";

export const JSONL_READING_WINDOW = 60;
export const JSONL_TREE_WINDOW = 160;
export type JsonlTreeFilter = "default" | "no-tools" | "user-only" | "labeled-only" | "all";
export interface JsonlSessionNode {
  record: JsonlRecord;
  parentLine?: number;
  children: number[];
  depth: number;
  newestLeafLine: number;
  diagnostic: boolean;
  label?: string;
}
export interface JsonlTreeRow {
  record: JsonlRecord;
  depth: number;
  hasChildren: boolean;
  diagnostic: boolean;
  label?: string;
}
export interface JsonlSessionSummary {
  userMessages: number;
  assistantMessages: number;
  toolResults: number;
  toolCalls: number;
  models: string[];
  tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  cost?: number;
  usageRecords: number;
  partialUsage: boolean;
}
export interface JsonlSession {
  records: JsonlRecord[];
  byLine: Map<number, JsonlSessionNode>;
  /** Contains only unique, nonempty IDs; inspect diagnostic before trusting ancestry. */
  byId: Map<string, JsonlSessionNode>;
  roots: number[];
  tree: JsonlTreeRow[];
  initialLeafLine?: number;
  diagnostics: JsonlRecord[];
  summary: JsonlSessionSummary;
}
export interface JsonlBranchSelection {
  leafLine?: number;
  targetLine?: number;
  records: JsonlRecord[];
  missing: boolean;
}

function id(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
const entryTypes = new Set(["session", "message", "model_change", "thinking_level_change", "compaction", "branch_summary", "custom_message", "custom", "label", "session_info", "usage", "context_edit"]);

function summarize(records: readonly JsonlRecord[]): JsonlSessionSummary {
  const summary: JsonlSessionSummary = { userMessages: 0, assistantMessages: 0, toolResults: 0, toolCalls: 0, models: [], usageRecords: 0, partialUsage: false };
  const models = new Set<string>();
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const tokenKeys = ["input", "output", "cacheRead", "cacheWrite"] as const;
  let cost = 0; let costRecords = 0;
  for (const record of records) {
    if (record.type !== "message") continue;
    const message = own(record.value, "message");
    const role = own(message, "role");
    if (role === "user") summary.userMessages += 1;
    if (role === "toolResult") summary.toolResults += 1;
    if (role !== "assistant") continue;
    summary.assistantMessages += 1;
    const model = own(message, "model"); const provider = own(message, "provider");
    if (typeof model === "string" && model) models.add(`${typeof provider === "string" && provider ? `${provider.slice(0, 160)}/` : ""}${model.slice(0, 160)}`);
    const content = own(message, "content");
    if (Array.isArray(content)) for (const block of content) if (own(block, "type") === "toolCall") summary.toolCalls += 1;
    const usage = own(message, "usage");
    if (tokenKeys.every((key) => finite(own(usage, key)))) {
      summary.usageRecords += 1;
      for (const key of tokenKeys) tokens[key] += own(usage, key) as number;
    }
    const sourceCost = own(usage, "cost"); const total = own(sourceCost, "total");
    if (finite(total)) { cost += total; costRecords += 1; }
    else if (tokenKeys.every((key) => finite(own(sourceCost, key)))) {
      for (const key of tokenKeys) cost += own(sourceCost, key) as number;
      costRecords += 1;
    }
  }
  summary.models = [...models];
  if (summary.assistantMessages > 0 && summary.usageRecords === summary.assistantMessages && tokenKeys.every((key) => finite(tokens[key]))) summary.tokens = tokens;
  if (summary.assistantMessages > 0 && costRecords === summary.assistantMessages && finite(cost)) summary.cost = cost;
  summary.partialUsage = summary.assistantMessages > 0 && (summary.tokens === undefined || summary.cost === undefined);
  return summary;
}

/** One parse plus linear graph passes; no recursive or per-record ancestry walk. */
export function buildJsonlSession(content: string): JsonlSession {
  const records = parseJsonlSnapshot(content);
  const byLine = new Map<number, JsonlSessionNode>();
  const ids = new Map<string, JsonlSessionNode[]>();
  for (const record of records) {
    const node: JsonlSessionNode = { record, children: [], depth: 0, newestLeafLine: record.line, diagnostic: false };
    byLine.set(record.line, node);
    if (id(record.id)) {
      const matches = ids.get(record.id);
      if (matches) matches.push(node); else ids.set(record.id, [node]);
    } else if (!record.error) record.issues.push("缺少有效 ID");
    if (!record.error && !object(record.value)) record.issues.push("非对象记录");
    else if (!record.error && !entryTypes.has(record.type)) record.issues.push("未识别的记录类型");
  }
  const byId = new Map<string, JsonlSessionNode>();
  for (const [key, nodes] of ids) {
    if (nodes.length === 1) byId.set(key, nodes[0]);
    else for (const node of nodes) node.record.issues.push("ID 重复");
  }
  const candidates = new Map<number, number>();
  for (const node of byLine.values()) {
    const record = node.record;
    const parent = own(record.value, "parentId");
    if (parent === null || parent === undefined) continue;
    if (!id(parent)) { record.issues.push("父 ID 无效"); continue; }
    const matches = ids.get(parent);
    if (!matches) record.issues.push("父记录缺失");
    else if (matches.length !== 1) record.issues.push("父 ID 不唯一");
    else if (id(record.id) && byId.has(record.id)) candidates.set(record.line, matches[0].record.line);
  }
  // Detect all cycle members before discarding forward edges, so corrupt cycles
  // remain diagnosable rather than looking like unrelated forward references.
  const done = new Set<number>(); const cyclic = new Set<number>();
  for (const record of records) {
    if (done.has(record.line)) continue;
    const path: number[] = []; const position = new Map<number, number>();
    let current: number | undefined = record.line;
    while (current !== undefined && !done.has(current) && !position.has(current)) {
      position.set(current, path.length); path.push(current); current = candidates.get(current);
    }
    if (current !== undefined && position.has(current)) for (let index = position.get(current)!; index < path.length; index += 1) cyclic.add(path[index]);
    for (const line of path) done.add(line);
  }
  const roots: number[] = [];
  for (const node of byLine.values()) {
    const parentLine = candidates.get(node.record.line);
    if (cyclic.has(node.record.line)) node.record.issues.push("父子关系成环");
    else if (parentLine !== undefined && parentLine >= node.record.line) node.record.issues.push("父记录晚于子记录，未确认关系");
    else if (parentLine !== undefined) {
      const parent = byLine.get(parentLine)!;
      node.parentLine = parentLine; node.record.parentLine = parentLine;
      parent.children.push(node.record.line);
      node.depth = parent.depth + 1;
      node.record.depth = Math.min(8, node.depth);
      if (parent.diagnostic) node.record.issues.push("祖先记录关系未确认");
    }
    node.diagnostic = !!node.record.error || node.record.issues.length > 0;
    if (node.parentLine === undefined) roots.push(node.record.line);
  }
  let initialLeafLine: number | undefined;
  // The file is an append log: the final loaded child is the newest branch.
  // Reverse propagation obtains every node's newest descendant in one pass.
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const node = byLine.get(records[index].line)!;
    const lastChild = node.diagnostic ? node.children.at(-1) : node.children.findLast((line) => !byLine.get(line)!.diagnostic);
    if (lastChild !== undefined) node.newestLeafLine = byLine.get(lastChild)!.newestLeafLine;
    else if (!node.diagnostic && initialLeafLine === undefined) initialLeafLine = node.record.line;
  }
  for (const record of records) {
    if (record.type !== "label") continue;
    const targetId = own(record.value, "targetId");
    const target = id(targetId) ? byId.get(targetId) : undefined;
    const label = own(record.value, "label");
    if (target) target.label = typeof label === "string" && label ? label.slice(0, 160) : undefined;
  }
  const tree: JsonlTreeRow[] = [];
  const stack = roots.slice().reverse().map((line) => ({ line, depth: 0 }));
  while (stack.length) {
    const item = stack.pop()!; const node = byLine.get(item.line)!;
    tree.push({ record: node.record, depth: item.depth, hasChildren: node.children.length > 0, diagnostic: node.diagnostic, label: node.label });
    const childDepth = item.depth + (node.children.length > 1 ? 1 : 0);
    for (let index = node.children.length - 1; index >= 0; index -= 1) stack.push({ line: node.children[index], depth: childDepth });
  }
  return { records, byLine, byId, roots, tree, initialLeafLine, diagnostics: records.filter((record) => byLine.get(record.line)!.diagnostic), summary: summarize(records) };
}

function branchRecords(session: JsonlSession, leafLine: number | undefined): JsonlRecord[] {
  const records: JsonlRecord[] = [];
  let node = leafLine === undefined ? undefined : session.byLine.get(leafLine);
  while (node) { records.push(node.record); node = node.parentLine === undefined ? undefined : session.byLine.get(node.parentLine); }
  return records.reverse();
}

/** An explicit leaf is retained only when its confirmed path contains the target. */
export function selectJsonlBranch(session: JsonlSession, targetLine?: number, leafLine?: number): JsonlBranchSelection {
  const requestedTarget = targetLine !== undefined; const requestedLeaf = leafLine !== undefined;
  const target = targetLine === undefined ? undefined : session.byLine.get(targetLine);
  let leaf = leafLine === undefined ? undefined : session.byLine.get(leafLine);
  let missing = (requestedTarget && !target) || (requestedLeaf && !leaf);
  if (leaf) leaf = session.byLine.get(leaf.newestLeafLine);
  let records = branchRecords(session, leaf?.record.line);
  if (target && (!leaf || !records.some((record) => record.line === target.record.line))) {
    if (leaf) missing = true;
    leaf = session.byLine.get(target.newestLeafLine);
    records = branchRecords(session, leaf?.record.line);
  } else if (!leaf) {
    leaf = session.initialLeafLine === undefined ? undefined : session.byLine.get(session.initialLeafLine);
    // An entirely malformed document must still offer accessible source evidence.
    leaf ??= session.records.length ? session.byLine.get(session.records[0].line) : undefined;
    records = branchRecords(session, leaf?.record.line);
  }
  return { leafLine: leaf?.record.line, targetLine: target?.record.line ?? leaf?.record.line, records, missing };
}

/** Pi's five navigation filters; filtering never changes the selected branch. */
export function filterJsonlTree(session: JsonlSession, options: { filter: JsonlTreeFilter; search?: string; activeLine?: number }): JsonlTreeRow[] {
  const tokens = (options.search ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const settings = new Set(["label", "custom", "context_edit", "model_change", "thinking_level_change"]);
  const visible: JsonlTreeRow[] = [];
  // Full preorder plus compact branch indentation bounds indentation without
  // searching every hidden node's ancestry when filters remove a long chain.
  for (const row of session.tree) {
    const record = row.record; const role = own(own(record.value, "message"), "role");
    let include = true;
    switch (options.filter) {
      case "user-only": include = record.type === "message" && role === "user"; break;
      case "no-tools": include = !settings.has(record.type) && !(record.type === "message" && role === "toolResult"); break;
      case "labeled-only": include = row.label !== undefined; break;
      case "default": include = !settings.has(record.type); break;
      case "all": break;
    }
    if (include && tokens.length) {
      const text = `${row.label ?? ""} ${record.type} ${record.raw}`.toLocaleLowerCase();
      include = tokens.every((token) => text.includes(token));
    }
    if (include || record.line === options.activeLine) visible.push(row);
  }
  return visible;
}
