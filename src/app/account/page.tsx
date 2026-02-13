"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { CurrencyMode } from "@/lib/format";
import { formatCurrency } from "@/lib/format";
import { usePortfolioCalculations, usePortfolioData } from "@/hooks";
import { HamburgerNav } from "@/components/shared/HamburgerNav";
import styles from "./page.module.css";

// Dynamic import with SSR disabled for ECharts components
const SankeyDiagram = dynamic(
  () => import("@/components/account/SankeyDiagram").then((mod) => mod.SankeyDiagram),
  { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading chart...</div> }
);

const HistoryChart = dynamic<{ resetTrigger?: number; formatValue?: (value: number) => string }>(
  () => import("@/components/account/HistoryChart").then((mod) => mod.HistoryChart),
  { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading chart...</div> }
);

const CostValuePieChart = dynamic(
  () => import("@/components/account/CostValuePieChart").then((mod) => mod.CostValuePieChart),
  { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading...</div> }
);

const CURRENCY_ORDER: CurrencyMode[] = ["USD", "SGD", "CNY"];

export default function AccountPage() {
  const { data, isLoading, error } = usePortfolioData();
  const [resetTrigger, setResetTrigger] = useState(0);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("USD");

  const applyMask = useCallback((value: string): string => value, []);

  const handleCycleCurrency = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrencyMode((prev) => {
      const i = CURRENCY_ORDER.indexOf(prev);
      return CURRENCY_ORDER[(i + 1) % CURRENCY_ORDER.length];
    });
  }, []);

  const formatValue = useCallback(
    (value: number): string => {
      if (!data?.usd_sgd_rate || !data?.usd_cny_rate) return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return formatCurrency(value, currencyMode, {
        usdSgdRate: data.usd_sgd_rate,
        usdCnyRate: data.usd_cny_rate,
      });
    },
    [data, currencyMode]
  );

  const handleResetZoom = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
  }, []);

  const { assetAllocation, assetBreakdown } = usePortfolioCalculations(data, applyMask);

  if (isLoading && !data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div className={styles.headerTop}>
              <HamburgerNav />
              <h1 className={styles.title}>Account</h1>
            </div>
          </header>
          <p className={styles.placeholder}>Loading portfolio data...</p>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div className={styles.headerTop}>
              <HamburgerNav />
              <h1 className={styles.title}>Account</h1>
            </div>
          </header>
          <p className={styles.error}>Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    // Click anywhere outside green box to reset chart zoom
    <main className={styles.page} onClick={handleResetZoom}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <HamburgerNav />
            <h1
              className={styles.title}
              onClick={handleCycleCurrency}
              onKeyDown={(e) => e.key === "Enter" && handleCycleCurrency(e as unknown as React.MouseEvent)}
              role="button"
              tabIndex={0}
              title={`Click to change currency (${currencyMode})`}
              style={{ cursor: "pointer" }}
            >
              Account {data && <span className={styles.currencyBadge}>({currencyMode})</span>}
            </h1>
          </div>
        </header>
        
        <div className={styles.content}>
          {/* Top: Sankey full width (original) */}
          <div className={styles.sankeySection}>
            {data && (
              <SankeyDiagram
                assetAllocation={assetAllocation}
                assetBreakdown={assetBreakdown}
                portfolioData={data}
                formatValue={formatValue}
              />
            )}
          </div>
          {/* Bottom row: line chart 60% left, new container 40% right */}
          <div className={styles.bottomRow}>
            <div className={styles.chartSection} onClick={(e) => e.stopPropagation()}>
              <HistoryChart resetTrigger={resetTrigger} formatValue={formatValue} />
            </div>
            <div className={styles.rightPanel} onClick={(e) => e.stopPropagation()}>
              <CostValuePieChart assetBreakdown={assetBreakdown} formatValue={formatValue} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
