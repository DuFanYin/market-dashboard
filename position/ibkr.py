import os
import yaml
from datetime import datetime
from dotenv import load_dotenv
from ib_insync import IB

load_dotenv()

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT_DIR, "data")
JSON_PATH = os.path.join(DATA_DIR, "account.json")

IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", "7496"))
IB_CLIENT_ID = int(os.getenv("IB_CLIENT_ID", "1"))

# --- connect ---
def ib_connect():
    ib = IB()
    ib.connect(IB_HOST, IB_PORT, clientId=IB_CLIENT_ID, readonly=True)
    return ib

# --- pull minimal IB data ---
def pull_ibkr_data(ib):
    summary = ib.accountSummary()
    positions = ib.positions()

    # ✅ get only TotalCashValue
    cash_value = None
    for row in summary:
        if row.tag == "TotalCashValue":
            cash_value = float(row.value)

    # ✅ serialize minimal positions
    pos_list = []
    for p in positions:
        c = p.contract
        item = {
            "symbol": c.symbol,
            "secType": c.secType,
            "position": float(p.position),
            "avgCost": float(p.avgCost),
        }
        if c.secType == "OPT":
            item.update({
                "right": c.right,
                "strike": c.strike,
                "expiry": c.lastTradeDateOrContractMonth
            })
        pos_list.append(item)

    return {
        "timestamp": datetime.now().isoformat(),
        "cash": cash_value,
        "positions": pos_list
    }

def main():
    ib = ib_connect()
    try:
        data = pull_ibkr_data(ib)
        os.makedirs(DATA_DIR, exist_ok=True)
        # 保留 account.json 里原有的其他字段，只更新 timestamp / cash / positions
        if os.path.exists(JSON_PATH):
            with open(JSON_PATH, "r") as f:
                try:
                    import json
                    existing = json.load(f)
                except Exception:
                    existing = {}
        else:
            existing = {}

        # Update timestamp at root level
        existing["timestamp"] = data["timestamp"]
        
        # Update IBKR_account object with cash and positions
        if "IBKR_account" not in existing:
            existing["IBKR_account"] = {}
        
        existing["IBKR_account"].update({
            "cash": data["cash"],
            "positions": data["positions"],
        })

        with open(JSON_PATH, "w") as f:
            import json

            json.dump(existing, f, ensure_ascii=False, indent=2)

        print(f"✅ Updated {JSON_PATH}")
    finally:
        ib.disconnect()

if __name__ == "__main__":
    main()