"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import { decodeRuntimeWireEvent, type RuntimeAttachment, type RuntimeCommand, type RuntimeEvent, type RuntimeMessage, type RuntimeSnapshot, type RuntimeStatus, type RuntimeTool, type RuntimeUIRequest } from "@/shared/runtime-types";
import { normalizeMessageTimestamp } from "@/shared/message-time";
import type { ResourceTarget } from "@/shared/workspace-contract";
import { resourceApi } from "@/features/workspace/resources";

export type ToolActivity = RuntimeTool;
export type RuntimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface ChatMessage extends RuntimeMessage {
  streaming?: boolean;
}

interface RuntimeViewState {
  connected: boolean;
  connectionStatus: RuntimeConnectionStatus;
  status: RuntimeStatus;
  snapshot?: RuntimeSnapshot;
  messages: ChatMessage[];
  sessionsVersion: number;
  error?: string;
  uiRequest?: RuntimeUIRequest;
}

type Action =
  | { type: "reset" }
  | { type: "connection"; value: RuntimeConnectionStatus }
  | { type: "stream_changed" }
  | { type: "user"; message: ChatMessage }
  | { type: "event"; event: RuntimeEvent }
  | { type: "error"; message: string }
  | { type: "ui_answered" };

const initialState: RuntimeViewState = { connected: false, connectionStatus: "connecting", status: "connecting", messages: [], sessionsVersion: 0 };

