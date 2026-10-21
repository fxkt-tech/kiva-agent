"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Bot, FileCode2, FolderMinus, FolderOpen, GitBranch, MoreHorizontal, PanelLeft, Plus, Search, Settings, SquareTerminal, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { shortcutRegistry } from "@/lib/shortcuts";
import { useWebPreferences } from "@/lib/web-preferences";
import { SettingsDialog } from "@/features/settings/dialog";
import { useInstallationModels } from "@/features/settings/use-installation-models";
import type { InstallationModelCatalog } from "@/shared/installation-settings";
import type { BootstrapData } from "@/shared/types";
import type { ModelCatalog } from "@/shared/model-configuration";
import type { ProjectResource, RemoveProjectResult, SessionResource } from "@/shared/workspace-contract";
import { DraftStore } from "@/features/sessions/drafts";
import { SessionRows, useCollections } from "@/features/sessions/collections";
import { ProjectPicker } from "./project-picker";
import { RemoveProjectDialog } from "./remove-project-dialog";
import { mutate, projectUrl, sessionUrl, useResource } from "./resources";
import { parseWorkspaceRoute, type WorkspaceRoute } from "./route";

interface WorkspaceContextValue {
  route: WorkspaceRoute; query: URLSearchParams; project?: ProjectResource; projects: ProjectResource[]; bootstrap?: BootstrapData;
  navigate(href: string, replace?: boolean): void; drafts: DraftStore; version: number; refresh(): void;
  createSession(projectId: string): Promise<SessionResource | undefined>; openProjectPicker(): void;
  projectLoading: boolean; projectError?: string;
  modelCatalog?: InstallationModelCatalog; modelsLoading: boolean; modelsError?: string; updateModelCatalog(data: ModelCatalog): void;
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
  // Theme and storage-event ownership must exist even on /projects with no composer.
  useWebPreferences();
  const route = useMemo(() => parseWorkspaceRoute(pathname), [pathname]);
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const queryError = query.has("projectId") || query.has("sessionId") ? "资源标识只能出现在路径中" : query.getAll("q").length > 1 ? "重复的 q 参数" : undefined;
  const locationKey = `${pathname}?${search}`;
  const locationRef = useRef(locationKey); locationRef.current = locationKey;
  const routeRef = useRef(route); routeRef.current = route;
  const navigationCurrent = useCallback((source: string) => locationRef.current === source, []);
  const [version, setVersion] = useState(0);
  const [drafts] = useState(() => new DraftStore());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const creating = useRef(new Set<string>());
  const removing = useRef(new Set<string>());
  const hidden = useRef(new Set<string>());
  const [removingProject, setRemovingProject] = useState<ProjectResource>();
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]);
  const [error, setError] = useState<{ projectId: string; message: string }>();
  const operations = useRef(new Map<string, string>());
  const registry = useResource<{ projects: ProjectResource[] }>("/api/projects", version);
  const current = useResource<{ project: ProjectResource; bootstrap?: BootstrapData }>(route.projectId ? `/api${projectUrl(route.projectId)}` : undefined, version);
  const modelCatalog = useInstallationModels(version);
  const project = current.data && current.data.project.id === route.projectId ? current.data.project : undefined;
  const projectError = current.error ?? (current.data && current.data.project.id !== route.projectId ? "返回的项目标识与 URL 不匹配" : undefined);
  const projects = registry.data?.projects ?? [];
  useEffect(() => { for (const item of registry.data?.projects ?? []) hidden.current.delete(item.id); }, [registry.data]);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const openProjectPicker = useCallback(() => { setMobileSidebarOpen(false); setPickerOpen(true); }, []);
  const openSettings = useCallback(() => { setMobileSidebarOpen(false); setSettingsOpen(true); }, []);
  const createSession = useCallback(async (projectId: string) => {
    if (creating.current.has(projectId) || removing.current.has(projectId) || hidden.current.has(projectId)) return;
    creating.current.add(projectId);
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
      if (!hidden.current.has(projectId) && !removing.current.has(projectId) && navigationCurrent(source)) navigate(sessionUrl(projectId, result.sessionId));
      return result.session;
    } catch (cause) {
      setError({ projectId, message: cause instanceof Error ? cause.message : String(cause) });
    } finally { creating.current.delete(projectId); setPending((items) => items.filter((id) => id !== projectId)); }
  }, [navigate, refresh, navigationCurrent]);
  async function removeProject(projectId: string) {
    if (creating.current.has(projectId)) throw new Error("会话正在创建，请完成后重试移除。");
    if (removing.current.has(projectId)) return;
    removing.current.add(projectId); setPendingRemovals((items) => [...items, projectId]);
    try {
      const result = await mutate<RemoveProjectResult>(`/api${projectUrl(projectId)}/actions`, { type: "remove" });
      if (result.projectId !== projectId || !Array.isArray(result.projects) || result.projects.some((item) => item.id === projectId)) throw new Error("移除返回的项目标识不匹配");
      hidden.current.add(projectId);
      registry.replace({ projects: result.projects });
      setRemovingProject(undefined); refresh();
      if (routeRef.current.projectId === projectId) {
        setMobileSidebarOpen(false);
        navigate(result.projects.length ? `${projectUrl(result.projects[0].id)}/sessions` : "/projects");
      }
    } finally { removing.current.delete(projectId); setPendingRemovals((items) => items.filter((id) => id !== projectId)); }
  }
  useEffect(() => {
    setMobileSidebarOpen(false);
    try { sessionStorage.setItem("kiva:last-route", `${pathname}${search ? `?${search}` : ""}`); } catch { /* Navigation still works if storage is unavailable. */ }
  }, [pathname, search]);
  useEffect(() => {
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && (typeof document === "undefined" || !document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]'))) setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => shortcutRegistry.attach(window), []);
  useEffect(() => shortcutRegistry.register("openSettings", { run: openSettings }), [openSettings]);
  useEffect(() => shortcutRegistry.register("newSession", { run: () => { if (route.projectId) void createSession(route.projectId); }, available: () => Boolean(route.projectId && project?.capability.state === "ready" && !removingProject && !pickerOpen && !settingsOpen && !creating.current.has(route.projectId) && !removing.current.has(route.projectId)) }), [route.projectId, project?.capability.state, removingProject, pickerOpen, settingsOpen, createSession]);
  const base = route.projectId ? projectUrl(route.projectId) : "/projects";
  const scoped = route.projectId && route.sessionId ? sessionUrl(route.projectId, route.sessionId) : base;
  const context: WorkspaceContextValue = { route, query, project, projects, bootstrap: current.data?.bootstrap, navigate, drafts, version, refresh, createSession, openProjectPicker, projectLoading: current.loading, projectError, modelCatalog: modelCatalog.data, modelsLoading: modelCatalog.loading, modelsError: modelCatalog.error, updateModelCatalog: modelCatalog.replace, navigationCurrent, locationKey };
  return <WorkspaceContext.Provider value={context}>
    <main className={cn("workbench", mobileSidebarOpen && "sidebar-mobile-open")}>
      {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><SquareTerminal size={21} strokeWidth={1.65} /></div><p className="brand-name"><Navigation href="/projects" className="brand-home">KivA Agent</Navigation></p><button className="mobile-sidebar-close" aria-label="关闭导航" onClick={() => setMobileSidebarOpen(false)}><X size={17} /></button></div>
        <nav className="nav-list" aria-label="工作区导航">
          {route.projectId && <><Navigation href={route.sessionId ? scoped : `${base}/sessions`} active={route.section === "sessions"}><Bot size={16} />会话</Navigation><Navigation href={`${scoped}/files`} active={route.section === "files"}><FileCode2 size={16} />文件</Navigation><Navigation href={`${scoped}/changes`} active={route.section === "changes"}><GitBranch size={16} />代码变更</Navigation><Navigation href={`${base}/archive`} active={route.section === "archive"}><Archive size={16} />归档</Navigation><Navigation href={`${base}/trash`} active={route.section === "trash"}><Trash2 size={16} />回收站</Navigation></>}
        </nav>
        <div className="sidebar-project-heading"><span>项目</span><button aria-label="添加项目" title="打开本地项目" onClick={openProjectPicker}><Plus size={14} /></button></div>
        <div className="project-groups">{projects.map((item) => <ProjectGroup key={item.id} project={item} pending={pending.includes(item.id)} removing={pendingRemovals.includes(item.id)} onRemove={() => setRemovingProject(item)} />)}{registry.error && <Alert variant="error" title="项目列表加载失败" className="sidebar-alert">{registry.error}</Alert>}</div>
        <div className="sidebar-footer"><button type="button" className="sidebar-settings" onClick={openSettings} aria-haspopup="dialog" aria-label="设置"><Settings size={15} aria-hidden="true" /><span>设置</span></button></div>
      </aside>
      <section className="conversation">
        <Button variant="ghost" size="icon" className="workspace-navigation-toggle" aria-label="打开导航" title="打开导航" aria-expanded={mobileSidebarOpen} onClick={() => setMobileSidebarOpen(true)}><PanelLeft size={17} /></Button>
        {error && error.projectId === route.projectId && <div className="workspace-feedback"><Alert variant="error" title="创建会话失败" onDismiss={() => setError(undefined)}>{error.message}</Alert></div>}
        {queryError ? <ResourceState error={queryError} /> : children}
      </section>
      {pickerOpen && <ProjectPicker onClose={() => setPickerOpen(false)} />}
      {removingProject && <RemoveProjectDialog key={removingProject.id} project={removingProject} onClose={() => setRemovingProject(undefined)} onConfirm={() => removeProject(removingProject.id)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} catalog={modelCatalog.data} modelsLoading={modelCatalog.loading} modelsError={modelCatalog.error} onCatalog={modelCatalog.replace} onReloadCatalog={modelCatalog.reload} />}
    </main>
  </WorkspaceContext.Provider>;
}

export function Navigation({ href, active, children, className }: { href: string; active?: boolean; children: ReactNode; className?: string }) {
  const { navigate } = useWorkspace();
  return <a href={href} className={cn(className ?? "nav-item", active && "active")} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(href); } }}>{children}</a>;
}

