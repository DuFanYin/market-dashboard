from datetime import datetime, timezone
from math import log10, sqrt
from statistics import mean
from dashboard import get_json

OKX_TICKER_URL = "https://www.okx.com/api/v5/market/index-tickers"
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

def calculate_threshold_prices():
    """Calculate what prices would give AHR indices of 0.45 and 1.2"""
    # Get sma200 and valuation (same as in get_ahr999)
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
    
    # Calculate valuation
    genesis = datetime(2009, 1, 3, tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - genesis).total_seconds() / 86400.0
    val = 10 ** (5.84 * log10(age_days) - 17.01)
    
    # Reverse calculate: ahr = (px / sma200) * (px / val) = px^2 / (sma200 * val)
    # So: px = sqrt(ahr * sma200 * val)
    px_045 = sqrt(0.45 * sma200 * val)
    px_12 = sqrt(1.2 * sma200 * val)
    
    return {
        "success": True,
        "sma200": sma200,
        "valuation": val,
        "price_for_ahr_045": px_045,
        "price_for_ahr_12": px_12
    }


if __name__ == "__main__":
    result = calculate_threshold_prices()
    if result.get("success"):
        print(f"SMA200: {result['sma200']:.2f}")
        print(f"Valuation: {result['valuation']:.2f}")
        print(f"\nPrice for AHR = 0.45: ${result['price_for_ahr_045']:.2f}")
        print(f"Price for AHR = 1.2: ${result['price_for_ahr_12']:.2f}")
    else:
        print(f"Error: {result.get('error')}")