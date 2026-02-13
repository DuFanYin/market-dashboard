"use client";
import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { useMarketData, useTimeAgo } from "@/hooks";
import { MarketsTable } from "@/components/dashboard/MarketsTable";
import { FearGreedPanel } from "@/components/dashboard/FearGreedPanel";
import { MarketStatusBanner } from "@/components/shared/MarketStatusBanner";
import { HamburgerNav } from "@/components/shared/HamburgerNav";

export default function Page() {
  const router = useRouter();
  const { data, marketStatus, nyTimeLabel, handleRefresh: originalHandleRefresh } = useMarketData();
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  // Use consolidated hook
  const timeAgo = useTimeAgo(lastRefreshTime);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      await originalHandleRefresh();
      setLastRefreshTime(new Date());
    } finally {
      setIsLoading(false);
    }
  };

  // Update refresh time when data loads
  useEffect(() => {
    if (data) {
      setLastRefreshTime(new Date());
    }
  }, [data]);

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
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topSection}>
          <header className={styles.header}>
            <div className={styles.headerTop}>
              <HamburgerNav />
              <h1 className={styles.title} onClick={() => router.push("/portfolio")}>
                Market
              </h1>
              <div />
            </div>
          </header>
          <MarketStatusBanner
            marketStatus={marketStatus}
            nyTimeLabel={nyTimeLabel}
            lastRefreshTime={lastRefreshTime}
            timeAgo={timeAgo}
            isLoading={isLoading}
            onRefresh={handleRefresh}
          />
        </div>

        <div className={styles.contentGrid}>
          <MarketsTable rows={marketRows} ahr={ahr} />
          <FearGreedPanel fg={fg} />
        </div>
      </div>
    </main>
  );
}
