"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Info, Keyboard, MessageSquare, Palette, Settings2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Toast } from "@/components/ui/toast";
import { shortcutRegistry } from "@/lib/shortcuts";
import { useWebPreferences } from "@/lib/web-preferences";
import type { InstallationModelCatalog, InstallationSettings, ProviderSaveResult } from "@/shared/installation-settings";
import { AppearancePanel, ConversationPanel, SettingRow, ShortcutsPanel } from "./preferences-panels";
import { DefaultsEditor, ProvidersEditor } from "./models-panel";
import { settingsApi } from "./api";
import { restoreSettingsFocus } from "./focus";

const categories = [
  { id: "appearance", name: "外观", icon: Palette }, { id: "shortcuts", name: "快捷键", icon: Keyboard },
  { id: "models", name: "模型", icon: Settings2 }, { id: "conversation", name: "会话", icon: MessageSquare },
  { id: "about", name: "关于", icon: Info },
] as const;
type Category = typeof categories[number]["id"];

export function SettingsDialog({ onClose, catalog, modelsLoading, modelsError, onCatalog, onReloadCatalog }: { onClose(): void; catalog?: InstallationModelCatalog; modelsLoading: boolean; modelsError?: string; onCatalog(catalog: InstallationModelCatalog): void; onReloadCatalog(): void }) {
  const { persistenceError } = useWebPreferences();
  const [category, setCategory] = useState<Category>("appearance");
  const [forms, setForms] = useState<Record<string, { dirty: boolean; pending: boolean }>>({});
  const [discard, setDiscard] = useState(false);
  const [settings, setSettings] = useState<InstallationSettings>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloadVersion, setReloadVersion] = useState(0);
  const [notice, setNotice] = useState<{ id: number; message: string }>();
  const readRevision = useRef(0);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [previousFocus] = useState(() => typeof document === "undefined" ? null : document.activeElement);
  const latest = useRef({ forms, onClose }); latest.current = { forms, onClose };
  const pending = Object.values(forms).some((form) => form.pending);
  const onState = useCallback((form: string, dirty: boolean, saving: boolean) => setForms((current) => current[form]?.dirty === dirty && current[form]?.pending === saving ? current : { ...current, [form]: { dirty, pending: saving } }), []);
  const showNotice = useCallback((message: string) => setNotice((current) => ({ id: (current?.id ?? 0) + 1, message })), []);
  function requestClose() {
    if (Object.values(latest.current.forms).some((form) => form.pending)) return;
    if (Object.values(latest.current.forms).some((form) => form.dirty)) setDiscard(true);
    else latest.current.onClose();
  }
  useEffect(() => {
    const controller = new AbortController();
    const revision = ++readRevision.current;
    setLoading(true); setError(undefined);
    void settingsApi.read(controller.signal).then((result) => { if (!controller.signal.aborted && revision === readRevision.current) setSettings(result); }).catch(() => { if (!controller.signal.aborted && revision === readRevision.current) setError("无法读取安装配置，请重试。"); }).finally(() => { if (!controller.signal.aborted && revision === readRevision.current) setLoading(false); });
    return () => controller.abort();
  }, [reloadVersion]);
  const saved = useCallback((result: ProviderSaveResult) => {
    readRevision.current += 1; setSettings(result.settings); setLoading(false); setError(undefined);
    if (result.catalog) onCatalog(result.catalog);
  }, [onCatalog]);
  useEffect(() => shortcutRegistry.block("settings"), []);
  function categoryKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const at = categories.findIndex((item) => item.id === category);
    const next = event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : (at + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) + categories.length) % categories.length;
    setCategory(categories[next].id); event.currentTarget.querySelector<HTMLButtonElement>(`#settings-tab-${categories[next].id}`)?.focus();
  }
  const reload = useCallback(() => { setReloadVersion((value) => value + 1); onReloadCatalog(); }, [onReloadCatalog]);
  return <>
    <Dialog open onOpenChange={(open, details) => { if (!open) { details.cancel(); requestClose(); } }}>
    <DialogContent className="settings-dialog" showCloseButton={false} initialFocus={closeButton} finalFocus={() => { if (typeof document !== "undefined") restoreSettingsFocus(previousFocus, document); return false; }} aria-labelledby="settings-title" aria-busy={pending}>
      <header className="settings-heading"><DialogTitle id="settings-title">设置</DialogTitle><button ref={closeButton} type="button" aria-label="关闭设置" disabled={pending} onClick={requestClose}><X size={17} /></button></header>
      <div className="settings-layout">
        <div className="settings-category-list" role="tablist" aria-label="设置分类" onKeyDown={categoryKeys}>{categories.map(({ id, name, icon: Icon }) => <button key={id} type="button" role="tab" id={`settings-tab-${id}`} aria-selected={category === id} aria-controls={`settings-panel-${id}`} tabIndex={category === id ? 0 : -1} onClick={() => setCategory(id)}><Icon size={15} aria-hidden="true" />{name}</button>)}</div>
        <div className="settings-content">
          {persistenceError && <Alert title="偏好未持久保存" variant="warning"><p>{persistenceError}</p></Alert>}
          <section role="tabpanel" id="settings-panel-appearance" aria-labelledby="settings-tab-appearance" hidden={category !== "appearance"}><AppearancePanel /></section>
          <section role="tabpanel" id="settings-panel-shortcuts" aria-labelledby="settings-tab-shortcuts" hidden={category !== "shortcuts"}><ShortcutsPanel /></section>
          <section role="tabpanel" id="settings-panel-models" aria-labelledby="settings-tab-models" hidden={category !== "models"}><DefaultsEditor catalog={catalog} loading={modelsLoading} error={modelsError} onReload={onReloadCatalog} onCatalog={onCatalog} onState={onState} onNotice={showNotice} /><ProvidersEditor settings={settings} loading={loading} error={error} onReload={reload} onSaved={saved} onState={onState} onNotice={showNotice} /></section>
          <section role="tabpanel" id="settings-panel-conversation" aria-labelledby="settings-tab-conversation" hidden={category !== "conversation"}><ConversationPanel /></section>
          <section role="tabpanel" id="settings-panel-about" aria-labelledby="settings-tab-about" hidden={category !== "about"}><AboutPanel settings={settings} loading={loading} error={error} onReload={reload} onNotice={showNotice} /></section>
        </div>
      </div>
      {notice && <Toast key={notice.id} message={notice.message} onDismiss={() => setNotice(undefined)} />}
      <ConfirmDialog open={discard} onOpenChange={setDiscard} title="放弃未保存的修改？" description="模型、提供方或 API Key 的未保存内容将被清除。已经自动保存的浏览器偏好不受影响。" cancelLabel="继续编辑" confirmLabel="放弃修改" onConfirm={onClose} />
    </DialogContent>
    </Dialog>
  </>;
}

