# 部署與維運

狀態：Draft

## 支援拓撲

MVP 由兩個本機程序組成：

1. `llama-server`：載入一個 GGUF 模型並監聽 loopback。
2. Next.js：提供 UI、Chat API、LangChain Agent runtime 與工具執行。

MVP 僅支援 PowerShell，不提供 Bash 或 Docker。`scripts/` 包含 runtime setup、start、stop、diagnose 與 smoke-test。

一般使用者可雙擊根目錄 `run.bat`；它呼叫 `scripts/run.ps1` 執行前置檢查，並以 `.runtime/setup-complete.json` 中的 manifest SHA-256 判斷 runtime/model 是否已完成驗證。manifest 改變或標記不存在時會重新執行 setup。`stop.bat` 僅停止由本專案 PID 檔記錄的程序。

`run.ps1` 判定「已啟動」時必須同時確認 Web application 與 model readiness。若 Aura-GPT Web 程序仍在但 llama-server 已離線，啟動流程會復用既有 Web listener、重新啟動模型並重建 PID 紀錄；若 3000 埠屬於其他服務，則在載入模型前停止並回報衝突。

## 環境變數

| 名稱 | 必要 | 用途 | 安全預設 |
|---|---:|---|---|
| `LLM_MODEL_PATH` | 是 | GGUF 模型絕對或專案相對路徑 | 啟動前驗證存在且為檔案 |
| `LLM_BACKEND` | 否 | llama.cpp GPU 後端 | `auto`：HIP 優先、Vulkan 備援；亦可鎖定 `hip` 或 `vulkan` |
| `LLM_SERVER_HOST` | 否 | 推論服務監聽位址 | `127.0.0.1` |
| `LLM_SERVER_PORT` | 否 | 推論服務埠 | `8080` |
| `LLM_CONTEXT_SIZE` | 否 | context window | 依已驗證模型 profile |
| `LLM_GPU_LAYERS` | 否 | GPU offload | 不假設固定值，依硬體 profile |
| `LLAMA_SERVER_URL` | 否 | Chat API 連線位置 | `http://127.0.0.1:8080/v1` |
| `LLM_MODEL_ALIAS` | 否 | API 使用的穩定名稱 | `aura-local` |
| `AGENT_MAX_STEPS` | 否 | 單輪模型步數 | `5`，並設程式硬上限 |
| `TOOL_TIMEOUT_MS` | 否 | 一般工具 timeout | `15000` |
| `LOG_LEVEL` | 否 | log 詳細程度 | `info` |
| `AGENT_MAX_TOOL_CALLS` | 否 | 單輪工具呼叫上限 | `4` |
| `SESSION_TTL_MS` | 否 | 記憶體 thread 閒置期限 | `1800000` |
| `LANGSMITH_TRACING` | 否 | 啟用完整 LangSmith trace | `true` |
| `LANGSMITH_PROJECT` | 否 | LangSmith project | `aura-gpt-local` |
| `LANGSMITH_API_KEY` | 否 | LangSmith 金鑰 | 未設定時降級本機 metadata log |

`.env.example` 未來只放非秘密範例；`.env*` 的實際秘密版本與 `models/` 必須忽略。環境變數解析應使用可靠函式庫或 framework 機制，不使用 `export $(grep ... | xargs)`。

## 模型 profile

第一個 profile 是官方 `Qwen/Qwen3-8B-GGUF` 的 Q4_K_M，目標為 Windows 11 與 AMD Radeon RX 9070 XT 16GB。`runtime-manifest.json` 固定 llama.cpp release、HIP／Vulkan 後端與模型來源；setup 腳本從 GitHub/Hugging Face metadata 取得並驗證 SHA-256。

`setup-runtime.ps1` 預設安裝 HIP 與 Vulkan，分別放在 `.runtime/llama.cpp/hip` 和 `.runtime/llama.cpp/vulkan`，避免不同 backend 的 DLL 互相覆蓋。啟動時先以 `llama-server --list-devices` 驗證 backend 確實看見 GPU；`LLM_BACKEND=auto` 先嘗試 HIP，若沒有 GPU 裝置或 readiness 失敗，才停止該程序並嘗試 Vulkan。明確指定 `hip` 或 `vulkan` 時不自動切換，也不允許靜默退化為 CPU。Windows 的完整 ROCm stack 並非必要條件，官方 llama.cpp HIP package 可先搭配最新 AMD 驅動驗證；`rocminfo` 僅作額外診斷。

Windows HIP 套件的 `ggml-hip.dll` 依賴對應的 ROCm runtime。啟動腳本會優先採用 `ROCM_PATH\bin`，否則從 `%ProgramFiles%\AMD\ROCm\*\bin` 選擇最新且包含 `amdhip64_7.dll` 的版本，加入目前 llama-server 程序的 DLL 搜尋路徑；不修改系統 PATH。

若 backend 程序在 readiness 前退出，啟動流程會立即記錄其 stderr 並進入 fallback 或回報失敗，不會繼續等待完整 timeout。`--list-devices` 能看到顯卡只代表枚舉成功；模型載入 log 仍須出現 GPU device 與 layer offload 證據，才可判定 GPU profile 驗收通過。

通過裝置驗證後，啟動腳本會將第一個已驗證裝置以 `--device` 明確傳給 llama-server，避免多 GPU、虛擬顯示裝置或 backend 預設順序造成選錯裝置。

- 顯示名稱、來源 URL、授權與 SHA-256。
- 檔案名稱、量化方式及預估 RAM/VRAM。
- context size、chat template 與建議啟動參數。
- text streaming、tool calling、繁體中文測試結果。
- 已知限制與測試日期。

## 啟動流程

1. 驗證 Node、HIP／Vulkan llama-server、AMD GPU、模型檔與設定。
2. 確認埠未被占用，且監聽位址符合政策。
3. 啟動 llama-server，等待 health/readiness 成功。
4. 執行最小文字 smoke test；宣稱支援 tools 的模型再執行工具 smoke test。
5. 啟動 Next.js，輸出本機 URL 與 correlation-friendly log。

若第 5 步的 Aura-GPT Web 程序已存在，則復用該程序並只恢復缺失的 llama-server；不得僅因 `/api/status` 回傳 HTTP 200 就忽略其中的 model readiness。

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
