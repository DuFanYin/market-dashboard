"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import type { PortfolioData } from "@/types";
import { usePortfolioCalculations } from "@/hooks";
import { HamburgerNav } from "@/components/shared/HamburgerNav";
import { SankeyDiagram } from "@/components/account/SankeyDiagram";
import styles from "./page.module.css";

export default function AccountPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasInitializedRef = useRef(false);

  const fetchPortfolio = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/portfolio?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load portfolio data.");
      }

      const payload = (await response.json()) as PortfolioData;
      setData(payload);
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
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    // Try to load from cache first (client-side only)
    try {
      const raw = sessionStorage.getItem("portfolio_cache_v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { ts?: number; payload?: PortfolioData };
        if (parsed?.payload) {
          setData(parsed.payload);
        }
      }
    } catch {
      // ignore
    }
    
    // Then fetch fresh data
    void fetchPortfolio();
  }, [fetchPortfolio]);

  const applyMask = useCallback((value: string): string => value, []);

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
    <main className={styles.page}>
      <HamburgerNav />
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <h1 className={styles.title}>Account</h1>
          </div>
        </header>
        {data && (
          <SankeyDiagram
            assetAllocation={assetAllocation}
            assetBreakdown={assetBreakdown}
            portfolioData={data}
          />
        )}
      </div>
    </main>
  );
}
