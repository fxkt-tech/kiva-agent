"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { SessionResource } from "@/shared/workspace-contract";
import type { WorkspaceRoute } from "@/features/workspace/route";
import { SessionJsonlDialog } from "./session-jsonl-dialog";
import { parseSessionViewerLink, withoutSessionViewerQuery } from "./session-viewer-link";

type ViewerSession = Pick<SessionResource, "id" | "projectId" | "name">;
interface Opening { session: ViewerSession; returnFocus?: HTMLElement | null | (() => HTMLElement | null | false); location: string }
interface SessionViewerContextValue { openSessionViewer(session: ViewerSession, returnFocus?: HTMLElement | null | (() => HTMLElement | null | false)): void; viewingSession?: ViewerSession }
const SessionViewerContext = createContext<SessionViewerContextValue | undefined>(undefined);
export function useSessionViewer() {
  const context = useContext(SessionViewerContext);
  if (!context) throw new Error("Session viewer host is missing");
  return context;
}

/** One persistent owner for row-menu and direct URL openings, independent of list limits. */
export function SessionViewerHost({ children, route, pathname, query, navigate }: { children: ReactNode; route: WorkspaceRoute; pathname: string; query: URLSearchParams; navigate(href: string, replace?: boolean): void }) {
  const [opening, setOpening] = useState<Opening>();
  const location = `${pathname}?${query}`;
  const link = useMemo(() => parseSessionViewerLink(query), [query]);
  useEffect(() => { setOpening((current) => current?.location === location ? current : undefined); }, [location]);
  const menu = opening?.location === location ? opening : undefined;
  const linked = link.open && route.projectId && route.sessionId ? { projectId: route.projectId, id: route.sessionId, name: route.sessionId } : undefined;
  const session = menu?.session ?? linked;
  const close = () => {
    setOpening(undefined);
    if (link.open) navigate(withoutSessionViewerQuery(pathname, query), true);
  };
  return <SessionViewerContext value={{ openSessionViewer: (session, returnFocus) => setOpening({ session, returnFocus, location }), viewingSession: session }}>
    {children}
    {session && <SessionJsonlDialog key={`${session.projectId}:${session.id}`} session={session} onClose={close} returnFocus={menu?.returnFocus} initialSelection={menu ? undefined : link.selection} linkError={menu ? undefined : link.error} />}
  </SessionViewerContext>;
}
