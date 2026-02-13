/**
 * Storage Utilities
 * 
 * Shared file/blob operations for API routes
 * Supports both local file storage and Vercel Blob storage
 */

import { put, head } from "@vercel/blob";
import { BlobNotFoundError } from "@vercel/blob";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { PortfolioYaml, PortfolioData } from "@/types";
import { computeUpdatedAccountInfoWithMdd } from "@/lib/accountStats";
import { isUsMarketOpen } from "@/lib/market";

// Constants
export const BLOB_KEY = "account.json";
export const HISTORY_BLOB_KEY = "history.jsonl";
export const LOCAL_FILE_PATH = path.join(process.cwd(), "data", "account.json");
export const LOCAL_HISTORY_PATH = path.join(process.cwd(), "data", "history.jsonl");

// Check if LOCAL env variable is set to true/1
export const useLocal = process.env.LOCAL === "true" || process.env.LOCAL === "1";

// ========== History Data Types ==========

export interface HistoryEntry {
  datetime: string;                // Exchange time: "YYYY-MM-DD HH:mm" (Eastern Time)
  timestamp: number;               // Unix timestamp (ms) for precise ordering
  net_liquidation: number;         // 账户净值 (USD)
  principal_sgd: number;           // 本金 (累计投入, SGD)
  usd_sgd_rate: number;            // 汇率 (required for P&L calculation)
  total_stock_mv?: number;         // 股票市值
  total_option_mv?: number;        // 期权市值
  total_crypto_mv?: number;        // 加密货币市值
  total_etf_mv?: number;           // ETF市值
  cash?: number;                   // 现金
}

/**
 * Get current exchange datetime string (Eastern Time, minute precision)
 * Format: "YYYY-MM-DD HH:mm"
 */
export function getExchangeDatetime(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  const hour = parts.find(p => p.type === "hour")?.value;
  const minute = parts.find(p => p.type === "minute")?.value;
  
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

// Account data type (extends PortfolioYaml with additional fields)
export type AccountData = PortfolioYaml & {
  original_amount_sgd?: number;
  original_amount_usd?: number;
  BTC_account?: {
    amount?: number;
    cost_sgd?: number;
    cash_balance_SGD?: number;
  };
};

/**
 * Read raw JSON content from storage (local file or Blob)
 * @returns Raw JSON string or null if not found
 */
export async function readJsonRaw(): Promise<string | null> {
  if (useLocal) {
    try {
      const raw = await fs.readFile(LOCAL_FILE_PATH, "utf8");
      return raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      console.error("[storage] Local file read error:", error);
      throw error;
    }
  } else {
    try {
      const blobInfo = await head(BLOB_KEY);
      if (blobInfo) {
        // Add timestamp query parameter to bypass CDN cache
        const urlWithCacheBuster = `${blobInfo.url}?t=${Date.now()}`;
        const response = await fetch(urlWithCacheBuster, {
          cache: "no-store",
        });
        if (response.ok) {
          return await response.text();
        }
      }
      return null;
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return null;
      }
      console.error("[storage] Blob read error:", error);
      throw error;
    }
  }
}

/**
 * Load and parse portfolio JSON from storage
 * @returns Parsed AccountData object
 * @throws Error if file not found or invalid
 */
export async function loadPortfolioJson(): Promise<AccountData> {
  const raw = await readJsonRaw();
  
  if (!raw) {
    throw new Error("Portfolio data not found. Please input JSON data in the modal first.");
  }
  
  const parsed = JSON.parse(raw) as AccountData;
  
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Failed to parse portfolio JSON file.");
  }
  
  if (!parsed.IBKR_account) {
    throw new Error("IBKR_account field is required in portfolio JSON file.");
  }
  
  return parsed;
}

/**
 * Save raw JSON content to storage (local file or Blob)
 * @param content - JSON string to save
 */
