import type { SummaryItem } from "@/types/portfolio";
import { formatMoney } from "@/lib/format";
import styles from "@/app/portfolio/page.module.css";

interface SummaryTableProps {
  items: SummaryItem[];
  originalAmountSgd?: number;
  originalAmountUsd?: number;
  currentBalanceUsd?: number;
  currentBalanceSgd?: number;
  applyMask?: (value: string) => string;
}

export function SummaryTable({ items, originalAmountSgd, originalAmountUsd, currentBalanceUsd, currentBalanceSgd, applyMask }: SummaryTableProps) {
  return (
    <div className={styles.summaryStack}>
      <table className={styles.summaryTable}>
        <tbody>
          {originalAmountSgd !== undefined && originalAmountUsd !== undefined && applyMask && (
            <tr className={styles.summaryRow}>
              <td className={styles.summaryLabel}>Initial Balance</td>
              <td className={styles.summaryValue}>{applyMask(`$${formatMoney(originalAmountUsd)}`)}</td>
              <td className={styles.summaryValue}>SG{applyMask(`$${formatMoney(originalAmountSgd)}`)}</td>
            </tr>
          )}
          {currentBalanceUsd !== undefined && currentBalanceSgd !== undefined && applyMask && (
            <tr className={styles.summaryRow}>
              <td className={styles.summaryLabel}>Current Balance</td>
              <td className={styles.summaryValue}>{applyMask(`$${formatMoney(currentBalanceUsd)}`)}</td>
              <td className={styles.summaryValue}>SG{applyMask(`$${formatMoney(currentBalanceSgd)}`)}</td>
            </tr>
          )}
          {items.map((item) => {
            const className =
              item.isUpnl && typeof item.numericValue === "number"
                ? `${styles.summaryValue} ${item.numericValue >= 0 ? styles.positive : styles.negative}`
                : styles.summaryValue;
            const percentClass =
              typeof item.percentValue === "number"
                ? `${styles.summaryPercent} ${item.percentValue >= 0 ? styles.positive : styles.negative}`
                : styles.summaryPercent;
            return (
              <tr key={item.label} className={styles.summaryRow}>
                <td className={styles.summaryLabel}>{item.label}</td>
                <td className={className}>{item.display}</td>
                <td className={percentClass}>{item.percentDisplay ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

