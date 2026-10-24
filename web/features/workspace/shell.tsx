"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Bot, ChevronLeft, ChevronRight, FileCode2, FolderMinus, FolderOpen, GitBranch, MoreHorizontal, PanelLeft, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { shortcutRegistry } from "@/lib/shortcuts";
import { useWebPreferences, webPreferences } from "@/lib/web-preferences";
import { SettingsDialog } from "@/features/settings/dialog";
import { useInstallationModels } from "@/features/settings/use-installation-models";
import type { InstallationModelCatalog } from "@/shared/installation-settings";
import type { ModelCatalog } from "@/shared/model-configuration";
import type { ProjectResource, RemoveProjectResult, SessionResource, SessionWorkspaceMode } from "@/shared/workspace-contract";
import { DraftStore } from "@/features/sessions/drafts";
import { SessionRows } from "@/features/sessions/collections";
import { SessionListStore, SessionListsProvider, useSessionList } from "@/features/sessions/session-lists";
import { SessionViewerHost } from "@/features/sessions/session-viewer-host";
import { ProjectPicker } from "./project-picker";
import { RemoveProjectDialog } from "./remove-project-dialog";
import { mutate, projectUrl, sessionUrl, useResource } from "./resources";
import { parseWorkspaceRoute, type WorkspaceRoute } from "./route";

