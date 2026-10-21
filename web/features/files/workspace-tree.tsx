"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, FoldVertical } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface WorkspaceTreeEntry { path: string; status?: string }
export type WorkspaceTreeNode =
  | { kind: "directory"; path: string; name: string; children: WorkspaceTreeNode[] }
  | { kind: "file"; path: string; name: string; status?: string };
type MutableDirectory = { kind: "directory"; path: string; name: string; children: Map<string, MutableDirectory | Extract<WorkspaceTreeNode, { kind: "file" }>> };
const nodeKey = (node: WorkspaceTreeNode) => `${node.kind}:${node.path}`;
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/** Presentation only: never trim, decode or interpret Git's literal filenames. */
export function buildWorkspaceTree(entries: readonly WorkspaceTreeEntry[]): WorkspaceTreeNode[] {
  const root: MutableDirectory = { kind: "directory", path: "", name: "", children: new Map() };
  for (const entry of entries) {
    const segments = entry.path.split("/");
    let directory = root;
    for (let depth = 0; depth < segments.length - 1; depth++) {
      const name = segments[depth]; const key = `directory:${name}`;
      let child = directory.children.get(key);
      if (!child || child.kind !== "directory") {
        child = { kind: "directory", name, path: segments.slice(0, depth + 1).join("/"), children: new Map() };
        directory.children.set(key, child);
      }
      directory = child;
    }
    directory.children.set(`file:${entry.path}`, { kind: "file", name: segments.at(-1)!, ...entry });
  }
  function sorted(directory: MutableDirectory): WorkspaceTreeNode[] {
    return [...directory.children.values()].map((node): WorkspaceTreeNode => node.kind === "directory" ? { ...node, children: sorted(node) } : node)
      .sort((left, right) => Number(right.kind === "directory") - Number(left.kind === "directory") || compare(left.name.toLowerCase(), right.name.toLowerCase()) || compare(left.name, right.name));
  }
  return sorted(root);
}

function ancestors(path: string | undefined): string[] {
  if (path === undefined) return [];
  const segments = path.split("/");
  return segments.slice(0, -1).map((_, index) => `directory:${segments.slice(0, index + 1).join("/")}`);
}

function gitStatus(status: string | undefined) {
  if (!status) return;
  if (status === "??") return { letter: "?", label: "未跟踪", kind: "untracked" };
  if (status.includes("U") || status === "AA" || status === "DD") return { letter: "U", label: "存在冲突", kind: "conflict" };
  if (status.includes("R")) return { letter: "R", label: "已重命名", kind: "renamed" };
  if (status.includes("C")) return { letter: "C", label: "已复制", kind: "copied" };
  if (status.includes("D")) return { letter: "D", label: "已删除", kind: "deleted" };
  if (status.includes("A")) return { letter: "A", label: "已添加", kind: "added" };
  if (status.includes("M")) return { letter: "M", label: "已修改", kind: "modified" };
  return { letter: status, label: `Git 状态 ${status}`, kind: "changed" };
}

interface WorkspaceTreeProps {
  entries: readonly WorkspaceTreeEntry[]; selectedPath?: string; onSelect(path: string): void;
  rootName: string; scope: string; rootTitle?: string; label?: string; emptyMessage?: string;
  unavailable?: ReactNode;
}

