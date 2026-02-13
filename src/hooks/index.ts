"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { MarketApiResponse, PortfolioData, SummaryItem } from "@/types";
import { formatMoney, formatPercent, formatTimeAgo } from "@/lib/format";
import {
  calculateAssetBreakdown,
  buildAssetAllocation,
  buildChartFromLegendData,
  type AssetBreakdown,
  type AssetAllocation,
} from "@/lib/accountStats";
import { computeUsMarketStatus, type MarketStatus, type MarketStatusInfo } from "@/lib/market";

// ========== Re-export types ==========

export type { AssetBreakdown, AssetAllocation, MarketStatus, MarketStatusInfo };

// ========== Market Data Hook ==========

type ValidResponse = Extract<MarketApiResponse, { success: boolean }>;

export function useMarketData() {
  const [data, setData] = useState<ValidResponse | null>(null);
  const [next5In, setNext5In] = useState<number>(60);
  const init = computeUsMarketStatus();
  const [marketStatus, setMarketStatus] = useState<MarketStatusInfo>(init);
  const [isUsMarketOpen, setIsUsMarketOpen] = useState<boolean>(init.isUsMarketOpen);
  const [nyTimeLabel, setNyTimeLabel] = useState<string>(init.label);

  async function fetchData(): Promise<ValidResponse | null> {
    try {
      const res = await fetch(`/api/market`, { cache: "no-store" });
      const j = (await res.json()) as MarketApiResponse;
      if (!("error" in j)) {
        return j;
      }
    } catch {}
    return null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchData();
      if (cancelled || !result) return;
      setData(result);
      setNext5In(60);
    })();

    const refreshInterval = setInterval(async () => {
      const result = await fetchData();
      if (!result) return;
      setData(result);
      setNext5In(60);
    }, 60000);

    const countdownInterval = setInterval(() => {
      setNext5In((s) => (s > 1 ? s - 1 : 1));
      const statusInfo = computeUsMarketStatus();
      setMarketStatus(statusInfo);
      setIsUsMarketOpen(statusInfo.isUsMarketOpen);
      setNyTimeLabel(statusInfo.label);
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, []);

  async function handleRefresh() {
    const result = await fetchData();
    if (result) {
      setData(result);
      setNext5In(60);
    }
  }

  return {
    data,
    marketStatus,
    isUsMarketOpen,
    nyTimeLabel,
    next5In,
    handleRefresh,
  };
}

// ========== Portfolio Calculations Hook ==========

const emptyAssetBreakdown: AssetBreakdown = {
  cash: 0,
  stockCost: 0,
  optionCost: 0,
  cryptoCost: 0,
  etfCost: 0,
  totalCost: 0,
  stockMarketValue: 0,
  optionMarketValue: 0,
  cryptoMarketValue: 0,
  etfMarketValue: 0,
  totalMarketValue: 0,
  stockUnrealizedPnL: 0,
  optionUnrealizedPnL: 0,
  cryptoUnrealizedPnL: 0,
  etfUnrealizedPnL: 0,
};

export function usePortfolioCalculations(data: PortfolioData | null, applyMask: (value: string) => string) {
  const assetBreakdown = useMemo<AssetBreakdown>(() => {
    if (!data) return emptyAssetBreakdown;
    return calculateAssetBreakdown(data);
  }, [data]);

  const assetAllocation = useMemo<AssetAllocation[]>(() => {
    if (!data) return [];
    return buildAssetAllocation(assetBreakdown);
  }, [assetBreakdown, data]);

  const summaryItems = useMemo<SummaryItem[]>(() => {
    if (!data) return [];

    return [
      {
        label: "Account PnL",
        display: applyMask(formatMoney(data.account_pnl)),
        isUpnl: true as const,
        numericValue: data.account_pnl,
        percentDisplay: formatPercent(data.account_pnl_percent),
        percentValue: data.account_pnl_percent,
      },
      { label: "Utilization", display: formatPercent(data.utilization * 100) },
    ];
  }, [data, applyMask]);

  const marketValueChart = useMemo(() => {
    if (!data || assetAllocation.length === 0) {
      return { segments: [], circumference: 0, total: 0, separators: [] };
    }
    return buildChartFromLegendData(assetAllocation, assetBreakdown);
  }, [data, assetAllocation, assetBreakdown]);

  return {
    assetBreakdown,
    summaryItems,
    assetAllocation,
    marketValueChart,
  };
}

