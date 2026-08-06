"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { Bot, CircleStop, RotateCcw, Send, Sparkles, Trash2, User } from "lucide-react";
import { uiBlockSchema, type UIBlock } from "@/lib/contracts";
import { AuraChatTransport } from "@/lib/aura-chat-transport";
import { ApprovalDialog, type ApprovalRequest } from "@/components/approval-dialog";
import { UIBlockView } from "@/components/cards";
import { Button } from "@/components/ui/button";

type AuraDataParts = { approval: ApprovalRequest; uiBlock: UIBlock };
type AuraMessage = UIMessage<unknown, AuraDataParts>;
type Status = { application: string; model: string; modelAlias: string; langSmith: string };

export function Chat() {
  const transport = useMemo(() => new AuraChatTransport(), []);
  const [threadId] = useState(() => crypto.randomUUID());
  const [lastPrompt, setLastPrompt] = useState("");
  const [input, setInput] = useState("");
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [statusInfo, setStatusInfo] = useState<Status>();
  const scrollAnchor = useRef<HTMLDivElement>(null);
  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
    setMessages,
    clearError,
  } = useChat<AuraMessage>({
    id: threadId,
    transport,
    onData(part) {
      if (part.type === "data-approval") setApproval(part.data as ApprovalRequest);
    },
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { fetch("/api/status").then((response) => response.json()).then(setStatusInfo).catch(() => undefined); }, []);
  useEffect(() => { scrollAnchor.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, approval]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy || approval) return;
    const messageId = crypto.randomUUID();
    setLastPrompt(text);
    setInput("");
    clearError();
    void sendMessage(
      { id: messageId, role: "user", parts: [{ type: "text", text }] },
      { body: { command: { type: "message", threadId, requestId: crypto.randomUUID(), messageId, text } } },
    );
  }

  function decide(decision: "approve" | "reject") {
    if (!approval) return;
    const current = approval;
    setApproval(undefined);
    void regenerate({
      body: { command: { type: "approval", threadId, requestId: crypto.randomUUID(), approvalId: current.approvalId, decision } },
    });
  }

  function clear() {
    stop();
    void fetch(`/api/chat?threadId=${encodeURIComponent(threadId)}`, { method: "DELETE" });
    setMessages([]);
    setApproval(undefined);
    clearError();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl px-5 py-4">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white"><Sparkles /></span><div><h1 className="text-lg font-bold">Aura-GPT</h1><p className="text-xs text-slate-500">LangChain · 本機 Qwen Agent</p></div></div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-3 py-1.5 ${statusInfo?.model === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>模型 {statusInfo?.model === "ready" ? "已就緒" : "未連線"}</span>
          <span className={`rounded-full px-3 py-1.5 ${statusInfo?.langSmith === "enabled" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>LangSmith {statusInfo?.langSmith === "enabled" ? "完整追蹤中" : "本機日誌"}</span>
          <Button variant="ghost" size="sm" onClick={clear}><Trash2 className="size-4" />清空</Button>
        </div>
      </header>
      {statusInfo?.langSmith === "enabled" && <p className="mx-3 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">此工作階段的 Prompt、回覆與工具結果會送往 LangSmith；API 金鑰等秘密會被遮蔽。</p>}

      <section className="glass mt-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem]">
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8" aria-live="polite">
          {messages.length === 0 && <div className="mx-auto mt-[12vh] max-w-xl text-center"><Bot className="mx-auto size-12 text-violet-500" /><h2 className="mt-4 text-2xl font-bold">今天想查什麼？</h2><p className="mt-2 text-sm text-slate-500">可以和本機模型對話，或詢問天氣、上市與上櫃股票的最新官方收盤價。</p></div>}
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.filter((message) => message.role !== "system").map((message) => {
              const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
              const blocks = message.parts.flatMap((part) => {
                if (part.type !== "data-uiBlock") return [];
                const parsed = uiBlockSchema.safeParse(part.data);
                return parsed.success ? [parsed.data] : [];
              });
              return <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><Bot className="size-4" /></span>}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.role === "user" ? "bg-violet-600 text-white" : "border border-slate-200 bg-white"}`}>
                  {text ? <div className="markdown text-sm leading-7"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown></div> : busy && message.role === "assistant" ? <span className="flex gap-1 py-2"><i className="pulse-dot size-2 rounded-full bg-violet-500" /><i className="pulse-dot size-2 rounded-full bg-violet-500 [animation-delay:150ms]" /><i className="pulse-dot size-2 rounded-full bg-violet-500 [animation-delay:300ms]" /></span> : null}
                  {blocks.map((block, index) => <UIBlockView key={`${block.type}-${index}`} block={block} />)}
                </div>
                {message.role === "user" && <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-slate-200 text-slate-700"><User className="size-4" /></span>}
              </article>;
            })}
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
            <div ref={scrollAnchor} />
          </div>
        </div>

        <form onSubmit={submit} className="border-t border-slate-200 bg-white/75 p-4 sm:p-5">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={16000} placeholder="輸入訊息，Enter 傳送，Shift+Enter 換行" className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none" disabled={busy || Boolean(approval)} aria-label="聊天訊息" />
            {busy ? <Button type="button" size="icon" variant="danger" onClick={stop} aria-label="停止生成"><CircleStop /></Button> : <Button type="submit" size="icon" disabled={!input.trim()} aria-label="傳送訊息"><Send /></Button>}
          </div>
          {lastPrompt && !busy && !approval && <div className="mx-auto mt-2 max-w-3xl text-right"><button type="button" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-violet-700" onClick={() => setInput(lastPrompt)}><RotateCcw className="size-3" />取回上一個問題</button></div>}
        </form>
      </section>
      <ApprovalDialog approval={approval} busy={busy} onDecision={decide} />
    </main>
  );
}
