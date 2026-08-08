import asyncio
import time
from typing import Any, Literal
from urllib.parse import urlencode

import httpx
from langchain.tools import tool
from pydantic import BaseModel, ConfigDict, Field

from .config import get_settings


class WeatherInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: str = Field(min_length=1, max_length=120, description="要查詢天氣的城市、行政區或地名")


class StockInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=80, description="台股股票代碼或公司簡稱，例如 2330 或台積電")
    market: Literal["listed", "otc", "auto"] = "auto"


TAIWAN_LOCATIONS = {
    "臺北": ("臺北市", "Taipei"), "臺北市": ("臺北市", "Taipei"),
    "新北": ("新北市", "New Taipei"), "新北市": ("新北市", "New Taipei"),
    "桃園": ("桃園市", "Taoyuan"), "桃園市": ("桃園市", "Taoyuan"),
    "臺中": ("臺中市", "Taichung"), "臺中市": ("臺中市", "Taichung"),
    "臺南": ("臺南市", "Tainan"), "臺南市": ("臺南市", "Tainan"),
    "高雄": ("高雄市", "Kaohsiung"), "高雄市": ("高雄市", "Kaohsiung"),
    "基隆": ("基隆市", "Keelung"), "基隆市": ("基隆市", "Keelung"),
    "新竹": ("新竹市", "Hsinchu"), "新竹市": ("新竹市", "Hsinchu"),
    "新竹縣": ("新竹縣", "Zhubei"), "嘉義": ("嘉義市", "Chiayi"),
    "嘉義市": ("嘉義市", "Chiayi"), "嘉義縣": ("嘉義縣", "Taibao"),
    "苗栗": ("苗栗縣", "Miaoli"), "苗栗縣": ("苗栗縣", "Miaoli"),
    "彰化": ("彰化縣", "Changhua"), "彰化縣": ("彰化縣", "Changhua"),
    "南投": ("南投縣", "Nantou"), "南投縣": ("南投縣", "Nantou"),
    "雲林": ("雲林縣", "Douliu"), "雲林縣": ("雲林縣", "Douliu"),
    "屏東": ("屏東縣", "Pingtung"), "屏東縣": ("屏東縣", "Pingtung"),
    "宜蘭": ("宜蘭縣", "Yilan"), "宜蘭縣": ("宜蘭縣", "Yilan"),
    "花蓮": ("花蓮縣", "Hualien"), "花蓮縣": ("花蓮縣", "Hualien"),
    "臺東": ("臺東縣", "Taitung"), "臺東縣": ("臺東縣", "Taitung"),
    "澎湖": ("澎湖縣", "Magong"), "澎湖縣": ("澎湖縣", "Magong"),
    "金門": ("金門縣", "Jincheng"), "金門縣": ("金門縣", "Jincheng"),
    "連江": ("連江縣", "Nangan"), "連江縣": ("連江縣", "Nangan"), "馬祖": ("連江縣", "Nangan"),
}

_cache: dict[str, tuple[float, Any]] = {}


def _normalise_location(value: str) -> str:
    return "".join(value.strip().replace("台", "臺").split())


def _cached(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and entry[0] > time.monotonic():
        return entry[1]
    _cache.pop(key, None)
    return None


async def _json(url: str) -> Any:
    timeout = get_settings().tool_timeout_ms / 1000
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, headers={"User-Agent": "JUNYX/0.2"}) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.json()


