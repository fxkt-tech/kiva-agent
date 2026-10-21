"use client";

import { useEffect, useState } from "react";
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

/** State carries its request key, so a changed URL never renders the previous response. */
export function useResource<T>(url: string | undefined, version = 0) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
  const key = url ?? "";
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void request<T>(url, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ key, data });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error.message : String(error) });
    });
    return () => controller.abort();
  }, [url, key, version]);
  return state.key === key ? { ...state, loading: !state.data && !state.error } : { loading: Boolean(url), data: undefined, error: undefined };
}
