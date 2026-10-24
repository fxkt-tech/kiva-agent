"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Code2, ExternalLink, LocateFixed, Maximize2, Minimize2, MoreHorizontal, Ratio, RefreshCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { mutate, resourceApi } from "@/features/workspace/resources";
import { isArtifactPreviewLease, type ArtifactPreviewLease, type SessionArtifact } from "@/shared/session-artifacts";
import type { RuntimeScope } from "@/shared/runtime-types";
import { sessionViewerHref } from "@/features/sessions/session-viewer-link";

export function artifactPreviewHref(scope: RuntimeScope, artifactId: string) {
  return `/artifact-preview/${encodeURIComponent(scope.projectId)}/${encodeURIComponent(scope.sessionId)}/${encodeURIComponent(artifactId)}`;
}
export function artifactApi(scope: RuntimeScope, artifactId?: string) {
  return `${resourceApi(scope)}/artifacts${artifactId ? `/${encodeURIComponent(artifactId)}` : ""}`;
}
function revoke(scope: RuntimeScope, leaseId: string) {
  void fetch(`${artifactApi(scope)}/previews/${encodeURIComponent(leaseId)}`, { method: "DELETE", keepalive: true }).catch(() => {});
}
function errorText(error: unknown) { return error instanceof Error ? error.message : String(error); }

/** Each mounted preview owns its lease. A late POST is revoked rather than leaking into another file. */
function usePreviewLease(scope: RuntimeScope, artifact: SessionArtifact, revision: number) {
  const key = `${scope.projectId}/${scope.sessionId}/${artifact.id}`;
  const [state, setState] = useState<{ key: string; revision: number; lease?: ArtifactPreviewLease; error?: string; fileVersion?: string }>({ key: "", revision: -1 });
  useEffect(() => {
    let disposed = false;
    let lease: ArtifactPreviewLease | undefined;
    const release = () => { if (lease) { revoke(scope, lease.leaseId); lease = undefined; } };
    if (artifact.availability !== "available") return;
    void mutate<unknown>(`${artifactApi(scope, artifact.id)}/preview`, {}).then((value) => {
      if (!isArtifactPreviewLease(value, scope, artifact.id)) throw new Error("预览返回的文件或会话标识不匹配");
      lease = value;
      if (disposed) { release(); return; }
      setState({ key, revision, lease: value, fileVersion: artifact.version });
    }).catch((error: unknown) => { if (!disposed) setState({ key, revision, error: errorText(error) }); });
    window.addEventListener?.("pagehide", release);
    return () => { disposed = true; window.removeEventListener?.("pagehide", release); release(); };
    // File updates are announced; explicit refresh alone restarts an interactive document.
  }, [key, revision, artifact.availability]);
  return state.key === key && state.revision === revision ? state : { lease: undefined, error: undefined, fileVersion: undefined };
}

export interface ArtifactPreviewToolbar { controls: ReactNode; currentVersion: ReactNode }

