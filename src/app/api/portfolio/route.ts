import { NextResponse } from "next/server";
import type { Quote } from "@/types";
import { getOkxPrices } from "@/lib/data";
import {
  loadPortfolioJson,
  savePortfolioJson,
  appendHistoryIfNewMinute,
  updateAccountInfoWithMdd,
  type AccountData,
} from "@/lib/storage";
import { toOccSymbol, buildPortfolioData } from "@/lib/accountStats";

const tradierBaseUrl = (process.env.TRADIER_BASE_URL ?? "https://api.tradier.com/v1/").replace(/\/+$/, "") + "/";

export const dynamic = "force-dynamic";

function ensureArray<T>(item: T | T[] | undefined): T[] {
  if (item === undefined) return [];
  return Array.isArray(item) ? item : [item];
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

export async function GET(request: Request) {
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
    portfolio = await loadPortfolioJson();

    // 是否由前端“刷新组件”显式要求持久化（例如 /api/portfolio?persist=1）
    const url = new URL(request.url);
    const shouldPersist = url.searchParams.get("persist") === "1";

    // 所有基于 JSON + 市场数据的派生计算集中在 accountStats.buildPortfolioData
    const rawResponse = buildPortfolioData(portfolio, quotes, cryptoPrices, usdSgdRate, usdCnyRate);
    let response = rawResponse;

    if (shouldPersist) {
      // 持久化相关的 max/min/MDD 更新集中在 storage.updateAccountInfoWithMdd
      const updated = await updateAccountInfoWithMdd(portfolio, rawResponse);
      portfolio = updated.portfolio;
      response = updated.response;

      // 只有在显式 persist 时才追加历史点
      try {
        const appended = await appendHistoryIfNewMinute(response);
        if (appended) {
          console.log("[portfolio API] Appended new history data point");
        }
      } catch (historyError) {
        // Log error but don't fail the request
        console.error("[portfolio API] Failed to append history:", historyError);
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

