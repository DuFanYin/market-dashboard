import type { MarketApiResponse } from "@/types/market";

export async function fetchMarket(symbols?: string[]): Promise<MarketApiResponse> {
  const params = new URLSearchParams();
  if (symbols?.length) params.set("symbols", symbols.join(","));
  const url = `/api/market${params.toString() ? `?${params.toString()}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}


