import requests
import json

def get_usd_sgd_snapshot():
    url = "https://query2.finance.yahoo.com/v8/finance/chart/SGD=X"
    params = {
        "period1": 1761955080,
        "period2": 1762178400,
        "interval": "1m",
        "includePrePost": "true",
        "events": "div|split|earn",
        "lang": "en-SG",
        "region": "SG",
        "source": "cosaic"
    }

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
        "Origin": "https://sg.finance.yahoo.com",
        "Referer": "https://sg.finance.yahoo.com/quote/SGD%3DX/"
    }

    r = requests.get(url, params=params, headers=headers)
    data = r.json()

    meta = data["chart"]["result"][0]["meta"]

    snapshot = {
        "regularMarketPrice": meta.get("regularMarketPrice"),
        "fiftyTwoWeekHigh": meta.get("fiftyTwoWeekHigh"),
        "fiftyTwoWeekLow": meta.get("fiftyTwoWeekLow"),
        "regularMarketDayHigh": meta.get("regularMarketDayHigh"),
        "regularMarketDayLow": meta.get("regularMarketDayLow")
    }

    return snapshot


if __name__ == "__main__":
    snapshot = get_usd_sgd_snapshot()
    print(json.dumps(snapshot, indent=2, sort_keys=True))