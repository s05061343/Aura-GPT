# 執行期契約

狀態：Draft

本文件定義概念契約；實作時應以共用 Zod schema 產生 TypeScript 型別，避免前後端各自維護。

## Chat request

`POST /api/chat` 接受 discriminated union：

```ts
type ChatCommand =
  | { type: "message"; threadId: UUID; requestId: UUID; messageId: UUID; text: string }
  | { type: "approval"; threadId: UUID; requestId: UUID; approvalId: string; decision: "approve" | "reject" };
```

限制：

- 不接受客戶端歷史訊息或偽造的 `system`、`assistant`、`tool` 訊息；短期歷史由 LangChain 記憶體 checkpointer 管理。
- 訊息數、單則長度與總 payload 必須設上限。
- `DELETE /api/chat?threadId=<uuid>` 清除目前分頁的 checkpoint 與工具授權。

## 串流事件

LangChain callback/event stream 先轉為 NDJSON `JunyxEvent`，再由自訂 AI SDK `ChatTransport` 轉為 `UIMessageChunk`；UI 不依賴 LangChain 內部事件形狀：

`messages` stream 只允許 AI message chunk 轉成 `text-delta`；HumanMessage、ToolMessage 與其他內部訊息不得成為使用者可見文字。工具原始 JSON 只供 Agent 回填與伺服器端 UI mapping 使用。

```ts
type JunyxStreamEvent =
  | { type: "message-start"; messageId: string }
  | { type: "text-delta"; messageId: string; delta: string }
  | { type: "tool-awaiting-approval"; approvalId: string; callId: string; tool: string; summary: string; arguments: object }
  | { type: "tool-start"; callId: string; tool: string }
  | { type: "tool-result"; callId: string; tool: string; data: unknown; ui?: UIBlock }
  | { type: "tool-error"; callId: string; tool: string; error: PublicError }
  | { type: "message-end"; messageId: string; finishReason: FinishReason }
  | { type: "error"; error: PublicError };
```

## Agent loop

Agent loop 由 LangChain runtime 唯一負責。Next.js route 只做傳輸、驗證與事件轉換，不自行判斷下一個工具步驟。MVP 預設政策：

- 每次使用者請求最多 5 個模型步驟；正式數值可由環境設定覆寫並設硬上限。
- 每個工具都有獨立 timeout，預設建議 15 秒。
- 唯讀且冪等的工具最多自動重試一次；其他工具不得自動重試。
- 同一輪平行工具呼叫只允許明確標示為唯讀、彼此獨立的工具。
- 工具結果必須限制序列化大小；超限時截斷或摘要，並標記不完整。
- 收到 AbortSignal 後，不得啟動新工具，現有模型與工具請求應盡力取消。
- 每個 thread 記錄已交付 UI 的 tool `callId`；累積 checkpoint 再次出現相同 ToolMessage 時不得重複發出 `tool-result`，新結果仍須依各自 `callId` 交付。

## LangChain 邊界

- 對內定義 `JunyxAgentRuntime` 介面，避免 route 直接耦合特定 Agent factory 或 executor 類別。
- LangChain message、tool call 與 callback event 僅存在於 agent/model adapter 層。
- model adapter 必須支援逐步串流、工具 schema 綁定、AbortSignal 與結構化完成原因。
- LangChain 版本升級若改變 event schema，應只修改 protocol adapter 與契約測試。
- 所有工具仍需經應用層 policy wrapper；註冊為 LangChain Tool 不等於取得執行權限。

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

- MVP 使用記憶體 checkpointer 保存目前分頁的短期歷史，閒置 30 分鐘清除；瀏覽器不回傳歷史或工具結果。
- 超過 context 預算時，保留 system policy 與最近訊息；摘要策略須另行測試後才啟用。
- token 預算應保留輸出與工具結果空間，不可把完整 context 全部用於輸入。
- 不持久化對話；重新整理即建立新 thread。

## 相容性檢查

每個列入支援清單的模型至少驗證：

1. 基本文字與 UTF-8 繁體中文輸出。
2. 串流能正常結束及取消。
3. 單一工具呼叫能產生符合 schema 的參數。
4. 不適用工具時能直接回答。
5. 工具錯誤回傳後能合理降級。
