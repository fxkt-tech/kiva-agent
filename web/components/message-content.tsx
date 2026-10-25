"use client";

import { memo, useMemo, useState } from "react";
import { useWebPreferences } from "@/lib/web-preferences";
import { useStreamingText } from "@/lib/use-streaming-text";
import { Brain, Check, ChevronRight, CircleX, Copy, LoaderCircle, Wrench } from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";
import { AgentActivity, type AgentActivityItem } from "@/components/agents/agent-activity";
import { ReasoningText } from "@/components/agents/loading-states/reasoning-text";
import { cn } from "@/lib/utils";
import type { ChatMessage, ToolActivity } from "@/lib/use-runtime";

const WAITING_PHRASES = ["正在思考", "正在处理请求", "请稍候"];

export const MessageContent = memo(function MessageContent({ message }: { message: ChatMessage }) {
  const { preferences } = useWebPreferences();
  const [thinkingOpen, setThinkingOpen] = useState(() => preferences.conversation.thinkingExpanded);
  const text = useStreamingText(message.text, message.streaming === true);
  const thinking = useStreamingText(message.thinking, message.streaming === true);
  const hasText = message.text.trim().length > 0;
  const hasThinking = message.thinking.trim().length > 0;
  const thinkingItems = useMemo<AgentActivityItem[]>(() => [{
    id: `${message.id}:thinking`, type: "text", content: <div className="thinking-copy"><Markdown>{thinking}</Markdown></div>,
  }], [message.id, thinking]);
  const toolItems = useMemo<AgentActivityItem[]>(() => message.tools.map((tool) => ({
    id: `${message.id}:tool:${tool.id}`, type: "text", content: <ToolCard tool={tool} />,
  })), [message.id, message.tools]);
  const runningTools = message.tools.filter((tool) => tool.status === "running").length;
  const failedTools = message.tools.filter((tool) => tool.status === "error").length;
  const toolFailures = failedTools ? ` · ${failedTools} 项失败` : "";
  return <>
    {hasThinking && <AgentActivity
      className="agent-activity agent-reasoning"
      items={thinkingItems}
      status={message.streaming ? "working" : "complete"}
      open={thinkingOpen}
      onOpenChange={setThinkingOpen}
      expandWhileWorking={false}
      reserveWorkingHeight={false}
      collapseOnComplete={false}
      activeLabel="思考过程"
      summary={<><Brain size={13} className="inline-block" aria-hidden="true" /> 思考过程</>}
    />}
    {message.role === "assistant" && message.streaming && !hasText && !hasThinking && !message.tools.length && <ReasoningText
      variant="swap"
      phrases={WAITING_PHRASES}
      statusLabel="正在处理请求，请稍候"
      className="agent-waiting"
    />}
    {hasText && <div className={cn("markdown-body", message.streaming && "streaming-text")}>
      <Markdown>{text}</Markdown>
    </div>}
    {message.tools.length > 0 && <AgentActivity
      className="agent-activity agent-tools"
      items={toolItems}
      status={runningTools ? "working" : "complete"}
      defaultOpen
      reserveWorkingHeight={false}
      followWhileWorking={false}
      collapseOnComplete={false}
      activeLabel={`工具运行中 · ${runningTools} 项${toolFailures}`}
      summary={`工具记录 · ${message.tools.length} 项${toolFailures}`}
    />}
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
