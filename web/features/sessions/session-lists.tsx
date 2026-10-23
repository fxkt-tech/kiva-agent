"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { SessionCollection, SessionListItem, SessionListResponse } from "@/shared/workspace-contract";
import { projectUrl, request } from "@/features/workspace/resources";

export interface SessionListState { data?: SessionListItem[]; error?: string; loading: boolean; refreshing: boolean }
type ListLoader = (projectId: string, collection: SessionCollection, signal: AbortSignal) => Promise<SessionListResponse>;
interface Job { entry: Entry; generation: number; controller: AbortController }
interface Entry {
  projectId: string; collection: SessionCollection; listeners: Set<() => void>; state: SessionListState;
  confirmed: number; failed: number; job?: Job;
}
const idle: SessionListState = { loading: false, refreshing: false };

/** This owner is limited to session lists. Confirmed data lives until project/global invalidation. */
export class SessionListStore {
  private entries = new Map<string, Entry>();
  private generations = new Map<string, number>();
  private running = new Set<Job>();
  private scheduled = false;
  private currentProjectId?: string;

  constructor(private readonly load: ListLoader = (projectId, collection, signal) => request<SessionListResponse>(`/api${projectUrl(projectId)}/sessions?collection=${collection}`, { signal }), private readonly backgroundLimit = 2) {}

  setCurrentProject(projectId: string | undefined) { this.currentProjectId = projectId; this.schedule(); }

  private entry(projectId: string, collection: SessionCollection): Entry {
    const key = `${projectId}/${collection}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { projectId, collection, listeners: new Set(), state: { loading: true, refreshing: false }, confirmed: -1, failed: -1 };
      this.entries.set(key, entry);
    }
    return entry;
  }
  snapshot(projectId: string, collection: SessionCollection) { return this.entry(projectId, collection).state; }
  private generation(entry: Entry) { return this.generations.get(entry.projectId) ?? 0; }
  private emit(entry: Entry, state: SessionListState) { entry.state = state; for (const listener of entry.listeners) listener(); }

  subscribe(projectId: string, collection: SessionCollection, listener: () => void) {
    const entry = this.entry(projectId, collection);
    if (!entry.listeners.size) entry.failed = -1;
    entry.listeners.add(listener);
    this.schedule();
    return () => {
      entry.listeners.delete(listener);
      if (!entry.listeners.size && entry.job) this.cancel(entry);
    };
  }

  /** Omitted project means an explicit global list refresh, not every shell version change. */
  invalidate(projectId?: string) {
    const projects = projectId === undefined ? new Set([...this.entries.values()].map((entry) => entry.projectId)) : new Set([projectId]);
    for (const id of projects) this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    for (const entry of this.entries.values()) if (projects.has(entry.projectId)) {
      this.cancel(entry);
      entry.failed = -1;
      this.emit(entry, { data: entry.state.data, loading: !entry.state.data, refreshing: Boolean(entry.state.data) });
    }
    this.schedule();
  }

  private cancel(entry: Entry) {
    const job = entry.job;
    if (!job) return;
    entry.job = undefined;
    this.running.delete(job);
    job.controller.abort();
    this.schedule();
  }
  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.drain(); });
  }
  private drain() {
    const queued = [...this.entries.values()].filter((entry) => entry.listeners.size && !entry.job && entry.confirmed !== this.generation(entry) && entry.failed !== this.generation(entry));
    queued.sort((left, right) => Number(right.projectId === this.currentProjectId) - Number(left.projectId === this.currentProjectId));
    for (const entry of queued) {
      if (entry.projectId !== this.currentProjectId && [...this.running].filter((job) => job.entry.projectId !== this.currentProjectId).length >= this.backgroundLimit) continue;
      this.start(entry);
    }
  }
  private start(entry: Entry) {
    const job: Job = { entry, generation: this.generation(entry), controller: new AbortController() };
    entry.job = job; this.running.add(job);
    this.emit(entry, { data: entry.state.data, loading: !entry.state.data, refreshing: Boolean(entry.state.data) });
    void Promise.resolve().then(() => this.load(entry.projectId, entry.collection, job.controller.signal)).then((result) => {
      if (entry.job !== job || job.generation !== this.generation(entry)) return;
      if (result.collection !== entry.collection || !Array.isArray(result.sessions) || result.sessions.some((session) => session.projectId !== entry.projectId || session.collection !== entry.collection)) throw new Error("返回的会话列表标识与请求不匹配");
      entry.confirmed = job.generation;
      this.emit(entry, { data: result.sessions, loading: false, refreshing: false });
    }).catch((cause: unknown) => {
      if (entry.job !== job || job.generation !== this.generation(entry)) return;
      entry.failed = job.generation;
      this.emit(entry, { data: entry.state.data, error: cause instanceof Error ? cause.message : String(cause), loading: false, refreshing: false });
    }).finally(() => {
      this.running.delete(job);
      if (entry.job === job) entry.job = undefined;
      this.schedule();
    });
  }
}

const SessionListsContext = createContext<SessionListStore | undefined>(undefined);
export function SessionListsProvider({ store, currentProjectId, children }: { store: SessionListStore; currentProjectId?: string; children: ReactNode }) {
  useEffect(() => { store.setCurrentProject(currentProjectId); }, [store, currentProjectId]);
  return <SessionListsContext.Provider value={store}>{children}</SessionListsContext.Provider>;
}
export function useSessionList(projectId: string, collection: SessionCollection, enabled = true) {
  const store = useContext(SessionListsContext);
  if (!store) throw new Error("Session list owner is missing");
  const subscribe = useCallback((listener: () => void) => enabled ? store.subscribe(projectId, collection, listener) : () => {}, [store, projectId, collection, enabled]);
  const snapshot = useCallback(() => enabled ? store.snapshot(projectId, collection) : idle, [store, projectId, collection, enabled]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
