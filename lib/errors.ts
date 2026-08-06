import type { PublicError } from "@/lib/contracts";

export function toPublicError(error: unknown, correlationId: string): PublicError {
  const message = error instanceof Error ? error.message : "未知錯誤";
  if (/fetch failed|ECONNREFUSED|model/i.test(message)) {
    return { code: "MODEL_UNAVAILABLE", message: "本機模型服務目前無法連線。", retryable: true, correlationId };
  }
  if (/timeout|aborted/i.test(message)) {
    return { code: "TOOL_TIMEOUT", message: "操作逾時或已取消。", retryable: true, correlationId };
  }
  return { code: "INTERNAL_ERROR", message: "處理請求時發生錯誤。", retryable: false, correlationId };
}
