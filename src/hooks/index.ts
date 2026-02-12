"use client";

import { useEffect, useState, useMemo } from "react";
import type { MarketApiResponse, PortfolioData, SummaryItem } from "@/types";
import { formatMoney, formatPercent } from "@/lib/format";
import {
  calculateAssetBreakdown,
  buildAssetAllocation,
  buildChartFromLegendData,
  type AssetBreakdown,
  type AssetAllocation,
} from "@/lib/accountStats";

// ========== Re-export types ==========

export type { AssetBreakdown, AssetAllocation };

// ========== Market Data Hook ==========

type ValidResponse = Extract<MarketApiResponse, { success: boolean }>;

export type MarketStatus = "pre-market" | "open" | "post-market" | "night" | "closed";

export interface MarketStatusInfo {
  status: MarketStatus;
  isUsMarketOpen: boolean;
  label: string;
  timeZone: "EST" | "EDT";
}

function computeUsOpen(): MarketStatusInfo {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);

  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(now);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  
  let timeZone: "EST" | "EDT";
  if (tzName.includes("EDT") || tzName.includes("DT")) {
    timeZone = "EDT";
  } else if (tzName.includes("EST") || tzName.includes("ST")) {
    timeZone = "EST";
  } else {
    const month = now.getUTCMonth() + 1;
    timeZone = month >= 3 && month <= 11 ? "EDT" : "EST";
  }

  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(day ?? "");
  const totalMinutes = hour * 60 + minute;

  let status: MarketStatus;
  let isUsMarketOpen: boolean;

  const isNightHours = totalMinutes >= 20 * 60 || totalMinutes < 4 * 60;

  if (isNightHours) {
    status = "night";
    isUsMarketOpen = false;
  } else if (!weekday) {
    status = "closed";
    isUsMarketOpen = false;
  } else {
    if (totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30) {
      status = "pre-market";
      isUsMarketOpen = false;
    } else if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60) {
      status = "open";
      isUsMarketOpen = true;
    } else if (totalMinutes >= 16 * 60 && totalMinutes < 20 * 60) {
      status = "post-market";
      isUsMarketOpen = false;
    } else {
      status = "night";
      isUsMarketOpen = false;
    }
  }

  return {
    status,
    isUsMarketOpen,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timeZone,
  };
}

export function useMarketData() {
  const [data, setData] = useState<ValidResponse | null>(null);
  const [next5In, setNext5In] = useState<number>(60);
  const init = computeUsOpen();
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
      const statusInfo = computeUsOpen();
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
