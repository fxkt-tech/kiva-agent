"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ProjectResource } from "@/shared/workspace-contract";

export function RemoveProjectDialog({ project, onClose, onConfirm }: { project: ProjectResource; onClose(): void; onConfirm(): Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const previous = typeof document === "undefined" ? null : document.activeElement;
    cancel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!pendingRef.current) closeRef.current(); }
      if (event.key !== "Tab" || !dialog.current || typeof document === "undefined") return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']"));
      if (!controls.length) { event.preventDefault(); dialog.current.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      mounted.current = false;
      window.removeEventListener("keydown", keydown);
      if (typeof HTMLElement !== "undefined" && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  async function confirm() {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(undefined);
    try { await onConfirm(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pendingRef.current = false; if (mounted.current) setPending(false); }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRef.current) onClose(); }}>
    <section ref={dialog} className="project-dialog remove-project-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-project-title" aria-describedby="remove-project-description" aria-busy={pending} tabIndex={-1}>
      <div className="project-dialog-heading"><h2 id="remove-project-title">移除项目</h2><button aria-label="取消移除项目" disabled={pending} onClick={onClose}><X size={16} /></button></div>
      <div className="project-removal-details"><strong>{project.name}</strong><code>{project.path}</code></div>
      <p id="remove-project-description">仅从项目列表中隐藏。项目文件、会话历史、工作区和配置不会被删除，正在运行的任务会继续。之后重新导入同一目录即可恢复显示。</p>
      {error && <Alert variant="error" title="无法移除项目" className="dialog-alert">{error}</Alert>}
      <div className="project-dialog-actions"><Button ref={cancel} variant="ghost" disabled={pending} onClick={onClose}>取消</Button><Button disabled={pending} onClick={() => void confirm()}>{pending ? "正在移除…" : error ? "重试移除" : "移除项目"}</Button></div>
    </section>
  </div>;
}
