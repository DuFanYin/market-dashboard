import { NextResponse } from "next/server";
import type { MarketApiResponse, CnnIndexes } from "@/types/market";
import { getCnnMarketIndexes, getCnnFearGreed, getOkxPrices, getAhr999 } from "@/lib/data";

export async function GET() {
  try {
    const [cnnIndexesRaw, cnnFearGreed, okx, ahr] = await Promise.all([
      getCnnMarketIndexes(),
      getCnnFearGreed(),
      getOkxPrices(),
      getAhr999(),
    ]);

    const cnnIndexes: CnnIndexes = cnnIndexesRaw.success
      ? { success: true, data: cnnIndexesRaw.data ?? undefined }
      : { success: false, reason: "unavailable" };

    const body: MarketApiResponse = {
      success: true,
      date: new Date().toISOString(),
      cnnIndexes,
      cnnFearGreed,
      okx,
    } as const;

    // Keep AHR available at root response under a non-breaking top-level field if needed later
    // but not part of MarketApiResponse union; page fetches AHR separately via lib.

    return NextResponse.json({ ...body, ahr }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}


