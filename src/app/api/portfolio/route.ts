import { NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import { BlobNotFoundError } from "@vercel/blob";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { RawPosition, PortfolioYaml, Quote, Position, ChartSegment, PortfolioData } from "@/types";
import { getOkxPrices } from "@/lib/data";

const BLOB_KEY = "account.json";
const LOCAL_FILE_PATH = path.join(process.cwd(), "data", "account.json");
const tradierBaseUrl = (process.env.TRADIER_BASE_URL ?? "https://api.tradier.com/v1/").replace(/\/+$/, "") + "/";

// Check if LOCAL env variable is set to true/1
const useLocal = process.env.LOCAL === "true" || process.env.LOCAL === "1";

export const dynamic = "force-dynamic";

function toOccSymbol(pos: RawPosition): string | null {
  if (pos.secType !== "OPT" || !pos.expiry || !pos.right || pos.strike === undefined) {
    return null;
  }
  const date = pos.expiry;
  const yy = date.slice(2, 4);
  const mm = date.slice(4, 6);
  const dd = date.slice(6, 8);
  const cp = pos.right === "C" ? "C" : "P";
  const strikeInt = Math.round((pos.strike ?? 0) * 1000);
  return `${pos.symbol}${yy}${mm}${dd}${cp}${strikeInt.toString().padStart(8, "0")}`;
}

function convertGreek(value: number | undefined, qty: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }
  return Math.round(value * 100 * qty * 100) / 100;
}

function percentChange(price: number, cost: number): number {
  if (!cost) {
    return 0;
  }
  return ((price - cost) / cost) * 100;
}

function calculateDteDays(expiry?: string): number | undefined {
  if (!expiry || expiry.length !== 8) {
    return undefined;
  }
  const expiryDate = new Date(
    Number(expiry.slice(0, 4)),
    Number(expiry.slice(4, 6)) - 1,
    Number(expiry.slice(6, 8))
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Number.isFinite(diffDays) ? diffDays : undefined;
}

function asNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function ensureArray<T>(item: T | T[] | undefined): T[] {
  if (item === undefined) return [];
  return Array.isArray(item) ? item : [item];
}

type AccountData = PortfolioYaml & {
  original_amount_sgd?: number;
  original_amount_usd?: number;
  BTC_account?: {
    amount?: number;
    cost_sgd?: number;
  };
};

async function loadPortfolioJson(): Promise<AccountData> {
  if (useLocal) {
    // Read from local file
    try {
      const raw = await fs.readFile(LOCAL_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw) as AccountData;
      
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Failed to parse portfolio JSON file.");
      }
      
      if (!parsed.IBKR_account) {
        throw new Error("IBKR_account field is required in portfolio JSON file.");
      }
      
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("Portfolio data not found. Please input JSON data in the modal first.");
      }
      throw error;
    }
  } else {
    // Read from Blob
    try {
      const blobInfo = await head(BLOB_KEY);
      if (!blobInfo) {
        throw new BlobNotFoundError();
      }
      
      // Add timestamp query parameter to bypass CDN cache
      const urlWithCacheBuster = `${blobInfo.url}?t=${Date.now()}`;
      const response = await fetch(urlWithCacheBuster, {
        cache: "no-store",
      });
      
      if (!response.ok) {
        throw new Error("Blob fetch failed");
      }
      
      const raw = await response.text();
      const parsed = JSON.parse(raw) as AccountData;
      
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Failed to parse portfolio JSON file.");
      }
      
      if (!parsed.IBKR_account) {
        throw new Error("IBKR_account field is required in portfolio JSON file.");
      }
      
      return parsed;
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        throw new Error("Portfolio data not found. Please input JSON data in the modal first.");
      }
      throw error;
    }
  }
}

