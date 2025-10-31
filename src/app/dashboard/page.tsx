"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CnnIndexRow, OkxRow } from "@/types/market";
import type { CnnIndexes, CnnFearGreed } from "@/types/market";
import { fmt, fmt2 } from "@/lib/data";
import type { Ahr999 } from "@/lib/data";
import styles from "./page.module.css";
import type { MarketApiResponse } from "@/types/market";

export default function Page() {
  const [idx, setIdx] = useState<CnnIndexes>({ success: false });
  const [fg, setFg] = useState<CnnFearGreed>({ success: false });
  const [okx, setOkx] = useState<OkxRow[]>([]);
  const [ahr, setAhr] = useState<Ahr999>({ success: false });
  const [next5In, setNext5In] = useState<number>(60);

  const okxOk = useMemo(() => okx.filter((r) => r.success), [okx]);

  // Lookup helpers to pre-render labeled rows and only update values
  const idxByName = useMemo(() => new Map((idx.data ?? []).map((r) => [r.name, r])), [idx]);
  const getIdx = useCallback((name: string): CnnIndexRow | undefined => idxByName.get(name), [idxByName]);

  const okxByInst = useMemo(() => new Map(okxOk.map((r) => [r.inst, r])), [okxOk]);
  const getOkx = useCallback((inst: string): OkxRow | undefined => okxByInst.get(inst), [okxByInst]);

  const getFgDetail = useCallback((key: string) => (fg.details ?? {})[key] ?? null, [fg]);

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
    return `${styles.fgChip} ${styles.fgNeutral}`;
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
      setAhr(data.ahr ?? { success: false });
      setNext5In(60);
    })();
    return () => { cancelled = true; };
  }, [fetchData]);

  // 60s refresh: always crypto; CNN + F&G only when US market is open
  useEffect(() => {
    const id = setInterval(async () => {
      const data = await fetchData();
      if (data) {
        setOkx(data.okx ?? []);
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
    <main className="min-h-screen bg-gray-100 px-3 sm:px-6 py-6 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-6 sm:space-y-12">

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
        <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2">

          {/* Section: Markets (CNN Indexes + OKX) */}
          <section className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 lg:p-6 shadow-sm overflow-x-auto order-2 sm:order-1">
            <table className={`w-full text-xs sm:text-sm min-w-[500px] ${styles.tableFixed}`}>
              <colgroup>
                <col className={styles.colName} />
                <col className={styles.colNum} />
                <col className={styles.colNum} />
                <col className={styles.colNum} />
                <col className={styles.colNum} />
              </colgroup>
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1 px-1">Name</th>
                  <th className="text-right py-1 px-1">Current</th>
                  <th className="text-right py-1 px-1">Prev</th>
                  <th className="text-right py-1 px-1">Change</th>
                  <th className="text-right py-1 px-1">% Change</th>
                </tr>
              </thead>
              <tbody>
                {(() => { const row = getIdx("Dow"); return (
                  <tr key="Dow" className="border-t">
                    <td className="py-1.5 sm:py-2 text-gray-700 max-w-[120px] sm:max-w-[160px] truncate pr-1 px-1">Dow</td>
                    <td className="text-right tabular-nums text-gray-900 px-1">{fmt(row?.current)}</td>
                    <td className="text-right tabular-nums text-gray-500 px-1">{fmt(row?.prev)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(row?.change ?? 0)}`}>{(row?.change ?? 0) >= 0 ? "+" : ""}{fmt2(row?.change ?? 0)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(row?.pct ?? 0)}`}>{(row?.pct ?? 0) >= 0 ? "+" : ""}{fmt2(row?.pct ?? 0)}%</td>
                  </tr>
                ); })()}

                {(() => { const row = getIdx("S&P 500"); return (
                  <tr key="S&P 500" className="border-t">
                    <td className="py-1.5 sm:py-2 text-gray-700 max-w-[120px] sm:max-w-[160px] truncate pr-1 px-1">S&P 500</td>
                    <td className="text-right tabular-nums text-gray-900 px-1">{fmt(row?.current)}</td>
                    <td className="text-right tabular-nums text-gray-500 px-1">{fmt(row?.prev)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(row?.change ?? 0)}`}>{(row?.change ?? 0) >= 0 ? "+" : ""}{fmt2(row?.change ?? 0)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(row?.pct ?? 0)}`}>{(row?.pct ?? 0) >= 0 ? "+" : ""}{fmt2(row?.pct ?? 0)}%</td>
                  </tr>
                ); })()}

                {(() => { const row = getIdx("Nasdaq"); return (
                  <tr key="Nasdaq" className="border-t">
                    <td className="py-1.5 sm:py-2 text-gray-700 max-w-[120px] sm:max-w-[160px] truncate pr-1 px-1">Nasdaq</td>
                    <td className="text-right tabular-nums text-gray-900 px-1">{fmt(row?.current)}</td>
                    <td className="text-right tabular-nums text-gray-500 px-1">{fmt(row?.prev)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(row?.change ?? 0)}`}>{(row?.change ?? 0) >= 0 ? "+" : ""}{fmt2(row?.change ?? 0)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(row?.pct ?? 0)}`}>{(row?.pct ?? 0) >= 0 ? "+" : ""}{fmt2(row?.pct ?? 0)}%</td>
                  </tr>
                ); })()}

                {/* Fixed spacer to prevent layout shift regardless of data timing */}
                <tr>
                  <td colSpan={5} className="py-3 sm:py-5" />
                </tr>

                {(() => { const r = getOkx("BTC-USDT"); return (
                  <tr key="BTC-USDT" className="border-t">
                    <td className="py-1.5 sm:py-2 text-gray-700 max-w-[120px] sm:max-w-[160px] truncate pr-1 px-1">BTC-USDT</td>
                    <td className="text-right tabular-nums text-gray-900 px-1">{fmt(r?.price)}</td>
                    <td className="text-right tabular-nums text-gray-500 px-1">{fmt(r?.open)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(Number(r?.change ?? 0))}`}>{Number(r?.change ?? 0) >= 0 ? "+" : ""}{fmt2(r?.change ?? 0)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(Number(r?.pct ?? 0))}`}>{Number(r?.pct ?? 0) >= 0 ? "+" : ""}{fmt2(r?.pct ?? 0)}%</td>
                  </tr>
                ); })()}

                {(() => { const r = getOkx("ETH-USDT"); return (
                  <tr key="ETH-USDT" className="border-t">
                    <td className="py-1.5 sm:py-2 text-gray-700 max-w-[120px] sm:max-w-[160px] truncate pr-1 px-1">ETH-USDT</td>
                    <td className="text-right tabular-nums text-gray-900 px-1">{fmt(r?.price)}</td>
                    <td className="text-right tabular-nums text-gray-500 px-1">{fmt(r?.open)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(Number(r?.change ?? 0))}`}>{Number(r?.change ?? 0) >= 0 ? "+" : ""}{fmt2(r?.change ?? 0)}</td>
                    <td className={`text-right tabular-nums font-medium px-1 ${getChangeClass(Number(r?.pct ?? 0))}`}>{Number(r?.pct ?? 0) >= 0 ? "+" : ""}{fmt2(r?.pct ?? 0)}%</td>
                  </tr>
                ); })()}

                {/* Always render AHR block with defaulted values to avoid shifts */}
                <tr>
                  <td colSpan={5} className="py-3" />
                </tr>
                <tr>
                  <td colSpan={5} className="pt-2">
                    <div className={`rounded-md p-3 min-h-16 flex items-center justify-center ${getAhrZoneClass(ahr.zone)}`}>
                      <p className="text-lg text-center">arh999 Index: {fmt2(ahr.ahr)}</p>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Section: CNN Fear & Greed */}
          <section className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 lg:p-6 shadow-sm space-y-4 sm:space-y-6 order-1 sm:order-2">
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
              <table className={`w-full text-xs sm:text-sm min-w-[400px] ${styles.tableFixed}`}>
                <colgroup>
                  <col className={styles.colIndicator} />
                  <col className={styles.colScore} />
                  <col className={styles.colValue} />
                  <col className={styles.colRating} />
                </colgroup>
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1 px-1">Indicator</th>
                    <th className="text-right py-1 px-1">Score</th>
                    <th className="text-right py-1 px-1">Value</th>
                    <th className="text-right py-1 px-1">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => { const v = getFgDetail("put_call_options"); return (
                    <tr key="put_call_options" className="border-t">
                      <td className="py-1.5 sm:py-2 text-gray-700 px-1">put_call_options</td>
                      <td className="text-right tabular-nums text-gray-900 font-medium px-1">{fmt2(v?.score ?? 0)}</td>
                      <td className={`text-right tabular-nums text-gray-500 px-1 ${styles.noWrap}`}>{fmt2(v?.value ?? 0)}</td>
                      <td className={`text-right text-[10px] sm:text-xs px-1 ${styles.noWrap}`}><span className={`px-1.5 sm:px-2 py-0.5 rounded-md font-medium ${styles.noWrap} ${getFgClass(v?.score)}`}>{v?.rating ?? "undefined"}</span></td>
                    </tr>
                  ); })()}

                  {(() => { const v = getFgDetail("market_volatility_vix"); return (
                    <tr key="market_volatility_vix" className="border-t">
                      <td className="py-1.5 sm:py-2 text-gray-700 px-1">market_volatility_vix</td>
                      <td className="text-right tabular-nums text-gray-900 font-medium px-1">{fmt2(v?.score ?? 0)}</td>
                      <td className={`text-right tabular-nums text-gray-500 px-1 ${styles.noWrap}`}>{fmt2(v?.value ?? 0)}</td>
                      <td className={`text-right text-[10px] sm:text-xs px-1 ${styles.noWrap}`}><span className={`px-1.5 sm:px-2 py-0.5 rounded-md font-medium ${styles.noWrap} ${getFgClass(v?.score)}`}>{v?.rating ?? "undefined"}</span></td>
                    </tr>
                  ); })()}

                  {(() => { const v = getFgDetail("market_volatility_vix_50"); return (
                    <tr key="market_volatility_vix_50" className="border-t">
                      <td className="py-1.5 sm:py-2 text-gray-700 px-1">market_volatility_vix_50</td>
                      <td className="text-right tabular-nums text-gray-900 font-medium px-1">{fmt2(v?.score ?? 0)}</td>
                      <td className={`text-right tabular-nums text-gray-500 px-1 ${styles.noWrap}`}>{fmt2(v?.value ?? 0)}</td>
                      <td className={`text-right text-[10px] sm:text-xs px-1 ${styles.noWrap}`}><span className={`px-1.5 sm:px-2 py-0.5 rounded-md font-medium ${styles.noWrap} ${getFgClass(v?.score)}`}>{v?.rating ?? "undefined"}</span></td>
                    </tr>
                  ); })()}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
