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
      ahr,
    } as const;

    return NextResponse.json(body, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}


