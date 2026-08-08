from junyx_backend.tools import _normalise_location, _normalise_rows, TAIWAN_LOCATIONS


def test_taiwan_aliases_normalise_tai_character() -> None:
    assert _normalise_location(" 台北市 ") == "臺北市"
    assert TAIWAN_LOCATIONS[_normalise_location("台北")][0] == "臺北市"


def test_hsinchu_and_chiayi_county_city_disambiguation() -> None:
    assert TAIWAN_LOCATIONS["新竹"][0] == "新竹市"
    assert TAIWAN_LOCATIONS["新竹縣"][0] == "新竹縣"
    assert TAIWAN_LOCATIONS["嘉義"][0] == "嘉義市"
    assert TAIWAN_LOCATIONS["嘉義縣"][0] == "嘉義縣"


def test_twse_rows_are_normalised() -> None:
    rows = _normalise_rows([{"Code": "2330", "Name": "台積電", "ClosingPrice": "1,005", "Date": "20260807"}], "listed")
    assert rows == [{
        "symbol": "2330", "name": "台積電", "market": "listed", "currency": "TWD",
        "closePrice": 1005.0, "tradeDate": "2026-08-07", "source": "TWSE", "realtime": False,
    }]
