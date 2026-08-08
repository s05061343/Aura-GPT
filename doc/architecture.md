# 系統架構

狀態：Draft

## 架構原則

- UI、Agent API、程序監控與模型推論使用明確程序邊界。
- 日常執行不啟動 Node.js、npm、Next.js dev server 或 Turbopack。
- 對 llama.cpp 只依賴明確驗證過的 OpenAI-compatible API 子集。
- 模型輸出、工具輸出與外部 API 回應都視為不可信資料。
- 所有本機服務只監聽 loopback；瀏覽器只接觸 Go gateway。

## 元件與責任

```text
Browser
  │ http://127.0.0.1:3000
  ▼
JUNYX.exe (Go system tray / supervisor / static server / reverse proxy)
  ├── embedded Next.js static UI
  ├── /api/* ───────────────► FastAPI (127.0.0.1:8000)
  │                              ├── LangChain Python Agent
  │                              ├── Pydantic tool registry
  │                              └── session / HITL / NDJSON adapter
  └── Windows Job Object
       ├── Python backend
       └── llama-server (127.0.0.1:8080)
```

### Next.js 靜態 UI

- Next.js 僅在開發與發布建置階段執行，使用 `output: "export"` 產生靜態資產。
- 管理輸入、訊息呈現、停止、重試及工具授權互動。
- 只呼叫同源 `/api/chat` 與 `/api/status`；不直接存取 FastAPI 或 llama-server。
- 僅渲染 sanitized Markdown 與白名單 UI component descriptor。
- UI 外觀、工作台資訊架構與 planned/disabled 狀態保持既有契約。

### Go 桌面 Supervisor

- `JUNYX.exe` 是使用者唯一入口，常駐 Windows system tray，不顯示終端視窗。
- 嵌入並提供靜態 UI，將 `/api/*` 反向代理至 FastAPI。
- 驗證設定、模型與 backend；以 HIP 優先、Vulkan 備援啟動 llama-server。
- 啟動、監控與停止 FastAPI、llama-server；所有子程序加入 kill-on-close Windows Job Object。
- 重複啟動只開啟既有 UI；`JUNYX.exe stop` 透過帶本機隨機 token 的控制端點要求既有 instance 結束。
- Tray 選單提供開啟、狀態、重新啟動、檢視記錄及結束。

### FastAPI Agent API

- 驗證 HTTP 請求、建立 correlation ID、套用限制並輸出 NDJSON 事件。
- LangChain Python `create_agent()` 是唯一 Agent loop；FastAPI route 不建立第二套工具迴圈。
- 將取消訊號傳遞至 Agent、模型與工具，並維護 30 分鐘記憶體 session。
- 只監聽 `127.0.0.1:8000`，不直接對瀏覽器或 LAN 開放。

### LangChain Python Agent

- 管理 Prompt、message mapping、工具選擇、工具結果回填與最終輸出。
- 使用內建 middleware 實作模型步數、工具次數及 human-in-the-loop 限制。
- 使用記憶體 checkpointer 暫停及恢復工具授權；不建立自訂 LangGraph。
- LangChain 內部事件經 protocol adapter 轉為穩定的 `JunyxEvent`。

### 工具與模型

- 工具使用 Pydantic schema、allowlist、timeout、輸出限制與安全錯誤 mapping。
- 外部工具每個分頁首次使用前必須取得授權。
- llama-server 每個程序只載入一個 GGUF 模型，只綁定 loopback。
- 模型更換仍採停止、修改設定、重新啟動與 smoke test，不支援 hot swap。

## 主要資料流

### 一般對話

1. UI 將正規化命令送到 Go gateway 的 `/api/chat`。
2. Go 透明串流代理至 FastAPI；FastAPI 驗證後交給 LangChain Agent。
3. Agent 透過 `ChatOpenAI` adapter 存取本機 llama-server。
4. NDJSON 增量事件原路回到 UI，由 AI SDK transport 轉為畫面訊息。

### 工具呼叫

1. 模型回傳結構化 tool call。
2. LangChain Agent 解析並由 HITL middleware 在未授權時暫停。
3. UI 顯示實際工具名稱與參數；批准後 FastAPI 以 `Command(resume=...)` 恢復同一 thread。
4. 工具通過 Pydantic 與業務規則驗證後執行，結果回填模型並建立白名單 UI descriptor。

## 技術選擇

- 桌面與程序管理：Go 1.26、Windows Job Object、Fyne systray。
- UI：Next.js 16／React 19 靜態輸出；Vercel AI SDK 只管理瀏覽器聊天狀態與串流呈現。
- API：Python 3.13、FastAPI、Uvicorn、Pydantic。
- Agent：LangChain Python `create_agent()` 與內建 LangGraph runtime。
- 推論：llama.cpp `llama-server`，AMD HIP 預設、Vulkan 備援。

## 演進邊界

- 發布包必須包含 `JUNYX.exe`、受控 Python runtime/dependencies、模型 runtime 與必要資產；Node.js 不是日常執行依賴。
- 若加入遠端存取，必須先設計認證、CSRF、TLS、rate limit 與秘密管理。
- 若加入持久化或多模型，新增明確 repository/router 邊界，不改變 UI 基本事件契約。
