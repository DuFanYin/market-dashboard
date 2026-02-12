"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { usePortfolioCalculations, usePortfolioData } from "@/hooks";
import { HamburgerNav } from "@/components/shared/HamburgerNav";
import styles from "./page.module.css";

// Dynamic import with SSR disabled for ECharts components
const SankeyDiagram = dynamic(
  () => import("@/components/account/SankeyDiagram").then((mod) => mod.SankeyDiagram),
  { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading chart...</div> }
);

const HistoryChart = dynamic<{ resetTrigger?: number }>(
  () => import("@/components/account/HistoryChart").then((mod) => mod.HistoryChart),
  { ssr: false, loading: () => <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Loading chart...</div> }
);

export default function AccountPage() {
  // Use consolidated hook
  const { data, isLoading, error } = usePortfolioData();
  const [resetTrigger, setResetTrigger] = useState(0);

  const applyMask = useCallback((value: string): string => value, []);
  
  const handleResetZoom = useCallback(() => {
    setResetTrigger((prev) => prev + 1);
  }, []);

  const { assetAllocation, assetBreakdown } = usePortfolioCalculations(data, applyMask);

  if (isLoading && !data) {
    return (
      <main className={styles.page}>
        <HamburgerNav />
        <div className={styles.container}>
          <p className={styles.placeholder}>Loading portfolio data...</p>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className={styles.page}>
        <HamburgerNav />
        <div className={styles.container}>
          <p className={styles.error}>Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    // Click anywhere outside green box to reset chart zoom
    <main className={styles.page} onClick={handleResetZoom}>
      <HamburgerNav />
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <h1 className={styles.title}>Account</h1>
          </div>
        </header>
        
        <div className={styles.content}>
          {/* Top section: Sankey Diagram */}
          <div className={styles.sankeySection}>
            {data && (
              <SankeyDiagram
                assetAllocation={assetAllocation}
                assetBreakdown={assetBreakdown}
                portfolioData={data}
              />
            )}
          </div>
          
          {/* Bottom section: History Line Chart - stop propagation to prevent reset */}
          <div className={styles.chartSection} onClick={(e) => e.stopPropagation()}>
            <HistoryChart resetTrigger={resetTrigger} />
          </div>
        </div>
      </div>
    </main>
  );
}
