import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { RuntimeCommand, RuntimeScope, RuntimeSnapshot, RuntimeWireEvent, SessionRuntimeRead } from "../shared/runtime-types";
import { WorkspaceError, type ExecutionDescriptor, type SessionControls, type SessionRead } from "../shared/workspace-contract";
import { RuntimeEventStream, type RuntimeCursor } from "./event-stream";
import { RuntimeHub, type RuntimeAdapter } from "./runtime-hub";

export interface RuntimeRepository {
  read(projectId: string, sessionId: string): SessionRead | Promise<SessionRead>;
  resolveExecution(projectId: string, sessionId: string): ExecutionDescriptor | Promise<ExecutionDescriptor>;
  rename(projectId: string, sessionId: string, name: string): unknown;
  updateControls(projectId: string, sessionId: string, controls: SessionControls): unknown;
  invalidateSessionLists?(projectId: string): void;
}
interface Owner { hub: RuntimeHub; descriptor: ExecutionDescriptor; lastUsed: number; unsubscribe: () => void; generation: number; transitioningProviders: Map<string, number>; controlPending: number }

/** The custom HTTP server constructs the only manager. Reads and subscriptions never acquire owners. */
export class RuntimeManager {
  private owners = new Map<string, Owner>();
  private streams = new Map<string, RuntimeEventStream>();
  private locks = new Map<string, Promise<void>>();
  private revisions = new Map<string, number>();
  private transcripts = new Map<string, string>();
  private allocation: Promise<void> = Promise.resolve();
  private admission: Promise<void> = Promise.resolve();
  private configurationGeneration = 0;
  private stopping = false;

