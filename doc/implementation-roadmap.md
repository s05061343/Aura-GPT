# 實作路線圖

狀態：Draft

本路線圖描述後續實作順序，本輪不建立程式骨架。每一階段只有在退出條件成立後才進入下一階段。

## Phase 0：決策與環境基線

交付成果：

- 確認首個工具、對話保存政策與外部工具授權模式。
- 選定並鎖定 Node、Next.js、AI SDK、Zod 與 llama.cpp 版本。
- 選定第一個實際 GGUF 模型，建立包含來源、授權、checksum 與硬體需求的 profile。
- 驗證 llama-server 的文字串流及 native tool calling 行為。

退出條件：阻擋 MVP 的產品未決事項清除；基本模型 probe 有可重現結果。

## Phase 1：最小文字垂直切片

交付成果：

- 建立 Next.js/TypeScript 專案、設定驗證與本機啟動腳本。
- LLM adapter、Chat API、串流 UI、停止與錯誤狀態。
- fake LLM 測試及真實 llama-server smoke test。

退出條件：可從瀏覽器完成串流對話、取消、模型離線處理與 correlation ID 追蹤。

## Phase 2：受控 Agent loop

交付成果：

- Tool registry、共用 schema、步數限制、timeout、取消與錯誤模型。
- 一個 mock 工具及一個正式唯讀工具。
- 外部資料傳送揭露與授權 UI。

退出條件：正常、無匹配、無效參數、拒絕、timeout、工具失敗與循環上限測試全數通過。

## Phase 3：Generative UI

交付成果：

- 版本化 UI block schema 與 component registry。
- 正式工具結果元件、文字 fallback、Markdown sanitizer。
- 未知元件與惡意 props 的安全測試。

退出條件：模型無法注入任意 UI 程式碼；任何渲染錯誤都不會破壞文字答案。

## Phase 4：模型 profile 與可操作性

交付成果：

- PowerShell 啟動、停止、診斷與模型切換流程。
- readiness、模型能力 smoke suite、支援矩陣。
- 結構化 log、效能基準與故障排除文件。

退出條件：新開發環境能依文件重現；模型切換後自動驗證能力並明確顯示 chat-only 或 tools-capable。

## Phase 5：發布候選

交付成果：

- 完整 unit/integration/E2E/security 測試。
- 無障礙與錯誤體驗檢查。
- 威脅模型、授權與第三方套件清單。
- 規格狀態由 Draft 更新為 Accepted。

退出條件：`testing-and-acceptance.md` 的 MVP 驗收條件全部具備證據。

## 延後項目

- 對話永久保存與搜尋。
- 多模型同時載入、hot swap 或智慧路由。
- 多 Agent、持久化 graph workflow。
- 遠端部署、多使用者與帳號。
- 寫入型、破壞型或財務型工具。
