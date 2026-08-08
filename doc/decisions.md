# 架構決策紀錄

狀態：Living

決策狀態使用 `Proposed`、`Accepted`、`Superseded`。本輪建立的技術方向尚未經實作驗證，因此均標為 Proposed。

## ADR-001：文件採索引式專案記憶

- 狀態：Accepted
- 背景：需要讓 Agent 與開發者快速定位規格，並避免單一巨大文件重複或過期。
- 決策：根目錄 `AGENTS.md` 僅保存固定規則與閱讀路由；`doc/README.md` 作為文件索引；細節依領域分檔。
- 後果：任何新增文件都必須加入索引，跨領域變更需同步更新相關文件。

## ADR-002：LangChain.js 是核心 Agent 編排層

- 狀態：Superseded by ADR-009
- 背景：原設計同時指定 AI SDK 與 LangChain，但兩者責任重疊，會增加串流與 tool event 轉換成本。
- 決策：LangChain.js 負責模型抽象、Prompt、Structured Tools、有限步數 Agent loop 與執行事件，是唯一 Agent orchestrator。AI SDK 僅負責前端聊天狀態及串流呈現，由 adapter 轉換 LangChain 事件。
- 替代方案：由 AI SDK 或自製程式管理 Agent loop。
- 後果：必須建立明確的 LangChain model adapter、agent runtime 介面與 stream protocol adapter；不得在 route 或 UI 重複實作工具迴圈。
- 重新評估條件：若 LangChain 無法穩定支援目標 llama-server API 或造成不可接受的效能與維護成本，需以契約測試及 ADR 證據重新決策。

## ADR-006：不建立自訂 LangGraph，但使用 LangChain 內建 runtime

- 狀態：Accepted
- 背景：LangChain 1.x `createAgent()` 內部使用 LangGraph runtime，HITL 也需要 checkpointer。
- 決策：MVP 不自行建立 graph，但直接使用 LangChain 的內建 runtime、middleware、interrupt 與記憶體 checkpointer。
- 重新評估條件：需要永久 checkpoint、明確自訂分支圖或多 Agent 協作。

## ADR-003：以 adapter 宣稱有限模型相容性

- 狀態：Proposed
- 背景：GGUF 只描述模型檔格式，無法保證 chat template、tools schema 或 JSON 行為一致。
- 決策：LangChain model adapter 只依賴經測試的 OpenAI-compatible API 子集，並以 model profile 和 smoke suite 管理支援範圍。
- 後果：產品用語使用「可替換已驗證模型」，不宣稱任意 GGUF 無縫相容。

## ADR-004：Generative UI 使用白名單 descriptor

- 狀態：Proposed
- 背景：渲染模型產生的 HTML/JavaScript 會造成 XSS 與不可控副作用。
- 決策：伺服器只產生版本化、通過 schema 的 UI block；客戶端 registry 決定實際 React component。
- 後果：新增 UI 能力需要程式碼與 schema 變更，但安全性與測試性較高。

## ADR-005：MVP 為單程序單模型語意

- 狀態：Proposed
- 背景：原文件稱「動態抽換」，實際腳本需要重新啟動 llama-server。
- 決策：MVP 模型切換明確定義為 restart-and-verify，不實作 hot swap。
- 後果：部署與 UI 不應暗示模型可零中斷切換。

## ADR-007：Windows AMD runtime 採 HIP 優先、Vulkan 備援

- 狀態：Accepted
- 背景：目標硬體為 AMD Radeon RX 9070 XT，CUDA runtime 無法使用；llama.cpp 官方 Windows release 同時提供 HIP 與 Vulkan。
- 決策：setup 預設安裝隔離的 HIP 與 Vulkan binaries；啟動採 HIP 優先，僅在 `auto` 模式 readiness 失敗時改用 Vulkan。GGUF 模型由兩個後端共用。
- 後果：manifest、啟動、診斷與 smoke evidence 必須記錄實際 backend；不得再把 NVIDIA CUDA 列為預設需求。

## ADR-008：完整工作台 UI 與 planned placeholders

- 狀態：Accepted
- 背景：原始聊天頁能完成 MVP 流程，但缺少長時間使用所需的導覽、能力入口與清楚的執行狀態；新版概念稿同時包含尚未規劃的歷史、帳號、附件與模型設定。
- 決策：完整採用概念稿的工作台資訊架構與視覺語言。已實作能力接入正式流程；尚未實作能力保留入口並明確標示「待補」或 disabled，不建立假資料。
- 後果：視覺結構可以先穩定，但任何 planned 入口轉為可操作前，仍須補齊產品契約、實作、測試與必要的隱私／安全決策；模型入口不得暗示 hot swap。

## ADR-009：靜態 UI、Python Agent 與 Go 桌面 Supervisor

- 狀態：Accepted
- 背景：Next.js 全端 dev server、PowerShell 程序管理與 llama-server 同時啟動造成 Turbopack/Node worker 與大型模型快取的記憶體尖峰，且 PID/子程序清理不可靠。產品需要可見的 Windows system tray 與不依賴 npm 的日常執行模式。
- 決策：Next.js 僅產生靜態 UI；LangChain Python `create_agent()` 在 FastAPI 中成為唯一 Agent orchestrator；Go `JUNYX.exe` 提供 system tray、靜態服務、API reverse proxy、health check 與 Windows Job Object 程序管理。日常執行不啟動 Node.js、npm 或 PowerShell。
- 替代方案：保留 LangChain.js 並建立獨立 Node API；用 Python 或 PowerShell 管理所有程序；Go 同時實作 Agent loop。
- 後果：前後端契約跨 Pydantic/Zod，需契約測試；發布包需攜帶受控 Python runtime；原 ADR-002 被取代；Go 不重作 Agent loop，FastAPI route 不重作工具迴圈。

## 待決策清單

| ID | 問題 | 阻擋階段 |
|---|---|---|
| Q-001 | 天氣與臺股最新官方收盤價 | 已決定 |
| Q-002 | 僅目前分頁，以記憶體保存 30 分鐘 | 已決定 |
| Q-003 | 每工具、每分頁首次授權 | 已決定 |
| Q-004 | MVP 不使用 Docker；日常執行採 Go system tray，Python/FastAPI Agent | 已決定 |
| Q-005 | Qwen3-8B Q4_K_M；AMD RX 9070 XT 16GB；HIP 優先、Vulkan 備援 | 已決定 |
