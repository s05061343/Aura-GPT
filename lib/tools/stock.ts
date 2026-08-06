import { z } from "zod";
import { MemoryCache } from "@/lib/cache";
import { getConfig } from "@/lib/config";
import { fetchJson } from "@/lib/fetch";
import type { UIBlock } from "@/lib/contracts";

export const stockInputSchema = z.object({
  query: z.string().trim().min(1).max(80).describe("台股股票代碼或公司簡稱，例如 2330 或台積電"),
  market: z.enum(["listed", "otc", "auto"]).default("auto").describe("上市、上櫃或自動判斷"),
}).strict();

type Market = "listed" | "otc";
type NormalizedQuote = {
  symbol: string;
  name: string;
  market: Market;
  currency: "TWD";
  closePrice: number;
  tradeDate: string;
  source: "TWSE" | "TPEx";
  realtime: false;
};

export type StockResult =
  | ({ status: "ok"; ui: UIBlock } & NormalizedQuote)
  | { status: "not_found"; query: string; message: string }
  | { status: "ambiguous"; query: string; candidates: Array<Pick<NormalizedQuote, "symbol" | "name" | "market">> };

const cache = new MemoryCache<NormalizedQuote[]>(10 * 60_000);

function text(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function price(row: Record<string, unknown>, keys: string[]): number | null {
  const raw = text(row, keys).replaceAll(",", "");
  if (!raw || raw === "--" || raw === "---") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTradeDate(value: string): string {
  if (/^\d{7}$/.test(value)) {
    const year = Number(value.slice(0, 3)) + 1911;
    return `${year}-${value.slice(3, 5)}-${value.slice(5, 7)}`;
  }
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

function normalizeRows(raw: unknown, market: Market): NormalizedQuote[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const symbol = text(row, ["Code", "SecuritiesCompanyCode", "SecuritiesCompanyCode ", "股票代號", "代號"]);
    const name = text(row, ["Name", "CompanyName", "SecuritiesCompanyName", "股票名稱", "名稱"]);
    const closePrice = price(row, ["ClosingPrice", "Close", "ClosePrice", "收盤價"]);
    const tradeDate = text(row, ["Date", "TradeDate", "資料日期", "日期"]);
    if (!symbol || !name || closePrice === null) return [];
    return [{
      symbol,
      name,
      market,
      currency: "TWD" as const,
      closePrice,
      tradeDate: tradeDate ? normalizeTradeDate(tradeDate) : new Date().toISOString().slice(0, 10),
      source: market === "listed" ? "TWSE" as const : "TPEx" as const,
      realtime: false as const,
    }];
  });
}

async function loadMarket(market: Market, signal?: AbortSignal): Promise<NormalizedQuote[]> {
  const cached = cache.get(market);
  if (cached) return cached;
  const url = market === "listed"
    ? "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL"
    : "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes";
  const rows = normalizeRows(await fetchJson(url, getConfig().TOOL_TIMEOUT_MS, signal), market);
  if (rows.length === 0) throw new Error(`${market} 行情來源沒有可用資料`);
  cache.set(market, rows);
  return rows;
}

export async function getTaiwanStockQuote(input: z.input<typeof stockInputSchema>, signal?: AbortSignal): Promise<StockResult> {
  const parsed = stockInputSchema.parse(input);
  const markets: Market[] = parsed.market === "auto" ? ["listed", "otc"] : [parsed.market];
  const quotes = (await Promise.all(markets.map((market) => loadMarket(market, signal)))).flat();
  const exact = quotes.filter((quote) => quote.symbol === parsed.query || quote.name === parsed.query);
  const fuzzy = exact.length > 0 ? exact : quotes.filter((quote) => quote.name.includes(parsed.query));
  if (fuzzy.length === 0) return { status: "not_found", query: parsed.query, message: "找不到符合的上市或上櫃股票。" };
  if (fuzzy.length > 1) {
    return { status: "ambiguous", query: parsed.query, candidates: fuzzy.slice(0, 8).map(({ symbol, name, market }) => ({ symbol, name, market })) };
  }
  const quote = fuzzy[0];
  return {
    status: "ok",
    ...quote,
    ui: { type: "stock-quote-card", version: 1, props: quote },
  };
}

export const __stockTesting = { normalizeRows };
