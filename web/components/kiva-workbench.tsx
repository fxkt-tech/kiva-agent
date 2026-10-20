"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  ArrowUp,
  Bot,
  Braces,
  ChevronDown,
  CircleDot,
  Command,
  FileCode2,
  GitBranch,
  MoreHorizontal,
  PanelRightClose,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Sparkles,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { BootstrapData } from "@/shared/types";

function relativeTime(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} 小时`;
  return `${Math.floor(minutes / 1_440)} 天`;
}

export function KivaWorkbench({ data }: { data: BootstrapData }) {
  const [selectedId, setSelectedId] = useState(data.sessions[0]?.id);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const selected = useMemo(() => data.sessions.find((session) => session.id === selectedId), [data.sessions, selectedId]);

  return (
    <main className={cn("workbench", !inspectorOpen && "inspector-closed")}>
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={16} /></div>
          <div><p className="brand-name">Kiva</p><p className="brand-caption">Agent workspace</p></div>
          <Button variant="ghost" size="icon" className="ml-auto"><Command size={16} /></Button>
        </div>

        <div className="project-card">
          <div className="project-icon"><Braces size={17} /></div>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{data.project.name}</p><p className="truncate text-xs text-muted-foreground">{data.project.path}</p></div>
          <ChevronDown size={15} className="text-muted-foreground" />
        </div>

        <Button className="mx-3 mt-3 justify-start"><Plus size={16} />新建会话<span className="ml-auto text-[10px] opacity-60">⌘ N</span></Button>

        <nav className="nav-list">
          <button className="nav-item active"><Bot size={16} />会话</button>
          <button className="nav-item"><FileCode2 size={16} />文件</button>
          <button className="nav-item"><GitBranch size={16} />代码变更<Badge className="ml-auto">{data.project.dirtyFiles}</Badge></button>
          <button className="nav-item"><Archive size={16} />归档</button>
        </nav>

        <div className="section-label"><span>最近会话</span><Search size={13} /></div>
        <ScrollArea className="session-scroll">
          <div className="space-y-1 px-2 pb-4">
            {data.sessions.length ? data.sessions.map((session) => (
              <button key={session.id} onClick={() => setSelectedId(session.id)} className={cn("session-item", selectedId === session.id && "selected")}>
                <span className="truncate text-sm font-medium">{session.name}</span>
                <span className="line-clamp-2 text-left text-xs leading-5 text-muted-foreground">{session.preview}</span>
                <span className="mt-1 text-[10px] text-muted-foreground/70">{relativeTime(session.updatedAt)}</span>
              </button>
            )) : <p className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground">还没有会话。<br />创建一个开始工作。</p>}
          </div>
        </ScrollArea>

        <div className="sidebar-footer">
          <button className="nav-item"><Settings2 size={16} />设置</button>
          <div className="runtime-line"><span className="status-dot" />Pi {data.runtime.piVersion}<span className="ml-auto">本地</span></div>
        </div>
      </aside>

      <section className="conversation">
        <header className="conversation-header">
          <div className="min-w-0"><h1>{selected?.name ?? "新的开始"}</h1><p>{data.project.name} · {data.project.branch}</p></div>
          <div className="header-actions"><Badge className="hidden sm:inline-flex"><CircleDot size={10} className="mr-1 text-emerald-400" />已就绪</Badge><Button variant="ghost" size="icon"><MoreHorizontal size={18} /></Button><Button variant="ghost" size="icon" onClick={() => setInspectorOpen((value) => !value)}><PanelRightClose size={18} /></Button></div>
        </header>

        <ScrollArea className="message-scroll">
          <div className="message-column">
            <div className="date-divider"><span>今天</span></div>
            {selected ? (
              <>
                <article className="user-message"><p>{selected.preview}</p></article>
                <article className="assistant-message">
                  <div className="assistant-avatar"><Sparkles size={14} /></div>
                  <div className="assistant-body">
                    <div className="message-meta"><strong>Kiva</strong><span>刚刚</span></div>
                    <p>我已经载入这个项目和会话上下文。新版工作台骨架正在运行，下一步会接入 Pi RPC 的实时消息流。</p>
                    <div className="tool-card">
                      <div className="tool-icon"><Wrench size={14} /></div>
                      <div><p>读取项目状态</p><span>已发现 {data.project.dirtyFiles} 个变更文件</span></div>
                      <Badge className="ml-auto border-emerald-500/20 bg-emerald-500/10 text-emerald-300">完成</Badge>
                    </div>
                  </div>
                </article>
              </>
            ) : (
              <div className="empty-state">
                <div className="empty-orbit"><Sparkles size={24} /></div>
                <p className="eyebrow">KIVA AGENT</p>
                <h2>把想法交给一个<br />了解项目的搭档。</h2>
                <p className="empty-copy">从任务、问题或者一段不完整的思路开始。Kiva 会读取项目上下文，并把工作过程清晰地呈现在这里。</p>
                <div className="suggestions"><button>解释当前代码结构</button><button>检查最近的代码变更</button><button>规划下一个功能</button></div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="composer-wrap">
          <div className="composer">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="告诉 Kiva 你想完成什么…" rows={2} />
            <div className="composer-actions">
              <Button variant="ghost" size="icon"><Paperclip size={17} /></Button>
              <Button variant="ghost" size="sm"><SquareTerminal size={15} />工具</Button>
              <div className="ml-auto flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:block">⌘ Enter</span><Button size="icon" disabled={!draft.trim()}><ArrowUp size={17} /></Button></div>
            </div>
          </div>
          <p className="composer-note">Kiva 可能会修改文件或执行命令，请在提交前检查变更。</p>
        </div>
      </section>

      {inspectorOpen && <aside className="inspector">
        <div className="inspector-heading"><div><p className="eyebrow">SESSION CONTEXT</p><h2>运行上下文</h2></div><Button variant="ghost" size="icon" onClick={() => setInspectorOpen(false)}><PanelRightClose size={16} /></Button></div>
        <div className="inspector-section"><p className="inspector-label">模型</p><button className="model-card"><span className="model-glyph">A</span><span><strong>等待模型配置</strong><small>{data.runtime.modelConfigFound ? "可从 models.json 选择" : "尚未找到 models.json"}</small></span><ChevronDown size={15} className="ml-auto" /></button></div>
        <div className="inspector-section"><div className="flex items-center justify-between"><p className="inspector-label">上下文使用量</p><span className="text-xs text-muted-foreground">0%</span></div><div className="context-track"><span /></div><div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>0 tokens</span><span>等待首次请求</span></div></div>
        <div className="inspector-section"><p className="inspector-label">项目</p><dl className="detail-list"><div><dt>分支</dt><dd><GitBranch size={12} />{data.project.branch}</dd></div><div><dt>变更</dt><dd>{data.project.dirtyFiles} 个文件</dd></div><div><dt>工作区</dt><dd className="truncate">{data.project.name}</dd></div></dl></div>
        <div className="inspector-section"><p className="inspector-label">可用能力</p><div className="capability-grid"><span><FileCode2 size={14} />文件</span><span><SquareTerminal size={14} />命令</span><span><GitBranch size={14} />Git</span><span><Wrench size={14} />工具</span></div></div>
        <div className="inspector-footer"><span className="status-dot" /><span>服务运行正常</span><span className="ml-auto text-muted-foreground">127.0.0.1</span></div>
      </aside>}
    </main>
  );
}
