"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { useMarketData } from "@/hooks/useMarketData";
import { MarketsTable } from "@/components/dashboard/MarketsTable";
import { FearGreedPanel } from "@/components/dashboard/FearGreedPanel";

export default function Page() {
  const router = useRouter();
  const { data, isUsMarketOpen, nyTimeLabel, next5In, handleRefresh } = useMarketData();

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
    <main className={`${styles.page} min-h-screen px-2 sm:px-4 py-2 sm:py-6`}>
      <div className={`mx-auto max-w-7xl ${styles.uniformGap}`}>

        {/* Header */}
        <header className="flex flex-col items-center justify-center text-center" style={{ marginTop: "20px" }}>
          <div>
            <h1 
              className="text-2xl sm:text-3xl font-bold tracking-tight text-white cursor-pointer hover:underline transition"
              onClick={() => router.push("/portfolio")}
            >
              Market Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-gray-400">Macro · Crypto · Sentiment</p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2" style={{ marginTop: "20px" }}>
            <div className="text-[10px] sm:text-xs text-gray-400">{next5In}s</div>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-[10px] sm:text-xs border border-white rounded px-1.5 sm:px-2 py-0.5 sm:py-1 hover:bg-gray-800 text-white"
            >
              Refresh
            </button>
          </div>
        </header>

        {/* US Stock Market status banner */}
        <div className={`p-1.5 sm:p-3 text-xs sm:text-sm ${isUsMarketOpen ? styles.bannerOpen : styles.bannerClosed}`}>
          <div className="flex items-center justify-center">
            <div className="text-center text-md sm:text-sm">
              <span className="hidden sm:inline">US Stock Market: </span>
              <span className={isUsMarketOpen ? styles.statusOpen : styles.statusClosed}>
                {isUsMarketOpen ? "OPEN" : "CLOSED"}
              </span>
              <span className="ml-1 sm:ml-2 text-[10px] sm:text-xs text-gray-400">(NY {nyTimeLabel} ET)</span>
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid gap-1 sm:gap-6 lg:gap-8 lg:grid-cols-2">
          <MarketsTable rows={marketRows} ahr={ahr} />
          <FearGreedPanel fg={fg} />
        </div>
      </div>
    </main>
  );
}
