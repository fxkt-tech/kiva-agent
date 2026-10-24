"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Grip, GripHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { RuntimeScope } from "@/shared/runtime-types";
import type { SessionArtifact } from "@/shared/session-artifacts";
import { ArtifactPreview } from "./artifact-preview";

export interface FloatingArtifactBox { x: number; y: number; width: number; height: number }
function viewport() { return { width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight }; }
export function clampFloatingArtifact(box: FloatingArtifactBox, size: { width: number; height: number }): FloatingArtifactBox {
  const availableWidth = Math.max(1, size.width - 16), availableHeight = Math.max(1, size.height - 16);
  const width = Math.max(Math.min(280, availableWidth), Math.min(box.width, availableWidth));
  const height = Math.max(Math.min(260, availableHeight), Math.min(box.height, availableHeight));
  return { width, height, x: Math.max(8, Math.min(box.x, size.width - width - 8)), y: Math.max(8, Math.min(box.y, size.height - height - 8)) };
}
export function initialFloatingArtifact(size: { width: number; height: number }): FloatingArtifactBox {
  return clampFloatingArtifact({ x: size.width - 576, y: 72, width: 560, height: Math.min(560, size.height - 96) }, size);
}

export function FloatingArtifact({ scope, artifact, returnFocus, onClose, onSource, onGeometry }: { scope: RuntimeScope; artifact: SessionArtifact; returnFocus: React.RefObject<HTMLButtonElement | null>; onClose(): void; onSource(href: string): void; onGeometry(box: FloatingArtifactBox): void }) {
  const [box, setBox] = useState(() => initialFloatingArtifact(viewport()));
  const [manipulating, setManipulating] = useState(false);
  const moveHandle = useRef<HTMLDivElement>(null);
  const navigatingToSource = useRef(false);
  const active = useRef<{ pointerId: number; target: HTMLElement; mode: "move" | "resize"; x: number; y: number; box: FloatingArtifactBox }>(undefined);
  const boxRef = useRef(box); boxRef.current = box;
  const helpId = useId();
  useEffect(() => { onGeometry(box); }, [box, onGeometry]);
  useEffect(() => {
    const resize = () => setBox((value) => clampFloatingArtifact(value, viewport()));
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("resize", resize);
      const gesture = active.current; active.current = undefined;
      if (gesture?.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId);
    };
  }, []);
  function finish(event: PointerEvent<HTMLElement>) {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    active.current = undefined;
    if (gesture.target.hasPointerCapture(event.pointerId)) gesture.target.releasePointerCapture(event.pointerId);
    setManipulating(false);
  }
  function gesture(mode: "move" | "resize") {
    return {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.button !== 0 || active.current) return;
        event.preventDefault(); event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        active.current = { pointerId: event.pointerId, target: event.currentTarget, mode, x: event.clientX, y: event.clientY, box: boxRef.current };
        setManipulating(true);
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const start = active.current;
        if (!start || start.pointerId !== event.pointerId) return;
        event.preventDefault();
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        setBox(clampFloatingArtifact(start.mode === "move" ? { ...start.box, x: start.box.x + dx, y: start.box.y + dy } : { ...start.box, width: start.box.width + dx, height: start.box.height + dy }, viewport()));
      },
      onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish,
      onKeyDown(event: KeyboardEvent<HTMLElement>) {
        const step = event.shiftKey ? 30 : 10;
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (event.key === "Home") { setBox(initialFloatingArtifact(viewport())); return; }
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        setBox((value) => clampFloatingArtifact(mode === "move" ? { ...value, x: value.x + dx, y: value.y + dy } : { ...value, width: value.width + dx, height: value.height + dy }, viewport()));
      },
    };
  }
  return <Dialog open modal={false} disablePointerDismissal onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="artifact-floating-preview" overlayClassName="artifact-floating-backdrop" showCloseButton={false} initialFocus={moveHandle} finalFocus={() => navigatingToSource.current ? false : returnFocus.current} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
      <p id={helpId} className="sr-only">拖动标题移动，拖动右下角调整大小。方向键微调，Shift 加速，Home 恢复初始位置与大小。</p>
      <ArtifactPreview key={artifact.id} scope={scope} artifact={artifact} onSource={(href) => { navigatingToSource.current = true; onSource(href); }} renderToolbar={({ controls, currentVersion }) => <div className="artifact-floating-toolbar">
        <div ref={moveHandle} className="artifact-floating-move" role="button" tabIndex={0} aria-label="移动气泡预览" aria-describedby={helpId} title={`${artifact.path} · 当前版本`} {...gesture("move")}><GripHorizontal size={13} aria-hidden="true"/><DialogTitle>{artifact.name}</DialogTitle></div>
        <DialogDescription className="sr-only">{artifact.path} · 当前版本</DialogDescription><span className="sr-only">{currentVersion}</span>
        {controls}
        <DialogClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label="关闭气泡预览" title="关闭预览"/>}><X size={15}/></DialogClose>
      </div>}/>
      {manipulating && <div className="artifact-floating-shield" aria-hidden="true"/>}
      <button type="button" className="artifact-floating-resize" aria-label="调整气泡预览大小" aria-describedby={helpId} title="拖动调整大小，或使用方向键" {...gesture("resize")}><Grip size={16} aria-hidden="true"/></button>
    </DialogContent>
  </Dialog>;
}
