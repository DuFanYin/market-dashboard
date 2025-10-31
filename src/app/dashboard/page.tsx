"use client";
import { useEffect, useMemo, useState } from "react";
import { fmt, fmt2 } from "@/lib/data";
import styles from "./page.module.css";
import type { MarketApiResponse } from "@/types/market";

// Pure helper functions outside component
function computeUsOpen() {
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
}

function getFgClass(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 75) return `${styles.fgChip} ${styles.fgExtremeGreed}`;
  if (v >= 55) return `${styles.fgChip} ${styles.fgGreed}`;
  if (v >= 45) return `${styles.fgChip} ${styles.fgNeutral}`;
  if (v >= 25) return `${styles.fgChip} ${styles.fgFear}`;
  return `${styles.fgChip} ${styles.fgExtremeFear}`;
}

function getChangeClass(value: number) {
  return value >= 0 ? styles.positive : styles.negative;
}

function getAhrZoneClass(zone?: string) {
  if (zone === "green") return styles.ahrGreen;
  if (zone === "yellow") return styles.ahrYellow;
  if (zone === "red") return styles.ahrRed;
  return styles.ahrDefault;
}

const INDICATORS = [
  "put_call_options",
  "market_volatility_vix",
  "market_volatility_vix_50",
  "market_momentum_sp500",
  "market_momentum_sp125",
  "stock_price_strength",
  "stock_price_breadth",
  "junk_bond_demand",
  "safe_haven_demand",
] as const;

type ValidResponse = Extract<MarketApiResponse, { success: boolean }>;

export default function Page() {
  const [data, setData] = useState<ValidResponse | null>(null);
  const [next5In, setNext5In] = useState<number>(60);
  const init = computeUsOpen();
  const [isUsMarketOpen, setIsUsMarketOpen] = useState<boolean>(init.open);
  const [nyTimeLabel, setNyTimeLabel] = useState<string>(init.label);

  // Unified fetch function
  async function fetchData(): Promise<ValidResponse | null> {
    try {
      const res = await fetch(`/api/market`, { cache: "no-store" });
      const j = (await res.json()) as MarketApiResponse;
      if (!("error" in j)) {
        return j;
      }
    } catch {}
    return null;
  }

  // Update market status every 30s
  useEffect(() => {
    const id = setInterval(() => {
      const { open, label } = computeUsOpen();
      setIsUsMarketOpen(open);
      setNyTimeLabel(label);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchData();
      if (cancelled || !result) return;
      setData(result);
      setNext5In(60);
    })();
    return () => { cancelled = true; };
  }, []);

  // 60s refresh: always crypto & gold; CNN + F&G only when US market is open
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await fetchData();
      if (!result) return;
      
      setData((prev) => {
        if (!prev) return result;
        return {
          ...result,
          okx: result.okx ?? [],
          gold: result.gold ?? { success: false, inst: "XAU/USD" },
          cnnIndexes: isUsMarketOpen ? (result.cnnIndexes ?? { success: false }) : prev.cnnIndexes,
          cnnFearGreed: isUsMarketOpen ? (result.cnnFearGreed ?? { success: false }) : prev.cnnFearGreed,
          ahr: prev.ahr, // Keep existing AHR (updated separately)
        };
      });
      setNext5In(60);
    }, 60000);
    return () => clearInterval(id);
  }, [isUsMarketOpen]);

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
      const result = await fetchData();
      if (!result?.ahr) return;
      setData((prev) => prev ? { ...prev, ahr: result.ahr } : prev);
    }, 300000);
    return () => clearInterval(id);
  }, []);

  // Manual refresh
  async function handleRefresh() {
    const result = await fetchData();
    if (result) {
      setData(result);
      setNext5In(60);
    }
  }

  // Derived data for rendering
  const fg = data?.cnnFearGreed ?? { success: false };
  const ahr = data?.ahr ?? { success: false };

  // Unified market rows for table rendering
  const marketRows = useMemo(() => {
    type Row = { type: "row"; key: string; name: string; current?: number; prev?: number; change?: number; pct?: number };
    type Spacer = { type: "spacer" };
    const rows: Array<Row | Spacer> = [];

    const idxData = data?.cnnIndexes ?? { success: false };
    const okxData = data?.okx ?? [];
    const goldData = data?.gold ?? { success: false, inst: "XAU/USD" };

    const idxByName = new Map((idxData.data ?? []).map((r) => [r.name, r]));
    const okxOk = okxData.filter((r) => r.success);
    const okxByInst = new Map(okxOk.map((r) => [r.inst, r]));

    ["Dow", "S&P 500", "Nasdaq"].forEach((name) => {
      const r = idxByName.get(name);
      rows.push({ type: "row", key: name, name, current: r?.current, prev: r?.prev, change: r?.change, pct: r?.pct });
    });
    rows.push({ type: "spacer" });

    ["BTC-USDT", "ETH-USDT"].forEach((inst) => {
      const r = okxByInst.get(inst);
      rows.push({ type: "row", key: inst, name: inst, current: r?.price, prev: r?.open, change: r?.change, pct: r?.pct });
    });
    rows.push({ type: "spacer" });

    rows.push({ type: "row", key: "XAU-USD", name: "XAU-USD", current: goldData?.price, prev: goldData?.prev, change: goldData?.change, pct: goldData?.pct });

    return rows;
  }, [data]);

  return (
    <main className="min-h-screen bg-gray-100 px-2 sm:px-4 py-2 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-2 sm:space-y-6">

        {/* Header */}
        <header className="flex flex-col items-center justify-center gap-2 text-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">Market Dashboard</h1>
            <p className="text-xs sm:text-sm text-gray-500">Macro · Crypto · Sentiment</p>
          </div>
        </header>

        {/* US Stock Market status banner */}
        <div className={`rounded-md border p-1.5 sm:p-3 text-xs sm:text-sm ${isUsMarketOpen ? styles.bannerOpen : styles.bannerClosed}`}>
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
        <div className="grid gap-1 sm:gap-6 lg:gap-8 lg:grid-cols-2">

          

          {/* Section: Markets (CNN Indexes + OKX) */}
          <section className="bg-white border border-gray-200 rounded-lg p-1.5 sm:p-4 lg:p-6 shadow-sm overflow-x-auto order-2 sm:order-1">

          <div className="py-1 sm:py-5" />

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
                    <tr key={`spacer-${idx}`}><td colSpan={5} className="py-1 sm:py-5" /></tr>
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
                  <td colSpan={5} className="py-1.5 sm:py-3" />
                </tr>
                <tr>
                  <td colSpan={5} className="pt-1 sm:pt-2">
                    <div className={`rounded-md p-1.5 sm:p-3 min-h-10 sm:min-h-16 flex items-center justify-center ${getAhrZoneClass(ahr.zone)}`}>
                      <p className="text-xs sm:text-lg text-center">arh999 Index: {fmt2(ahr.ahr)}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Section: CNN Fear & Greed */}
          <section className="bg-white border border-gray-200 rounded-lg p-1.5 sm:p-4 lg:p-6 shadow-sm space-y-2 sm:space-y-6 order-1 sm:order-2">
            {/* Summary block */}
            <div className="space-y-2 sm:space-y-4">
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
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mt-2 sm:mt-4">
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
            <div className="mt-4 sm:mt-12 overflow-x-auto">
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
                  {INDICATORS.map((key) => {
                    const v = (fg.details ?? {})[key] ?? null;
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
