"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, GitBranch, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { filterJsonlTree, JSONL_TREE_WINDOW, type JsonlSession } from "./jsonl-session";

const filters = [
  { value: "default", label: "默认" }, { value: "no-tools", label: "不含工具" },
  { value: "user-only", label: "仅用户" }, { value: "labeled-only", label: "有标签" }, { value: "all", label: "全部记录" },
] as const;
type TreeFilter = typeof filters[number]["value"];
/** State lives in the reader so opening/closing mobile navigation preserves its query. */
export function useJsonlTreeNavigation() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TreeFilter>("default");
  const [page, setPage] = useState(0);
  const [focused, setFocused] = useState<number>();
  return { search, setSearch, filter, setFilter, page, setPage, focused, setFocused };
}
export function JsonlTree({ session, activeLine, branchLines, onSelect, navigation }: { session: JsonlSession; activeLine?: number; branchLines: ReadonlySet<number>; onSelect(line: number): void; navigation: ReturnType<typeof useJsonlTreeNavigation> }) {
  const { search, setSearch, filter, setFilter, page, setPage, focused, setFocused } = navigation;
  const list = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);
  const rows = useMemo(() => filterJsonlTree(session, { filter, search, activeLine }), [session, filter, search, activeLine]);
  const offset = Math.min(page * JSONL_TREE_WINDOW, Math.max(0, Math.floor((rows.length - 1) / JSONL_TREE_WINDOW) * JSONL_TREE_WINDOW));
  const visible = rows.slice(offset, offset + JSONL_TREE_WINDOW);
  useEffect(() => {
    const position = rows.findIndex((row) => row.record.line === activeLine);
    setPage(position < 0 ? 0 : Math.floor(position / JSONL_TREE_WINDOW)); setFocused(activeLine);
  }, [activeLine, rows]);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [offset]);
  function focusAt(index: number) {
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    pendingFocus.current = true;
    setFocused(row.record.line); setPage(Math.floor(Math.max(0, Math.min(rows.length - 1, index)) / JSONL_TREE_WINDOW));
  }
  useEffect(() => {
    if (focused === undefined || !list.current || !pendingFocus.current) return;
    const button = list.current.querySelector<HTMLElement>(`[data-tree-line="${focused}"]`);
    if (button) { button.focus(); pendingFocus.current = false; }
  }, [focused, offset]);
  function keys(event: KeyboardEvent<HTMLButtonElement>, position: number) {
    const row = rows[position]; let index = position;
    if (event.key === "ArrowDown") index += 1;
    else if (event.key === "ArrowUp") index -= 1;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = rows.length - 1;
    else if (event.key === "ArrowLeft") { const parent = session.byLine.get(row.record.line)?.parentLine; index = rows.findIndex((item) => item.record.line === parent); if (index < 0) index = position; }
    else if (event.key === "ArrowRight") { const child = session.byLine.get(row.record.line)?.children[0]; index = rows.findIndex((item) => item.record.line === child); if (index < 0) index = position; }
    else return;
    event.preventDefault(); event.stopPropagation(); focusAt(index);
  }
  return <section className="jsonl-tree-pane" aria-label="会话树导航">
    <div className="jsonl-tree-heading"><strong><GitBranch size={14} />会话树</strong><span>{session.records.length.toLocaleString()} 条记录</span></div>
    <div className="jsonl-tree-controls"><div className="jsonl-tree-search"><Search size={13} aria-hidden="true" /><Input aria-label="搜索会话树" placeholder="搜索消息、工具或标签…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><Select aria-label="会话树过滤" size="sm" value={filter} options={filters} onValueChange={(value) => { if (value) setFilter(value); }} /></div>
    <div className="jsonl-tree-list" role="tree" aria-label="会话记录与历史分支" ref={list}>
      {visible.map((row, index) => <button key={row.record.line} type="button" role="treeitem" aria-level={Math.min(16, row.depth + 1)} aria-selected={activeLine === row.record.line} data-tree-line={row.record.line} data-on-branch={branchLines.has(row.record.line) || undefined} data-diagnostic={row.diagnostic || undefined} className="jsonl-tree-row" tabIndex={focused === row.record.line || (!visible.some((item) => item.record.line === focused) && index === 0) ? 0 : -1} style={{ paddingInlineStart: `${10 + Math.min(row.depth, 12) * 12}px` }} title={`L${row.record.line} · ${row.record.type} · ${row.record.summary}`} onFocus={() => setFocused(row.record.line)} onClick={() => onSelect(row.record.line)} onKeyDown={(event) => keys(event, offset + index)}>
        <span className="jsonl-tree-connector" aria-hidden="true">{row.diagnostic ? <AlertTriangle size={12} /> : row.hasChildren && (session.byLine.get(row.record.line)?.children.length ?? 0) > 1 ? <GitBranch size={12} /> : "•"}</span><span className="jsonl-tree-copy"><span>{row.label || row.record.summary || row.record.type}</span><small>{row.record.type} · L{row.record.line}</small></span>{activeLine === row.record.line && <span className="jsonl-tree-current" aria-hidden="true">←</span>}
      </button>)}
      {!rows.length && <p className="jsonl-tree-empty">没有匹配记录</p>}
    </div>
    <nav className="jsonl-tree-pagination" aria-label="会话树分页"><button type="button" disabled={offset === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button><span>{rows.length ? `${offset + 1}–${Math.min(offset + JSONL_TREE_WINDOW, rows.length)} / ${rows.length}` : "0 条"}</span><button type="button" disabled={offset + JSONL_TREE_WINDOW >= rows.length} onClick={() => setPage((value) => value + 1)}>下一页</button></nav>
    {session.diagnostics.length > 0 && <p className="jsonl-tree-diagnostics"><AlertTriangle size={12} />{session.diagnostics.length} 条记录需核对来源，可在树中查看。</p>}
  </section>;
}
