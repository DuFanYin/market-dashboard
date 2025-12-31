import { useMemo } from "react";
import type { PortfolioData, SummaryItem } from "@/types/portfolio";
import { formatMoney, formatPercent } from "@/lib/format";
import { buildChartFromLegendData } from "@/lib/chartCalculations";
import { SEGMENT_COLORS } from "@/lib/portfolioConfig";

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

export const usePortfolioCalculations = (data: PortfolioData | null, applyMask: (value: string) => string) => {
  const assetBreakdown = useMemo<AssetBreakdown>(() => {
    if (!data) {
      return {
        cash: 0,
        stockCost: 0,
        optionCost: 0,
        cryptoCost: 0,
        etfCost: 0,
        totalCost: 0,
        stockMarketValue: 0,
        optionMarketValue: 0,
        cryptoMarketValue: 0,
        etfMarketValue: 0,
        totalMarketValue: 0,
        stockUnrealizedPnL: 0,
        optionUnrealizedPnL: 0,
        cryptoUnrealizedPnL: 0,
        etfUnrealizedPnL: 0,
      };
    }
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
  }, [data]);

  const assetAllocation = useMemo<AssetAllocation[]>(() => {
    if (!data) return [];
    
    const allocation: AssetAllocation[] = [
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
        isVisible: true, // Always show ETF row even if no positions
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
        isVisible: true, // Always show Crypto row even if no positions
        isCash: false,
      },
    ];
    
    return allocation;
  }, [assetBreakdown, data]);

  const summaryItems = useMemo<SummaryItem[]>(() => {
    if (!data) return [];

    return [
      {
        label: "Account PnL",
        display: applyMask(formatMoney(data.account_pnl)),
        isUpnl: true as const,
        numericValue: data.account_pnl,
        percentDisplay: formatPercent(data.account_pnl_percent),
        percentValue: data.account_pnl_percent,
      },
      { label: "Total Theta", display: applyMask(`${formatMoney(data.total_theta)}`) },
      { label: "Utilization", display: formatPercent(data.utilization * 100) },
    ];
  }, [data, applyMask]);

  const marketValueChart = useMemo(() => {
    if (!data || assetAllocation.length === 0) {
      return { segments: [], circumference: 0, total: 0, separators: [] };
    }
    return buildChartFromLegendData(assetAllocation, assetBreakdown);
  }, [data, assetAllocation, assetBreakdown]);

  return {
    assetBreakdown,
    summaryItems,
    assetAllocation,
    marketValueChart,
  };
};

