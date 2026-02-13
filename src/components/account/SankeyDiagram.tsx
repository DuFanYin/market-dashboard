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
import { calculateAccountStats } from "@/lib/accountStats";

// Register ECharts components
echarts.use([SankeyChart, TooltipComponent, CanvasRenderer]);

// Sankey-specific color scheme for better visual distinction
const SANKEY_COLORS = {
  // Layer 0: Source (neutral / structural)
  principal: "#4b5563",      // Slate gray
  // rProfit uses the same vivid green as uProfit so PnL is visually unified
  rpnl: "#16a34a",           // Strong green
  
  // Layer 1: Accounts
  // Keep the entire cash path (Cash Acct → Cash → Cash3 → Account) visually consistent and clearly visible
  cashAcct: "#f97316",       // Orange (matches cash path)
  ibkr: "#2563eb",           // Medium blue
  cryptoAcct: "#7c3aed",     // Purple
  
  // Layer 2: Asset Classes & Cash Flow
  cash: "#f97316",           // Orange for all cash flows
  stock: "#2563eb",          // Stock: blue
  option: "#ec4899",         // Option: pink/magenta (distinct from yellow)
  etf: "#0ea5e9",            // ETF: cyan
  crypto: "#7c3aed",         // Crypto: purple
  // Profit (unrealized PnL) — same green as rPnL for strong, consistent signal
  uprofit: "#16a34a",
  
  // Layer 4: Destination
  account: "#1d4ed8",        // Darker royal blue
  uloss: "#dc2626",          // Strong red
} as const;

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

// Get color for asset type (using Sankey color scheme)
function getAssetColor(position: Position): string {
  if (position.is_crypto) return SANKEY_COLORS.crypto;
  if (position.is_option) return SANKEY_COLORS.option;
  if (position.secType === "ETF") return SANKEY_COLORS.etf;
  return SANKEY_COLORS.stock;
}

// Get asset class key
function getAssetClass(position: Position): string {
  if (position.is_crypto) return "crypto";
  if (position.is_option) return "option";
  if (position.secType === "ETF") return "etf";
  return "stock";
}

// Internal unique key for a position node (no collisions)
function getPositionNodeKey(position: Position): string {
  if (position.is_option) {
    const symbol = position.underlyingKey || position.symbol;
    const expiry = position.expiry ?? "";
    const strike = position.strike ?? "";
    return `${symbol}-Opt-${expiry}-${strike}`;
  }
  return position.symbol;
}

