import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { junyxEventSchema } from "@/lib/contracts";

export type JunyxTransportBody = { command: Record<string, unknown> };

export class JunyxChatTransport implements ChatTransport<UIMessage> {
  async sendMessages(options: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<ReadableStream<UIMessageChunk>> {
    const command = (options.body as JunyxTransportBody | undefined)?.command;
    if (!command) throw new Error("缺少 JUNYX chat command");
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(options.headers as Record<string, string> | undefined) },
      body: JSON.stringify(command),
      signal: options.abortSignal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(payload.message ?? "聊天請求失敗");
    }
    if (!response.body) throw new Error("瀏覽器不支援串流回應");

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        let buffer = "";
        let textPartId = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const parsed = junyxEventSchema.safeParse(JSON.parse(line));
              if (!parsed.success) continue;
              const event = parsed.data;
              if (event.type === "message-start") {
                textPartId = `${event.messageId}-text`;
                controller.enqueue({ type: "start", messageId: event.messageId });
                controller.enqueue({ type: "text-start", id: textPartId });
              } else if (event.type === "text-delta") {
                controller.enqueue({ type: "text-delta", id: textPartId, delta: event.delta });
              } else if (event.type === "tool-awaiting-approval") {
                controller.enqueue({
                  type: "data-approval",
                  id: event.approvalId,
                  data: { approvalId: event.approvalId, tool: event.tool, summary: event.summary, arguments: event.arguments },
                  transient: true,
                });
              } else if (event.type === "tool-result" && event.ui) {
                controller.enqueue({ type: "data-uiBlock", id: event.callId, data: event.ui });
              } else if (event.type === "error") {
                controller.enqueue({ type: "error", errorText: `${event.error.message} (${event.error.correlationId})` });
              } else if (event.type === "message-end") {
                if (textPartId) controller.enqueue({ type: "text-end", id: textPartId });
                controller.enqueue({ type: "finish", finishReason: event.finishReason === "length" ? "length" : event.finishReason === "error" ? "error" : "stop" });
              }
            }
          }
        } catch (error) {
          controller.error(error);
          return;
        }
        controller.close();
      },
      cancel() { void reader.cancel(); },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}
