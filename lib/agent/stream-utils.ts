import { uiBlockSchema, type UIBlock } from "@/lib/contracts";

function messageType(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as Record<string, unknown>;
  if (typeof record._getType === "function") return String((record._getType as () => unknown)());
  if (typeof record.type === "string") return record.type;
  const constructorName = (record.constructor as { name?: unknown } | undefined)?.name;
  return typeof constructorName === "string" && constructorName.toLowerCase().includes("ai") ? "ai" : "";
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
    return "";
  }).join("");
}

export function assistantStreamText(token: unknown): string {
  if (messageType(token) !== "ai") return "";
  return contentText((token as { content?: unknown }).content);
}

export type ToolResultEvent = { callId: string; tool: string; ui?: UIBlock };

export function findNewToolResults(update: unknown, deliveredCallIds: Set<string>): ToolResultEvent[] {
  if (!update || typeof update !== "object") return [];
  const results: ToolResultEvent[] = [];
  for (const node of Object.values(update as Record<string, unknown>)) {
    if (!node || typeof node !== "object") continue;
    const messages = (node as Record<string, unknown>).messages;
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      if (messageType(message) !== "tool") continue;
      const record = message as Record<string, unknown>;
      const callId = String(record.tool_call_id ?? record.toolCallId ?? "");
      if (!callId || deliveredCallIds.has(callId)) continue;
      const tool = String(record.name ?? "tool");
      let payload: unknown = record.content;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { /* plain tool output */ }
      }
      const candidate = payload && typeof payload === "object" && "ui" in payload ? (payload as { ui?: unknown }).ui : undefined;
      const parsed = candidate ? uiBlockSchema.safeParse(candidate) : undefined;
      deliveredCallIds.add(callId);
      results.push({ callId, tool, ui: parsed?.success ? parsed.data : undefined });
    }
  }
  return results;
}
