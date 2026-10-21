"use client";

import { Highlight, type PrismTheme } from "prism-react-renderer";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, Check, ChevronRight, CircleX, Copy, LoaderCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ToolActivity } from "@/lib/use-runtime";

const codeTheme: PrismTheme = {
  plain: { color: "var(--code-text)", backgroundColor: "var(--subtle)" },
  styles: [
    { types: ["comment", "prolog", "doctype", "cdata"], style: { color: "var(--code-comment)" } },
    { types: ["keyword", "operator", "tag"], style: { color: "var(--code-keyword)" } },
    { types: ["string", "char", "attr-value"], style: { color: "var(--code-string)" } },
    { types: ["function", "class-name", "attr-name"], style: { color: "var(--code-function)" } },
    { types: ["number", "boolean", "constant"], style: { color: "var(--code-number)" } },
  ],
};

export function MessageContent({ message }: { message: ChatMessage }) {
  return <>
    {message.thinking && <details className="thinking-block">
      <summary><Brain size={13} />思考过程<ChevronRight size={13} className="thinking-chevron" /></summary>
      <div className="thinking-copy"><Markdown>{message.thinking}</Markdown></div>
    </details>}
    {(message.text || (!message.tools.length && message.streaming)) && <div className={cn("markdown-body", message.streaming && "streaming-text")}>
      {message.text ? <Markdown>{message.text}</Markdown> : <p>正在思考…</p>}
    </div>}
    {message.tools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}
  </>;
}

function Markdown({ children }: { children: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      pre({ children: preChildren }) {
        return <div className="markdown-pre">{preChildren}</div>;
      },
      code({ className, children: codeChildren, ...props }) {
        const language = /language-([\w-]+)/.exec(className ?? "")?.[1];
        const code = String(codeChildren).replace(/\n$/, "");
        if (!language) return <code className={className} {...props}>{codeChildren}</code>;
        return <Highlight theme={codeTheme} code={code} language={language}>
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
  const statusLabel = tool.status === "running" ? "运行中" : tool.status === "error" ? "失败" : "完成";
  const icon = tool.status === "running" ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : tool.status === "error" ? <CircleX size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />;
  return <details className="tool-card tool-details">
    <summary>
      <Wrench size={13} className="tool-icon" aria-hidden="true" />
      <span className="tool-summary" title={tool.name}>{tool.name}</span>
      <span className="tool-status" data-status={tool.status} role="img" aria-label={statusLabel} title={statusLabel}>{icon}</span>
      <ChevronRight size={14} className="tool-chevron" />
    </summary>
    <div className="tool-detail-body">
      {tool.args !== undefined && <ToolValue label="输入" value={formatValue(tool.args)} />}
      {tool.result && <ToolValue label="输出" value={tool.result} />}
    </div>
  </details>;
}

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
