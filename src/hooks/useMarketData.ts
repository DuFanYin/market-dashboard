"use client";
import { useEffect, useState } from "react";
import type { MarketApiResponse } from "@/types/market";

type ValidResponse = Extract<MarketApiResponse, { success: boolean }>;

function computeUsOpen() {
  const nyNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const nyDay = nyNow.getDay();
  const nyHour = nyNow.getHours();
  const nyMinute = nyNow.getMinutes();
  const isWeekday = nyDay >= 1 && nyDay <= 5;
  const isAfterOpen = nyHour > 9 || (nyHour === 9 && nyMinute >= 30);
  const isBeforeClose = nyHour < 16;
  const open = isWeekday && isAfterOpen && isBeforeClose;
  const label = nyNow.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
  return { open, label };
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

  // Update market status every 30s
  useEffect(() => {
    const id = setInterval(() => {
      const { open, label } = computeUsOpen();
      setIsUsMarketOpen(open);
      setNyTimeLabel(label);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchData();
      if (cancelled || !result) return;
      setData(result);
      setNext5In(60);
    })();
    return () => { cancelled = true; };
  }, []);

  // 60s refresh: always crypto & gold; CNN + F&G only when US market is open
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await fetchData();
      if (!result) return;
      
      setData((prev) => {
        if (!prev) return result;
        return {
          ...result,
          okx: result.okx ?? [],
          gold: result.gold ?? { success: false, inst: "XAU/USD" },
          cnnIndexes: isUsMarketOpen ? (result.cnnIndexes ?? { success: false }) : prev.cnnIndexes,
          cnnFearGreed: isUsMarketOpen ? (result.cnnFearGreed ?? { success: false }) : prev.cnnFearGreed,
          ahr: prev.ahr, // Keep existing AHR (updated separately)
        };
      });
      setNext5In(60);
    }, 60000);
    return () => clearInterval(id);
  }, [isUsMarketOpen]);

  // 1s countdown
  useEffect(() => {
    const id = setInterval(() => {
      setNext5In((s) => (s > 1 ? s - 1 : 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 5m refresh: AHR only
  useEffect(() => {
    const id = setInterval(async () => {
      const result = await fetchData();
      if (!result?.ahr) return;
      setData((prev) => prev ? { ...prev, ahr: result.ahr } : prev);
    }, 300000);
    return () => clearInterval(id);
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

