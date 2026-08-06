# 工具與生成式 UI

狀態：Draft

## 工具定義

每個工具以 LangChain Structured Tool 註冊，並必須包含：

- 穩定且具 namespace 的名稱，例如 `weather.current.v1`。
- 清楚、避免誘導誤用的模型可見說明。
- 可供 LangChain 綁定模型的 Zod input schema，以及獨立的 output schema 或正規化器。
- 風險等級、是否唯讀、是否冪等、timeout 與最大輸出大小。
- 執行器與公開錯誤 mapping。
- 可選的 UI block mapping。

## 風險與授權

| 等級 | 範例 | MVP 政策 |
|---|---|---|
| Local read | 讀取已允許的本機資料 | 限定根目錄；是否逐次確認由工具決定 |
| External read | 天氣、搜尋 API | 執行前揭露送出的欄位並取得授權 |
| Mutating | 寫檔、修改行事曆 | 預設不納入 MVP，必須逐次確認 |
| Destructive/financial | 刪除、付款、發布 | MVP 禁止 |

授權必須綁定 `callId`、工具名稱與已驗證參數；參數變動後舊授權失效。

## 工具執行流程

1. 只接受 registry 中存在的精確工具名稱。
2. 解析後以 Zod 驗證；未知欄位預設拒絕。
3. 套用路徑、URL、網域、數值範圍等業務限制。
4. 根據風險政策取得授權。
5. 以 AbortSignal、timeout 與輸出上限執行。
6. 將內部錯誤正規化；外部文字不得提升為 system instruction。
7. 將工具結果和 UI descriptor 分開產生。

LangChain 負責選擇與呼叫工具；應用層 policy wrapper 負責授權和安全限制。不得因模型或 LangChain Agent 決定呼叫，就跳過使用者授權。

## Generative UI 契約

模型不能提供任意 HTML。它只能引用 registry 中已存在的 UI block：

```ts
type UIBlock =
  | { type: "weather-card"; version: 1; props: WeatherCardProps }
  | { type: "data-table"; version: 1; props: DataTableProps }
  | { type: "notice"; version: 1; props: NoticeProps };
```

- `props` 在伺服器與客戶端都要驗證。
- 純文字以 escaped text 顯示；Markdown 必須經安全 sanitizer。
- component registry 遇到未知 type/version 時，降級為安全文字或 JSON 摘要。
- UI 元件本身不得因 render 自動觸發外部請求或副作用。
- 工具原始回應不直接進入 component props，必須先正規化。

## Fallback

- 沒有適合工具：直接以模型知識回答，並避免暗示已取得即時資料。
- 模型產生不存在的工具：不執行，回傳可修正的 tool error；超過步數後停止。
- 參數無效：可讓模型修正一次；仍失敗則向使用者說明。
- 工具失敗：若安全且合理，可提供非即時的一般回答，但必須揭露工具失敗。
- UI block 無法渲染：保留文字答案，不能讓整則訊息消失。

## MVP 正式工具

- `get_weather`：使用 Open-Meteo geocoding 與 current forecast，輸入地點並輸出版本 1 WeatherCard。
- `get_weather` 會正規化臺灣全部縣市的「台／臺」、完整行政區名與常見省略尾碼寫法；新竹與嘉義的無尾碼簡稱預設指市，明確輸入「縣」時則使用縣政府所在地作代表座標。臺灣別名查詢只接受國別為 `TW` 的 geocoding 結果。
- 天氣工具失敗時回傳受控的結構化錯誤，不得將 LangChain 的原始 `Error` 或 `Please fix your mistakes` 提示顯示在 UI。
- `get_tw_stock_quote`：使用 TWSE 與 TPEx 官方 OpenAPI，依股票代碼或名稱查詢上市／上櫃最新收盤價，輸出版本 1 StockQuoteCard。
- 兩個工具都是 external read；每個 thread 第一次執行前以 LangChain HITL 暫停並要求批准，批准後該分頁不再重問。
- 股票輸出必須標示資料日期、`realtime:false` 與「非投資建議」。
