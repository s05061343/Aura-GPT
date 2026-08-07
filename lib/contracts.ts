import { z } from "zod";

export const publicErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "MODEL_UNAVAILABLE",
  "MODEL_INCOMPATIBLE",
  "TOOL_NOT_FOUND",
  "TOOL_INPUT_INVALID",
  "TOOL_APPROVAL_REQUIRED",
  "TOOL_TIMEOUT",
  "TOOL_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export const publicErrorSchema = z.object({
  code: publicErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  correlationId: z.string().uuid(),
});
export type PublicError = z.infer<typeof publicErrorSchema>;

export const weatherCardSchema = z.object({
  type: z.literal("weather-card"),
  version: z.literal(1),
  props: z.object({
    location: z.string(),
    timezone: z.string(),
    observedAt: z.string(),
    temperatureC: z.number(),
    apparentTemperatureC: z.number().nullable(),
    humidityPercent: z.number().nullable(),
    precipitationMm: z.number().nullable(),
    weatherCode: z.number().int().nullable(),
  }),
});

export const stockCardSchema = z.object({
  type: z.literal("stock-quote-card"),
  version: z.literal(1),
  props: z.object({
    symbol: z.string(),
    name: z.string(),
    market: z.enum(["listed", "otc"]),
    currency: z.literal("TWD"),
    closePrice: z.number(),
    tradeDate: z.string(),
    source: z.enum(["TWSE", "TPEx"]),
    realtime: z.literal(false),
  }),
});

export const noticeSchema = z.object({
  type: z.literal("notice"),
  version: z.literal(1),
  props: z.object({ tone: z.enum(["info", "warning", "error"]), text: z.string() }),
});

export const uiBlockSchema = z.discriminatedUnion("type", [weatherCardSchema, stockCardSchema, noticeSchema]);
export type UIBlock = z.infer<typeof uiBlockSchema>;

const idSchema = z.string().uuid();
export const chatCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message"),
    threadId: idSchema,
    requestId: idSchema,
    messageId: idSchema,
    text: z.string().trim().min(1).max(16_000),
  }).strict(),
  z.object({
    type: z.literal("approval"),
    threadId: idSchema,
    requestId: idSchema,
    approvalId: z.string().min(1).max(256),
    decision: z.enum(["approve", "reject"]),
  }).strict(),
]);
export type ChatCommand = z.infer<typeof chatCommandSchema>;

export const junyxEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message-start"), messageId: z.string() }),
  z.object({ type: z.literal("text-delta"), messageId: z.string(), delta: z.string() }),
  z.object({
    type: z.literal("tool-awaiting-approval"),
    approvalId: z.string(),
    callId: z.string(),
    tool: z.string(),
    summary: z.string(),
    arguments: z.record(z.string(), z.unknown()),
  }),
  z.object({ type: z.literal("tool-start"), callId: z.string(), tool: z.string() }),
  z.object({ type: z.literal("tool-result"), callId: z.string(), tool: z.string(), ui: uiBlockSchema.optional() }),
  z.object({ type: z.literal("message-end"), messageId: z.string(), finishReason: z.enum(["stop", "length", "error", "approval-required"]) }),
  z.object({ type: z.literal("error"), error: publicErrorSchema }),
]);
export type JunyxEvent = z.infer<typeof junyxEventSchema>;
