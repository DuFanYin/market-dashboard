import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { BlobNotFoundError } from "@vercel/blob";
import path from "node:path";
import { promises as fs } from "node:fs";

const BLOB_KEY = "account.json";
const LOCAL_FILE_PATH = path.join(process.cwd(), "data", "account.json");

// Check if LOCAL env variable is set to true/1
const useLocal = process.env.LOCAL === "true" || process.env.LOCAL === "1";

// Read from local file or Blob based on LOCAL env variable
async function readAccountJson(): Promise<string | null> {
  if (useLocal) {
    // Read from local file
    try {
      const raw = await fs.readFile(LOCAL_FILE_PATH, "utf8");
      return raw;
    } catch (error) {
      // File doesn't exist, return null
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      console.error("[portfolio JSON API] Local file read error:", error);
      throw error;
    }
  } else {
    // Read from Blob
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
}

// Save to local file or Blob based on LOCAL env variable
async function saveAccountJson(content: string): Promise<void> {
  if (useLocal) {
    // Save to local file
    await fs.mkdir(path.dirname(LOCAL_FILE_PATH), { recursive: true });
    await fs.writeFile(LOCAL_FILE_PATH, content, "utf8");
  } else {
    // Save to Blob - ensure the operation completes
    const blobResult = await put(BLOB_KEY, content, {
      contentType: "application/json",
      access: "public",
      addRandomSuffix: false, // Keep same filename
    });
    
    // Verify the blob was created successfully
    if (!blobResult || !blobResult.url) {
      throw new Error("Blob save operation did not return a valid URL");
    }
    
    // Wait a moment for the blob to be fully committed
    // Vercel Blob may need a brief moment for consistency
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Verify by reading back immediately (with cache busting)
    const verifyUrl = `${blobResult.url}?t=${Date.now()}`;
    const verifyResponse = await fetch(verifyUrl, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });
    
    if (!verifyResponse.ok) {
      throw new Error(`Failed to verify blob save: ${verifyResponse.status} ${verifyResponse.statusText}`);
    }
    
    const savedContent = await verifyResponse.text();
    // Basic verification: check if content can be parsed and has required fields
    // The server adds/updates timestamp, so we verify structure rather than exact match
    try {
      const savedParsed = JSON.parse(savedContent);
      const expectedParsed = JSON.parse(content);
      
      // Verify timestamp exists (server always adds/updates it)
      if (!savedParsed.timestamp || typeof savedParsed.timestamp !== "string") {
        throw new Error("Saved blob does not contain expected timestamp");
      }
      
      // Verify critical required fields exist in saved content
      // IBKR_account is required, so check it exists
      if (!savedParsed.IBKR_account || typeof savedParsed.IBKR_account !== "object") {
        throw new Error("Saved blob does not contain required IBKR_account field");
      }
      
      // Verify that all keys from expected JSON exist in saved JSON (allowing for additional fields)
      // This is more lenient - allows server to add fields like account_info if missing
      const expectedKeys = Object.keys(expectedParsed).filter(k => k !== "timestamp");
      const savedKeysSet = new Set(Object.keys(savedParsed));
      
      // Check that all expected keys (except timestamp) exist in saved content
      for (const key of expectedKeys) {
        if (!savedKeysSet.has(key)) {
          throw new Error(`Saved blob is missing expected field: ${key}`);
        }
      }
      
      // Verify IBKR_account structure matches (required field)
      if (expectedParsed.IBKR_account && typeof expectedParsed.IBKR_account === "object") {
        const expectedIbkrKeys = Object.keys(expectedParsed.IBKR_account).sort();
        const savedIbkrKeys = Object.keys(savedParsed.IBKR_account).sort();
        if (JSON.stringify(expectedIbkrKeys) !== JSON.stringify(savedIbkrKeys)) {
          throw new Error("Saved IBKR_account structure does not match expected structure");
        }
      }
    } catch (parseError) {
      // If parsing fails, the content might not match - this is a problem
      throw new Error(`Failed to verify saved content: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }
  }
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

    // Store the timestamp before saving for verification
    const timestamp = new Date().toISOString();
    parsed = {
      ...parsed,
      timestamp,
    };

    const jsonContent = JSON.stringify(parsed, null, 2);
    
    // Save with retry logic for blob storage
    let lastError: Error | null = null;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await saveAccountJson(jsonContent);
        // If we get here, save succeeded
        return NextResponse.json({ ok: true, timestamp });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[portfolio JSON API] Save attempt ${attempt}/${maxRetries} failed:`, lastError);
        
        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
      }
    }
    
    // All retries failed
    throw lastError || new Error("Failed to save after multiple attempts");
  } catch (error) {
    console.error("[portfolio JSON API] Failed to save JSON file:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to save portfolio JSON file: ${errorMessage}` },
      { status: 500 }
    );
  }
}
