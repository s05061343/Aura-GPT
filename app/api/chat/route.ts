import { randomUUID } from "node:crypto";
import { auraAgentRuntime } from "@/lib/agent/runtime";
import { chatCommandSchema, type AuraEvent } from "@/lib/contracts";
import { toPublicError } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { sessionStore } from "@/lib/agent/session-store";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function line(event: AuraEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = randomUUID();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ code: "INVALID_REQUEST", message: "請求不是有效 JSON。", retryable: false, correlationId }, { status: 400 });
  }
  const parsed = chatCommandSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ code: "INVALID_REQUEST", message: "聊天請求格式不正確。", retryable: false, correlationId }, { status: 400 });
  }

  logEvent("chat.request", { correlationId, threadId: parsed.data.threadId, type: parsed.data.type });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      try {
        await auraAgentRuntime.run(parsed.data, request.signal, (event) => controller.enqueue(line(event)));
        logEvent("chat.complete", { correlationId, durationMs: Date.now() - startedAt });
      } catch (error) {
        logEvent("chat.error", { correlationId, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
        controller.enqueue(line({ type: "error", error: toPublicError(error, correlationId) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Correlation-Id": correlationId,
    },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const threadId = new URL(request.url).searchParams.get("threadId");
  const parsed = z.string().uuid().safeParse(threadId);
  if (!parsed.success) return Response.json({ message: "threadId 格式不正確" }, { status: 400 });
  sessionStore.clear(parsed.data);
  return new Response(null, { status: 204 });
}
