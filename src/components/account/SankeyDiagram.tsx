"use client";

import { useCallback, useMemo } from "react";
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { SankeyChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { AssetAllocation, AssetBreakdown } from "@/hooks";
import type { PortfolioData, Position } from "@/types";
import { formatMoney } from "@/lib/format";
import { SEGMENT_COLORS } from "@/lib/accountStats";
import { calculateAccountStats } from "@/lib/accountStats";

// Register ECharts components
echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

interface SankeyDiagramProps {
  assetAllocation: AssetAllocation[];
  assetBreakdown: AssetBreakdown;
  portfolioData: PortfolioData;
  /** Optional: format USD value for display (e.g. with currency conversion) */
  formatValue?: (value: number) => string;
}

type EChartsNode = {
  name: string;
  depth: number;
  itemStyle: { color: string };
  label?: { position?: string };
};

type EChartsLink = {
  source: string;
  target: string;
  value: number;
  lineStyle?: { color?: string; opacity?: number };
};

// Get color for asset type
function getAssetColor(position: Position): string {
  if (position.is_crypto) return SEGMENT_COLORS.crypto;
  if (position.is_option) return SEGMENT_COLORS.option;
  if (position.secType === "ETF") return SEGMENT_COLORS.etf;
  return SEGMENT_COLORS.stock;
}

// Get asset class key
function getAssetClass(position: Position): string {
  if (position.is_crypto) return "crypto";
  if (position.is_option) return "option";
  if (position.secType === "ETF") return "etf";
  return "stock";
}

// Generate unique ID for position (handles multiple options with same symbol)
function getPositionId(position: Position): string {
  if (position.is_option && position.expiry) {
    // Use underlyingKey (simple symbol) for options, expiry format: YYYYMMDD
    const symbol = position.underlyingKey || position.symbol.slice(0, 4).replace(/\d/g, '');
    const mm = position.expiry.slice(4, 6);
    const dd = position.expiry.slice(6, 8);
    return `${symbol}-${mm}-${dd}`;
  }
  return position.symbol;
}

export function SankeyDiagram({
  assetAllocation,
  assetBreakdown,
  portfolioData,
  formatValue,
}: SankeyDiagramProps) {
  const fmt = useCallback((v: number) => (formatValue ? formatValue(v) : `$${formatMoney(v)}`), [formatValue]);
  const { nodes, links, displayGains, displayLosses } = useMemo(() => {
    // ========== 使用集中计算模块 ==========
    const stats = calculateAccountStats(portfolioData, assetBreakdown, assetAllocation);
    
    if (stats.totalMarketValue <= 0) {
      return { nodes: [], links: [], displayGains: 0, displayLosses: 0 };
    }

    // 解构所需数据
    const {
      positions,
      totalCashInput,
      ibkrCash,
      cashAccountUsd,
      cryptoCost,
      positionGains: totalGains,
      positionLosses: totalLosses,
      displayGains,
      displayLosses,
      visibleAssets,
      accountData,
      principalAccountData,
      totalRealizedPnL,
    } = stats;

    const totalCashFlow = totalCashInput;
    const nodes: EChartsNode[] = [];
    const links: EChartsLink[] = [];
    
    // ========== Column 0: Principal, rPnL ==========
    nodes.push({
      name: "Principal",
      depth: 0,
      itemStyle: { color: "#9ca3af" },
      label: { position: "left" },
    });
    if (totalRealizedPnL > 0.01) {
      nodes.push({
        name: "rPnL",
        depth: 0,
        itemStyle: { color: "#2e7d32" },
        label: { position: "left" },
      });
    }

    // ========== Column 1: Accounts (order: Cash, IBKR, Crypto) ==========
    accountData.forEach(acc => {
      nodes.push({
        name: acc.name,
        depth: 1,
        itemStyle: { color: acc.color },
        label: { position: "left" },
      });
    });

    // Column 2: Cash, visible assets, uProfit (rProfit not connected for now)
    [
      { name: "Cash", color: SEGMENT_COLORS.cash, condition: totalCashInput > 0 },
      ...visibleAssets.map(asset => ({ name: asset.label, color: asset.color, condition: true })),
      { name: "uProfit", color: "#2e7d32", condition: totalGains > 0.01 },
    ].forEach(({ name, color, condition }) => {
      if (condition) {
        nodes.push({
          name,
          depth: 2,
          itemStyle: { color },
        });
      }
    });
    
    // ========== Column 3: Positions ==========
    const assetClassOrder = visibleAssets.map(a => a.key);
    const sortedPositions = [...positions].sort((a, b) => {
      const classA = getAssetClass(a);
      const classB = getAssetClass(b);
      const orderA = assetClassOrder.indexOf(classA);
      const orderB = assetClassOrder.indexOf(classB);
      if (orderA !== orderB) return orderA - orderB;
      if (a.upnl >= 0 && b.upnl < 0) return -1;
      if (a.upnl < 0 && b.upnl >= 0) return 1;
      return (b.price * b.qty) - (a.price * a.qty);
    });
    
    const nonCryptoPositions = sortedPositions.filter(p => !p.is_crypto);
    const cryptoPositions = sortedPositions.filter(p => p.is_crypto);
    const orderedPositions = [...nonCryptoPositions, ...cryptoPositions];
    
    // Column 3 nodes: Positions and Cash3
    [
      ...orderedPositions.map(pos => ({ name: getPositionId(pos), color: getAssetColor(pos), condition: true })),
      { name: "Cash3", color: SEGMENT_COLORS.cash, condition: totalCashFlow > 0 },
    ].forEach(({ name, color, condition }) => {
      if (condition) {
        nodes.push({
          name,
          depth: 3,
          itemStyle: { color },
        });
      }
    });
    
    // ========== Column 4: Account (merge Value + Cash), uLoss ==========
    [
      { name: "Account", depth: 4, color: "#1976d2", condition: true },
      { name: "uLoss", depth: 4, color: "#c62828", condition: totalLosses > 0.01 },
    ].forEach(({ name, depth, color, condition }) => {
      if (condition) {
        nodes.push({
          name,
          depth,
          itemStyle: { color },
        });
      }
    });
    
    // ========== Links ==========
    
    // Principal → Accounts（使用从文件读取的 principal_sgd 转 USD 的分配，不用当前账户市值）
    (principalAccountData.length > 0 ? principalAccountData : accountData).forEach(acc => {
      links.push({
        source: "Principal",
        target: acc.name,
        value: acc.value,
        lineStyle: { color: acc.color, opacity: 0.4 },
      });
    });
    // rPnL → IBKR (realized PnL at layer 0, link to IBKR)
    if (totalRealizedPnL > 0.01 && accountData.some(a => a.name === "IBKR")) {
      links.push({
        source: "rPnL",
        target: "IBKR",
        value: totalRealizedPnL,
        lineStyle: { color: "#2e7d32", opacity: 0.4 },
      });
    }
    // IBKR → Asset classes and Cash
    const ibkrAcc = accountData.find(a => a.name === "IBKR");
    if (ibkrAcc) {
      ["stock", "option", "etf"].forEach(key => {
        const asset = visibleAssets.find(a => a.key === key);
        if (asset && asset.cost > 0) {
          links.push({
            source: "IBKR",
            target: asset.label,
            value: asset.cost,
            lineStyle: { color: asset.color, opacity: 0.4 },
          });
        }
      });
      
      if (ibkrCash > 0) {
        links.push({
          source: "IBKR",
          target: "Cash",
          value: ibkrCash,
          lineStyle: { color: SEGMENT_COLORS.cash, opacity: 0.4 },
        });
      }
    }
    
    // Additional account links: Crypto, Cash (rProfit not connected for now)
    const cryptoAsset = visibleAssets.find(a => a.key === "crypto");
    [
      { source: "Crypto Acct", target: cryptoAsset?.label || "", value: cryptoCost, color: SEGMENT_COLORS.crypto, condition: accountData.some(a => a.name === "Crypto Acct") && cryptoAsset },
      { source: "Cash Acct", target: "Cash", value: cashAccountUsd, color: SEGMENT_COLORS.cash, condition: accountData.some(a => a.name === "Cash Acct") && cashAccountUsd > 0 },
    ].forEach(({ source, target, value, color, condition }) => {
      if (condition) {
        links.push({
          source,
          target,
          value,
          lineStyle: { color, opacity: 0.4 },
        });
      }
    });
    
    // Asset classes → Positions (use cost for proper flow balance)
    // cost + upnl = marketValue, so:
    // - Asset sends cost to position
    // - uProfit sends upnl to position (for gainers)
    // - Position sends marketValue to Value + |upnl| to uLoss (for losers)
    visibleAssets.forEach(asset => {
      const assetPositions = orderedPositions.filter(pos => getAssetClass(pos) === asset.key);
      
      assetPositions.forEach(pos => {
        const id = getPositionId(pos);
        const cost = pos.cost * pos.qty;
        links.push({
          source: asset.label,
          target: id,
          value: cost,
          lineStyle: { color: asset.color, opacity: 0.4 },
        });
      });
    });
    
    // uProfit → Positions (with gains)
    if (totalGains > 0.01) {
      orderedPositions.forEach(pos => {
        if (pos.upnl > 0.01) {
          const id = getPositionId(pos);
          links.push({
            source: "uProfit",
            target: id,
            value: pos.upnl,
            lineStyle: { color: "#2e7d32", opacity: 0.4 },
          });
        }
      });
    }
    
    // Positions → Account (merged Value + Cash)
    orderedPositions.forEach(pos => {
      const id = getPositionId(pos);
      const marketValue = pos.price * pos.qty;
      if (marketValue > 0) {
        links.push({
          source: id,
          target: "Account",
          value: marketValue,
          lineStyle: { color: getAssetColor(pos), opacity: 0.4 },
        });
      }
    });
    
    // Positions → uLoss
    if (totalLosses > 0.01) {
      orderedPositions.forEach(pos => {
        if (pos.upnl < -0.01) {
          const id = getPositionId(pos);
          links.push({
            source: id,
            target: "uLoss",
            value: Math.abs(pos.upnl),
            lineStyle: { color: "#c62828", opacity: 0.4 },
          });
        }
      });
    }
    
    // Cash → Cash3 (totalCashInput when > 0); Cash3 → Account (totalCashFlow)
    if (totalCashFlow > 0) {
      if (totalCashInput > 0) {
        links.push({
          source: "Cash",
          target: "Cash3",
          value: totalCashInput,
          lineStyle: { color: SEGMENT_COLORS.cash, opacity: 0.4 },
        });
      }
      links.push({
        source: "Cash3",
        target: "Account",
        value: totalCashFlow,
        lineStyle: { color: SEGMENT_COLORS.cash, opacity: 0.4 },
      });
    }
    
    return { nodes, links, displayGains, displayLosses };
  }, [assetAllocation, assetBreakdown, portfolioData]);

  // Calculate node values and source totals for tooltip
  const { nodeValues, sourceNodeTotals } = useMemo(() => {
    const outgoing: Record<string, number> = {};
    const incoming: Record<string, number> = {};
    links.forEach(link => {
      outgoing[link.source] = (outgoing[link.source] || 0) + link.value;
      incoming[link.target] = (incoming[link.target] || 0) + link.value;
    });
    // Node value = max of incoming or outgoing
    const nodeValues: Record<string, number> = {};
    nodes.forEach(node => {
      nodeValues[node.name] = Math.max(outgoing[node.name] || 0, incoming[node.name] || 0);
    });
    // Override uProfit and uLoss with assetBreakdown-based values (consistent with SummaryTable)
    if (displayGains && displayGains > 0) nodeValues["uProfit"] = displayGains;
    if (displayLosses && displayLosses > 0) nodeValues["uLoss"] = displayLosses;
    return { nodeValues, sourceNodeTotals: outgoing };
  }, [links, nodes, displayGains, displayLosses]);

  const option = useMemo(() => ({
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      borderColor: "transparent",
      textStyle: { color: "#fff", fontSize: 12 },
      formatter: (params: { data: { source?: string; target?: string; value?: number; name?: string }; dataType: string }) => {
        if (params.dataType === "edge") {
          const { source, target, value } = params.data;
          const sourceTotal = sourceNodeTotals[source || ""] || 0;
          const percentage = sourceTotal > 0 ? ((value || 0) / sourceTotal * 100).toFixed(1) : "0";
          return `<strong>${source} → ${target}</strong><br/>${fmt(value || 0)} (${percentage}%)`;
        }
        const { name } = params.data;
        const nodeValue = nodeValues[name || ""] || 0;
        // Display "Cash3" and "Cash4" as "Cash" in tooltip
        const displayName = (name === "Cash3" || name === "Cash4") ? "Cash" : name;
        return `<strong>${displayName}</strong><br/>${fmt(nodeValue)}`;
      },
    },
    series: [
      {
        type: "sankey",
        layout: "none",
        layoutIterations: 1,
        nodeSort: null,
        nodeAlign: "left",
        emphasis: {
          focus: "adjacency",
        },
        nodeWidth: 12,
        nodeGap: 12,
        draggable: false,
        left: 100,
        right: 100,
        top: 20,
        bottom: 20,
        data: nodes,
        links: links,
        label: {
          show: true,
          position: "right",
          color: "#ffffff",
          fontSize: 11,
          fontWeight: 500,
          formatter: (params: { name: string }) => {
            // Display "Cash3" and "Cash4" as "Cash"
            if (params.name === "Cash3" || params.name === "Cash4") return "Cash";
            return params.name;
          },
        },
        lineStyle: {
          color: "source",
          curveness: 0.5,
        },
        itemStyle: {
          borderWidth: 0,
        },
      },
    ],
  }), [nodes, links, sourceNodeTotals, nodeValues, fmt]);

  if (nodes.length === 0) {
    return (
      <div style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 16,
        color: "#666666",
      }}>
        No portfolio data available
      </div>
    );
  }

  return (
    <div 
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge={true}
      />
    </div>
  );
}
