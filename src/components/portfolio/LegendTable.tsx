import { formatMoney, formatPercent } from "@/lib/format";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import styles from "@/app/portfolio/page.module.css";

interface LegendTableProps {
  assetAllocation: AssetAllocation[];
  assetBreakdown: AssetBreakdown;
  applyMask: (value: string) => string;
}

export function LegendTable({ assetAllocation, assetBreakdown, applyMask }: LegendTableProps) {
  const totalPnL = assetBreakdown.stockUnrealizedPnL + assetBreakdown.optionUnrealizedPnL;
  const totalPnLPercent = assetBreakdown.totalCost > 0 ? (totalPnL / assetBreakdown.totalCost) * 100 : 0;

  return (
    <div className={styles.legendSection}>
      <div className={styles.legendTableWrapper}>
        <table className={styles.chartLegend}>
        <thead>
          <tr>
            <th className={styles.legendColorCell}></th>
            <th className={styles.legendLabel}>Label</th>
            <th className={styles.legendAmount}>Cost</th>
            <th className={styles.legendPercent}>Cost %</th>
            <th className={styles.legendAmount}>uPnL</th>
            <th className={styles.legendPercent}>uPnL %</th>
            <th className={styles.legendAmount}>Value uPnl</th>
            <th className={styles.legendAmount}>Market Value</th>
            <th className={styles.legendPercent}>Value %</th>
          </tr>
        </thead>
        <tbody>
          {assetAllocation
            .filter((asset) => asset.isVisible)
            .map((asset) => (
              <tr key={asset.key} className={styles.legendRow}>
                <td className={styles.legendColorCell}>
                  <span className={styles.legendColor} style={{ backgroundColor: asset.color }} />
                </td>
                <td className={styles.legendLabel}>{asset.label}</td>
                <td className={styles.legendAmount}>{applyMask(`$${formatMoney(asset.cost)}`)}</td>
                <td className={styles.legendPercent}>
                  {formatPercent(asset.costAllocationPercent)}
                </td>
                <td className={`${styles.legendAmount} ${asset.isCash ? styles.center : ""}`} style={asset.unrealizedPnL !== 0 && !asset.isCash ? { color: asset.unrealizedPnL >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                  {asset.isCash ? "-" : applyMask(`${asset.unrealizedPnL >= 0 ? "+" : ""}$${formatMoney(asset.unrealizedPnL)}`)}
                </td>
                <td className={`${styles.legendPercent} ${asset.isCash ? styles.center : ""}`} style={asset.unrealizedPnL !== 0 && !asset.isCash ? { color: asset.unrealizedPnL >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                  {asset.isCash ? "-" : formatPercent(Math.abs(asset.profitLossPercent))}
                </td>
                <td className={styles.legendPercent}>
                  {formatPercent(asset.costAllocationPercent * (1 - Math.abs(asset.profitLossPercent) / 100))}
                </td>
                <td className={styles.legendAmount}>{applyMask(`$${formatMoney(asset.marketValue)}`)}</td>
                <td className={styles.legendPercent}>
                  {formatPercent(asset.valueAllocationPercent)}
                </td>
              </tr>
            ))}
          <tr className={styles.legendRow}>
            <td className={styles.legendColorCell}></td>
            <td className={styles.legendLabel} style={{ fontWeight: 600 }}>Total</td>
            <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{applyMask(`$${formatMoney(assetBreakdown.totalCost)}`)}</td>
            <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}>-</td>
            <td className={styles.legendAmount} style={{ fontWeight: 600, color: totalPnL !== 0 ? (totalPnL >= 0 ? "#2e7d32" : "#c62828") : undefined }}>
              {applyMask(`${totalPnL >= 0 ? "+" : ""}$${formatMoney(totalPnL)}`)}
            </td>
            <td className={styles.legendPercent} style={{ fontWeight: 600, color: totalPnL !== 0 ? (totalPnL >= 0 ? "#2e7d32" : "#c62828") : undefined }}>
              {formatPercent(Math.abs(totalPnLPercent))}
            </td>
            <td className={styles.legendPercent} style={{ fontWeight: 600 }}>
              {formatPercent(assetAllocation.reduce((sum, asset) => sum + asset.costAllocationPercent * (1 - Math.abs(asset.profitLossPercent) / 100), 0))}
            </td>
            <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{applyMask(`$${formatMoney(assetBreakdown.totalMarketValue)}`)}</td>
            <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}>-</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

