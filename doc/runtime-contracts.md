# 執行期契約

狀態：Draft

本文件定義概念契約；實作時應以共用 Zod schema 產生 TypeScript 型別，避免前後端各自維護。

## Chat request

```ts
type ChatRequest = {
  conversationId?: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
  }>;
  enabledTools?: string[];
};
```

限制：

- 不接受客戶端偽造的 `system` 或 `tool` 訊息。
- 訊息數、單則長度與總 payload 必須設上限。
- `enabledTools` 只是使用者授權範圍，伺服器仍需套用自己的 allowlist。

## 串流事件

實作可使用 AI SDK 已定義的 wire protocol，但應在應用層保留下列語意，不讓 UI 依賴供應商私有物件：

```ts
type AuraStreamEvent =
  | { type: "message-start"; messageId: string }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "tool-awaiting-approval"; callId: string; tool: string; summary: string }
  | { type: "tool-start"; callId: string; tool: string }
  | { type: "tool-result"; callId: string; tool: string; data: unknown; ui?: UIBlock }
  | { type: "tool-error"; callId: string; tool: string; error: PublicError }
  | { type: "message-end"; messageId: string; finishReason: FinishReason }
  | { type: "error"; error: PublicError };
```

## Agent loop

MVP 預設政策：

- 每次使用者請求最多 5 個模型步驟；正式數值可由環境設定覆寫並設硬上限。
- 每個工具都有獨立 timeout，預設建議 15 秒。
- 唯讀且冪等的工具最多自動重試一次；其他工具不得自動重試。
- 同一輪平行工具呼叫只允許明確標示為唯讀、彼此獨立的工具。
- 工具結果必須限制序列化大小；超限時截斷或摘要，並標記不完整。
- 收到 AbortSignal 後，不得啟動新工具，現有模型與工具請求應盡力取消。

## 錯誤模型

```ts
type PublicError = {
  code:
    | "INVALID_REQUEST"
    | "MODEL_UNAVAILABLE"
    | "MODEL_INCOMPATIBLE"
    | "TOOL_NOT_FOUND"
    | "TOOL_INPUT_INVALID"
    | "TOOL_APPROVAL_REQUIRED"
    | "TOOL_TIMEOUT"
    | "TOOL_FAILED"
    | "RATE_LIMITED"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  correlationId: string;
};
```

- 對使用者不回傳 stack trace、主機路徑、秘密或原始外部 API 錯誤。
- 內部 log 可記錄詳細原因，但依隱私政策遮蔽資料。
- HTTP 尚未開始串流時使用適當狀態碼；開始串流後以 `error` 事件結束。

## 對話與 context

- MVP 可先採客戶端帶回歷史訊息，但伺服器必須重新驗證，且不得信任客戶端工具結果。
- 超過 context 預算時，保留 system policy 與最近訊息；摘要策略須另行測試後才啟用。
- token 預算應保留輸出與工具結果空間，不可把完整 context 全部用於輸入。
- 是否持久化對話仍是產品待決事項。

## 相容性檢查

每個列入支援清單的模型至少驗證：

1. 基本文字與 UTF-8 繁體中文輸出。
2. 串流能正常結束及取消。
3. 單一工具呼叫能產生符合 schema 的參數。
4. 不適用工具時能直接回答。
5. 工具錯誤回傳後能合理降級。