async function savePortfolioJson(portfolio: AccountData): Promise<void> {
  const content = JSON.stringify(portfolio, null, 2);
  
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
    // Basic verification: check if content structure matches
    try {
      const savedParsed = JSON.parse(savedContent);
      const expectedParsed = JSON.parse(content);
      // Verify key fields match (excluding timestamp which may differ)
      const savedKeys = Object.keys(savedParsed).filter(k => k !== "timestamp").sort();
      const expectedKeys = Object.keys(expectedParsed).filter(k => k !== "timestamp").sort();
      if (JSON.stringify(savedKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error("Saved blob structure does not match expected structure");
      }
      // Verify critical fields match
      if (savedParsed.IBKR_account && expectedParsed.IBKR_account) {
        const savedIbkrKeys = Object.keys(savedParsed.IBKR_account).sort();
        const expectedIbkrKeys = Object.keys(expectedParsed.IBKR_account).sort();
        if (JSON.stringify(savedIbkrKeys) !== JSON.stringify(expectedIbkrKeys)) {
          throw new Error("Saved IBKR_account structure does not match");
        }
      }
    } catch (parseError) {
      // If parsing fails, the content might not match - this is a problem
      throw new Error(`Failed to verify saved content: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }
  }
}

async function fetchUsdSgdRate(): Promise<number> {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/SGD=X";
    const params = new URLSearchParams({
      period1: Math.floor(Date.now() / 1000 - 86400).toString(),
      period2: Math.floor(Date.now() / 1000).toString(),
      interval: "1d",
      includePrePost: "true",
      events: "div|split|earn",
      lang: "en-SG",
      region: "SG",
      source: "cosaic",
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "*/*",
        Origin: "https://sg.finance.yahoo.com",
        Referer: "https://sg.finance.yahoo.com/quote/SGD%3DX/",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error (${response.status})`);
    }

    const data = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof rate !== "number" || rate <= 0) {
      throw new Error("Invalid USD/SGD rate from Yahoo Finance");
    }
    return rate;
  } catch (error) {
    console.error("[portfolio API] Failed to fetch USD/SGD rate:", error);
    throw error;
  }
}

