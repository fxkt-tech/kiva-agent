"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { RuntimeUIRequest } from "@/shared/runtime-types";

export function ExtensionDialog({ request, respond }: {
  request?: RuntimeUIRequest;
  respond: (response: { id: string; value?: string; confirmed?: boolean; cancelled?: true }) => void;
}) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setValue(request?.prefill ?? ""), [request?.id, request?.prefill]);
  useEffect(() => {
    if (!request?.timeout) return;
    const timer = setTimeout(() => respond({ id: request.id, cancelled: true }), request.timeout);
    return () => clearTimeout(timer);
  }, [request, respond]);
  if (!request) return null;

  return <Dialog key={request.id} open onOpenChange={(next) => { if (!next) respond({ id: request.id, cancelled: true }); }}>
    <DialogContent className="extension-dialog" initialFocus={request.method === "input" ? input : request.method === "editor" ? editor : undefined} showCloseButton={false}>
      <p className="eyebrow">PI EXTENSION</p>
      <DialogTitle>{request.title}</DialogTitle>
      {request.message && <DialogDescription className="dialog-message">{request.message}</DialogDescription>}
      {request.method === "select" ? <div className="dialog-options">
        {request.options?.map((option) => <button key={option} onClick={() => respond({ id: request.id, value: option })}>{option}</button>)}
      </div> : request.method === "input" ? <Input ref={input} aria-label={request.title} value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) respond({ id: request.id, value }); }} /> : request.method === "editor" ? <Textarea ref={editor} aria-label={request.title} rows={8} value={value} onChange={(event) => setValue(event.target.value)} /> : null}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={() => respond({ id: request.id, cancelled: true })}>取消</Button>
        {request.method === "confirm" ? <><Button variant="outline" onClick={() => respond({ id: request.id, confirmed: false })}>否</Button><Button onClick={() => respond({ id: request.id, confirmed: true })}>确认</Button></> : request.method !== "select" && <Button disabled={!value.trim()} onClick={() => respond({ id: request.id, value })}>提交</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
