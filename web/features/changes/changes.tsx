"use client";
import type { ResourceTarget } from "@/shared/workspace-contract";
import { WorkspaceBrowser } from "@/features/files/workspace-browser";
export function ChangesFeature({ target }: { target: ResourceTarget }) { return <WorkspaceBrowser target={target} kind="changes" />; }