@tool(args_schema=WeatherInput)
async def get_weather(location: str) -> dict[str, Any]:
    """查詢指定地點的目前天氣。外部唯讀工具，會將地點文字送往 Open-Meteo。"""
    normalized = _normalise_location(location)
    taiwan = TAIWAN_LOCATIONS.get(normalized)
    key = f"weather:{taiwan[0] if taiwan else normalized}"
    if cached := _cached(key):
        return cached
    queries = list(dict.fromkeys([location, taiwan[1] if taiwan else None, normalized, normalized.rstrip("市縣區鄉鎮")]))
    place = None
    for query in filter(None, queries):
        params = urlencode({"name": query, "count": 5 if taiwan else 1, "language": "zh", "format": "json"})
        geo = await _json(f"https://geocoding-api.open-meteo.com/v1/search?{params}")
        results = geo.get("results", []) if isinstance(geo, dict) else []
        place = next((item for item in results if not taiwan or str(item.get("country_code", "")).upper() == "TW"), None)
        if place:
            break
    if not place:
        return {"status": "error", "code": "LOCATION_NOT_FOUND", "message": "找不到這個地點，請提供城市、縣市或鄉鎮區名稱。"}
    params = urlencode({
        "latitude": place["latitude"], "longitude": place["longitude"], "timezone": "auto",
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code",
    })
    forecast = await _json(f"https://api.open-meteo.com/v1/forecast?{params}")
    current = forecast["current"]
    props = {
        "location": taiwan[0] if taiwan else "，".join(filter(None, [place.get("name"), place.get("admin1"), place.get("country")])),
        "timezone": forecast["timezone"], "observedAt": current["time"],
        "temperatureC": current["temperature_2m"], "apparentTemperatureC": current.get("apparent_temperature"),
        "humidityPercent": current.get("relative_humidity_2m"), "precipitationMm": current.get("precipitation"),
        "weatherCode": current.get("weather_code"),
    }
    result = {"status": "ok", **props, "source": "Open-Meteo", "ui": {"type": "weather-card", "version": 1, "props": props}}
    _cache[key] = (time.monotonic() + 300, result)
    return result


def _text(row: dict[str, Any], keys: list[str]) -> str:
    return next((str(row[k]).strip() for k in keys if row.get(k) is not None and str(row[k]).strip()), "")


def _normalise_rows(raw: Any, market: Literal["listed", "otc"]) -> list[dict[str, Any]]:
    rows = raw if isinstance(raw, list) else raw.get("data", []) if isinstance(raw, dict) else []
    result = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = _text(row, ["Code", "SecuritiesCompanyCode", "SecuritiesCompanyCode ", "股票代號", "代號"])
        name = _text(row, ["Name", "CompanyName", "SecuritiesCompanyName", "股票名稱", "名稱"])
        raw_price = _text(row, ["ClosingPrice", "Close", "ClosePrice", "收盤價"]).replace(",", "")
        date = _text(row, ["Date", "TradeDate", "資料日期", "日期"])
        try:
            close = float(raw_price)
        except ValueError:
            continue
        if not symbol or not name:
            continue
        if len(date) == 7 and date.isdigit():
            date = f"{int(date[:3]) + 1911}-{date[3:5]}-{date[5:7]}"
        elif len(date) == 8 and date.isdigit():
            date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
        result.append({"symbol": symbol, "name": name, "market": market, "currency": "TWD", "closePrice": close,
                       "tradeDate": date, "source": "TWSE" if market == "listed" else "TPEx", "realtime": False})
    return result


async def _load_market(market: Literal["listed", "otc"]) -> list[dict[str, Any]]:
    key = f"stock:{market}"
    if cached := _cached(key):
        return cached
    url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL" if market == "listed" else "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
    rows = _normalise_rows(await _json(url), market)
    _cache[key] = (time.monotonic() + 600, rows)
    return rows


@tool(args_schema=StockInput)
async def get_tw_stock_quote(query: str, market: str = "auto") -> dict[str, Any]:
    """查詢臺灣上市或上櫃股票最新官方收盤價；不是即時盤中行情或投資建議。"""
    markets = ["listed", "otc"] if market == "auto" else [market]
    quotes = [quote for group in await asyncio.gather(*(_load_market(item) for item in markets)) for quote in group]
    matches = [quote for quote in quotes if quote["symbol"] == query or quote["name"] == query]
    if not matches:
        matches = [quote for quote in quotes if query in quote["name"]]
    if not matches:
        return {"status": "not_found", "query": query, "message": "找不到符合的上市或上櫃股票。"}
    if len(matches) > 1:
        return {"status": "ambiguous", "query": query, "candidates": [{k: row[k] for k in ("symbol", "name", "market")} for row in matches[:8]]}
    quote = matches[0]
    return {"status": "ok", **quote, "ui": {"type": "stock-quote-card", "version": 1, "props": quote}}


TOOLS = [get_weather, get_tw_stock_quote]
EXTERNAL_TOOL_NAMES = {item.name for item in TOOLS}