export async function saveJsonRaw(content: string): Promise<void> {
  if (useLocal) {
    await fs.mkdir(path.dirname(LOCAL_FILE_PATH), { recursive: true });
    await fs.writeFile(LOCAL_FILE_PATH, content, "utf8");
  } else {
    // Save to Blob
    const blobResult = await put(BLOB_KEY, content, {
      contentType: "application/json",
      access: "public",
      addRandomSuffix: false,
    });
    
    if (!blobResult || !blobResult.url) {
      throw new Error("Blob save operation did not return a valid URL");
    }
    
    // Wait for blob to be committed
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Verify by reading back immediately
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
    
    // Verify content structure
    const savedContent = await verifyResponse.text();
    try {
      const savedParsed = JSON.parse(savedContent);
      const expectedParsed = JSON.parse(content);
      
      // Verify key fields match (excluding timestamp)
      const savedKeys = Object.keys(savedParsed).filter(k => k !== "timestamp").sort();
      const expectedKeys = Object.keys(expectedParsed).filter(k => k !== "timestamp").sort();
      if (JSON.stringify(savedKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error("Saved blob structure does not match expected structure");
      }
      
      // Verify IBKR_account structure matches
      if (savedParsed.IBKR_account && expectedParsed.IBKR_account) {
        const savedIbkrKeys = Object.keys(savedParsed.IBKR_account).sort();
        const expectedIbkrKeys = Object.keys(expectedParsed.IBKR_account).sort();
        if (JSON.stringify(savedIbkrKeys) !== JSON.stringify(expectedIbkrKeys)) {
          throw new Error("Saved IBKR_account structure does not match");
        }
      }
    } catch (parseError) {
      throw new Error(`Failed to verify saved content: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }
  }
}

/**
 * Save portfolio data to storage
 * @param portfolio - AccountData object to save
 */
export async function savePortfolioJson(portfolio: AccountData): Promise<void> {
  const content = JSON.stringify(portfolio, null, 2);
  await saveJsonRaw(content);
}

/**
 * Save JSON with validation and retry logic (for API PUT requests)
 * @param jsonString - Raw JSON string from user input
 * @returns Object with ok status and timestamp
 */
export async function saveJsonWithValidation(jsonString: string): Promise<{ ok: boolean; timestamp: string }> {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON content");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON must parse to an object");
  }

  const timestamp = new Date().toISOString();
  parsed = {
    ...parsed,
    timestamp,
  };

  const jsonContent = JSON.stringify(parsed, null, 2);
  
  // Save with retry logic
  let lastError: Error | null = null;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await saveJsonRaw(jsonContent);
      return { ok: true, timestamp };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[storage] Save attempt ${attempt}/${maxRetries} failed:`, lastError);
      
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }
  
  throw lastError || new Error("Failed to save after multiple attempts");
}

// ========== History Data Functions ==========

/**
 * Read history JSONL from storage
 * @returns Array of history entries
 */
export async function readHistory(): Promise<HistoryEntry[]> {
  let raw: string | null = null;
  
  if (useLocal) {
    try {
      raw = await fs.readFile(LOCAL_HISTORY_PATH, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      console.error("[storage] Local history read error:", error);
      throw error;
    }
  } else {
    try {
      const blobInfo = await head(HISTORY_BLOB_KEY);
      if (blobInfo) {
        const urlWithCacheBuster = `${blobInfo.url}?t=${Date.now()}`;
        const response = await fetch(urlWithCacheBuster, {
          cache: "no-store",
        });
        if (response.ok) {
          raw = await response.text();
        }
      }
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        return [];
      }
      console.error("[storage] Blob history read error:", error);
      throw error;
    }
  }
  
  if (!raw || raw.trim() === "") {
    return [];
  }
  
  // Parse JSONL (one JSON object per line)
  const entries: HistoryEntry[] = [];
  const lines = raw.trim().split("\n");
  for (const line of lines) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line) as HistoryEntry);
      } catch (e) {
        console.error("[storage] Failed to parse history line:", line, e);
      }
    }
  }
  
  return entries;
}

/**
 * Sync local history to cloud if cloud is empty but local exists
 * Called automatically when appending in cloud mode
 * @returns true if synced, false if not needed
 */
