type Json = unknown;

const REQUEST_TIMEOUT_MS = 10000;

function round2(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

async function getJson(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Json | { error: string } | { blocked: true }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Force server-side fetch
      cache: "no-store",
    });
    if (res.status === 418) {
      return { blocked: true };
    }
    if (!res.ok) {
      return { error: `${res.status} ${res.statusText}` };
    }
    return res.json();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown" };
  } finally {
    clearTimeout(timeout);
  }
}

// ========= 1. CNN Market Index =========
type CnnApiRow = {
  name: string;
  current_price: number | string;
  prev_close_price: number | string;
  price_change_from_prev_close: number | string;
  percent_change_from_prev_close: number | string;
};
const HEADERS_CNN: HeadersInit = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://edition.cnn.com/",
  "Accept-Language": "en-US,en;q=0.9",
};

export type CnnIndexRow = {
  name: string;
  current: number;
  prev: number;
  change: number;
  pct: number;
};

export async function getCnnMarketIndexes(): Promise<{ success: boolean; data: CnnIndexRow[] | null }> {
  console.log(`[CNN] Fetching market indexes...`);
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const url = `https://production.dataviz.cnn.io/markets/index/DJII-USA,SP500-CME,COMP-USA/${dateStr}`;
  const j = await getJson(url, { headers: HEADERS_CNN });
  if (!j || typeof j !== "object" || (Array.isArray(j) && j.length === 0)) {
    console.warn(`[CNN] Indexes unavailable (empty).`);
    return { success: false, data: null };
  }
  if ((j as Record<string, unknown>).hasOwnProperty("blocked") || (j as Record<string, unknown>).hasOwnProperty("error")) {
    console.error(`[CNN] Indexes blocked or errored.`);
    return { success: false, data: null };
  }
  const arr = j as CnnApiRow[];
  const data: CnnIndexRow[] = arr.map((x) => ({
    name: x.name,
    current: round2(x.current_price),
    prev: round2(x.prev_close_price),
    change: round2(x.price_change_from_prev_close),
    pct: round2(Number(x.percent_change_from_prev_close) * 100),
  }));
  console.log(`[CNN] Indexes fetched (${data.length}).`);
  return { success: true, data };
}

// ========= 2. CNN Fear & Greed =========
type FearGreedApiSeries = { score?: number | null; rating?: string | null; data?: Array<{ y?: number | null } | null> | null } | null;
type FearGreedApi = {
  fear_and_greed?: {
    score?: number | null;
    rating?: string | null;
    previous_close?: number | null;
    previous_1_week?: number | null;
    previous_1_month?: number | null;
    previous_1_year?: number | null;
  } | null;
  put_call_options?: FearGreedApiSeries;
  market_volatility_vix?: FearGreedApiSeries;
  market_volatility_vix_50?: FearGreedApiSeries;
} | null;
export type FearGreedDetail = { score: number | null; rating: string | null; value: number | null } | null;
export type FearGreedResponse = {
  success: boolean;
  summary?: {
    score: number | null;
    rating: string | null;
    prev: number | null;
    w1: number | null;
    m1: number | null;
    y1: number | null;
  };
  details?: Record<string, FearGreedDetail>;
};

export async function getCnnFearGreed(): Promise<FearGreedResponse> {
  console.log(`[CNN] Fetching Fear & Greed...`);
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const url = `https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${dateStr}`;
  const j = await getJson(url, { headers: HEADERS_CNN });
  if (!j || typeof j !== "object" || (j as Record<string, unknown>).hasOwnProperty("blocked") || (j as Record<string, unknown>).hasOwnProperty("error")) {
    console.warn(`[CNN] Fear & Greed unavailable.`);
    return { success: false };
  }
  const obj = j as FearGreedApi;
  const fg = obj?.fear_and_greed ?? {};
  const keys = [
    "put_call_options",
    "market_volatility_vix",
    "market_volatility_vix_50",
    // Additional components (see backup reference)
    "market_momentum_sp500",
    "market_momentum_sp125",
    "stock_price_strength",
    "stock_price_breadth",
    "junk_bond_demand",
    "safe_haven_demand",
  ];
  const details: Record<string, FearGreedDetail> = {};
  for (const k of keys) {
    const item = (obj as NonNullable<FearGreedApi>)?.[k as keyof NonNullable<FearGreedApi>] as FearGreedApiSeries;
    if (!item) {
      details[k] = null;
    } else {
      details[k] = {
        score: item?.score == null ? null : round2(item.score),
        rating: item?.rating ?? null,
        value: item?.data?.[0]?.y == null ? null : round2(item.data?.[0]?.y ?? null),
      };
    }
  }
  console.log(`[CNN] Fear & Greed fetched (score=${fg?.score ?? "-"}).`);
  return {
    success: true,
    summary: {
      score: fg.score == null ? null : round2(fg.score),
      rating: fg.rating ?? null,
      prev: fg.previous_close == null ? null : round2(fg.previous_close),
      w1: fg.previous_1_week == null ? null : round2(fg.previous_1_week),
      m1: fg.previous_1_month == null ? null : round2(fg.previous_1_month),
      y1: fg.previous_1_year == null ? null : round2(fg.previous_1_year),
    },
    details,
  };
}

// ========= 3. OKX Prices =========
const OKX_TICKER_URL = "https://www.okx.com/api/v5/market/index-tickers";
const OKX_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Origin: "https://www.tradingdigits.io",
  Referer: "https://www.tradingdigits.io/",
};

export type OkxRow = { inst: string; success: boolean; price?: number; open?: number; change?: number; pct?: number };

type OkxTickerResponse = { data?: Array<{ idxPx?: number | string; sodUtc0?: number | string }>; };

