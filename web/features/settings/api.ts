import { decodeInstallationCatalog, decodeInstallationSettings, decodeProviderSaveResult, type InstallationModelCatalog, type InstallationSettings, type ProviderSaveResult, type SaveCredentialInput, type SaveDefaultsInput, type SaveProviderInput } from "@/shared/installation-settings";

const errors: Record<string, string> = {
  stale_revision: "配置已在其他位置更改，请重新加载后再保存。",
  settings_conflict: "配置已更改，请重新加载后再保存。",
  configuration_conflict: "配置已在其他位置更改，请重新加载后再保存。",
  configuration_locked: "配置正在被其他操作保存，请稍后重试。",
  unsafe_configuration: "配置文件状态不安全，已阻止写入；请检查配置后重新加载。",
  duplicate_configuration: "配置包含重复字段，已阻止写入；请修正配置后重新加载。",
  settings_unavailable: "安装设置不可用，请检查配置文件后重新加载。",
  invalid_provider: "请检查提供方 ID、接口地址及模型字段。",
  invalid_configuration: "请同时选择可用模型和受支持的思考强度。",
  invalid_credential: "API Key 格式无效；不支持命令、变量或多行内容。",
  credential_read_only: "此认证方式不能通过 API Key 编辑。",
  credential_flow_unsupported: "此提供方需要其他认证流程，不能保存单个 API Key。",
  credential_save_failed: "API Key 保存未确认，请重新加载认证状态后重试。",
  provider_read_only: "此提供方包含高级配置，不能通过简单编辑器修改。",
  provider_save_failed: "提供方未保存，请检查配置文件权限后重试。",
  provider_busy: "此提供方仍有正在运行或等待处理的任务，请完成后重试。",
  invalid_request: "请检查提供方、接口地址及模型字段。",
  configuration_read_only: "当前配置无法安全编辑，请检查配置文件后重新加载。",
};

async function read<T>(path: string, decode: (value: unknown) => T | undefined, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response;
  let value: unknown;
  try {
    response = await fetch(path, { cache: "no-store", signal, ...(body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
    value = await response.json();
  } catch (error) {
    if (signal?.aborted || error instanceof Error && error.name === "AbortError") throw error;
    // JSON parse errors can include response text; transport failures can carry URLs.
    // Neither belongs in a credential form or diagnostic surface.
    throw new Error("无法读取设置服务的响应，请重新加载后重试。");
  }
  if (!response.ok) {
    const code = value && typeof value === "object" && "code" in value && typeof value.code === "string" ? value.code : "";
    throw new Error(Object.hasOwn(errors, code) ? errors[code] : response.status === 409 ? "配置已更改或提供方正在使用中，请重新加载并在任务完成后重试。" : "操作未完成，请检查配置后重试。");
  }
  const result = decode(value);
  if (!result) throw new Error("设置响应无效，请重新加载后重试。");
  return result;
}

export const settingsApi = {
  read: (signal?: AbortSignal): Promise<InstallationSettings> => read("/api/settings", decodeInstallationSettings, undefined, signal),
  catalog: (signal?: AbortSignal): Promise<InstallationModelCatalog> => read("/api/settings/models", decodeInstallationCatalog, undefined, signal),
  defaults: (input: SaveDefaultsInput): Promise<InstallationModelCatalog> => read("/api/settings/defaults", decodeInstallationCatalog, input),
  provider: (input: SaveProviderInput): Promise<ProviderSaveResult> => read("/api/settings/providers", decodeProviderSaveResult, input),
  credential: (id: string, input: SaveCredentialInput): Promise<ProviderSaveResult> => read(`/api/settings/providers/${encodeURIComponent(id)}/credential`, decodeProviderSaveResult, input),
};