function AboutPanel({ settings, loading, error, onReload, onNotice }: { settings?: InstallationSettings; loading: boolean; error?: string; onReload(): void; onNotice(message: string): void }) {
  const { preferences } = useWebPreferences();
  const [copyError, setCopyError] = useState(false);
  async function copy() {
    if (!settings) return;
    setCopyError(false);
    // Fixed allowlist: never include provider metadata, locations, errors or user content.
    const diagnostic = { application: "KivA", versions: { app: settings.versions.app, pi: settings.versions.pi }, preferences, backend: { status: settings.check.status, checkedAt: settings.check.checkedAt } };
    try { await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2)); onNotice("诊断信息已复制"); }
    catch { setCopyError(true); }
  }
  return <><div className="settings-section-heading"><h3>关于 KivA</h3><p>后端检查只读取安装信息，不检查模型服务，也不会发送提示词。</p></div>
    <SettingRow title="KivA 版本"><span className="settings-version">{settings?.versions.app ?? "—"}</span></SettingRow><SettingRow title="Pi 版本"><span className="settings-version">{settings?.versions.pi ?? "—"}</span></SettingRow>
    <SettingRow title="后端检查" description={settings ? `上次响应：${new Date(settings.check.checkedAt).toLocaleString()}` : "尚未取得后端响应"}><Button size="sm" variant="outline" disabled={loading} onClick={onReload}>{loading ? "正在检查…" : "检查后端"}</Button></SettingRow>
    {settings && !error && <p className="settings-muted" role="status">后端已响应；这不代表模型提供方可用。</p>}
    {error && <Alert title="后端检查失败" variant="error">{error}</Alert>}
    <div className="settings-diagnostics"><Button size="sm" variant="outline" disabled={!settings || loading} onClick={() => void copy()}>复制诊断信息</Button><p>仅包含版本、界面偏好及后端检查结果，不包含密钥、路径和会话内容。</p></div>
    {copyError && <Alert title="无法复制诊断信息" variant="error">浏览器未允许剪贴板写入，请检查权限后重试。</Alert>}
  </>;
}
