"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

export function useMessageScroll() {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const jump = useRef<() => void>(() => {});
  const seek = useRef<(message: HTMLElement) => void>(() => {});
  const scrollToMessage = useCallback((message: HTMLElement) => seek.current(message), []);
  const scrollToBottom = useCallback(() => jump.current(), []);

  useLayoutEffect(() => {
    if (!viewport || !content) return;
    const element = viewport;
    let following = true;
    let seekTarget: number | undefined;
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
      seekTarget = undefined;
      cancelFrame();
      updateButton();
    }
    function writePosition(top: number) {
      element.scrollTop = top;
      lastTop = element.scrollTop;
    }
    function animate(time: number) {
      frame = undefined;
      if (!following && seekTarget === undefined) return;
      const target = seekTarget === undefined ? bottom() : Math.min(bottom(), seekTarget);
      const distance = target - element.scrollTop;
      if (Math.abs(distance) <= 1 || reducedMotion.matches) {
        writePosition(target);
        lastFrame = 0;
        seekTarget = undefined;
        updateButton();
        return;
      }
      const elapsed = lastFrame ? Math.min(32, time - lastFrame) : 16;
      lastFrame = time;
      writePosition(element.scrollTop + Math.sign(distance) * Math.max(1, Math.abs(distance) * (1 - Math.exp(-elapsed / 90))));
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
      if (seekTarget !== undefined) {
        if (Math.abs(movement) > 1) pause();
        updateButton();
        return;
      }
      if (movement < -1 && bottom() - top > 1) pause();
      else if (movement > 0 && bottom() - top <= 24) {
        following = true;
        follow();
      }
      updateButton();
    }
    function onWheel(event: WheelEvent) {
      if (seekTarget !== undefined || event.deltaY < 0) pause();
    }
    function onTouchStart(event: TouchEvent) {
      touchY = event.touches[0]?.clientY;
    }
    function onTouchMove(event: TouchEvent) {
      const nextY = event.touches[0]?.clientY;
      if (seekTarget !== undefined || (touchY !== undefined && nextY !== undefined && nextY > touchY)) pause();
      touchY = nextY;
    }
    function onKeyDown(event: KeyboardEvent) {
      if ((seekTarget !== undefined && ["ArrowDown", "PageDown", "End", " "].includes(event.key)) || event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home" || (event.key === " " && event.shiftKey)) pause();
    }
    jump.current = () => {
      seekTarget = undefined;
      cancelFrame();
      following = true;
      viewport.focus({ preventScroll: true });
      follow();
    };

    seek.current = (message) => {
      pause();
      const target = element.scrollTop + message.getBoundingClientRect().top - element.getBoundingClientRect().top - 16;
      seekTarget = Math.max(0, Math.min(bottom(), target));
      frame = requestAnimationFrame(animate);
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
      seek.current = () => {};
      viewport.removeEventListener("scroll", onScroll);
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("keydown", onKeyDown);
    };
  }, [viewport, content]);

  return { viewport, content, setViewport, setContent, awayFromBottom, scrollToBottom, scrollToMessage };
}
