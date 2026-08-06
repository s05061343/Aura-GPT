import { randomUUID } from "node:crypto";
import { ChatOpenAI } from "@langchain/openai";
import { Command } from "@langchain/langgraph";
import {
  createAgent,
  humanInTheLoopMiddleware,
  modelCallLimitMiddleware,
  toolCallLimitMiddleware,
} from "langchain";
import type { AuraEvent, ChatCommand, UIBlock } from "@/lib/contracts";
import { uiBlockSchema } from "@/lib/contracts";
import { getConfig } from "@/lib/config";
import { SYSTEM_PROMPT } from "@/lib/agent/prompt";
import { sessionStore, type AgentSession } from "@/lib/agent/session-store";
import { createTools, externalToolNames } from "@/lib/tools/registry";

type Writer = (event: AuraEvent) => void;

function createModel() {
  const config = getConfig();
  return new ChatOpenAI({
    model: config.LLM_MODEL_ALIAS,
    apiKey: "local-no-key",
    temperature: 0.2,
    maxTokens: 2048,
    streaming: true,
    streamUsage: false,
    timeout: 120_000,
    configuration: { baseURL: config.LLAMA_SERVER_URL },
    modelKwargs: { parallel_tool_calls: false, chat_template_kwargs: { enable_thinking: false } },
  });
}

function buildAgent(session: AgentSession, signal: AbortSignal) {
  const config = getConfig();
  const interruptOn = Object.fromEntries(
    externalToolNames.map((name) => [name, session.approvedTools.has(name) ? false : { allowedDecisions: ["approve", "reject"] as Array<"approve" | "reject"> }]),
  );
  return createAgent({
    name: "aura_local_agent",
    model: createModel(),
    tools: createTools(signal),
    systemPrompt: SYSTEM_PROMPT,
    checkpointer: session.checkpointer,
    middleware: [
      modelCallLimitMiddleware({ runLimit: config.AGENT_MAX_STEPS, exitBehavior: "end" }),
      toolCallLimitMiddleware({ runLimit: config.AGENT_MAX_TOOL_CALLS, exitBehavior: "continue" }),
      humanInTheLoopMiddleware({ interruptOn, descriptionPrefix: "此工具會將下列查詢資料送往外部服務" }),
    ],
  });
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
    return "";
  }).join("");
}

function readInterrupt(update: unknown): { tool: string; arguments: Record<string, unknown>; callId: string } | undefined {
  if (!update || typeof update !== "object") return undefined;
  const interrupts = (update as Record<string, unknown>).__interrupt__;
  if (!Array.isArray(interrupts) || interrupts.length === 0) return undefined;
  const interrupt = interrupts[0] as Record<string, unknown>;
  const value = (interrupt.value ?? interrupt) as Record<string, unknown>;
  const actions = (value.action_requests ?? value.actionRequests) as unknown;
  if (!Array.isArray(actions) || actions.length === 0) return undefined;
  const action = actions[0] as Record<string, unknown>;
  const tool = String(action.name ?? "unknown");
  const args = (action.arguments ?? action.args ?? {}) as Record<string, unknown>;
  return { tool, arguments: args, callId: String(action.id ?? randomUUID()) };
}

function findToolResult(update: unknown): { callId: string; tool: string; ui?: UIBlock } | undefined {
  if (!update || typeof update !== "object") return undefined;
  const nodes = Object.values(update as Record<string, unknown>);
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const messages = (node as Record<string, unknown>).messages;
    if (!Array.isArray(messages)) continue;
    for (const message of messages.toReversed()) {
      if (!message || typeof message !== "object") continue;
      const record = message as Record<string, unknown>;
      const type = typeof record._getType === "function" ? String((record._getType as () => unknown)()) : String(record.type ?? "");
      if (type !== "tool") continue;
      const tool = String(record.name ?? "tool");
      const callId = String(record.tool_call_id ?? record.toolCallId ?? randomUUID());
      let payload: unknown = record.content;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { /* plain tool output */ }
      }
      const candidate = payload && typeof payload === "object" && "ui" in payload ? (payload as { ui?: unknown }).ui : undefined;
      const parsed = candidate ? uiBlockSchema.safeParse(candidate) : undefined;
      return { callId, tool, ui: parsed?.success ? parsed.data : undefined };
    }
  }
  return undefined;
}

async function consumeAgentStream(
  stream: AsyncIterable<unknown>,
  session: AgentSession,
  agent: unknown,
  messageId: string,
  write: Writer,
): Promise<"stop" | "approval-required"> {
  for await (const item of stream) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const [mode, chunk] = item as [string, unknown];
    if (mode === "messages" && Array.isArray(chunk)) {
      const token = chunk[0] as { content?: unknown } | undefined;
      const delta = contentText(token?.content);
      if (delta) write({ type: "text-delta", messageId, delta });
    }
    if (mode === "updates") {
      const interrupt = readInterrupt(chunk);
      if (interrupt) {
        const approvalId = randomUUID();
        session.pending = { approvalId, ...interrupt, agent };
        write({
          type: "tool-awaiting-approval",
          approvalId,
          callId: interrupt.callId,
          tool: interrupt.tool,
          summary: `允許 ${interrupt.tool} 將這次查詢參數送往外部服務？`,
          arguments: interrupt.arguments,
        });
        return "approval-required";
      }
      const result = findToolResult(chunk);
      if (result) write({ type: "tool-result", ...result });
    }
  }
  return "stop";
}

export interface AuraAgentRuntime {
  run(command: ChatCommand, signal: AbortSignal, write: Writer): Promise<void>;
}

export const auraAgentRuntime: AuraAgentRuntime = {
  async run(command, signal, write) {
    const session = sessionStore.get(command.threadId);
    const messageId = randomUUID();
    write({ type: "message-start", messageId });
    const runConfig = {
      configurable: { thread_id: command.threadId },
      signal,
      streamMode: ["updates", "messages"] as const,
      version: "v2" as const,
    };

    let agent: ReturnType<typeof buildAgent>;
    let input: unknown;
    if (command.type === "message") {
      if (session.pending) throw new Error("目前仍有尚未處理的工具授權");
      agent = buildAgent(session, signal);
      input = { messages: [{ role: "user", content: command.text }] };
    } else {
      const pending = session.pending;
      if (!pending || pending.approvalId !== command.approvalId) throw new Error("授權請求不存在或已失效");
      agent = pending.agent as ReturnType<typeof buildAgent>;
      input = new Command({
        resume: {
          decisions: [{
            type: command.decision,
            ...(command.decision === "reject" ? { message: "使用者拒絕將資料送往此外部工具。" } : {}),
          }],
        },
      });
      if (command.decision === "approve") session.approvedTools.add(pending.tool);
      session.pending = undefined;
    }

    const stream = await agent.stream(input as never, runConfig as never);
    const finishReason = await consumeAgentStream(stream as AsyncIterable<unknown>, session, agent, messageId, write);
    write({ type: "message-end", messageId, finishReason });
  },
};
