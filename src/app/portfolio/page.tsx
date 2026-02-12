"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PortfolioData } from "@/types";
import type { CurrencyMode } from "@/lib/format";
import { usePortfolioCalculations, useMarketData } from "@/hooks";
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
  // Try to load from cache immediately to avoid black screen
  const [data, setData] = useState<PortfolioData | null>(() => {
    try {
      const raw = sessionStorage.getItem("portfolio_cache_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; payload?: PortfolioData };
        if (parsed?.payload) {
          return parsed.payload;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false); // Start as false if we have cache
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(!data); // false if we have cache
  const [isIncognito, setIsIncognito] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("USD");
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(() => {
    try {
      const raw = sessionStorage.getItem("portfolio_cache_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; payload?: PortfolioData };
        if (parsed?.ts) {
          return new Date(parsed.ts);
        }
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const hasInitializedRef = useRef(false);

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) {
      return `${diffSeconds} second${diffSeconds !== 1 ? "s" : ""} ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    } else {
      return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    }
  };

  useEffect(() => {
    if (!lastRefreshTime) return;

    // Update immediately
    setTimeAgo(formatTimeAgo(lastRefreshTime));

    // Update every second
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastRefreshTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [lastRefreshTime]);
  const { marketStatus, nyTimeLabel } = useMarketData();

  const fetchPortfolio = useCallback(
    async (isRefresh = false, showLoading = true) => {
    // Always set loading state when refreshing (even if we have cache)
    // This ensures the refresh bar shows "Refreshing..." status
    if (showLoading || isRefresh) {
      setIsLoading(true);
    }
    setError(null);
    try {
      // Add cache busting to ensure fresh data after JSON updates
      // Include timestamp to bypass any CDN or browser cache
      const response = await fetch(`/api/portfolio?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      if (response.status === 404) {
        if (isInitialLoad && !isRefresh) {
          router.push("/dashboard");
          return;
        }
        throw new Error("Portfolio data file not found");
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load portfolio data.");
      }

      const payload = (await response.json()) as PortfolioData;
      setData(payload);
      setLastRefreshTime(new Date());
      setIsInitialLoad(false);
      try {
        sessionStorage.setItem(
          "portfolio_cache_v1",
          JSON.stringify({ ts: Date.now(), payload })
        );
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
      if (isInitialLoad && !isRefresh) {
        setData(null);
      }
    } finally {
      setIsLoading(false);
    }
    },
    [router, isInitialLoad]
  );

  // Refresh data in background if we have cache, or fetch if no cache
  useEffect(() => {
    // Only run once on mount
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    // Use the initial data state (from cache if available)
    const hasCache = data !== null;
    // If we have cache data, refresh in background but still show loading state in refresh bar
    // If no cache, fetch and show full loading state
    // Pass isRefresh=true to ensure isLoading is set even with cache
    void fetchPortfolio(true, !hasCache);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - only run once on mount

  // Removed - moved to useEffect above

  const handleRefresh = useCallback(async () => {
    await fetchPortfolio(true);
  }, [fetchPortfolio]);

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
          void fetchPortfolio(true);
        }}
      />
    </main>
  );
}
