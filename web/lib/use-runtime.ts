"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RuntimeCommand, RuntimeEvent, RuntimeSnapshot, RuntimeStatus } from "@/shared/runtime-types";

export interface ToolActivity {
  id: string;
  name: string;
  status: "running" | "done" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolActivity[];
  streaming?: boolean;
}

interface RuntimeViewState {
  connected: boolean;
  status: RuntimeStatus;
  snapshot?: RuntimeSnapshot;
  messages: ChatMessage[];
  error?: string;
}

type Action =
  | { type: "connected"; value: boolean }
  | { type: "user"; message: ChatMessage }
  | { type: "event"; event: RuntimeEvent }
  | { type: "error"; message: string };

const initialState: RuntimeViewState = { connected: false, status: "connecting", messages: [] };

export function useRuntime() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const retry = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | undefined;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/runtime/events`);
      socket.onopen = () => dispatch({ type: "connected", value: true });
      socket.onmessage = (message) => {
        try { dispatch({ type: "event", event: JSON.parse(String(message.data)) as RuntimeEvent }); }
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
    dispatch({ type: "user", message: { id: crypto.randomUUID(), role: "user", text, tools: [] } });
    try { await execute({ type: "prompt", message: text }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); throw error; }
  }, [execute]);

  const abort = useCallback(async () => {
    try { await execute({ type: "abort" }); }
    catch (error) { dispatch({ type: "error", message: errorMessage(error) }); }
  }, [execute]);

  return { ...state, sendPrompt, abort };
}

function reducer(state: RuntimeViewState, action: Action): RuntimeViewState {
  if (action.type === "connected") return { ...state, connected: action.value, error: action.value ? undefined : state.error };
  if (action.type === "user") return { ...state, status: "running", messages: [...state.messages, action.message], error: undefined };
  if (action.type === "error") return { ...state, status: "error", error: action.message };
  const event = action.event;
  if (event.type === "error") return { ...state, status: "error", error: event.message };
  if (event.type === "snapshot") return { ...state, snapshot: event.snapshot, status: event.snapshot.status, error: event.snapshot.error };
  return applyPiEvent(state, event.event);
}

function applyPiEvent(state: RuntimeViewState, value: unknown): RuntimeViewState {
  const event = record(value);
  if (!event || typeof event.type !== "string") return state;
  if (event.type === "agent_start") return { ...state, status: "running", error: undefined };
  if (event.type === "agent_settled") return { ...state, status: "idle", messages: finishAssistant(state.messages) };
  if (event.type === "message_start") {
    const message = record(event.message);
    if (message?.role !== "assistant") return state;
    return { ...state, messages: ensureAssistant(state.messages) };
  }
  if (event.type === "message_update") {
    const update = record(event.assistantMessageEvent);
    if (update?.type !== "text_delta" || typeof update.delta !== "string") return state;
    return { ...state, messages: appendAssistantText(state.messages, update.delta) };
  }
  if (event.type === "message_end") {
    const message = record(event.message);
    if (message?.role !== "assistant") return state;
    const text = contentText(message.content);
    return { ...state, messages: replaceAssistantText(state.messages, text) };
  }
  if (event.type === "tool_execution_start") {
    const id = stringValue(event.toolCallId) ?? crypto.randomUUID();
    const name = stringValue(event.toolName) ?? "工具";
    return { ...state, messages: upsertTool(ensureAssistant(state.messages), { id, name, status: "running" }) };
  }
  if (event.type === "tool_execution_end") {
    const id = stringValue(event.toolCallId);
    if (!id) return state;
    return { ...state, messages: updateTool(state.messages, id, event.isError ? "error" : "done") };
  }
  return state;
}

function ensureAssistant(messages: ChatMessage[]) {
  if (messages.at(-1)?.role === "assistant" && messages.at(-1)?.streaming) return messages;
  return [...messages, { id: crypto.randomUUID(), role: "assistant" as const, text: "", tools: [], streaming: true }];
}

function appendAssistantText(messages: ChatMessage[], delta: string) {
  const next = ensureAssistant(messages);
  return next.map((message, index) => index === next.length - 1 ? { ...message, text: message.text + delta } : message);
}

function replaceAssistantText(messages: ChatMessage[], text: string) {
  const next = ensureAssistant(messages);
  return next.map((message, index) => index === next.length - 1 ? { ...message, text: text || message.text, streaming: false } : message);
}

function finishAssistant(messages: ChatMessage[]) {
  return messages.map((message) => message.role === "assistant" && message.streaming ? { ...message, streaming: false } : message);
}

function upsertTool(messages: ChatMessage[], tool: ToolActivity) {
  return messages.map((message, index) => index === messages.length - 1
    ? { ...message, tools: [...message.tools.filter((item) => item.id !== tool.id), tool] }
    : message);
}

function updateTool(messages: ChatMessage[], id: string, status: ToolActivity["status"]) {
  return messages.map((message) => ({ ...message, tools: message.tools.map((tool) => tool.id === id ? { ...tool, status } : tool) }));
}

function contentText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map(record).filter(Boolean).map((item) => item?.type === "text" && typeof item.text === "string" ? item.text : "").join("");
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) { return typeof value === "string" ? value : undefined; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }
