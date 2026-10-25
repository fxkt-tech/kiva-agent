"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, Clock3, Command, FileCode2, GitBranch, Plus, Square, SquareTerminal, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useRuntime } from "@/lib/use-runtime";
import { useWebPreferences } from "@/lib/web-preferences";
import { getSendShortcutHint, shortcutRegistry, shouldSendFromKeydown } from "@/lib/shortcuts";
import type { RuntimeAttachment, RuntimeSnapshot } from "@/shared/runtime-types";
import type { ModelConfiguration } from "@/shared/model-configuration";
import type { SessionResource } from "@/shared/workspace-contract";
import { useWorkspace } from "@/features/workspace/shell";
import { mutate, resourceApi } from "@/features/workspace/resources";
import { ModelSettings } from "./model-settings";
import { useSlashCommands } from "./use-slash-commands";
import { slashCommandsLoaded } from "./slash-commands";

const ATTACHMENT_ACCEPT = "image/*,text/*,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.yaml,.yml,.toml,.go,.py,.rs,.java,.sh";
const CONNECTION_LABELS = { connecting: "连接中", connected: "已连接", reconnecting: "重连中", disconnected: "已断开" };
function formatTokens(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
function formatPercent(value: number | null | undefined) { return value == null ? "—" : value > 0 && value < 1 ? "<1%" : `${Math.round(value)}%`; }
function resizeComposerInput(input: HTMLTextAreaElement) {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}

export function Composer({ projectId, session, runtime, emptyConversation }: { projectId: string; session?: SessionResource; runtime: ReturnType<typeof useRuntime>; emptyConversation: boolean }) {
  const { drafts, createSession, project, refresh, refreshProject, modelCatalog, updateModelCatalog, modelsLoading, modelsError } = useWorkspace();
  const { preferences } = useWebPreferences();
  const key = drafts.key(projectId, session?.id);
  const current = useSyncExternalStore(drafts.subscribe, () => drafts.read(key), () => drafts.read(key));
  const draft = current.text;
  const attachments = current.attachments;
  const setDraft = (text: string) => drafts.update(key, { text });
  const setAttachments = (change: RuntimeAttachment[] | ((items: RuntimeAttachment[]) => RuntimeAttachment[])) => drafts.update(key, (value) => ({ ...value, attachments: typeof change === "function" ? change(value.attachments) : change }));
  const [queueMode] = useState<"steer" | "follow_up">(() => preferences.conversation.queueMode);
  const [commandsLoading, setCommandsLoading] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [compactOpen, setCompactOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<{ configuration: ModelConfiguration; snapshot?: RuntimeSnapshot }>();
  const [savedNotice, setSavedNotice] = useState<number>();
  const [sendError, setSendError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const commandMenu = useSlashCommands({ scope: key, draft, onChange: setDraft, commands: runtime.snapshot?.commands, input: textInput, composing });
  const commandsReady = slashCommandsLoaded(runtime.snapshot);
  const commandsInitializing = commandsLoading || runtime.snapshot?.lifecycle === "starting";
  const running = runtime.status === "running";
  const hasContent = Boolean(draft.trim() || attachments.length);
  const showStop = running && !hasContent;
  const queue = runtime.snapshot?.queue;
  const models = modelCatalog?.models ?? [];
  const sessionModel = runtime.snapshot?.model ?? session?.controls?.model;
  const sessionSelection = sessionModel ? { provider: sessionModel.provider, modelId: sessionModel.id, thinkingLevel: runtime.snapshot?.thinkingLevel || session?.controls?.thinkingLevel || "" } : undefined;
  const confirmedSelection = confirmed && confirmed.snapshot === runtime.snapshot ? confirmed.configuration : undefined;
  const selection = session ? confirmedSelection ?? sessionSelection ?? modelCatalog?.defaults : modelCatalog?.defaults;
  const usage = runtime.snapshot?.context?.percent;
  const hasContextUsage = typeof usage === "number" && Number.isFinite(usage) && usage > 0;
  const contextPercent = hasContextUsage ? Math.min(100, usage) : 0;
  const remainingPercent = 100 - contextPercent;
  const remainingLabel = `${Math.round(remainingPercent)}%`;
  useLayoutEffect(() => { if (textInput.current) resizeComposerInput(textInput.current); }, [draft]);
  useEffect(() => {
    const input = textInput.current;
    if (!input || typeof ResizeObserver === "undefined") return;
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resizeComposerInput(input);
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { composing.current = false; setContextOpen(false); setCompactOpen(false); setSendError(undefined); }, [key]);
  useEffect(() => { if (!hasContextUsage) setContextOpen(false); }, [hasContextUsage]);
  useEffect(() => { if (compactOpen) return shortcutRegistry.block("compaction"); }, [compactOpen]);
  useEffect(() => shortcutRegistry.register("openCommands", { run: commandMenu.openCommands }), [commandMenu.openCommands]);
  useEffect(() => shortcutRegistry.register("focusComposer", { run: () => textInput.current?.focus(), available: () => Boolean(textInput.current) }), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!hasContent || pending || modelSaving) return;
    const captured = current;
    const configuration = selection;
    const sourceKey = key;
    drafts.update(sourceKey, { text: "", attachments: [] });
    setPending(true); setSendError(undefined); commandMenu.dismiss();
    try {
      if (!session) {
        const created = await createSession(projectId);
        if (!created) { drafts.restore(sourceKey, captured); return; }
        if (configuration) await mutate(`${resourceApi({ projectId, sessionId: created.id })}/commands`, { type: "set_configuration", ...configuration });
        await mutate(`${resourceApi({ projectId, sessionId: created.id })}/commands`, { type: "prompt", message: captured.text, images: captured.attachments.filter((item) => item.kind === "image"), files: captured.attachments.filter((item) => item.kind === "text") });
      } else if (running) await runtime.queueMessage(captured.text, queueMode, captured.attachments);
      else await runtime.sendPrompt(captured.text, captured.attachments);
    } catch (cause) {
      drafts.restore(sourceKey, captured);
      setSendError(cause instanceof Error ? cause.message : String(cause));
    } finally { setPending(false); }
  }
  async function addFiles(files: File[]) {
    const sourceKey = key;
    const available = files.slice(0, Math.max(0, 5 - drafts.read(sourceKey).attachments.length));
    const valid = available.filter((file) => file.type.startsWith("image/") ? file.size <= 10_000_000 : isTextFile(file) && file.size <= 1_000_000);
    try {
      const next = await Promise.all(valid.map(readAttachment));
      drafts.update(sourceKey, (value) => ({ ...value, attachments: [...value.attachments, ...next].slice(0, 5) }));
    } catch (cause) { setSendError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function attachImages(event: ChangeEvent<HTMLInputElement>) { const files = [...(event.target.files ?? [])]; event.target.value = ""; await addFiles(files); }
  function pasteImages(event: ClipboardEvent<HTMLTextAreaElement>) { const files = [...event.clipboardData.files]; if (files.length) { event.preventDefault(); void addFiles(files); } }
  async function loadCommands() {
    if (commandsInitializing || !session || !runtime.connected) return;
    setCommandsLoading(true);
    textInput.current?.focus({ preventScroll: true });
    try { await runtime.initialize(); }
    finally { setCommandsLoading(false); }
  }
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (commandMenu.handleKeyDown(event)) return;
    if (event.repeat) {
      if (shouldSendFromKeydown({ ...event, repeat: false }, preferences.shortcuts.sendMode, composing.current)) event.preventDefault();
      return;
    }
    if (!shouldSendFromKeydown(event, preferences.shortcuts.sendMode, composing.current)) return;
    event.preventDefault();
    const form = event.currentTarget.form;
    const submitter = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (form && submitter && !submitter.disabled) form.requestSubmit(submitter);
  }
  const compactDisabled = running || !runtime.connected || !runtime.snapshot?.context;
  const commandPalette = (commandMenu.open && <div ref={commandMenu.menu} className="command-palette" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); commandMenu.dismiss(); textInput.current?.focus({ preventScroll: true }); } }}>
            <div ref={commandMenu.list} id={commandMenu.listId} className="command-list" role="listbox" aria-label="命令、技能和模板">
              {commandMenu.highlight && <span className="command-highlight" aria-hidden="true" style={{ top: commandMenu.highlight.top, height: commandMenu.highlight.height }} />}
              {commandMenu.visibleCommands.map((command, index) => <button ref={(node) => { commandMenu.rows.current[index] = node; }} id={commandMenu.optionId(index)} type="button" tabIndex={-1} role="option" aria-selected={index === commandMenu.activeIndex} key={`${command.source}:${command.name}`} onMouseDown={(event) => event.preventDefault()} onPointerMove={(event) => { if (event.pointerType === "mouse") commandMenu.activate(index); }} onClick={() => commandMenu.choose(command)}><span className="command-name">/{command.name}</span><small>{command.description ?? "无说明"}</small><em>{command.source === "skill" ? "技能" : command.source === "prompt" ? "模板" : "扩展"}</em></button>)}
            </div>
            {!commandMenu.visibleCommands.length && <div className="command-empty" role="status">{!session ? "进入会话并加载运行设置后可使用命令" : !commandsReady ? <><span>此会话的命令尚未加载</span><Button ref={commandMenu.loadAction} data-command-load type="button" size="sm" variant="ghost" disabled={!runtime.connected || commandsInitializing} onClick={() => void loadCommands()}>{commandsInitializing ? "正在加载…" : "加载命令"}</Button></> : commandMenu.query ? `没有匹配“${commandMenu.query}”的命令` : "此会话没有可用的命令"}</div>}
            <div className="command-help"><span><Command size={12} aria-hidden="true" />在输入框中搜索命令</span><span>↑↓ 选择 · Enter / Tab 补全 · Esc 关闭</span></div>
          </div>);
  return <>
        <div className="composer-wrap">
          {sendError && sendError !== runtime.error && <Alert variant="error" title="消息或附件处理失败" className="composer-alert" onDismiss={() => setSendError(undefined)}>{sendError}</Alert>}
          {savedNotice != null && <Toast key={savedNotice} message="模型设置已保存" onDismiss={() => setSavedNotice(undefined)} />}
          {modelsError && <Alert variant="error" title="模型列表加载失败" className="composer-alert"><p>{modelsError}</p><div className="alert-actions"><Button type="button" size="sm" variant="outline" onClick={refresh}>重新加载</Button></div></Alert>}
          {queue && (queue.steering.length || queue.followUp.length) ? <section className="composer-queue" aria-label="待发送消息队列">
            <div className="queue-heading"><span><Clock3 size={13} aria-hidden="true" />{queue.steering.length} 条纠正 · {queue.followUp.length} 条后续</span><button type="button" aria-label="清空队列" onClick={() => void runtime.clearQueue()}>清空队列</button></div>
            <ol className="queue-items" tabIndex={0} aria-label="队列消息">
              {queue.steering.map((message, index) => <li className="queue-card" key={`steer-${index}`}><p>{message}</p><span>立即纠正</span></li>)}
              {queue.followUp.map((message, index) => <li className="queue-card" key={`follow-up-${index}`}><p>{message}</p><span>完成后追加</span></li>)}
            </ol>
          </section> : null}
          <div ref={commandMenu.anchor} className="composer-command-anchor">{commandPalette}<form className="composer" onSubmit={submit}>
            {attachments.length > 0 && <div className="attachment-list">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`}>{attachment.kind === "image" ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" /> : <span className="attachment-file"><FileCode2 size={14} /></span>}<span>{attachment.name}</span><button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button></div>)}</div>}
            <Textarea ref={textInput} value={draft} role="combobox" aria-label="消息内容" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={commandMenu.open} aria-controls={commandMenu.open ? commandMenu.listId : undefined} aria-activedescendant={commandMenu.activeId} onChange={commandMenu.change} onSelect={commandMenu.select} onFocus={commandMenu.focus} onBlur={commandMenu.blur} onPaste={pasteImages} onKeyDown={handleComposerKeyDown} onCompositionStart={commandMenu.compositionStart} onCompositionEnd={commandMenu.compositionEnd} placeholder={running ? (queueMode === "steer" ? "立即纠正当前任务…" : "添加任务完成后的后续消息…") : "告诉 KivA 你想完成什么…"} rows={1} />
            <div className="composer-actions">
              <div className="composer-input-actions">
                <input ref={fileInput} className="sr-only" type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={attachImages} />
                <Button type="button" variant="ghost" size="icon" onClick={() => fileInput.current?.click()} disabled={attachments.length >= 5} aria-label="添加附件"><Plus size={17} /></Button>
              </div>
              <div className="composer-settings">
                {hasContextUsage && <div className="composer-context"><Popover open={contextOpen} onOpenChange={setContextOpen}>
                  <PopoverTrigger render={<button type="button" className="composer-context-trigger" aria-label="上下文剩余量" aria-controls="composer-context-details" title={`剩余 ${remainingLabel}，点击查看使用详情`} />}>
                    <svg className="context-ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle className="context-ring-value" cx="10" cy="10" r="7" pathLength="100" strokeDasharray={`${remainingPercent} 100`} /></svg><span>{remainingLabel}</span>
                  </PopoverTrigger>
                  <PopoverContent id="composer-context-details" className="composer-context-popover" side="top" align="end" role="region" aria-label="上下文详情">
                    <div className="context-heading"><strong>上下文使用量</strong><span>{formatPercent(runtime.snapshot?.context?.percent)}</span></div>
                    <div className="context-track" role="progressbar" aria-label="上下文使用百分比" aria-valuemin={0} aria-valuemax={100} aria-valuenow={runtime.snapshot?.context?.percent == null ? undefined : contextPercent}><span style={{ width: `${contextPercent}%` }} /></div>
                    <div className="context-details"><span>{formatTokens(runtime.snapshot?.context?.tokens)} tokens</span><span>{runtime.snapshot?.context ? `${formatTokens(runtime.snapshot.context.contextWindow)} 上限` : "等待首次请求"}</span></div>
                    {runtime.snapshot?.context && <div className="context-details"><span>累计 {formatTokens(runtime.snapshot.context.total)}</span><span>${runtime.snapshot.context.cost.toFixed(4)}</span></div>}
                    <Button type="button" variant="ghost" size="sm" className="compact-button" disabled={compactDisabled} onClick={() => { setContextOpen(false); setCompactOpen(true); }}>压缩上下文</Button>
                  </PopoverContent>
                </Popover>
                </div>}
                <ModelSettings projectId={projectId} sessionId={session?.id} models={models} selection={selection} loading={modelsLoading} disabled={running || pending || modelSaving || (Boolean(session) && !runtime.connected)} onPending={setModelSaving} onSettled={() => refreshProject(projectId)} onSaved={(catalog) => { updateModelCatalog(catalog); if (session && catalog.defaults) setConfirmed({ configuration: catalog.defaults, snapshot: runtime.snapshot }); setSavedNotice((value) => (value ?? 0) + 1); }} />
              </div>
              <div className="composer-send-actions"><Button type={showStop ? "button" : "submit"} size="icon" className="composer-send" aria-label={showStop ? "停止" : "发送消息"} onClick={showStop ? runtime.abort : undefined} disabled={!showStop && (!hasContent || pending || modelSaving || (!session && project?.capability.state !== "ready") || (Boolean(session) && !runtime.connected))}>{showStop ? <Square size={12} fill="currentColor" aria-hidden="true" /> : <ArrowUp size={17} aria-hidden="true" />}</Button></div>
            </div>
          </form></div>
          <div className="composer-note">{session && <span className="composer-connection-status" data-state={runtime.connectionStatus} role="status" aria-label="当前会话后端连接" aria-live="polite" aria-atomic="true" title={`当前会话后端连接：${CONNECTION_LABELS[runtime.connectionStatus]}`}><span className="composer-connection-dot" aria-hidden="true" />{CONNECTION_LABELS[runtime.connectionStatus]}</span>}<span className="composer-project-context" title={session?.workspace?.executionRoot ?? project?.path}><SquareTerminal size={11} />本地<span>·</span><GitBranch size={11} /><span>{session?.workspace?.branch ?? (project?.capability.state === "ready" ? project.capability.branch : "—")}</span></span><span className="composer-keyboard-hint">{getSendShortcutHint(preferences.shortcuts.sendMode)}</span></div>
          {emptyConversation && <div className="suggestions"><button type="button" onClick={() => setDraft("解释当前代码结构")}><FileCode2 size={13} />了解代码库</button><button type="button" onClick={() => setDraft("检查最近的代码变更")}><GitBranch size={13} />检查代码变更</button><button type="button" onClick={() => setDraft("规划下一个功能")}><Wrench size={13} />规划一个功能</button></div>}
        </div>
        <ConfirmDialog open={compactOpen} onOpenChange={setCompactOpen} title="压缩上下文？" description="压缩会调用当前模型生成会话摘要。确定继续吗？" confirmLabel="压缩上下文" confirmDisabled={compactDisabled} onConfirm={() => { if (compactDisabled) return; setCompactOpen(false); setContextOpen(false); void runtime.compact(); }} />
</>;
}

function readAttachment(file: File): Promise<RuntimeAttachment> {
  if (!file.type.startsWith("image/")) return file.text().then((data) => ({ kind: "text", name: file.name, mimeType: file.type || "text/plain", data }));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve({ kind: "image", name: file.name, mimeType: file.type, data: String(reader.result).split(",", 2)[1] ?? "" });
    reader.readAsDataURL(file);
  });
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || /\.(md|json|jsx?|tsx?|css|html?|xml|ya?ml|toml|go|py|rs|java|sh)$/i.test(file.name);
}
