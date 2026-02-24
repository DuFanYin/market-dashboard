/**
 * Account Statistics Calculation Module
 *
 * 介于 API 和展示模块之间，负责所有账户相关计算
 * Centralized calculations for account statistics, sitting between API and display components
 *
 * 包含以下计算:
 * - 从原始 JSON + 市场数据构建 PortfolioData
 * - Position 级别计算 (成本、市值、百分比)
 * - Asset 级别计算 (资产分解、盈亏)
 * - Account 级别计算 (账户盈亏、年化收益)
 * - Chart 计算 (图表数据构建)
 * - 配置常量 (图表尺寸、颜色)
 */

import type { PortfolioData, Position, ChartSegment, RawPosition, Quote } from "@/types";
import type { AccountData } from "@/lib/storage";

// ========== Types (类型定义) ==========

export type AssetBreakdown = {
  cash: number;
  stockCost: number;
  optionCost: number;
  cryptoCost: number;
  etfCost: number;
  totalCost: number;
  stockMarketValue: number;
  optionMarketValue: number;
  cryptoMarketValue: number;
  etfMarketValue: number;
  totalMarketValue: number;
  stockUnrealizedPnL: number;
  optionUnrealizedPnL: number;
  cryptoUnrealizedPnL: number;
  etfUnrealizedPnL: number;
};

export type AssetAllocation = {
  key: string;
  label: string;
  color: string;
  cost: number;
  costAllocationPercent: number;
  unrealizedPnL: number;
  profitLossPercent: number;
  marketValue: number;
  valueAllocationPercent: number;
  isVisible: boolean;
  isCash: boolean;
};

// ========== Config Constants (配置常量) ==========

export const CHART_RADIUS = 65;
export const CHART_STROKE_WIDTH = 35;

export const SEGMENT_COLORS = {
  cash: "#d4d4d4",
  stock: "#a3a3a3",
  option: "#737373",
  crypto: "#525252",
  etf: "#404040",
} as const;

export const SEGMENT_COLORS_DARK = {
  cash: "#ffffff",
  stock: "#d4d4d4",
  option: "#a3a3a3",
  crypto: "#737373",
  etf: "#525252",
} as const;

// ========== Types ==========

export interface AccountStats {
  // 基础数据
  positions: Position[];
  cash: number;
  totalMarketValue: number;
  totalCost: number;
  principal: number;
  
  // 现金相关
  ibkrCash: number;
  cashAccountUsd: number;
  totalCashInput: number;
  cryptoCashUsd: number;
  
  // 成本计算
  cryptoCost: number;
  ibkrAssetsCost: number;
  ibkrTotalValue: number;
  
  // Position级别盈亏 (用于Sankey流向平衡)
  positionGains: number;      // 所有正upnl头寸的总和
  positionLosses: number;     // 所有负upnl头寸的绝对值总和
  
  // AssetBreakdown级别盈亏 (用于显示，与SummaryTable一致)
  displayGains: number;       // 所有正资产类别未实现盈亏的总和
  displayLosses: number;      // 所有负资产类别未实现盈亏的绝对值总和
  
  // 账户盈亏
  totalAccountPnL: number;
  totalUnrealisedPnL: number;
  totalRealizedPnL: number;
  hasProfit: boolean;
  
  // 资产配置
  visibleAssets: AssetAllocation[];
  assetMarketValue: number;   // 不含现金的市值
  
  // 账户数据 (当前市值/成本，用于节点颜色等)
  accountData: AccountDataItem[];
  /** 从文件读取的本金按账户分配 (Principal → Accounts 流量)，总和 = principal_usd */
  principalAccountData: AccountDataItem[];
}

export interface AccountDataItem {
  name: string;
  value: number;
  color: string;
}

export interface ChartData {
  segments: ChartSegment[];
  circumference: number;
  total: number;
  separators: number[];
}

// ========== Portfolio Construction (从原始 JSON + 市场数据构建 PortfolioData) ==========

/**
 * OCC 期权代码转换 (用于 Tradier 等 API)
 */
