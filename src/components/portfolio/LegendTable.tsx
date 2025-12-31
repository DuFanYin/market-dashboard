import { formatMoney, formatPercent } from "@/lib/format";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import styles from "@/app/portfolio/page.module.css";

interface LegendTableProps {
  assetAllocation: AssetAllocation[];
  assetBreakdown: AssetBreakdown;
  applyMask: (value: string) => string;
  usdSgdRate: number;
  usdCnyRate: number;
  currencyMode: "USD" | "SGD" | "CNY";
  onToggleCurrency: () => void;
}

export function LegendTable({ assetAllocation, assetBreakdown, applyMask, usdSgdRate, usdCnyRate, currencyMode, onToggleCurrency }: LegendTableProps) {
  const totalPnL = assetBreakdown.stockUnrealizedPnL + assetBreakdown.optionUnrealizedPnL + assetBreakdown.cryptoUnrealizedPnL + assetBreakdown.etfUnrealizedPnL;
  const totalPnLPercent = assetBreakdown.totalCost > 0 ? (totalPnL / assetBreakdown.totalCost) * 100 : 0;

  const formatCurrency = (value: number) => {
    let displayValue: number;
    let prefix: string;
    if (currencyMode === "SGD") {
      displayValue = value * usdSgdRate;
      prefix = "S$";
    } else if (currencyMode === "CNY") {
      displayValue = value * usdCnyRate;
      prefix = "¥";
    } else {
      displayValue = value;
      prefix = "$";
    }
    return `${prefix}${formatMoney(displayValue)}`;
  };

  return (
    <div 
      className={styles.legendSection}
      onClick={onToggleCurrency}
      style={{ cursor: 'pointer' }}
    >
      <div className={styles.legendTableWrapper}>
        <table className={styles.chartLegend}>
        <thead>
          <tr>
            <th className={styles.legendColorCell}></th>
            <th className={styles.legendLabel}></th>
            <th className={styles.legendAmount}>Cost</th>
            <th className={styles.legendAmount}>uPnL</th>
            <th className={styles.legendPercent}>%</th>
            <th className={styles.legendAmount}>Current</th>
            <th className={styles.legendPercent}>%</th>
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
                <td className={styles.legendAmount}>{applyMask(formatCurrency(asset.cost))}</td>
                <td className={`${styles.legendAmount} ${asset.isCash ? styles.center : ""}`} style={asset.unrealizedPnL !== 0 && !asset.isCash ? { color: asset.unrealizedPnL >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                  {asset.isCash ? "" : applyMask(`${asset.unrealizedPnL >= 0 ? "+" : ""}${formatCurrency(asset.unrealizedPnL)}`)}
                </td>
                <td className={`${styles.legendPercent} ${asset.isCash ? styles.center : ""}`} style={asset.unrealizedPnL !== 0 && !asset.isCash ? { color: asset.unrealizedPnL >= 0 ? "#2e7d32" : "#c62828" } : undefined}>
                  {asset.isCash ? "" : `${asset.profitLossPercent < 0 ? "-" : ""}${formatPercent(Math.abs(asset.profitLossPercent))}`}
                </td>
                <td className={styles.legendAmount}>{applyMask(formatCurrency(asset.marketValue))}</td>
                <td className={styles.legendPercent}>
                  {formatPercent(asset.valueAllocationPercent)}
                </td>
              </tr>
            ))}
          <tr className={styles.legendRow}>
            <td className={styles.legendColorCell}></td>
            <td className={styles.legendLabel} style={{ fontWeight: 600 }}>Total</td>
            <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{applyMask(formatCurrency(assetBreakdown.totalCost))}</td>
            <td className={styles.legendAmount} style={{ fontWeight: 600, color: totalPnL !== 0 ? (totalPnL >= 0 ? "#2e7d32" : "#c62828") : undefined }}>
              {applyMask(`${totalPnL >= 0 ? "+" : ""}${formatCurrency(totalPnL)}`)}
            </td>
            <td className={styles.legendPercent} style={{ fontWeight: 600, color: totalPnL !== 0 ? (totalPnL >= 0 ? "#2e7d32" : "#c62828") : undefined }}>
              {`${totalPnLPercent < 0 ? "-" : ""}${formatPercent(Math.abs(totalPnLPercent))}`}
            </td>
            <td className={styles.legendAmount} style={{ fontWeight: 600 }}>{applyMask(formatCurrency(assetBreakdown.totalMarketValue))}</td>
            <td className={`${styles.legendPercent} ${styles.center}`} style={{ fontWeight: 600 }}></td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

