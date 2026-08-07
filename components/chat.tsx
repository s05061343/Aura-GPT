"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleStop,
  CloudSun,
  Ellipsis,
  ExternalLink,
  Landmark,
  Menu,
  MessageSquarePlus,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { uiBlockSchema, type UIBlock } from "@/lib/contracts";
import { AuraChatTransport } from "@/lib/aura-chat-transport";
import { ApprovalDialog, type ApprovalRequest } from "@/components/approval-dialog";
import { UIBlockView } from "@/components/cards";
import { Button } from "@/components/ui/button";

type AuraDataParts = { approval: ApprovalRequest; uiBlock: UIBlock };
type AuraMessage = UIMessage<unknown, AuraDataParts>;
type Status = { application: string; model: string; modelAlias: string; modelDisplayName: string; langSmith: string };

const starters = [
  { icon: CloudSun, title: "查詢台北天氣", description: "用工具取得即時天氣與簡短建議", prompt: "幫我查台北今天的天氣" },
  { icon: Landmark, title: "台積電收盤價", description: "展示 Generative UI 資料卡片", prompt: "幫我查台積電今天的收盤價" },
  { icon: Wrench, title: "使用 Agent 完成任務", description: "體驗工具授權與執行流程", prompt: "使用 Agent 幫我查詢新竹今天的天氣" },
  { icon: Sparkles, title: "認識本機模型", description: "了解目前的 Local AI 執行環境", prompt: "介紹一下你目前使用的本機模型" },
];

function PlannedBadge() {
  return <span className="planned-badge">待補</span>;
}

