import { NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { load } from "js-yaml";
import type { RawPosition, PortfolioYaml, Quote, Position, ChartSegment, PortfolioData } from "@/types/portfolio";

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

function buildResponse(portfolio: PortfolioYaml, quotes: Map<string, Quote>, usdSgdRate: number): PortfolioData {
  const positionsOutput: Position[] = [];
  let totalStockMV = 0;
  let totalOptionMV = 0;
  let totalUpnl = 0;
  let totalTheta = 0;

  const optionPositions: RawPosition[] = [];
  const stockPositions: RawPosition[] = [];

  for (const pos of portfolio.positions) {
    if (pos.secType === "OPT") {
      optionPositions.push(pos);
    } else {
      stockPositions.push(pos);
    }
  }

  optionPositions.sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));

  const orderedPositions = [...stockPositions, ...optionPositions];

  const stockSymbols = new Set(stockPositions.map((pos) => pos.symbol));
  const placeholderAdded = new Set<string>();

  for (const rawPos of orderedPositions) {
    if (rawPos.secType === "OPT" && !stockSymbols.has(rawPos.symbol) && !placeholderAdded.has(rawPos.symbol)) {
      const underlyingQuote = quotes.get(rawPos.symbol);
      const underlyingBid = asNumber(underlyingQuote?.bid);
      const underlyingAsk = asNumber(underlyingQuote?.ask);
      const underlyingMid = (underlyingBid + underlyingAsk) / 2 || 0;

      positionsOutput.push({
        symbol: rawPos.symbol,
        secType: "STK",
        qty: 0,
        cost: 0,
        price: underlyingMid,
        underlyingPrice: underlyingMid,
        upnl: 0,
        is_option: false,
        isPlaceholder: true,
        delta: 0,
        gamma: 0,
        theta: 0,
        percent_change: 0,
        dteDays: undefined,
      });

      placeholderAdded.add(rawPos.symbol);
    }

    const qty = asNumber(rawPos.position);
    const cost = asNumber(rawPos.avgCost);

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
      // For stocks, delta = quantity (stocks have delta of 1 per share)
      delta = qty;
    }

    const marketValue = price * qty;
    if (rawPos.secType === "OPT") {
      totalOptionMV += marketValue;
    } else {
      totalStockMV += marketValue;
    }
    totalUpnl += upnl;

    positionsOutput.push({
      symbol: rawPos.symbol,
      secType: rawPos.secType,
      qty,
      cost,
      price,
      underlyingPrice: rawPos.secType === "OPT" ? underlyingMid : price,
      upnl,
      is_option: rawPos.secType === "OPT",
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

  const netLiquidation = portfolio.cash + totalStockMV + totalOptionMV;
  const utilization = netLiquidation !== 0 ? (netLiquidation - portfolio.cash) / netLiquidation : 0;

  const chartSegments: ChartSegment[] = [];
  const radius = 80;
  const circumference = netLiquidation > 0 ? 2 * Math.PI * radius : 0;
  if (netLiquidation > 0) {
    const segmentsData: Array<{ name: "cash" | "stock" | "option"; value: number; color: string }> = [
      { name: "cash", value: portfolio.cash, color: "#d4d4d4" },
      { name: "stock", value: totalStockMV, color: "#a3a3a3" },
      { name: "option", value: totalOptionMV, color: "#737373" },
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
  const originalAmountUsd = originalAmountSgd / usdSgdRate;
  const accountPnl = netLiquidation - originalAmountUsd;
  const accountPnlPercent = originalAmountUsd !== 0 ? (accountPnl / originalAmountUsd) * 100 : 0;

  return {
    cash: portfolio.cash,
    net_liquidation: netLiquidation,
    total_stock_mv: totalStockMV,
    total_option_mv: totalOptionMV,
    total_upnl: totalUpnl,
    total_theta: totalTheta,
    utilization,
    positions: positionsOutput,
    chart_segments: chartSegments,
    circumference,
    account_pnl: accountPnl,
    account_pnl_percent: accountPnlPercent,
    usd_sgd_rate: usdSgdRate,
    original_amount_sgd: originalAmountSgd,
    original_amount_usd: originalAmountUsd,
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

    const [quotes, usdSgdRate] = await Promise.all([fetchQuotes(symbols), fetchUsdSgdRate()]);
    const response = buildResponse(portfolio, quotes, usdSgdRate);

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