export function toOccSymbol(pos: RawPosition): string | null {
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

// Hardcoded ETF symbols (treat as ETF even if marked as STK in JSON)
const ETF_SYMBOLS = ["GLDM"];

/**
 * 从原始账户 JSON + 市场数据构建完整 PortfolioData
 * 纯计算，无网络/IO，供 API route 调用
 */
export function buildPortfolioData(
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
  let cryptoCashUsd = 0;

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

  // Calculate BTC_account cash balance in USD (convert SGD to USD)
  if (portfolio.BTC_account) {
    const btcCashSgd = portfolio.BTC_account.cash_balance_SGD ?? 0;
    if (btcCashSgd > 0 && usdSgdRate > 0) {
      cryptoCashUsd += btcCashSgd / usdSgdRate;
    }
  }

  // Total cash = IBKR cash + cash account + crypto cash
  const cash = ibkrCash + cashAccountUsd + cryptoCashUsd;

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

  // Principal (original investment amount) — from portfolio config only; no overwriting from other sources
  const principalSgd =
    portfolio.original_amount_sgd ?? portfolio.account_info?.principal_SGD ?? 0;
  const principalUsd =
    portfolio.original_amount_usd ??
    (principalSgd && usdSgdRate ? principalSgd / usdSgdRate : 0);

  const ibkrPrincipalSgd = portfolio.account_info?.IBKR_principal_SGD ?? 0;
  const ibkrPrincipalUsd = ibkrPrincipalSgd && usdSgdRate ? ibkrPrincipalSgd / usdSgdRate : 0;

  // Cash & Crypto principal (in SGD) derived directly from JSON config:
  // - Cash principal = cash_account.SGD_cash
  // - Crypto principal = BTC_account.cost_sgd + BTC_account.cash_balance_SGD
  const cashPrincipalSgd = portfolio.cash_account?.SGD_cash ?? 0;
  const cryptoPrincipalSgd =
    (portfolio.BTC_account?.cost_sgd ?? 0) + (portfolio.BTC_account?.cash_balance_SGD ?? 0);
  const cashPrincipalUsd = cashPrincipalSgd && usdSgdRate ? cashPrincipalSgd / usdSgdRate : 0;
  const cryptoPrincipalUsd = cryptoPrincipalSgd && usdSgdRate ? cryptoPrincipalSgd / usdSgdRate : 0;

  const originalAmountSgd = portfolio.original_amount_sgd ?? 0;
  const originalAmountUsd = portfolio.original_amount_usd ?? (principalSgd && usdSgdRate ? principalSgd / usdSgdRate : 0);
  const yearBeginBalanceSgd = portfolio.account_info?.principal_SGD ?? principalSgd;
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
    principal_sgd: principalSgd,
    principal_usd: principalUsd,
    ibkr_principal_usd: ibkrPrincipalUsd,
    cash_principal_usd: cashPrincipalUsd,
    crypto_principal_usd: cryptoPrincipalUsd,
    original_amount_sgd_raw: originalAmountSgd,
    crypto_cash_usd: cryptoCashUsd,
    max_value_USD: maxValue,
    min_value_USD: minValue,
    max_drawdown_percent: maxDrawdownPercent,
  };
}

/**
 * 计算基于最新 PortfolioData 的账户 max/min/MDD 更新结果。
 * 纯计算，不做持久化，由 storage.updateAccountInfoWithMdd 调用。
 */