export function ArtifactPreview({ scope, artifact, onSource, renderToolbar }: { scope: RuntimeScope; artifact: SessionArtifact; onSource?(href: string): void; renderToolbar?(parts: ArtifactPreviewToolbar): ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [source, setSource] = useState(false);
  const [sourceState, setSourceState] = useState<{ revision: number; content?: string; error?: string }>();
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>();
  const [fullscreen, setFullscreen] = useState(false);
  const [displayError, setDisplayError] = useState<string>();
  const [expiredLease, setExpiredLease] = useState<string>();
  const container = useRef<HTMLDivElement>(null);
  const navigatingFromMenu = useRef(false);
  const result = usePreviewLease(scope, artifact, revision);
  const sourceEntry = artifact.sources.at(-1);
  const sourceHref = sourceEntry ? sessionViewerHref(scope.projectId, scope.sessionId, { target: sourceEntry.entryId }) : undefined;
  const updated = result.lease && artifact.version !== undefined && artifact.version !== result.fileVersion;
  const expired = result.lease && expiredLease === result.lease.leaseId;
  useEffect(() => {
    if (!result.lease) return;
    const lease = result.lease;
    const remaining = Date.parse(lease.expiresAt) - Date.now();
    const timer = setTimeout(() => setExpiredLease(lease.leaseId), Math.max(0, Math.min(remaining, 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [result.lease]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => { if (event.persisted) setRevision((value) => value + 1); };
    window.addEventListener?.("pageshow", restore);
    return () => window.removeEventListener?.("pageshow", restore);
  }, []);
  useEffect(() => {
    if (!source || artifact.kind !== "html" || artifact.availability !== "available") return;
    const controller = new AbortController();
    void fetch(`${artifactApi(scope, artifact.id)}/content`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) { const error = await response.json(); throw new Error(typeof error.error === "string" ? error.error : "无法读取源码"); }
      const content = await response.text();
      if (!controller.signal.aborted) setSourceState({ revision, content });
    }).catch((error: unknown) => { if (!controller.signal.aborted) setSourceState({ revision, error: errorText(error) }); });
    return () => controller.abort();
  }, [scope.projectId, scope.sessionId, artifact.id, artifact.kind, artifact.availability, revision, source]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener?.("fullscreenchange", changed);
    return () => document.removeEventListener?.("fullscreenchange", changed);
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === container.current) await document.exitFullscreen();
      else if (container.current?.requestFullscreen) await container.current.requestFullscreen();
      else throw new Error("此浏览器不支持全屏，请使用新标签页打开。");
      setDisplayError(undefined);
    } catch (error) { setDisplayError(errorText(error)); }
  }
  function refresh() { setRevision((value) => value + 1); setDisplayError(undefined); setDimensions(undefined); }
  const sourceAction = sourceHref ? <a className="artifact-source-link" href={sourceHref} aria-label="查看来源消息" title="查看来源消息" onClick={onSource ? (event) => { event.preventDefault(); onSource(sourceHref); } : undefined}><LocateFixed size={13} aria-hidden="true"/><span>查看来源消息</span></a> : null;
  const zoomOut = () => setZoom((value) => Math.max(0.25, (value === "fit" ? 1 : value) - 0.25));
  const zoomIn = () => setZoom((value) => Math.min(4, (value === "fit" ? 1 : value) + 0.25));
  const fitControl = <Button variant="ghost" size="sm" aria-label="适应" title="适应窗口" aria-pressed={zoom === "fit"} onClick={() => setZoom("fit")}><Scan size={13} aria-hidden="true"/><span className="artifact-control-label">适应</span></Button>;
  const sourceControl = <Button variant="ghost" size="sm" aria-label={source ? "页面" : "源码"} title={source ? "返回页面" : "查看源码"} aria-pressed={source} onClick={() => setSource((value) => !value)}><Code2 size={13} aria-hidden="true"/><span className="artifact-control-label">{source ? "页面" : "源码"}</span></Button>;
  const refreshControl = <Button variant="ghost" size="icon-sm" aria-label="刷新预览" title="刷新预览" onClick={refresh}><RefreshCw size={14}/></Button>;
  const controls = <div className="artifact-preview-actions">
    {renderToolbar ? <>
      {artifact.kind === "image" ? fitControl : sourceControl}{refreshControl}
      <DropdownMenu onOpenChange={(open) => { if (open) navigatingFromMenu.current = false; }}><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="更多预览操作" title="更多预览操作"/>}><MoreHorizontal size={15}/></DropdownMenuTrigger>
        <DropdownMenuContent align="end" portalContainer={fullscreen ? container : undefined} finalFocus={() => navigatingFromMenu.current ? false : true}>
          {artifact.kind === "image" && <><DropdownMenuItem onClick={() => setZoom(1)}><Ratio size={14}/>原尺寸</DropdownMenuItem><DropdownMenuItem onClick={zoomOut}><ZoomOut size={14}/>缩小图片</DropdownMenuItem><DropdownMenuItem onClick={zoomIn}><ZoomIn size={14}/>放大图片</DropdownMenuItem></>}
          {sourceHref && <DropdownMenuItem render={<a href={sourceHref}/>} nativeButton={false} onClick={onSource ? (event) => { event.preventDefault(); navigatingFromMenu.current = true; onSource(sourceHref); } : undefined}><LocateFixed size={14}/>查看来源消息</DropdownMenuItem>}
          <DropdownMenuItem render={<a href={artifactPreviewHref(scope, artifact.id)} target="_blank" rel="noopener noreferrer"/>} nativeButton={false}><ExternalLink size={14}/>在新标签页打开预览</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>} {fullscreen ? "退出全屏预览" : "全屏预览"}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </> : <>
      {artifact.kind === "image" && <>{fitControl}<Button variant="ghost" size="sm" aria-label="原尺寸" title="原尺寸" aria-pressed={zoom === 1} onClick={() => setZoom(1)}><Ratio size={13} aria-hidden="true"/><span className="artifact-control-label">原尺寸</span></Button><Button variant="ghost" size="icon-sm" aria-label="缩小图片" title="缩小" onClick={zoomOut}><ZoomOut size={14}/></Button><Button variant="ghost" size="icon-sm" aria-label="放大图片" title="放大" onClick={zoomIn}><ZoomIn size={14}/></Button></>}
      {artifact.kind === "html" && sourceControl}{refreshControl}
      <Button asChild variant="ghost" size="icon-sm"><a href={artifactPreviewHref(scope, artifact.id)} target="_blank" rel="noopener noreferrer" aria-label="在新标签页打开预览" title="新标签页打开"><ExternalLink size={14}/></a></Button>
      <Button variant="ghost" size="icon-sm" aria-label={fullscreen ? "退出全屏预览" : "全屏预览"} title={fullscreen ? "退出全屏" : "全屏"} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}</Button>
    </>}
  </div>;
  const currentVersion = <span className="artifact-current-version">当前版本</span>;
  return <div ref={container} className="artifact-preview" data-artifact-id={artifact.id}>
    {renderToolbar ? renderToolbar({ controls, currentVersion }) : <><div className="artifact-preview-toolbar">{currentVersion}{controls}</div>{sourceAction}</>}
    {expired && <Alert variant="warning" title="预览授权已过期" className="artifact-notice">页面状态已保留，刷新预览后可重新加载资源。</Alert>}
    {updated && <Alert variant="info" title="文件已更新" className="artifact-notice">当前预览保留交互状态，刷新后查看最新内容。</Alert>}
    {displayError && <Alert variant="warning" title="预览显示异常" className="artifact-notice">{displayError}</Alert>}
    {artifact.availability !== "available" ? <Alert variant="warning" title="文件暂不可预览" className="artifact-notice">{artifact.message ?? (artifact.availability === "missing" ? "文件已移动或删除。" : "会话工作区不可用。")}</Alert> : result.error ? <Alert variant="error" title="预览加载失败" className="artifact-notice">{result.error}<div className="alert-actions"><Button variant="outline" size="sm" onClick={refresh}>重试</Button></div></Alert> : !result.lease ? <p className="artifact-state" role="status">正在加载预览…</p> : <>
      {result.lease.warnings.length > 0 && <Alert variant="warning" title="部分资源不可用" className="artifact-notice">{result.lease.warnings.join("；")}</Alert>}
      <div className="artifact-rendered" hidden={source}>
        {artifact.kind === "html" ? <iframe key={result.lease.leaseId} title={`HTML 预览：${artifact.name}`} src={result.lease.url} sandbox="allow-scripts" referrerPolicy="no-referrer" onError={() => setDisplayError("页面无法加载，请刷新预览。外部资源及 API 需要允许跨域访问。")}/>
          : <div className={`artifact-image-viewport${zoom === "fit" ? " is-fit" : ""}`}><img key={result.lease.leaseId} src={result.lease.url} alt={artifact.name} referrerPolicy="no-referrer" style={zoom !== "fit" && dimensions ? { width: dimensions.width * zoom, height: dimensions.height * zoom } : undefined} onLoad={(event) => { setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setDisplayError(undefined); }} onError={() => setDisplayError("图片无法解码或预览已过期，请刷新后重试。")}/></div>}
      </div>
      {source && <div className="artifact-source">{sourceState?.revision !== revision ? <p className="artifact-state" role="status">正在读取源码…</p> : sourceState.error ? <Alert variant="error" title="源码读取失败" className="artifact-notice">{sourceState.error}</Alert> : <pre>{sourceState.content}</pre>}</div>}
      {artifact.kind === "html" && <p className="artifact-network-note">外部资源与 API 遵循目标网站的跨域规则。</p>}
    </>}
  </div>;
}