export function WorkspaceTree({ entries, selectedPath, onSelect, rootName, scope, rootTitle, label = "文件", emptyMessage = "此工作区没有可显示的文件", unavailable }: WorkspaceTreeProps) {
  const nodes = useMemo(() => buildWorkspaceTree(entries), [entries]);
  const [expanded, setExpanded] = useState(() => new Set(ancestors(selectedPath)));
  const [focusedKey, setFocusedKey] = useState<string | undefined>(selectedPath === undefined ? undefined : `file:${selectedPath}`);
  const elements = useRef(new Map<string, HTMLLIElement>());
  const typeahead = useRef({ value: "", time: 0 });
  useEffect(() => {
    setExpanded((previous) => new Set([...previous, ...ancestors(selectedPath)]));
    setFocusedKey(selectedPath === undefined ? undefined : `file:${selectedPath}`);
  }, [selectedPath]);

  const visible: Array<{ node: WorkspaceTreeNode; parent?: string }> = [];
  function collect(children: WorkspaceTreeNode[], parent?: string) {
    for (const node of children) {
      visible.push({ node, parent });
      if (node.kind === "directory" && expanded.has(nodeKey(node))) collect(node.children, nodeKey(node));
    }
  }
  collect(nodes);
  const tabStop = visible.some(({ node }) => nodeKey(node) === focusedKey) ? focusedKey : visible[0] && nodeKey(visible[0].node);
  const hasExpandedDirectory = visible.some(({ node }) => node.kind === "directory" && expanded.has(nodeKey(node)));
  function focus(key: string | undefined) {
    if (!key) return;
    setFocusedKey(key); elements.current.get(key)?.focus();
  }
  function toggle(node: WorkspaceTreeNode) {
    if (node.kind !== "directory") return;
    const key = nodeKey(node);
    setExpanded((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function activate(node: WorkspaceTreeNode) {
    focus(nodeKey(node));
    if (node.kind === "directory") toggle(node); else onSelect(node.path);
  }
  function keyDown(event: KeyboardEvent<HTMLLIElement>, node: WorkspaceTreeNode) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = nodeKey(node); const index = visible.findIndex((entry) => nodeKey(entry.node) === key);
    const open = node.kind === "directory" && expanded.has(key);
    switch (event.key) {
      case "ArrowDown": focus(visible[Math.min(index + 1, visible.length - 1)] && nodeKey(visible[Math.min(index + 1, visible.length - 1)].node)); break;
      case "ArrowUp": focus(visible[Math.max(0, index - 1)] && nodeKey(visible[Math.max(0, index - 1)].node)); break;
      case "Home": focus(visible[0] && nodeKey(visible[0].node)); break;
      case "End": focus(visible.at(-1) && nodeKey(visible.at(-1)!.node)); break;
      case "ArrowRight":
        if (node.kind === "directory") { if (!open) toggle(node); else if (node.children[0]) focus(nodeKey(node.children[0])); }
        break;
      case "ArrowLeft": if (open) toggle(node); else focus(visible[index]?.parent); break;
      case "Enter": case " ": activate(node); break;
      default: {
        if (event.key.length !== 1 || event.key.trim() === "") return;
        const now = Date.now(); const value = event.key.toLowerCase();
        const previous = now - typeahead.current.time < 700 ? typeahead.current.value : "";
        const query = previous === value ? value : previous + value;
        typeahead.current = { value: query, time: now };
        const candidates = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
        const match = candidates.find(({ node: candidate }) => candidate.name.toLowerCase().startsWith(query));
        if (match) focus(nodeKey(match.node));
      }
    }
    event.preventDefault(); event.stopPropagation();
  }
  function renderNodes(children: WorkspaceTreeNode[], depth = 0): ReactNode {
    return children.map((node) => {
      const key = nodeKey(node); const directory = node.kind === "directory"; const open = directory && expanded.has(key);
      const selected = !directory && node.path === selectedPath; const status = !directory ? gitStatus(node.status) : undefined;
      const Icon = directory ? open ? FolderOpen : Folder : FileCode2;
      return <li key={key} role="treeitem" className="workspace-tree-item" aria-label={node.path} aria-expanded={directory ? open : undefined} aria-selected={directory ? undefined : selected} aria-level={depth + 1} tabIndex={tabStop === key ? 0 : -1} data-path={node.path} data-kind={node.kind} data-selected={selected} ref={(element) => { if (element) elements.current.set(key, element); else elements.current.delete(key); }} onFocus={(event) => { if (event.target === event.currentTarget) setFocusedKey(key); }} onKeyDown={(event) => keyDown(event, node)}>
        <div className="workspace-tree-row" data-path={node.path} data-kind={node.kind} data-selected={selected} title={status ? `${node.path} · ${status.label}` : node.path} style={{ "--tree-depth": depth } as CSSProperties} onClick={(event) => { event.stopPropagation(); activate(node); }}>
          {Array.from({ length: depth }, (_, index) => <span className="workspace-tree-guide" style={{ "--guide-depth": index } as CSSProperties} key={index} aria-hidden="true" />)}
          <span className="workspace-tree-chevron" aria-hidden="true">{directory && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}</span>
          <Icon className="workspace-tree-icon" size={15} aria-hidden="true" />
          <span className="workspace-tree-label">{node.name}</span>
          {status && <span className="workspace-tree-status" data-status={status.kind} role="img" aria-label={status.label} title={status.label}>{status.letter}</span>}
        </div>
        {directory && open && <ul role="group" className="workspace-tree-group">{renderNodes(node.children, depth + 1)}</ul>}
      </li>;
    });
  }
  return <div className="workspace-tree-explorer">
    <div className="workspace-tree-toolbar">
      <div className="workspace-tree-root-label" title={rootTitle}><FolderOpen size={15} aria-hidden="true" /><span>{rootName}</span><span className="workspace-tree-scope">{scope}</span></div>
      <button type="button" aria-label="全部折叠" title="全部折叠" disabled={!hasExpandedDirectory || Boolean(unavailable)} onClick={() => { setExpanded(new Set()); setFocusedKey(nodes[0] && nodeKey(nodes[0])); }}><FoldVertical size={15} aria-hidden="true" /></button>
    </div>
    <ScrollArea className="workspace-file-scroll">{unavailable ?? (nodes.length ? <ul role="tree" aria-label={`${label} · ${scope} · ${rootName}`} className="workspace-tree">{renderNodes(nodes)}</ul> : <div className="workspace-tree-empty"><FileCode2 size={24} aria-hidden="true" /><p>{emptyMessage}</p></div>)}</ScrollArea>
  </div>;
}