async function fetchUsdCnyRate(): Promise<number> {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/CNY=X";
    const params = new URLSearchParams({
      interval: "1d",
      range: "1d",
    });

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error (${response.status})`);
    }

    const data = (await response.json()) as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof rate !== "number" || rate <= 0) {
      throw new Error("Invalid USD/CNY rate from Yahoo Finance");
    }
    return rate;
  } catch (error) {
    console.error("[portfolio API] Failed to fetch USD/CNY rate:", error);
    throw error;
  }
}

async function fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const tradierToken = process.env.TRADIER_TOKEN;
  if (!tradierToken) {
    throw new Error("TRADIER_TOKEN not configured.");
  }
  if (symbols.length === 0) {
    return new Map();
  }
  const url = new URL("markets/quotes", tradierBaseUrl);
  url.searchParams.set("symbols", symbols.join(","));
  url.searchParams.set("greeks", "true");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${tradierToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tradier API error (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { quotes?: { quote?: Quote | Quote[] } };
  const quotes = ensureArray(data.quotes?.quote);
  const map = new Map<string, Quote>();
  for (const quote of quotes) {
    if (quote?.symbol) {
      map.set(quote.symbol, quote);
    }
  }
  return map;
}

// Hardcoded ETF symbols (treat as ETF even if marked as STK in YAML)
const ETF_SYMBOLS = ["GLDM"];

function buildResponse(
  portfolio: AccountData,
  quotes: Map<string, Quote>,
  cryptoPrices: Map<string, number>,
  usdSgdRate: number,
  usdCnyRate: number
): PortfolioData {
  const positionsOutput: Position[] = [];
  let totalStockMV = 0;
  let totalOptionMV = 0;
  let totalCryptoMV = 0;
  let totalEtfMV = 0;
  let totalUpnl = 0;
  let totalTheta = 0;

  const optionPositions: RawPosition[] = [];
  const stockPositions: RawPosition[] = [];
  const etfPositions: RawPosition[] = [];

  const positions = portfolio.IBKR_account.positions;
  
  // Track separate cash sources
  const ibkrCash = portfolio.IBKR_account.cash;
  let cashAccountUsd = 0;
  
  // Calculate cash_account in USD (convert SGD to USD)
  if (portfolio.cash_account) {
    const sgdCash = portfolio.cash_account.SGD_cash ?? 0;
    const usdCash = portfolio.cash_account.USD_cash ?? 0;
    
    // Convert SGD to USD
    if (sgdCash > 0 && usdSgdRate > 0) {
      cashAccountUsd += sgdCash / usdSgdRate;
    }
    
    // Add USD cash directly
    cashAccountUsd += usdCash;
  }
  
  // Total cash = IBKR cash + cash account
  const cash = ibkrCash + cashAccountUsd;

  for (const pos of positions) {
    if (pos.secType === "OPT") {
      optionPositions.push(pos);
    } else if (pos.secType === "ETF" || ETF_SYMBOLS.includes(pos.symbol)) {
      etfPositions.push(pos);
    } else {
      stockPositions.push(pos);
    }
  }

  optionPositions.sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));

  const orderedPositions = [...stockPositions, ...etfPositions, ...optionPositions];

  for (const rawPos of orderedPositions) {
    const qty = asNumber(rawPos.position);
    const cost = asNumber(rawPos.avgCost);
    
    // Check if this is an ETF (either marked as ETF or in hardcoded list)
    const isETF = rawPos.secType === "ETF" || ETF_SYMBOLS.includes(rawPos.symbol);
    const effectiveSecType = isETF ? "ETF" : rawPos.secType;

    const symbolKey = rawPos.secType === "OPT" ? toOccSymbol(rawPos) : rawPos.symbol;
    const quote = symbolKey ? quotes.get(symbolKey) : undefined;
    const underlyingQuote = rawPos.secType === "OPT" ? quotes.get(rawPos.symbol) : quote;
    const bid = asNumber(quote?.bid);
    const ask = asNumber(quote?.ask);
    const midPrice = (bid + ask) / 2;
    const price = rawPos.secType === "OPT" ? midPrice * 100 : midPrice;
    const underlyingBid = asNumber(underlyingQuote?.bid);
    const underlyingAsk = asNumber(underlyingQuote?.ask);
    const underlyingMid = (underlyingBid + underlyingAsk) / 2;

    const upnl = (price - cost) * qty;

    let delta = 0;
    let gamma = 0;
    let theta = 0;
    if (rawPos.secType === "OPT") {
      delta = convertGreek(quote?.greeks?.delta, qty);
      gamma = convertGreek(quote?.greeks?.gamma, qty);
      theta = convertGreek(quote?.greeks?.theta, qty);
      totalTheta += theta;
    } else {
      // For stocks and ETFs, delta = quantity (have delta of 1 per share)
      delta = qty;
    }

    const marketValue = price * qty;
    if (rawPos.secType === "OPT") {
      totalOptionMV += marketValue;
    } else if (isETF) {
      // ETF market value - tracked separately
      totalEtfMV += marketValue;
    } else {
      totalStockMV += marketValue;
    }
    totalUpnl += upnl;

    positionsOutput.push({
      symbol: rawPos.secType === "OPT" ? (symbolKey ?? rawPos.symbol) : rawPos.symbol,
      secType: effectiveSecType,
      qty,
      cost,
      price,
      underlyingPrice: rawPos.secType === "OPT" ? underlyingMid : price,
      upnl,
      is_option: rawPos.secType === "OPT",
      is_crypto: false,
      dteDays: rawPos.secType === "OPT" ? calculateDteDays(rawPos.expiry) : undefined,
      delta,
      gamma,
      theta,
      percent_change: percentChange(price, cost),
      right: rawPos.right,
      strike: rawPos.strike,
      expiry: rawPos.expiry,
      underlyingKey: rawPos.symbol,
    });
  }

  // Process BTC position
  const btcQty = portfolio.BTC_account?.amount ?? 0;
  const btcCostSGD = portfolio.BTC_account?.cost_sgd ?? 0;
  if (btcQty > 0 && btcCostSGD > 0) {
    const totalCostUSD = btcCostSGD / usdSgdRate;
    const cost = totalCostUSD / btcQty;

    // Map crypto symbol to OKX format (BTC -> BTC-USDT)
    const okxSymbol = "BTC-USDT";
    const price = cryptoPrices.get(okxSymbol) || cost; // Fallback to cost if price unavailable
    
    const upnl = (price - cost) * btcQty;
    const marketValue = price * btcQty;
    totalCryptoMV += marketValue;
    totalUpnl += upnl;

    positionsOutput.push({
      symbol: "BTC",
      secType: "CRYPTO",
      qty: btcQty,
      cost,
      price,
      underlyingPrice: price,
      upnl,
      is_option: false,
      is_crypto: true,
      delta: btcQty, // Crypto has delta of 1 per unit
      gamma: 0,
      theta: 0,
      percent_change: percentChange(price, cost),
    });
  }
  
  // Process crypto positions
  if (portfolio.crypto && portfolio.crypto.length > 0) {
    for (const cryptoPos of portfolio.crypto) {
      const qty = asNumber(cryptoPos.position);
      const totalCostSGD = asNumber(cryptoPos.totalCostSGD);
      const totalCostUSD = totalCostSGD / usdSgdRate;
      const cost = qty > 0 ? totalCostUSD / qty : 0; // Keep check here as qty could be 0 from asNumber

      // Map crypto symbol to OKX format (e.g., BTC -> BTC-USDT)
      const okxSymbol = `${cryptoPos.symbol}-USDT`;
      const price = cryptoPrices.get(okxSymbol) || cost; // Fallback to cost if price unavailable
      
      const upnl = (price - cost) * qty;
      const marketValue = price * qty;
      totalCryptoMV += marketValue;
      totalUpnl += upnl;

      positionsOutput.push({
        symbol: cryptoPos.symbol,
        secType: "CRYPTO",
        qty,
        cost,
        price,
        underlyingPrice: price,
        upnl,
        is_option: false,
        is_crypto: true,
        delta: qty, // Crypto has delta of 1 per unit
        gamma: 0,
        theta: 0,
        percent_change: percentChange(price, cost),
      });
    }
  }

  const netLiquidation = cash + totalStockMV + totalOptionMV + totalCryptoMV + totalEtfMV;
  const utilization = netLiquidation !== 0 ? (netLiquidation - cash) / netLiquidation : 0;

  const chartSegments: ChartSegment[] = [];
  const radius = 80;
  const circumference = netLiquidation > 0 ? 2 * Math.PI * radius : 0;
  if (netLiquidation > 0) {
    const segmentsData: Array<{ name: "cash" | "stock" | "option" | "crypto" | "etf"; value: number; color: string }> = [
      { name: "cash", value: cash, color: "#d4d4d4" },
      { name: "stock", value: totalStockMV, color: "#a3a3a3" },
      { name: "option", value: totalOptionMV, color: "#737373" },
      { name: "crypto", value: totalCryptoMV, color: "#525252" },
      { name: "etf", value: totalEtfMV, color: "#404040" },
    ];

    let offset = 0;
    for (const segment of segmentsData) {
      const pct = (segment.value / netLiquidation) * 100;
      if (pct <= 0) continue;
      const arc = (pct / 100) * circumference;
      chartSegments.push({
        name: segment.name,
        pct,
        color: segment.color,
        arc,
        offset,
        value: segment.value,
      });
      offset += arc;
    }
  }

  // Principal (original investment amount)
  // Priority: original_amount_sgd -> principal_SGD, then convert to USD
  const principalSgd = portfolio.original_amount_sgd ?? portfolio.account_info?.principal_SGD ?? 0;
  const principalUsd = portfolio.original_amount_usd ?? 
    (principalSgd && usdSgdRate ? principalSgd / usdSgdRate : 0);
  
  // IBKR-specific principal
  const ibkrPrincipalSgd = portfolio.account_info?.IBKR_principal_SGD ?? 0;
  const ibkrPrincipalUsd = ibkrPrincipalSgd && usdSgdRate ? ibkrPrincipalSgd / usdSgdRate : 0;
  
  // Keep original fields for backwards compatibility
  const originalAmountSgd = portfolio.original_amount_sgd ?? 0;
  const originalAmountUsd = principalUsd;
  const yearBeginBalanceSgd = portfolio.account_info?.principal_SGD ?? 0;
  const accountPnl = netLiquidation - originalAmountUsd;
  const accountPnlPercent = originalAmountUsd !== 0 ? (accountPnl / originalAmountUsd) * 100 : 0;
  const maxValue = portfolio.account_info?.max_value_USD;
  const minValue = portfolio.account_info?.min_value_USD;
  const maxDrawdownPercent = portfolio.account_info?.max_drawdown_percent;

  return {
    cash: cash,
    ibkr_cash: ibkrCash,
    cash_account_usd: cashAccountUsd,
    net_liquidation: netLiquidation,
    total_stock_mv: totalStockMV,
    total_option_mv: totalOptionMV,
    total_crypto_mv: totalCryptoMV,
    total_etf_mv: totalEtfMV,
    total_upnl: totalUpnl,
    total_theta: totalTheta,
    utilization,
    positions: positionsOutput,
    chart_segments: chartSegments,
    circumference,
    account_pnl: accountPnl,
    account_pnl_percent: accountPnlPercent,
    usd_sgd_rate: usdSgdRate,
    usd_cny_rate: usdCnyRate,
    original_amount_sgd: originalAmountSgd,
    original_amount_usd: originalAmountUsd,
    principal: yearBeginBalanceSgd,
    principal_usd: principalUsd,
    ibkr_principal_usd: ibkrPrincipalUsd,
    original_amount_sgd_raw: originalAmountSgd,
    max_value_USD: maxValue,
    min_value_USD: minValue,
    max_drawdown_percent: maxDrawdownPercent,
  };
}

export async function GET() {
  if (!process.env.TRADIER_TOKEN) {
    return NextResponse.json(
      { error: "TRADIER_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    let portfolio = await loadPortfolioJson();
    const symbolSet = new Set<string>();
    const positions = portfolio.IBKR_account.positions;
    for (const pos of positions) {
      if (pos.secType === "OPT") {
        const optionSymbol = toOccSymbol(pos);
        if (optionSymbol) {
          symbolSet.add(optionSymbol);
        }
        if (pos.symbol) {
          symbolSet.add(pos.symbol);
        }
      } else if (pos.symbol) {
        symbolSet.add(pos.symbol);
      }
    }
    const symbols = Array.from(symbolSet);

    const quotesPromise = fetchQuotes(symbols);

    let usdSgdRate: number | undefined = portfolio.rates?.usd_sgd_rate;
    try {
      const freshRate = await fetchUsdSgdRate();
      usdSgdRate = freshRate;
      const updatedPortfolio: AccountData = {
        ...portfolio,
        rates: {
          ...portfolio.rates,
          usd_sgd_rate: freshRate,
        },
        timestamp: new Date().toISOString(),
      };
      await savePortfolioJson(updatedPortfolio);
    } catch (fxError) {
      console.error("[portfolio API] using cached USD/SGD rate from portfolio data due to fetch failure", fxError);
      if (usdSgdRate === undefined) {
        throw new Error("USD/SGD rate unavailable (API failed and no cached rate in portfolio data)");
      }
    }

    let usdCnyRate: number | undefined = portfolio.rates?.usd_cny_rate;
    try {
      const freshCnyRate = await fetchUsdCnyRate();
      usdCnyRate = freshCnyRate;
      const updatedPortfolio: AccountData = {
        ...portfolio,
        rates: {
          ...portfolio.rates,
          usd_cny_rate: freshCnyRate,
        },
        timestamp: new Date().toISOString(),
      };
      await savePortfolioJson(updatedPortfolio);
    } catch (fxError) {
      console.error("[portfolio API] using cached USD/CNY rate from portfolio data due to fetch failure", fxError);
      if (usdCnyRate === undefined) {
        // Use a default rate if unavailable (fallback)
        usdCnyRate = 7.2;
        console.warn("[portfolio API] Using default USD/CNY rate:", usdCnyRate);
      }
    }

    const quotes = await quotesPromise;
    if (usdSgdRate === undefined) {
      throw new Error("USD/SGD rate unavailable (no live or cached value)");
    }
    if (usdCnyRate === undefined) {
      throw new Error("USD/CNY rate unavailable (no live or cached value)");
    }

    // Fetch crypto prices
    const cryptoPrices = new Map<string, number>();
    const cryptoSymbols: string[] = [];
    
    // Add BTC symbol for price fetching
    const btcQty = portfolio.BTC_account?.amount ?? 0;
    if (btcQty > 0) {
      cryptoSymbols.push("BTC-USDT");
    }
    
    // Add crypto symbols for price fetching
    if (portfolio.crypto && portfolio.crypto.length > 0) {
      portfolio.crypto.forEach(c => {
        const symbol = `${c.symbol}-USDT`;
        if (!cryptoSymbols.includes(symbol)) {
          cryptoSymbols.push(symbol);
        }
      });
    }
    
    if (cryptoSymbols.length > 0) {
      try {
        const okxPrices = await getOkxPrices(cryptoSymbols);
        for (const priceData of okxPrices) {
          if (priceData.success && priceData.price !== undefined) {
            cryptoPrices.set(priceData.inst, priceData.price);
          }
        }
      } catch (cryptoError) {
        console.error("[portfolio API] Failed to fetch crypto prices:", cryptoError);
        // Continue without crypto prices - will use cost basis as fallback
      }
    }

    // Reload portfolio data before building response to ensure we have latest account_info
    // This is important because account_info might have been updated in previous requests
    // (e.g., when updating exchange rates)
    portfolio = await loadPortfolioJson();
    
    const response = buildResponse(portfolio, quotes, cryptoPrices, usdSgdRate, usdCnyRate);

    // Update max_value and min_value based on current net_liquidation
    // For MDD calculation: min_value should be the lowest value AFTER reaching max_value
    const currentNetLiquidation = response.net_liquidation;
    // Round to 2 decimal places
    const roundedNetLiquidation = Math.round(currentNetLiquidation * 100) / 100;
    let shouldUpdateAccountInfo = false;
    const currentAccountInfo = portfolio.account_info || {};
    // Round existing values to 2 decimal places if they exist
    const currentMaxValue = currentAccountInfo.max_value_USD !== undefined 
      ? Math.round((currentAccountInfo.max_value_USD ?? 0) * 100) / 100 
      : 0;
    const currentMinValue = currentAccountInfo.min_value_USD !== undefined 
      ? Math.round((currentAccountInfo.min_value_USD ?? 0) * 100) / 100 
      : 0;
    
    let updatedMaxValue = currentMaxValue;
    let updatedMinValue = currentMinValue;
    const currentMaxDrawdown = currentAccountInfo.max_drawdown_percent ?? 0;
    let updatedMaxDrawdown = currentMaxDrawdown;
    
    // Update max_value if current value is greater (new peak reached)
    if (roundedNetLiquidation > currentMaxValue || currentMaxValue === 0) {
      updatedMaxValue = roundedNetLiquidation;
      // When a new peak is reached, reset min_value to the new peak
      // This ensures min_value is always the lowest value AFTER the current peak
      updatedMinValue = roundedNetLiquidation;
      shouldUpdateAccountInfo = true;
    } else {
      // Only update min_value if we haven't reached a new peak
      // min_value should be the lowest value since the last peak
      if (currentMinValue === 0 || roundedNetLiquidation < currentMinValue) {
        updatedMinValue = roundedNetLiquidation;
        shouldUpdateAccountInfo = true;
      }
    }
    
    // Calculate current drawdown from the peak
    const currentDrawdown = updatedMaxValue > 0 
      ? ((updatedMinValue - updatedMaxValue) / updatedMaxValue) * 100 
      : 0;
    
    // Update historical max drawdown if current drawdown is worse (more negative)
    if (currentDrawdown < updatedMaxDrawdown) {
      updatedMaxDrawdown = currentDrawdown;
      shouldUpdateAccountInfo = true;
    }
    
    // Always ensure values are rounded to 2 decimal places, even if not updating
    // This fixes any existing values that might not be properly rounded
    const roundedMaxValue = Math.round(updatedMaxValue * 100) / 100;
    const roundedMinValue = Math.round(updatedMinValue * 100) / 100;
    const roundedMaxDrawdown = Math.round(updatedMaxDrawdown * 100) / 100;
    
    // Check if rounding changed the values (to handle existing non-2dp values)
    if (roundedMaxValue !== updatedMaxValue || roundedMinValue !== updatedMinValue || roundedMaxDrawdown !== updatedMaxDrawdown) {
      shouldUpdateAccountInfo = true;
    }
    
    // Save updated account_info if values changed
    if (shouldUpdateAccountInfo) {
      try {
        const updatedPortfolio: AccountData = {
          ...portfolio,
          account_info: {
            ...currentAccountInfo,
            max_value_USD: roundedMaxValue,
            min_value_USD: roundedMinValue,
            max_drawdown_percent: roundedMaxDrawdown,
          },
          timestamp: new Date().toISOString(),
        };
        await savePortfolioJson(updatedPortfolio);
        
        // Update response with latest account_info values to ensure frontend gets fresh data
        // This ensures the response reflects the updated values immediately
        response.max_value_USD = roundedMaxValue;
        response.min_value_USD = roundedMinValue;
        response.max_drawdown_percent = roundedMaxDrawdown;
        
        // Update portfolio variable for consistency
        portfolio = updatedPortfolio;
      } catch (updateError) {
        // Log error but don't fail the request
        console.error("[portfolio API] Failed to update account_info max/min values:", updateError);
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[portfolio API] error", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("not found")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

