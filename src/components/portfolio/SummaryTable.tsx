import React from "react";
import type { SummaryItem } from "@/types/portfolio";
import { formatMoney, formatPercent } from "@/lib/format";
import styles from "@/app/portfolio/page.module.css";

interface SummaryTableProps {
  items: SummaryItem[];
  originalAmountSgd?: number;
  originalAmountUsd?: number;
  currentBalanceUsd?: number;
  currentBalanceSgd?: number;
  applyMask?: (value: string) => string;
  onToggleIncognito?: () => void;
}

export function SummaryTable({ items, originalAmountUsd, currentBalanceUsd, originalAmountSgd, currentBalanceSgd, applyMask, onToggleIncognito }: SummaryTableProps) {
  const startDate = new Date(2025, 9, 20); // November 20, 2025 (month is 0-indexed, so 10 = November)
  const today = new Date();
  // Calculate total calendar days (includes all days: trading and non-trading days)
  const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate annualized return
  const annualizedReturn = originalAmountUsd && currentBalanceUsd && daysDiff > 0 && originalAmountUsd > 0
    ? ((Math.pow(currentBalanceUsd / originalAmountUsd, 365 / daysDiff) - 1) * 100)
    : 0;

  return (
    <div 
      className={styles.summaryStack}
      onClick={onToggleIncognito}
      style={{ cursor: onToggleIncognito ? 'pointer' : 'default' }}
    >
      <table className={styles.summaryTable}>
        <tbody>
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>Start Date</td>
            <td className={styles.summaryValue}>2025 Oct 20</td>
            <td className={styles.summaryValue}>{daysDiff}d</td>
          </tr>
          {originalAmountSgd !== undefined && currentBalanceSgd !== undefined && originalAmountUsd !== undefined && currentBalanceUsd !== undefined && applyMask && (
            <>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Initial Balance</td>
                <td className={styles.summaryValue}>{applyMask(`S$${formatMoney(originalAmountSgd)}`)}</td>
                <td className={styles.summaryValue}>{applyMask(`$${formatMoney(originalAmountUsd)}`)}</td>
              </tr>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Current Balance</td>
                <td className={styles.summaryValue}>{applyMask(`S$${formatMoney(currentBalanceSgd)}`)}</td>
                <td className={styles.summaryValue}>{applyMask(`$${formatMoney(currentBalanceUsd)}`)}</td>
              </tr>
            </>
          )}
          {originalAmountSgd !== undefined && currentBalanceSgd !== undefined && originalAmountUsd !== undefined && currentBalanceUsd !== undefined && applyMask && (
            <tr className={styles.summaryRow}>
              <td className={styles.summaryLabel}>Account PnL</td>
              <td className={`${styles.summaryValue} ${currentBalanceSgd - originalAmountSgd >= 0 ? styles.positive : styles.negative}`}>
                {applyMask(`S$${formatMoney(currentBalanceSgd - originalAmountSgd)}`)}
              </td>
              <td className={`${styles.summaryValue} ${currentBalanceUsd - originalAmountUsd >= 0 ? styles.positive : styles.negative}`}>
                {applyMask(`$${formatMoney(currentBalanceUsd - originalAmountUsd)}`)}
              </td>
            </tr>
          )}
          {items
            .map((item) => {
              const className =
                item.isUpnl && typeof item.numericValue === "number"
                  ? `${styles.summaryValue} ${item.numericValue >= 0 ? styles.positive : styles.negative}`
                  : styles.summaryValue;
              const percentClass =
                typeof item.percentValue === "number"
                  ? `${styles.summaryPercent} ${item.percentValue >= 0 ? styles.positive : styles.negative}`
                  : styles.summaryPercent;
              
              // Special handling for Utilization - put value in third column
              if (item.label === "Utilization") {
                return (
                  <tr key={item.label} className={styles.summaryRow}>
                    <td className={styles.summaryLabel}>{item.label}</td>
                    <td className={styles.summaryValue}></td>
                    <td className={styles.summaryValue}>{item.display}</td>
                  </tr>
                );
              }
              
              return (
                <React.Fragment key={item.label}>
                  <tr className={styles.summaryRow}>
                    <td className={styles.summaryLabel}>{item.label === "Account PnL" ? "Account PnL %" : item.label}</td>
                    <td className={className}>
                      {item.label === "Account PnL" 
                        ? ""
                        : item.display}
                    </td>
                    <td className={percentClass}>{item.percentDisplay ?? ""}</td>
                  </tr>
                  {item.label === "Account PnL" && (
                    <tr className={styles.summaryRow}>
                      <td className={styles.summaryLabel}>Annualized %</td>
                      <td className={styles.summaryValue}></td>
                      <td className={`${styles.summaryValue} ${annualizedReturn >= 0 ? styles.positive : styles.negative}`}>
                        {formatPercent(annualizedReturn)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

