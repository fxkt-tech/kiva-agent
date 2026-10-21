"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useMessageScroll() {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const jump = useRef<() => void>(() => {});
  const scrollToBottom = useCallback(() => jump.current(), []);

  useLayoutEffect(() => {
    if (!viewport || !content) return;
    const element = viewport;
    let following = true;
    let frame: number | undefined;
    let lastFrame = 0;
    let lastTop = viewport.scrollTop;
    let touchY: number | undefined;
    let buttonVisible = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bottom = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const updateButton = () => {
      const visible = !following && bottom() - viewport.scrollTop > 1;
      if (visible !== buttonVisible) {
        buttonVisible = visible;
        setAwayFromBottom(visible);
      }
    };

    function cancelFrame() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      lastFrame = 0;
    }
    function pause() {
      following = false;
      cancelFrame();
      updateButton();
    }
    function writePosition(top: number) {
      element.scrollTop = top;
      lastTop = element.scrollTop;
    }
    function animate(time: number) {
      frame = undefined;
      if (!following) return;
      const target = bottom();
      const distance = target - element.scrollTop;
      if (distance <= 1 || reducedMotion.matches) {
        writePosition(target);
        lastFrame = 0;
        return;
      }
      const elapsed = lastFrame ? Math.min(32, time - lastFrame) : 16;
      lastFrame = time;
      writePosition(element.scrollTop + Math.max(1, distance * (1 - Math.exp(-elapsed / 90))));
      frame = requestAnimationFrame(animate);
    }
    function follow() {
      if (following && frame === undefined) frame = requestAnimationFrame(animate);
      updateButton();
    }
    function onScroll() {
      const top = element.scrollTop;
      const movement = top - lastTop;
      lastTop = top;
      // Layout shrinkage can clamp scrollTop without the reader scrolling upward.
      if (movement < -1 && bottom() - top > 1) pause();
      else if (movement > 0 && bottom() - top <= 24) {
        following = true;
        follow();
      }
      updateButton();
    }
    function onWheel(event: WheelEvent) {
      if (event.deltaY < 0) pause();
    }
    function onTouchStart(event: TouchEvent) {
      touchY = event.touches[0]?.clientY;
    }
    function onTouchMove(event: TouchEvent) {
      const nextY = event.touches[0]?.clientY;
      if (touchY !== undefined && nextY !== undefined && nextY > touchY) pause();
      touchY = nextY;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home" || (event.key === " " && event.shiftKey)) pause();
    }
    jump.current = () => {
      following = true;
      viewport.focus({ preventScroll: true });
      follow();
    };

    // Open each session at its latest message without animating through its history.
    writePosition(bottom());
    setAwayFromBottom(false);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("wheel", onWheel, { passive: true });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: true });
    viewport.addEventListener("keydown", onKeyDown);
    const observer = new ResizeObserver(follow);
    observer.observe(viewport);
    observer.observe(content);
    return () => {
      observer.disconnect();
      cancelFrame();
      jump.current = () => {};
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("keydown", onKeyDown);
    };
  }, [viewport, content]);

  return { setViewport, setContent, awayFromBottom, scrollToBottom };
}
