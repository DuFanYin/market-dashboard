import { NextResponse } from "next/server";
import { readJsonRaw, saveJsonWithValidation } from "@/lib/storage";

export async function GET() {
  try {
    const raw = await readJsonRaw();
    // If blob doesn't exist (first time use), return empty string
    // Frontend will handle prompting user to input JSON manually
    return NextResponse.json(
      { json: raw ?? "" },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (error) {
    console.error("[portfolio JSON API] Failed to read JSON file:", error);
    return NextResponse.json({ error: "Failed to read portfolio JSON file" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { json?: string };
    if (typeof body.json !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'json' field" }, { status: 400 });
    }

    const result = await saveJsonWithValidation(body.json);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[portfolio JSON API] Failed to save JSON file:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to save portfolio JSON file: ${errorMessage}` },
      { status: 500 }
    );
  }
}
