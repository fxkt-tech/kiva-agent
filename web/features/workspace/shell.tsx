"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Bot, ChevronDown, FileCode2, FolderOpen, GitBranch, PanelLeft, PanelRightClose, Plus, Search, SquareTerminal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BootstrapData } from "@/shared/types";
import type { ProjectResource, SessionResource } from "@/shared/workspace-contract";
import { DraftStore } from "@/features/sessions/drafts";
import { SessionRows, useCollections } from "@/features/sessions/collections";
import { ProjectPicker } from "./project-picker";
import { mutate, projectUrl, sessionUrl, useResource } from "./resources";
import { parseWorkspaceRoute, type WorkspaceRoute } from "./route";

interface WorkspaceContextValue {
  route: WorkspaceRoute; query: URLSearchParams; project?: ProjectResource; projects: ProjectResource[]; bootstrap?: BootstrapData;
  navigate(href: string, replace?: boolean): void; drafts: DraftStore; version: number; refresh(): void;
  createSession(projectId: string): Promise<SessionResource | undefined>; openProjectPicker(): void;
  projectLoading: boolean; projectError?: string;
  navigationCurrent(source: string): boolean; locationKey: string;
}
const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace shell is missing");
  return value;
}

export function RoutedWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const query = useSearchParams().toString();
  const navigate = useCallback((href: string, replace = false) => replace ? router.replace(href) : router.push(href), [router]);
  return <WorkspaceShell pathname={pathname} search={query} navigate={navigate}>{children}</WorkspaceShell>;
}

export function WorkspaceShell({ children, pathname, search = "", navigate }: { children: ReactNode; pathname: string; search?: string; navigate(href: string, replace?: boolean): void }) {
  const route = useMemo(() => parseWorkspaceRoute(pathname), [pathname]);
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const queryError = query.has("projectId") || query.has("sessionId") ? "资源标识只能出现在路径中" : query.getAll("q").length > 1 ? "重复的 q 参数" : undefined;
  const locationKey = `${pathname}?${search}`;
  const locationRef = useRef(locationKey); locationRef.current = locationKey;
  const navigationCurrent = useCallback((source: string) => locationRef.current === source, []);
  const [version, setVersion] = useState(0);
  const [drafts] = useState(() => new DraftStore());
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<{ projectId: string; message: string }>();
  const operations = useRef(new Map<string, string>());
  const registry = useResource<{ projects: ProjectResource[] }>("/api/projects", version);
  const current = useResource<{ project: ProjectResource; bootstrap?: BootstrapData }>(route.projectId ? `/api${projectUrl(route.projectId)}` : undefined, version);
  const project = current.data && current.data.project.id === route.projectId ? current.data.project : undefined;
  const projectError = current.error ?? (current.data && current.data.project.id !== route.projectId ? "返回的项目标识与 URL 不匹配" : undefined);
  const projects = registry.data?.projects ?? [];
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const openProjectPicker = useCallback(() => { setMobileSidebarOpen(false); setPickerOpen(true); }, []);
  const createSession = useCallback(async (projectId: string) => {
    if (pending.includes(projectId)) return;
    setPending((items) => [...items, projectId]);
    setError(undefined);
    const source = locationRef.current;
    const operationId = operations.current.get(projectId) ?? crypto.randomUUID();
    operations.current.set(projectId, operationId);
    try {
      const result = await mutate<{ projectId: string; sessionId: string; session: SessionResource; cancelled?: boolean }>(`/api${projectUrl(projectId)}/sessions`, { operationId });
      if (result.cancelled) return;
      if (result.projectId !== projectId || result.session.projectId !== projectId || result.sessionId !== result.session.id) throw new Error("创建返回的会话标识不匹配");
      operations.current.delete(projectId);
      refresh();
      setMobileSidebarOpen(false);
      if (navigationCurrent(source)) navigate(sessionUrl(projectId, result.sessionId));
      return result.session;
    } catch (cause) {
      setError({ projectId, message: cause instanceof Error ? cause.message : String(cause) });
    } finally { setPending((items) => items.filter((id) => id !== projectId)); }
  }, [pending, navigate, refresh, navigationCurrent]);
  useEffect(() => {
    setMobileSidebarOpen(false);
    try { sessionStorage.setItem("kiva:last-route", `${pathname}${search ? `?${search}` : ""}`); } catch { /* Navigation still works if storage is unavailable. */ }
  }, [pathname, search]);
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setPickerOpen(false); setInspectorOpen(false); setMobileSidebarOpen(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n" && route.projectId) { event.preventDefault(); void createSession(route.projectId); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [route.projectId, createSession]);
  const base = route.projectId ? projectUrl(route.projectId) : "/projects";
  const scoped = route.projectId && route.sessionId ? sessionUrl(route.projectId, route.sessionId) : base;
  const context: WorkspaceContextValue = { route, query, project, projects, bootstrap: current.data?.bootstrap, navigate, drafts, version, refresh, createSession, openProjectPicker, projectLoading: current.loading, projectError, navigationCurrent, locationKey };
  return <WorkspaceContext.Provider value={context}>
    <main className={cn("workbench", !inspectorOpen && "inspector-closed", mobileSidebarOpen && "sidebar-mobile-open")}>
      {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><SquareTerminal size={21} strokeWidth={1.65} /></div><p className="brand-name"><Navigation href="/projects" className="brand-home">KivA Agent</Navigation></p><button className="mobile-sidebar-close" aria-label="关闭导航" onClick={() => setMobileSidebarOpen(false)}><X size={17} /></button></div>
        <nav className="nav-list" aria-label="工作区导航">
          {route.projectId && <><Navigation href={route.sessionId ? scoped : `${base}/sessions`} active={route.section === "sessions"}><Bot size={16} />会话</Navigation><Navigation href={`${scoped}/files`} active={route.section === "files"}><FileCode2 size={16} />文件</Navigation><Navigation href={`${scoped}/changes`} active={route.section === "changes"}><GitBranch size={16} />代码变更</Navigation><Navigation href={`${base}/archive`} active={route.section === "archive"}><Archive size={16} />归档</Navigation><Navigation href={`${base}/trash`} active={route.section === "trash"}><Trash2 size={16} />回收站</Navigation></>}
        </nav>
        <div className="sidebar-project-heading"><span>项目</span><button aria-label="添加项目" title="打开本地项目" onClick={openProjectPicker}><Plus size={14} /></button></div>
        <div className="project-groups">{projects.map((item) => <ProjectGroup key={item.id} project={item} pending={pending.includes(item.id)} />)}{registry.error && <p className="resource-error">{registry.error}</p>}</div>
        <div className="sidebar-footer"><div className="runtime-line"><span className={cn("status-dot", registry.error && "offline")} />{registry.error ? "连接异常" : "本地工作区"}<span className="ml-auto">Pi {current.data?.bootstrap?.runtime.piVersion ?? "1.3.0"}</span></div></div>
      </aside>
      <section className="conversation">
        <header className="conversation-header"><Button variant="ghost" size="icon" className="mobile-sidebar-toggle" aria-label="打开导航" title="打开导航" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><PanelLeft size={17} /></Button><Button variant="ghost" size="icon" aria-label="切换右侧栏" aria-expanded={inspectorOpen} aria-controls="workspace-panel" onClick={() => setInspectorOpen((value) => !value)}><PanelRightClose size={17} /></Button></header>
        {error?.projectId === route.projectId && <div className="workspace-feedback" role="alert">{error?.message}</div>}
        {queryError ? <ResourceState error={queryError} /> : children}
      </section>
      {inspectorOpen && <aside id="workspace-panel" className="inspector" aria-label="右侧扩展面板" />}
      {pickerOpen && <ProjectPicker onClose={() => setPickerOpen(false)} />}
    </main>
  </WorkspaceContext.Provider>;
}

export function Navigation({ href, active, children, className }: { href: string; active?: boolean; children: ReactNode; className?: string }) {
  const { navigate } = useWorkspace();
  return <a href={href} className={cn(className ?? "nav-item", active && "active")} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(href); } }}>{children}</a>;
}

