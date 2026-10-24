"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ExternalLink, FileCode2, Image as ImageIcon, PanelTopClose, PanelTopOpen, PictureInPicture2, RefreshCw, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { OverlayLayer } from "@/components/ui/overlay-layer";
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useResource } from "@/features/workspace/resources";
import { isSessionArtifactList, type SessionArtifact, type SessionArtifactList } from "@/shared/session-artifacts";
import type { RuntimeScope } from "@/shared/runtime-types";
import { ArtifactPreview, artifactApi, artifactPreviewHref } from "./artifact-preview";
import { FloatingArtifact, type FloatingArtifactBox } from "./floating-artifact";

interface Opening { artifact: SessionArtifact; trigger: HTMLElement | null }

export function SessionArtifacts({ scope, refreshKey, onSource, children }: { scope: RuntimeScope; refreshKey: string; onSource(href: string): void; children?: ReactNode }) {
  const panelId = useId();
  const toggleButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const suppressListFocus = useRef(false);
  const [listOpen, setListOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<"all" | "image" | "html">("all");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<Opening>();
  const [floating, setFloating] = useState<SessionArtifact>();
  const [floatingBox, setFloatingBox] = useState<FloatingArtifactBox>();
  const [room, setRoom] = useState({ left: 0, width: 0 });
  const wantsData = listOpen || !!floating || !!opening;
  const result = useResource<SessionArtifactList>(wantsData ? artifactApi(scope) : undefined, revision);
  const validationError = result.data !== undefined && !isSessionArtifactList(result.data, scope) ? "输出列表所属会话或返回格式不匹配" : undefined;
  const data = validationError ? undefined : result.data;
  const error = result.error ?? validationError;
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const previousRefreshKey = useRef(refreshKey);
  useEffect(() => {
    const changed = previousRefreshKey.current !== refreshKey;
    previousRefreshKey.current = refreshKey;
    if (changed && wantsData) refreshTimer.current = setTimeout(() => setRevision((value) => value + 1), 180);
    return () => clearTimeout(refreshTimer.current);
  }, [refreshKey]);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds) setRoom((value) => value.left === bounds.left && value.width === bounds.width ? value : { left: bounds.left, width: bounds.width });
    };
    measure(); window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { window.removeEventListener("resize", measure); observer.disconnect(); };
  }, []);
  const reportGeometry = useCallback((box: FloatingArtifactBox) => setFloatingBox(box), []);
  const rightBubble = floating ? !floatingBox || floatingBox.x + floatingBox.width / 2 >= room.left + room.width / 2 : listOpen;
  const shift = rightBubble && room.width >= 1040 ? Math.max(0, Math.min(120, (room.width - 768) / 2 - 32)) : 0;
  const current = (artifact: SessionArtifact) => data?.artifacts.find((item) => item.id === artifact.id) ?? artifact;
  const artifacts = data?.artifacts.filter((artifact) => (filter === "all" || artifact.kind === filter) && artifact.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const source = (href: string) => { suppressListFocus.current = true; setOpening(undefined); setListOpen(false); setFloating(undefined); setFloatingBox(undefined); onSource(href); };
  const toggleLabel = listOpen ? "收起会话输出" : "打开会话输出";
  function openModal(artifact: SessionArtifact, trigger: HTMLElement) {
    setOpening({ artifact, trigger });
  }
  function openFloating(artifact: SessionArtifact) {
    suppressListFocus.current = true; setFloating(artifact); setListOpen(false);
  }
  return <div ref={workspace} className="conversation-workspace" style={{ "--artifact-reading-shift": `${shift}px` } as React.CSSProperties}>
    <div className="conversation-center">
      <OverlayLayer><Popover open={listOpen} modal={false} onOpenChange={(open, details) => {
        if (!open && (details.reason === "outside-press" || details.reason === "focus-out" || details.reason === "escape-key" && !!opening)) { details.cancel(); return; }
        if (open) { suppressListFocus.current = false; setRevision((value) => value + 1); }
        setListOpen(open);
      }}>
        <header className="conversation-header"><PopoverTrigger render={<Button ref={toggleButton} type="button" variant="ghost" size="icon" aria-label={toggleLabel} title={toggleLabel} aria-controls={panelId} aria-expanded={listOpen}/>}>{listOpen ? <PanelTopClose size={17} aria-hidden="true"/> : <PanelTopOpen size={17} aria-hidden="true"/>}</PopoverTrigger></header>
        <PopoverContent id={panelId} className="artifact-list-popover" align="end" sideOffset={6} finalFocus={() => suppressListFocus.current ? false : toggleButton.current}>
          <div className="artifact-list-heading"><PanelTopOpen size={15} aria-hidden="true"/><PopoverTitle>输出</PopoverTitle>{data && <span>{data.artifacts.length}</span>}<span className="artifact-list-heading-spacer"/><Button variant="ghost" size="icon-sm" aria-label="刷新会话输出" title="刷新输出列表" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14}/></Button></div>
          <PopoverDescription className="sr-only">本会话生成或引用的图片与 HTML；点击文件弹窗预览，也可新标签页打开或使用气泡预览。</PopoverDescription>
          <div className="artifact-list-controls">
            <div className="artifact-filters" role="group" aria-label="输出类型">{([["all", "全部"], ["image", "图片"], ["html", "HTML"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
            <Input type="search" aria-label="筛选会话输出" placeholder="筛选输出…" value={query} onChange={(event) => setQuery(event.target.value)}/>
          </div>
          <div className="artifact-list-scroll">
            {result.loading ? <p className="artifact-state" role="status">正在查找会话输出…</p> : error ? <Alert variant="error" title="会话输出加载失败" className="artifact-notice">{error}<div className="alert-actions"><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>重试</Button></div></Alert> : data ? <>
              {result.refreshing && <p className="artifact-refreshing" role="status">正在更新输出列表…</p>}
              {(!data.complete || data.warnings.length > 0) && <Alert variant="warning" title={data.complete ? "部分输出不可用" : "输出列表不完整"} className="artifact-notice">{data.warnings.join("；") || "历史记录未能完整读取，请刷新后重试。"}</Alert>}
              {artifacts.length ? <ul className="artifact-list">{artifacts.map((artifact) => <li key={artifact.id} className="artifact-list-row" data-artifact-path={artifact.path} data-selected={floating?.id === artifact.id || undefined}>
                <button className="artifact-file-button" type="button" aria-label={`预览 ${artifact.path}`} title={artifact.path} onClick={(event) => openModal(artifact, event.currentTarget)}>
                  {artifact.kind === "image" ? <ImageIcon size={17} aria-hidden="true"/> : <FileCode2 size={17} aria-hidden="true"/>}<span className="artifact-file-copy"><strong>{artifact.name}</strong>{artifact.path.lastIndexOf("/") > 0 && <span>{artifact.path.slice(0, artifact.path.lastIndexOf("/"))}</span>}</span>
                </button>
                <span className="artifact-relation" role="img" aria-label={artifact.relations.includes("inherited") ? "继承引用" : artifact.relations.includes("written") ? "生成 / 修改" : "引用"} title={artifact.relations.includes("inherited") ? "继承引用" : artifact.relations.includes("written") ? "生成 / 修改" : "引用"}><span aria-hidden="true">{artifact.relations.includes("inherited") ? "继" : artifact.relations.includes("written") ? "改" : "引"}</span></span>
                {artifact.availability !== "available" && <span className="artifact-unavailable" title={artifact.message}>{artifact.availability === "missing" ? "缺失" : "不可用"}</span>}
                <span className="artifact-row-actions"><Button asChild variant="ghost" size="icon-sm"><a href={artifactPreviewHref(scope, artifact.id)} target="_blank" rel="noopener noreferrer" aria-label={`在新标签页打开 ${artifact.path}`} title="新标签页打开"><ExternalLink size={13}/></a></Button><Button variant="ghost" size="icon-sm" aria-label={`气泡预览 ${artifact.path}`} title="气泡预览" onClick={() => openFloating(artifact)}><PictureInPicture2 size={13}/></Button></span>
              </li>)}</ul> : <p className="artifact-state">{data.artifacts.length ? "没有匹配的输出" : data.complete ? "此会话还没有图片或 HTML 输出" : "暂未识别到可列出的输出，请查看上方说明或重试"}</p>}
            </> : null}
          </div>
        </PopoverContent>
      </Popover></OverlayLayer>
      {children}
    </div>
    {floating && <FloatingArtifact scope={scope} artifact={current(floating)} returnFocus={toggleButton} onClose={() => { setFloating(undefined); setFloatingBox(undefined); }} onSource={source} onGeometry={reportGeometry}/>}
    {opening && <OverlayLayer><ArtifactDialog scope={scope} artifact={current(opening.artifact)} trigger={opening.trigger} fallback={toggleButton} onClose={() => setOpening(undefined)} onSource={source}/></OverlayLayer>}
  </div>;
}

function ArtifactDialog({ scope, artifact, trigger, fallback, onClose, onSource }: { scope: RuntimeScope; artifact: SessionArtifact; trigger: HTMLElement | null; fallback: React.RefObject<HTMLButtonElement | null>; onClose(): void; onSource(href: string): void }) {
  const close = useRef<HTMLButtonElement>(null);
  const navigatingToSource = useRef(false);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="artifact-preview-dialog" showCloseButton={false} initialFocus={close} finalFocus={() => navigatingToSource.current ? false : trigger?.isConnected ? trigger : fallback.current}>
    <ArtifactPreview scope={scope} artifact={artifact} onSource={(href) => { navigatingToSource.current = true; onSource(href); }} renderToolbar={({ controls, currentVersion }) => <header className="artifact-modal-toolbar">
      <div className="artifact-modal-heading" title={`${artifact.path} · 当前版本`}><DialogTitle>{artifact.name}</DialogTitle><DialogDescription className="sr-only">{artifact.path} · 当前版本</DialogDescription><span className="sr-only">{currentVersion}</span></div>
      {controls}<DialogClose render={<Button ref={close} type="button" variant="ghost" size="icon-sm" aria-label="关闭文件预览" title="关闭预览"/>}><X size={15}/></DialogClose>
    </header>}/>
  </DialogContent></Dialog>;
}
