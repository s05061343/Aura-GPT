# 系統架構

狀態：Draft

## 架構原則

- 將 UI、應用編排、工具執行與模型推論分離。
- 對 llama.cpp 只依賴明確驗證過的 API 子集。
- 模型輸出、工具輸出與外部 API 回應都視為不可信資料。
- MVP 採最少必要抽象；只有需求出現後才加入工作流框架。

## 元件與責任

```text
Browser
  │  chat request / stream events
  ▼
Next.js UI ──────────────── UI component registry
  │
  ▼
Chat API / Agent loop ───── Tool registry ───── External or local services
  │
  ▼
LLM adapter
  │  verified OpenAI-compatible subset
  ▼
llama-server ────────────── one configured GGUF model
```

### Browser 與 UI

- 管理輸入、訊息顯示、停止、重試及工具授權互動。
- 僅渲染 Markdown 與白名單 UI component descriptor。
- 不保存伺服器秘密，不直接呼叫 llama-server 或具權限的工具。

### Chat API 與 Agent loop

- 驗證請求、建立 correlation ID、套用限制並啟動串流。
- 維護有限步數的 model → tool → model 迴圈。
- 將工具事件、文字增量、錯誤及完成狀態轉為統一事件。
- 傳遞取消訊號到模型與工具。

### LLM adapter

- 隔離 base URL、model alias、chat template 差異與能力旗標。
- 在啟動或 smoke test 階段檢查文字串流及工具呼叫能力。
- 不以「檔案是 GGUF」推論它一定支援 tools。

### Tool registry

- 每個工具定義名稱、版本、說明、Zod schema、風險等級、執行器與 UI mapping。
- 統一處理 timeout、錯誤正規化、輸出大小與敏感資料遮蔽。
- 執行器不得信任模型提供的路徑、URL 或識別碼。

### llama-server

- MVP 每個服務程序只載入一個模型。
- 僅綁定 loopback，除非使用者明確設定其他安全網路拓撲。
- 模型更換透過停止、修改設定、重新啟動與 smoke test 完成。

## 主要資料流

### 一般對話

1. UI 送出正規化訊息與 conversation ID。
2. Chat API 驗證大小與角色，呼叫 LLM adapter。
3. 文字增量經統一串流事件送回 UI。
4. 完成事件包含停止原因及基本使用量；無法取得的欄位保持省略。

### 工具呼叫

1. 模型回傳結構化 tool call。
2. Agent loop 檢查工具是否存在、schema 是否有效及是否需要授權。
3. 工具在 timeout 與輸出限制內執行。
4. 正規化結果回送模型；可顯示資料另建立 UI descriptor。
5. 達到最大步數、取消或錯誤時停止迴圈。

## 技術選擇

- UI/API：Next.js App Router，實際版本在建立專案時鎖定。
- 串流與 MVP Agent loop：暫定 Vercel AI SDK。
- Schema：Zod，工具執行期驗證與 TypeScript 型別共用來源。
- 推論：llama.cpp 的 `llama-server`。
- LangChain/LangGraph：MVP 不預設引入。持久化分支工作流、多 Agent 或複雜狀態機成為確認需求後，再用 ADR 評估。

## 演進邊界

- 若加入對話持久化，應新增 repository 介面，不讓 UI 直接依賴資料庫。
- 若加入多模型，新增 model registry/router，不改變 Chat API 的基本事件契約。
- 若加入遠端存取，必須先設計認證、CSRF、TLS、rate limit 及秘密管理。