export function computeUpdatedAccountInfoWithMdd(
  portfolio: AccountData,
  response: PortfolioData
): { accountInfo: AccountData["account_info"]; response: PortfolioData } | null {
  const currentNetLiquidation = response.net_liquidation;
  const roundedNetLiquidation = Math.round(currentNetLiquidation * 100) / 100;

  const currentAccountInfo = portfolio.account_info || {};

  const currentMaxValue =
    currentAccountInfo.max_value_USD !== undefined
      ? Math.round((currentAccountInfo.max_value_USD ?? 0) * 100) / 100
      : 0;
  const currentMinValue =
    currentAccountInfo.min_value_USD !== undefined
      ? Math.round((currentAccountInfo.min_value_USD ?? 0) * 100) / 100
      : 0;

  let updatedMaxValue = currentMaxValue;
  let updatedMinValue = currentMinValue;
  const currentMaxDrawdown = currentAccountInfo.max_drawdown_percent ?? 0;
  let updatedMaxDrawdown = currentMaxDrawdown;
  let shouldUpdateAccountInfo = false;

  // Update max_value if current value is greater (new peak reached)
  if (roundedNetLiquidation > currentMaxValue || currentMaxValue === 0) {
    updatedMaxValue = roundedNetLiquidation;
    // When a new peak is reached, reset min_value to the new peak
    updatedMinValue = roundedNetLiquidation;
    shouldUpdateAccountInfo = true;
  } else if (currentMinValue === 0 || roundedNetLiquidation < currentMinValue) {
    // Only update min_value if we haven't reached a new peak
    updatedMinValue = roundedNetLiquidation;
    shouldUpdateAccountInfo = true;
  }

  // Calculate current drawdown from the peak
  const currentDrawdown =
    updatedMaxValue > 0 ? ((updatedMinValue - updatedMaxValue) / updatedMaxValue) * 100 : 0;

  // Update historical max drawdown if current drawdown is worse (more negative)
  if (currentDrawdown < updatedMaxDrawdown) {
    updatedMaxDrawdown = currentDrawdown;
    shouldUpdateAccountInfo = true;
  }

  const roundedMaxValue = Math.round(updatedMaxValue * 100) / 100;
  const roundedMinValue = Math.round(updatedMinValue * 100) / 100;
  const roundedMaxDrawdown = Math.round(updatedMaxDrawdown * 100) / 100;

  // Check if rounding changed the values (to handle existing non-2dp values)
  if (
    roundedMaxValue !== updatedMaxValue ||
    roundedMinValue !== updatedMinValue ||
    roundedMaxDrawdown !== updatedMaxDrawdown
  ) {
    shouldUpdateAccountInfo = true;
  }

  if (!shouldUpdateAccountInfo) {
    return null;
  }

  const accountInfo: AccountData["account_info"] = {
    ...currentAccountInfo,
    max_value_USD: roundedMaxValue,
    min_value_USD: roundedMinValue,
    max_drawdown_percent: roundedMaxDrawdown,
  };

  const nextResponse: PortfolioData = {
    ...response,
    max_value_USD: roundedMaxValue,
    min_value_USD: roundedMinValue,
    max_drawdown_percent: roundedMaxDrawdown,
  };

  return { accountInfo, response: nextResponse };
}

// ========== Position Level Calculations (头寸级别计算) ==========

/**
 * 计算头寸总成本
 */
export function calculateTotalCost(position: Position): number {
  return position.cost * position.qty;
}

/**
 * 计算头寸市值
 */
export function calculateMarketValue(position: Position): number {
  return position.price * position.qty;
}

/**
 * 计算头寸占总投资组合的百分比
 */
export function calculatePositionPercent(
  position: Position,
  totalBalance: number
): number {
  if (totalBalance <= 0) return 0;
  const marketValue = calculateMarketValue(position);
  return (marketValue / totalBalance) * 100;
}

/**
 * 计算 Position 级别的盈亏
 * 用于 Sankey 图的流向平衡
 */
export function calculatePositionLevelPnL(positions: Position[]): { gains: number; losses: number } {
  let gains = 0;
  let losses = 0;
  
  positions.forEach(pos => {
    if (pos.upnl > 0) gains += pos.upnl;
    else if (pos.upnl < 0) losses += Math.abs(pos.upnl);
  });
  
  return { gains, losses };
}

/**
 * 计算 Crypto 成本
 */
export function calculateCryptoCost(positions: Position[]): number {
  let cost = 0;
  positions.forEach(pos => {
    if (pos.is_crypto) {
      cost += pos.cost * pos.qty;
    }
  });
  return cost;
}

// ========== Asset Level Calculations (资产级别计算) ==========

/**
 * 计算总未实现盈亏 (从 AssetBreakdown)
 */
export function calculateTotalUnrealizedPnL(assetBreakdown: {
  stockUnrealizedPnL: number;
  optionUnrealizedPnL: number;
  cryptoUnrealizedPnL: number;
  etfUnrealizedPnL: number;
}): number {
  return (
    assetBreakdown.stockUnrealizedPnL +
    assetBreakdown.optionUnrealizedPnL +
    assetBreakdown.cryptoUnrealizedPnL +
    assetBreakdown.etfUnrealizedPnL
  );
}

