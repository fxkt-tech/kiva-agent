"use client";

import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const OverlayLayerContext = createContext(100);

/** React context survives portals, so nested overlays always sit above their owner. */
export function OverlayLayer({ children }: { children: ReactNode }) {
  const parent = useContext(OverlayLayerContext);
  return <OverlayLayerContext value={parent + 20}>{children}</OverlayLayerContext>;
}

export function useOverlayLayer() {
  return useContext(OverlayLayerContext);
}

export function mergeClassName<State>(base: string, className?: string | ((state: State) => string | undefined)) {
  return typeof className === "function" ? (state: State) => cn(base, className(state)) : cn(base, className);
}

export function overlayStyle<State>(zIndex: number, style?: CSSProperties | ((state: State) => CSSProperties | undefined)) {
  return typeof style === "function" ? (state: State) => ({ zIndex, ...style(state) }) : { zIndex, ...style };
}
