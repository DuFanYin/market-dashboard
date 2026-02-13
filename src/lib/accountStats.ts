/**
 * Account Statistics Calculation Module
 * 
 * 介于 API 和展示模块之间，负责所有账户相关计算
 * Centralized calculations for account statistics, sitting between API and display components
 * 
 * 包含以下计算:
 * - Position 级别计算 (成本、市值、百分比)
 * - Asset 级别计算 (资产分解、盈亏)
 * - Account 级别计算 (账户盈亏、年化收益)
 * - Chart 计算 (图表数据构建)
 * - 配置常量 (图表尺寸、颜色)
 */

import type { PortfolioData, Position, ChartSegment } from "@/types";

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

/**
 * 从文件读取的本金 (principal_sgd → principal_usd) 按账户分配，用于 Sankey Principal → Accounts 流量。
 * IBKR 使用文件中的 IBKR_principal_SGD 转 USD；其余 (principal_usd - ibkr_principal_usd) 按 Cash:Crypto 当前比例分配。
 */
export function buildPrincipalAccountData(
  principalUsd: number,
  ibkrPrincipalUsd: number,
  cashAccountUsd: number,
  cryptoCost: number
): AccountDataItem[] {
  if (principalUsd <= 0) return [];
  const ibkrPrincipal = Math.min(ibkrPrincipalUsd, principalUsd);
  const remainder = principalUsd - ibkrPrincipal;
  const nonIbkrTotal = cashAccountUsd + cryptoCost;
  const cashPrincipal = nonIbkrTotal > 0 ? remainder * (cashAccountUsd / nonIbkrTotal) : remainder;
  const cryptoPrincipal = nonIbkrTotal > 0 ? remainder * (cryptoCost / nonIbkrTotal) : 0;
  return [
    { name: "Cash Acct", value: cashPrincipal, color: SEGMENT_COLORS.cash },
    { name: "IBKR", value: ibkrPrincipal, color: "#4a90d9" },
    { name: "Crypto Acct", value: cryptoPrincipal, color: SEGMENT_COLORS.crypto },
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
  // Principal: from API only (read from history file in SGD, converted to USD by API). No calculation/fallback from totalCost or totalMarketValue.
  const principal = portfolioData.principal_usd ?? portfolioData.original_amount_usd ?? 0;
  
  // 现金相关
  const ibkrCash = portfolioData.ibkr_cash || 0;
  const cashAccountUsd = portfolioData.cash_account_usd || 0;
  const totalCashInput = ibkrCash + cashAccountUsd;
  
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
  const totalUnrealisedPnL = positions.reduce((sum, pos) => sum + pos.upnl, 0);
  const totalRealizedPnL = Math.max(0, totalAccountPnL - totalUnrealisedPnL);
  const hasProfit = totalRealizedPnL > 0.01;
  
  // 账户数据 (当前值)
  const accountData = buildAccountData(cashAccountUsd, ibkrTotalValue, cryptoCost);
  // 本金按账户分配 (从文件 principal_sgd → principal_usd)，用于 Sankey Principal → Accounts
  const principalUsd = portfolioData.principal_usd ?? portfolioData.original_amount_usd ?? 0;
  const ibkrPrincipalUsd = portfolioData.ibkr_principal_usd ?? 0;
  const principalAccountData = buildPrincipalAccountData(principalUsd, ibkrPrincipalUsd, cashAccountUsd, cryptoCost);
  
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
