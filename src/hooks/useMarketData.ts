"use client";
import { useEffect, useState } from "react";
import type { MarketApiResponse } from "@/types/market";

type ValidResponse = Extract<MarketApiResponse, { success: boolean }>;

export type MarketStatus = "pre-market" | "open" | "post-market" | "night" | "closed";

export interface MarketStatusInfo {
  status: MarketStatus;
  isUsMarketOpen: boolean; // For backward compatibility - true if status is "open"
  label: string;
  timeZone: "EST" | "EDT"; // Eastern Standard Time or Eastern Daylight Time
}

function computeUsOpen(): MarketStatusInfo {
  const now = new Date();
  
  // Create a formatter for New York time
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
  
  // Determine if EST (Eastern Standard Time) or EDT (Eastern Daylight Time)
  // EST is UTC-5, EDT is UTC-4
  // Use Intl API to get timezone abbreviation
  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(now);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  
  // Determine timezone: EDT (daylight) or EST (standard)
  // Check if the abbreviation contains "EDT" (daylight time)
  // If ambiguous (e.g., just "ET"), check the month as fallback
  // DST in US typically runs from March to November
  let timeZone: "EST" | "EDT";
  if (tzName.includes("EDT") || tzName.includes("DT")) {
    timeZone = "EDT";
  } else if (tzName.includes("EST") || tzName.includes("ST")) {
    timeZone = "EST";
  } else {
    // Fallback: estimate based on month (DST is roughly March-November)
    const month = now.getUTCMonth() + 1; // 1-12
    timeZone = month >= 3 && month <= 11 ? "EDT" : "EST";
  }

  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(day ?? "");
  const totalMinutes = hour * 60 + minute;

  let status: MarketStatus;
  let isUsMarketOpen: boolean;

  // Check for night market first (8:00 PM - 4:00 AM) - applies to both weekdays and weekends
  const isNightHours = totalMinutes >= 20 * 60 || totalMinutes < 4 * 60; // 8 PM - 4 AM

  if (isNightHours) {
    // Night market: 8:00 PM - 4:00 AM ET
    status = "night";
    isUsMarketOpen = false;
  } else if (!weekday) {
    // Weekend during day hours - market is closed
    status = "closed";
    isUsMarketOpen = false;
  } else {
    // Weekday - determine market session
    if (totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30) {
      // Pre-market: 4:00 AM - 9:30 AM ET
      status = "pre-market";
      isUsMarketOpen = false;
    } else if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60) {
      // Regular trading: 9:30 AM - 4:00 PM ET
      status = "open";
      isUsMarketOpen = true;
    } else if (totalMinutes >= 16 * 60 && totalMinutes < 20 * 60) {
      // Post-market: 4:00 PM - 8:00 PM ET
      status = "post-market";
      isUsMarketOpen = false;
    } else {
      // Should not reach here, but fallback to night
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

  // Unified fetch function
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

  // Combined effect: Initial load + all intervals
  useEffect(() => {
    // Initial load
    let cancelled = false;
    (async () => {
      const result = await fetchData();
      if (cancelled || !result) return;
      setData(result);
      setNext5In(60);
    })();

    // 60s refresh: all data (crypto, gold, CNN, F&G, AHR)
    const refreshInterval = setInterval(async () => {
      const result = await fetchData();
      if (!result) return;
      
      setData(result);
      setNext5In(60);
    }, 60000);

    // 1s countdown + market status update (more frequent to catch transitions)
    const countdownInterval = setInterval(() => {
      setNext5In((s) => (s > 1 ? s - 1 : 1));
      
      // Update market status every second to catch transitions accurately
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

  // Manual refresh
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
    isUsMarketOpen, // For backward compatibility
    nyTimeLabel,
    next5In,
    handleRefresh,
  };
}

