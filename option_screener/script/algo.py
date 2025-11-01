import json
import math
from datetime import datetime
from itertools import product
from pathlib import Path

# ===== SETTINGS =====
# Use relative path - script is in forward/script/, data is in forward/data/
json_path = str(Path(__file__).parent.parent / "data" / "chains.json")
min_iv = 0.0001
min_volume = 20
min_oi = 50
top_n = 5
# ====================

def to_years(exp):
    dt = datetime.strptime(exp, "%Y-%m-%d")
    return (dt - datetime.today()).days / 365.0

def forward_vol(iv1, iv2, T1, T2):
    num = iv2*iv2*T2 - iv1*iv1*T1
    den = T2 - T1
    if den <= 0 or num <= 0:
        return None
    return math.sqrt(num/den)

def extract_iv(opt):
    g = opt.get("greeks", {})
    for k in ("mid_iv","iv","bid_iv","ask_iv","smv_vol",
              "implied_volatility","volatility"):
        try:
            v = float(g.get(k) or opt.get(k))
            if v > 0:
                return v
        except:
            pass
    return None

# ===== load JSON =====
with open(json_path) as f:
    data = json.load(f)

symbol = data.get("symbols",[None])[0]
options = data.get("chains",{}).get(symbol,[])
print(f"Total options downloaded: {len(options)}")

# ===== clean + filter =====
clean = []
for opt in options:
    iv = extract_iv(opt)
    exp = opt.get("expiration_date")
    otype = opt.get("option_type")

    try:
        volume = float(opt.get("volume") or opt.get("last_volume") or opt.get("average_volume"))
        oi = float(opt.get("open_interest") or opt.get("openInterest"))
    except:
        continue

    if not exp or iv is None or iv < min_iv or volume < min_volume or oi < min_oi:
        continue

    clean.append({
        "symbol": opt["symbol"],
        "strike": opt["strike"],
        "expiration": exp,
        "type": otype,
        "iv": iv,
        "volume": volume,
        "oi": oi
    })

print(f"After filtering: {len(clean)} options left")

# ===== group by (type,strike) =====
groups = {}
for o in clean:
    key = (o["type"], o["strike"])   # CALL–CALL or PUT–PUT only
    groups.setdefault(key, []).append(o)

# ===== compute forward vols =====
results = []

for (otype,strike), opts in groups.items():
    if len(opts) < 2:
        continue

    # 按到期排序，方便形成 term structure
    opts_sorted = sorted(opts, key=lambda x: x["expiration"])

    for o1, o2 in product(opts_sorted, opts_sorted):
        if o1["expiration"] == o2["expiration"]:
            continue

        T1 = to_years(o1["expiration"])
        T2 = to_years(o2["expiration"])
        if T2 <= T1:
            continue

        fv = forward_vol(o1["iv"], o2["iv"], T1, T2)
        if fv:
            results.append((fv, o1, o2))

# sort descending by forward vol
results.sort(key=lambda x: x[0], reverse=True)

print(f"\n=== TOP {top_n} highest forward vols for {symbol} ===")

if not results:
    print("No valid combinations found.")
else:
    for rank,(fv, o1, o2) in enumerate(results[:top_n],1):
        print(f"\n#{rank} | Forward Vol = {fv:.4f}")
        print(f"Shorter: {o1['symbol']} ({o1['expiration']}) iv={o1['iv']:.4f} vol={o1['volume']} oi={o1['oi']}")
        print(f"Longer : {o2['symbol']} ({o2['expiration']}) iv={o2['iv']:.4f} vol={o2['volume']} oi={o2['oi']}")