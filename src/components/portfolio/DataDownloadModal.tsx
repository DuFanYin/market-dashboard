import { useState } from "react";
import { formatMoney, formatPercent, formatNumber } from "@/lib/format";
import type { PortfolioData } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import type { SummaryItem } from "@/types/portfolio";
import styles from "@/app/portfolio/page.module.css";

interface DataDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PortfolioData | null;
  assetBreakdown: AssetBreakdown;
  assetAllocation: AssetAllocation[];
  summaryItems: SummaryItem[];
  originalAmountUsd: number;
  currentBalanceUsd: number;
  isUsMarketOpen: boolean;
  nyTimeLabel: string;
  lastRefreshTime: Date | null;
}

export function DataDownloadModal({
  isOpen,
  onClose,
  data,
  assetBreakdown,
  assetAllocation,
  summaryItems,
  originalAmountUsd,
  currentBalanceUsd,
}: DataDownloadModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  
  if (!isOpen || !data) return null;

  const formatAllData = (): string => {
    let output = "PORTFOLIO DASHBOARD DATA EXPORT\n";
    output += "=".repeat(50) + "\n\n";
    output += `Generated: ${new Date().toLocaleString()}\n`;
    output += `USD/SGD Rate: ${data.usd_sgd_rate}\n\n`;

    output += "ACCOUNT SUMMARY\n";
    output += "-".repeat(50) + "\n";
    summaryItems.forEach((item) => {
      output += `${item.label}: ${item.display}`;
      if (item.percentDisplay) {
        output += ` (${item.percentDisplay})`;
      }
      output += "\n";
    });
    output += `INITIAL BALANCE USD: ${formatMoney(originalAmountUsd)}\n`;
    output += `CURRENT BALANCE USD: ${formatMoney(currentBalanceUsd)}\n`;
    output += `Account PnL (raw): ${data.account_pnl.toFixed(2)}\n`;
    output += `Account PnL % (raw): ${data.account_pnl_percent.toFixed(2)}\n`;
    output += `Total Theta: ${data.total_theta.toFixed(2)}\n`;
    
    output += "\n";

    output += "ASSET ALLOCATION\n";
    output += "-".repeat(50) + "\n";
    assetAllocation
      .filter((asset) => asset.isVisible)
      .forEach((asset) => {
        output += `${asset.label}\n`;
        output += `  Market Value: ${formatMoney(asset.marketValue)} (${formatPercent(asset.valueAllocationPercent)})\n`;
        output += `  Unrealized PnL: ${formatMoney(asset.unrealizedPnL)} (${formatPercent(Math.abs(asset.profitLossPercent))})\n\n`;
      });
    output += `Total Market Value: ${formatMoney(assetBreakdown.totalMarketValue)}\n`;
    output += `Total Unrealized PnL: ${formatMoney(assetBreakdown.stockUnrealizedPnL + assetBreakdown.optionUnrealizedPnL)}\n\n`;

    output += "POSITIONS\n";
    output += "-".repeat(50) + "\n";
    data.positions.forEach((pos) => {
      if (pos.isPlaceholder) {
        return;
      }

      let displaySymbol = pos.symbol;
      if (pos.is_option && pos.strike && pos.expiry) {
        const optionSymbol = `${(pos.right ?? "").toUpperCase()}-${pos.expiry.slice(2, 4)}'${pos.expiry.slice(4, 6)}'${pos.expiry.slice(6, 8)}-${pos.strike.toFixed(2)}`;
        displaySymbol = pos.underlyingKey ? `${optionSymbol} (${pos.underlyingKey})` : optionSymbol;
      }

      output += `${pos.is_option ? "Option" : "Stock"}: ${displaySymbol}\n`;
      output += `  Symbol: ${pos.symbol}\n`;
      output += `  Quantity: ${formatNumber(pos.qty, 0)}\n`;
      output += `  Price: ${formatMoney(pos.price)}\n`;
      output += `  Avg Cost: ${formatMoney(pos.cost)}\n`;
      output += `  Total Cost: ${formatMoney(pos.cost * pos.qty)}\n`;
      output += `  Market Value: ${formatMoney(pos.price * pos.qty)}\n`;
      output += `  Unrealized PnL: ${formatMoney(pos.upnl)} (${formatNumber(pos.percent_change)}%)\n`;
      output += `  Position %: ${formatPercent(((pos.price * pos.qty) / currentBalanceUsd) * 100)}\n`;
      
      if (pos.is_option) {
        output += `  Underlying Price: ${formatMoney(pos.underlyingPrice ?? 0)}\n`;
        output += `  Delta: ${formatNumber(pos.delta)}\n`;
        output += `  Gamma: ${formatNumber(pos.gamma)}\n`;
        output += `  Theta: ${formatNumber(pos.theta)}\n`;
        output += `  DTE: ${pos.dteDays !== undefined ? pos.dteDays : "N/A"}\n`;
      }
      output += "\n";
    });

    return output;
  };

  const handleCopy = async () => {
    const content = formatAllData();
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
      }, 1000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Portfolio Data Export</h2>
          <button className={styles.modalCloseButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          <pre className={styles.modalText}>{formatAllData()}</pre>
        </div>
        <div className={styles.modalFooter}>
          <button 
            className={`${styles.modalCancelButton} ${copySuccess ? styles.copySuccessButton : ""}`} 
            onClick={handleCopy}
          >
            {copySuccess ? "Success!" : "Copy to Clipboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

