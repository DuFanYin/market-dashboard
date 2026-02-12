import { formatPercent } from "@/lib/format";
import { formatCurrency, formatCurrencyNoPrefix, type CurrencyMode } from "@/lib/format";
import {
  calculateTotalUnrealizedPnL,
  calculateTotalPnLPercent,
  type AssetAllocation,
  type AssetBreakdown,
} from "@/lib/accountStats";
import styles from "@/app/portfolio/page.module.css";

interface LegendTableProps {
  assetAllocation: AssetAllocation[];
  assetBreakdown: AssetBreakdown;
  applyMask: (value: string) => string;
  usdSgdRate: number;
  usdCnyRate: number;
  currencyMode: CurrencyMode;
  onToggleCurrency: () => void;
}

export function LegendTable({ assetAllocation, assetBreakdown, applyMask, usdSgdRate, usdCnyRate, currencyMode, onToggleCurrency }: LegendTableProps) {
  const totalPnL = calculateTotalUnrealizedPnL(assetBreakdown);
  const totalPnLPercent = calculateTotalPnLPercent(totalPnL, assetBreakdown.totalCost);

  // Currency formatting helpers using shared utility functions
  const rates = {
    usdSgdRate,
    usdCnyRate,
  };
  
  const formatCurrencyValue = (value: number) => 
    formatCurrency(value, currencyMode, rates);
  
  const formatCurrencyValueNoPrefix = (value: number) => 
    formatCurrencyNoPrefix(value, currencyMode, rates);

  return (
    <div 
      className={styles.legendSection}
      onClick={onToggleCurrency}
      style={{ cursor: 'pointer' }}
    >
      <table className={styles.chartLegend}>
        <tbody>
          {/* Header row in tbody so it participates in the same flex-based row height distribution (matches SummaryTable behavior) */}
          <tr className={`${styles.legendRow} ${styles.legendHeaderRow}`}>
            <td className={styles.legendLabel}></td>
            <td className={styles.legendAmount}>Cost</td>
            <td className={styles.legendAmount}>uPnL</td>
            <td className={styles.legendPercent}>%</td>
            <td className={styles.legendAmount}>Current</td>
            <td className={styles.legendPercent}>%</td>
          </tr>
          {assetAllocation
            .filter((asset) => asset.isVisible)
            .map((asset) => (
              <tr key={asset.key} className={styles.legendRow}>
                <td className={styles.legendLabel}>{asset.label}</td>
                <td className={styles.legendAmount}>{applyMask(formatCurrencyValue(asset.cost))}</td>
                <td className={`${styles.legendAmount} ${asset.isCash ? styles.center : ""}`} style={asset.unrealizedPnL !== 0 && !asset.isCash ? { color: asset.unrealizedPnL >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                  {asset.isCash ? "" : applyMask(`${asset.unrealizedPnL >= 0 ? "+" : ""}${formatCurrencyValueNoPrefix(asset.unrealizedPnL)}`)}
                </td>
                <td className={`${styles.legendPercent} ${asset.isCash ? styles.center : ""}`} style={asset.unrealizedPnL !== 0 && !asset.isCash ? { color: asset.unrealizedPnL >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                  {asset.isCash ? "" : `${asset.profitLossPercent < 0 ? "-" : ""}${formatPercent(Math.abs(asset.profitLossPercent))}`}
                </td>
                <td className={styles.legendAmount}>{applyMask(formatCurrencyValue(asset.marketValue))}</td>
                <td className={styles.legendPercent}>
                  {formatPercent(asset.valueAllocationPercent)}
                </td>
              </tr>
            ))}
          <tr className={styles.legendRow}>
            <td className={styles.legendLabel} style={{ fontWeight: 600 }}>Total</td>
            <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{applyMask(formatCurrencyValue(assetBreakdown.totalCost))}</td>
            <td className={styles.legendAmount} style={{ fontWeight: 600, color: totalPnL !== 0 ? (totalPnL >= 0 ? "#2e7d32" : "#c62828") : undefined }}>
              {applyMask(`${totalPnL >= 0 ? "+" : ""}${formatCurrencyValueNoPrefix(totalPnL)}`)}
            </td>
            <td className={styles.legendPercent} style={{ fontWeight: 600, color: totalPnL !== 0 ? (totalPnL >= 0 ? "#2e7d32" : "#c62828") : undefined }}>
              {`${totalPnLPercent < 0 ? "-" : ""}${formatPercent(Math.abs(totalPnLPercent))}`}
            </td>
            <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{applyMask(formatCurrencyValue(assetBreakdown.totalMarketValue))}</td>
            <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

