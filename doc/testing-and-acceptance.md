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
- 串流開始前與開始後的錯誤行為。
- 工具 timeout、無效 JSON、未知工具、過大輸出及取消。
- llama-server adapter 對已驗證 API 子集的契約測試。

### End-to-end

- 啟動本機服務、送出訊息、看到增量文字並可停止。
- 工具授權、執行、結果卡片與 fallback。
- 模型離線、工具失敗及重新整理後的預期行為。
- 鍵盤操作、焦點、loading/error announcement 等基本可及性。

### Security

- Prompt injection 無法越過工具權限。
- Markdown/工具結果無法注入 script 或 event handler。
- URL 與檔案工具拒絕 SSRF、traversal 及越界資源。
- 公開錯誤與 log 不洩漏秘密、Prompt 或主機敏感資訊。

### Model compatibility

- 每個受支援 profile 執行固定 smoke suite。
- 測試結果包含模型 checksum、llama.cpp 版本、硬體與時間。
- 模型未通過工具測試時仍可標記為 `chat-only`，不可宣稱完整相容。

## MVP 驗收條件

- 全新環境依 `operations.md` 可重現啟動流程。
- 基本文字對話能串流、完成、取消與重試。
- 至少一個唯讀工具通過正常、拒絕、timeout 與錯誤流程。
- 最大 Agent 步數確實終止循環。
- 未授權外部工具不產生外部網路流量。
- 未知 UI block 或工具結果異常時仍能顯示安全 fallback。
- 支援模型清單中的每個 profile 有可追溯 smoke test 結果。
- lint、type check、unit、integration 與關鍵 E2E 測試通過。
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