  constructor(private readonly repository: RuntimeRepository,
    private readonly createAdapter: (descriptor: ExecutionDescriptor) => RuntimeAdapter,
    readonly capacity = 4,
    private readonly healthIntervalMs = 2_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 128) throw new Error("Runtime capacity must be an integer between 1 and 128");
  }

  async read(scope: RuntimeScope): Promise<SessionRuntimeRead> {
    const read = await this.repository.read(scope.projectId, scope.sessionId);
    return this.project(scope, read);
  }

  async subscribe(scope: RuntimeScope, listener: (event: RuntimeWireEvent) => void, cursor: RuntimeCursor = {}) {
    const read = await this.repository.read(scope.projectId, scope.sessionId);
    const stream = this.stream(scope);
    // This entire handshake is synchronous: the projection and sequence refer to
    // the same event boundary, followed immediately by replay + listener attach.
    if (cursor.streamId === stream.streamId && Number.isSafeInteger(cursor.since) && !stream.needsResync(cursor)) return stream.subscribe(listener, cursor);
    if (cursor.streamId) listener(stream.resyncEvent());
    const snapshot = stream.publish({ type: "snapshot", snapshot: this.project(scope, read).snapshot });
    return stream.subscribe(listener, { streamId: stream.streamId, since: snapshot.seq - 1 });
  }

  async command(scope: RuntimeScope, command: RuntimeCommand) {
    if (command.type === "new_session" || command.type === "switch_session") throw new WorkspaceError("identity_change_forbidden", "Create or continue a resource instead of switching a runtime", 400, scope);
    const initialOwner = this.owners.get(key(scope));
    const queueAction = command.type === "steer" || command.type === "follow_up";
    const bypass = !!initialOwner && (["abort", "clear_queue", "extension_ui_response", "rename_session"].includes(command.type) || queueAction && !initialOwner.hub.isIdle());
    const accept = () => this.lock(scope, async () => {
      if (this.stopping) throw new WorkspaceError("stopping", "Server is shutting down", 503, scope);
      const read = await this.repository.read(scope.projectId, scope.sessionId);
      if (command.type === "rename_session") {
        if (!command.name.trim()) throw new WorkspaceError("invalid_name", "Session name cannot be empty", 400, scope);
        await this.repository.rename(scope.projectId, scope.sessionId, command.name.trim());
        const owner = this.owners.get(key(scope));
        this.bump(scope);
        // Legacy and dormant metadata changes must not start a process.
        return { pending: (owner && owner.hub.lifecycle() !== "quarantined" ? owner.hub.execute(command) : Promise.resolve({ accepted: true as const })).then(async (result) => { await this.notifyResource(scope); return result; }) };
      }
      let owner = this.owners.get(key(scope));
      if (bypass && !owner) throw new WorkspaceError("session_changed", "会话运行状态已变化，请重试。", 409, scope);
      // A queue action chosen while running may wait on scope acceptance until
      // the owner settles. It must not create new idle work outside admission.
      if (bypass && queueAction && owner?.hub.isIdle()) throw new WorkspaceError("session_changed", "会话已空闲，请重新发送消息。", 409, scope);
      // A configuration save never stops running work. Refresh stale catalogs only
      // at the next explicit safe owner action, preserving the existing stream.
      if (!bypass && owner && owner.generation !== this.configurationGeneration && owner.hub.isIdle()) {
        if (owner.controlPending) throw new WorkspaceError("session_busy", "模型设置正在保存，请稍后重试。", 409, scope);
        await this.release(scope, owner);
        owner = undefined;
      }
      owner ??= await this.acquire(scope, read);
      const acceptedOwner = owner;
      const transition = command.type === "set_model" || command.type === "set_configuration" ? command.provider : undefined;
      const controls = command.type === "set_model" || command.type === "set_thinking" || command.type === "set_configuration";
      if (controls) owner.controlPending++;
      if (transition) owner.transitioningProviders.set(transition, (owner.transitioningProviders.get(transition) ?? 0) + 1);
      owner.lastUsed = Date.now();
      this.bump(scope);
      const pending = owner.hub.execute(command).then(async (result) => {
        if (command.type === "set_model" || command.type === "set_thinking" || command.type === "set_configuration") {
          const snapshot = owner.hub.passiveSnapshot();
          if (snapshot) await this.repository.updateControls(scope.projectId, scope.sessionId, { model: snapshot.model, thinkingLevel: snapshot.thinkingLevel });
        }
        return result;
      }).catch(async (error: unknown) => {
        // A failed cold start owns no writer and must not consume a capacity slot
        // forever. Retry resolves a fresh descriptor and confirmed preferences.
        if (owner.hub.lifecycle() === "dormant") await this.lock(scope, async () => {
          if (this.owners.get(key(scope)) === owner && owner.hub.lifecycle() === "dormant") await this.release(scope, owner);
        });
        throw error;
      }).finally(() => {
        if (controls) acceptedOwner.controlPending--;
        if (transition) { const count = (acceptedOwner.transitioningProviders.get(transition) ?? 1) - 1; if (count) acceptedOwner.transitioningProviders.set(transition, count); else acceptedOwner.transitioningProviders.delete(transition); }
      });
      return { pending };
    });
    // Abort/queue/UI responses for an existing owner cannot wait behind a
    // credential-file lock. These actions do not acquire or refresh a catalog.
    const { pending } = await (bypass ? accept() : this.admit(accept));
    // The lifecycle lock protects acceptance, never a model run or a long RPC.
    return pending;
  }

  revision(scope: RuntimeScope) { return String(this.revisions.get(key(scope)) ?? 0); }

  async withProviderMutation<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    return this.admit(async () => {
      if (this.stopping) throw new WorkspaceError("stopping", "Server is shutting down", 503);
      for (const owner of this.owners.values()) {
        const current = owner.hub.passiveSnapshot()?.model?.provider;
        const affected = current === undefined || current === providerId || owner.transitioningProviders.has(providerId);
        if (affected && (!owner.hub.isIdle() || owner.controlPending)) throw new WorkspaceError("provider_busy", "此提供方仍有运行、等待或排队中的任务，请结束后重试。", 409);
      }
      const result = await operation();
      this.configurationGeneration += 1;
      return result;
    });
  }

  async withIdle<T>(scope: RuntimeScope, operation: (lifecycleRevision: string) => T | Promise<T>): Promise<T> {
    return this.lock(scope, async () => {
      await this.repository.read(scope.projectId, scope.sessionId);
      const owner = this.owners.get(key(scope));
      if (owner && (!owner.hub.isIdle() || owner.controlPending)) throw new WorkspaceError("session_busy", "Finish or stop the running task, queued work and extension requests before changing its lifecycle", 409, scope, { lifecycle: owner.hub.lifecycle() });
      if (owner) await this.release(scope, owner);
      const result = await operation(this.revision(scope));
      this.bump(scope);
      await this.notifyResource(scope);
      return result;
    });
  }

  async preview<T>(scope: RuntimeScope, operation: (lifecycleRevision: string) => T | Promise<T>) {
    return this.lock(scope, async () => {
      const owner = this.owners.get(key(scope));
      if (owner && (!owner.hub.isIdle() || owner.controlPending)) throw new WorkspaceError("session_busy", "Finish or stop the task before deleting this session", 409, scope, { lifecycle: owner.hub.lifecycle() });
      return operation(this.revision(scope));
    });
  }

  async stop() {
    this.stopping = true;
    await Promise.all([...this.owners.entries()].map(async ([id, owner]) => {
      owner.unsubscribe();
      await owner.hub.stop();
      this.owners.delete(id);
    }));
  }

  private project(scope: RuntimeScope, read: SessionRead): SessionRuntimeRead {
    const live = this.owners.get(key(scope))?.hub.passiveSnapshot();
    const lifecycle = this.owners.get(key(scope))?.hub.lifecycle() ?? "dormant";
    const snapshot: RuntimeSnapshot = live ? { ...live, session: { ...live.session, name: read.session.name }, lifecycle } : {
      scope, lifecycle, provenance: "persisted", status: "idle",
      session: { id: read.session.id, name: read.session.name, messageCount: read.messages.length },
      messages: read.messages, thinkingLevel: read.session.controls?.thinkingLevel ?? "", thinkingLevels: [],
      model: read.session.controls?.model, models: [], queue: { steering: [], followUp: [] }, commands: [],
    };
    return { ...scope, session: read.session, snapshot, lifecycle, executable: read.session.executable && lifecycle !== "quarantined" };
  }

  private async acquire(scope: RuntimeScope, read: SessionRead): Promise<Owner> {
    const existing = this.owners.get(key(scope));
    if (existing) return existing;
    const descriptor = await this.repository.resolveExecution(scope.projectId, scope.sessionId);
    const previous = this.allocation;
    let unlock!: () => void;
    this.allocation = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    try {
      const already = this.owners.get(key(scope));
      if (already) return already;
      if (this.owners.size >= this.capacity) {
        const idle = [...this.owners.entries()].filter(([, owner]) => owner.hub.isIdle() && !owner.controlPending).sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
        if (!idle) throw new WorkspaceError("runtime_capacity", "All execution slots are busy; finish another task and retry", 503, scope, { capacity: this.capacity });
        await this.release(idToScope(idle[0]), idle[1]);
      }
      const transcript = descriptor.sessionFile ? canonical(descriptor.sessionFile) : `${canonical(descriptor.historyRoot)}/${scope.sessionId}`;
      const writer = this.transcripts.get(transcript);
      if (writer && writer !== key(scope)) throw new WorkspaceError("transcript_owned", "This transcript already has another execution owner", 409, scope);
      const stream = this.stream(scope);
      const hub = new RuntimeHub(() => {
        const adapter = this.createAdapter(descriptor);
        const start = adapter.start.bind(adapter);
        adapter.start = async () => {
          await start();
          const state = await adapter.getState();
          if (state.messageCount === 0) {
            await adapter.setSessionName(read.session.name);
            if (read.session.controls?.model) {
              const { provider, id } = read.session.controls.model;
              if (!(await adapter.getAvailableModels()).some((model) => model.provider === provider && model.id === id)) throw new WorkspaceError("model_unavailable", "The saved model is no longer available", 409, scope);
              await adapter.setModel(provider, id);
            }
            if (read.session.controls?.thinkingLevel) {
              if (!(await adapter.getAvailableThinkingLevels()).includes(read.session.controls.thinkingLevel)) throw new WorkspaceError("thinking_unavailable", "The saved thinking level is no longer available", 409, scope);
              await adapter.setThinkingLevel(read.session.controls.thinkingLevel);
            }
          }
        };
        return adapter;
      }, this.healthIntervalMs, { ...scope, executionRoot: canonical(descriptor.executionRoot), sessionFile: descriptor.sessionFile });
      const unsubscribe = hub.subscribe((event) => {
        if (event.type === "pi_event" && event.event && typeof event.event === "object" && "type" in event.event && typeof event.event.type === "string"
          && ["message_start", "message_end", "agent_settled", "session_info_changed", "auto_compaction_end"].includes(event.event.type)) {
          // Invalidate before publishing: a client reacting to this persisted
          // boundary must not join a snapshot captured before the append.
          this.repository.invalidateSessionLists?.(scope.projectId);
        }
        if (event.type === "runtime_reset") stream.rotate();
        stream.publish(event);
      });
      const owner = { hub, descriptor, lastUsed: Date.now(), unsubscribe, generation: this.configurationGeneration, transitioningProviders: new Map<string, number>(), controlPending: 0 };
      this.owners.set(key(scope), owner);
      this.transcripts.set(transcript, key(scope));
      return owner;
    } finally { unlock(); }
  }

  private async release(scope: RuntimeScope, owner: Owner) {
    owner.unsubscribe();
    await owner.hub.stop();
    this.owners.delete(key(scope));
    for (const [path, writer] of this.transcripts) if (writer === key(scope)) this.transcripts.delete(path);
  }
  private stream(scope: RuntimeScope) {
    let stream = this.streams.get(key(scope));
    if (!stream) { stream = new RuntimeEventStream(2_048, undefined, scope); this.streams.set(key(scope), stream); }
    return stream;
  }
  private bump(scope: RuntimeScope) { this.revisions.set(key(scope), (this.revisions.get(key(scope)) ?? 0) + 1); }
  private async notifyResource(scope: RuntimeScope) {
    this.repository.invalidateSessionLists?.(scope.projectId);
    const read = await this.repository.read(scope.projectId, scope.sessionId);
    const stream = this.stream(scope);
    stream.publish({ type: "pi_event", event: { type: "session_info_changed" } });
    stream.publish({ type: "snapshot", snapshot: this.project(scope, read).snapshot });
  }
  private async lock<T>(scope: RuntimeScope, operation: () => Promise<T>): Promise<T> {
    const id = key(scope), previous = this.locks.get(id) ?? Promise.resolve();
    let unlock!: () => void;
    const current = new Promise<void>((resolve) => { unlock = resolve; });
    this.locks.set(id, current);
    await previous;
    try { return await operation(); }
    finally { unlock(); if (this.locks.get(id) === current) this.locks.delete(id); }
  }
  private async admit<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.admission;
    let unlock!: () => void;
    this.admission = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    try { return await operation(); } finally { unlock(); }
  }
}
function key(scope: RuntimeScope) { return `${scope.projectId}/${scope.sessionId}`; }
function idToScope(value: string): RuntimeScope { const [projectId, sessionId] = value.split("/"); return { projectId, sessionId }; }
function canonical(path: string) { return existsSync(path) ? realpathSync(path) : resolve(path); }
