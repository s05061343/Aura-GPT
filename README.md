# JUNYX

JUNYX 是在 Windows 本機執行的桌面 AI Agent。Next.js 提供完整靜態工作台 UI，Python/FastAPI 與 LangChain 負責 Agent 與工具，Go `JUNYX.exe` 負責 system tray、靜態服務、程序監控及 llama.cpp。

## 技術組成

- Go 1.26：Windows system tray、Job Object、靜態 UI、API reverse proxy
- Python 3.13、FastAPI、LangChain Python、Pydantic
- Next.js 16、React 19、TypeScript、Vercel AI SDK（純靜態輸出）
- llama.cpp `llama-server`、Qwen3-8B Q4_K_M
- Open-Meteo、TWSE OpenAPI、TPEx OpenAPI

## 日常執行

發布版直接執行 `JUNYX.exe`。程式常駐 system tray，啟動 FastAPI 與 llama-server，並自動開啟 `http://127.0.0.1:3000`。

停止方式：

- 在 system tray 選擇「結束 JUNYX」。
- 自動化環境執行 `JUNYX.exe stop`。

日常執行不需要 npm、Node.js、PowerShell、`run.bat` 或 `stop.bat`。

## 開發與建置

需求：Windows 11、Node.js 24、pnpm 10、Python 3.13、Go 1.26，以及 AMD Radeon RX 9070 XT 或相容 AMD GPU。

```powershell
corepack pnpm install
corepack pnpm build

.\.runtime\toolchains\python\python.exe .runtime\downloads\pip.pyz install -r backend\requirements.lock
.\.runtime\toolchains\python\python.exe -m pytest backend\tests

Set-Location desktop
go test ./...
go build -ldflags "-H=windowsgui" -o ..\JUNYX.exe .
```

前端 `out/` 必須在 Go build 前同步至 `desktop/web/`；正式建置流程會執行這個步驟並將靜態資產嵌入 executable。

## 驗證

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
.\.runtime\toolchains\python\python.exe -m pytest backend\tests
Set-Location desktop
go test ./...
```

完整規格與決策由 [doc/README.md](doc/README.md) 索引。股票資料為最新官方收盤價，不是盤中即時行情，也不構成投資建議。
