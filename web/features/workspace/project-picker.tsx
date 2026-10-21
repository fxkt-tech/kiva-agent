"use client";

import { useEffect, useRef, useState } from "react";
import { Braces, ChevronDown, Folder, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectResource } from "@/shared/workspace-contract";
import { mutate, projectUrl, request } from "./resources";
import { useWorkspace } from "./shell";

interface Directory { path: string; parent: string | null; directories: Array<{ name: string; path: string }> }
export function ProjectPicker({ onClose }: { onClose(): void }) {
  const { project, projects, refresh, navigate, navigationCurrent, locationKey } = useWorkspace();
  const [path, setPath] = useState(project?.path ?? "");
  const [directory, setDirectory] = useState<Directory>();
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string>();
  const sequence = useRef(0);
  async function browse(nextPath: string) {
    const current = ++sequence.current;
    setLoading(true); setError(undefined);
    try {
      const result = await request<Directory>(`/api/project/directories${nextPath ? `?path=${encodeURIComponent(nextPath)}` : ""}`);
      if (current === sequence.current) { setDirectory(result); setPath(result.path); }
    } catch (cause) { if (current === sequence.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (current === sequence.current) setLoading(false); }
  }
  useEffect(() => { void browse(path); return () => { sequence.current += 1; }; }, []);
  async function open() {
    if (!directory) return;
    setOpening(true); setError(undefined);
    const source = locationKey;
    try {
      const result = await mutate<{ project: ProjectResource }>("/api/projects", { path: directory.path });
      if (!result.project.id) throw new Error("项目注册未返回标识");
      refresh(); onClose(); if (navigationCurrent(source)) navigate(`${projectUrl(result.project.id)}/sessions`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setOpening(false); }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title"><div className="project-dialog-heading"><div><p className="eyebrow">LOCAL WORKSPACE</p><h2 id="project-dialog-title">打开本地项目</h2></div><button aria-label="关闭项目选择器" onClick={onClose}><X size={16} /></button></div><p>浏览运行 Kiva 的这台电脑，选择项目目录。</p><form className="project-location" onSubmit={(event) => { event.preventDefault(); void browse(path); }}><input autoFocus value={path} onChange={(event) => setPath(event.target.value)} placeholder="/path/to/project" spellCheck={false} /><Button type="submit" variant="ghost" disabled={loading || !path.trim()}>转到</Button></form>{error && <div className="project-dialog-error" role="alert">{error}</div>}<div className="directory-browser"><div className="directory-browser-header"><button disabled={!directory?.parent || loading} onClick={() => directory?.parent && void browse(directory.parent)} aria-label="上级目录">↑</button><span title={directory?.path}>{directory?.path ?? "正在读取目录…"}</span></div><div className="directory-list">{loading ? <p>正在读取目录…</p> : directory?.directories.length ? directory.directories.map((entry) => <button key={entry.path} onClick={() => void browse(entry.path)}><Folder size={15} /><span>{entry.name}</span><ChevronDown size={13} /></button>) : <p>这个目录中没有子目录</p>}</div></div><div className="project-dialog-actions"><span>选择：{directory?.path ?? path}</span><Button disabled={opening || loading || !directory?.path} onClick={() => void open()}>{opening ? "正在打开…" : "使用此文件夹"}</Button></div><div className="recent-projects"><span>已注册项目</span>{projects.map((item) => <button key={item.id} disabled={opening} onClick={() => void browse(item.path)}><Braces size={14} /><div><strong>{item.name}</strong><small>{item.path}</small></div>{item.id === project?.id && <em>当前</em>}</button>)}</div></section></div>;
}
