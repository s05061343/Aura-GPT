# 架構決策紀錄

狀態：Living

決策狀態使用 `Proposed`、`Accepted`、`Superseded`。本輪建立的技術方向尚未經實作驗證，因此均標為 Proposed。

## ADR-001：文件採索引式專案記憶

- 狀態：Accepted
- 背景：需要讓 Agent 與開發者快速定位規格，並避免單一巨大文件重複或過期。
- 決策：根目錄 `AGENTS.md` 僅保存固定規則與閱讀路由；`doc/README.md` 作為文件索引；細節依領域分檔。
- 後果：任何新增文件都必須加入索引，跨領域變更需同步更新相關文件。

## ADR-002：LangChain.js 是核心 Agent 編排層

- 狀態：Accepted
- 背景：原設計同時指定 AI SDK 與 LangChain，但兩者責任重疊，會增加串流與 tool event 轉換成本。
- 決策：LangChain.js 負責模型抽象、Prompt、Structured Tools、有限步數 Agent loop 與執行事件，是唯一 Agent orchestrator。AI SDK 僅負責前端聊天狀態及串流呈現，由 adapter 轉換 LangChain 事件。
- 替代方案：由 AI SDK 或自製程式管理 Agent loop。
- 後果：必須建立明確的 LangChain model adapter、agent runtime 介面與 stream protocol adapter；不得在 route 或 UI 重複實作工具迴圈。
- 重新評估條件：若 LangChain 無法穩定支援目標 llama-server API 或造成不可接受的效能與維護成本，需以契約測試及 ADR 證據重新決策。

## ADR-006：MVP 不引入 LangGraph

- 狀態：Proposed
- 背景：保留 LangChain 不代表必須立即採用圖式、持久化工作流。
- 決策：MVP 使用 LangChain 的 Agent/runtime 能力；LangGraph 延後評估。
- 重新評估條件：需要可恢復 checkpoint、明確分支圖、人機中斷續跑或多 Agent 協作。

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

## 待決策清單

| ID | 問題 | 阻擋階段 |
|---|---|---|
| Q-001 | 第一個正式工具是什麼？ | Phase 2 |
| Q-002 | 對話是否保存；若保存，位置與期限為何？ | Phase 1 後續設計 |
| Q-003 | 外部工具使用逐次、每工具或全域授權？ | Phase 2 |
| Q-004 | 是否以 Docker Compose 作為第二種支援啟動方式？ | Phase 4 |
| Q-005 | 第一個支援模型及目標硬體規格？ | Phase 0 |
