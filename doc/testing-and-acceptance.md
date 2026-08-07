# 測試與驗收

狀態：Draft

## 測試分層

### Unit

- Zod schema 的有效、無效與邊界資料。
- 工具 registry、風險政策、授權綁定及錯誤 mapping。
- context 預算、步數限制、重試判斷與取消邏輯。
- UI block 驗證與未知版本 fallback。

### Integration

- 以 fake LLM 驗證 text → tool call → tool result → final text 完整迴圈。
- 驗證 LangChain event → JUNYX stream event 的 protocol adapter 契約，避免 LangChain 升級影響 UI。
- 串流開始前與開始後的錯誤行為。
- 工具 timeout、無效 JSON、未知工具、過大輸出及取消。
- LangChain model adapter 對 llama-server 已驗證 API 子集的契約測試。
- 驗證 ToolMessage 原始 JSON 不會轉成 `text-delta`，且跨輪累積訊息中的既有 `callId` 不會再次產生 UI card。
- 開發熱重載保留舊 session shape 時，新增的去重狀態必須惰性初始化，不得讓既有 thread 因缺少欄位而失敗。

### End-to-end

- 啟動本機服務、送出訊息、看到增量文字並可停止。
- 工具授權、執行、結果卡片與 fallback。
- 模型離線、工具失敗及重新整理後的預期行為。
- 鍵盤操作、焦點、loading/error announcement 等基本可及性。
- 桌面側欄收合與行動版 drawer 可操作；drawer 關閉時其中控制項不進入鍵盤焦點順序。
- planned 功能入口呈現一致的「待補」或 disabled 狀態，不顯示虛構歷史、帳號或模型切換結果。
- starter prompt 只填入 composer，不繞過正常送出、工具授權與 Agent runtime 流程。
- Web 程序存在但 llama-server 離線時，再次執行 `run.bat` 能恢復模型、重建 PID，並讓 `/api/status` 回報 model ready；非 JUNYX 程序占用 3000 時必須 fail closed。

### Security

- Prompt injection 無法越過工具權限。
- Markdown/工具結果無法注入 script 或 event handler。
- URL 與檔案工具拒絕 SSRF、traversal 及越界資源。
- 公開錯誤與 log 不洩漏秘密、Prompt 或主機敏感資訊。

### Model compatibility

- 每個受支援 profile 執行固定 smoke suite。
- 驗證 RX 9070 XT 的 HIP readiness；模擬 HIP 啟動失敗時，`auto` 模式必須停止失敗程序並切換 Vulkan。
- 明確指定 `hip` 或 `vulkan` 時不得靜默切換後端；測試證據必須記錄實際 backend。
- 測試結果包含模型 checksum、llama.cpp 版本、硬體與時間。
- 模型未通過工具測試時仍可標記為 `chat-only`，不可宣稱完整相容。

## MVP 驗收條件

- 全新環境依 `operations.md` 可重現啟動流程。
- 基本文字對話能串流、完成、取消與重試。
- 至少一個唯讀工具通過正常、拒絕、timeout 與錯誤流程。
- 天氣工具驗證臺灣縣市完整名稱、台／臺變體、常見簡稱及新竹／嘉義縣市消歧；公開串流不得洩漏 framework 原始工具錯誤提示。
- 最大 Agent 步數確實終止循環。
- 未授權外部工具不產生外部網路流量。
- 未知 UI block 或工具結果異常時仍能顯示安全 fallback。
- 支援模型清單中的每個 profile 有可追溯 smoke test 結果。
- lint、type check、unit、integration 與關鍵 E2E 測試通過，並證明工具迴圈只由 LangChain runtime 管理。
- 對應規格與 ADR 已更新，沒有阻擋發布的未決事項。

## 效能基準

不在設計階段承諾固定 tokens/sec，因結果高度依賴模型與硬體。實作後應記錄：

- 冷啟動與模型載入時間。
- time to first token、生成 tokens/sec 與完整請求時間。
- 工具前後的額外延遲。
- RAM、VRAM 峰值與 context size。
- 測試硬體、模型量化與執行參數。

## Definition of Done

功能只有在程式、測試、操作說明、相關規格與必要 ADR 一併完成後，才視為完成。僅在本機手動成功一次不構成完成。
