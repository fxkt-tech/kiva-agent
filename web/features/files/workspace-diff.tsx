"use client";

import { useMemo } from "react";

export type WorkspaceDiffLineKind = "meta" | "hunk" | "added" | "removed" | "context" | "note";

export interface WorkspaceDiffLine {
  kind: WorkspaceDiffLineKind;
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface WorkspaceDiffTotals {
  added: number;
  removed: number;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;
// Pathological patches stay usable: rows are bounded, the totals remain complete.
const MAX_RENDERED_ROWS = 2000;
// Structural lines repeat the preview header path or internal Git bookkeeping.
const STRUCTURAL = /^(diff --git |index |--- |\+\+\+ |old mode |new mode |similarity index |dissimilarity index |copy from |copy to |GIT binary patch)/;

/** Parses unified diff text into display rows; everything before a hunk is file metadata. */
export function parseUnifiedDiff(content: string): WorkspaceDiffLine[] {
  const lines: WorkspaceDiffLine[] = [];
  const raw = content.split(/\r?\n/);
  // A patch always terminates with a newline; the empty tail is not a row.
  if (raw.length && !raw[raw.length - 1]) raw.pop();
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const text of raw) {
    const hunk = HUNK.exec(text);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: "hunk", text });
      continue;
    }
    if (!inHunk) {
      lines.push({ kind: "meta", text });
      continue;
    }
    if (text.startsWith("diff --git ")) {
      inHunk = false;
      lines.push({ kind: "meta", text });
      continue;
    }
    const marker = text.slice(0, 1);
    if (marker === "+") lines.push({ kind: "added", newLine: newLine++, text: text.slice(1) });
    else if (marker === "-") lines.push({ kind: "removed", oldLine: oldLine++, text: text.slice(1) });
    else if (marker === "\\") lines.push({ kind: "note", text: text.slice(1).trim() });
    else lines.push({ kind: "context", oldLine: oldLine++, newLine: newLine++, text: marker === " " ? text.slice(1) : text });
  }
  return lines;
}

export function diffTotals(lines: readonly WorkspaceDiffLine[]): WorkspaceDiffTotals {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "added") added += 1;
    else if (line.kind === "removed") removed += 1;
  }
  return { added, removed };
}

/** One section per `diff --git` block, so multi-file patches keep separate headers. */
export function diffSections(lines: readonly WorkspaceDiffLine[]): { path?: string; lines: WorkspaceDiffLine[] }[] {
  const sections: { path?: string; lines: WorkspaceDiffLine[] }[] = [];
  for (const line of lines) {
    const header = line.kind === "meta" && line.text.startsWith("diff --git ") ? line.text : undefined;
    if (header || !sections.length) sections.push({ path: header ? diffPath(header) : undefined, lines: [] });
    sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function diffPath(header: string) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(header);
  return match ? match[2] : undefined;
}

/** Reader-facing notes for metadata worth surfacing, in patch order. */
export function diffNotices(lines: readonly WorkspaceDiffLine[]): string[] {
  const notices: string[] = [];
  const metas = lines.filter((line) => line.kind === "meta").map((line) => line.text);
  for (let index = 0; index < metas.length; index += 1) {
    const text = metas[index];
    const next = metas[index + 1];
    if (text.startsWith("new file mode ")) notices.push("新建文件");
    else if (text.startsWith("deleted file mode ")) notices.push("删除文件");
    else if (text.startsWith("rename from ")) {
      if (next?.startsWith("rename to ")) { notices.push(`重命名 ${text.slice(12)} → ${next.slice(10)}`); index += 1; }
      else notices.push(`重命名 ${text.slice(12)}`);
    } else if (text.startsWith("rename to ")) notices.push(`重命名 → ${text.slice(10)}`);
    else if (text.startsWith("Binary files ") && text.endsWith(" differ")) notices.push("二进制文件差异，无法显示逐行内容");
    else if (!STRUCTURAL.test(text) && text.trim()) notices.push(text);
  }
  return notices;
}

const isRow = (line: WorkspaceDiffLine) => line.kind !== "meta";
// Only code rows consume the render budget; gaps and metadata stay cheap.
const isContent = (line: WorkspaceDiffLine) => line.kind === "added" || line.kind === "removed" || line.kind === "context" || line.kind === "note";

/** Keeps metadata/hunk gaps plus at most `budget` content rows. */
function takeRows(lines: readonly WorkspaceDiffLine[], budget: number) {
  const kept: WorkspaceDiffLine[] = [];
  let count = 0;
  for (const line of lines) {
    if (isContent(line)) {
      if (count >= budget) break;
      count += 1;
    }
    kept.push(line);
  }
  return { lines: kept, count };
}

export function WorkspaceDiff({ content }: { content: string }) {
  const lines = useMemo(() => parseUnifiedDiff(content), [content]);
  const sections = useMemo(() => diffSections(lines), [lines]);
  // Anything that is not a Git patch (or an empty patch) keeps the plain preview.
  const isPatch = content.startsWith("diff --git ") || lines.some((line) => line.kind === "hunk");
  if (!content.trim()) return <p className="workspace-diff-empty">没有可显示的差异。</p>;
  if (!isPatch) return <pre>{content}</pre>;
  const rows = lines.filter(isContent).length;
  const truncated = rows > MAX_RENDERED_ROWS;
  let budget = MAX_RENDERED_ROWS;
  return <div className="workspace-diff">
    {sections.map((section, index) => {
      const taken = takeRows(section.lines, budget);
      budget -= taken.count;
      return <DiffSection key={`${section.path ?? "diff"}:${index}`} section={{ path: section.path, lines: taken.lines }} showPath={sections.length > 1}/>;
    })}
    {truncated && <p className="workspace-diff-truncated" role="status">差异较长，仅显示前 {MAX_RENDERED_ROWS.toLocaleString()} 行（共 {rows.toLocaleString()} 行）。</p>}
  </div>;
}

function DiffSection({ section, showPath }: { section: { path?: string; lines: WorkspaceDiffLine[] }; showPath: boolean }) {
  const notices = diffNotices(section.lines);
  const hasBody = section.lines.some(isRow);
  // Mode/path-only patches have no rows, so their raw metadata is the readable content.
  const header = notices.length ? notices : hasBody ? [] : section.lines.map((line) => line.text).filter((text) => text.trim());
  return <section className="workspace-diff-file" data-path={section.path}>
    {showPath && section.path && <p className="workspace-diff-filepath">{section.path}</p>}
    {header.length > 0 && <div className="workspace-diff-notices">{header.map((notice, index) => <p key={`${index}:${notice}`}>{notice}</p>)}</div>}
    {section.lines.map((line, offset) => <DiffRow key={offset} line={line}/>)}
  </section>;
}

function DiffRow({ line }: { line: WorkspaceDiffLine }) {
  if (line.kind === "meta") return null;  if (line.kind === "hunk") return <p className="workspace-diff-hunk">{line.text}</p>;
  if (line.kind === "note") return <p className="workspace-diff-note">{line.text}</p>;
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "−" : "";
  return <div className="workspace-diff-row" data-kind={line.kind}>
    <span className="workspace-diff-number" aria-hidden="true">{line.oldLine ?? ""}</span>
    <span className="workspace-diff-number" aria-hidden="true">{line.newLine ?? ""}</span>
    <span className="workspace-diff-sign" aria-hidden="true">{sign}</span>
    <span className="workspace-diff-text">{line.text}</span>
  </div>;
}
