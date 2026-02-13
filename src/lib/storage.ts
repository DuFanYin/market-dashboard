/**
 * Storage Utilities
 * 
 * Uses PostgreSQL exclusively for both account data (JSONB) and history data.
 * No local file or Vercel Blob storage dependencies.
 */

import type { PortfolioYaml, PortfolioData } from "@/types";
import { computeUpdatedAccountInfoWithMdd } from "@/lib/accountStats";
import { isUsMarketOpen } from "@/lib/market";

// PostgreSQL client - use dynamic import to avoid issues if not installed
let pg: typeof import("pg") | null = null;
async function getPgClient() {
  if (!pg) {
    try {
      pg = await import("pg");
    } catch {
      throw new Error("PostgreSQL client (pg) is not installed. Run: npm install pg @types/pg");
    }
  }
  return pg;
}

// Neon PostgreSQL connection configuration
export const DATABASE_URL = process.env.DATABASE_URL || "";
export const HISTORY_TABLE_NAME = "history";
export const ACCOUNT_TABLE_NAME = "account";

// Check if we should use Neon database for history (use connection string)
export const useNeonHistory = !!DATABASE_URL && DATABASE_URL.includes("postgresql://");

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
 * Read account data from PostgreSQL database as JSONB
 * @returns Raw JSON string or null if not found
 */
async function readAccountFromDatabase(): Promise<string | null> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pgModule = await getPgClient();
  const client = new pgModule.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    const result = await client.query(
      `SELECT data FROM ${ACCOUNT_TABLE_NAME} ORDER BY id DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
      return null;
    }

    // Convert JSONB to JSON string
    const jsonbData = result.rows[0].data;
    return JSON.stringify(jsonbData, null, 2);
  } catch (error) {
    console.error("[storage] Failed to read account from database:", error);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Read raw JSON content from storage (PostgreSQL JSONB only)
 * @returns Raw JSON string or null if not found
 */
export async function readJsonRaw(): Promise<string | null> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured for account storage");
  }

  return await readAccountFromDatabase();
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
 * Save account data to PostgreSQL database as JSONB
 * Resets the table by deleting all existing records before inserting new one
 * @param content - JSON string to save
 */
async function saveAccountToDatabase(content: string): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pgModule = await getPgClient();
  const client = new pgModule.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    
    // Parse JSON to validate
    const accountData = JSON.parse(content);
    
    // Reset: Delete all existing records first
    await client.query(`DELETE FROM ${ACCOUNT_TABLE_NAME}`);
    console.log("[storage] Deleted all existing account records");
    
    // Insert new record
    await client.query(
      `INSERT INTO ${ACCOUNT_TABLE_NAME} (data) VALUES ($1)`,
      [accountData]
    );
    console.log("[storage] Inserted new account data into database");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[storage] Failed to save account to database:", errorMessage);
    throw new Error(`Failed to save account to database: ${errorMessage}`);
  } finally {
    await client.end();
  }
}

/**
 * Save raw JSON content to storage (PostgreSQL JSONB only)
 * @param content - JSON string to save
 */
export async function saveJsonRaw(content: string): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured for account storage");
  }

  await saveAccountToDatabase(content);
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
 * Read history from Neon PostgreSQL database using direct connection
 * @returns Array of history entries
 */
async function readHistoryFromNeon(): Promise<HistoryEntry[]> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pgModule = await getPgClient();
  const client = new pgModule.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("[storage] Connected to PostgreSQL database");

    const result = await client.query(
      `SELECT datetime, timestamp, net_liquidation, principal_sgd, usd_sgd_rate, 
              total_stock_mv, total_option_mv, total_crypto_mv, total_etf_mv, cash 
       FROM ${HISTORY_TABLE_NAME} 
       ORDER BY timestamp ASC`
    );

    const entries: HistoryEntry[] = result.rows.map((row) => ({
      datetime: row.datetime,
      timestamp: Number(row.timestamp),
      net_liquidation: Number(row.net_liquidation),
      principal_sgd: Number(row.principal_sgd),
      usd_sgd_rate: Number(row.usd_sgd_rate),
      total_stock_mv: row.total_stock_mv ? Number(row.total_stock_mv) : undefined,
      total_option_mv: row.total_option_mv ? Number(row.total_option_mv) : undefined,
      total_crypto_mv: row.total_crypto_mv ? Number(row.total_crypto_mv) : undefined,
      total_etf_mv: row.total_etf_mv ? Number(row.total_etf_mv) : undefined,
      cash: row.cash ? Number(row.cash) : undefined,
    }));

    return entries;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[storage] PostgreSQL read error:", errorMessage);
    throw new Error(`Failed to read history from database: ${errorMessage}`);
  } finally {
    await client.end();
  }
}


/**
 * Read history from Neon database (always use database, no file fallback)
 * @returns Array of history entries
 */
export async function readHistory(): Promise<HistoryEntry[]> {
  console.log(`[storage] readHistory called: useNeonHistory=${useNeonHistory}, DATABASE_URL=${DATABASE_URL ? "set" : "not set"}`);
  
  if (!useNeonHistory) {
    const errorMsg = `Database history is not configured. DATABASE_URL=${DATABASE_URL || "not set"}. Set DATABASE_URL in environment variables.`;
    console.error(`[storage] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  return await readHistoryFromNeon();
}


