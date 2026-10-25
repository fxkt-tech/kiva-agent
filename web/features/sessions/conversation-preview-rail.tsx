"use client";

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PreviewRail, type PreviewRailItem } from "@/components/motion/preview-rail";
import type { ChatMessage } from "@/lib/use-runtime";

export function messageRailItems(messages: readonly ChatMessage[]): PreviewRailItem[] {
  return messages.filter((message) => message.role === "user").map((message, index) => {
    const text = message.text.trim();
    const excerpt = text.replace(/\s+/g, " ").slice(0, 280);
    return { id: message.id, label: `你 · ${index + 1}`, ariaLabel: `你，第 ${index + 1} 条输入${excerpt ? `：${excerpt}` : ""}`, description: excerpt };
  });
}

export function ConversationPreviewRail({ messages, viewport, content, onSelect }: {
  messages: readonly ChatMessage[];
  viewport: HTMLDivElement | null;
  content: HTMLDivElement | null;
  onSelect: (message: HTMLElement) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState<string>();
  const [geometry, setGeometry] = useState({ height: 0, scrollTop: 0 });
  const host = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const items = useMemo(() => messageRailItems(messages), [messages]);
  const ids = useMemo(() => JSON.stringify(items.map((item) => item.id)), [items]);

  useLayoutEffect(() => {
    if (!viewport || !content) {
      setVisible(false);
      setActiveId(undefined);
      return;
    }
    rows.current = new Map(Array.from(content.querySelectorAll<HTMLElement>("article.user-message[data-message-id]")).map((row) => [row.dataset.messageId!, row]));
    const ordered = [...rows.current];
    const timeline = viewport.closest(".message-timeline");
    const update = () => {
      const overflowing = viewport.scrollHeight > viewport.clientHeight + 1 && rows.current.size > 1;
      setVisible(overflowing);
      // This class reserves only the narrow mobile gutter, without replacing any content.
      timeline?.classList.toggle("has-preview-rail", overflowing);
      let current: string | undefined = ordered[0]?.[0];
      const readingLine = viewport.getBoundingClientRect().top + 48;
      // Transcript rows follow DOM order; locate the reading line without
      // measuring every historical row on each scroll event.
      let low = 0;
      let high = ordered.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (ordered[middle][1].getBoundingClientRect().top <= readingLine) low = middle + 1;
        else high = middle;
      }
      if (low > 0) current = ordered[low - 1][0];
      if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 2) current = ordered.at(-1)?.[0];
      setActiveId(current);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
      timeline?.classList.remove("has-preview-rail");
      rows.current.clear();
    };
  }, [viewport, content, ids]);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element || !visible) return;
    const measure = () => setGeometry((previous) => previous.height === element.clientHeight ? previous : { ...previous, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useLayoutEffect(() => {
    const rail = host.current?.querySelector<HTMLElement>(".conversation-preview-rail");
    const tick = rail?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!rail || !tick) return;
    const top = tick.getBoundingClientRect().top - rail.getBoundingClientRect().top + rail.scrollTop;
    if (top < rail.scrollTop) rail.scrollTop = top;
    else if (top + 18 > rail.scrollTop + rail.clientHeight) rail.scrollTop = top + 18 - rail.clientHeight;
    setGeometry((previous) => previous.scrollTop === rail.scrollTop ? previous : { ...previous, scrollTop: rail.scrollTop });
  }, [activeId, visible, geometry.height]);

  if (!visible) return null;
  const padding = Math.max(0, (Math.min(148, geometry.height) - items.length * 18) / 2);
  return <div className="conversation-preview-rail-host" ref={host} style={{ "--preview-rail-padding": `${padding}px` } as CSSProperties} onScrollCapture={(event) => {
    const scrollTop = (event.target as HTMLElement).scrollTop;
    setGeometry((previous) => previous.scrollTop === scrollTop ? previous : { ...previous, scrollTop });
  }}>
    <PreviewRail items={items} label="输入导航" activeId={activeId} highlightActive itemSize={18} previewSide="after"
      className="conversation-preview-rail" railClassName="conversation-preview-rail-ticks"
      previewContainerClassName="conversation-preview-rail-previews" previewClassName="conversation-preview-rail-preview"
      onItemSelect={(item) => { const row = rows.current.get(item.id); if (row) onSelect(row); }}
      renderPreview={(item) => {
        const center = padding + items.findIndex((candidate) => candidate.id === item.id) * 18 + 9 - geometry.scrollTop;
        const available = Math.min(Math.max(148, items.length * 18), geometry.height);
        const height = Math.min(148, available);
        const offset = Math.max(height / 2 - center, Math.min(0, available - center - height / 2));
        return <div data-slot="preview-rail-card" className="conversation-message-preview" style={{ "--preview-offset": `${offset}px`, "--preview-height": `${height}px` } as CSSProperties}>
          <strong>{item.label}</strong>{item.description && <p>{item.description}</p>}
        </div>;
      }} />
  </div>;
}
