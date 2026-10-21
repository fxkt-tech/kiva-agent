import { join } from "node:path";
import { ModelRuntime, SettingsManager } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai/compat";
import type { Credential } from "@earendil-works/pi-ai";
import type { ModelCatalog, ModelConfiguration } from "../shared/model-configuration";
import { WorkspaceError } from "../shared/workspace-contract";
import { noWriteModelsStore } from "./provider-configuration";
import { isRecord, ownValue, readSettingsFile } from "./settings-files";

/** Installation-owned options, independent of a Pi process or session identity. */
async function loadModels(installationRoot: string) {
  const agentDir = join(installationRoot, ".kiva", "agent");
  const [, authentication] = await Promise.all([readSettingsFile(installationRoot, "models.json"), readSettingsFile(installationRoot, "auth.json")]).catch(() => { throw new WorkspaceError("models_unavailable", "无法读取模型配置，请检查 models.json 和认证配置。", 409); });
  const readOnly = async (): Promise<never> => { throw new Error("Model discovery cannot modify credentials or model caches"); };
  const runtime = await ModelRuntime.create({
    modelsPath: join(agentDir, "models.json"),
    allowModelNetwork: false,
    credentials: {
      // Pi's read-only auth checks retain existing ambient/provider support.
      // Give them presence-only keys, never resolve stored command/templates.
      read: async (provider): Promise<Credential | undefined> => {
        const raw = ownValue(authentication.value, provider);
        if (!isRecord(raw)) return;
        if (raw.type === "oauth") return { type: "oauth", access: "configured", refresh: "configured", expires: Number.MAX_SAFE_INTEGER };
        if (raw.type !== "api_key") return;
        const env = isRecord(raw.env) && Object.values(raw.env).every((value) => typeof value === "string") ? raw.env as Record<string, string> : undefined;
        return { type: "api_key", ...(typeof raw.key === "string" && raw.key ? { key: "configured" } : {}), ...(env ? { env } : {}) };
      },
      list: async () => [],
      modify: readOnly,
      delete: readOnly,
    },
    modelsStore: noWriteModelsStore,
  });
  if (runtime.getError()) throw new Error("无法读取模型配置，请检查安装目录中的 .kiva/agent/models.json 和认证配置。");
  return runtime.getAvailableSnapshot();
}

function loadSettings(installationRoot: string) {
  const settings = SettingsManager.create(installationRoot, join(installationRoot, ".kiva", "agent"), { projectTrusted: false });
  if (settings.drainErrors().some((error) => error.scope === "global")) throw new WorkspaceError("settings_unavailable", "无法读取 Pi 默认设置，请检查安装目录中的 .kiva/agent/settings.json。", 409);
  return settings;
}

function defaultConfiguration(settings: SettingsManager): ModelConfiguration | undefined {
  const stored = settings.getGlobalSettings();
  return typeof stored.defaultProvider === "string" && typeof stored.defaultModel === "string" ? {
    provider: stored.defaultProvider, modelId: stored.defaultModel,
    thinkingLevel: stored.modelThinkingLevels?.[`${stored.defaultProvider}/${stored.defaultModel}`] ?? stored.defaultThinkingLevel ?? "medium",
  } : undefined;
}

export function readModelDefaults(installationRoot: string) { return defaultConfiguration(loadSettings(installationRoot)); }

function projectCatalog(models: Awaited<ReturnType<typeof loadModels>>, settings: SettingsManager): ModelCatalog {
  return { models: models.map((model) => ({ provider: model.provider, id: model.id, contextWindow: model.contextWindow, reasoning: model.reasoning, thinkingLevels: getSupportedThinkingLevels(model) })), defaults: defaultConfiguration(settings) };
}

export async function readModelCatalog(installationRoot: string): Promise<ModelCatalog> {
  return projectCatalog(await loadModels(installationRoot), loadSettings(installationRoot));
}

/** Explicit save only. Pi owns locking/merging; unrelated settings and credentials stay untouched. */
export async function saveModelDefaults(installationRoot: string, selection: ModelConfiguration, apply?: () => Promise<void>): Promise<ModelCatalog> {
  const models = await loadModels(installationRoot);
  const model = models.find((model) => model.provider === selection.provider && model.id === selection.modelId);
  if (!model) throw new WorkspaceError("model_unavailable", "所选模型已不可用，请重新加载模型列表。", 409);
  const level = getSupportedThinkingLevels(model).find((level) => level === selection.thinkingLevel);
  if (!level) throw new WorkspaceError("thinking_unavailable", "所选模型不支持此思考强度，请重新选择。", 409);
  const settings = loadSettings(installationRoot);
  await apply?.();
  settings.setDefaultModelAndProvider(selection.provider, selection.modelId);
  settings.setDefaultThinkingLevel(level);
  // Pi gives model-specific preferences precedence over the global thinking default.
  settings.setModelThinkingLevel(selection.provider, selection.modelId, level);
  await settings.flush();
  if (settings.drainErrors().length) throw new WorkspaceError("defaults_save_failed", apply ? "已应用到当前会话，但 Pi 默认设置保存失败，请重试。" : "Pi 默认设置保存失败，请检查文件权限后重试。", 500);
  return projectCatalog(models, settings);
}
