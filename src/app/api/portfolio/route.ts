import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { load, dump } from "js-yaml";
import type { RawPosition, PortfolioYaml, Quote, Position, ChartSegment, PortfolioData } from "@/types/portfolio";
import { getOkxPrices } from "@/lib/data";

const yamlPath = path.join(process.cwd(), "data", "positions.yaml");
const tradierBaseUrl = (process.env.TRADIER_BASE_URL ?? "https://api.tradier.com/v1/").replace(/\/+$/, "") + "/";

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

async function loadPortfolioYaml(): Promise<PortfolioYaml> {
  try {
    await fs.access(yamlPath);
  } catch {
    throw new Error("Portfolio data file not found");
  }
  const raw = await fs.readFile(yamlPath, "utf8");
  const parsed = load(raw) as PortfolioYaml;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Failed to parse portfolio YAML file.");
  }
  return parsed;
}

async function savePortfolioYaml(portfolio: PortfolioYaml): Promise<void> {
  const content = dump(portfolio, { noRefs: true, lineWidth: 240 });
  await fs.writeFile(yamlPath, content, "utf8");
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

function buildResponse(portfolio: PortfolioYaml, quotes: Map<string, Quote>, cryptoPrices: Map<string, number>, usdSgdRate: number, usdCnyRate: number): PortfolioData {
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

  for (const pos of portfolio.positions) {
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
    const midPrice = (bid + ask) / 2 || 0;
    const price = rawPos.secType === "OPT" ? midPrice * 100 : midPrice;
    const underlyingBid = asNumber(underlyingQuote?.bid);
    const underlyingAsk = asNumber(underlyingQuote?.ask);
    const underlyingMid = (underlyingBid + underlyingAsk) / 2 || 0;

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

  // Process crypto positions from .env
  const btcQty = Number(process.env.BTC);
  const btcCostSGD = Number(process.env.BTC_COST_SGD);
  if (btcQty > 0 && btcCostSGD > 0) {
    const totalCostUSD = btcCostSGD / usdSgdRate;
    const cost = btcQty > 0 ? totalCostUSD / btcQty : 0;

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
  
  // Also process crypto positions from YAML (for backward compatibility)
  if (portfolio.crypto && portfolio.crypto.length > 0) {
    for (const cryptoPos of portfolio.crypto) {
      const qty = asNumber(cryptoPos.position);
      const totalCostSGD = asNumber(cryptoPos.totalCostSGD);
      const totalCostUSD = totalCostSGD / usdSgdRate;
      const cost = qty > 0 ? totalCostUSD / qty : 0;

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

  const netLiquidation = portfolio.cash + totalStockMV + totalOptionMV + totalCryptoMV + totalEtfMV;
  const utilization = netLiquidation !== 0 ? (netLiquidation - portfolio.cash) / netLiquidation : 0;

  const chartSegments: ChartSegment[] = [];
  const radius = 80;
  const circumference = netLiquidation > 0 ? 2 * Math.PI * radius : 0;
  if (netLiquidation > 0) {
    const segmentsData: Array<{ name: "cash" | "stock" | "option" | "crypto" | "etf"; value: number; color: string }> = [
      { name: "cash", value: portfolio.cash, color: "#d4d4d4" },
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

  const originalAmountSgd = Number(process.env.ORIGINAL_AMOUNT_SGD);
  const originalAmountSgdRaw = Number(process.env.ORIGINAL_AMOUNT_SGD) || 0;
  const originalAmountUsd = originalAmountSgd / usdSgdRate;
  const yearBeginBalanceUsd = Number(process.env.YEAR_BEGIN_BALANCE_USD) || 0;
  const accountPnl = netLiquidation - originalAmountUsd;
  const accountPnlPercent = originalAmountUsd !== 0 ? (accountPnl / originalAmountUsd) * 100 : 0;

  return {
    cash: portfolio.cash,
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
    year_begin_balance_usd: yearBeginBalanceUsd,
    original_amount_sgd_raw: originalAmountSgdRaw,
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
    const portfolio = await loadPortfolioYaml();
    const symbolSet = new Set<string>();
    for (const pos of portfolio.positions) {
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

    let usdSgdRate: number | undefined = portfolio.usd_sgd_rate;
    try {
      const freshRate = await fetchUsdSgdRate();
      usdSgdRate = freshRate;
      const updatedPortfolio: PortfolioYaml = {
        ...portfolio,
        usd_sgd_rate: freshRate,
        timestamp: new Date().toISOString(),
      };
      await savePortfolioYaml(updatedPortfolio);
    } catch (fxError) {
      console.error("[portfolio API] using cached USD/SGD rate from YAML due to fetch failure", fxError);
      if (usdSgdRate === undefined) {
        throw new Error("USD/SGD rate unavailable (API failed and no cached rate in YAML)");
      }
    }

    let usdCnyRate: number | undefined = portfolio.usd_cny_rate;
    try {
      const freshCnyRate = await fetchUsdCnyRate();
      usdCnyRate = freshCnyRate;
      const updatedPortfolio: PortfolioYaml = {
        ...portfolio,
        usd_cny_rate: freshCnyRate,
        timestamp: new Date().toISOString(),
      };
      await savePortfolioYaml(updatedPortfolio);
    } catch (fxError) {
      console.error("[portfolio API] using cached USD/CNY rate from YAML due to fetch failure", fxError);
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
    
    // Add BTC from .env
    const btcQty = Number(process.env.BTC);
    if (btcQty > 0) {
      cryptoSymbols.push("BTC-USDT");
    }
    
    // Add crypto from YAML (for backward compatibility)
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

    const response = buildResponse(portfolio, quotes, cryptoPrices, usdSgdRate, usdCnyRate);

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

