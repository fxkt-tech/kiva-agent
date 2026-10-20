"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RuntimeCommand, RuntimeEvent, RuntimeMessage, RuntimeSnapshot, RuntimeStatus, RuntimeTool, RuntimeWireEvent } from "@/shared/runtime-types";

export type ToolActivity = RuntimeTool;

export interface ChatMessage extends RuntimeMessage {
  streaming?: boolean;
}

interface RuntimeViewState {
  connected: boolean;
  status: RuntimeStatus;
  snapshot?: RuntimeSnapshot;
  messages: ChatMessage[];
  sessionsVersion: number;
  error?: string;
}

type Action =
  | { type: "connected"; value: boolean }
  | { type: "user"; message: ChatMessage }
  | { type: "event"; event: RuntimeEvent }
  | { type: "error"; message: string };

const initialState: RuntimeViewState = { connected: false, status: "connecting", messages: [], sessionsVersion: 0 };

export function useRuntime() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const streamId = useRef<string>(undefined);
  const sequence = useRef(0);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    const connect = () => {
      if (disposed) return;
      const cursor = new URLSearchParams();
      if (streamId.current) cursor.set("stream", streamId.current);
      if (sequence.current) cursor.set("since", String(sequence.current));
      const suffix = cursor.size ? `?${cursor}` : "";
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/runtime/events${suffix}`);
      socket.onopen = () => dispatch({ type: "connected", value: true });
      socket.onmessage = (message) => {
        try {
          const wire = JSON.parse(String(message.data)) as RuntimeWireEvent;
          if (streamId.current !== wire.streamId) {
            streamId.current = wire.streamId;
            sequence.current = 0;
          }
          if (!Number.isSafeInteger(wire.seq) || wire.seq <= sequence.current) return;
          sequence.current = wire.seq;
          dispatch({ type: "event", event: wire.event });
        }
        catch { dispatch({ type: "error", message: "收到无法解析的运行时事件" }); }
      };
      socket.onerror = () => dispatch({ type: "error", message: "无法连接到 Kiva 运行时" });
      socket.onclose = () => {
        dispatch({ type: "connected", value: false });
        if (!disposed) retry.current = setTimeout(connect, 1_500);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry.current);
      socket?.close();
    };
  }, []);

  const execute = useCallback(async (command: RuntimeCommand) => {
    const response = await fetch("/api/runtime/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "运行时命令失败");
  }, []);

  const sendPrompt = useCallback(async (message: string) => {
    const text = message.trim();
    if (!text) return;
    dispatch({ type: "user", message: { id: crypto.randomUUID(), role: "user", text, thinking: "", tools: [] } });
    try { await execute({ type: "prompt", message: text }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const abort = useCallback(async () => {
    try { await execute({ type: "abort" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const switchSession = useCallback(async (sessionPath: string) => {
    try {
      await execute({ type: "switch_session", sessionPath });
    } catch (error) {
      dispatch({ type: "error", message: errorMessage(error) });
      throw error;
    }
  }, [execute]);

  const newSession = useCallback(async () => {
    try { await execute({ type: "new_session" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const renameSession = useCallback(async (name: string) => {
    try { await execute({ type: "rename_session", name }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const queueMessage = useCallback(async (message: string, mode: "steer" | "follow_up") => {
    try { await execute({ type: mode, message }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const clearQueue = useCallback(async () => {
    try { await execute({ type: "clear_queue" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const setModel = useCallback(async (provider: string, modelId: string) => {
    try { await execute({ type: "set_model", provider, modelId }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const setThinking = useCallback(async (level: string) => {
    try { await execute({ type: "set_thinking", level }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  const compact = useCallback(async () => {
    try { await execute({ type: "compact" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  return { ...state, sendPrompt, abort, switchSession, newSession, renameSession, queueMessage, clearQueue, setModel, setThinking, compact };
}

function reducer(state: RuntimeViewState, action: Action): RuntimeViewState {
  if (action.type === "connected") return { ...state, connected: action.value, snapshot: action.value ? state.snapshot : undefined, error: action.value ? undefined : state.error };
  if (action.type === "user") return { ...state, status: "running", messages: [...state.messages, action.message], error: undefined };
  if (action.type === "error") return { ...state, status: "error", error: action.message };
  const event = action.event;
  if (event.type === "error") return { ...state, status: "error", error: event.message };
  if (event.type === "snapshot") {
    const sessionChanged = state.snapshot?.session.id !== event.snapshot.session.id;
    return {
      ...state,
      snapshot: event.snapshot,
      status: event.snapshot.status,
      messages: sessionChanged || state.messages.length === 0 ? event.snapshot.messages : state.messages,
      sessionsVersion: sessionChanged ? state.sessionsVersion + 1 : state.sessionsVersion,
      error: event.snapshot.error,
    };
  }
  return applyPiEvent(state, event.event);
}

function applyPiEvent(state: RuntimeViewState, value: unknown): RuntimeViewState {
  const event = record(value);
  if (!event || typeof event.type !== "string") return state;
  if (event.type === "agent_start") return { ...state, status: "running", error: undefined };
  if (event.type === "agent_settled") return { ...state, status: "idle", messages: finishAssistant(state.messages), sessionsVersion: state.sessionsVersion + 1 };
  if (event.type === "session_info_changed") return { ...state, sessionsVersion: state.sessionsVersion + 1 };
  if (event.type === "message_start") {
    const message = record(event.message);
    if (message?.role === "user") {
      const text = messageText(message.content);
      if (!text || (state.messages.at(-1)?.role === "user" && state.messages.at(-1)?.text === text)) return state;
      return { ...state, messages: [...state.messages, { id: crypto.randomUUID(), role: "user", text, thinking: "", tools: [] }] };
    }
    if (message?.role !== "assistant") return state;
    return { ...state, messages: ensureAssistant(state.messages) };
  }
  if (event.type === "message_update") {
    const update = record(event.assistantMessageEvent);
    if (typeof update?.delta !== "string") return state;
    if (update.type === "text_delta") return { ...state, messages: appendAssistantField(state.messages, "text", update.delta) };
    if (update.type === "thinking_delta") return { ...state, messages: appendAssistantField(state.messages, "thinking", update.delta) };
    return state;
  }
  if (event.type === "message_end") {
    const message = record(event.message);
    if (message?.role !== "assistant") return state;
    const content = assistantContent(message.content);
    return { ...state, messages: replaceAssistantContent(state.messages, content) };
  }
  if (event.type === "tool_execution_start") {
    const id = stringValue(event.toolCallId) ?? crypto.randomUUID();
    const name = stringValue(event.toolName) ?? "工具";
    return { ...state, messages: upsertTool(ensureAssistant(state.messages), { id, name, args: event.args, status: "running" }) };
  }
  if (event.type === "tool_execution_end") {
    const id = stringValue(event.toolCallId);
    if (!id) return state;
    return { ...state, messages: updateTool(state.messages, id, event.isError ? "error" : "done", resultText(event.result)) };
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

function ensureAssistant(messages: ChatMessage[]) {
  if (messages.at(-1)?.role === "assistant" && messages.at(-1)?.streaming) return messages;
  return [...messages, { id: crypto.randomUUID(), role: "assistant" as const, text: "", thinking: "", tools: [], streaming: true }];
}

function appendAssistantField(messages: ChatMessage[], field: "text" | "thinking", delta: string) {
  const next = ensureAssistant(messages);
  return next.map((message, index) => index === next.length - 1 ? { ...message, [field]: message[field] + delta } : message);
}

function replaceAssistantContent(messages: ChatMessage[], content: { text: string; thinking: string }) {
  const next = ensureAssistant(messages);
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

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) { return typeof value === "string" ? value : undefined; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