/**
 * 计算 AssetBreakdown 级别的盈亏 (分离盈利和亏损)
 * 用于显示，与 SummaryTable 一致
 */
export function calculateAssetBreakdownPnL(assetBreakdown: AssetBreakdown): { gains: number; losses: number } {
  let gains = 0;
  let losses = 0;
  
  [
    assetBreakdown.stockUnrealizedPnL,
    assetBreakdown.optionUnrealizedPnL,
    assetBreakdown.cryptoUnrealizedPnL,
    assetBreakdown.etfUnrealizedPnL,
  ].forEach(upnl => {
    if (upnl > 0) gains += upnl;
    else if (upnl < 0) losses += Math.abs(upnl);
  });
  
  return { gains, losses };
}

/**
 * 计算资产分解 (从 PortfolioData)
 * 集中计算各资产类别的成本、市值和未实现盈亏
 */
export function calculateAssetBreakdown(data: PortfolioData): AssetBreakdown {
  const cash = data.cash;
  let stockCost = 0,
    optionCost = 0,
    cryptoCost = 0,
    etfCost = 0,
    stockMarketValue = 0,
    optionMarketValue = 0,
    cryptoMarketValue = 0,
    etfMarketValue = 0,
    stockUnrealizedPnL = 0,
    optionUnrealizedPnL = 0,
    cryptoUnrealizedPnL = 0,
    etfUnrealizedPnL = 0;
  
  for (const position of data.positions) {
    if (position.is_crypto) {
      cryptoCost += position.cost * position.qty;
      cryptoMarketValue += position.price * position.qty;
      cryptoUnrealizedPnL += position.upnl;
    } else if (position.is_option) {
      optionCost += position.cost * position.qty;
      optionMarketValue += position.price * position.qty;
      optionUnrealizedPnL += position.upnl;
    } else if (position.secType === "ETF") {
      etfCost += position.cost * position.qty;
      etfMarketValue += position.price * position.qty;
      etfUnrealizedPnL += position.upnl;
    } else {
      stockCost += position.cost * position.qty;
      stockMarketValue += position.price * position.qty;
      stockUnrealizedPnL += position.upnl;
    }
  }
  
  const totalCost = cash + stockCost + optionCost + cryptoCost + etfCost;
  const totalMarketValue = cash + stockMarketValue + optionMarketValue + cryptoMarketValue + etfMarketValue;
  
  return {
    cash,
    stockCost,
    optionCost,
    cryptoCost,
    etfCost,
    totalCost,
    stockMarketValue,
    optionMarketValue,
    cryptoMarketValue,
    etfMarketValue,
    totalMarketValue,
    stockUnrealizedPnL,
    optionUnrealizedPnL,
    cryptoUnrealizedPnL,
    etfUnrealizedPnL,
  };
}

/**
 * 构建资产配置数组 (从 AssetBreakdown)
 */
