"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RuntimeUIRequest } from "@/shared/runtime-types";

export function ExtensionDialog({ request, respond }: {
  request?: RuntimeUIRequest;
  respond: (response: { id: string; value?: string; confirmed?: boolean; cancelled?: true }) => void;
}) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(request?.prefill ?? ""), [request?.id, request?.prefill]);
  useEffect(() => {
    if (!request?.timeout) return;
    const timer = setTimeout(() => respond({ id: request.id, cancelled: true }), request.timeout);
    return () => clearTimeout(timer);
  }, [request, respond]);
  if (!request) return null;

  return <div className="dialog-backdrop" role="presentation">
    <section className="extension-dialog" role="dialog" aria-modal="true" aria-labelledby="extension-dialog-title">
      <p className="eyebrow">PI EXTENSION</p>
      <h2 id="extension-dialog-title">{request.title}</h2>
      {request.message && <p className="dialog-message">{request.message}</p>}
      {request.method === "select" ? <div className="dialog-options">
        {request.options?.map((option) => <button key={option} onClick={() => respond({ id: request.id, value: option })}>{option}</button>)}
      </div> : request.method === "input" ? <input autoFocus value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && respond({ id: request.id, value })} /> : request.method === "editor" ? <textarea autoFocus rows={8} value={value} onChange={(event) => setValue(event.target.value)} /> : null}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={() => respond({ id: request.id, cancelled: true })}>取消</Button>
        {request.method === "confirm" ? <><Button variant="outline" onClick={() => respond({ id: request.id, confirmed: false })}>否</Button><Button onClick={() => respond({ id: request.id, confirmed: true })}>确认</Button></> : request.method !== "select" && <Button disabled={!value.trim()} onClick={() => respond({ id: request.id, value })}>提交</Button>}
      </div>
    </section>
  </div>;
}
