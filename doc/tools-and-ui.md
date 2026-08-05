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

## 首個工具的選擇條件

首個正式工具尚待確認。建議挑選唯讀、輸入簡單、有明確結果 schema、容易建立 mock 且不涉及敏感資料的工具，以驗證完整 Agent loop，而不是追求功能數量。
