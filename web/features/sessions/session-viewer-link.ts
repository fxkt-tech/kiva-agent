import { sessionUrl } from "@/features/workspace/resources";

export interface SessionViewerSelection { leaf?: string; target?: string; leafLine?: number; targetLine?: number }
export const SESSION_VIEWER_PARAMS = ["jsonl", "leaf", "target", "leafLine", "targetLine"] as const;

/** A link contains resource identity and source positions, never transcript text. */
export function parseSessionViewerLink(query: URLSearchParams): { open: boolean; selection: SessionViewerSelection; error?: string } {
  const selection: SessionViewerSelection = {};
  if (!SESSION_VIEWER_PARAMS.some((name) => query.has(name))) return { open: false, selection };
  for (const name of SESSION_VIEWER_PARAMS) if (query.getAll(name).length > 1) return { open: true, selection, error: `重复的 ${name} 参数` };
  if (query.get("jsonl") !== "1") return { open: true, selection, error: "JSONL 链接参数无效" };
  for (const name of ["leaf", "target"] as const) {
    const value = query.get(name);
    if (value !== null) {
      if (!value || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) return { open: true, selection, error: "JSONL 记录标识无效" };
      selection[name] = value;
    }
  }
  for (const name of ["leafLine", "targetLine"] as const) {
    const value = query.get(name);
    if (value !== null) {
      if (!/^[1-9]\d{0,9}$/u.test(value) || !Number.isSafeInteger(Number(value))) return { open: true, selection, error: "JSONL 行号无效" };
      selection[name] = Number(value);
    }
  }
  return { open: true, selection };
}

export function sessionViewerHref(projectId: string, sessionId: string, selection: SessionViewerSelection = {}): string {
  const query = new URLSearchParams({ jsonl: "1" });
  for (const name of ["leaf", "target", "leafLine", "targetLine"] as const) if (selection[name] !== undefined) query.set(name, String(selection[name]));
  return `${sessionUrl(projectId, sessionId)}?${query}`;
}

export function withoutSessionViewerQuery(pathname: string, query: URLSearchParams): string {
  const next = new URLSearchParams(query);
  for (const name of SESSION_VIEWER_PARAMS) next.delete(name);
  return `${pathname}${next.size ? `?${next}` : ""}`;
}