// ========== Time Ago Hook ==========

/**
 * Hook to manage "time ago" display that updates every second
 * @param lastRefreshTime - The reference date to calculate time ago from
 * @returns Current time ago string
 */
export function useTimeAgo(lastRefreshTime: Date | null): string {
  // Use a tick counter to trigger re-computation every second
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Derive timeAgo from lastRefreshTime and tick (tick forces re-computation)
  return useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _tick = tick; // Reference tick to include in dependency
    return lastRefreshTime ? formatTimeAgo(lastRefreshTime) : "";
  }, [lastRefreshTime, tick]);
}

// ========== Portfolio Data Hook ==========

const PORTFOLIO_CACHE_KEY = "portfolio_cache_v1";

interface PortfolioCacheData {
  ts?: number;
  payload?: PortfolioData;
}

function getPortfolioCache(): { data: PortfolioData | null; timestamp: Date | null } {
  try {
    const raw = sessionStorage.getItem(PORTFOLIO_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PortfolioCacheData;
      if (parsed?.payload) {
        return {
          data: parsed.payload,
          timestamp: parsed.ts ? new Date(parsed.ts) : null,
        };
      }
    }
  } catch {
    // ignore
  }
  return { data: null, timestamp: null };
}

function setPortfolioCache(payload: PortfolioData): void {
  try {
    sessionStorage.setItem(
      PORTFOLIO_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), payload })
    );
  } catch {
    // ignore
  }
}

interface UsePortfolioDataOptions {
  /** Whether to redirect to dashboard if 404 on initial load */
  redirectOnNotFound?: boolean;
  /** Router push function for redirects */
  routerPush?: (path: string) => void;
}

interface UsePortfolioDataReturn {
  data: PortfolioData | null;
  isLoading: boolean;
  isInitialLoad: boolean;
  error: string | null;
  lastRefreshTime: Date | null;
  timeAgo: string;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and caching portfolio data
 * Combines data fetching, caching, and time ago display
 */
export function usePortfolioData(options: UsePortfolioDataOptions = {}): UsePortfolioDataReturn {
  const { redirectOnNotFound = false, routerPush } = options;
  
  // Always start with null to avoid hydration mismatch
  const [data, setData] = useState<PortfolioData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const hasInitializedRef = useRef(false);

  const timeAgo = useTimeAgo(lastRefreshTime);
  

  const fetchPortfolio = useCallback(
    async (isRefresh = false, showLoading = true) => {
      if (showLoading || isRefresh) {
        setIsLoading(true);
      }
      setError(null);
      
      try {
        // When refreshing explicitly, ask backend to persist a history point if eligible
        const baseUrl = isRefresh ? "/api/portfolio?persist=1" : "/api/portfolio";
        const url = `${baseUrl}&t=${Date.now()}`;
        const response = await fetch(url, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
          },
        });

        if (response.status === 404) {
          if (isInitialLoad && !isRefresh && redirectOnNotFound && routerPush) {
            routerPush("/dashboard");
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
        setPortfolioCache(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error occurred.");
        if (isInitialLoad && !isRefresh) {
          setData(null);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isInitialLoad, redirectOnNotFound, routerPush]
  );

  // Initialize on mount: load cache first, then fetch fresh data
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    
    // Load from cache first
    const cached = getPortfolioCache();
    if (cached.data) {
      setData(cached.data);
      setLastRefreshTime(cached.timestamp);
      setIsInitialLoad(false);
    }
    
    // Always fetch fresh data (show loading only if no cache)
    void fetchPortfolio(true, !cached.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    await fetchPortfolio(true);
  }, [fetchPortfolio]);

  return {
    data,
    isLoading,
    isInitialLoad,
    error,
    lastRefreshTime,
    timeAgo,
    refresh,
  };
}
