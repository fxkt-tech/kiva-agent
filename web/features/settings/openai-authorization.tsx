"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { InstallationSettings, ProviderSaveResult } from "@/shared/installation-settings";
import { isAuthorizationInput, isAuthorizationPending, type AuthorizationAttempt, type BeginAuthorizationInput } from "@/shared/provider-authorization";
import type { FormStateChange } from "./models-panel";
import { authorizationErrorMessage, settingsApi, SettingsRequestError } from "./api";

const statusText = {
  starting: "正在准备 ChatGPT 授权…",
  awaiting_authorization: "请在新页面完成 ChatGPT 授权。",
  committing: "正在保存授权，请稍候…",
  succeeded: "ChatGPT 授权已保存，请选择要使用的模型。",
  cancelled: "授权已取消，原有凭证保持不变。",
  failed: "ChatGPT 授权未完成。",
  expired: "授权已超时，请重新登录。",
};
const refreshWarning = "授权设置已保存，但状态暂时无法刷新，请重新加载。";

export function OpenAIAuthorization({ settings, loading, onSaved, onReload, onState, onNotice, visible = true, onReturn, navigationDisabled = false }: {
  visible?: boolean; navigationDisabled?: boolean; onReturn?(): void; settings?: InstallationSettings; loading: boolean; onSaved(result: ProviderSaveResult): void; onReload(): void; onState: FormStateChange; onNotice(message: string): void;
}) {
  const provider = settings?.providers.find((entry) => entry.id === "openai");
  const [attempt, setAttempt] = useState<AuthorizationAttempt>();
  const [requestPending, setRequestPending] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [error, setError] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [confirm, setConfirm] = useState<"login" | "logout">();
  const operation = useRef<BeginAuthorizationInput | undefined>(undefined);
  const busy = useRef(false);
  const latest = useRef(attempt);
  const currentGeneration = useRef(0);
  const [generation, setGeneration] = useState(0);
  function advance() { const next = ++currentGeneration.current; setGeneration(next); return next; }
  function clearAttempt() { latest.current = undefined; setAttempt(undefined); }
  const mounted = useRef(true);
  const confirmed = useRef<string | undefined>(undefined);
  const pending = requestPending || Boolean(attempt && isAuthorizationPending(attempt.status));
  const apply = useCallback((next: AuthorizationAttempt, version: number) => {
    if (!mounted.current || version !== currentGeneration.current) return;
    const current = latest.current;
    if (current && current.id === next.id && !isAuthorizationPending(current.status) && isAuthorizationPending(next.status)) return;
    latest.current = next; setAttempt(next); setError(undefined);
    if (!isAuthorizationPending(next.status)) {
      operation.current = undefined; setCallbackUrl("");
      if (next.status === "failed" || next.status === "expired") setError(authorizationErrorMessage(next.error));
      if (next.status === "succeeded" && confirmed.current !== next.id) {
        confirmed.current = next.id;
        if (next.result) { onSaved(next.result); setWarning(next.result.warning); }
        else { setWarning(refreshWarning); onReload(); }
        onNotice("ChatGPT 授权已保存");
      }
    }
  }, [onSaved, onNotice, onReload]);
  useEffect(() => { onState("openai-authorization", false, pending); }, [pending, onState]);
  useEffect(() => {
    mounted.current = true;
    const abandon = () => { const current = latest.current; if (current && isAuthorizationPending(current.status)) settingsApi.abandonAuthorization(current.id); };
    window.addEventListener("pagehide", abandon);
    return () => { mounted.current = false; window.removeEventListener("pagehide", abandon); abandon(); };
  }, []);
  useEffect(() => {
    if (!attempt || !isAuthorizationPending(attempt.status)) return;
    const controller = new AbortController();
    const version = generation;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const next = await settingsApi.authorization(attempt.id, controller.signal); if (!controller.signal.aborted && latest.current?.id === attempt.id) apply(next, version); }
      catch (cause) {
        if (!controller.signal.aborted && version === currentGeneration.current) {
          if (cause instanceof SettingsRequestError && cause.code === "authorization_not_found") { clearAttempt(); operation.current = undefined; setCallbackUrl(""); onReload(); }
          setError(cause instanceof Error ? cause.message : "授权状态读取失败，请重试。");
        }
      }
      finally { if (!controller.signal.aborted) timer = setTimeout(() => { void poll(); }, 750); }
    };
    timer = setTimeout(() => { void poll(); }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [attempt?.id, attempt?.status, generation, apply, onReload]);

  async function start() {
    if (!provider?.authorization?.canLogin || busy.current) return;
    const version = advance();
    busy.current = true; setRequestPending(true); setError(undefined); setWarning(undefined); setConfirm(undefined);
    // Reuse an unconfirmed begin operation after a transport failure: it may already exist server-side.
    operation.current ??= { revision: provider.credential.revision, operationId: crypto.randomUUID() };
    try { apply(await settingsApi.beginAuthorization(operation.current), version); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "无法开始授权，请重试。"); }
    finally { busy.current = false; if (mounted.current) setRequestPending(false); }
  }
  async function cancel() {
    if (!attempt || busy.current) return;
    const version = advance();
    busy.current = true; setRequestPending(true); setError(undefined); setCallbackUrl("");
    try { apply(await settingsApi.cancelAuthorization(attempt.id), version); }
    catch (cause) { if (mounted.current) {
      if (cause instanceof SettingsRequestError && cause.code === "authorization_not_found") { clearAttempt(); operation.current = undefined; onReload(); }
      setError(cause instanceof Error ? cause.message : "取消未确认，请重试。");
    } }
    finally { busy.current = false; if (mounted.current) setRequestPending(false); }
  }
  async function submit() {
    const input = { promptId: attempt?.promptId, callbackUrl };
    if (!attempt || !isAuthorizationInput(input) || busy.current) return;
    const version = advance();
    busy.current = true; setRequestPending(true); setError(undefined); setCallbackUrl("");
    try { apply(await settingsApi.authorizationInput(attempt.id, input), version); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "回调提交未确认，请重试。"); }
    finally { busy.current = false; if (mounted.current) setRequestPending(false); }
  }
  async function logout() {
    if (!provider?.authorization?.canLogout || busy.current) return;
    const version = advance();
    busy.current = true; setRequestPending(true); setError(undefined); setWarning(undefined); setConfirm(undefined);
    try { const result = await settingsApi.logoutOpenAI(provider.credential.revision); if (mounted.current) { clearAttempt(); if ("refreshRequired" in result) { setWarning(refreshWarning); onReload(); } else { onSaved(result); setWarning(result.warning); } onNotice("已退出 ChatGPT 登录"); } }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "退出登录未确认，请重试。"); }
    finally { busy.current = false; if (mounted.current) setRequestPending(false); }
  }
  useEffect(() => { if (!visible) setConfirm(undefined); }, [visible]);
  if (!provider?.authorization) return null;
  if (!visible) return pending ? <div className="settings-authorization-progress" role="status"><span>ChatGPT 授权进行中</span><Button size="sm" variant="ghost" disabled={navigationDisabled} onClick={onReturn}>返回授权</Button></div> : null;
  const connected = provider.credential.source === "oauth" && provider.credential.configured;
  return <section className="settings-section settings-openai-authorization" aria-label="OpenAI ChatGPT 授权">
    <div className="settings-section-heading"><h3>OpenAI / ChatGPT</h3><p>使用 ChatGPT 账号授权。完成后返回模型首页选择模型，可用模型取决于账号权限。</p></div>
    <p className="settings-muted">{connected ? "已连接 ChatGPT" : provider.credential.configured ? "当前使用 API Key 或已有认证。" : "尚未连接 ChatGPT"}</p>
    {!provider.authorization.canLogin && <p className="settings-muted">{provider.authorization.reason}</p>}
    {!pending && <div className="settings-form-actions"><Button size="sm" disabled={loading || !provider.authorization.canLogin} onClick={() => { if (provider.credential.configured) setConfirm("login"); else void start(); }}>{connected ? "重新授权" : operation.current ? "重试授权" : "使用 ChatGPT 登录"}</Button>{provider.authorization.canLogout && <Button size="sm" variant="outline" disabled={loading} onClick={() => setConfirm("logout")}>退出登录</Button>}</div>}
    {attempt && <p role="status" aria-live="polite">{statusText[attempt.status]}</p>}
    {pending && attempt?.authorizationUrl && <a className="settings-authorization-link" href={attempt.authorizationUrl} target="_blank" rel="noopener noreferrer">打开 ChatGPT 授权页面<ExternalLink size={13} aria-hidden="true" /></a>}
    {pending && attempt?.promptId && <div className="settings-authorization-fallback"><label className="settings-field"><span>浏览器未自动返回时，粘贴完整回调地址</span><Input aria-label="ChatGPT 授权回调地址" autoComplete="off" spellCheck={false} value={callbackUrl} disabled={requestPending} onChange={(event) => setCallbackUrl(event.target.value)} placeholder="http://127.0.0.1:1455/auth/callback?…" /></label><Button size="sm" variant="outline" disabled={requestPending || !isAuthorizationInput({ promptId: attempt.promptId, callbackUrl })} onClick={() => void submit()}>提交回调地址</Button></div>}
    {pending && <div className="settings-form-actions"><Button size="sm" variant="ghost" disabled={requestPending || !attempt || attempt.status === "committing"} onClick={() => void cancel()}>取消授权</Button></div>}
    {error && <Alert title="ChatGPT 授权未确认" variant="error"><p>{error}</p><Button size="sm" variant="outline" disabled={requestPending} onClick={() => { if (!pending) operation.current = undefined; onReload(); }}>重新加载状态</Button></Alert>}
    {warning && <Alert title="授权设置已保存" variant="warning"><p>{warning}</p><Button size="sm" variant="outline" onClick={onReload}>重新加载状态</Button></Alert>}
    <ConfirmDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(undefined); }} title={confirm === "logout" ? "退出 ChatGPT 登录？" : "替换 OpenAI 认证？"} description={confirm === "logout" ? "仅移除此安装保存的 ChatGPT 授权，不会撤销 OpenAI 端授权或恢复之前替换的 API Key。模型默认设置保持不变。" : "授权成功后将替换此提供方已保存的凭证。取消或失败不会修改原凭证，环境变量不会被删除。"} confirmLabel={confirm === "logout" ? "确认退出" : "继续授权"} onConfirm={confirm === "logout" ? logout : start} />
  </section>;
}
