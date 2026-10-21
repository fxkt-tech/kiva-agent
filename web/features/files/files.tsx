"use client";
import type { ResourceTarget } from "@/shared/workspace-contract";
import { WorkspaceBrowser } from "./workspace-browser";
export function FilesFeature({ target }: { target: ResourceTarget }) { return <WorkspaceBrowser target={target} kind="files" />; }
