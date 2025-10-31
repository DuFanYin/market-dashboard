from dashboard import get_cnn_market_indexes, get_cnn_fear_greed, get_okx_prices, get_ahr999
from dashboard import print_sep, fmt2, fmt


def print_report():
    # 1) CNN Index
    print_sep("CNN: Market Indexes")
    m = get_cnn_market_indexes()
    if not m["success"]:
        print("No data.")
    else:
        print(f"{'Name':15} {'Current':>10} {'Prev Close':>12} {'Change':>10} {'% Change':>10}")
        print("-" * 70)
        for x in m["data"]:
            print(f"{x['name']:15} {x['current']:10.2f} {x['prev']:12.2f} {x['change']:10.2f} {x['pct']:10.4%}")

    # 2) CNN Fear & Greed
    print_sep("CNN: Fear & Greed")
    fg = get_cnn_fear_greed()
    if not fg["success"]:
        print("No data.")
    else:
        s = fg["summary"]
        print(f"Score:    {fmt2(s['score'])} | Rating: {s['rating']}")
        print(f"Prev:     {fmt2(s['prev'])}")
        print(f"1W:       {fmt2(s['w1'])}")
        print(f"1M:       {fmt2(s['m1'])}")
        print(f"1Y:       {fmt2(s['y1'])}")
        print()
        print(f"{'Category':30} {'Score':10} {'Rating':15} {'Value':10}")
        print("-" * 80)
        for k, obj in fg["details"].items():
            if not obj:
                print(f"{k:30} {'-':10} {'-':15} {'-':10}")
                continue
            print(f"{k:30} {fmt2(obj['score']):10} {obj['rating']:15} {fmt2(obj['value']):10}")

    # 3) OKX Prices
    print_sep("OKX: Index Prices (UTC open change)")
    print(f"{'Symbol':10} {'Price':>12} {'Open(UTC)':>12} {'Change':>12} {'%Change':>10}")
    print("-" * 65)
    for r in get_okx_prices():
        if not r["success"]:
            print(f"{r['inst']:10} ❌ no data")
            continue
        print(f"{r['inst']:10} {fmt(r['price']):>12} {fmt(r['open']):>12} {fmt(r['change']):>12} {r['pct']:10.2f}%")

    # 4) AHR999
    print_sep("Real-time AHR999 (OKX index)")
    a = get_ahr999()
    if not a["success"]:
        print("No AHR999 data.")
    else:
        print(f"AHR999:        {a['ahr']:.6f}  {a['zone']}")

# ========= MAIN =========
if __name__ == "__main__":
    print_report()