function ProjectGroup({ project, pending }: { project: ProjectResource; pending: boolean }) {
  const { route, query: params, version, navigate, createSession } = useWorkspace();
  const [expanded, setExpanded] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const collections = useCollections(project.id, version);
  const active = route.projectId === project.id;
  const collection = active && route.section === "archive" ? "archived" : active && route.section === "trash" ? "trash" : "active";
  const query = active ? params.get("q") ?? "" : "";
  const [filter, setFilter] = useState(query);
  useEffect(() => { setFilter(query); if (query) setSearchOpen(true); }, [query]);
  useEffect(() => { if (expanded && searchOpen) input.current?.focus(); }, [expanded, searchOpen]);
  const list = collections.data?.[collection] ?? [];
  const groupId = `project-sessions-${project.id}`;
  function search() {
    const open = !expanded || !searchOpen;
    setExpanded(true); setSearchOpen(open);
    if (!active || route.section !== "sessions") navigate(`${projectUrl(project.id)}/sessions`);
    if (!open) { setFilter(""); navigate(`${projectUrl(project.id)}/sessions`, true); }
  }
  useEffect(() => {
    if (!searchOpen || !active) return;
    const timer = setTimeout(() => {
      if (filter === query) return;
      const params = new URLSearchParams(); if (filter) params.set("q", filter);
      navigate(`${projectUrl(project.id)}/sessions${params.size ? `?${params}` : ""}`, true);
    }, 200);
    return () => clearTimeout(timer);
  }, [filter, query, searchOpen, active, project.id, navigate]);
  return <div className="project-group">
    <div className="project-card"><button className="project-toggle" aria-label={`${expanded ? "折叠" : "展开"}项目 ${project.name}`} aria-expanded={expanded} aria-controls={groupId} title={project.path} onClick={() => setExpanded((value) => !value)}><span className="project-icon"><FolderOpen size={16} /></span><span className="project-name">{project.name}</span></button><button className="project-new-session" aria-label={`在 ${project.name} 中新建会话`} title={project.capability.state === "ready" ? `新建会话 · ${project.name}` : project.capability.message} disabled={pending || project.capability.state !== "ready"} onClick={() => { setExpanded(true); setSearchOpen(false); setFilter(""); void createSession(project.id); }}><Plus size={13} /></button><button className="project-search" aria-label={`搜索 ${project.name} 会话`} title="搜索项目会话" aria-expanded={expanded && searchOpen} aria-controls={groupId} onClick={search}><Search size={13} /></button><button className="project-collapse" aria-label={expanded ? "折叠项目" : "展开项目"} aria-expanded={expanded} aria-controls={groupId} onClick={() => setExpanded((value) => !value)}><ChevronDown size={13} /></button></div>
    <div id={groupId} className="project-sessions" hidden={!expanded}>
      {searchOpen && <div className="session-search"><Search size={13} /><input ref={input} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索会话" /></div>}
      <SessionRows projectId={project.id} sessions={list.filter((session) => `${session.name} ${session.preview}`.toLowerCase().includes(filter.toLowerCase()))} loading={collections.loading} error={collections.error} />
    </div>
  </div>;
}

export function ResourceState({ error, children }: { error?: string; children?: ReactNode }) {
  return <div className={cn("resource-state", error && "resource-error")} role={error ? "alert" : "status"}>{error ?? children ?? "正在读取…"}</div>;
}
