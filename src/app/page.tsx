"use client";
import { useEffect, useMemo, useState } from "react";
import type { CnnIndexRow, OkxRow } from "@/types/market";
import type { CnnIndexes, CnnFearGreed } from "@/types/market";
import { fmt, fmt2 } from "@/lib/data";
import type { Ahr999 } from "@/lib/data";

// removed revalidate because this is a client component; polling handles freshness

type ApiJson = {
  error?: true;
  cnnIndexes?: CnnIndexes;
  cnnFearGreed?: CnnFearGreed;
  okx?: OkxRow[];
  ahr?: Ahr999;
};

export default function Page() {
  const [idx, setIdx] = useState<CnnIndexes>({ success: false });
  const [fg, setFg] = useState<CnnFearGreed>({ success: false });
  const [okx, setOkx] = useState<OkxRow[]>([]);
  const [ahr, setAhr] = useState<Ahr999>({ success: false });
  const [next5In, setNext5In] = useState<number>(5);

  // Precomputed slices to avoid repeated filtering in JSX
  const okxOk = useMemo(() => okx.filter((r) => r.success), [okx]);

  // Compute US market open status and NY time (kept live)
  const computeUsOpen = () => {
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
  };

  const init = computeUsOpen();
  const [isUsMarketOpen, setIsUsMarketOpen] = useState<boolean>(init.open);
  const [nyTimeLabel, setNyTimeLabel] = useState<string>(init.label);

  // Initialize and keep banner time/status updated
  useEffect(() => {
    const id = setInterval(() => {
      const { open: o, label: l } = computeUsOpen();
      setIsUsMarketOpen(o);
      setNyTimeLabel(l);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Deprecated: replaced by getFgStyles for button-like chips

  const getFgStyles = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    if (v >= 75) return { backgroundColor: "#2e7d32", color: "#fff" };
    if (v >= 55) return { backgroundColor: "#a5d6a7", color: "#1f2937" };
    if (v >= 45) return { backgroundColor: "#ffffff", color: "#1f2937" };
    if (v >= 25) return { backgroundColor: "#ff8a80", color: "#fff" };
    return { backgroundColor: "#c62828", color: "#fff" };
  };

  // Initial load (fetch everything once)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api`, { cache: "no-store" });
        const j: ApiJson = await res.json();
        if (cancelled) return;
        if (!j?.error) {
          setIdx(j.cnnIndexes ?? { success: false });
          setFg(j.cnnFearGreed ?? { success: false });
          setOkx(j.okx ?? []);
          setAhr(j.ahr ?? { success: false });
          setNext5In(5);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // 5s refresh: always crypto; CNN + F&G only when US market is open
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api`, { cache: "no-store" });
        const j: ApiJson = await res.json();
        setOkx(j.okx ?? []);
        if (isUsMarketOpen) {
          setIdx(j.cnnIndexes ?? { success: false });
          setFg(j.cnnFearGreed ?? { success: false });
        }
      } catch {}
      finally {
        // Always reset countdown each cycle, even on transient errors
        setNext5In(5);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [isUsMarketOpen]);

  // 1s ticking countdown for 5s refresh
  useEffect(() => {
    const id = setInterval(() => {
      setNext5In((s) => (s > 1 ? s - 1 : 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 5m refresh: AHR only
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api`, { cache: "no-store" });
        const j: ApiJson = await res.json();
        setAhr(j.ahr ?? { success: false });
      } catch {}
    }, 300000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-12">
       
  
        {/* Header */}
        <header className="flex flex-col items-center justify-center gap-2 text-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Market Dashboard</h1>
            <p className="text-sm text-gray-500">Macro · Crypto · Sentiment</p>
          </div>
        </header>

         {/* US Stock Market status banner */}
         <div
          className={
            `rounded-md border p-3 text-sm ` +
            (isUsMarketOpen
              ? "bg-green-100 border-green-200 text-green-800"
              : "bg-gray-100 border-gray-200 text-gray-800")
          }
        >
          <div className="flex items-center">
            <div className="text-xs text-transparent select-none">{next5In}s</div>
            <div className="flex-1 text-center">
              US Stock Market: {" "}
              <span className={isUsMarketOpen ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                {isUsMarketOpen ? "OPEN" : "CLOSED"}
              </span>
              <span className="ml-2 text-xs text-gray-600">(New York {nyTimeLabel} ET)</span>
            </div>
            <div className="text-xs text-gray-600">{next5In}s</div>
          </div>
        </div>
  
        {/* Main grid */}
        <div className="grid gap-8 md:grid-cols-2">
  
        {/* Section: Markets (CNN Indexes + OKX) */}
        <section className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">

          {(!idx.success || !idx.data?.length) && !okxOk.length ? (
            <p className="text-sm text-gray-500">Unavailable</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left py-1">Name</th>
                  <th className="text-right py-1">Current</th>
                  <th className="text-right py-1">Prev</th>
                  <th className="text-right py-1">Change</th>
                  <th className="text-right py-1">% Change</th>
                </tr>
              </thead>
              <tbody>
                {(idx.success && idx.data?.length ? idx.data : []).map((row: CnnIndexRow) => (
                  <tr key={row.name} className="border-t">
                    <td className="py-2 text-gray-700 max-w-[160px] truncate pr-2">{row.name}</td>
                    <td className="text-right tabular-nums text-gray-900">{fmt(row.current)}</td>
                    <td className="text-right tabular-nums text-gray-500">{fmt(row.prev)}</td>
                    <td className={`text-right tabular-nums font-medium ${row.change >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {row.change >= 0 ? "+" : ""}{fmt2(row.change)}
                    </td>
                    <td className={`text-right tabular-nums font-medium ${row.pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {row.pct >= 0 ? "+" : ""}{fmt2(row.pct)}%
                    </td>
                  </tr>
                ))}

                {(idx.success && idx.data?.length) && okxOk.length ? (
                  <tr>
                    <td colSpan={50} className="py-5" />
                  </tr>
                ) : null}

                {okxOk.map((r: OkxRow) => (
                  <tr key={r.inst} className="border-t">
                    <td className="py-2 text-gray-700 max-w-[160px] truncate pr-2">{r.inst}</td>
                    <td className="text-right tabular-nums text-gray-900">{fmt(r.price)}</td>
                    <td className="text-right tabular-nums text-gray-500">{fmt(r.open)}</td>
                    <td className={`text-right tabular-nums font-medium ${Number(r.change ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {Number(r.change ?? 0) >= 0 ? "+" : ""}{fmt2(r.change ?? 0)}
                    </td>
                    <td className={`text-right tabular-nums font-medium ${Number(r.pct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {Number(r.pct ?? 0) >= 0 ? "+" : ""}{fmt2(r.pct ?? 0)}%
                    </td>
                  </tr>
                ))}

                {ahr.success ? (
                  <>
                    <tr>
                      <td colSpan={50} className="py-3" />
                    </tr>
                    <tr>
                      <td colSpan={5} className="pt-2">
                        <div className={`rounded-md p-3 min-h-16 flex items-center justify-center ${
                          ahr.zone === "green"
                            ? "bg-green-100"
                            : ahr.zone === "yellow"
                            ? "bg-yellow-100"
                            : ahr.zone === "red"
                            ? "bg-red-100"
                            : "bg-gray-50"
                        }`}>
                          <div className="flex items-center justify-center w-full">
                            <p className="text-lg text-center">AHR999 Index: {fmt2(ahr.ahr)}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : null}
              </tbody>
            </table>
          )}
        </section>
  
          {/* Section: CNN Fear & Greed */}
          <section className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm space-y-6">
            {/* Summary block */}
            <div className="space-y-4">

              {/* Score and rating */}
              <div className="flex items-center justify-center gap-3">
                <p className="text-4xl font-bold text-gray-900 tabular-nums">
                  {fg.summary?.score ?? "-"}
                </p>

                {fg.summary?.rating && (
                  <span
                    className="px-2 py-1 rounded-md text-xs font-medium"
                    style={getFgStyles(fg.summary?.score)}
                  >
                    {fg.summary.rating.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Gradient bar with pointer and vertical separators */}
              <div className="relative w-full h-6 rounded-md overflow-hidden border border-gray-400">
                {/* Full gradient background */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(90deg, #c62828 0%, #ff8a80 45%, #ffffff 50%, #a5d6a7 55%, #2e7d32 100%)"
                  }}
                />

                {/* Vertical separators */}
                <div className="absolute h-full w-[2px] bg-white/70 left-[25%]" />
                <div className="absolute h-full w-[2px] bg-white/70 left-[45%]" />
                <div className="absolute h-full w-[2px] bg-white/70 left-[55%]" />
                <div className="absolute h-full w-[2px] bg-white/70 left-[75%]" />

                {/* Pointer line */}
                <div
                  className="absolute top-0 h-full w-[2px] bg-black"
                  style={{ left: `${fg.summary?.score ?? 0}%` }}
                />

                {/* Pointer triangle */}
                <div
                  className="absolute -top-[6px] text-black text-xs font-bold"
                  style={{ left: `calc(${fg.summary?.score ?? 0}% - 4px)` }}
                ></div>
              </div>


              {/* Historical */}
              <div className="grid grid-cols-2 gap-2 text-sm mt-4">
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="text-gray-600">Previous Close</span>
                  <span className="tabular-nums px-2 py-0.5 rounded-md text-xs font-medium" style={getFgStyles(fg.summary?.prev)}>{fg.summary?.prev ?? "-"}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="text-gray-600">1 Week Ago</span>
                  <span className="tabular-nums px-2 py-0.5 rounded-md text-xs font-medium" style={getFgStyles(fg.summary?.w1)}>{fg.summary?.w1 ?? "-"}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="text-gray-600">1 Month Ago</span>
                  <span className="tabular-nums px-2 py-0.5 rounded-md text-xs font-medium" style={getFgStyles(fg.summary?.m1)}>{fg.summary?.m1 ?? "-"}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-1">
                  <span className="text-gray-600">1 Year Ago</span>
                  <span className="tabular-nums px-2 py-0.5 rounded-md text-xs font-medium" style={getFgStyles(fg.summary?.y1)}>{fg.summary?.y1 ?? "-"}</span>
                </div>
              </div>

            </div>

                {/* Component Signals */}
                <div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-1">Indicator</th>
                        <th className="text-right py-1">Score</th>
                        <th className="text-right py-1">Value</th>
                        <th className="text-right py-1">Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(fg.details ?? {}).map(([k, v]) => (
                        <tr key={k} className="border-t">
                          <td className="py-2 text-gray-700">{k}</td>

                          {!v ? (
                            <td className="text-right text-gray-400" colSpan={3}>-</td>
                          ) : (
                            <>
                              <td className="text-right tabular-nums text-gray-900 font-medium">
                                {fmt2(v.score)}
                              </td>
                              <td className="text-right tabular-nums text-gray-500">{fmt2(v.value)}</td>
                              <td className="text-right text-xs">
                                <span className="px-2 py-0.5 rounded-md font-medium" style={getFgStyles(v.score)}>
                                  {v.rating}
                                </span>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          </section>

  
        </div>
      </div>
    </main>
  );
}