export async function getOkxPrices(symbols: string[] = ["BTC-USDT", "ETH-USDT"]): Promise<OkxRow[]> {
  console.log(`[OKX] Fetching ${symbols.length} index tickers...`);
  const rows = await Promise.all(
    symbols.map(async (inst) => {
      const url = `${OKX_TICKER_URL}?instId=${encodeURIComponent(inst)}`;
      const j = (await getJson(url, { headers: OKX_HEADERS })) as OkxTickerResponse | { error: string } | { blocked: true } | null;
      if (!j || typeof j !== "object" || !("data" in j) || !j.data?.length) {
        return { inst, success: false } as OkxRow;
      }
      const d = j.data[0] ?? {};
      const price = round2(d.idxPx ?? NaN);
      const openUtc = round2(d.sodUtc0 ?? NaN);
      const change = round2(price - openUtc);
      const pct = round2((change / openUtc) * 100);
      return { inst, success: true, price, open: openUtc, change, pct } as OkxRow;
    })
  );
  // Ensure stable ordering according to input symbols
  const order: Record<string, number> = Object.fromEntries(symbols.map((s, i) => [s, i]));
  rows.sort((a, b) => (order[a.inst] ?? 0) - (order[b.inst] ?? 0));
  const okCount = rows.filter((r) => r.success).length;
  console.log(`[OKX] Tickers fetched (${okCount}/${rows.length} ok).`);
  return rows;
}

// ========= 4. AHR999 =========
const OKX_CANDLES = "https://www.okx.com/api/v5/market/candles";

export type Ahr999 = {
  success: boolean;
  px?: number;
  px_dt?: string; // ISO
  sma200?: number;
  valuation?: number;
  ahr?: number;
  zone?: string;
  error?: string;
};

export async function getAhr999(): Promise<Ahr999> {
  console.log(`[AHR999] Computing from OKX history and ticker...`);
  // history
  const candlesUrl = `${OKX_CANDLES}?instId=BTC-USDT&bar=1D&limit=400`;
  type OkxCandlesResponse = { data?: Array<[string | number, unknown, unknown, unknown, string | number]> };
  const candles = (await getJson(candlesUrl)) as OkxCandlesResponse | { error: string } | { blocked: true } | null;
  if (!candles || typeof candles !== "object" || !("data" in candles)) {
    console.error(`[AHR999] No candles returned.`);
    return { success: false, error: "no candles" };
  }
  const rows: Array<[Date, number, number]> = [];
  for (const arr of (candles.data ?? [])) {
    const tsMs = Number(arr?.[0]);
    const close = Number(arr?.[4]);
    const dUtc = new Date(tsMs);
    rows.push([dUtc, close, tsMs]);
  }
  rows.sort((a, b) => a[2] - b[2]);
  const todayUtc = new Date();
  const trimmed = rows.filter((r) => r[0] < todayUtc);
  if (trimmed.length < 200) return { success: false, error: "not enough days" };
  const closes = trimmed.map((r) => r[1]);
  const last200 = closes.slice(-200);
  const sma200 = last200.reduce((a, b) => a + b, 0) / last200.length;

  // current price
  const tickUrl = `${OKX_TICKER_URL}?instId=BTC-USDT`;
  const tick = (await getJson(tickUrl)) as { data?: Array<{ idxPx?: number | string; ts?: number | string }> } | { error: string } | { blocked: true } | null;
  if (!tick || typeof tick !== "object" || !("data" in tick) || !tick.data?.length) {
    console.error(`[AHR999] No price returned.`);
    return { success: false, error: "no price" };
  }
  const px = Number(tick.data[0]?.idxPx);
  const tsMs = Number(tick.data[0]?.ts);
  const pxDt = new Date(tsMs).toISOString();

  // AHR999
  const genesis = new Date(Date.UTC(2009, 0, 3)).getTime();
  const ageDays = (Date.now() - genesis) / 86400_000;
  const valuation = Math.pow(10, 5.84 * Math.log10(ageDays) - 17.01);
  const ahr = (px / sma200) * (px / valuation);
  let zone: string;
  if (ahr < 0.45) zone = "green";
  else if (ahr < 1.2) zone = "yellow";
  else zone = "red";

  console.log(`[AHR999] Done. ahr=${ahr.toFixed(2)} zone=${zone}`);
  return {
    success: true,
    px: round2(px),
    px_dt: pxDt,
    sma200: round2(sma200),
    valuation: round2(valuation),
    ahr: round2(ahr),
    zone,
  };
}

export function fmt2(x: unknown): string {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(2) : String(x);
}

export function fmt(x: unknown): string {
  const n = Number(x);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(x);
}

// ──────────────────────────────────────────────────────────────────────────
// Gold Price (goldprice.org - Spot XAU/USD)
// ──────────────────────────────────────────────────────────────────────────
export async function getGoldPrice() {
  const url = "https://data-asg.goldprice.org/dbXRates/USD";
  const headers = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json,text/plain,*/*",
  };

  try {
    const res = await fetch(url, { headers, next: { revalidate: 60 } });
    if (!res.ok) {
      return { success: false, inst: "XAU/USD", reason: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) {
      return { success: false, inst: "XAU/USD", reason: "No data" };
    }

    const price = Number(item.xauPrice);
    const prev = Number(item.xauClose);
    const change = Number(item.chgXau);
    const pct = Number(item.pcXau);

    return {
      success: true,
      inst: "XAU/USD",
      price: round2(price),
      open: round2(prev), // goldprice feed provides prev close; treat as open baseline
      high: undefined,
      low: undefined,
      prev: round2(prev),
      change: round2(change),
      pct: round2(pct),
    };
  } catch (err: unknown) {
    return {
      success: false,
      inst: "XAU/USD",
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}


