"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ResourceTarget } from "@/shared/workspace-contract";

export function projectUrl(projectId: string) { return `/projects/${encodeURIComponent(projectId)}`; }
export function sessionUrl(projectId: string, sessionId: string) { return `${projectUrl(projectId)}/sessions/${encodeURIComponent(sessionId)}`; }
export function resourceApi(target: ResourceTarget) { return `/api${target.sessionId ? sessionUrl(target.projectId, target.sessionId) : projectUrl(target.projectId)}`; }

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : result.error?.message ?? result.message ?? "无法读取此资源");
  return result as T;
}

export function mutate<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

/** Keep same-resource data during refresh, while exposing whether this version is confirmed. */
export function useResource<T>(url: string | undefined, version = 0) {
  const [state, setState] = useState<{ key: string; version: number; data?: T; error?: string }>({ key: "", version });
  const key = url ?? "";
  const currentKey = useRef(key); currentKey.current = key;
  const currentVersion = useRef(version); currentVersion.current = version;
  const revision = useRef(0);
  const replace = useCallback((data: T) => { if (currentKey.current === key) { revision.current += 1; setState({ key, version: currentVersion.current, data }); } }, [key]);
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const requestRevision = ++revision.current;
    void request<T>(url, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted && revision.current === requestRevision) setState({ key, version, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && revision.current === requestRevision) setState({ key, version, error: error instanceof Error ? error.message : String(error) });
    });
    return () => controller.abort();
  }, [url, key, version]);
  const pending = state.version !== version;
  return state.key === key
    ? { ...state, loading: Boolean(url) && !state.data && (!state.error || pending), refreshing: Boolean(url) && Boolean(state.data) && pending, replace }
    : { loading: Boolean(url), refreshing: false, data: undefined, error: undefined, replace };
}