/**
 * Insert history entries into Neon PostgreSQL database using direct connection
 * @param entries - Array of history entries to insert
 */
async function insertHistoryToNeon(entries: HistoryEntry[]): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (entries.length === 0) {
    return;
  }

  const pgModule = await getPgClient();
  const client = new pgModule.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log(`[storage] Inserting ${entries.length} entries into database`);

    // Insert in batches to avoid issues with large payloads
    const batchSize = 100;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      
      // Build INSERT query with ON CONFLICT DO NOTHING (upsert)
      // Use proper parameterized query construction
      const values: unknown[] = [];
      const placeholders: string[] = [];
      
      batch.forEach((entry) => {
        const startIdx = values.length + 1; // PostgreSQL uses 1-based indexing
        placeholders.push(
          `($${startIdx}, $${startIdx + 1}, $${startIdx + 2}, $${startIdx + 3}, $${startIdx + 4}, $${startIdx + 5}, $${startIdx + 6}, $${startIdx + 7}, $${startIdx + 8}, $${startIdx + 9})`
        );
        values.push(
          entry.datetime,
          entry.timestamp,
          entry.net_liquidation,
          entry.principal_sgd,
          entry.usd_sgd_rate,
          entry.total_stock_mv ?? null,
          entry.total_option_mv ?? null,
          entry.total_crypto_mv ?? null,
          entry.total_etf_mv ?? null,
          entry.cash ?? null
        );
      });

      const query = `
        INSERT INTO ${HISTORY_TABLE_NAME} 
        (datetime, timestamp, net_liquidation, principal_sgd, usd_sgd_rate, 
         total_stock_mv, total_option_mv, total_crypto_mv, total_etf_mv, cash)
        VALUES ${placeholders.join(", ")}
        ON CONFLICT (datetime) DO NOTHING
      `;

      const result = await client.query(query, values);
      const insertedCount = result.rowCount || 0;
      console.log(`[storage] Batch ${Math.floor(i / batchSize) + 1}: attempted ${batch.length}, inserted ${insertedCount} entries`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[storage] PostgreSQL insert error:", errorMessage);
    
    // Check if it's a unique constraint violation (duplicate)
    if (errorMessage.includes("duplicate") || errorMessage.includes("unique")) {
      throw new Error("409_CONFLICT");
    }
    
    throw new Error(`Failed to insert history to database: ${errorMessage}`);
  } finally {
    await client.end();
  }
}

/**
 * Insert a single history entry and return whether it was actually inserted
 * @param entry - History entry to insert
 * @returns number of rows inserted (0 if duplicate, 1 if new)
 */
async function insertSingleHistoryEntry(entry: HistoryEntry): Promise<number> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pgModule = await getPgClient();
  const client = new pgModule.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    
    const query = `
      INSERT INTO ${HISTORY_TABLE_NAME} 
      (datetime, timestamp, net_liquidation, principal_sgd, usd_sgd_rate, 
       total_stock_mv, total_option_mv, total_crypto_mv, total_etf_mv, cash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (datetime) DO NOTHING
    `;
    
    const result = await client.query(query, [
      entry.datetime,
      entry.timestamp,
      entry.net_liquidation,
      entry.principal_sgd,
      entry.usd_sgd_rate,
      entry.total_stock_mv ?? null,
      entry.total_option_mv ?? null,
      entry.total_crypto_mv ?? null,
      entry.total_etf_mv ?? null,
      entry.cash ?? null,
    ]);
    
    return result.rowCount || 0;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[storage] PostgreSQL insert error:", errorMessage);
    throw new Error(`Failed to insert history entry: ${errorMessage}`);
  } finally {
    await client.end();
  }
}

export async function appendHistory(entry: HistoryEntry): Promise<boolean> {
  if (!useNeonHistory) {
    throw new Error("Database history is not configured. Set DATABASE_URL in environment variables.");
  }
  
  console.log(`[storage] appendHistory called: datetime=${entry.datetime}`);
  
  // Insert entry - ON CONFLICT DO NOTHING handles duplicates
  try {
    const rowsInserted = await insertSingleHistoryEntry(entry);
    if (rowsInserted > 0) {
      console.log(`[storage] Successfully inserted entry with datetime ${entry.datetime} to database`);
      return true;
    } else {
      console.log(`[storage] Entry with datetime ${entry.datetime} already exists (duplicate), skipping`);
      return false;
    }
  } catch (error) {
    console.error("[storage] Failed to append to database:", error);
    throw error;
  }
}

/**
 * Save entire history (replaces existing) - always uses database
 * @param entries - Array of history entries
 */
export async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  if (!useNeonHistory) {
    throw new Error("Database history is not configured. Set DATABASE_URL in environment variables.");
  }

  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const pgModule = await getPgClient();
  const client = new pgModule.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log("[storage] Connected to PostgreSQL for saveHistory");

    // Delete all existing entries
    try {
      await client.query(`DELETE FROM ${HISTORY_TABLE_NAME}`);
      console.log("[storage] Deleted all existing history entries");
    } catch (error) {
      // Ignore delete errors (table might be empty or not exist)
      console.warn("[storage] Could not delete existing entries (may be empty):", error);
    }

    // Insert all entries
    if (entries.length > 0) {
      await insertHistoryToNeon(entries);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[storage] PostgreSQL saveHistory error:", errorMessage);
    throw new Error(`Failed to save history: ${errorMessage}`);
  } finally {
    await client.end();
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
