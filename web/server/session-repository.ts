import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { buildSessionProjection, migrateSessionEntries, parseSessionEntries, SessionManager, type SessionEntry } from "@earendil-works/pi-coding-agent";
import { decodeResourceId, WorkspaceError, type CreateSessionInput, type DeleteSessionInput, type DeletionOutcome, type DeletionPreview, type ExecutionDescriptor, type RepositoryAction, type SessionCollection, type SessionControls, type SessionRead, type SessionResource, type WorkspaceRemovalInspection } from "../shared/workspace-contract";
import { digest, ExecutionWorkspace } from "./execution-workspace";
import { normalizeMessages } from "./runtime-hub";
import { SessionCatalog } from "./session-catalog";
import { WorkspaceRegistry } from "./workspace-registry";

interface SessionRecord extends SessionResource {
  version: 1; operationId?: string; nameOverride?: string; deletionConfirmation?: string; removalStarted?: boolean;
  deletionOrigin?: "active" | "archived";
}
interface RepositoryOptions { installationRoot?: string; worktreeRoot?: string; workspaces?: ExecutionWorkspace; catalog?: (root: string) => SessionCatalog }

/** Passive reads never instantiate Pi, create metadata or prepare a worktree. */
export class SessionRepository {
  private readonly workspaces: ExecutionWorkspace;
  private readonly installationRoot: string;
  private readonly operations = new Map<string, Promise<unknown>>();
  private readonly catalogFactory: (root: string) => SessionCatalog;

  constructor(private readonly registry: WorkspaceRegistry, options: RepositoryOptions = {}) {
    this.installationRoot = realpathSync(options.installationRoot ?? registry.installationRoot);
    this.workspaces = options.workspaces ?? new ExecutionWorkspace(this.installationRoot, options.worktreeRoot);
    this.catalogFactory = options.catalog ?? ((root) => new SessionCatalog(root));
  }

