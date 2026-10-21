"use client";

import { useEffect, useRef, useState } from "react";

/** Limit expensive Markdown work while keeping the complete runtime text intact. */
export function useStreamingText(value: string, streaming: boolean) {
  const [displayed, setDisplayed] = useState(value);
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latest.current = value;
    if (!streaming) {
      clearTimeout(timer.current);
      timer.current = undefined;
      setDisplayed(value);
    } else if (value !== displayed && timer.current === undefined) {
      // Keep the existing deadline when more tokens arrive; a continuous stream must not starve the display.
      timer.current = setTimeout(() => {
        timer.current = undefined;
        setDisplayed(latest.current);
      }, 80);
    }
  }, [value, streaming, displayed]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return streaming ? displayed : value;
}
