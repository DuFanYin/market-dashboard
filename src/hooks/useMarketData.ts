"use client";
import { useEffect, useState } from "react";
import type { MarketApiResponse } from "@/types/market";

type ValidResponse = Extract<MarketApiResponse, { success: boolean }>;

function computeUsOpen() {
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

  const weekday = ["Mon","Tue","Wed","Thu","Fri"].includes(day ?? "");
  const open = weekday && (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;

  return {
    open,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

export function useMarketData() {
  const [data, setData] = useState<ValidResponse | null>(null);
  const [next5In, setNext5In] = useState<number>(60);
  const init = computeUsOpen();
  const [isUsMarketOpen, setIsUsMarketOpen] = useState<boolean>(init.open);
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

    // 60s refresh: all data (crypto, gold, CNN, F&G, AHR) + market status update
    const refreshInterval = setInterval(async () => {
      const result = await fetchData();
      if (!result) return;
      
      setData(result);
      setNext5In(60);
      
      // Update market status
      const { open, label } = computeUsOpen();
      setIsUsMarketOpen(open);
      setNyTimeLabel(label);
    }, 60000);

    // 1s countdown
    const countdownInterval = setInterval(() => {
      setNext5In((s) => (s > 1 ? s - 1 : 1));
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
    isUsMarketOpen,
    nyTimeLabel,
    next5In,
    handleRefresh,
  };
}

