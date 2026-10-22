"use client";

import { memo } from "react";
import { Highlight, type PrismTheme } from "prism-react-renderer";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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

const markdownComponents: Components = {
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
};

const markdownWithoutImages: Components = {
  ...markdownComponents,
  img({ alt }) { return <span className="markdown-image-placeholder">[图片{alt ? `：${alt}` : ""}，引用见原始文本]</span>; },
};

export const Markdown = memo(function Markdown({ children, allowImages = true }: { children: string; allowImages?: boolean }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={allowImages ? markdownComponents : markdownWithoutImages}>{children}</ReactMarkdown>;
});
