# Aura-GPT

Aura-GPT 是以 LangChain.js 為核心、透過 llama.cpp 執行本機 Qwen3 GGUF 模型的單機 AI Agent。MVP 支援串流對話、天氣查詢、臺灣上市／上櫃最新官方收盤價、工具首次授權，以及白名單 Generative UI。

## 目前技術組成

- Next.js 16、React 19、TypeScript、Tailwind CSS、shadcn/ui patterns
- LangChain.js `createAgent()`、HITL middleware、記憶體 checkpointer
- Vercel AI SDK `useChat` 與自訂 `ChatTransport`
- llama.cpp `llama-server`、Qwen3-8B Q4_K_M
- Open-Meteo、TWSE OpenAPI、TPEx OpenAPI

## 開發環境

需求：Windows 11、PowerShell、Node.js 24 LTS，以及 AMD Radeon RX 9070 XT（16GB VRAM）或相容的 AMD GPU。預設使用 llama.cpp HIP 後端，啟動失敗時自動改用 Vulkan。

最簡單的方式是雙擊根目錄的 `run.bat`。它會檢查 Node.js、建立 `.env`、在必要時安裝套件及下載已驗證的 runtime/model，啟動後自動開啟瀏覽器。停止時雙擊 `stop.bat`。

```powershell
corepack pnpm install
Copy-Item .env.example .env
.\scripts\setup-runtime.ps1
.\scripts\start.ps1
```

開啟 `http://127.0.0.1:3000`。停止服務：

```powershell
.\scripts\stop.ps1
```

診斷與模型能力驗證：

```powershell
.\scripts\diagnose.ps1
.\scripts\smoke-test.ps1
```

`setup-runtime.ps1` 會依 [runtime-manifest.json](runtime-manifest.json) 同時準備 HIP 與 Vulkan 固定版本，且 SHA-256 不符時拒絕使用。模型與 runtime 不會加入 Git。可用 `-Backend hip` 或 `-Backend vulkan` 只安裝單一後端。

## 驗證

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
```

完整規格與決策由 [doc/README.md](doc/README.md) 索引。股票資料為最新官方收盤價，不是盤中即時行情，也不構成投資建議。
