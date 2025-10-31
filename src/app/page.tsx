import { headers } from "next/headers";
import type { MarketApiResponse, CnnIndexRow, OkxRow } from "@/types/market";
import { getAhr999, fmt, fmt2 } from "@/lib/data";

export const revalidate = 300;

export default async function Page() {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  const [marketRes, ahr] = await Promise.all([
    fetch(`${origin}/api`, { cache: "no-store" }),
    getAhr999(),
  ]);

  const market = (await marketRes.json()) as MarketApiResponse;
  const idx = "error" in market ? { success: false } : market.cnnIndexes;
  const fg = "error" in market ? { success: false } : market.cnnFearGreed;
  const okx = "error" in market ? [] : market.okx;

  return (
    <main className="min-h-screen bg-gray-100 px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-12">
  
        {/* HEADER */}
        <header className="flex flex-col md:flex-row items-start md:items-end md:justify-between gap-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Market Dashboard</h1>
            <p className="text-sm text-gray-500">Macro · Crypto · Sentiment</p>
          </div>
          <span className="text-xs text-gray-500">Updates every 5 minutes</span>
        </header>
  
        {/* GRID */}
        <div className="grid gap-8 md:grid-cols-2">
  
        {/* 1 — MARKETS (single table; spacer row between CNN and OKX) */}
        <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Markets</h2>

          {(!idx.success || !idx.data?.length) && !okx.length ? (
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
                    <td className="py-2 text-gray-700">{row.name}</td>
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

                {(idx.success && idx.data?.length) && okx.filter((r: OkxRow) => r.success).length ? (
                  <tr>
                    <td colSpan={50} className="py-5" />
                  </tr>
                ) : null}

                {okx.filter((r: OkxRow) => r.success).map((r: OkxRow) => (
                  <tr key={r.inst} className="border-t">
                    <td className="py-2 text-gray-700">{r.inst}</td>
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
                        <div className={`rounded-md p-3 ${
                          ahr.zone === "green"
                            ? "bg-green-100"
                            : ahr.zone === "yellow"
                            ? "bg-yellow-100"
                            : ahr.zone === "red"
                            ? "bg-red-100"
                            : "bg-gray-50"
                        }`}>
                          <div className="flex flex-col items-center justify-center">
                            <p className="text-lg text-gray-600 mb-2">AHR999 {fmt2(ahr.ahr)}</p>
                            <p className="text-6xl font-extrabold tabular-nums text-gray-900"></p>
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
  
          {/* 2 — FEAR & GREED */}
          <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm space-y-6">
            {/* Summary Bar View */}
            <div className="space-y-4">

              {/* Score + Rating */}
              <div className="flex items-center justify-between">
                <p className="text-4xl font-bold text-gray-900 tabular-nums">
                  {fg.summary?.score ?? "-"}
                </p>

                {fg.summary?.rating && (
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium ${
                      Number(fg.summary.score) >= 75
                        ? "bg-red-100 text-red-700"
                        : Number(fg.summary.score) >= 55
                        ? "bg-yellow-100 text-yellow-700"
                        : Number(fg.summary.score) >= 45
                        ? "bg-gray-100 text-gray-700"
                        : Number(fg.summary.score) >= 25
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {fg.summary.rating.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Gradient bar with pointer and vertical separators */}
              <div className="relative w-full h-5 rounded-md overflow-hidden border border-gray-400">
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

              {/* Labels */}
              <div className="flex justify-between text-[10px] text-gray-600 font-medium mt-1">
                <span>Extreme Fear</span>
                <span>Fear</span>
                <span>Neutral</span>
                <span>Greed</span>
                <span>Extreme Greed</span>
              </div>


              {/* Historical */}
              <div className="grid grid-cols-2 gap-2 text-sm mt-4">
                <div className="flex justify-between border-b pb-1">
                  <span className="text-gray-600">Previous Close</span>
                  <span className="tabular-nums">{fg.summary?.prev ?? "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-gray-600">1 Week Ago</span>
                  <span className="tabular-nums">{fg.summary?.w1 ?? "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-gray-600">1 Month Ago</span>
                  <span className="tabular-nums">{fg.summary?.m1 ?? "-"}</span>
                </div>
                <div className="flex justify-between border-b pb-1">
                  <span className="text-gray-600">1 Year Ago</span>
                  <span className="tabular-nums">{fg.summary?.y1 ?? "-"}</span>
                </div>
              </div>

              <hr className="border-gray-200" />
            </div>

                {/* Component Signals */}
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Component Signals</p>

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
                              <td className="text-right text-gray-700 text-xs">{v.rating}</td>
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