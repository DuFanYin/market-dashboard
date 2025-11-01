import os
import yaml
from datetime import datetime
from dotenv import load_dotenv
from ib_insync import IB

load_dotenv()

IB_HOST = os.getenv("IB_HOST", "127.0.0.1")
IB_PORT = int(os.getenv("IB_PORT", "7497"))
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
        with open("positions.yaml", "w") as f:
            yaml.dump(data, f, sort_keys=False)
        print("✅ Saved to positions.yaml")
    finally:
        ib.disconnect()

if __name__ == "__main__":
    main()