export function buildAssetAllocation(assetBreakdown: AssetBreakdown): AssetAllocation[] {
  return [
    {
      key: "cash",
      label: "Cash",
      color: SEGMENT_COLORS.cash,
      cost: assetBreakdown.cash,
      costAllocationPercent: assetBreakdown.totalCost > 0 ? (assetBreakdown.cash / assetBreakdown.totalCost) * 100 : 0,
      unrealizedPnL: 0,
      profitLossPercent: 0,
      marketValue: assetBreakdown.cash,
      valueAllocationPercent: assetBreakdown.totalMarketValue > 0 ? (assetBreakdown.cash / assetBreakdown.totalMarketValue) * 100 : 0,
      isVisible: assetBreakdown.cash > 0,
      isCash: true,
    },
    {
      key: "stock",
      label: "Stock",
      color: SEGMENT_COLORS.stock,
      cost: assetBreakdown.stockCost,
      costAllocationPercent: assetBreakdown.totalCost > 0 ? (assetBreakdown.stockCost / assetBreakdown.totalCost) * 100 : 0,
      unrealizedPnL: assetBreakdown.stockUnrealizedPnL,
      profitLossPercent: assetBreakdown.stockCost > 0 ? (assetBreakdown.stockUnrealizedPnL / assetBreakdown.stockCost) * 100 : 0,
      marketValue: assetBreakdown.stockMarketValue,
      valueAllocationPercent: assetBreakdown.totalMarketValue > 0 ? (assetBreakdown.stockMarketValue / assetBreakdown.totalMarketValue) * 100 : 0,
      isVisible: assetBreakdown.stockCost > 0,
      isCash: false,
    },
    {
      key: "option",
      label: "Option",
      color: SEGMENT_COLORS.option,
      cost: assetBreakdown.optionCost,
      costAllocationPercent: assetBreakdown.totalCost > 0 ? (assetBreakdown.optionCost / assetBreakdown.totalCost) * 100 : 0,
      unrealizedPnL: assetBreakdown.optionUnrealizedPnL,
      profitLossPercent: assetBreakdown.optionCost > 0 ? (assetBreakdown.optionUnrealizedPnL / assetBreakdown.optionCost) * 100 : 0,
      marketValue: assetBreakdown.optionMarketValue,
      valueAllocationPercent: assetBreakdown.totalMarketValue > 0 ? (assetBreakdown.optionMarketValue / assetBreakdown.totalMarketValue) * 100 : 0,
      isVisible: assetBreakdown.optionCost > 0,
      isCash: false,
    },
    {
      key: "etf",
      label: "ETF",
      color: SEGMENT_COLORS.etf,
      cost: assetBreakdown.etfCost,
      costAllocationPercent: assetBreakdown.totalCost > 0 ? (assetBreakdown.etfCost / assetBreakdown.totalCost) * 100 : 0,
      unrealizedPnL: assetBreakdown.etfUnrealizedPnL,
      profitLossPercent: assetBreakdown.etfCost > 0 ? (assetBreakdown.etfUnrealizedPnL / assetBreakdown.etfCost) * 100 : 0,
      marketValue: assetBreakdown.etfMarketValue,
      valueAllocationPercent: assetBreakdown.totalMarketValue > 0 ? (assetBreakdown.etfMarketValue / assetBreakdown.totalMarketValue) * 100 : 0,
      isVisible: true,
      isCash: false,
    },
    {
      key: "crypto",
      label: "Crypto",
      color: SEGMENT_COLORS.crypto,
      cost: assetBreakdown.cryptoCost,
      costAllocationPercent: assetBreakdown.totalCost > 0 ? (assetBreakdown.cryptoCost / assetBreakdown.totalCost) * 100 : 0,
      unrealizedPnL: assetBreakdown.cryptoUnrealizedPnL,
      profitLossPercent: assetBreakdown.cryptoCost > 0 ? (assetBreakdown.cryptoUnrealizedPnL / assetBreakdown.cryptoCost) * 100 : 0,
      marketValue: assetBreakdown.cryptoMarketValue,
      valueAllocationPercent: assetBreakdown.totalMarketValue > 0 ? (assetBreakdown.cryptoMarketValue / assetBreakdown.totalMarketValue) * 100 : 0,
      isVisible: true,
      isCash: false,
    },
  ];
}

/**
 * 计算总盈亏百分比
 */
export function calculateTotalPnLPercent(
  totalPnL: number,
  totalCost: number
): number {
  if (totalCost <= 0) return 0;
  return (totalPnL / totalCost) * 100;
}

/**
 * 获取可见资产列表（排序后）
 */
export function getVisibleAssets(assetAllocation: AssetAllocation[]): AssetAllocation[] {
  const assetOrder = ["stock", "option", "etf", "crypto"];
  return assetAllocation
    .filter(a => a.isVisible && a.marketValue > 0 && a.key !== "cash")
    .sort((a, b) => assetOrder.indexOf(a.key) - assetOrder.indexOf(b.key));
}

/**
 * 计算 IBKR 资产成本
 */
export function calculateIbkrAssetsCost(visibleAssets: AssetAllocation[]): number {
  return ["stock", "option", "etf"].reduce((sum, key) => {
    const asset = visibleAssets.find(a => a.key === key);
    return sum + (asset?.cost || 0);
  }, 0);
}