function ProjectGroup({ project, pending, removing, onRemove }: { project: ProjectResource; pending: boolean; removing: boolean; onRemove(): void }) {
  const { route, query: params, version, navigate, createSession } = useWorkspace();
  const [expanded, setExpanded] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const menuFocus = useRef<"trigger" | "search" | "dialog">("trigger");
  const input = useRef<HTMLInputElement>(null);
  const collections = useCollections(project.id, version);
  const active = route.projectId === project.id;
  const collection = active && route.section === "archive" ? "archived" : active && route.section === "trash" ? "trash" : "active";
  const query = active ? params.get("q") ?? "" : "";
  const [filter, setFilter] = useState(query);
  useEffect(() => { setFilter(query); if (query) setSearchOpen(true); }, [query]);
  useEffect(() => { if (expanded && searchOpen && active && route.section === "sessions") input.current?.focus(); }, [expanded, searchOpen, active, route.section]);
  useEffect(() => { setMenuOpen(false); }, [route.projectId, route.sessionId, route.section]);
  const list = collections.data?.[collection] ?? [];
  const groupId = `project-sessions-${project.id}`;
  function search() {
    const open = !active || route.section !== "sessions" || !expanded || !searchOpen;
    menuFocus.current = open ? "search" : "trigger";
    setMenuOpen(false);
    setExpanded(true); setSearchOpen(open);
    if (!active || route.section !== "sessions") navigate(`${projectUrl(project.id)}/sessions`);
    if (!open) { setFilter(""); navigate(`${projectUrl(project.id)}/sessions`, true); menuTrigger.current?.focus(); }
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
    <div className="project-card" onClick={(event) => { if (event.target === event.currentTarget) setExpanded((value) => !value); }}>
      <button className="project-toggle" aria-label={`${expanded ? "折叠" : "展开"}项目 ${project.name}`} aria-expanded={expanded} aria-controls={groupId} title={project.path} onClick={() => setExpanded((value) => !value)}><span className="project-icon"><FolderOpen size={16} /></span><span className="project-name">{project.name}</span></button>
      <button className="project-new-session" aria-label={`在 ${project.name} 中新建会话`} title={project.capability.state === "ready" ? `新建会话 · ${project.name}` : project.capability.message} disabled={pending || removing || project.capability.state !== "ready"} onClick={() => { setExpanded(true); setSearchOpen(false); setFilter(""); void createSession(project.id); }}><Plus size={13} /></button>
      <div className="project-menu-anchor">
        <DropdownMenu open={menuOpen} onOpenChange={(open) => { if (open) menuFocus.current = "trigger"; setMenuOpen(open); }}>
          <DropdownMenuTrigger ref={menuTrigger} className="project-more" aria-label={`项目操作 ${project.name}`} title="项目操作" disabled={removing}><MoreHorizontal size={13} /></DropdownMenuTrigger>
          <DropdownMenuContent className="project-actions-menu" align="end" aria-label={`项目操作 ${project.name}`} finalFocus={() => menuFocus.current === "dialog" ? false : menuFocus.current === "search" ? input.current ?? menuTrigger.current : menuTrigger.current}>
            <DropdownMenuItem aria-label={`搜索 ${project.name} 会话`} aria-expanded={expanded && searchOpen} aria-controls={groupId} onClick={search}><Search size={12} />搜索会话</DropdownMenuItem>
            <DropdownMenuItem disabled={pending || removing} onClick={() => { menuFocus.current = "dialog"; setMenuOpen(false); menuTrigger.current?.focus(); onRemove(); }}><FolderMinus size={12} />移除</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
    <div id={groupId} className="project-sessions" hidden={!expanded}>
      {searchOpen && <div className="session-search"><Search size={13} /><Input ref={input} aria-label={`搜索 ${project.name} 会话`} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索会话" /></div>}
      <SessionRows projectId={project.id} sessions={list.filter((session) => `${session.name} ${session.preview}`.toLowerCase().includes(filter.toLowerCase()))} loading={collections.loading} error={collections.error} />
    </div>
  </div>;
}

export function ResourceState({ error, children }: { error?: string; children?: ReactNode }) {
  return <div className="resource-state" role={error ? undefined : "status"}>{error ? <Alert variant="error" title="无法打开此资源">{error}</Alert> : children ?? "正在读取…"}</div>;
}
