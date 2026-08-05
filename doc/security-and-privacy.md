# 安全與隱私

狀態：Draft

## 信任邊界

不可信資料包含使用者輸入、模型輸出、工具參數、工具回應、外部 API 回應、上傳檔案與客戶端提交的歷史訊息。通過 schema 只代表形狀正確，不代表內容已獲授權或安全。

## 隱私承諾

- 預設推論在本機完成，llama-server 預設只監聽 loopback。
- 未啟用外部工具時，對話不得由應用主動送至外部服務。
- 外部工具執行前，介面應顯示工具名稱、目的與預計送出的資料摘要。
- 預設 log 不記錄完整 Prompt、模型回覆、工具秘密或未遮蔽的個人資料。
- 若未來加入遙測，必須 opt-in、可關閉，並另行記錄資料項目與保存期限。

## 主要威脅與控制

| 威脅 | 控制 |
|---|---|
| Prompt injection 誘導呼叫工具 | 工具 allowlist、schema、業務規則與獨立授權，不以模型文字作為權限 |
| 工具回應包含惡意指令 | 標記為資料，限制長度，不拼接為高權限 system 指令 |
| 任意路徑讀取 | canonicalize 後檢查允許根目錄，拒絕 traversal、symlink escape 與敏感檔 |
| SSRF | URL 解析、網域 allowlist、拒絕本機/私有網段及 redirect 重新驗證 |
| XSS | 禁止任意 HTML，Markdown sanitizer，UI props schema 驗證 |
| 秘密洩漏 | `.env` 不入版控、錯誤遮蔽、工具只取得必要秘密 |
| 資源耗盡 | payload、context、步數、並行數、timeout 與輸出大小限制 |
| 未授權遠端使用 | MVP 僅 loopback；開放網路前必須加入認證與 TLS 設計 |

## 工具權限

- 權限判斷在應用端完成，不委派給模型。
- 使用者同意必須對應實際參數；不得用模糊說明取得廣泛授權。
- 有副作用的工具需要 idempotency key、執行前確認與可稽核結果；MVP 暫不納入。
- 工具秘密只能在伺服器端取得，不放入 Prompt 或回傳 UI。

## 資料保存

MVP 是否保存對話尚未定案。在此之前採下列安全預設：

- 伺服器不建立永久對話資料庫。
- 瀏覽器狀態僅用於當前工作階段；若使用 local storage，需先在 UI 揭露。
- 診斷 log 使用 correlation ID，內容最小化並允許使用者清除。

## 安全驗收門檻

- 外部工具未授權時不產生網路請求。
- 未知工具、未知 UI block、無效 schema 皆 fail closed。
- 測試涵蓋 prompt injection、XSS、SSRF、路徑 traversal 及秘密遮蔽。
- 對外監聽或引入寫入型工具前，必須建立新的 ADR 與 threat model 更新。
