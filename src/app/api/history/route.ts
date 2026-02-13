import { NextResponse } from "next/server";
import { readHistory } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const history = await readHistory();
    return NextResponse.json(history, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[history API] Failed to read history:", errorMessage);
    console.error("[history API] Full error:", error);
    return NextResponse.json(
      { 
        error: "Failed to read history data",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
