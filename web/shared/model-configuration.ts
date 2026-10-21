import type { RuntimeModel } from "./runtime-types";

export interface ModelConfiguration { provider: string; modelId: string; thinkingLevel: string }
export interface ModelCatalog { models: RuntimeModel[]; defaults?: ModelConfiguration }

export function isModelConfiguration(value: unknown): value is ModelConfiguration {
  if (!value || typeof value !== "object") return false;
  const configuration = value as Record<string, unknown>;
  return [configuration.provider, configuration.modelId, configuration.thinkingLevel].every((field) => typeof field === "string" && field.length > 0 && field.length <= 500);
}
