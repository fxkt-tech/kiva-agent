"use client";

// Navigation and reading hierarchy adapted from Pi 1.3.0; see PI-VIEWER-NOTICE.md.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { FileJson2, GitBranch, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buildJsonlSession, selectJsonlBranch, JSONL_READING_WINDOW } from "./jsonl-session";
import { presentJsonlBranch } from "./jsonl-presentation";
import { RecordDetails } from "./jsonl-record-details";
import { JsonlThread } from "./jsonl-thread";
import { JsonlTree, useJsonlTreeNavigation } from "./jsonl-tree";
import { sessionViewerHref, type SessionViewerSelection } from "./session-viewer-link";

export function RenderedJsonl({ content, projectId, sessionId, initialSelection }: { content: string; projectId: string; sessionId: string; initialSelection?: SessionViewerSelection }) {
  const session = useMemo(() => buildJsonlSession(content), [content]);
  const requested = useMemo(() => {
    const target = initialSelection?.target ? session.byId.get(initialSelection.target)?.record.line ?? initialSelection.targetLine : initialSelection?.targetLine;
    const leaf = initialSelection?.leaf ? session.byId.get(initialSelection.leaf)?.record.line ?? initialSelection.leafLine : initialSelection?.leafLine;
    return { target, leaf, unresolved: Boolean((initialSelection?.target || initialSelection?.targetLine) && !session.byLine.has(target ?? -1) || (initialSelection?.leaf || initialSelection?.leafLine) && !session.byLine.has(leaf ?? -1)) };
  }, [initialSelection, session]);
  const [selection, setSelection] = useState(() => ({ target: requested.target, leaf: requested.leaf }));
  const [missingDismissed, setMissingDismissed] = useState(false);
  const branch = useMemo(() => selectJsonlBranch(session, selection.target, selection.leaf), [session, selection]);
  const [offset, setOffset] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [toolOutputs, setToolOutputs] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const treeNavigation = useJsonlTreeNavigation();
  const [mobile, setMobile] = useState(false);
  const [treeWidth, setTreeWidth] = useState(300);
  const [detail, setDetail] = useState<{ line: number; trigger: HTMLButtonElement }>();
  const reader = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const treeButton = useRef<HTMLButtonElement>(null);
  const sourceClose = useRef<HTMLButtonElement>(null);
  const treeClose = useRef<HTMLButtonElement>(null);
  const reveal = useRef<number | undefined>(undefined);
  const views = useMemo(() => presentJsonlBranch(branch.records, offset, JSONL_READING_WINDOW), [branch.records, offset]);
  const branchLines = useMemo(() => new Set(branch.records.map((record) => record.line)), [branch.records]);
  useEffect(() => { setSelection({ target: requested.target, leaf: requested.leaf }); setMissingDismissed(false); }, [requested]);
  useEffect(() => {
    const position = branch.records.findIndex((record) => record.line === branch.targetLine);
    setOffset(position < 0 ? 0 : Math.floor(position / JSONL_READING_WINDOW) * JSONL_READING_WINDOW);
    reveal.current = branch.targetLine;
  }, [branch]);
  useEffect(() => {
    if (!reader.current) return;
    reader.current.scrollTop = 0;
    if (reveal.current !== undefined) {
      const target = reader.current.querySelector<HTMLElement>(`[data-jsonl-line="${reveal.current}"]`) ?? reader.current.querySelector<HTMLElement>(`[data-result-line="${reveal.current}"]`);
      target?.scrollIntoView({ block: "start" }); reveal.current = undefined;
    }
  }, [offset, views]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => { setMobile(media.matches); if (!media.matches) setTreeOpen(false); };
    update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update);
  }, []);
  const detailsRecord = detail ? session.byLine.get(detail.line)?.record : undefined;
  function navigate(line: number) { setSelection({ target: line, leaf: branchLines.has(line) ? branch.leafLine : undefined }); setTreeOpen(false); }
  function selectTree(line: number) { setSelection({ target: line, leaf: undefined }); setTreeOpen(false); }
  function resize(width: number) { setTreeWidth(Math.max(220, Math.min(Math.min(560, (root.current?.clientWidth ?? 1200) - 420), width))); }
  function separatorKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); resize(event.key === "Home" ? 220 : event.key === "End" ? 560 : treeWidth + (event.key === "ArrowRight" ? 24 : -24));
  }
  async function copyLink(line: number) {
    const leaf = session.byLine.get(branch.leafLine ?? -1)?.record;
    const target = session.byLine.get(line)?.record;
    const unique = (record: typeof leaf) => record?.id && record.id.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(record.id) && session.byId.get(record.id)?.record.line === record.line ? record.id : undefined;
    const href = sessionViewerHref(projectId, sessionId, { leaf: unique(leaf), target: unique(target), leafLine: leaf?.line, targetLine: target?.line });
    await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
  }
  if (!session.records.length) return <div className="jsonl-empty"><FileJson2 size={24} aria-hidden="true" /><p>此会话还没有 JSONL 记录</p></div>;
  const summary = session.summary;
  const tree = <JsonlTree navigation={treeNavigation} session={session} activeLine={branch.targetLine} branchLines={branchLines} onSelect={selectTree} />;
  return <div className="jsonl-rendered" ref={root} style={{ "--jsonl-tree-width": `${treeWidth}px` } as CSSProperties}>
    {!mobile && <aside className="jsonl-tree-desktop">{tree}</aside>}
    <div className="jsonl-tree-resizer" role="separator" aria-label="调整会话树宽度" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={560} aria-valuenow={treeWidth} tabIndex={0} onKeyDown={separatorKeys} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event.clientX - (root.current?.getBoundingClientRect().left ?? 0)); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} />
    <section className="jsonl-conversation-pane" aria-label="当前分支阅读区">
      <div className="jsonl-reader-toolbar"><Button ref={treeButton} className="jsonl-mobile-tree-toggle" size="sm" variant="outline" aria-label="打开会话树" aria-expanded={treeOpen} onClick={() => setTreeOpen(true)}><GitBranch size={14} />会话树</Button><span>当前分支 · {branch.records.length.toLocaleString()} 条记录</span><span className="jsonl-branch-leaf">末端 L{branch.leafLine}</span></div>
      {(requested.unresolved || branch.missing) && !missingDismissed && <Alert variant="warning" title="链接中的记录未在当前快照中找到" className="jsonl-notice" onDismiss={() => setMissingDismissed(true)}>记录可能已删除或超出已读取范围。当前显示可用分支，仍可使用会话树和原始文本。</Alert>}
      <div className="jsonl-reader-options"><label><Checkbox checked={thinking} onCheckedChange={setThinking} />展开思考</label><label><Checkbox checked={toolOutputs} onCheckedChange={setToolOutputs} />展开工具输出</label><label><Checkbox checked={hidden} onCheckedChange={setHidden} />显示隐藏消息</label></div>
      <div className="jsonl-record-list" role="region" aria-label="JSONL 当前分支记录" ref={reader}>
        <details className="jsonl-summary"><summary>会话概览 <span>{summary.userMessages} 条用户消息 · {summary.assistantMessages} 条助手消息 · {summary.toolCalls} 次工具调用</span></summary><dl><div><dt>载入记录</dt><dd>{session.records.length}</dd></div><div><dt>工具结果</dt><dd>{summary.toolResults}</dd></div><div><dt>模型</dt><dd>{summary.models.join("、") || "未记录"}</dd></div><div><dt>Token 用量</dt><dd>{summary.tokens ? `输入 ${summary.tokens.input.toLocaleString()} · 输出 ${summary.tokens.output.toLocaleString()} · 缓存读 ${summary.tokens.cacheRead.toLocaleString()} · 缓存写 ${summary.tokens.cacheWrite.toLocaleString()}` : "未完整记录"}</dd></div><div><dt>费用</dt><dd>{summary.cost === undefined ? "未完整记录" : `$${summary.cost.toFixed(4)}`}</dd></div></dl>{summary.partialUsage && <p>部分消息缺少完整用量；没有推算会话总量。</p>}</details>
        <JsonlThread views={views} selectedLine={branch.targetLine} thinking={thinking} toolOutputs={toolOutputs} hidden={hidden} onNavigate={navigate} onDetails={(line, trigger) => setDetail({ line, trigger })} onCopyLink={copyLink} />
      </div>
      <nav className="jsonl-pagination" aria-label="当前分支分页"><button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - JSONL_READING_WINDOW))}>上一页</button><span>分支记录 {offset + 1}–{Math.min(branch.records.length, offset + JSONL_READING_WINDOW)} / {branch.records.length}</span><button type="button" disabled={offset + JSONL_READING_WINDOW >= branch.records.length} onClick={() => setOffset((value) => value + JSONL_READING_WINDOW)}>下一页</button></nav>
    </section>
    {treeOpen && <Dialog open onOpenChange={(open) => { if (!open) setTreeOpen(false); }}><DialogContent className="jsonl-mobile-tree-dialog" initialFocus={treeClose} finalFocus={treeButton} showCloseButton={false}><header className="project-dialog-heading"><div><DialogTitle>会话树</DialogTitle><DialogDescription>搜索记录，或选择历史分支继续阅读。</DialogDescription></div><button ref={treeClose} type="button" aria-label="关闭会话树" onClick={() => setTreeOpen(false)}><X size={16} /></button></header>{tree}</DialogContent></Dialog>}
    {detailsRecord && <Dialog open onOpenChange={(open) => { if (!open) setDetail(undefined); }}><DialogContent className="jsonl-source-dialog" initialFocus={sourceClose} finalFocus={() => detail?.trigger.isConnected ? detail.trigger : false} showCloseButton={false}><header className="project-dialog-heading"><div><DialogTitle>记录详情 · L{detailsRecord.line}</DialogTitle><DialogDescription>原始字段与已确认的记录关系。</DialogDescription></div><button ref={sourceClose} type="button" aria-label="关闭记录详情" onClick={() => setDetail(undefined)}><X size={16} /></button></header><div className="jsonl-inspector-scroll"><RecordDetails key={detailsRecord.line} record={detailsRecord} onNavigate={(line) => { setDetail(undefined); navigate(line); }} /><details className="jsonl-record-source"><summary>此行原始文本</summary><pre>{detailsRecord.raw}</pre></details></div></DialogContent></Dialog>}
  </div>;
}
