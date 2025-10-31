import requests

def get_gold_price():
    url = "https://data-asg.goldprice.org/dbXRates/USD"
    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    try:
        r = requests.get(url, headers=headers, timeout=10)
        data = r.json()

        item = data["items"][0]

        price = item["xauPrice"]
        prev = item["xauClose"]
        change = item["chgXau"]
        pct = item["pcXau"]

        print("===== Spot Gold (XAU/USD) =====")
        print(f"Price:           ${price:.2f}")
        print(f"Prev Close:      ${prev:.2f}")
        print(f"Change:          {change:+.2f}")
        print(f"Change %:        {pct:+.2f}%")

    except Exception as e:
        print("❌ Request failed:", e)

if __name__ == "__main__":
    get_gold_price()