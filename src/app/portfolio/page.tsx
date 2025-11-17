"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PortfolioData } from "@/types/portfolio";
import { usePortfolioCalculations } from "@/hooks/usePortfolioCalculations";
import { PortfolioHeader } from "@/components/portfolio/PortfolioHeader";
import { AccountSummary } from "@/components/portfolio/AccountSummary";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import styles from "./page.module.css";

export default function PortfolioPage() {
  const router = useRouter();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isIncognito, setIsIncognito] = useState(false);

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
        setIsInitialLoad(false);
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
    fetchPortfolio(false);
  }, [fetchPortfolio]);

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

  const { assetBreakdown, summaryItems, assetAllocation, costBasisChart, marketValueChart } = usePortfolioCalculations(data, applyMask);

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
        <PortfolioHeader
          isIncognito={isIncognito}
          onToggleIncognito={() => setIsIncognito(!isIncognito)}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />
        {error && (
          <div style={{ padding: "8px", marginBottom: "8px", backgroundColor: "#fee", color: "#c00", borderRadius: "4px", fontSize: "14px" }}>
            Error refreshing: {error}
          </div>
        )}

        <h2 className={styles.positionsTitle}>Account Summary</h2>
        <AccountSummary
          summaryItems={summaryItems}
          costBasisChart={costBasisChart}
          marketValueChart={marketValueChart}
          assetAllocation={assetAllocation}
          assetBreakdown={assetBreakdown}
          applyMask={applyMask}
        />

        <div className={styles.positionsSection}>
          <h2 className={styles.positionsTitle}>Positions</h2>
          <div className={styles.positionsTableContainer}>
            <PositionsTable positions={data.positions} netLiquidation={data.net_liquidation} applyMask={applyMask} />
          </div>
        </div>
      </div>
    </main>
  );
}
