"use client";

import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatShortcutBinding, shortcutBindingFromEvent, validateShortcutBinding } from "@/lib/shortcuts";
import { useWebPreferences, webPreferences } from "@/lib/web-preferences";
import type { ShortcutAction, WebPreferences } from "@/shared/web-preferences";

export function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="settings-row"><div className="settings-row-copy"><strong>{title}</strong>{description && <p>{description}</p>}</div><div className="settings-row-control">{children}</div></div>;
}
export function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />;
}
export function GroupReset({ group }: { group: keyof Pick<WebPreferences, "appearance" | "conversation" | "shortcuts"> }) {
  return <div className="settings-group-reset"><Button type="button" size="sm" variant="outline" onClick={() => webPreferences.resetGroup(group)}>恢复本组默认</Button></div>;
}
export function AppearancePanel() {
  const { preferences: { appearance } } = useWebPreferences();
  return <><div className="settings-section-heading"><h3>外观</h3><p>仅保存在此浏览器，所有项目共用。</p></div>
    <SettingRow title="主题" description="跟随系统时，会自动响应系统外观变化。"><Select aria-label="主题" value={appearance.theme} options={[{ value: "system", label: "跟随系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }]} onValueChange={(theme) => { if (theme) webPreferences.update("appearance", { theme }); }} /></SettingRow>
    <SettingRow title="会话字号" description="只调整消息内容，不改变导航和代码字体。"><Select aria-label="会话字号" value={appearance.conversationFontSize} options={[{ value: 14, label: "14 px" }, { value: 16, label: "16 px" }, { value: 18, label: "18 px" }]} onValueChange={(conversationFontSize) => { if (conversationFontSize) webPreferences.update("appearance", { conversationFontSize }); }} /></SettingRow>
    <SettingRow title="代码自动换行" description="应用于会话中的代码和工具输出，不改变原始 JSONL。"><SettingToggle label="代码自动换行" checked={appearance.wrapCode} onChange={(wrapCode) => webPreferences.update("appearance", { wrapCode })} /></SettingRow><GroupReset group="appearance" />
  </>;
}
export function ConversationPanel() {
  const { preferences: { conversation } } = useWebPreferences();
  return <><div className="settings-section-heading"><h3>会话</h3><p>展开偏好用于新显示的内容，已手动展开或折叠的内容保持不变。</p></div>
    <SettingRow title="默认展开思考过程"><SettingToggle label="默认展开思考过程" checked={conversation.thinkingExpanded} onChange={(thinkingExpanded) => webPreferences.update("conversation", { thinkingExpanded })} /></SettingRow>
    <SettingRow title="默认展开工具详情"><SettingToggle label="默认展开工具详情" checked={conversation.toolsExpanded} onChange={(toolsExpanded) => webPreferences.update("conversation", { toolsExpanded })} /></SettingRow>
    <SettingRow title="运行中追加消息" description="作为新输入框的默认选项，不修改现有队列或手动选择。"><Select aria-label="默认消息队列模式" value={conversation.queueMode} options={[{ value: "steer", label: "立即纠正" }, { value: "follow_up", label: "完成后追加" }]} onValueChange={(queueMode) => { if (queueMode) webPreferences.update("conversation", { queueMode }); }} /></SettingRow><GroupReset group="conversation" />
  </>;
}
const actions: { id: ShortcutAction; name: string; description: string }[] = [
  { id: "newSession", name: "新建会话", description: "在当前可执行项目中新建会话" },
  { id: "openCommands", name: "打开命令", description: "当前输入框有可用命令时生效" },
  { id: "focusComposer", name: "聚焦输入框", description: "当前页面有输入框时生效" },
  { id: "openSettings", name: "打开设置", description: "在任意工作区页面生效" },
];
export function ShortcutsPanel() {
  const { preferences: { shortcuts } } = useWebPreferences();
  const [recording, setRecording] = useState<ShortcutAction>();
  const [error, setError] = useState<string>();
  return <><div className="settings-section-heading"><h3>快捷键</h3><p>点击组合键后按下新组合。Esc 取消录制；部分系统或浏览器快捷键无法捕获。</p></div>
    <SettingRow title="发送消息"><Select aria-label="发送消息快捷键" value={shortcuts.sendMode} options={[{ value: "enter", label: "Enter 发送" }, { value: "mod-enter", label: `${formatShortcutBinding({ key: "Enter", mod: true, shift: false, alt: false })} 发送` }]} onValueChange={(sendMode) => { if (sendMode) webPreferences.update("shortcuts", { sendMode }); }} /></SettingRow>
    {actions.map((action) => <SettingRow key={action.id} title={action.name} description={action.description}><div className="settings-shortcut-actions"><button type="button" data-shortcut-recorder="true" className="settings-shortcut-recorder" aria-label={`录制${action.name}快捷键`} aria-pressed={recording === action.id} onClick={() => { setRecording(action.id); setError(undefined); }} onBlur={() => setRecording((current) => current === action.id ? undefined : current)} onKeyDown={(event) => {
      if (recording !== action.id) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape") { setRecording(undefined); return; }
      if (event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
      const binding = shortcutBindingFromEvent(event);
      if (!binding) return;
      const issue = validateShortcutBinding(action.id, binding, shortcuts);
      if (issue) { setError(issue); return; }
      webPreferences.update("shortcuts", { bindings: { ...shortcuts.bindings, [action.id]: binding } }); setRecording(undefined); setError(undefined);
    }}>{recording === action.id ? "请按快捷键…" : shortcuts.bindings[action.id] ? formatShortcutBinding(shortcuts.bindings[action.id]) : "未设置"}</button><button type="button" className="settings-text-button" aria-label={`清除${action.name}快捷键`} disabled={!shortcuts.bindings[action.id]} onClick={() => { webPreferences.update("shortcuts", { bindings: { ...shortcuts.bindings, [action.id]: null } }); setError(undefined); }}>清除</button></div></SettingRow>)}
    {error && <Alert variant="error" title="快捷键不可用">{error}</Alert>}<GroupReset group="shortcuts" />
  </>;
}
