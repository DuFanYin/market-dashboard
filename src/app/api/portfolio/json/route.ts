import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { BlobNotFoundError } from "@vercel/blob";

const BLOB_KEY = "account.json";

// Read from Blob only (no local file fallback)
async function readAccountJson(): Promise<string | null> {
  try {
    const blobInfo = await head(BLOB_KEY);
    if (blobInfo) {
      // Add timestamp query parameter to bypass CDN cache and ensure fresh data
      const urlWithCacheBuster = `${blobInfo.url}?t=${Date.now()}`;
      const response = await fetch(urlWithCacheBuster, {
        cache: "no-store", // Prevent caching to always get fresh data
      });
      if (response.ok) {
        return await response.text();
      }
    }
    return null; // Blob not found
  } catch (error) {
    // If blob doesn't exist, return null (user needs to input JSON manually)
    if (error instanceof BlobNotFoundError) {
      return null;
    }
    console.error("[portfolio JSON API] Blob read error:", error);
    throw error;
  }
}

// Save to Blob only (no local file fallback)
async function saveAccountJson(content: string): Promise<void> {
  await put(BLOB_KEY, content, {
    contentType: "application/json",
    access: "public",
    addRandomSuffix: false, // Keep same filename
  });
}

export async function GET() {
  try {
    const raw = await readAccountJson();
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

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(body.json) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON content" }, { status: 400 });
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "JSON must parse to an object" }, { status: 400 });
    }

    parsed = {
      ...parsed,
      timestamp: new Date().toISOString(),
    };

    const jsonContent = JSON.stringify(parsed, null, 2);
    await saveAccountJson(jsonContent);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[portfolio JSON API] Failed to save JSON file:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to save portfolio JSON file: ${errorMessage}` },
      { status: 500 }
    );
  }
}
