export interface WorkspaceRoute { projectId?: string; sessionId?: string; section: "projects" | "sessions" | "files" | "changes" | "archive" | "trash" }

export function parseWorkspaceRoute(pathname: string): WorkspaceRoute {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "projects" || !parts[1]) return { section: "projects" };
  const projectId = decodeURIComponent(parts[1]);
  if (parts[2] === "sessions" && parts[3]) return { projectId, sessionId: decodeURIComponent(parts[3]), section: parts[4] === "files" || parts[4] === "changes" ? parts[4] : "sessions" };
  return { projectId, section: ["files", "changes", "archive", "trash"].includes(parts[2] ?? "") ? parts[2] as WorkspaceRoute["section"] : "sessions" };
}

export function selectedQuery(params: { getAll(name: string): string[] }, name: string): string | undefined {
  const values = params.getAll(name);
  if (values.length > 1) throw new Error(`重复的 ${name} 参数`);
  return values[0];
}
