"use client";

import { memo, useState } from "react";
import { useWebPreferences } from "@/lib/web-preferences";
import { useStreamingText } from "@/lib/use-streaming-text";
import { Brain, Check, ChevronRight, CircleX, Copy, LoaderCircle, Wrench } from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";
import { cn } from "@/lib/utils";
import type { ChatMessage, ToolActivity } from "@/lib/use-runtime";

export const MessageContent = memo(function MessageContent({ message }: { message: ChatMessage }) {
  const { preferences } = useWebPreferences();
  const [thinkingOpen, setThinkingOpen] = useState(() => preferences.conversation.thinkingExpanded);
  const text = useStreamingText(message.text, message.streaming === true);
  const thinking = useStreamingText(message.thinking, message.streaming === true);
  return <>
    {message.thinking && <details className="thinking-block" open={thinkingOpen} onToggle={(event) => setThinkingOpen(event.currentTarget.open)}>
      <summary><Brain size={13} />思考过程<ChevronRight size={13} className="thinking-chevron" /></summary>
      <div className="thinking-copy"><Markdown>{thinking}</Markdown></div>
    </details>}
    {(message.text || (!message.tools.length && message.streaming)) && <div className={cn("markdown-body", message.streaming && "streaming-text")}>
      {message.text ? <Markdown>{text}</Markdown> : <p>正在思考…</p>}
    </div>}
    {message.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
  </>;
});

const ToolCard = memo(function ToolCard({ tool }: { tool: ToolActivity }) {
  const { preferences } = useWebPreferences();
  const [open, setOpen] = useState(() => preferences.conversation.toolsExpanded);
  const command = tool.args && typeof tool.args === "object" && "command" in tool.args && typeof tool.args.command === "string" ? tool.args.command : undefined;
  const summary = command ? `${tool.name} · ${command}` : tool.name;
  const statusLabel = tool.status === "running" ? "运行中" : tool.status === "error" ? "失败" : "完成";
  const icon = tool.status === "running" ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : tool.status === "error" ? <CircleX size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />;
  return <details className="tool-card tool-details" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>
      <Wrench size={13} className="tool-icon" aria-hidden="true" />
      <span className="tool-summary" title={summary}>{summary}</span>
      <span className="tool-status" data-status={tool.status} role="img" aria-label={statusLabel} title={statusLabel}>{icon}</span>
      <ChevronRight size={14} className="tool-chevron" />
    </summary>
    <div className="tool-detail-body">
      {tool.args !== undefined && <ToolValue label="输入" value={formatValue(tool.args)} />}
      {tool.result && <ToolValue label="输出" value={tool.result} />}
    </div>
  </details>;
});

function ToolValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_200);
    } catch {
      // Clipboard permissions can be denied by the browser.
    }
  }
  return <div><span>{label}</span><button className="tool-copy" type="button" onClick={copy}><Copy size={11} />{copied ? "已复制" : "复制"}</button><pre>{value}</pre></div>;
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