interface WorkspaceContextValue {
  route: WorkspaceRoute; query: URLSearchParams; project?: ProjectResource; projects: ProjectResource[]; renderedAt: string;
  navigate(href: string, replace?: boolean): void; drafts: DraftStore; version: number; refresh(): void; refreshProject(projectId: string): void;
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
  const { preferences } = useWebPreferences();
  const route = useMemo(() => parseWorkspaceRoute(pathname), [pathname]);
  const query = useMemo(() => new URLSearchParams(search), [search]);
  const queryError = query.has("projectId") || query.has("sessionId") ? "资源标识只能出现在路径中" : query.getAll("q").length > 1 ? "重复的 q 参数" : undefined;
  const locationKey = `${pathname}?${search}`;
  const locationRef = useRef(locationKey); locationRef.current = locationKey;
  const routeRef = useRef(route); routeRef.current = route;
  const navigationCurrent = useCallback((source: string) => locationRef.current === source, []);
  const [version, setVersion] = useState(0);
  const [sessionLists] = useState(() => new SessionListStore());
  const renderedAt = useMemo(() => new Date().toISOString(), [route.projectId, version]);
  const [drafts] = useState(() => new DraftStore());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const compactSidebar = preferences.appearance.sidebarCollapsed && !mobileViewport;
  useEffect(() => {
    // Gate list demand until persisted preferences and the real viewport are known.
    const media = window.matchMedia?.("(max-width: 720px)");
    const update = () => { setMobileViewport(media?.matches ?? false); };
    update(); setSidebarReady(true);
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const creating = useRef(new Set<string>());
  const removing = useRef(new Set<string>());
  const hidden = useRef(new Set<string>());
  const [removingProject, setRemovingProject] = useState<ProjectResource>();
  const [pendingRemovals, setPendingRemovals] = useState<string[]>([]);
  const [error, setError] = useState<{ projectId: string; message: string }>();
  const operations = useRef(new Map<string, { operationId: string; workspaceMode: SessionWorkspaceMode }>());
  const registry = useResource<{ projects: ProjectResource[] }>("/api/projects", version);
  const current = useResource<{ project: ProjectResource }>(route.projectId ? `/api${projectUrl(route.projectId)}` : undefined, version);
  const modelCatalog = useInstallationModels(version);
  const project = current.data && current.data.project.id === route.projectId ? current.data.project : undefined;
  const projectError = current.error ?? (current.data && current.data.project.id !== route.projectId ? "返回的项目标识与 URL 不匹配" : undefined);
  const projects = registry.data?.projects ?? [];
  useEffect(() => { for (const item of registry.data?.projects ?? []) hidden.current.delete(item.id); }, [registry.data]);
  const refresh = useCallback(() => { sessionLists.invalidate(); setVersion((value) => value + 1); }, [sessionLists]);
  const refreshProject = useCallback((projectId: string) => { sessionLists.invalidate(projectId); setVersion((value) => value + 1); }, [sessionLists]);
  const openProjectPicker = useCallback(() => { setMobileSidebarOpen(false); setPickerOpen(true); }, []);
  const openSettings = useCallback(() => { setMobileSidebarOpen(false); setSettingsOpen(true); }, []);
  const createSession = useCallback(async (projectId: string) => {
    if (creating.current.has(projectId) || removing.current.has(projectId) || hidden.current.has(projectId)) return;
    creating.current.add(projectId);
    setPending((items) => [...items, projectId]);
    setError(undefined);
    const source = locationRef.current;
    const operation = operations.current.get(projectId) ?? { operationId: crypto.randomUUID(), workspaceMode: preferences.conversation.workspaceMode };
    operations.current.set(projectId, operation);
    try {
      const result = await mutate<{ projectId: string; sessionId: string; session: SessionResource; cancelled?: boolean }>(`/api${projectUrl(projectId)}/sessions`, operation);
      if (result.cancelled) return;
      if (result.projectId !== projectId || result.session.projectId !== projectId || result.sessionId !== result.session.id) throw new Error("创建返回的会话标识不匹配");
      operations.current.delete(projectId);
      setMobileSidebarOpen(false);
      if (!hidden.current.has(projectId) && !removing.current.has(projectId) && navigationCurrent(source)) navigate(sessionUrl(projectId, result.sessionId));
      return result.session;
    } catch (cause) {
      setError({ projectId, message: cause instanceof Error ? cause.message : String(cause) });
    } finally { refreshProject(projectId); creating.current.delete(projectId); setPending((items) => items.filter((id) => id !== projectId)); }
  }, [navigate, refreshProject, navigationCurrent, preferences.conversation.workspaceMode]);
  async function removeProject(projectId: string) {
    if (creating.current.has(projectId)) throw new Error("会话正在创建，请完成后重试移除。");
    if (removing.current.has(projectId)) return;
    removing.current.add(projectId); setPendingRemovals((items) => [...items, projectId]);
    try {
      const result = await mutate<RemoveProjectResult>(`/api${projectUrl(projectId)}/actions`, { type: "remove" });
      if (result.projectId !== projectId || !Array.isArray(result.projects) || result.projects.some((item) => item.id === projectId)) throw new Error("移除返回的项目标识不匹配");
      hidden.current.add(projectId);
      registry.replace({ projects: result.projects });
      setRemovingProject(undefined);
      if (routeRef.current.projectId === projectId) {
        setMobileSidebarOpen(false);
        navigate(result.projects.length ? `${projectUrl(result.projects[0].id)}/sessions` : "/projects");
      }
    } finally { refreshProject(projectId); removing.current.delete(projectId); setPendingRemovals((items) => items.filter((id) => id !== projectId)); }
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
  const context: WorkspaceContextValue = { route, query, project, projects, renderedAt, navigate, drafts, version, refresh, refreshProject, createSession, openProjectPicker, projectLoading: current.loading, projectError, modelCatalog: modelCatalog.data, modelsLoading: modelCatalog.loading, modelsError: modelCatalog.error, updateModelCatalog: modelCatalog.replace, navigationCurrent, locationKey };
  return <WorkspaceContext.Provider value={context}>
    <SessionListsProvider store={sessionLists} currentProjectId={route.projectId}>
    <SessionViewerHost route={route} pathname={pathname} query={query} navigate={navigate}>
    <main className={cn("workbench", mobileSidebarOpen && "sidebar-mobile-open")}>
      {mobileSidebarOpen && <button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className="sidebar">
        <div className="brand-row"><Navigation href="/projects" className="brand-home" label="KivA Agent 首页"><span className="brand-mark" aria-hidden="true" /><span className="brand-name">KivA Agent</span></Navigation><button type="button" className="sidebar-collapse-toggle" aria-label={preferences.appearance.sidebarCollapsed ? "展开左侧栏" : "收起左侧栏"} title={preferences.appearance.sidebarCollapsed ? "展开左侧栏" : "收起左侧栏"} aria-pressed={preferences.appearance.sidebarCollapsed} onClick={() => webPreferences.update("appearance", { sidebarCollapsed: !preferences.appearance.sidebarCollapsed })}><ChevronLeft className="sidebar-collapse-icon" size={16} strokeWidth={1.75} aria-hidden="true" /><ChevronRight className="sidebar-expand-icon" size={16} strokeWidth={1.75} aria-hidden="true" /></button><button className="mobile-sidebar-close" aria-label="关闭导航" onClick={() => setMobileSidebarOpen(false)}><X size={17} /></button></div>
        <nav className="nav-list" aria-label="工作区导航">
          {route.projectId && <><Navigation href={route.sessionId ? scoped : `${base}/sessions`} active={route.section === "sessions"} label="会话"><Bot size={16} /><span>会话</span></Navigation><Navigation href={`${scoped}/files`} active={route.section === "files"} label="文件"><FileCode2 size={16} /><span>文件</span></Navigation><Navigation href={`${scoped}/changes`} active={route.section === "changes"} label="代码变更"><GitBranch size={16} /><span>代码变更</span></Navigation><Navigation href={`${base}/archive`} active={route.section === "archive"} label="归档"><Archive size={16} /><span>归档</span></Navigation><Navigation href={`${base}/trash`} active={route.section === "trash"} label="回收站"><Trash2 size={16} /><span>回收站</span></Navigation></>}
        </nav>
        <SidebarProjects projects={projects} pending={pending} pendingRemovals={pendingRemovals} compact={compactSidebar} ready={sidebarReady} dialogOpen={Boolean(removingProject || pickerOpen || settingsOpen)} registryError={registry.error} onRemove={setRemovingProject} onAdd={openProjectPicker} />
        <div className="sidebar-footer"><button type="button" className="sidebar-settings" onClick={openSettings} aria-haspopup="dialog" aria-label="设置" title="设置"><Settings size={15} aria-hidden="true" /><span>设置</span></button></div>
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
    </SessionViewerHost>
    </SessionListsProvider>
  </WorkspaceContext.Provider>;
}

export function Navigation({ href, active, children, className, label }: { href: string; active?: boolean; children: ReactNode; className?: string; label?: string }) {
  const { navigate } = useWorkspace();
  return <a href={href} aria-label={label} title={label} aria-current={active ? "page" : undefined} className={cn(className ?? "nav-item", active && "active")} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(href); } }}>{children}</a>;
}

function ProjectBrowserSlot({ projectId, onMount }: { projectId: string; onMount(projectId: string, node: HTMLDivElement | null): void }) {
  const attach = useCallback((node: HTMLDivElement | null) => onMount(projectId, node), [projectId, onMount]);
  return <div className="project-browser-slot" data-project-id={projectId} ref={attach} />;
}

function SidebarProjects({ projects, pending, pendingRemovals, compact, ready, dialogOpen, registryError, onRemove, onAdd }: { projects: ProjectResource[]; pending: string[]; pendingRemovals: string[]; compact: boolean; ready: boolean; dialogOpen: boolean; registryError?: string; onRemove(project: ProjectResource): void; onAdd(): void }) {
  const { locationKey } = useWorkspace();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const suppressReturnFocus = useRef(false);
  const [slots, setSlots] = useState<ReadonlyMap<string, HTMLDivElement>>(() => new Map());
  const [interacting, setInteracting] = useState<ReadonlySet<string>>(() => new Set());
  const registerSlot = useCallback((projectId: string, node: HTMLDivElement | null) => {
    setSlots((current) => {
      if (node ? current.get(projectId) === node : !current.has(projectId)) return current;
      const next = new Map(current); if (node) next.set(projectId, node); else next.delete(projectId);
      return next;
    });
  }, []);
  const interaction = useCallback((projectId: string, active: boolean) => {
    setInteracting((current) => {
      if (current.has(projectId) === active) return current;
      const next = new Set(current); if (active) next.add(projectId); else next.delete(projectId);
      return next;
    });
  }, []);
  useEffect(() => { setOpen(false); }, [locationKey, compact]);
  return <Popover open={compact && open} modal={false} onOpenChange={(next, details) => {
    if (next && !compact) { details.cancel(); return; }
    const actionOpen = dialogOpen || interacting.size > 0;
    const target = details.event?.target;
    // Portal slots retain controllers outside Positioner's floating tree. Protect their
    // active action portals without treating an ordinary conversation press as inside.
    const actionPress = details.reason === "outside-press" && actionOpen && target && "closest" in target && typeof target.closest === "function" && target.closest('[data-slot="dropdown-menu-content"], [data-slot="dialog-content"], [data-slot="dialog-overlay"]');
    if (!next && (details.reason === "focus-out" || details.reason === "trigger-hover" && actionOpen || actionPress)) { details.cancel(); return; }
    suppressReturnFocus.current = details.reason === "trigger-hover" || details.reason === "outside-press";
    setOpen(next);
  }}>
    <div className="sidebar-project-heading"><span>项目</span><button aria-label="添加项目" title="打开本地项目" onClick={onAdd}><Plus size={14} /></button><PopoverTrigger ref={trigger} className="sidebar-project-browser-trigger" openOnHover={compact} delay={120} closeDelay={200} aria-label="项目与会话列表" title="项目与会话列表"><MoreHorizontal size={17} aria-hidden="true" /></PopoverTrigger></div>
    <PopoverContent className="project-browser-popover" side="right" align="start" sideOffset={10} initialFocus={false} finalFocus={() => suppressReturnFocus.current || typeof document !== "undefined" && document.querySelector('[aria-modal="true"]') ? false : trigger.current}>
      <div className="project-browser-heading"><PopoverTitle>项目</PopoverTitle><button type="button" className="project-popup-close" aria-label="关闭项目与会话列表" title="关闭项目与会话列表" onClick={() => { suppressReturnFocus.current = false; setOpen(false); }}><X size={14} /></button></div>
      <div className="project-browser-scroll">{projects.map((project) => <ProjectBrowserSlot key={project.id} projectId={project.id} onMount={registerSlot} />)}{!projects.length && !registryError && <p className="sidebar-summary">还没有项目，点击 + 添加。</p>}{registryError && <Alert variant="error" title="项目列表加载失败" className="sidebar-alert">{registryError}</Alert>}</div>
    </PopoverContent>
    <div className="project-groups">{projects.map((project) => <ProjectGroup key={project.id} project={project} pending={pending.includes(project.id)} removing={pendingRemovals.includes(project.id)} compact={compact} ready={ready} browserOpen={open} portalTarget={slots.get(project.id)} browserTrigger={trigger} onInteractionChange={interaction} onNavigate={() => setOpen(false)} onRemove={() => onRemove(project)} />)}{!compact && registryError && <Alert variant="error" title="项目列表加载失败" className="sidebar-alert">{registryError}</Alert>}</div>
  </Popover>;
}

function ProjectGroup({ project, pending, removing, onRemove, compact, ready, browserOpen, portalTarget, browserTrigger, onInteractionChange, onNavigate }: { project: ProjectResource; pending: boolean; removing: boolean; onRemove(): void; compact: boolean; ready: boolean; browserOpen: boolean; portalTarget?: HTMLDivElement; browserTrigger: React.RefObject<HTMLButtonElement | null>; onInteractionChange(projectId: string, active: boolean): void; onNavigate(): void }) {
  const { route, query: params, navigate, createSession } = useWorkspace();
  const [expanded, setExpanded] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rowInteracting, setRowInteracting] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const expandedTrigger = useRef<HTMLButtonElement>(null);
  const menuFocus = useRef<"trigger" | "search" | "dialog">("trigger");
  const input = useRef<HTMLInputElement>(null);
  const active = route.projectId === project.id;
  const collection = active && route.section === "archive" ? "archived" : active && route.section === "trash" ? "trash" : "active";
  const collectionResult = useSessionList(project.id, collection, ready && expanded && (!compact || browserOpen));
  const query = active ? params.get("q") ?? "" : "";
  const [filter, setFilter] = useState(query);
  const [popupFilter, setPopupFilter] = useState("");
  const visibleFilter = compact ? popupFilter : filter;
  useEffect(() => { setFilter(query); if (query) setSearchOpen(true); }, [query]);
  useEffect(() => { if (expanded && searchOpen && (compact || active && route.section === "sessions")) input.current?.focus(); }, [expanded, searchOpen, active, route.section]);
  useEffect(() => { setMenuOpen(false); }, [route.projectId, route.sessionId, route.section, compact, browserOpen]);
  useEffect(() => { onInteractionChange(project.id, menuOpen || rowInteracting); }, [project.id, menuOpen, rowInteracting, onInteractionChange]);
  useEffect(() => () => onInteractionChange(project.id, false), [project.id, onInteractionChange]);
  const list = collectionResult.data ?? [];
  const groupId = `project-sessions-${project.id}`;
  const focusProject = () => compact ? browserTrigger.current : expandedTrigger.current;
  function search() {
    if (compact) {
      const open = !expanded || !searchOpen;
      menuFocus.current = open ? "search" : "trigger";
      setMenuOpen(false); setExpanded(true); setSearchOpen(open);
      if (!open) { setPopupFilter(""); menuTrigger.current?.focus(); }
      return;
    }
    const open = !active || route.section !== "sessions" || !expanded || !searchOpen;
    menuFocus.current = open ? "search" : "trigger";
    setMenuOpen(false); setExpanded(true); setSearchOpen(open);
    if (!active || route.section !== "sessions") navigate(`${projectUrl(project.id)}/sessions`);
    if (!open) { setFilter(""); navigate(`${projectUrl(project.id)}/sessions`, true); menuTrigger.current?.focus(); }
  }
  useEffect(() => {
    if (compact || !searchOpen || !active) return;
    const timer = setTimeout(() => {
      if (filter === query) return;
      const params = new URLSearchParams(); if (filter) params.set("q", filter);
      navigate(`${projectUrl(project.id)}/sessions${params.size ? `?${params}` : ""}`, true);
    }, 200);
    return () => clearTimeout(timer);
  }, [compact, filter, query, searchOpen, active, project.id, navigate]);
  const actions = <>
    <button className="project-new-session" aria-label={`在 ${project.name} 中新建会话`} title={project.capability.state === "ready" ? `新建会话 · ${project.name}` : project.capability.message} disabled={pending || removing || project.capability.state !== "ready"} onClick={() => { setExpanded(true); setSearchOpen(false); setFilter(""); setPopupFilter(""); void createSession(project.id); }}><Plus size={13} /></button>
    <div className="project-menu-anchor">
      <DropdownMenu open={menuOpen} onOpenChange={(open) => { if (open) menuFocus.current = "trigger"; setMenuOpen(open); }}>
        <DropdownMenuTrigger ref={menuTrigger} className="project-more" aria-label={`项目操作 ${project.name}`} title="项目操作" disabled={removing}><MoreHorizontal size={13} /></DropdownMenuTrigger>
        <DropdownMenuContent className="project-actions-menu" align="end" aria-label={`项目操作 ${project.name}`} finalFocus={() => menuFocus.current === "dialog" ? false : menuFocus.current === "search" ? input.current ?? menuTrigger.current : menuTrigger.current ?? focusProject()}>
          <DropdownMenuItem aria-label={`搜索 ${project.name} 会话`} aria-expanded={expanded && searchOpen} aria-controls={groupId} onClick={search}><Search size={12} />搜索会话</DropdownMenuItem>
          <DropdownMenuItem disabled={pending || removing} onClick={() => { menuFocus.current = "dialog"; setMenuOpen(false); menuTrigger.current?.focus(); onRemove(); }}><FolderMinus size={12} />移除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </>;
  const searchField = searchOpen && <div className="session-search"><Search size={13} /><Input ref={input} aria-label={`搜索 ${project.name} 会话`} value={visibleFilter} onChange={(event) => compact ? setPopupFilter(event.target.value) : setFilter(event.target.value)} placeholder="搜索会话" /></div>;
  const renderGroup = (rows: ReactNode) => <>
    <div className="project-card" onClick={(event) => { if (event.target === event.currentTarget) setExpanded((value) => !value); }}>
      <button ref={expandedTrigger} className="project-toggle" aria-label={`${expanded ? "折叠" : "展开"}项目 ${project.name}`} aria-expanded={expanded} aria-controls={groupId} title={project.path} onClick={() => setExpanded((value) => !value)}><span className="project-icon"><FolderOpen size={16} /></span><span className="project-name">{project.name}</span></button>{actions}
    </div>
    {compact && collection !== "active" && <p className="project-popup-collection">{collection === "archived" ? "已归档" : "最近删除"}</p>}
    <div id={groupId} className="project-sessions" hidden={!expanded}>{searchField}{rows}</div>
  </>;
  return <div className="project-group">
    <SessionRows projectId={project.id} sessions={list.filter((session) => `${session.name} ${session.preview}`.toLowerCase().includes(visibleFilter.toLowerCase()))} loading={collectionResult.loading} refreshing={collectionResult.refreshing} error={collectionResult.error} fallbackFocus={focusProject} presentationKey={`${compact}:${browserOpen}`} onInteractionChange={setRowInteracting} onNavigate={onNavigate} renderRows={(rows) => compact ? portalTarget ? createPortal(<div className={cn("project-browser-group", active && "active")}>{renderGroup(rows)}</div>, portalTarget, project.id) : null : renderGroup(rows)} />
  </div>;
}

export function ResourceState({ error, children }: { error?: string; children?: ReactNode }) {
  return <div className="resource-state" role={error ? undefined : "status"}>{error ? <Alert variant="error" title="无法打开此资源">{error}</Alert> : children ?? "正在读取…"}</div>;
}
