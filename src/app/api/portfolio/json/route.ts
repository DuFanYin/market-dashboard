import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { put, head } from "@vercel/blob";

const dataJsonPath = path.join(process.cwd(), "data", "account.json");
const BLOB_KEY = "account.json";

// Try to read from Blob first, fallback to local file
async function readAccountJson(): Promise<string> {
  // Try Blob first (production)
  try {
    const blobInfo = await head(BLOB_KEY);
    if (blobInfo) {
      const response = await fetch(blobInfo.url);
      if (response.ok) {
        return await response.text();
      }
    }
  } catch (error) {
    console.log("[portfolio JSON API] Blob read failed, trying local file:", error);
  }

  // Fallback to local file (development)
  try {
    return await fs.readFile(dataJsonPath, "utf8");
  } catch (error) {
    throw new Error("Failed to read account JSON from both Blob and local file");
  }
}

// Try to save to Blob first, fallback to local file
async function saveAccountJson(content: string): Promise<void> {
  // Try Blob first (production)
  try {
    await put(BLOB_KEY, content, {
      contentType: "application/json",
      access: "public",
      addRandomSuffix: false, // Keep same filename
    });
    return; // Success
  } catch (error) {
    console.log("[portfolio JSON API] Blob write failed, trying local file:", error);
  }

  // Fallback to local file (development)
  try {
    await fs.writeFile(dataJsonPath, content, "utf8");
  } catch (error) {
    const errorCode = (error as { code?: string })?.code;
    if (errorCode === "EROFS") {
      throw new Error(
        "Read-only file system. Please configure Vercel Blob Storage in your Vercel project settings."
      );
    }
    throw error;
  }
}

export async function GET() {
  try {
    const raw = await readAccountJson();
    return NextResponse.json({ json: raw });
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
    } catch (err) {
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
