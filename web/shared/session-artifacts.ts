import type { RuntimeScope } from "./runtime-types";

export type ArtifactKind = "image" | "html";
export type ArtifactRelation = "written" | "referenced" | "inherited";
export interface ArtifactSource { entryId: string; toolCallId?: string; timestamp?: string }
export interface SessionArtifact {
  id: string;
  path: string;
  name: string;
  kind: ArtifactKind;
  mimeType: string;
  relations: ArtifactRelation[];
  sources: ArtifactSource[];
  availability: "available" | "missing" | "unavailable";
  message?: string;
  currentVersion: true;
  version?: string;
}
export interface SessionArtifactList extends RuntimeScope {
  artifacts: SessionArtifact[];
  revision: string;
  complete: boolean;
  warnings: string[];
}
export interface ArtifactPreviewLease extends RuntimeScope {
  artifactId: string;
  leaseId: string;
  url: string;
  expiresAt: string;
  warnings: string[];
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function isSource(value: unknown): value is ArtifactSource {
  return object(value) && typeof value.entryId === "string" && (value.toolCallId === undefined || typeof value.toolCallId === "string")
    && (value.timestamp === undefined || typeof value.timestamp === "string");
}
export function isSessionArtifact(value: unknown): value is SessionArtifact {
  return object(value) && typeof value.id === "string" && typeof value.path === "string" && typeof value.name === "string"
    && (value.kind === "image" || value.kind === "html") && typeof value.mimeType === "string" && value.currentVersion === true
    && Array.isArray(value.relations) && value.relations.every((relation) => ["written", "referenced", "inherited"].includes(relation))
    && Array.isArray(value.sources) && value.sources.every(isSource) && ["available", "missing", "unavailable"].includes(String(value.availability))
    && (value.message === undefined || typeof value.message === "string") && (value.version === undefined || typeof value.version === "string");
}
export function isSessionArtifactList(value: unknown, scope?: RuntimeScope): value is SessionArtifactList {
  return object(value) && typeof value.projectId === "string" && typeof value.sessionId === "string"
    && (!scope || value.projectId === scope.projectId && value.sessionId === scope.sessionId)
    && Array.isArray(value.artifacts) && value.artifacts.every(isSessionArtifact) && typeof value.revision === "string"
    && typeof value.complete === "boolean" && Array.isArray(value.warnings) && value.warnings.every((item) => typeof item === "string");
}
export function isArtifactPreviewLease(value: unknown, scope?: RuntimeScope, artifactId?: string): value is ArtifactPreviewLease {
  return object(value) && typeof value.projectId === "string" && typeof value.sessionId === "string"
    && (!scope || value.projectId === scope.projectId && value.sessionId === scope.sessionId)
    && typeof value.artifactId === "string" && (artifactId === undefined || value.artifactId === artifactId)
    && typeof value.leaseId === "string" && typeof value.url === "string" && value.url.startsWith("/preview/")
    && typeof value.expiresAt === "string" && Number.isFinite(Date.parse(value.expiresAt)) && Array.isArray(value.warnings) && value.warnings.every((item) => typeof item === "string");
}
