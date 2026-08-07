# JUNYX 文件索引

本目錄是 JUNYX 的持久化專案記憶。根目錄 `AGENTS.md` 負責閱讀路由，本檔負責文件導覽與狀態，不在多處重複同一份規格。

## 建議閱讀順序

| 順序 | 文件 | 用途 | 狀態 |
|---|---|---|---|
| 1 | [產品需求](product-requirements.md) | 目標、邊界、使用情境與成功指標 | Draft |
| 2 | [系統架構](architecture.md) | 元件責任、資料流與技術邊界 | Draft |
| 3 | [執行期契約](runtime-contracts.md) | Chat API、串流事件、錯誤與 Agent loop | Draft |
| 4 | [工具與生成式 UI](tools-and-ui.md) | Tool schema、權限及 UI 元件協議 | Draft |
| 5 | [安全與隱私](security-and-privacy.md) | 信任邊界、資料政策與威脅控制 | Draft |
| 6 | [部署與維運](operations.md) | 環境變數、模型設定、啟動與可觀測性 | Draft |
| 7 | [測試與驗收](testing-and-acceptance.md) | 測試矩陣與 Definition of Done | Draft |
| 8 | [實作路線圖](implementation-roadmap.md) | 分期、依賴、交付成果與退出條件 | Draft |
| 9 | [架構決策紀錄](decisions.md) | 已接受、暫定與待決策事項 | Living |

Markdown 規格是唯一實作依據。舊版 `JUNYX_Design_Document.html` 已移除，其有效內容已整合至本索引所列文件，以免維護兩套重複且可能漂移的規格。

## 狀態定義

- `Draft`：可用於討論及實作拆解，但仍可能調整。
- `Accepted`：已確認，可作為實作與驗收依據。
- `Living`：持續更新的紀錄。
- `Deprecated`：保留歷史用途，不得作為新實作依據。

## 更新原則

- 每項規格只能有一個主要來源，其他文件以連結引用。
- 重大決策需在 `decisions.md` 記錄背景、選項、結果與後果。
- 文件中的「必須」是驗收條件；「建議」可在決策紀錄中說明後偏離。
- 文件狀態升為 `Accepted` 前，必須清除會阻擋實作的未決事項。
