import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { promises as fs } from "node:fs";
import { load } from "js-yaml";

const yamlPath = path.join(process.cwd(), "data", "positions.yaml");
const tradierBaseUrl = (process.env.TRADIER_BASE_URL ?? "https://api.tradier.com/v1/").replace(/\/+$/, "") + "/";
const portfolioPassword = process.env.PORTFOLIO_PASSWORD;

type RawPosition = {
  symbol: string;
  secType: "STK" | "OPT";
  position: number;
  avgCost: number;
  right?: "C" | "P";
  strike?: number;
  expiry?: string;
};

type PortfolioYaml = {
  timestamp: string;
  cash: number;
  positions: RawPosition[];
};

type Quote = {
  symbol: string;
  bid?: number;
  ask?: number;
  greeks?: {
    delta?: number;
    gamma?: number;
    theta?: number;
  };
};

type PositionOutput = {
  symbol: string;
  secType: "STK" | "OPT";
  qty: number;
  cost: number;
  price: number;
  upnl: number;
  is_option: boolean;
  delta: number;
  gamma: number;
  theta: number;
  percent_change: number;
  right?: "C" | "P";
  strike?: number;
  expiry?: string;
};

type ChartSegment = {
  name: string;
  pct: number;
  color: string;
  arc: number;
  offset: number;
  value: number;
};

type PortfolioResponse = {
  cash: number;
  net_liquidation: number;
  total_stock_mv: number;
  total_option_mv: number;
  total_upnl: number;
  total_theta: number;
  utilization: number;
  positions: PositionOutput[];
  chart_segments: ChartSegment[];
  circumference: number;
};

export const dynamic = "force-dynamic";

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": "Basic realm=\"Portfolio\"" },
  });
}

function parseAuthorizationHeader(header: string | null): string | null {
  if (!header || !header.startsWith("Basic ")) {
    return null;
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }
  return decoded.slice(separatorIndex + 1);
}

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

function asNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function ensureArray<T>(item: T | T[] | undefined): T[] {
  if (item === undefined) return [];
  return Array.isArray(item) ? item : [item];
}

async function loadPortfolioYaml(): Promise<PortfolioYaml> {
  const raw = await fs.readFile(yamlPath, "utf8");
  const parsed = load(raw) as PortfolioYaml;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Failed to parse portfolio YAML file.");
  }
  return parsed;
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

function buildResponse(portfolio: PortfolioYaml, quotes: Map<string, Quote>): PortfolioResponse {
  const positionsOutput: PositionOutput[] = [];
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

  for (const rawPos of orderedPositions) {
    const qty = asNumber(rawPos.position);
    const cost = asNumber(rawPos.avgCost);

    const symbolKey = rawPos.secType === "OPT" ? toOccSymbol(rawPos) : rawPos.symbol;
    const quote = symbolKey ? quotes.get(symbolKey) : undefined;
    const bid = asNumber(quote?.bid);
    const ask = asNumber(quote?.ask);
    const midPrice = (bid + ask) / 2 || 0;
    const price = rawPos.secType === "OPT" ? midPrice * 100 : midPrice;

    const upnl = (price - cost) * qty;

    let delta = 0;
    let gamma = 0;
    let theta = 0;
    if (rawPos.secType === "OPT") {
      delta = convertGreek(quote?.greeks?.delta, qty);
      gamma = convertGreek(quote?.greeks?.gamma, qty);
      theta = convertGreek(quote?.greeks?.theta, qty);
      totalTheta += theta;
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
      upnl,
      is_option: rawPos.secType === "OPT",
      delta,
      gamma,
      theta,
      percent_change: percentChange(price, cost),
      right: rawPos.right,
      strike: rawPos.strike,
      expiry: rawPos.expiry,
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
  };
}

export async function GET(req: NextRequest) {
  if (!portfolioPassword) {
    return NextResponse.json(
      { error: "PORTFOLIO_PASSWORD not configured" },
      { status: 500 }
    );
  }

  if (!process.env.TRADIER_TOKEN) {
    return NextResponse.json(
      { error: "TRADIER_TOKEN not configured" },
      { status: 500 }
    );
  }

  const providedPassword = parseAuthorizationHeader(req.headers.get("authorization"));
  if (providedPassword === null || providedPassword !== portfolioPassword) {
    return unauthorizedResponse();
  }

  try {
    const portfolio = await loadPortfolioYaml();
    const symbols = portfolio.positions
      .map((pos) => (pos.secType === "OPT" ? toOccSymbol(pos) : pos.symbol))
      .filter((s): s is string => Boolean(s));

    const quotes = await fetchQuotes(symbols);
    const response = buildResponse(portfolio, quotes);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[portfolio API] error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

