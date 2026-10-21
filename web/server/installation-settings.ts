import type { ModelConfiguration } from "../shared/model-configuration";
import type { InstallationModelCatalog, ProviderDefinition, ProviderSaveResult } from "../shared/installation-settings";
import { WorkspaceError } from "../shared/workspace-contract";
import { readModelCatalog, saveModelDefaults } from "./model-catalog";
import { ProviderConfiguration } from "./provider-configuration";
import { EditRevisions, readSettingsFile, settingsError } from "./settings-files";
import type { RuntimeManager } from "./runtime-manager";

/** One installation coordinator for both settings and the legacy composer pair save. */
export class InstallationSettingsService {
  private writes: Promise<void> = Promise.resolve();
  private revisions = new EditRevisions();
  readonly providers: ProviderConfiguration;
  constructor(readonly root: string, private readonly manager: RuntimeManager) { this.providers = new ProviderConfiguration(root); }
  read() { return this.safe(() => this.providers.metadata()); }
  private async catalogFingerprint() {
    const snapshots = await Promise.all(["settings.json", "models.json", "auth.json"].map((name) => readSettingsFile(this.root, name as "settings.json" | "models.json" | "auth.json")));
    return snapshots.map((snapshot) => snapshot.fingerprint).join(":");
  }
  async catalog(): Promise<InstallationModelCatalog> {
    return this.safe(async () => {
      const before = await this.catalogFingerprint(), catalog = await readModelCatalog(this.root), after = await this.catalogFingerprint();
      if (before !== after) throw settingsError("configuration_conflict", "模型配置已变化，请重新加载。");
      return { ...catalog, revision: this.revisions.issue("catalog", after) };
    });
  }
  saveDefaults(configuration: ModelConfiguration, revision?: string, apply?: () => Promise<void>) {
    return this.enqueue(() => this.safe(async () => {
      const before = await this.catalogFingerprint();
      if (revision !== undefined) this.revisions.require("catalog", before, revision);
      const catalog = await saveModelDefaults(this.root, configuration, apply);
      return { ...catalog, revision: this.revisions.issue("catalog", await this.catalogFingerprint()) };
    }));
  }
  saveProvider(definition: ProviderDefinition, revision: string): Promise<ProviderSaveResult> {
    return this.enqueue(() => this.safe(async () => {
      await this.manager.withProviderMutation(definition.id, () => this.providers.saveDefinition(definition, revision));
      return this.confirmation();
    }));
  }
  saveCredential(id: string, apiKey: string, revision: string): Promise<ProviderSaveResult> {
    return this.enqueue(() => this.safe(async () => {
      const result = await this.manager.withProviderMutation(id, () => this.providers.saveCredential(id, apiKey, revision));
      return this.confirmation(result.synchronizationFailed ? "API Key 已保存，但本地模型视图同步失败，请重新加载后确认。" : undefined);
    }));
  }
  private async confirmation(warning?: string): Promise<ProviderSaveResult> {
    const settings = await this.providers.metadata();
    try { return { settings, catalog: await this.catalog(), ...(warning ? { warning } : {}) }; }
    catch { return { settings, warning: warning ?? "配置已保存，但模型列表暂时无法刷新，请重新加载。" }; }
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writes.then(operation);
    this.writes = pending.then(() => {}, () => {});
    return pending;
  }
  private async safe<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw settingsError("settings_unavailable", "无法读取或保存安装设置，请检查配置后重新加载。", 409);
    }
  }
}