// ========== Account Level Calculations (账户级别计算) ==========

/**
 * 计算账户盈亏 (当前余额 - 原始金额)
 */
export function calculateAccountPnL(
  currentBalance: number,
  originalAmount: number
): number {
  return currentBalance - originalAmount;
}

/**
 * 计算账户盈亏百分比
 */
export function calculateAccountPnLPercent(
  accountPnL: number,
  originalAmount: number
): number {
  if (originalAmount <= 0) return 0;
  return (accountPnL / originalAmount) * 100;
}

/**
 * 计算年化收益率
 */
export function calculateAnnualizedReturn(
  currentBalance: number,
  originalAmount: number,
  daysDiff: number
): number {
  if (daysDiff <= 0 || originalAmount <= 0) return 0;
  return (Math.pow(currentBalance / originalAmount, 365 / daysDiff) - 1) * 100;
}

/**
 * 构建账户数据列表 (当前市值/成本)
 */
export function buildAccountData(
  cashAccountUsd: number,
  ibkrTotalValue: number,
  cryptoCost: number
): AccountDataItem[] {
  return [
    { name: "Cash Acct", value: cashAccountUsd, color: SEGMENT_COLORS.cash },
    { name: "IBKR", value: ibkrTotalValue, color: "#4a90d9" },
    { name: "Crypto Acct", value: cryptoCost, color: SEGMENT_COLORS.crypto },
  ].filter(a => a.value > 0);
}

// ========== Chart Calculations (图表计算) ==========

/**
 * 从百分比数据构建图表段
 */
function buildSegmentsFromPercent(
  segmentsData: Array<{ name: string; value: number; color: string; percent: number }>,
  circumference: number
): ChartSegment[] {
  const segments: ChartSegment[] = [];
  let offset = 0;
  
  for (const seg of segmentsData) {
    if (seg.percent <= 0) continue;
    const arc = (seg.percent / 100) * circumference;
    segments.push({ 
      name: seg.name, 
      value: seg.value, 
      pct: seg.percent, 
      color: seg.color, 
      arc, 
      offset 
    });
    offset += arc;
  }
  
  // 调整最后一个段以填满圆周
  if (segments.length > 0) {
    const totalArc = segments.reduce((sum, s) => sum + s.arc, 0);
    const remaining = circumference - totalArc;
    if (remaining > 0 && remaining < 1) {
      segments[segments.length - 1].arc += remaining;
    }
  }
  
  return segments;
}

/**
 * 计算图表分隔线位置
 */
export function calculateSeparators(segments: ChartSegment[]): number[] {
  const separators: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) separators.push(segments[i].offset);
    separators.push(segments[i].offset + segments[i].arc);
  }
  return separators;
}

/**
 * 从资产配置数据构建图表
 */
export function buildChartFromLegendData(
  assetAllocation: AssetAllocation[],
  assetBreakdown: AssetBreakdown
): ChartData {
  const visibleAssets = assetAllocation.filter((asset) => asset.isVisible);
  if (visibleAssets.length === 0) {
    return { segments: [], circumference: 0, total: 0, separators: [] };
  }

  const total = assetBreakdown.totalMarketValue;
  const circumference = total > 0 ? 2 * Math.PI * CHART_RADIUS : 0;
  
  if (total === 0) {
    return { segments: [], circumference, total: 0, separators: [] };
  }

  const segmentsData = visibleAssets.map((asset) => ({
    name: asset.key === "cash" ? "cash" : 
          asset.key === "stock" ? "stock_cost" : 
          asset.key === "option" ? "option_cost" : 
          asset.key === "crypto" ? "crypto_cost" : "etf_cost",
    value: asset.marketValue,
    color: asset.color,
    percent: asset.valueAllocationPercent,
  }));
  
  // 反转段顺序用于图表显示 (图例表格保持原始顺序)
  const reversedSegmentsData = [...segmentsData].reverse();
  const segments = buildSegmentsFromPercent(reversedSegmentsData, circumference);
  
  return { 
    segments, 
    circumference, 
    total, 
    separators: calculateSeparators(segments) 
  };
}

// ========== Main Calculation Function (主计算函数) ==========