export function Chat() {
  const transport = useMemo(() => new AuraChatTransport(), []);
  const [threadId] = useState(() => crypto.randomUUID());
  const [lastPrompt, setLastPrompt] = useState("");
  const [input, setInput] = useState("");
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [statusInfo, setStatusInfo] = useState<Status>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
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
  const modelReady = statusInfo?.model === "ready";
  const langSmithEnabled = statusInfo?.langSmith === "enabled";
  const visibleMessages = messages.filter((message) => message.role !== "system");

  useEffect(() => {
    fetch("/api/status").then((response) => response.json()).then(setStatusInfo).catch(() => undefined);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const syncViewport = () => setIsMobile(media.matches);
    syncViewport();
    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);
  useEffect(() => {
    scrollAnchor.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, approval]);

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
    setMobileSidebarOpen(false);
  }

  return (
    <main className="aura-app" data-sidebar-collapsed={sidebarCollapsed || undefined}>
      {mobileSidebarOpen && <button className="sidebar-scrim" aria-label="關閉側邊欄" onClick={() => setMobileSidebarOpen(false)} />}
      <aside className={`aura-sidebar ${mobileSidebarOpen ? "is-open" : ""}`} aria-label="主要導覽" inert={isMobile && !mobileSidebarOpen ? true : undefined}>
        <div className="sidebar-brand-row">
          <div className="brand-lockup">
            <span className="brand-mark"><Sparkles aria-hidden="true" /></span>
            <span className="brand-copy"><strong>Aura-GPT</strong><small>Local AI Agent</small></span>
          </div>
          <button className="icon-control desktop-collapse" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "展開側邊欄" : "收合側邊欄"}>
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button className="icon-control mobile-close" onClick={() => setMobileSidebarOpen(false)} aria-label="關閉側邊欄"><X /></button>
        </div>

        <div className="sidebar-actions">
          <button className="new-chat-button" onClick={clear} title="新增對話"><MessageSquarePlus /><span>新增對話</span></button>
          <button className="sidebar-link planned-control" disabled title="對話持久化與搜尋尚未提供"><Search /><span>搜尋紀錄</span><PlannedBadge /></button>
        </div>

        <nav className="conversation-nav" aria-label="對話紀錄">
          <p className="sidebar-section-label">目前分頁</p>
          <div className="conversation-row is-active">
            <span className="conversation-dot" />
            <span className="conversation-title">{lastPrompt || "New conversation"}</span>
            <button className="row-menu" disabled aria-label="對話選單，尚未提供" title="對話管理待補"><Ellipsis /></button>
          </div>
          <div className="history-placeholder">
            <span>重新整理後不保留對話</span>
            <PlannedBadge />
          </div>
        </nav>

        <div className="runtime-account">
          <button className="runtime-account-button" disabled title="設定功能待補">
            <span className="runtime-avatar">AI</span>
            <span className="runtime-copy"><strong>本機執行環境</strong><small>{modelReady ? "Local mode active" : "Model offline"}</small></span>
            <ChevronRight className="runtime-chevron" />
          </button>
          <div className="planned-settings"><Settings /><span>Profile 與帳號系統</span><PlannedBadge /></div>
        </div>
      </aside>

      <section className="aura-main">
        <header className="aura-topbar">
          <div className="topbar-left">
            <button className="icon-control mobile-menu" onClick={() => setMobileSidebarOpen(true)} aria-label="開啟側邊欄"><Menu /></button>
            <div className="title-stack"><strong>{lastPrompt ? "目前對話" : "New conversation"}</strong><small>目前分頁</small></div>
            <span className={`model-chip ${modelReady ? "is-ready" : "is-offline"}`}>
              <span className="status-dot" />{statusInfo?.modelDisplayName || "Qwen3 8B"} · {modelReady ? "Local" : "Offline"}
            </span>
          </div>
          <div className="topbar-actions">
            <span className={`trace-status ${langSmithEnabled ? "is-tracing" : ""}`} title={langSmithEnabled ? "Prompt、回覆與工具結果會送往 LangSmith" : "僅記錄本機 metadata"}>
              <ExternalLink /> <span>LangSmith {langSmithEnabled ? "完整追蹤中" : "本機日誌"}</span>
            </span>
            <button className="icon-control" disabled aria-label="更多選項，尚未提供" title="更多選項待補"><Ellipsis /></button>
          </div>
        </header>

        {langSmithEnabled && (
          <div className="trace-disclosure" role="status">
            此工作階段的 Prompt、回覆與工具結果會送往 LangSmith；API 金鑰等秘密會被遮蔽。
          </div>
        )}

        <div className="conversation-workspace" aria-live="polite">
          {visibleMessages.length === 0 ? (
            <section className="empty-state">
              <div className="empty-state-inner">
                <span className="empty-orb"><Sparkles /></span>
                <h1>今天想和 Aura 一起做什麼？</h1>
                <p>使用本機 Qwen Agent 對話，或透過受控工具取得天氣與臺股最新官方收盤價。</p>
                <div className="starter-grid">
                  {starters.map((starter) => {
                    const Icon = starter.icon;
                    return (
                      <button key={starter.title} className="starter-card" onClick={() => setInput(starter.prompt)}>
                        <span className="starter-icon"><Icon /></span>
                        <span><strong>{starter.title}</strong><small>{starter.description}</small></span>
                        <ChevronRight />
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : (
            <div className="message-list">
              {visibleMessages.map((message) => {
                const text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
                const blocks = message.parts.flatMap((part) => {
                  if (part.type !== "data-uiBlock") return [];
                  const parsed = uiBlockSchema.safeParse(part.data);
                  return parsed.success ? [parsed.data] : [];
                });
                return (
                  <article key={message.id} className={`message-row ${message.role}`}>
                    {message.role === "assistant" && <span className="assistant-mark"><Sparkles /></span>}
                    <div className={message.role === "user" ? "user-bubble" : "assistant-body"}>
                      {text ? <div className="markdown"><ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown></div> : busy && message.role === "assistant" ? <span className="typing-indicator" aria-label="Aura 正在回覆"><i /><i /><i /></span> : null}
                      {blocks.map((block, index) => <UIBlockView key={`${block.type}-${index}`} block={block} />)}
                    </div>
                  </article>
                );
              })}
              {error && <div className="chat-error" role="alert"><Bot /><div><strong>回覆失敗</strong><p>{error.message}</p></div></div>}
              <div ref={scrollAnchor} />
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <form onSubmit={submit} className="composer">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              maxLength={16000}
              placeholder="Ask Aura anything..."
              disabled={busy || Boolean(approval)}
              aria-label="聊天訊息"
            />
            <div className="composer-footer">
              <div className="composer-tools">
                <button type="button" className="composer-mini" disabled title="附件功能待補" aria-label="新增附件，尚未提供"><Paperclip /><PlannedBadge /></button>
                <div className="tools-popover-wrap">
                  <button type="button" className="composer-mini" aria-expanded={toolsOpen} onClick={() => setToolsOpen((value) => !value)}><Wrench />Tools<ChevronDown /></button>
                  {toolsOpen && <div className="tools-popover"><strong>可用工具</strong><span><CloudSun />天氣查詢</span><span><Landmark />臺股收盤價</span><small>首次使用每個外部工具前會要求授權。</small></div>}
                </div>
                <button type="button" className="composer-mini model-selector" disabled title="模型設定介面待補；目前需重新啟動服務"><Sparkles />{statusInfo?.modelDisplayName || "Qwen3 8B"}<PlannedBadge /></button>
              </div>
              <div className="composer-submit">
                {lastPrompt && !busy && !approval && <button type="button" className="restore-prompt" onClick={() => setInput(lastPrompt)} title="取回上一個問題"><RotateCcw /></button>}
                {busy ? <Button type="button" size="icon" variant="danger" onClick={stop} aria-label="停止生成"><CircleStop /></Button> : <Button type="submit" size="icon" disabled={!input.trim()} aria-label="傳送訊息"><Send /></Button>}
              </div>
            </div>
          </form>
          <p className="composer-note">Aura 可能會犯錯；外部工具執行前會揭露傳送資料並要求授權。</p>
        </div>
      </section>
      <ApprovalDialog approval={approval} busy={busy} onDecision={decide} />
    </main>
  );
}
