# 部署與維運

狀態：Draft

## 支援拓撲

JUNYX 日常執行由三個本機程序組成：

1. `JUNYX.exe`：Go system tray、supervisor、靜態 UI server 與 API reverse proxy。
2. Python/FastAPI：LangChain Agent、工具、session 與 NDJSON API。
3. `llama-server.exe`：載入單一 GGUF 模型。

所有服務只監聽 loopback：Go `3000`、FastAPI `8000`、llama-server `8080`。使用者只執行 `JUNYX.exe`；日常執行不需要 Node.js、npm、PowerShell、`run.bat` 或 `stop.bat`。

## System tray 與停止語意

- 啟動後顯示 system tray icon，不開啟終端視窗；就緒後自動開啟瀏覽器。
- Tray 選單包含「開啟 JUNYX」、「狀態」、「重新啟動服務」、「檢視記錄」、「結束 JUNYX」。
- 所有子程序加入 kill-on-close Windows Job Object；正常結束先要求 graceful shutdown，逾時或 supervisor 異常退出時由 Job Object 回收。
- 重複執行 `JUNYX.exe` 不建立第二個模型，只開啟既有 UI。
- 自動化可使用 `JUNYX.exe stop`；命令讀取 `.runtime/control-token` 並只向 loopback 控制端點提出一次停止要求。

## 建置與發布

開發機需要 Node.js 24、pnpm 10、Python 3.13 與 Go 1.26。發布建置依序：

1. 安裝鎖定的前端依賴並執行 `pnpm build`，產生 `out/`。
2. 建立 `.venv` 並安裝鎖定的 Python dependencies，執行 pytest。
3. 將 `out/` 同步至 Go embed 目錄，使用 `-H=windowsgui` 編譯 `JUNYX.exe`。
4. 執行 Go、Python、TypeScript 與 Playwright 測試。

Node.js/Turbopack 只存在於步驟 1，不得出現在發布版日常程序樹。

## 環境變數

| 名稱 | 必要 | 用途 | 安全預設 |
|---|---:|---|---|
| `JUNYX_PYTHON` | 否 | 開發環境 Python executable | `.venv/Scripts/python.exe`，再嘗試受控 runtime |
| `LLM_MODEL_PATH` | 是 | GGUF 模型絕對或專案相對路徑 | 啟動前驗證存在 |
| `LLM_BACKEND` | 否 | llama.cpp GPU backend | `auto`：HIP 優先、Vulkan 備援 |
| `LLM_SERVER_PORT` | 否 | 推論服務埠 | `8080` |
| `LLM_CONTEXT_SIZE` | 否 | context window | `8192` |
| `LLM_GPU_LAYERS` | 否 | GPU offload | `99` |
| `LLM_CACHE_RAM_MB` | 否 | llama.cpp prompt cache 上限 MiB | `0`，停用 |
| `LLAMA_SERVER_URL` | 否 | FastAPI 連接模型的位置 | `http://127.0.0.1:8080/v1` |
| `LLM_MODEL_ALIAS` | 否 | API 穩定模型名稱 | `junyx-local` |
| `LLM_MODEL_DISPLAY_NAME` | 否 | UI 顯示名稱 | `Qwen3 8B` |
| `AGENT_MAX_STEPS` | 否 | 單輪模型步數 | `5`，硬上限 `8` |
| `AGENT_MAX_TOOL_CALLS` | 否 | 單輪工具呼叫上限 | `4`，硬上限 `8` |
| `TOOL_TIMEOUT_MS` | 否 | 工具 timeout | `15000` |
| `SESSION_TTL_MS` | 否 | thread 閒置期限 | `1800000` |
| `LANGSMITH_TRACING` | 否 | 完整 LangSmith trace | `true`；無金鑰安全降級 |
| `LANGSMITH_PROJECT` | 否 | LangSmith project | `junyx-local` |
| `LANGSMITH_API_KEY` | 否 | LangSmith 金鑰 | 空白，不啟用上傳 |

`.env`、Python runtime、模型、log、token 與 build artifacts 不得提交版本控制。

## 啟動流程

1. `JUNYX.exe` 確認 3000 未被其他服務占用，建立 Job Object。
2. 讀取 manifest 與 `.env`，驗證模型、HIP/Vulkan binaries 與 GPU device。
3. 明確傳入 `--cache-ram 0` 等界限參數啟動 llama-server，等待 health。
4. 啟動 FastAPI，等待 `/api/status` application readiness。
5. 啟動內嵌靜態 server/reverse proxy，更新 tray 狀態並開啟瀏覽器。

任一步驟失敗都停止本次已啟動的子程序並在 tray/log 顯示失敗，不進入無限重試。

## Health、log 與故障處理

- `/api/status` 同時回報 application、model 與 LangSmith 狀態。
- Go log 位於 `logs/junyx.log`；Python 與 llama stdout/stderr 使用獨立檔案。
- log 只記 metadata、correlation ID 與錯誤類別，不記 Prompt、回覆、工具內容或秘密。
- 模型不可用時拒絕新請求；工具錯誤只影響該次 call；瀏覽器取消時停止串流並盡力取消下游操作。
