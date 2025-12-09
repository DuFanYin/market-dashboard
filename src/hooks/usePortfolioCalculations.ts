import { useMemo } from "react";
import type { PortfolioData, SummaryItem } from "@/types/portfolio";
import { formatMoney, formatPercent } from "@/lib/format";
import { buildChartFromLegendData } from "@/lib/chartCalculations";
import { SEGMENT_COLORS } from "@/lib/portfolioConfig";

export type AssetBreakdown = {
  cash: number;
  stockCost: number;
  optionCost: number;
  totalCost: number;
  stockMarketValue: number;
  optionMarketValue: number;
  totalMarketValue: number;
  stockUnrealizedPnL: number;
  optionUnrealizedPnL: number;
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
        totalCost: 0,
        stockMarketValue: 0,
        optionMarketValue: 0,
        totalMarketValue: 0,
        stockUnrealizedPnL: 0,
        optionUnrealizedPnL: 0,
      };
    }
    const cash = data.cash;
    let stockCost = 0,
      optionCost = 0,
      stockMarketValue = 0,
      optionMarketValue = 0,
      stockUnrealizedPnL = 0,
      optionUnrealizedPnL = 0;
    
    for (const position of data.positions) {
      if (position.is_option) {
        optionCost += position.cost * position.qty;
        optionMarketValue += position.price * position.qty;
        optionUnrealizedPnL += position.upnl;
      } else {
        stockCost += position.cost * position.qty;
        stockMarketValue += position.price * position.qty;
        stockUnrealizedPnL += position.upnl;
      }
    }
    
    const totalCost = cash + stockCost + optionCost;
    const totalMarketValue = cash + stockMarketValue + optionMarketValue;
    
    return {
      cash,
      stockCost,
      optionCost,
      totalCost,
      stockMarketValue,
      optionMarketValue,
      totalMarketValue,
      stockUnrealizedPnL,
      optionUnrealizedPnL,
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

