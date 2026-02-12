"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrencyMode } from "@/lib/format";
import { usePortfolioCalculations, useMarketData, usePortfolioData } from "@/hooks";
import { SummaryTable } from "@/components/portfolio/SummaryTable";
import { PortfolioChart } from "@/components/portfolio/PortfolioChart";
import { LegendTable } from "@/components/portfolio/LegendTable";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { DataDownloadModal } from "@/components/portfolio/DataDownloadModal";
import { MarketStatusBanner } from "@/components/shared/MarketStatusBanner";
import { HamburgerNav } from "@/components/shared/HamburgerNav";
import styles from "./page.module.css";

export default function PortfolioPage() {
  const router = useRouter();
  const [isIncognito, setIsIncognito] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("USD");
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // Use consolidated hooks
  const { marketStatus, nyTimeLabel } = useMarketData();
  const {
    data,
    isLoading,
    isInitialLoad,
    error,
    lastRefreshTime,
    timeAgo,
    refresh: handleRefresh,
  } = usePortfolioData({
    redirectOnNotFound: true,
    routerPush: router.push,
  });

  const applyMask = useCallback(
    (value: string): string => {
      if (isIncognito) return "*";
      return value;
    },
    [isIncognito]
  );

  const {
    assetBreakdown,
    summaryItems,
    assetAllocation,
  } = usePortfolioCalculations(data, applyMask);

  if (isLoading && isInitialLoad && !data) {
    return (
      <main className={styles.page}>
        <div className={styles.container} style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
          <p>Loading portfolio data...</p>
        </div>
      </main>
    );
  }

  if (!data && !isLoading) {
    return (
      <main className={styles.page}>
        <div className={styles.container} style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
          <p>Error: {error || "Failed to load portfolio data"}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <main className={styles.page}>
      <HamburgerNav />
      <div className={styles.container}>
        <div>
          <header className={styles.header}>
            <div className={styles.headerTop}>
              <h1 className={styles.title} onClick={() => router.push("/dashboard")}>
                Portfolio Summary
              </h1>
            </div>
          </header>
          {error && (
            <div className={styles.errorMessage}>
              Error refreshing: {error}
            </div>
          )}
          {/* Market banner with refresh time */}
          <MarketStatusBanner
            marketStatus={marketStatus}
            nyTimeLabel={nyTimeLabel}
            lastRefreshTime={lastRefreshTime}
            timeAgo={timeAgo}
            isLoading={isLoading}
            onRefresh={handleRefresh}
          />
        </div>

        <div className={styles.summarySection}>
          <SummaryTable 
            items={summaryItems} 
            originalAmountUsd={data.original_amount_usd}
            currentBalanceUsd={data.net_liquidation}
            yearBeginBalanceSgd={data.principal}
            assetBreakdown={assetBreakdown}
            maxValue={data.max_value_USD}
            minValue={data.min_value_USD}
            maxDrawdownPercent={data.max_drawdown_percent}
            usdSgdRate={data.usd_sgd_rate}
            usdCnyRate={data.usd_cny_rate}
            currencyMode={currencyMode}
            applyMask={applyMask}
            onToggleIncognito={() => setIsIncognito(!isIncognito)}
          />
          <div className={styles.chartSection}>
            <PortfolioChart 
              assetAllocation={assetAllocation}
              onClick={() => setIsDownloadModalOpen(true)}
            />
          </div>
          <LegendTable 
            assetAllocation={assetAllocation} 
            assetBreakdown={assetBreakdown} 
            applyMask={applyMask}
            usdSgdRate={data.usd_sgd_rate}
            usdCnyRate={data.usd_cny_rate}
            currencyMode={currencyMode}
            onToggleCurrency={() => {
              setCurrencyMode((prev) => {
                if (prev === "USD") return "SGD";
                if (prev === "SGD") return "CNY";
                return "USD";
              });
            }}
          />
        </div>

        <div className={styles.positionsSection}>
          <PositionsTable 
            positions={data.positions} 
            netLiquidation={data.net_liquidation} 
            applyMask={applyMask} 
            isIncognito={isIncognito}
          />
        </div>
      </div>
      <DataDownloadModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        data={data}
        assetBreakdown={assetBreakdown}
        assetAllocation={assetAllocation}
        summaryItems={summaryItems}
        originalAmountUsd={data.original_amount_usd}
        currentBalanceUsd={data.net_liquidation}
        onSaveSuccess={() => {
          // Force refresh portfolio data after JSON save
          void handleRefresh();
        }}
      />
    </main>
  );
}
