import requests
from datetime import datetime, timezone, date
from statistics import mean
from math import log10

# ========= Pretty Print =========
def print_sep(title: str):
    print("\n" + "=" * 20 + f" {title} " + "=" * 20)

def fmt2(x):
    try:
        return f"{float(x):.2f}"
    except Exception:
        return str(x)

def fmt(x):
    try:
        return f"{float(x):,.2f}"
    except Exception:
        return x

# ========= Session & fetch =========
SESSION = requests.Session()
REQUEST_TIMEOUT = 10

def get_json(url: str, *, headers=None, params=None, teapot_hint=False):
    try:
        r = SESSION.get(url, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        if teapot_hint and r.status_code == 418:
            return {"blocked": True}     # 用结构返回，而不是打印
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}

# ========= 1. CNN Market Index =========
HEADERS_CNN = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://edition.cnn.com/",
    "Accept-Language": "en-US,en;q=0.9"
}

def get_cnn_market_indexes():
    today = date.today().strftime("%Y-%m-%d")
    url = f"https://production.dataviz.cnn.io/markets/index/DJII-USA,SP500-CME,COMP-USA/{today}"
    j = get_json(url, headers=HEADERS_CNN, teapot_hint=True)

    if not j or isinstance(j, dict) and ("blocked" in j or "error" in j):
        return {"success": False, "data": None}

    # list of dicts
    return {
        "success": True,
        "data": [{
            "name": x["name"],
            "current": x["current_price"],
            "prev": x["prev_close_price"],
            "change": x["price_change_from_prev_close"],
            "pct": x["percent_change_from_prev_close"]
        } for x in j]
    }

# ========= 2. CNN Fear & Greed =========
def get_cnn_fear_greed():
    today = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")
    url = f"https://production.dataviz.cnn.io/index/fearandgreed/graphdata/{today}"
    j = get_json(url, headers=HEADERS_CNN, teapot_hint=True)

    if not j or isinstance(j, dict) and ("blocked" in j or "error" in j):
        return {"success": False, "data": None}

    fg = j.get("fear_and_greed", {})
    details = {}

    keys = [
        "put_call_options",
        "market_volatility_vix",
        "market_volatility_vix_50",
        "market_momentum_sp500",
        "market_momentum_sp125",
        "stock_price_strength",
        "stock_price_breadth",
        "junk_bond_demand",
        "safe_haven_demand"
    ]

    for k in keys:
        obj = j.get(k, {})
        if not obj:
            details[k] = None
        else:
            details[k] = {
                "score": obj.get("score"),
                "rating": obj.get("rating"),
                "value": obj.get("data", [{}])[0].get("y")
            }

    return {
        "success": True,
        "summary": {
            "score": fg.get("score"),
            "rating": fg.get("rating"),
            "prev": fg.get("previous_close"),
            "w1": fg.get("previous_1_week"),
            "m1": fg.get("previous_1_month"),
            "y1": fg.get("previous_1_year"),
        },
        "details": details
    }

# ========= 3. OKX Prices =========
OKX_TICKER_URL = "https://www.okx.com/api/v5/market/index-tickers"
OKX_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Origin": "https://www.tradingdigits.io",
    "Referer": "https://www.tradingdigits.io/"
}
SYMBOLS = ["BTC-USDT", "ETH-USDT"]

def get_okx_prices():
    rows = []
    for inst in SYMBOLS:
        j = get_json(OKX_TICKER_URL, headers=OKX_HEADERS, params={"instId": inst})
        if not j or "data" not in j or not j["data"]:
            rows.append({"inst": inst, "success": False})
            continue

        d = j["data"][0]
        price = float(d["idxPx"])
        open_utc = float(d["sodUtc0"])
        change = price - open_utc
        pct = (change / open_utc) * 100
        rows.append({
            "inst": inst,
            "success": True,
            "price": price,
            "open": open_utc,
            "change": change,
            "pct": pct
        })
    return rows

# ========= 4. AHR999 =========
OKX_CANDLES = "https://www.okx.com/api/v5/market/candles"

def get_ahr999():
    # ---- 历史日线 ----
    candles = get_json(OKX_CANDLES, params={"instId": "BTC-USDT", "bar": "1D", "limit": 400})
    if not candles or "data" not in candles:
        return {"success": False, "error": "no candles"}

    rows = []
    for arr in candles["data"]:
        ts_ms = int(arr[0])
        close = float(arr[4])
        d_utc = datetime.fromtimestamp(ts_ms/1000, tz=timezone.utc).date()
        rows.append((d_utc, close, ts_ms))

    rows.sort(key=lambda x: x[2])
    today_utc = datetime.now(timezone.utc).date()
    rows = [r for r in rows if r[0] < today_utc]

    if len(rows) < 200:
        return {"success": False, "error": "not enough days"}

    closes = [c for _, c, _ in rows]
    sma200 = mean(closes[-200:])

    # ---- 当前价格 ----
    tick = get_json(OKX_TICKER_URL, params={"instId": "BTC-USDT"})
    if not tick or "data" not in tick or not tick["data"]:
        return {"success": False, "error": "no price"}

    px = float(tick["data"][0]["idxPx"])
    ts_ms = int(tick["data"][0]["ts"])
    px_dt = datetime.fromtimestamp(ts_ms/1000, tz=timezone.utc)

    # ---- AHR999 ----
    genesis = datetime(2009, 1, 3, tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - genesis).total_seconds() / 86400.0
    val = 10 ** (5.84 * log10(age_days) - 17.01)
    ahr = (px / sma200) * (px / val)

    if ahr < 0.45:
        zone = "🔵 低估/抄底区"
    elif ahr < 1.2:
        zone = "🟢 定投区"
    elif ahr < 2.0:
        zone = "🟡 中性偏高区"
    else:
        zone = "🔴 风险区（很高）"

    return {
        "success": True,
        "px": px,
        "px_dt": px_dt,
        "sma200": sma200,
        "valuation": val,
        "ahr": ahr,
        "zone": zone
    }

# ========= Unified Printer =========
