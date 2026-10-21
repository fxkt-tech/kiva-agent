"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, ChevronDown, Clock3, Command, FileCode2, GitBranch, Paperclip, SquareTerminal, StopCircle, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuntime } from "@/lib/use-runtime";
import type { RuntimeAttachment } from "@/shared/runtime-types";
import type { SessionResource } from "@/shared/workspace-contract";
import { useWorkspace } from "@/features/workspace/shell";
import { mutate, resourceApi } from "@/features/workspace/resources";

const ATTACHMENT_ACCEPT = "image/*,text/*,.md,.json,.js,.jsx,.ts,.tsx,.css,.html,.xml,.yaml,.yml,.toml,.go,.py,.rs,.java,.sh";
function formatTokens(value: number | null | undefined) { return value == null ? "—" : new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
function formatPercent(value: number | null | undefined) { return value == null ? "—" : `${Math.round(value)}%`; }

export function Composer({ projectId, session, runtime, emptyConversation }: { projectId: string; session?: SessionResource; runtime: ReturnType<typeof useRuntime>; emptyConversation: boolean }) {
  const { drafts, createSession, project, bootstrap } = useWorkspace();
  const key = drafts.key(projectId, session?.id);
  const current = useSyncExternalStore(drafts.subscribe, () => drafts.read(key), () => drafts.read(key));
  const draft = current.text;
  const attachments = current.attachments;
  const setDraft = (text: string) => drafts.update(key, { text });
  const setAttachments = (change: RuntimeAttachment[] | ((items: RuntimeAttachment[]) => RuntimeAttachment[])) => drafts.update(key, (value) => ({ ...value, attachments: typeof change === "function" ? change(value.attachments) : change }));
  const [queueMode, setQueueMode] = useState<"steer" | "follow_up">("steer");
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const contextControl = useRef<HTMLDivElement>(null);
  const running = runtime.status === "running";
  const contextPercent = Math.min(100, Math.max(0, runtime.snapshot?.context?.percent ?? 0));
  const visibleCommands = useMemo(() => runtime.snapshot?.commands.filter((command) => `${command.name} ${command.description ?? ""}`.toLowerCase().includes(commandQuery.toLowerCase())).slice(0, 12) ?? [], [commandQuery, runtime.snapshot?.commands]);
  useEffect(() => { setContextOpen(false); setCommandOpen(false); setSendError(undefined); }, [key]);
  useEffect(() => {
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { setContextOpen(false); setCommandOpen(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    if (!contextOpen) return;
    const outside = (event: globalThis.PointerEvent) => { if (event.target instanceof Node && !contextControl.current?.contains(event.target)) setContextOpen(false); };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [contextOpen]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!draft.trim() && !attachments.length) || pending) return;
    const captured = current;
    const sourceKey = key;
    drafts.update(sourceKey, { text: "", attachments: [] });
    setPending(true); setSendError(undefined); setCommandOpen(false);
    try {
      if (!session) {
        const created = await createSession(projectId);
        if (!created) { drafts.restore(sourceKey, captured); return; }
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
  function changeDraft(value: string) { setDraft(value); const query = /^\/([^\s]*)$/.exec(value); if (query) { setCommandOpen(true); setCommandQuery(query[1]); } }
  function chooseCommand(name: string) { setDraft(`/${name} `); setCommandOpen(false); setCommandQuery(""); }
  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }
  function changeModel(value: string) { try { const model = JSON.parse(value) as { provider: string; id: string }; void runtime.setModel(model.provider, model.id); } catch { /* Only generated model options are accepted. */ } }
  function compactSession() { if (window.confirm("压缩会调用当前模型生成会话摘要。确定继续吗？")) void runtime.compact(); }
  return <>
        <div className="composer-wrap">
          {sendError && <p className="runtime-error" role="alert">{sendError}</p>}
          {commandOpen && <div className="command-palette">
            <div className="command-search"><Command size={14} /><input autoFocus value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="搜索命令、技能和模板" /></div>
            <div className="command-list">{visibleCommands.length ? visibleCommands.map((command) => <button type="button" key={`${command.source}:${command.name}`} onClick={() => chooseCommand(command.name)}><span>/{command.name}</span><small>{command.description ?? "无说明"}</small><em>{command.source === "skill" ? "技能" : command.source === "prompt" ? "模板" : "扩展"}</em></button>) : <p>没有匹配的命令</p>}</div>
          </div>}
          {(runtime.snapshot?.queue.steering.length || runtime.snapshot?.queue.followUp.length) ? <div className="queue-panel">
            <div className="queue-heading"><Clock3 size={13} /><span>{runtime.snapshot.queue.steering.length} 条纠正 · {runtime.snapshot.queue.followUp.length} 条后续</span></div>
            <div className="queue-items">
              {runtime.snapshot.queue.steering.map((message, index) => <div key={`steer-${index}`}><span>纠正</span><p>{message}</p></div>)}
              {runtime.snapshot.queue.followUp.map((message, index) => <div key={`follow-up-${index}`}><span>后续</span><p>{message}</p></div>)}
            </div>
            <button onClick={() => void runtime.clearQueue()} aria-label="清空队列"><X size={13} /></button>
          </div> : null}
          <form className="composer" onSubmit={submit}>
            {attachments.length > 0 && <div className="attachment-list">{attachments.map((attachment, index) => <div key={`${attachment.name}-${index}`}>{attachment.kind === "image" ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" /> : <span className="attachment-file"><FileCode2 size={14} /></span>}<span>{attachment.name}</span><button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}><X size={12} /></button></div>)}</div>}
            <textarea value={draft} onChange={(event) => changeDraft(event.target.value)} onPaste={pasteImages} onKeyDown={handleComposerKeyDown} placeholder={running ? (queueMode === "steer" ? "立即纠正当前任务…" : "添加任务完成后的后续消息…") : "告诉 KivA 你想完成什么…"} rows={2} />
            <div className="composer-actions">
              <div className="composer-input-actions">
                <input ref={fileInput} className="sr-only" type="file" accept={ATTACHMENT_ACCEPT} multiple onChange={attachImages} />
                <Button type="button" variant="ghost" size="icon" onClick={() => fileInput.current?.click()} disabled={attachments.length >= 5} aria-label="添加附件"><Paperclip size={17} /></Button>
                {running ? <select className="composer-mode" aria-label="消息队列模式" value={queueMode} onChange={(event) => setQueueMode(event.target.value as "steer" | "follow_up")}><option value="steer">立即纠正</option><option value="follow_up">完成后追加</option></select> : <Button type="button" variant="ghost" size="sm" className="composer-command" onClick={() => setCommandOpen((value) => !value)}><SquareTerminal size={14} />命令</Button>}
              </div>
              <div className="composer-settings">
                <div className="composer-context" ref={contextControl}>
                  <button type="button" className="composer-context-trigger" aria-label="上下文使用量" aria-expanded={contextOpen} aria-controls="composer-context-details" title="查看上下文使用量" onClick={() => setContextOpen((value) => !value)}>
                    <svg className="context-ring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle className="context-ring-value" cx="10" cy="10" r="7" pathLength="100" strokeDasharray={`${contextPercent} 100`} /></svg><span>{formatPercent(runtime.snapshot?.context?.percent)}</span>
                  </button>
                  {contextOpen && <div id="composer-context-details" className="composer-context-popover" role="region" aria-label="上下文详情">
                    <div className="context-heading"><strong>上下文使用量</strong><span>{formatPercent(runtime.snapshot?.context?.percent)}</span></div>
                    <div className="context-track" role="progressbar" aria-label="上下文使用百分比" aria-valuemin={0} aria-valuemax={100} aria-valuenow={runtime.snapshot?.context?.percent == null ? undefined : contextPercent}><span style={{ width: `${contextPercent}%` }} /></div>
                    <div className="context-details"><span>{formatTokens(runtime.snapshot?.context?.tokens)} tokens</span><span>{runtime.snapshot?.context ? `${formatTokens(runtime.snapshot.context.contextWindow)} 上限` : "等待首次请求"}</span></div>
                    {runtime.snapshot?.context && <div className="context-details"><span>累计 {formatTokens(runtime.snapshot.context.total)}</span><span>${runtime.snapshot.context.cost.toFixed(4)}</span></div>}
                    <Button type="button" variant="ghost" size="sm" className="compact-button" disabled={running || !runtime.connected || !runtime.snapshot?.context} onClick={compactSession}>压缩上下文</Button>
                  </div>}
                </div>
                <label className="composer-select composer-model" title={runtime.snapshot?.model ? `${runtime.snapshot.model.provider} / ${runtime.snapshot.model.id}` : "选择模型"}>
                  <span>{runtime.snapshot?.model?.id ?? (bootstrap?.runtime.modelConfigFound ? "选择模型" : "未配置模型")}</span><ChevronDown size={12} aria-hidden="true" />
                  <select aria-label="选择模型" disabled={running || !runtime.connected || !runtime.snapshot?.models.length} value={runtime.snapshot?.model ? JSON.stringify({ provider: runtime.snapshot.model.provider, id: runtime.snapshot.model.id }) : ""} onChange={(event) => changeModel(event.target.value)}>
                    <option value="" disabled>选择模型</option>{runtime.snapshot?.models.map((model) => <option key={`${model.provider}:${model.id}`} value={JSON.stringify({ provider: model.provider, id: model.id })}>{model.provider} / {model.id}</option>)}
                  </select>
                </label>
                <label className="composer-select composer-thinking" title="思考强度">
                  <span>{runtime.snapshot?.thinkingLevel ?? "—"}</span><ChevronDown size={12} aria-hidden="true" />
                  <select aria-label="思考强度" disabled={running || !runtime.connected || !runtime.snapshot?.thinkingLevels.length} value={runtime.snapshot?.thinkingLevel ?? ""} onChange={(event) => void runtime.setThinking(event.target.value)}>
                    <option value="" disabled>等待运行时</option>{runtime.snapshot?.thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
              </div>
              <div className="composer-send-actions">{running && <Button type="button" variant="ghost" size="icon" onClick={runtime.abort} aria-label="停止"><StopCircle size={17} /></Button>}<Button type="submit" size="icon" className="composer-send" aria-label="发送消息" disabled={(!draft.trim() && !attachments.length) || pending || (!session && project?.capability.state !== "ready") || (Boolean(session) && !runtime.connected)}><ArrowUp size={17} /></Button></div>
            </div>
          </form>
          <div className="composer-note"><span className="composer-project-context"><SquareTerminal size={11} />本地<span>·</span><GitBranch size={11} /><span>{session?.workspace?.branch ?? (project?.capability.state === "ready" ? project.capability.branch : "—")}</span></span><span className="composer-keyboard-hint">⌘ / Ctrl + Enter 发送</span></div>
          {emptyConversation && <div className="suggestions"><button type="button" onClick={() => setDraft("解释当前代码结构")}><FileCode2 size={13} />了解代码库</button><button type="button" onClick={() => setDraft("检查最近的代码变更")}><GitBranch size={13} />检查代码变更</button><button type="button" onClick={() => setDraft("规划下一个功能")}><Wrench size={13} />规划一个功能</button></div>}
        </div>
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
