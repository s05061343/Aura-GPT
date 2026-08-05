# Aura-GPT Agent Guide

本檔是 Agent 的專案入口，不承載完整設計內容。開始工作前，依任務範圍讀取 `doc/README.md` 及其索引文件；不要依賴對話記憶取代專案文件。

## 固定規則

- 與使用者溝通及專案文件預設使用繁體中文；程式識別字、協議名稱與必要術語保留英文。
- 修改前先確認需求、影響範圍與驗收條件；若文件沒有答案，不自行把重大產品或架構假設視為定案。
- 本機推論是預設路徑。任何可能將 Prompt、對話或工具參數送往外部服務的功能，都必須明確揭露並經使用者啟用。
- 模型輸出永遠視為不可信輸入。工具參數必須驗證，Generative UI 只能使用白名單元件，不得執行模型生成的 HTML、JavaScript 或指令。
- 不把 `.env`、模型檔、對話資料、金鑰或執行紀錄提交至版本控制。
- 優先維持 Windows PowerShell 可用；若提供 Bash 操作，需同步提供等價 PowerShell 或跨平台方式。

## 文件讀取路由

1. 所有任務先讀 `doc/README.md`。
2. 產品範圍或驗收：讀 `doc/product-requirements.md`。
3. 元件、資料流或依賴：讀 `doc/architecture.md` 與 `doc/runtime-contracts.md`。
4. Tool Calling 或 Generative UI：讀 `doc/tools-and-ui.md`。
5. 隱私、權限或外部 API：讀 `doc/security-and-privacy.md`。
6. 啟動、模型、環境變數或維運：讀 `doc/operations.md`。
7. 測試或完成判定：讀 `doc/testing-and-acceptance.md`。
8. 工作順序與進度：讀 `doc/implementation-roadmap.md`。
9. 重大選型與未決事項：讀 `doc/decisions.md`。

## 文件同步規則

- 架構或公開介面改變時，同步更新相關規格、`doc/README.md` 的狀態，以及 `doc/decisions.md`。
- 新增環境變數時，同步更新 `doc/operations.md`；新增工具時，同步更新 `doc/tools-and-ui.md` 與測試規格。
- 完成 roadmap 項目時，附上驗證證據後才更新狀態。
- 新文件必須加入 `doc/README.md`，避免形成無索引的孤兒文件。
- 若程式與文件衝突，先查明是實作偏離或文件過期，不可靜默選擇其中一方。

## 初期實作邊界

- 第一版是單機、單使用者、單一載入模型。
- 「模型切換」初期代表重新啟動推論服務，不宣稱支援 hot swap。
- LangChain.js 是核心且唯一的 Agent 編排層，負責模型抽象、Prompt、工具註冊、Agent loop 與執行事件。
- Vercel AI SDK 僅負責前端聊天狀態與串流呈現，不得再建立第二套工具迴圈。
- LangGraph 不屬於 MVP；只有出現持久化工作流、分支圖、checkpoint 或多 Agent 需求時才重新評估。
- 套件版本必須鎖定並以官方文件驗證相容性；設計文件不使用未驗證的模型檔名或浮動版本作為承諾。
