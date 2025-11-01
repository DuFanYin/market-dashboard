import yaml
import requests
from datetime import datetime
from dotenv import load_dotenv
import os

load_dotenv()

TRADIER_TOKEN = os.getenv("TRADIER_TOKEN")
TRADIER_BASE_URL = os.getenv("TRADIER_BASE_URL", "https://api.tradier.com/v1/").rstrip("/") + "/"

HEADERS = {
    "Authorization": f"Bearer {TRADIER_TOKEN}",
    "Accept": "application/json",
}

def to_occ(symbol, expiry, right, strike):
    dt = datetime.strptime(expiry, "%Y%m%d")
    cp = "C" if right == "C" else "P"
    strike_int = int(strike * 1000)
    return f"{symbol}{dt:%y%m%d}{cp}{strike_int:08d}"

def get_quotes(symbols):
    if not symbols:
        return {}
    url = TRADIER_BASE_URL + "markets/quotes"
    resp = requests.get(url, headers=HEADERS, params={"symbols": ",".join(symbols)})
    resp.raise_for_status()
    raw = resp.json().get("quotes", {}).get("quote", [])

    if isinstance(raw, dict):
        raw = [raw]

    return {q["symbol"]: q for q in raw}


def mid_price(q):
    bid = q.get("bid")
    ask = q.get("ask")
    last = q.get("last")

    if isinstance(bid, (int, float)) and isinstance(ask, (int, float)):
        return (bid + ask) / 2
    if isinstance(last, (int, float)):
        return float(last)
    return None


# ============================================================
# ✅ Position Object
# ============================================================
class Position:
    def __init__(self, p):
        self.symbol = p["symbol"]
        self.secType = p["secType"]
        self.qty = p["position"]
        self.cost = p["avgCost"]

        # Optional fields for options
        self.right = p.get("right")
        self.strike = p.get("strike")
        self.expiry = p.get("expiry")

        # Will be filled in later
        self.price = None
        self.upnl = None

    @property
    def is_option(self):
        return self.secType == "OPT"

    @property
    def occ_symbol(self):
        if not self.is_option:
            return None
        return to_occ(self.symbol, self.expiry, self.right, self.strike)

    def update_market_price(self, q):
        self.price = mid_price(q) or 0

        # compute PnL
        if not self.is_option:
            self.upnl = (self.price - self.cost) * self.qty
        else:
            self.upnl = (self.price * 100 - self.cost) * self.qty

    def market_value(self):
        if self.price is None:
            return 0
        if not self.is_option:
            return self.price * self.qty
        return self.price * 100 * self.qty



# ============================================================
# ✅ Main
# ============================================================
def main():
    # --- load YAML ---
    with open("positions.yaml") as f:
        data = yaml.safe_load(f)

    cash = data["cash"]
    pos_objs = [Position(p) for p in data["positions"]]

    # --- request quotes ---
    symbols = [
        p.symbol if not p.is_option else p.occ_symbol
        for p in pos_objs
    ]
    quotes = get_quotes(symbols)

    # --- update prices + PnL ---
    for p in pos_objs:
        key = p.symbol if not p.is_option else p.occ_symbol
        p.update_market_price(quotes.get(key, {}))

    # --- totals ---
    total_stock_mv = sum(p.market_value() for p in pos_objs if not p.is_option)
    total_option_mv = sum(p.market_value() for p in pos_objs if p.is_option)
    total_upnl = sum(p.upnl for p in pos_objs)
    net_liquidation = cash + total_stock_mv + total_option_mv
    utilization = (net_liquidation - cash) / net_liquidation if net_liquidation != 0 else 0

    # --- print account summary first ---
    print("\n===== ACCOUNT SUMMARY =====")
    print(f"Net Liquidation:        ${net_liquidation:,.2f}")
    print(f"Cash:                   ${cash:,.2f}")
    print(f"Stock Market Value:     ${total_stock_mv:,.2f}")
    print(f"Option Market Value:    ${total_option_mv:,.2f}")
    print(f"Unrealized PnL:         ${total_upnl:,.2f}")
    print(f"Utilization:            {utilization:.2%}")

    # --- print positions table (stocks before options) ---
    print("\n===== POSITIONS =====")
    print(f"{'Type':<6} {'Symbol':<8} {'Qty':<10} {'Cost':<12} {'Mid Price':<12} "
          f"{'UPnL':<12} {'Right':<6} {'Strike':<10} {'Expiry':<12}")
    print("-" * 106)
    
    # Sort: stocks first (not p.is_option), then options
    sorted_positions = sorted(pos_objs, key=lambda p: p.is_option)
    
    for p in sorted_positions:
        if not p.is_option:
            # Stock positions - no values for right, strike, expiry
            print(
                f"{'STOCK':<6} {p.symbol:<8} {p.qty:<10.2f} ${p.cost:<11.2f} "
                f"${p.price:<11.2f} ${p.upnl:<11.2f} {'-':<6} {'-':<10} {'-':<12}"
            )
        else:
            # Option positions
            expiry_fmt = f"{p.expiry[:4]}-{p.expiry[4:6]}-{p.expiry[6:]}"
            cp = "CALL" if p.right == "C" else "PUT"
            print(
                f"{'OPT':<6} {p.symbol:<8} {p.qty:<10.2f} ${p.cost:<11.2f} "
                f"${p.price:<11.2f} ${p.upnl:<11.2f} {cp:<6} ${p.strike:<9.2f} {expiry_fmt:<12}"
            )


if __name__ == "__main__":
    main()