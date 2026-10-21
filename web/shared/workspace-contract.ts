import type { RuntimeMessage } from "./runtime-types";
import type { SessionSummary } from "./types";

export type SessionCollection = "active" | "archived" | "trash";
export interface ResourceTarget { projectId: string; sessionId?: string }
export type GitCapability =
  | { state: "ready"; repositoryRoot: string; commonDirectory: string; projectSubdirectory: string; head: string; branch: string }
  | { state: "non-git" | "no-commit" | "missing-git" | "unavailable"; message: string };
export interface ProjectResource { id: string; name: string; path: string; capability: GitCapability }
export interface RemoveProjectResult { projectId: string; projects: ProjectResource[] }
export interface OwnedWorkspace {
  projectId: string; sessionId: string; operationId: string;
  managedRoot: string; treeRoot: string; executionRoot: string;
  repositoryRoot: string; commonDirectory: string; projectSubdirectory: string;
  baseCommit: string; branch: string;
  state: "provisioning" | "ready" | "failed" | "removed";
  error?: string;
}
export interface SessionControls { model?: { provider: string; id: string }; thinkingLevel?: string }
export interface DeletionOutcome {
  operationId: string; history: "retained" | "trashed"; workspace: "retained" | "removed" | "none";
  status: "pending" | "complete" | "partial"; removeWorktree: boolean; error?: string;
}
export interface SessionResource extends SessionSummary {
  projectId: string; collection: SessionCollection; legacy: boolean; executable: boolean;
  createdAt: string; sourceSessionId?: string; workspace?: OwnedWorkspace;
  controls?: SessionControls; deletion?: DeletionOutcome;
}
export interface SessionRead { session: SessionResource; messages: RuntimeMessage[] }
export interface ExecutionDescriptor {
  installationRoot: string; historyRoot: string; executionRoot: string;
  projectId: string; sessionId: string; sessionFile?: string;
  workspaceNotice?: string;
}
export interface WorkspaceRemovalInspection {
  state: "clean" | "dirty" | "unavailable" | "removed" | "none";
  treeRoot?: string; branch?: string; localChanges: string[]; revision: string; message?: string;
}
export interface DeletionPreview {
  projectId: string; sessionId: string; sessionName: string; collection: SessionCollection;
  confirmation: string; workspace: WorkspaceRemovalInspection; removeWorktree: boolean;
  recovery: string;
  /** Existing durable operation; retries retain its original confirmation and choice. */
  deletion?: DeletionOutcome;
}
export interface CreateSessionInput { operationId?: string; name?: string }
export type RepositoryAction = { type: "archive" | "restore" | "restore_deleted" };
export interface DeleteSessionInput { confirmation: string; removeWorktree: boolean }

export class WorkspaceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409, public readonly target?: ResourceTarget, public readonly details?: unknown) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/** Route IDs are opaque tokens, never directory names supplied by clients. */
export function decodeResourceId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new WorkspaceError("invalid_id", "Invalid resource ID", 400);
  }
  return value;
}
