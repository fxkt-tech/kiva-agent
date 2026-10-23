import { decodeResourceId, isSessionWorkspaceMode, WorkspaceError, type SessionResource } from "../shared/workspace-contract";

export interface SessionRecord extends SessionResource {
  version: 1; operationId?: string; nameOverride?: string; deletionConfirmation?: string; removalStarted?: boolean;
  deletionOrigin?: "active" | "archived";
}

/** Disk boundary shared by detail/lifecycle reads and passive list summaries. */
export function parseSessionRecord(text: string, projectId: string, name: string): SessionRecord {
  let record: SessionRecord;
  try { record = JSON.parse(text) as SessionRecord; }
  catch { throw new WorkspaceError("metadata_corrupt", `Cannot read session metadata: ${name}`); }
  try {
    if (!record || typeof record !== "object" || record.version !== 1 || record.projectId !== projectId || decodeResourceId(record.id) !== name.slice(0, -5) || !["active", "archived", "trash"].includes(record.collection)
      || typeof record.name !== "string" || typeof record.preview !== "string" || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))
      || (record.nameOverride !== undefined && typeof record.nameOverride !== "string")
      || (record.workspace && (record.workspace.projectId !== projectId || record.workspace.sessionId !== record.id
        || (record.workspace.mode !== undefined && !isSessionWorkspaceMode(record.workspace.mode))))) throw new Error("Invalid metadata");
  } catch { throw new WorkspaceError("metadata_corrupt", `Invalid session metadata: ${name}`); }
  return record;
}
