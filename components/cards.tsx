import { CloudSun, Info, Landmark, TriangleAlert } from "lucide-react";
import type { UIBlock } from "@/lib/contracts";

function formatLocalDateTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}` : value;
}

function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value;
}

export function UIBlockView({ block }: { block: UIBlock }) {
  if (block.type === "weather-card") {
    const p = block.props;
    return (
      <section className="mt-3 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4" aria-label="天氣資訊">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-cyan-800">{p.location}</p><p className="mt-2 text-4xl font-bold">{p.temperatureC.toFixed(1)}°C</p></div>
          <CloudSun className="size-9 text-cyan-600" aria-hidden="true" />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-700">
          <div><dt className="text-slate-500">體感</dt><dd>{p.apparentTemperatureC ?? "—"}°C</dd></div>
          <div><dt className="text-slate-500">濕度</dt><dd>{p.humidityPercent ?? "—"}%</dd></div>
          <div><dt className="text-slate-500">降水</dt><dd>{p.precipitationMm ?? "—"} mm</dd></div>
          <div><dt className="text-slate-500">觀測時間</dt><dd>{formatLocalDateTime(p.observedAt)}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">來源：Open-Meteo · {p.timezone}</p>
      </section>
    );
  }
  if (block.type === "stock-quote-card") {
    const p = block.props;
    return (
      <section className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4" aria-label="股票收盤資訊">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-amber-900">{p.name} · {p.symbol}</p><p className="mt-2 text-4xl font-bold">NT$ {p.closePrice.toLocaleString("zh-TW")}</p></div>
          <Landmark className="size-8 text-amber-700" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm text-slate-700">{p.market === "listed" ? "上市" : "上櫃"} · 交易日期 {formatDate(p.tradeDate)} · 來源 {p.source}</p>
        <p className="mt-3 flex gap-2 rounded-lg bg-amber-100/80 p-2 text-xs text-amber-950"><TriangleAlert className="size-4 shrink-0" />最新官方收盤價，非即時行情，僅供資訊參考且不構成投資建議。</p>
      </section>
    );
  }
  return <p className="mt-3 flex gap-2 rounded-xl bg-slate-100 p-3 text-sm"><Info className="size-4 shrink-0" />{block.props.text}</p>;
}