// Human‑friendly display name for a node
function getDisplayName(name: string): string {
  // Normalize internal cash helper nodes
  if (name === "Cash3" || name === "Cash4") return "Cash";
  // Collapse option keys like "NVDA-Opt-20260320-200" → "NVDA-Opt"
  const optIndex = name.indexOf("-Opt-");
  if (optIndex !== -1) {
    return `${name.slice(0, optIndex)}-Opt`;
  }
  return name;
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
      cryptoCashUsd,
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
    
    // ========== Column 0: Principal, rProfit / rLoss（正向在左，亏损在右） ==========
    nodes.push({
      name: "Principal",
      depth: 0,
      itemStyle: { color: SANKEY_COLORS.principal },
      label: { position: "left" },
    });
    if (totalRealizedPnL > 0.01) {
      // 盈利：rProfit 在左侧流入 IBKR（绿色）
      nodes.push({
        name: "rProfit",
        depth: 0,
        itemStyle: { color: SANKEY_COLORS.rpnl },
        label: { position: "left" },
      });
    } else if (totalRealizedPnL < -0.01) {
      // 亏损：rLoss 在 IBKR 右侧流出（红色）
      nodes.push({
        name: "rLoss",
        depth: 2,
        itemStyle: { color: SANKEY_COLORS.uloss },
        label: { position: "right" },
      });
    }

    // ========== Column 1: Accounts (order: Cash, IBKR, Crypto) ==========
    const accountColorMap: Record<string, string> = {
      "Cash Acct": SANKEY_COLORS.cashAcct,
      "IBKR": SANKEY_COLORS.ibkr,
      "Crypto Acct": SANKEY_COLORS.cryptoAcct,
    };
    accountData.forEach(acc => {
      nodes.push({
        name: acc.name,
        depth: 1,
        itemStyle: { color: accountColorMap[acc.name] || acc.color },
        label: { position: "left" },
      });
    });

    // Column 2: Cash, visible assets, uProfit (rProfit not connected for now)
    const assetClassColorMap: Record<string, string> = {
      "Cash": SANKEY_COLORS.cash,
      "Stock": SANKEY_COLORS.stock,
      "Option": SANKEY_COLORS.option,
      "ETF": SANKEY_COLORS.etf,
      "Crypto": SANKEY_COLORS.crypto,
    };
    [
      { name: "Cash", color: SANKEY_COLORS.cash, condition: totalCashInput > 0 },
      ...visibleAssets.map(asset => ({ 
        name: asset.label, 
        color: assetClassColorMap[asset.label] || asset.color, 
        condition: true 
      })),
      { name: "uProfit", color: SANKEY_COLORS.uprofit, condition: totalGains > 0.01 },
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
      ...orderedPositions.map(pos => ({ name: getPositionNodeKey(pos), color: getAssetColor(pos), condition: true })),
      { name: "Cash3", color: SANKEY_COLORS.cash, condition: totalCashFlow > 0 },
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
      { name: "Account", depth: 4, color: SANKEY_COLORS.account, condition: true },
      { name: "uLoss", depth: 4, color: SANKEY_COLORS.uloss, condition: totalLosses > 0.01 },
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
      const linkColor = accountColorMap[acc.name] || acc.color;
      links.push({
        source: "Principal",
        target: acc.name,
        value: acc.value,
        lineStyle: { color: linkColor, opacity: 0.5 },
      });
    });
    // 实现盈亏与 IBKR 的关系：
    // - 盈利：rProfit → IBKR（绿色增强 IBKR 流入）
    // - 亏损：IBKR → rLoss（红色从 IBKR 流出）
    const hasIbkrAccount = accountData.some(a => a.name === "IBKR");
    if (hasIbkrAccount && Math.abs(totalRealizedPnL) > 0.01) {
      if (totalRealizedPnL > 0) {
        links.push({
          source: "rProfit",
          target: "IBKR",
          value: totalRealizedPnL,
          lineStyle: { color: SANKEY_COLORS.rpnl, opacity: 0.7 },
        });
      } else {
        links.push({
          source: "IBKR",
          target: "rLoss",
          value: Math.abs(totalRealizedPnL),
          lineStyle: { color: SANKEY_COLORS.uloss, opacity: 0.7 },
        });
      }
    }
    // IBKR → Asset classes and Cash
    const ibkrAcc = accountData.find(a => a.name === "IBKR");
    if (ibkrAcc) {
      ["stock", "option", "etf"].forEach(key => {
        const asset = visibleAssets.find(a => a.key === key);
        if (asset && asset.cost > 0) {
          const linkColor = assetClassColorMap[asset.label] || asset.color;
          links.push({
            source: "IBKR",
            target: asset.label,
            value: asset.cost,
            lineStyle: { color: linkColor, opacity: 0.5 },
          });
        }
      });
      
      if (ibkrCash > 0) {
        links.push({
          source: "IBKR",
          target: "Cash",
          value: ibkrCash,
          lineStyle: { color: SANKEY_COLORS.cash, opacity: 0.5 },
        });
      }
    }
    
    // Additional account links: Crypto → Crypto asset, Crypto → Cash, Cash Acct → Cash (rProfit not connected for now)
    const cryptoAsset = visibleAssets.find(a => a.key === "crypto");
    [
      { source: "Crypto Acct", target: cryptoAsset?.label || "", value: cryptoCost, color: SANKEY_COLORS.crypto, condition: accountData.some(a => a.name === "Crypto Acct") && cryptoAsset && cryptoCost > 0.01 },
      { source: "Crypto Acct", target: "Cash", value: cryptoCashUsd, color: SANKEY_COLORS.cash, condition: accountData.some(a => a.name === "Crypto Acct") && cryptoCashUsd > 0.01 },
      { source: "Cash Acct", target: "Cash", value: cashAccountUsd, color: SANKEY_COLORS.cash, condition: accountData.some(a => a.name === "Cash Acct") && cashAccountUsd > 0.01 },
    ].forEach(({ source, target, value, color, condition }) => {
      if (condition) {
        links.push({
          source,
          target,
          value,
          lineStyle: { color, opacity: 0.5 },
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
      const linkColor = assetClassColorMap[asset.label] || asset.color;
      
      assetPositions.forEach(pos => {
        const id = getPositionNodeKey(pos);
        const cost = pos.cost * pos.qty;
        links.push({
          source: asset.label,
          target: id,
          value: cost,
          lineStyle: { color: linkColor, opacity: 0.5 },
        });
      });
    });
    
    // uProfit → Positions (with gains)
    if (totalGains > 0.01) {
      orderedPositions.forEach(pos => {
        if (pos.upnl > 0.01) {
          const id = getPositionNodeKey(pos);
          links.push({
            source: "uProfit",
            target: id,
            value: pos.upnl,
            // Unrealized profit uses same strong green as rPnL
            lineStyle: { color: SANKEY_COLORS.uprofit, opacity: 0.7 },
          });
        }
      });
    }
    
    // Positions → Account (merged Value + Cash)
    orderedPositions.forEach(pos => {
      const id = getPositionNodeKey(pos);
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
          const id = getPositionNodeKey(pos);
          links.push({
            source: id,
            target: "uLoss",
            value: Math.abs(pos.upnl),
            // Loss flows use vivid red and high opacity
            lineStyle: { color: SANKEY_COLORS.uloss, opacity: 0.7 },
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
          lineStyle: { color: SANKEY_COLORS.cash, opacity: 0.5 },
        });
      }
      links.push({
        source: "Cash3",
        target: "Account",
        value: totalCashFlow,
        lineStyle: { color: SANKEY_COLORS.cash, opacity: 0.5 },
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
          const srcName = source ? getDisplayName(source) : "";
          const tgtName = target ? getDisplayName(target) : "";
          const percentage = sourceTotal > 0 ? ((value || 0) / sourceTotal * 100).toFixed(1) : "0";
          return `<strong>${srcName} → ${tgtName}</strong><br/>${fmt(value || 0)} (${percentage}%)`;
        }
        const { name } = params.data;
        const nodeValue = nodeValues[name || ""] || 0;
        const displayName = getDisplayName(name || "");
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
          formatter: (params: { name: string }) => getDisplayName(params.name),
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
