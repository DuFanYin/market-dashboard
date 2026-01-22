"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PortfolioData } from "@/types/portfolio";
import type { CurrencyMode } from "@/lib/currency";
import { usePortfolioCalculations } from "@/hooks/usePortfolioCalculations";
import { useMarketData } from "@/hooks/useMarketData";
import { PortfolioHeader } from "@/components/portfolio/PortfolioHeader";
import { AccountSummary } from "@/components/portfolio/AccountSummary";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { DataDownloadModal } from "@/components/portfolio/DataDownloadModal";
import { MarketStatusBanner } from "@/components/shared/MarketStatusBanner";
import styles from "./page.module.css";

export default function PortfolioPage() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isIncognito, setIsIncognito] = useState(false);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("USD");
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

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

  // Hydrate from cached payload (set by /dashboard) to avoid refetch on navigation
  useEffect(() => {
    if (data) return;
    try {
      const raw = sessionStorage.getItem("portfolio_cache_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { ts?: number; payload?: PortfolioData };
      if (parsed?.payload) {
        setData(parsed.payload);
        setLastRefreshTime(parsed.ts ? new Date(parsed.ts) : new Date());
        setIsInitialLoad(false);
        setIsLoading(false);
      }
    } catch {
      // ignore
    }
  }, [data]);

  const fetchPortfolio = useCallback(
    async (isRefresh = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/portfolio");

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

  useEffect(() => {
    // If cache already hydrated data, skip auto-fetch; manual refresh still works.
    if (!data) {
    fetchPortfolio(false);
    }
  }, [fetchPortfolio, data]);

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
      <div className={styles.container}>
        <div>
          <PortfolioHeader />
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
          <AccountSummary
            summaryItems={summaryItems}
            assetAllocation={assetAllocation}
            assetBreakdown={assetBreakdown}
            applyMask={applyMask}
            originalAmountSgd={data.original_amount_sgd_raw}
            originalAmountUsd={data.original_amount_usd}
            currentBalanceUsd={data.net_liquidation}
            yearBeginBalanceUsd={data.year_begin_balance_usd}
            onToggleIncognito={() => setIsIncognito(!isIncognito)}
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
            onChartClick={() => setIsDownloadModalOpen(true)}
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
      />
    </main>
  );
}