export function useRuntime(target?: ResourceTarget) {
  const [state, rawDispatch] = useReducer(reducer, initialState);
  const key = target?.sessionId ? `${target.projectId}/${target.sessionId}` : "";
  const selectedKey = useRef(key);
  selectedKey.current = key;
  const dispatch = useCallback((action: Action) => { if (selectedKey.current === key) rawDispatch(action); }, [key]);
  const renderedKey = useRef(key);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const streamId = useRef<string>(undefined);
  const sequence = useRef(0);

  useEffect(() => {
    renderedKey.current = key;
    dispatch({ type: "reset" });
    streamId.current = undefined;
    sequence.current = 0;
    if (!target?.sessionId) return;
    let disposed = false;
    let socket: WebSocket | undefined;
    const connect = () => {
      if (disposed) return;
      const cursor = new URLSearchParams();
      if (streamId.current) cursor.set("stream", streamId.current);
      if (sequence.current) cursor.set("since", String(sequence.current));
      const suffix = cursor.size ? `?${cursor}` : "";
      const currentSocket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${resourceApi(target)}/events${suffix}`);
      socket = currentSocket;
      const isCurrent = () => !disposed && selectedKey.current === key && socket === currentSocket;
      currentSocket.onopen = () => { if (isCurrent()) dispatch({ type: "connection", value: "connected" }); };
      currentSocket.onmessage = (message) => {
        try {
          if (!isCurrent()) return;
          const decoded = JSON.parse(String(message.data));
          if (typeof decoded.error === "string") { dispatch({ type: "error", message: decoded.error }); return; }
          const wire = decodeRuntimeWireEvent(decoded, { projectId: target.projectId, sessionId: target.sessionId! });
          if (!wire) return;
          if (wire.resync) {
            streamId.current = wire.streamId;
            sequence.current = wire.seq;
            dispatch({ type: "stream_changed" });
            return;
          }
          if (streamId.current !== wire.streamId) {
            streamId.current = wire.streamId;
            sequence.current = 0;
            dispatch({ type: "stream_changed" });
          }
          if (!Number.isSafeInteger(wire.seq) || wire.seq <= sequence.current) return;
          sequence.current = wire.seq;
          dispatch({ type: "event", event: wire.event });
        }
        catch { dispatch({ type: "error", message: "收到无法解析的运行时事件" }); }
      };
      currentSocket.onclose = (event) => {
        if (!isCurrent()) return;
        socket = undefined;
        const terminal = event.code === 1008;
        dispatch({ type: "connection", value: terminal ? "disconnected" : "reconnecting" });
        if (!terminal) retry.current = setTimeout(connect, 1_500);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry.current);
      socket?.close();
    };
  }, [key]);

  const execute = useCallback(async (command: RuntimeCommand) => {
    if (!target?.sessionId) throw new Error("请先创建会话");
    const response = await fetch(`${resourceApi(target)}/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "运行时命令失败");
  }, [key]);

  const sendPrompt = useCallback(async (message: string, attachments: RuntimeAttachment[] = []) => {
    const text = message.trim();
    if (!text && !attachments.length) return;
    dispatch({ type: "user", message: { id: crypto.randomUUID(), timestamp: Date.now(), role: "user", text: text || "请查看附件。", thinking: "", tools: [] } });
    try { await execute({ type: "prompt", message: text, images: attachments.filter((item) => item.kind === "image"), files: attachments.filter((item) => item.kind === "text") }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const abort = useCallback(async () => {
    try { await execute({ type: "abort" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const renameSession = useCallback(async (name: string) => {
    try { await execute({ type: "rename_session", name }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const queueMessage = useCallback(async (message: string, mode: "steer" | "follow_up", attachments: RuntimeAttachment[] = []) => {
    try { await execute({ type: mode, message, images: attachments.filter((item) => item.kind === "image"), files: attachments.filter((item) => item.kind === "text") }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const clearQueue = useCallback(async () => {
    try { await execute({ type: "clear_queue" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const compact = useCallback(async () => {
    try { await execute({ type: "compact" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const respondToUI = useCallback(async (response: { id: string; value?: string; confirmed?: boolean; cancelled?: true }) => {
    try {
      await execute({ type: "extension_ui_response", ...response });
      dispatch({ type: "ui_answered" });
    } catch (error) {
      dispatch({ type: "error", message: errorMessage(error) });
    }
  }, [execute]);

  const initialize = useCallback(async () => {
    try { await execute({ type: "initialize" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  return { ...(renderedKey.current === key ? state : initialState), sendPrompt, abort, initialize, renameSession, queueMessage, clearQueue, compact, respondToUI };
}

function reducer(state: RuntimeViewState, action: Action): RuntimeViewState {
  if (action.type === "reset") return initialState;
  if (action.type === "connection") return { ...state, connectionStatus: action.value, connected: action.value === "connected", error: action.value === "connected" ? undefined : state.error };
  if (action.type === "stream_changed") return { ...state, snapshot: undefined, uiRequest: undefined };
  if (action.type === "user") return { ...state, status: "running", messages: [...state.messages, action.message], error: undefined };
  if (action.type === "error") return { ...state, status: "error", error: action.message };
  if (action.type === "ui_answered") return { ...state, uiRequest: undefined };
  const event = action.event;
  if (event.type === "error") return { ...state, status: "error", error: event.message };
  if (event.type === "runtime_reset") return { ...state, snapshot: undefined, uiRequest: undefined };
  if (event.type === "snapshot") {
    const sessionChanged = state.snapshot?.session.id !== event.snapshot.session.id;
    return {
      ...state,
      snapshot: event.snapshot,
      status: event.snapshot.status,
      messages: event.snapshot.messages.map((message, index, messages) => ({ ...message, streaming: event.snapshot.status === "running" && message.role === "assistant" && index === messages.length - 1 })),
      sessionsVersion: sessionChanged ? state.sessionsVersion + 1 : state.sessionsVersion,
      error: event.snapshot.error,
      uiRequest: event.snapshot.uiRequest,
    };
  }
  return applyPiEvent(state, event.event);
}

function applyPiEvent(state: RuntimeViewState, value: unknown): RuntimeViewState {
  const event = record(value);
  if (!event || typeof event.type !== "string") return state;
  if (event.type === "extension_ui_request" && isInteractiveUIRequest(event)) {
    return { ...state, uiRequest: event as unknown as RuntimeUIRequest };
  }
  if (event.type === "agent_start") return { ...state, status: "running", error: undefined };
  if (event.type === "agent_settled") return { ...state, status: "idle", messages: finishAssistant(state.messages), sessionsVersion: state.sessionsVersion + 1, uiRequest: undefined };
  if (event.type === "session_info_changed") return { ...state, sessionsVersion: state.sessionsVersion + 1 };
  if (event.type === "message_start") {
    const message = record(event.message);
    const timestamp = normalizeMessageTimestamp(message?.timestamp);
    if (message?.role === "user") {
      const text = displayPrompt(messageText(message.content));
      if (!text) return state;
      if (state.messages.at(-1)?.role === "user" && state.messages.at(-1)?.text === text) {
        return timestamp === undefined ? state : { ...state, messages: state.messages.map((item, index) => index === state.messages.length - 1 ? { ...item, timestamp } : item) };
      }
      return { ...state, messages: [...state.messages, { id: crypto.randomUUID(), timestamp, role: "user", text, thinking: "", tools: [] }] };
    }
    if (message?.role !== "assistant") return state;
    // A start is a new assistant turn. Snapshot handshakes already include any
    // prior start; only subsequent deltas/end continue the snapshot's last row.
    return { ...state, messages: [...state.messages, { id: crypto.randomUUID(), timestamp, role: "assistant", text: "", thinking: "", tools: [], streaming: true }] };
  }
  if (event.type === "message_update") {
    const update = record(event.assistantMessageEvent);
    if (typeof update?.delta !== "string") return state;
    const timestamp = normalizeMessageTimestamp(record(event.message)?.timestamp);
    if (update.type === "text_delta") return { ...state, messages: appendAssistantField(state.messages, "text", update.delta, timestamp) };
    if (update.type === "thinking_delta") return { ...state, messages: appendAssistantField(state.messages, "thinking", update.delta, timestamp) };
    return state;
  }
  if (event.type === "message_end") {
    const message = record(event.message);
    if (message?.role !== "assistant") return state;
    const content = assistantContent(message.content);
    return { ...state, messages: replaceAssistantContent(state.messages, content, normalizeMessageTimestamp(message.timestamp)) };
  }
  if (event.type === "tool_execution_start") {
    const id = stringValue(event.toolCallId) ?? crypto.randomUUID();
    const name = stringValue(event.toolName) ?? "工具";
    const messages = state.messages.at(-1)?.role === "assistant" ? state.messages : ensureAssistant(state.messages);
    return { ...state, messages: upsertTool(messages, { id, name, args: event.args, status: "running" }) };
  }
  if (event.type === "tool_execution_end") {
    const id = stringValue(event.toolCallId);
    if (!id) return state;
    return { ...state, messages: updateTool(state.messages, id, event.isError ? "error" : "done", resultText(event.result)) };
  }
  if (event.type === "tool_execution_update") {
    const id = stringValue(event.toolCallId);
    if (!id) return state;
    return { ...state, messages: updateTool(state.messages, id, "running", resultText(event.partialResult)) };
  }
  if (event.type === "queue_update" && state.snapshot) {
    return {
      ...state,
      snapshot: {
        ...state.snapshot,
        queue: { steering: stringArray(event.steering), followUp: stringArray(event.followUp) },
      },
    };
  }
  return state;
}

function isInteractiveUIRequest(event: Record<string, unknown>) {
  return typeof event.id === "string" && typeof event.title === "string"
    && ["select", "confirm", "input", "editor"].includes(String(event.method));
}

function ensureAssistant(messages: ChatMessage[], timestamp?: number) {
  if (messages.at(-1)?.role === "assistant" && messages.at(-1)?.streaming) {
    return timestamp === undefined ? messages : messages.map((message, index) => index === messages.length - 1 ? { ...message, timestamp } : message);
  }
  return [...messages, { id: crypto.randomUUID(), timestamp, role: "assistant" as const, text: "", thinking: "", tools: [], streaming: true }];
}

function appendAssistantField(messages: ChatMessage[], field: "text" | "thinking", delta: string, timestamp?: number) {
  const next = ensureAssistant(messages, timestamp);
  return next.map((message, index) => index === next.length - 1 ? { ...message, [field]: message[field] + delta } : message);
}

function replaceAssistantContent(messages: ChatMessage[], content: { text: string; thinking: string }, timestamp?: number) {
  const next = ensureAssistant(messages, timestamp);
  return next.map((message, index) => index === next.length - 1 ? { ...message, text: content.text || message.text, thinking: content.thinking || message.thinking, streaming: false } : message);
}

function finishAssistant(messages: ChatMessage[]) {
  return messages.map((message) => message.role === "assistant" && message.streaming ? { ...message, streaming: false } : message);
}

function upsertTool(messages: ChatMessage[], tool: ToolActivity) {
  return messages.map((message, index) => index === messages.length - 1
    ? { ...message, tools: [...message.tools.filter((item) => item.id !== tool.id), tool] }
    : message);
}

function updateTool(messages: ChatMessage[], id: string, status: ToolActivity["status"], result?: string) {
  return messages.map((message) => ({ ...message, tools: message.tools.map((tool) => tool.id === id ? { ...tool, status, result } : tool) }));
}

function assistantContent(value: unknown) {
  if (!Array.isArray(value)) return { text: "", thinking: "" };
  const items = value.map(record).filter(Boolean);
  return {
    text: items.map((item) => item?.type === "text" && typeof item.text === "string" ? item.text : "").join(""),
    thinking: items.map((item) => item?.type === "thinking" && typeof item.thinking === "string" ? item.thinking : "").join("\n"),
  };
}

function resultText(value: unknown) {
  if (typeof value === "string") return value;
  const item = record(value);
  if (item && "content" in item && Array.isArray(item.content)) return item.content.map(record).map((part) => part?.type === "text" ? stringValue(part.text) ?? "" : "").join("");
  try { return JSON.stringify(value, null, 2); } catch { return String(value ?? ""); }
}

function messageText(value: unknown) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(record).map((item) => item?.type === "text" ? stringValue(item.text) ?? "" : "").join("");
}

function displayPrompt(message: string) {
  return message.replace(/<attached_file name="([^"]+)">[\s\S]*?<\/attached_file>/g, "[附件: $1]").trim();
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) { return typeof value === "string" ? value : undefined; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
