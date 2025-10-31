"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OkxRow, GoldPrice } from "@/types/market";
import type { CnnIndexes, CnnFearGreed } from "@/types/market";
import { fmt, fmt2 } from "@/lib/data";
import type { Ahr999 } from "@/lib/data";
import styles from "./page.module.css";
import type { MarketApiResponse } from "@/types/market";

export default function Page() {
  const [idx, setIdx] = useState<CnnIndexes>({ success: false });
  const [fg, setFg] = useState<CnnFearGreed>({ success: false });
  const [okx, setOkx] = useState<OkxRow[]>([]);
  const [gold, setGold] = useState<GoldPrice>({ success: false, inst: "GOLD" });
  const [ahr, setAhr] = useState<Ahr999>({ success: false });
  const [next5In, setNext5In] = useState<number>(60);

  const okxOk = useMemo(() => okx.filter((r) => r.success), [okx]);

  // Lookup helpers to pre-render labeled rows and only update values
  const idxByName = useMemo(() => new Map((idx.data ?? []).map((r) => [r.name, r])), [idx]);
  // Access lookup maps directly in memoized row builder

  const okxByInst = useMemo(() => new Map(okxOk.map((r) => [r.inst, r])), [okxOk]);
  // Access lookup maps directly in memoized row builder

  const getFgDetail = useCallback((key: string) => (fg.details ?? {})[key] ?? null, [fg]);

  // Pre-define indicator labels for consistent rendering
  const indicators = useMemo(() => [
    "put_call_options",
    "market_volatility_vix",
    "market_volatility_vix_50",
    "market_momentum_sp500",
    "market_momentum_sp125",
    "stock_price_strength",
    "stock_price_breadth",
    "junk_bond_demand",
    "safe_haven_demand",
  ], []);

  // Unified market rows with type info for rendering
  const marketRows = useMemo(() => {
    type Row = { type: "row"; key: string; name: string; current?: number; prev?: number; change?: number; pct?: number };
    type Spacer = { type: "spacer" };
    const rows: Array<Row | Spacer> = [];

    const addIndex = (name: string) => {
      const r = idxByName.get(name);
      rows.push({ type: "row", key: name, name, current: r?.current, prev: r?.prev, change: r?.change, pct: r?.pct });
    };
    const addCrypto = (inst: string) => {
      const r = okxByInst.get(inst);
      rows.push({ type: "row", key: inst, name: inst, current: r?.price, prev: r?.open, change: r?.change, pct: r?.pct });
    };

    // 3 indexes
    ["Dow", "S&P 500", "Nasdaq"].forEach(addIndex);
    rows.push({ type: "spacer" });
    // 2 crypto
    ["BTC-USDT", "ETH-USDT"].forEach(addCrypto);
    rows.push({ type: "spacer" });
    // 1 gold
    rows.push({ type: "row", key: "XAU-USD", name: "XAU-USD", current: gold?.price, prev: gold?.prev, change: gold?.change, pct: gold?.pct });

    return rows;
  }, [idxByName, okxByInst, gold]);

  const computeUsOpen = useCallback(() => {
    const nyNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const nyDay = nyNow.getDay();
    const nyHour = nyNow.getHours();
    const nyMinute = nyNow.getMinutes();
    const isWeekday = nyDay >= 1 && nyDay <= 5;
    const isAfterOpen = nyHour > 9 || (nyHour === 9 && nyMinute >= 30);
    const isBeforeClose = nyHour < 16;
    const open = isWeekday && isAfterOpen && isBeforeClose;
    const label = nyNow.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    });
    return { open, label };
  }, []);

  const init = useMemo(() => computeUsOpen(), [computeUsOpen]);
  const [isUsMarketOpen, setIsUsMarketOpen] = useState<boolean>(init.open);
  const [nyTimeLabel, setNyTimeLabel] = useState<string>(init.label);

  // Map F&G score to CSS module chip class
  const getFgClass = useCallback((n: number | null | undefined) => {
    const v = Number(n ?? 0);
    if (v >= 75) return `${styles.fgChip} ${styles.fgExtremeGreed}`;
    if (v >= 55) return `${styles.fgChip} ${styles.fgGreed}`;
    if (v >= 45) return `${styles.fgChip} ${styles.fgNeutral}`;
    if (v >= 25) return `${styles.fgChip} ${styles.fgFear}`;
    return `${styles.fgChip} ${styles.fgExtremeFear}`;
  }, []);

  // Unified fetch function
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/market`, { cache: "no-store" });
      const j = (await res.json()) as MarketApiResponse | { error: true; message: string };
      if (!("error" in j)) {
        return j;
      }
    } catch {}
    return null;
  }, []);

  // Update market status every 30s
  useEffect(() => {
    const id = setInterval(() => {
      const { open: o, label: l } = computeUsOpen();
      setIsUsMarketOpen(o);
      setNyTimeLabel(l);
    }, 30000);
    return () => clearInterval(id);
  }, [computeUsOpen]);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchData();
      if (cancelled || !data) return;
      setIdx(data.cnnIndexes ?? { success: false });
      setFg(data.cnnFearGreed ?? { success: false });
      setOkx(data.okx ?? []);
      setGold(data.gold ?? { success: false, inst: "GOLD" });
      setAhr(data.ahr ?? { success: false });
      setNext5In(60);
    })();
    return () => { cancelled = true; };
  }, [fetchData]);

  // 60s refresh: always crypto & gold; CNN + F&G only when US market is open
  useEffect(() => {
    const id = setInterval(async () => {
      const data = await fetchData();
      if (data) {
        setOkx(data.okx ?? []);
        setGold(data.gold ?? { success: false, inst: "GOLD" });
        if (isUsMarketOpen) {
          setIdx(data.cnnIndexes ?? { success: false });
          setFg(data.cnnFearGreed ?? { success: false });
        }
      }
      setNext5In(60);
    }, 60000);
    return () => clearInterval(id);
  }, [isUsMarketOpen, fetchData]);

  // 1s countdown
  useEffect(() => {
    const id = setInterval(() => {
      setNext5In((s) => (s > 1 ? s - 1 : 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 5m refresh: AHR only
  useEffect(() => {
    const id = setInterval(async () => {
      const data = await fetchData();
      if (data) {
        setAhr(data.ahr ?? { success: false });
      }
    }, 300000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    const data = await fetchData();
    if (data) {
      setOkx(data.okx ?? []);
      setGold(data.gold ?? { success: false, inst: "GOLD" });
      setIdx(data.cnnIndexes ?? { success: false });
      setFg(data.cnnFearGreed ?? { success: false });
      setAhr(data.ahr ?? { success: false });
    }
    setNext5In(60);
  }, [fetchData]);

  const getChangeClass = useCallback((value: number) => value >= 0 ? styles.positive : styles.negative, []);
  const getAhrZoneClass = useCallback((zone?: string) => {
    if (zone === "green") return styles.ahrGreen;
    if (zone === "yellow") return styles.ahrYellow;
    if (zone === "red") return styles.ahrRed;
    return styles.ahrDefault;
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 px-2 sm:px-4 py-4 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-3 sm:space-y-6">

        {/* Header */}
        <header className="flex flex-col items-center justify-center gap-2 text-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Market Dashboard</h1>
            <p className="text-xs sm:text-sm text-gray-500">Macro · Crypto · Sentiment</p>
          </div>
        </header>

        {/* US Stock Market status banner */}
        <div className={`rounded-md border p-2 sm:p-3 text-xs sm:text-sm ${isUsMarketOpen ? styles.bannerOpen : styles.bannerClosed}`}>
          <div className="flex items-center">
            <div className="hidden sm:block text-lg text-transparent select-none">{next5In}s</div>
            <div className="flex-1 text-center text-md sm:text-sm">
              <span className="hidden sm:inline">US Stock Market: </span>
              <span className={isUsMarketOpen ? styles.statusOpen : styles.statusClosed}>
                {isUsMarketOpen ? "OPEN" : "CLOSED"}
              </span>
              <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs text-gray-600">(NY {nyTimeLabel} ET)</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="text-[10px] sm:text-xs text-gray-600">{next5In}s</div>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-[10px] sm:text-xs border border-gray-300 rounded px-1.5 sm:px-2 py-0.5 sm:py-1 hover:bg-white/60"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid gap-2 sm:gap-6 lg:gap-8 lg:grid-cols-2">

          

          {/* Section: Markets (CNN Indexes + OKX) */}
          <section className="bg-white border border-gray-200 rounded-lg p-2 sm:p-4 lg:p-6 shadow-sm overflow-x-auto order-2 sm:order-1">

          <div className="py-2 sm:py-5" />

            <table className={`w-full text-[10px] sm:text-sm min-w-[320px] sm:min-w-[500px] ${styles.tableFixed}`}>
              <colgroup>
                <col className={styles.colName} />
                <col className={styles.colNum} />
                <col className={styles.colNum} />
                <col className={styles.colNum} />
                <col className={styles.colNum} />
              </colgroup>
              <thead>
                <tr className="text-gray-500">
                  <th className={`${styles.thXs} text-left`}>Name</th>
                  <th className={`${styles.thXs} text-right`}>Current</th>
                  <th className={`${styles.thXs} text-right`}>Prev</th>
                  <th className={`${styles.thXs} text-right`}>Change</th>
                  <th className={`${styles.thXs} text-right`}>% Change</th>
                </tr>
              </thead>
              <tbody>
                {marketRows.map((item, idx) => (
                  item.type === "spacer" ? (
                    <tr key={`spacer-${idx}`}><td colSpan={5} className="py-2 sm:py-5" /></tr>
                  ) : (
                    <tr key={item.key} className="border-t">
                      <td className={`${styles.tdName} text-gray-700 truncate`}>{item.name}</td>
                      <td className={`${styles.tdNum} tabular-nums text-gray-900`}>{fmt(item.current)}</td>
                      <td className={`${styles.tdNum} tabular-nums text-gray-500`}>{fmt(item.prev)}</td>
                      <td className={`${styles.tdNum} tabular-nums font-medium ${getChangeClass(Number(item.change ?? 0))}`}>{Number(item.change ?? 0) >= 0 ? "+" : ""}{fmt2(item.change ?? 0)}</td>
                      <td className={`${styles.tdNum} tabular-nums font-medium ${getChangeClass(Number(item.pct ?? 0))}`}>{Number(item.pct ?? 0) >= 0 ? "+" : ""}{fmt2(item.pct ?? 0)}%</td>
                    </tr>
                  )
                ))}

                {/* Always render AHR block with defaulted values to avoid shifts */}
                <tr>
                  <td colSpan={5} className="py-3" />
                </tr>
                <tr>
                  <td colSpan={5} className="pt-2">
                    <div className={`rounded-md p-2 sm:p-3 min-h-12 sm:min-h-16 flex items-center justify-center ${getAhrZoneClass(ahr.zone)}`}>
                      <p className="text-sm sm:text-lg text-center">arh999 Index: {fmt2(ahr.ahr)}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Section: CNN Fear & Greed */}
          <section className="bg-white border border-gray-200 rounded-lg p-2 sm:p-4 lg:p-6 shadow-sm space-y-3 sm:space-y-6 order-1 sm:order-2">
            {/* Summary block */}
            <div className="space-y-3 sm:space-y-4">
              {/* Score and rating */}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <p className="text-lg sm:text-lg font-bold text-gray-900 tabular-nums">
                  {fmt2(fg.summary?.score ?? 0)}
                </p>

                <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs sm:text-lg font-medium ${styles.noWrap} ${getFgClass(fg.summary?.score)}`}>
                  {(fg.summary?.rating?.toUpperCase() ?? "UNDEFINED")}
                </span>
              </div>

              {/* Gradient bar with pointer and vertical separators */}
              <div className="relative w-full h-5 sm:h-6 rounded-md overflow-hidden border border-gray-400">
                <div className={`absolute inset-0 ${styles.fgGradient}`} />
                <div className={`${styles.separator} ${styles.sep25}`} />
                <div className={`${styles.separator} ${styles.sep45}`} />
                <div className={`${styles.separator} ${styles.sep55}`} />
                <div className={`${styles.separator} ${styles.sep75}`} />
                <div className={styles.pointer} style={{ left: `${fg.summary?.score ?? 0}%` }} />
              </div>

              {/* Historical */}
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mt-3 sm:mt-4">
                {[
                  { label: "Previous Close", value: fg.summary?.prev },
                  { label: "1 Week Ago", value: fg.summary?.w1 },
                  { label: "1 Month Ago", value: fg.summary?.m1 },
                  { label: "1 Year Ago", value: fg.summary?.y1 },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center border-b pb-1">
                    <span className="text-gray-600">{label}</span>
                    <span className={`tabular-nums px-2 py-0.5 text-xs font-medium ${styles.noWrap} ${getFgClass(value)}`}>
                      {fmt2(value ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Component Signals */}
            <div className="mt-8 sm:mt-12 overflow-x-auto">
              <table className={`w-full text-[10px] sm:text-sm min-w-[280px] sm:min-w-[400px] ${styles.tableFixed}`}>
                <colgroup>
                  <col className={styles.colComponents} />
                  <col className={styles.colScore} />
                  <col className={styles.colValue} />
                  <col className={styles.colRating} />
                </colgroup>
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Components</th>
                    <th className="text-right py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Score</th>
                    <th className="text-right py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Value</th>
                    <th className="text-right py-0.5 sm:py-1 px-0.5 sm:px-1 text-[10px] sm:text-xs">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {indicators.map((key) => {
                    const v = getFgDetail(key);
                    return (
                      <tr key={key} className="border-t dark:border-gray-700">
                        <td className="py-1 sm:py-2 text-gray-700 px-0.5 sm:px-1 text-[10px] sm:text-xs">{key}</td>
                        <td className="text-right tabular-nums text-gray-900 font-medium px-0.5 sm:px-1">{fmt2(v?.score ?? 0)}</td>
                        <td className={`text-right tabular-nums text-gray-500 px-0.5 sm:px-1 ${styles.noWrap}`}>{fmt2(v?.value ?? 0)}</td>
                        <td className={`text-right text-[9px] sm:text-xs px-0.5 sm:px-1 ${styles.noWrap}`}>
                          <span className={`px-1 sm:px-2 py-0.5 rounded-md font-medium ${styles.noWrap} ${getFgClass(v?.score)}`}>
                            {v?.rating ?? "undefined"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
