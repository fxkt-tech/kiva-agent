"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ProjectResource } from "@/shared/workspace-contract";

export function RemoveProjectDialog({ project, onClose, onConfirm }: { project: ProjectResource; onClose(): void; onConfirm(): Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const cancel = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  async function confirm() {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(undefined);
    try { await onConfirm(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { pendingRef.current = false; if (mounted.current) setPending(false); }
  }
  return <Dialog open onOpenChange={(next) => { if (!next && !pendingRef.current) onClose(); }}>
    <DialogContent className="project-dialog remove-project-dialog" initialFocus={cancel} showCloseButton={false} aria-busy={pending}>
      <div className="project-dialog-heading"><DialogTitle>移除项目</DialogTitle><button aria-label="取消移除项目" disabled={pending} onClick={onClose}><X size={16} /></button></div>
      <div className="project-removal-details"><strong>{project.name}</strong><code>{project.path}</code></div>
      <DialogDescription>仅从项目列表中隐藏。项目文件、会话历史、工作区和配置不会被删除，正在运行的任务会继续。之后重新导入同一目录即可恢复显示。</DialogDescription>
      {error && <Alert variant="error" title="无法移除项目" className="dialog-alert">{error}</Alert>}
      <div className="project-dialog-actions"><Button ref={cancel} variant="ghost" disabled={pending} onClick={onClose}>取消</Button><Button disabled={pending} onClick={() => void confirm()}>{pending ? "正在移除…" : error ? "重试移除" : "移除项目"}</Button></div>
    </DialogContent>
  </Dialog>;
}
