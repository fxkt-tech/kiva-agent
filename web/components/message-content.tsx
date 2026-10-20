"use client";

import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, Check, ChevronRight, CircleX, LoaderCircle, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChatMessage, ToolActivity } from "@/lib/use-runtime";

export function MessageContent({ message }: { message: ChatMessage }) {
  return <>
    {message.thinking && <details className="thinking-block">
      <summary><Brain size={13} />思考过程<ChevronRight size={13} className="thinking-chevron" /></summary>
      <div className="thinking-copy"><Markdown>{message.thinking}</Markdown></div>
    </details>}
    <div className={cn("markdown-body", message.streaming && "streaming-text")}>
      {message.text ? <Markdown>{message.text}</Markdown> : message.tools.length ? <p>正在使用工具…</p> : <p>正在思考…</p>}
    </div>
    {message.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
  </>;
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ className, children: codeChildren, ...props }) {
        const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
        const code = String(codeChildren).replace(/\n$/, "");
        if (!language) return <code className={className} {...props}>{codeChildren}</code>;
        return <Highlight theme={themes.nightOwl} code={code} language={language}>
          {({ className: highlightClass, style, tokens, getLineProps, getTokenProps }) => <pre className={`${highlightClass} code-block`} style={style}>
            <div className="code-language">{language}</div>
            {tokens.map((line, index) => <div key={index} {...getLineProps({ line })}>
              <span className="line-number">{index + 1}</span>
              {line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />)}
            </div>)}
          </pre>}
        </Highlight>;
      },
    }}
  >{children}</ReactMarkdown>;
}

function ToolCard({ tool }: { tool: ToolActivity }) {
  const icon = tool.status === "running" ? <LoaderCircle size={13} className="animate-spin" /> : tool.status === "error" ? <CircleX size={13} /> : <Check size={13} />;
  return <details className="tool-card tool-details">
    <summary>
      <div className="tool-icon"><Wrench size={14} /></div>
      <div className="tool-summary"><p>{tool.name}</p><span>{tool.status === "running" ? "正在执行" : tool.status === "error" ? "执行失败" : "执行完成"}</span></div>
      <Badge className={cn("ml-auto", tool.status === "error" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300")}>{icon}{tool.status === "running" ? "运行中" : tool.status === "error" ? "失败" : "完成"}</Badge>
      <ChevronRight size={14} className="tool-chevron" />
    </summary>
    <div className="tool-detail-body">
      {tool.args !== undefined && <div><span>输入</span><pre>{formatValue(tool.args)}</pre></div>}
      {tool.result && <div><span>输出</span><pre>{tool.result}</pre></div>}
    </div>
  </details>;
}

function formatValue(value: unknown) {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