async function syncLocalToCloudIfNeeded(): Promise<boolean> {
  // Only sync when not in local mode
  if (useLocal) return false;
  
  try {
    // Check if cloud has data
    const blobInfo = await head(HISTORY_BLOB_KEY);
    if (blobInfo) {
      const response = await fetch(`${blobInfo.url}?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const content = await response.text();
        if (content.trim()) {
          // Cloud already has data, no sync needed
          return false;
        }
      }
    }
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) {
      throw error;
    }
    // Cloud doesn't exist, continue to check local
  }
  
  // Cloud is empty, check if local exists
  try {
    const localRaw = await fs.readFile(LOCAL_HISTORY_PATH, "utf8");
    if (localRaw.trim()) {
      // Local has data, upload to cloud
      console.log("[storage] Syncing local history to cloud...");
      await put(HISTORY_BLOB_KEY, localRaw, {
        contentType: "application/x-ndjson",
        access: "public",
        addRandomSuffix: false,
      });
      console.log("[storage] Local history synced to cloud");
      return true;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    // Local doesn't exist either
  }
  
  return false;
}

/**
 * Append a single entry to history (only if new minute)
 * @param entry - History entry to append
 * @returns true if appended, false if same minute already exists
 */
export async function appendHistory(entry: HistoryEntry): Promise<boolean> {
  // Sync local to cloud if needed (when cloud is empty but local exists)
  if (!useLocal) {
    await syncLocalToCloudIfNeeded();
  }
  
  if (useLocal) {
    // For local, read last line to check if same minute
    try {
      const raw = await fs.readFile(LOCAL_HISTORY_PATH, "utf8");
      const lines = raw.trim().split("\n").filter(l => l.trim());
      if (lines.length > 0) {
        const lastEntry = JSON.parse(lines[lines.length - 1]) as HistoryEntry;
        if (lastEntry.datetime === entry.datetime) {
          // Same minute, skip
          return false;
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // File doesn't exist, will create
    }
    
    const line = JSON.stringify(entry) + "\n";
    await fs.mkdir(path.dirname(LOCAL_HISTORY_PATH), { recursive: true });
    await fs.appendFile(LOCAL_HISTORY_PATH, line, "utf8");
    return true;
  } else {
    // For Blob, read existing and check last entry
    const existing = await readHistory();
    
    if (existing.length > 0) {
      const lastEntry = existing[existing.length - 1];
      if (lastEntry.datetime === entry.datetime) {
        // Same minute, skip
        return false;
      }
    }
    
    // Append new entry
    existing.push(entry);
    const newContent = existing.map(e => JSON.stringify(e)).join("\n") + "\n";
    
    const blobResult = await put(HISTORY_BLOB_KEY, newContent, {
      contentType: "application/x-ndjson",
      access: "public",
      addRandomSuffix: false,
    });
    
    if (!blobResult || !blobResult.url) {
      throw new Error("History blob save operation did not return a valid URL");
    }
    return true;
  }
}

/**
 * Save entire history (replaces existing)
 * @param entries - Array of history entries
 */
export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  const content = entries.map(e => JSON.stringify(e)).join("\n") + (entries.length > 0 ? "\n" : "");
  
  if (useLocal) {
    await fs.mkdir(path.dirname(LOCAL_HISTORY_PATH), { recursive: true });
    await fs.writeFile(LOCAL_HISTORY_PATH, content, "utf8");
  } else {
    const blobResult = await put(HISTORY_BLOB_KEY, content, {
      contentType: "application/x-ndjson",
      access: "public",
      addRandomSuffix: false,
    });
    
    if (!blobResult || !blobResult.url) {
      throw new Error("History blob save operation did not return a valid URL");
    }
  }
}

/**
 * Create a history entry from current portfolio data
 * Uses exchange time (Eastern Time) at minute precision
 * @param portfolioData - Current portfolio response data
 * @returns History entry with current exchange datetime
 */
export function createHistoryEntry(portfolioData: {
  net_liquidation: number;
  principal_sgd: number;
  usd_sgd_rate: number;
  total_stock_mv?: number;
  total_option_mv?: number;
  total_crypto_mv?: number;
  total_etf_mv?: number;
  cash?: number;
}): HistoryEntry {
  const round2 = (n?: number) => n !== undefined ? Math.round(n * 100) / 100 : undefined;
  return {
    datetime: getExchangeDatetime(),
    timestamp: Date.now(),
    net_liquidation: round2(portfolioData.net_liquidation)!,
    principal_sgd: round2(portfolioData.principal_sgd)!,
    usd_sgd_rate: Math.round(portfolioData.usd_sgd_rate * 10000) / 10000,
    total_stock_mv: round2(portfolioData.total_stock_mv),
    total_option_mv: round2(portfolioData.total_option_mv),
    total_crypto_mv: round2(portfolioData.total_crypto_mv),
    total_etf_mv: round2(portfolioData.total_etf_mv),
    cash: round2(portfolioData.cash),
  };
}

/**
 * Append history entry only if it's a new minute and US market is open
 * Convenience function that creates entry and appends in one call
 * @param portfolioData - Current portfolio response data
 * @returns true if new data point was added, false if same minute or market closed
 */
export async function appendHistoryIfNewMinute(portfolioData: {
  net_liquidation: number;
  principal_sgd: number;
  usd_sgd_rate: number;
  total_stock_mv?: number;
  total_option_mv?: number;
  total_crypto_mv?: number;
  total_etf_mv?: number;
  cash?: number;
}): Promise<boolean> {
  if (!isUsMarketOpen()) {
    return false;
  }
  const entry = createHistoryEntry(portfolioData);
  return appendHistory(entry);
}

/**
 * Update account_info max/min/MDD in portfolio based on latest portfolio response,
 * persist to storage, and reflect updated values back into response.
 *
 * 纯持久化逻辑，供 API route 调用。
 */
export async function updateAccountInfoWithMdd(
  portfolio: AccountData,
  response: PortfolioData
): Promise<{ portfolio: AccountData; response: PortfolioData }> {
  const result = computeUpdatedAccountInfoWithMdd(portfolio, response);
  if (!result) {
    return { portfolio, response };
  }

  const updatedPortfolio: AccountData = {
    ...portfolio,
    account_info: result.accountInfo,
    timestamp: new Date().toISOString(),
  };

  await savePortfolioJson(updatedPortfolio);

  return { portfolio: updatedPortfolio, response: result.response };
}