  list(projectId: string, collection: SessionCollection = "active"): SessionResource[] {
    this.projectRoot(projectId);
    const catalog = this.catalog(projectId);
    const transcripts = catalog.all();
    const ids = new Set(transcripts.map((entry) => entry.id));
    const records = this.records(projectId);
    for (const record of records) ids.add(record.id);
    return [...ids].map((id) => this.resource(projectId, id, records, transcripts))
      .filter((session) => session.collection === collection).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  read(projectId: string, sessionId: string): SessionRead {
    const session = this.resource(projectId, decodeResourceId(sessionId));
    const transcript = this.catalog(projectId).find(sessionId);
    if (!transcript) return { session, messages: [] };
    const { projection } = projectTranscript(transcript.absolutePath);
    return { session, messages: normalizeMessages(projection.messages) };
  }

  resolveExecution(projectId: string, sessionId: string): ExecutionDescriptor {
    const session = this.resource(projectId, sessionId);
    if (!session.executable || !session.workspace) throw new WorkspaceError(session.legacy ? "legacy_read_only" : "session_read_only", session.legacy ? "Continue this conversation into a new isolated session before executing." : "Restore or repair this session before executing.", 409, { projectId, sessionId });
    return {
      installationRoot: this.installationRoot, historyRoot: join(this.projectRoot(projectId), ".kiva", "sessions"),
      executionRoot: this.workspaces.resolve(session.workspace), projectId, sessionId,
      sessionFile: this.catalog(projectId).find(sessionId)?.absolutePath,
      workspaceNotice: session.sourceSessionId ? `This dialogue continues session ${session.sourceSessionId}. Code starts from current committed revision ${session.workspace.baseCommit}, not the historical conversation's filesystem. Execute only in ${session.workspace.executionRoot}.` : undefined,
    };
  }

  resolveWorkspace(projectId: string, sessionId: string): string {
    const session = this.resource(projectId, sessionId);
    if (!session.workspace) throw new WorkspaceError("legacy_no_workspace", "This original conversation has no isolated workspace. Inspect the original project explicitly or continue into a new session.");
    return this.workspaces.resolve(session.workspace);
  }

  create(projectId: string, input: CreateSessionInput = {}): Promise<SessionResource> {
    return this.exclusive(projectId, () => this.provision(projectId, input));
  }

  continue(projectId: string, sourceSessionId: string, input: CreateSessionInput = {}): Promise<SessionResource> {
    return this.exclusive(projectId, () => {
      const source = this.resource(projectId, sourceSessionId);
      if (source.collection === "trash") throw new WorkspaceError("source_deleted", "Restore the source conversation before continuing it.");
      if (!this.catalog(projectId).find(sourceSessionId)) throw new WorkspaceError("source_empty", "An empty conversation has no dialogue to inherit.");
      return this.provision(projectId, input, sourceSessionId);
    });
  }

  rename(projectId: string, sessionId: string, name: string): SessionResource {
    if (typeof name !== "string" || !name.trim() || name.length > 500) throw new WorkspaceError("invalid_name", "Session name must contain 1–500 characters.", 400);
    const record = this.ensureRecord(projectId, sessionId);
    record.nameOverride = record.name = name.trim();
    this.save(record);
    return this.resource(projectId, sessionId);
  }

  updateControls(projectId: string, sessionId: string, controls: SessionControls): SessionResource {
    const record = this.ensureRecord(projectId, sessionId);
    record.controls = { ...record.controls, ...controls };
    this.save(record);
    return this.resource(projectId, sessionId);
  }

  /** Caller holds lifecycle exclusion and has quiesced an idle writer. */
  action(projectId: string, sessionId: string, action: RepositoryAction): SessionResource {
    const record = this.ensureRecord(projectId, sessionId);
    if (record.deletion?.status === "pending" || record.deletion?.status === "partial") throw new WorkspaceError("deletion_pending", "Finish or retry the pending deletion before changing collections.");
    const transcript = this.catalog(projectId).find(sessionId);
    if (action.type === "archive" && record.collection === "active") {
      if (transcript) this.catalog(projectId).archive(transcript.path);
      record.collection = "archived";
    } else if (action.type === "restore" && record.collection === "archived") {
      if (transcript) this.catalog(projectId).restore(transcript.path);
      record.collection = "active";
    } else if (action.type === "restore_deleted" && record.collection === "trash") {
      if (transcript) this.catalog(projectId).restoreDeleted(transcript.path);
      record.collection = record.deletionOrigin ?? (transcript?.path.startsWith("archived/") ? "archived" : "active");
      if (record.deletion) record.deletion = undefined;
      record.deletionConfirmation = undefined;
      record.removalStarted = undefined;
      record.deletionOrigin = undefined;
    } else throw new WorkspaceError("invalid_collection_action", "This collection action is not available for the session.");
    this.save(record);
    return this.resource(projectId, sessionId);
  }

  deletionPreview(projectId: string, sessionId: string, lifecycleRevision = ""): DeletionPreview {
    const session = this.resource(projectId, sessionId);
    const workspace = this.inspect(session);
    const record = this.ensureRecord(projectId, sessionId);
    const retry = session.deletion?.status === "pending" || session.deletion?.status === "partial";
    if (retry && !record.deletionConfirmation) throw new WorkspaceError("deletion_recovery", "The pending deletion has no saved confirmation identity; repair its operation metadata before retrying.", 409, { projectId, sessionId });
    return {
      projectId, sessionId, sessionName: session.name, collection: session.collection,
      confirmation: retry ? record.deletionConfirmation! : this.confirmation(session, workspace, lifecycleRevision), workspace,
      removeWorktree: retry ? session.deletion!.removeWorktree : !!session.workspace && session.workspace.state !== "removed",
      recovery: "History moves to recoverable trash. Removed working files are not recreated by restoring history; the session branch and committed results remain.",
      deletion: retry ? session.deletion : undefined,
    };
  }

  /** Runtime must reject active work and quiesce idle writers under the same lifecycle lock. */
  async delete(projectId: string, sessionId: string, input: DeleteSessionInput & { lifecycleRevision?: string }): Promise<DeletionOutcome> {
    return this.exclusive(projectId, () => {
      const session = this.resource(projectId, sessionId);
      const record = this.ensureRecord(projectId, sessionId);
      let inspection = this.inspect(session);
      const retry = record.deletion?.status === "pending" || record.deletion?.status === "partial";
      const sameOperation = !!record.deletion && record.deletionConfirmation === input.confirmation;
      // An interrupted operation cannot be replaced by presenting a newly
      // calculated token or changing its cleanup choice after side effects.
      if ((retry || sameOperation) && record.deletion!.removeWorktree !== input.removeWorktree) throw new WorkspaceError("deletion_choice_changed", "Retry the existing deletion with its original cleanup choice.");
      if (retry && !sameOperation) throw new WorkspaceError("stale_confirmation", "Review the pending deletion again to resume its saved operation.");
      if (!sameOperation && this.confirmation(session, inspection, input.lifecycleRevision ?? "") !== input.confirmation) throw new WorkspaceError("stale_confirmation", "Session or workspace changed after preview; review deletion again.");
      if (record.deletion?.status === "complete" && sameOperation) return record.deletion;
      if (session.collection === "trash" && !sameOperation) throw new WorkspaceError("already_deleted", "Session is already in trash.");
      // A persisted removal intent permits recovery after Git succeeded but the metadata write did not.
      if (record.removalStarted && record.workspace && !existsSync(record.workspace.treeRoot)) {
        const removed = { ...record.workspace, state: "removed" as const };
        const recovered = this.workspaces.inspectRemoval(removed);
        if (recovered.state === "removed") { record.workspace = removed; inspection = recovered; }
      }
      if (input.removeWorktree && record.workspace && inspection.state !== "clean" && inspection.state !== "removed") throw new WorkspaceError(inspection.state === "dirty" ? "workspace_dirty" : "workspace_ownership", inspection.message ?? "Handle local changes or uncheck workspace cleanup.");
      if (input.removeWorktree && !record.workspace) throw new WorkspaceError("legacy_no_workspace", "Legacy sessions support history-only deletion; the original directory is never removed.");
      record.deletion ??= { operationId: randomUUID(), history: session.collection === "trash" ? "trashed" : "retained", workspace: record.workspace?.state === "removed" ? "removed" : record.workspace ? "retained" : "none", status: "pending", removeWorktree: input.removeWorktree };
      record.deletionConfirmation = input.confirmation;
      record.deletion.status = "pending";
      delete record.deletion.error;
      if (session.collection !== "trash") record.deletionOrigin = session.collection;
      this.save(record);
      try {
        const transcript = this.catalog(projectId).find(sessionId);
        if (transcript && transcript.collection !== "trash") this.catalog(projectId).trash(transcript.path, transcript.collection);
        record.collection = "trash";
        record.deletion.history = "trashed";
        this.save(record);
        if (input.removeWorktree && record.workspace && record.workspace.state !== "removed") {
          // Persist before the non-atomic Git operation so a restart can identify its exact target.
          record.removalStarted = true;
          this.save(record);
          record.workspace = this.workspaces.remove(record.workspace, inspection.revision);
          record.deletion.workspace = "removed";
        }
        if (record.workspace?.state === "removed") record.deletion.workspace = "removed";
        record.deletion.status = "complete";
        this.save(record);
      } catch (error) {
        if (this.catalog(projectId).find(sessionId)?.collection === "trash") { record.collection = "trash"; record.deletion.history = "trashed"; }
        if (record.removalStarted && record.workspace && !existsSync(record.workspace.treeRoot)) {
          const removed = { ...record.workspace, state: "removed" as const };
          if (this.workspaces.inspectRemoval(removed).state === "removed") { record.workspace = removed; record.deletion.workspace = "removed"; }
        }
        record.deletion.status = "partial";
        record.deletion.error = error instanceof Error ? error.message : String(error);
        this.save(record);
      }
      return record.deletion;
    });
  }

  private provision(projectId: string, input: CreateSessionInput, sourceSessionId?: string): SessionResource {
    const operationId = input.operationId ? decodeResourceId(input.operationId) : randomUUID();
    const existing = this.records(projectId).filter((record) => record.operationId === operationId);
    if (existing.length > 1) throw new WorkspaceError("ambiguous_operation", "Creation operation has duplicate records.");
    let record = existing[0];
    if (record && record.sourceSessionId !== sourceSessionId) throw new WorkspaceError("operation_conflict", "Creation operation belongs to another source.");
    if (record?.workspace?.state === "ready") return this.resource(projectId, record.id);
    if (!record) {
      const project = this.registry.resolve(projectId);
      const id = randomUUID();
      const now = new Date().toISOString();
      const workspace = this.workspaces.reserve(project, id, operationId, this.registry.list().map((registered) => registered.path));
      record = { version: 1, operationId, projectId, id, name: input.name?.trim() || "未命名会话", nameOverride: input.name?.trim(), path: "", preview: "尚无消息预览", createdAt: now, updatedAt: now, collection: "active", legacy: false, executable: false, sourceSessionId, workspace, persisted: false };
      this.save(record);
    }
    if (!record.workspace) throw new WorkspaceError("workspace_missing", "Creation record has no workspace intent.");
    try {
      record.workspace = this.workspaces.prepare(record.workspace);
      if (sourceSessionId && !this.catalog(projectId).find(record.id)) {
        const source = this.catalog(projectId).find(sourceSessionId);
        if (!source) throw new WorkspaceError("source_missing", "Source dialogue is no longer available.");
        const fork = SessionManager.forkFrom(source.absolutePath, record.workspace.executionRoot, join(this.projectRoot(projectId), ".kiva", "sessions"), { id: record.id });
        if (fork.getSessionId() !== record.id || fork.getCwd() !== record.workspace.executionRoot) throw new WorkspaceError("fork_identity", "Pi returned an unexpected fork identity.");
      }
      record.executable = true;
      this.save(record);
      return this.resource(projectId, record.id);
    } catch (error) {
      record.workspace = { ...record.workspace, state: "failed", error: error instanceof Error ? error.message : String(error) };
      this.save(record);
      throw new WorkspaceError("workspace_setup_failed", record.workspace.error!, 409, { projectId, sessionId: record.id }, { operationId });
    }
  }

  private inspect(session: SessionResource): WorkspaceRemovalInspection {
    if (!session.workspace) return { state: "none", localChanges: [], revision: "none" };
    const workspace = session.workspace;
    if (this.registry.list().some((project) => project.path === workspace.treeRoot || project.path.startsWith(`${workspace.treeRoot}${sep}`))) return { state: "unavailable", treeRoot: workspace.treeRoot, branch: workspace.branch, localChanges: [], revision: digest(JSON.stringify(workspace)), message: "This workspace contains a registered project; cleanup is blocked." };
    return this.workspaces.inspectRemoval(workspace);
  }

  private confirmation(session: SessionResource, inspection: WorkspaceRemovalInspection, lifecycleRevision: string) {
    const transcript = this.catalog(session.projectId).find(session.id);
    const stat = transcript ? statSync(transcript.absolutePath) : undefined;
    return digest(JSON.stringify({ session, inspection, lifecycleRevision, transcript: transcript?.absolutePath, size: stat?.size, modified: stat?.mtimeMs }));
  }

  private resource(projectId: string, sessionId: string, records = this.records(projectId), transcripts = this.catalog(projectId).all()): SessionResource {
    decodeResourceId(sessionId);
    const matches = transcripts.filter((entry) => entry.id === sessionId);
    if (matches.length > 1) throw new WorkspaceError("ambiguous_session", "Multiple transcripts have the same ID; repair the duplicate before opening it.", 409, { projectId, sessionId });
    const transcript = matches[0];
    const record = records.find((entry) => entry.id === sessionId);
    if (!record && !transcript) throw new WorkspaceError("session_not_found", "Session is not part of this project.", 404, { projectId, sessionId });
    const collection = transcript?.collection ?? record!.collection;
    const updatedAt = record && (!transcript || record.updatedAt > transcript.updatedAt) ? record.updatedAt : transcript!.updatedAt;
    let workspace = record?.workspace;
    const deletion = record?.deletion ? { ...record.deletion } : undefined;
    // Reads reconcile observable effects of an interrupted operation, without
    // writing metadata or recreating a checkout. Explicit retry persists them.
    if (deletion && collection === "trash") deletion.history = "trashed";
    if (record?.removalStarted && workspace && workspace.state !== "removed" && !existsSync(workspace.treeRoot)) {
      const removed = { ...workspace, state: "removed" as const };
      if (this.workspaces.inspectRemoval(removed).state === "removed") {
        workspace = removed;
        if (deletion) deletion.workspace = "removed";
      }
    }
    const controls: SessionControls = { ...record?.controls };
    if (transcript) {
      const { projection, hasThinking } = projectTranscript(transcript.absolutePath);
      if (projection.model && typeof projection.model.provider === "string" && typeof projection.model.modelId === "string") controls.model = { provider: projection.model.provider, id: projection.model.modelId };
      if (hasThinking) controls.thinkingLevel = projection.thinkingLevel;
    }
    return {
      id: sessionId, projectId, path: transcript?.path ?? "", name: record?.nameOverride ?? transcript?.name ?? record!.name,
      preview: transcript?.preview ?? record!.preview, updatedAt, createdAt: record?.createdAt ?? transcript!.updatedAt,
      persisted: !!transcript, collection, legacy: !workspace, workspace, sourceSessionId: record?.sourceSessionId,
      controls, deletion,
      executable: !!workspace && workspace.state === "ready" && collection === "active" && (!deletion || deletion.status === "complete"),
    };
  }

  private ensureRecord(projectId: string, sessionId: string): SessionRecord {
    return this.records(projectId).find((record) => record.id === sessionId) ?? { ...this.resource(projectId, sessionId), version: 1 };
  }
  private catalog(projectId: string) { return this.catalogFactory(this.projectRoot(projectId)); }
  private projectRoot(projectId: string) {
    const project = this.registry.resolve(projectId);
    if (project.capability.state === "unavailable" || !existsSync(project.path) || realpathSync(project.path) !== project.path) throw new WorkspaceError("project_unavailable", "Registered project directory is unavailable or has moved.", 404, { projectId });
    return project.path;
  }
  private metadataRoot(projectId: string) { const root = join(this.projectRoot(projectId), ".kiva", "web", "sessions"); assertCanonicalAncestors(root); return root; }
  private records(projectId: string): SessionRecord[] {
    const root = this.metadataRoot(projectId);
    if (!existsSync(root)) return [];
    return readdirSync(root).filter((name) => name.endsWith(".json")).map((name) => {
      const file = join(root, name);
      if (lstatSync(file).isSymbolicLink()) throw new WorkspaceError("metadata_ownership", "Session metadata must not be a symlink.");
      let record: SessionRecord;
      try { record = JSON.parse(readFileSync(file, "utf8")) as SessionRecord; }
      catch { throw new WorkspaceError("metadata_corrupt", `Cannot read session metadata: ${name}`); }
      if (record.version !== 1 || record.projectId !== projectId || decodeResourceId(record.id) !== name.slice(0, -5) || !["active", "archived", "trash"].includes(record.collection)
        || typeof record.name !== "string" || typeof record.preview !== "string" || typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))
        || (record.workspace && (record.workspace.projectId !== projectId || record.workspace.sessionId !== record.id))) throw new WorkspaceError("metadata_corrupt", `Invalid session metadata: ${name}`);
      return record;
    });
  }
  private save(record: SessionRecord) {
    const root = this.metadataRoot(record.projectId);
    mkdirSync(root, { recursive: true });
    assertCanonicalAncestors(root);
    record.updatedAt = new Date().toISOString();
    const destination = join(root, `${decodeResourceId(record.id)}.json`);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    renameSync(temporary, destination);
  }
  private async exclusive<T>(key: string, action: () => T | Promise<T>): Promise<T> {
    const previous = this.operations.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    this.operations.set(key, current);
    try { return await current; } finally { if (this.operations.get(key) === current) this.operations.delete(key); }
  }
}

function assertCanonicalAncestors(path: string) {
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) {
    try { if (lstatSync(ancestor).isSymbolicLink()) throw new WorkspaceError("metadata_ownership", "Metadata path contains a symlink."); } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error; }
    ancestor = dirname(ancestor);
  }
  if (realpathSync(ancestor) !== ancestor) throw new WorkspaceError("metadata_ownership", "Metadata path contains a symlink.");
}

function projectTranscript(path: string) {
  const parsed = parseSessionEntries(readFileSync(path, "utf8"));
  migrateSessionEntries(parsed);
  const entries = parsed.filter((entry): entry is SessionEntry => entry.type !== "session");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  let cursor = entries.at(-1);
  let hasThinking = false;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    if (cursor.type === "thinking_level_change") hasThinking = true;
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return { projection: buildSessionProjection(entries), hasThinking };
}
