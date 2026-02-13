import type { PortfolioData, SummaryItem } from "@/types";
import {
  calculateTotalCost,
  calculateMarketValue,
  calculatePositionPercent,
  calculateTotalUnrealizedPnL,
  type AssetAllocation,
  type AssetBreakdown,
} from "@/lib/accountStats";

const roundTo2dp = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return Math.round(value * 100) / 100;
};

export function formatPortfolioExport(
  data: PortfolioData,
  assetAllocation: AssetAllocation[],
  assetBreakdown: AssetBreakdown,
  summaryItems: SummaryItem[],
  originalAmountUsd: number,
  currentBalanceUsd: number
): string {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];

  // Markdown-style headers and key-value for LLM parsing
  lines.push("# Portfolio Export");
  lines.push("");
  lines.push("## Meta");
  lines.push(`- generated_at: ${generatedAt}`);
  lines.push(`- usd_sgd_rate: ${data.usd_sgd_rate}`);
  lines.push(`- usd_cny_rate: ${data.usd_cny_rate}`);
  lines.push("");

  lines.push("## Account Summary");
  summaryItems.forEach((item) => {
    const part = item.percentDisplay ? `${item.display} (${item.percentDisplay})` : item.display;
    lines.push(`- ${item.label}: ${part}`);
  });
  lines.push(`- initial_balance_usd: ${originalAmountUsd}`);
  lines.push(`- current_balance_usd: ${currentBalanceUsd}`);
  lines.push("");

  const allocationData = assetAllocation
    .filter((asset) => asset.isVisible)
    .map((asset) => ({
      label: asset.label,
      marketValue: roundTo2dp(asset.marketValue),
      valueAllocationPercent: roundTo2dp(asset.valueAllocationPercent),
      unrealizedPnL: roundTo2dp(asset.unrealizedPnL),
      profitLossPercent: roundTo2dp(Math.abs(asset.profitLossPercent)),
    }));

  const totalUnrealizedPnL = calculateTotalUnrealizedPnL(assetBreakdown);

  const positionsData = data.positions
    .filter((pos) => !pos.isPlaceholder)
    .map((pos) => {
      let displaySymbol = pos.symbol;
      if (pos.is_option && pos.strike && pos.expiry) {
        const optionSymbol = `${(pos.right ?? "").toUpperCase()}-${pos.expiry.slice(2, 4)}'${pos.expiry.slice(4, 6)}'${pos.expiry.slice(6, 8)}-${pos.strike.toFixed(2)}`;
        displaySymbol = pos.underlyingKey ? `${optionSymbol} (${pos.underlyingKey})` : optionSymbol;
      }
      let positionType = "Stock";
      if (pos.is_option) positionType = "Option";
      else if (pos.is_crypto) positionType = "Crypto";
      else if (pos.secType === "ETF") positionType = "ETF";
      const totalCost = calculateTotalCost(pos);
      const marketValue = calculateMarketValue(pos);
      const positionPercent = calculatePositionPercent(pos, currentBalanceUsd);
      const positionObj: Record<string, unknown> = {
        symbol: pos.symbol,
        displaySymbol,
        type: positionType,
        qty: roundTo2dp(pos.qty),
        price: roundTo2dp(pos.price),
        cost: roundTo2dp(pos.cost),
        totalCost: roundTo2dp(totalCost),
        marketValue: roundTo2dp(marketValue),
        upnl: roundTo2dp(pos.upnl),
        upnlPercent: roundTo2dp(pos.percent_change),
        positionPercent: roundTo2dp(positionPercent),
      };
      if (pos.is_option) {
        positionObj.underlyingPrice = roundTo2dp(pos.underlyingPrice);
        positionObj.delta = roundTo2dp(pos.delta);
        positionObj.gamma = roundTo2dp(pos.gamma);
        positionObj.theta = roundTo2dp(pos.theta);
        positionObj.dte = roundTo2dp(pos.dteDays);
      }
      return positionObj;
    });

  lines.push("## Asset Allocation");
  allocationData.forEach((a) => {
    lines.push(`- ${a.label}: marketValue=${a.marketValue} allocation%=${a.valueAllocationPercent} upnl=${a.unrealizedPnL} pnl%=${a.profitLossPercent}`);
  });
  lines.push(`- total_market_value: ${roundTo2dp(assetBreakdown.totalMarketValue)}`);
  lines.push(`- total_unrealized_pnl: ${roundTo2dp(totalUnrealizedPnL)}`);
  lines.push("");

  const portfolioJson = {
    meta: {
      generated_at: generatedAt,
      usd_sgd_rate: data.usd_sgd_rate,
      usd_cny_rate: data.usd_cny_rate,
      initial_balance_usd: originalAmountUsd,
      current_balance_usd: currentBalanceUsd,
    },
    assetAllocation: {
      allocations: allocationData,
      summary: {
        totalMarketValue: roundTo2dp(assetBreakdown.totalMarketValue),
        totalUnrealizedPnL: roundTo2dp(totalUnrealizedPnL),
      },
    },
    positions: positionsData,
  };

  lines.push("## Data (JSON)");
  lines.push("```json");
  lines.push(JSON.stringify(portfolioJson, null, 2));
  lines.push("```");
  return lines.join("\n");
}
