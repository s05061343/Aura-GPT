# 部署與維運

狀態：Draft

## 支援拓撲

MVP 由兩個本機程序組成：

1. `llama-server`：載入一個 GGUF 模型並監聽 loopback。
2. Next.js：提供 UI、Chat API、LangChain Agent runtime 與工具執行。

正式建立專案時應提供 PowerShell 啟動腳本；可另外提供 Bash，兩者共用相同設定語意。Docker Compose 是否加入留待實作階段確認。

## 環境變數

| 名稱 | 必要 | 用途 | 安全預設 |
|---|---:|---|---|
| `LLM_MODEL_PATH` | 是 | GGUF 模型絕對或專案相對路徑 | 啟動前驗證存在且為檔案 |
| `LLM_SERVER_HOST` | 否 | 推論服務監聽位址 | `127.0.0.1` |
| `LLM_SERVER_PORT` | 否 | 推論服務埠 | `8080` |
| `LLM_CONTEXT_SIZE` | 否 | context window | 依已驗證模型 profile |
| `LLM_GPU_LAYERS` | 否 | GPU offload | 不假設固定值，依硬體 profile |
| `LLAMA_SERVER_URL` | 否 | Chat API 連線位置 | `http://127.0.0.1:8080/v1` |
| `LLM_MODEL_ALIAS` | 否 | API 使用的穩定名稱 | `aura-local` |
| `AGENT_MAX_STEPS` | 否 | 單輪模型步數 | `5`，並設程式硬上限 |
| `TOOL_TIMEOUT_MS` | 否 | 一般工具 timeout | `15000` |
| `LOG_LEVEL` | 否 | log 詳細程度 | `info` |

`.env.example` 未來只放非秘密範例；`.env*` 的實際秘密版本與 `models/` 必須忽略。環境變數解析應使用可靠函式庫或 framework 機制，不使用 `export $(grep ... | xargs)`。

## 模型 profile

不要以任意檔名代表相容性。每個支援模型應有一份 profile，至少記錄：

- 顯示名稱、來源 URL、授權與 SHA-256。
- 檔案名稱、量化方式及預估 RAM/VRAM。
- context size、chat template 與建議啟動參數。
- text streaming、tool calling、繁體中文測試結果。
- 已知限制與測試日期。

## 啟動流程

1. 驗證 Node、llama-server、模型檔與設定。
2. 確認埠未被占用，且監聽位址符合政策。
3. 啟動 llama-server，等待 health/readiness 成功。
4. 執行最小文字 smoke test；宣稱支援 tools 的模型再執行工具 smoke test。
5. 啟動 Next.js，輸出本機 URL 與 correlation-friendly log。

模型切換採「停止 → 修改 profile/path → 啟動 → smoke test」。第一版不稱為 hot swap。

## Health 與診斷

- `liveness`：應用程序仍可服務。
- `readiness`：推論服務可連線且模型已就緒。
- 診斷頁/命令顯示版本、模型 alias、能力旗標、context 設定與服務狀態，不顯示秘密或完整主機路徑。
- log 至少包含 timestamp、level、event、correlation ID、step、duration、result；Prompt 內容預設省略。

## 故障處理

- 模型不可用：拒絕新請求並提供啟動診斷，不進入無限重試。
- context 超限：回傳明確錯誤或採已驗證的裁切策略。
- 工具不可用：隔離至該次 tool call，不關閉聊天服務。
- UI 斷線或取消：傳遞 AbortSignal，清理串流與執行中的資源。