/**
 * 计算所有账户统计数据
 * 
 * @param portfolioData - 原始投资组合数据
 * @param assetBreakdown - 资产分解数据
 * @param assetAllocation - 资产配置数据
 * @returns AccountStats - 所有计算结果
 */
export function calculateAccountStats(
  portfolioData: PortfolioData,
  assetBreakdown: AssetBreakdown,
  assetAllocation: AssetAllocation[]
): AccountStats {
  const positions = portfolioData.positions || [];
  
  // 基础数据
  const cash = assetBreakdown.cash;
  const totalMarketValue = assetBreakdown.totalMarketValue;
  const totalCost = assetBreakdown.totalCost;
  // Principal: 从 API 的账户数据而来（history 文件 + 汇率转换已在 API 内完成）
  // 这里保持与 API 当前逻辑一致，如果缺少 principal_usd，则退回到 original_amount_usd
  const principal = portfolioData.principal_usd ?? portfolioData.original_amount_usd ?? 0;
  
  // 现金相关
  const ibkrCash = portfolioData.ibkr_cash || 0;
  const cashAccountUsd = portfolioData.cash_account_usd || 0;
  const cryptoCashUsd = portfolioData.crypto_cash_usd || 0;
  // All external cash sources that eventually flow through the Cash path
  const totalCashInput = ibkrCash + cashAccountUsd + cryptoCashUsd;
  
  // 成本计算
  const cryptoCost = calculateCryptoCost(positions);
  
  // 资产配置
  const visibleAssets = getVisibleAssets(assetAllocation);
  const ibkrAssetsCost = calculateIbkrAssetsCost(visibleAssets);
  const ibkrTotalValue = ibkrAssetsCost + ibkrCash;
  
  // Position 级别盈亏
  const positionPnL = calculatePositionLevelPnL(positions);
  
  // AssetBreakdown 级别盈亏
  const displayPnL = calculateAssetBreakdownPnL(assetBreakdown);
  
  // 账户盈亏
  const totalAccountPnL = totalMarketValue - principal;
  // 未实现盈亏直接复用 PortfolioData 中的聚合结果，避免再次遍历 positions
  const totalUnrealisedPnL = portfolioData.total_upnl;
  // Realized PnL (signed): accountPnL - unrealizedPnL
  // Positive => realized profit (rProfit), Negative => realized loss (rLoss)
  // NOTE: Previously this was clamped to >= 0, which prevented rLoss from ever rendering.
  const totalRealizedPnL = totalAccountPnL - totalUnrealisedPnL;
  const hasProfit = totalRealizedPnL > 0.01;
  
  // 账户数据 (当前值)
  const accountData = buildAccountData(cashAccountUsd, ibkrTotalValue, cryptoCost + cryptoCashUsd);
  // 本金按账户分配 (从文件 principal_sgd → principal_usd)，用于 Sankey Principal → Accounts
  const principalAccountData: AccountDataItem[] = [
    {
      name: "Cash Acct",
      value: portfolioData.cash_principal_usd ?? 0,
      color: SEGMENT_COLORS.cash,
    },
    {
      name: "IBKR",
      value: portfolioData.ibkr_principal_usd ?? 0,
      color: "#4a90d9",
    },
    {
      name: "Crypto Acct",
      value: portfolioData.crypto_principal_usd ?? 0,
      color: SEGMENT_COLORS.crypto,
    },
  ].filter(a => a.value > 0);
  
  // 不含现金的市值
  const assetMarketValue = totalMarketValue - cash;
  
  return {
    positions,
    cash,
    totalMarketValue,
    totalCost,
    principal,
    ibkrCash,
    cashAccountUsd,
    totalCashInput,
    cryptoCashUsd,
    cryptoCost,
    ibkrAssetsCost,
    ibkrTotalValue,
    positionGains: positionPnL.gains,
    positionLosses: positionPnL.losses,
    displayGains: displayPnL.gains,
    displayLosses: displayPnL.losses,
    totalAccountPnL,
    totalUnrealisedPnL,
    totalRealizedPnL,
    hasProfit,
    visibleAssets,
    assetMarketValue,
    accountData,
    principalAccountData,
  };
}
