import yaml
import json
import math
import requests
from datetime import datetime
from dotenv import load_dotenv
import os
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

app = FastAPI()

# Get the directory where this script is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/templates", StaticFiles(directory=TEMPLATES_DIR), name="templates")

TRADIER_TOKEN = os.getenv("TRADIER_TOKEN")
TRADIER_BASE_URL = os.getenv("TRADIER_BASE_URL", "https://api.tradier.com/v1/").rstrip("/") + "/"

if not TRADIER_TOKEN:
    raise ValueError("TRADIER_TOKEN not found in environment variables. Please set it in your .env file.")

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
    resp = requests.get(url, headers=HEADERS, params={"symbols": ",".join(symbols), "greeks": "true"})
    resp.raise_for_status()
    raw = resp.json().get("quotes", {}).get("quote", [])

    if isinstance(raw, dict):
        raw = [raw]

    return {q["symbol"]: q for q in raw}





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
        self.delta = 0.0
        self.gamma = 0.0
        self.theta = 0.0

    @property
    def is_option(self):
        return self.secType == "OPT"

    @property
    def occ_symbol(self):
        if not self.is_option:
            return None
        return to_occ(self.symbol, self.expiry, self.right, self.strike)

    def _convert_greek(self, value):
        """Convert Greek value: float conversion, multiply by 100 and position size, round to 2dp"""
        return round(float(value or 0) * 100 * self.qty, 2)

    def update_market_price(self, q):

        bid = q.get("bid")
        ask = q.get("ask")

        base_price = (bid + ask) / 2

        # For options, multiply price by 100 (per contract price)
        self.price = base_price * (100 if self.is_option else 1)

        # Extract Greeks for options
        if self.is_option:
            greeks = q.get("greeks", {})
            self.delta = self._convert_greek(greeks.get("delta"))
            self.gamma = self._convert_greek(greeks.get("gamma"))
            self.theta = self._convert_greek(greeks.get("theta"))

        # compute PnL (same formula for stocks and options now)
        self.upnl = (self.price - self.cost) * self.qty

    def market_value(self):
        """Calculate market value: price * quantity (price already per-contract for options)"""
        return (self.price or 0) * self.qty



# ============================================================
# ✅ Data Processing
# ============================================================
def get_portfolio_data():
    """Load and process portfolio data"""
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
    total_theta = sum(p.theta for p in pos_objs if p.is_option)
    net_liquidation = cash + total_stock_mv + total_option_mv
    utilization = (net_liquidation - cash) / net_liquidation if net_liquidation != 0 else 0

    # Calculate pie chart data
    chart_segments = []
    if net_liquidation > 0:
        circumference = 2 * math.pi * 80
        pcts = {
            "cash": (cash / net_liquidation) * 100,
            "stock": (total_stock_mv / net_liquidation) * 100,
            "option": (total_option_mv / net_liquidation) * 100
        }
        
        offset = 0
        segments_data = [
            {"name": "cash", "pct": pcts["cash"], "color": "#d4d4d4", "value": cash},
            {"name": "stock", "pct": pcts["stock"], "color": "#a3a3a3", "value": total_stock_mv},
            {"name": "option", "pct": pcts["option"], "color": "#737373", "value": total_option_mv}
        ]
        
        for seg in segments_data:
            if seg["pct"] > 0:
                arc = (seg["pct"] / 100) * circumference
                chart_segments.append({
                    "name": seg["name"],
                    "pct": seg["pct"],
                    "color": seg["color"],
                    "arc": arc,
                    "offset": offset,
                    "value": seg["value"]
                })
                offset += arc

    # Sort: stocks first, then options by expiry date (nearest to farthest)
    sorted_positions = sorted(pos_objs, key=lambda p: (p.is_option, p.expiry or ""))

    # Convert Position objects to dictionaries for JSON serialization
    positions_dict = []
    for p in sorted_positions:
        pos_dict = {
            "symbol": p.symbol,
            "secType": p.secType,
            "qty": p.qty,
            "cost": p.cost,
            "price": p.price or 0,
            "upnl": p.upnl or 0,
            "is_option": p.is_option,
            "delta": p.delta,
            "gamma": p.gamma,
            "theta": p.theta
        }
        if p.is_option:
            pos_dict["right"] = p.right
            pos_dict["strike"] = p.strike
            pos_dict["expiry"] = p.expiry
        positions_dict.append(pos_dict)

    return {
        "cash": cash,
        "net_liquidation": net_liquidation,
        "total_stock_mv": total_stock_mv,
        "total_option_mv": total_option_mv,
        "total_upnl": total_upnl,
        "total_theta": total_theta,
        "utilization": utilization,
        "positions": positions_dict,
        "chart_segments": chart_segments,
        "circumference": 2 * math.pi * 80 if net_liquidation > 0 else 0
    }


# ============================================================
# ✅ FastAPI Routes
# ============================================================
@app.get("/favicon.ico")
async def favicon():
    """Return 204 No Content for favicon requests"""
    return Response(status_code=204)

@app.get("/api/portfolio")
async def get_portfolio():
    """API endpoint to get portfolio data"""
    data = get_portfolio_data()
    return JSONResponse(content=data)

@app.get("/", response_class=HTMLResponse)
async def index():
    """Serve the dashboard HTML file"""
    html_path = os.path.join(TEMPLATES_DIR, "dashboard.html")
    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)