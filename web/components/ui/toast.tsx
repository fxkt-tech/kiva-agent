"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, X } from "lucide-react";

/** Transient acknowledgement; errors requiring recovery belong in an Alert. */
export function Toast({ message, onDismiss }: { message: string; onDismiss(): void }) {
  const dismiss = useRef(onDismiss);
  const remaining = useRef(4_000);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (hovered || focused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [hovered, focused]);

  return <div className="toast" data-slot="toast" role="status" aria-live="polite" aria-atomic="true"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <CircleCheck className="toast-icon" size={18} aria-hidden="true" />
    <span className="toast-message">{message}</span>
    <button type="button" className="toast-dismiss" aria-label={`关闭提示：${message}`} onClick={onDismiss}><X size={16} aria-hidden="true" /></button>
  </div>;
}
