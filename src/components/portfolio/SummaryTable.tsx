import React from "react";
import type { SummaryItem } from "@/types/portfolio";
import { formatPercent } from "@/lib/format";
import { formatCurrency, formatCurrencyNoPrefix, formatCurrencyFromSgdBase, type CurrencyMode } from "@/lib/currency";
import {
  calculateAccountPnL,
  calculateAccountPnLPercent,
  calculateAnnualizedReturn,
} from "@/lib/positionCalculations";
import styles from "@/app/portfolio/page.module.css";

interface SummaryTableProps {
  items: SummaryItem[];
  originalAmountUsd?: number;
  currentBalanceUsd?: number;
  yearBeginBalanceUsd?: number;
  originalAmountSgd?: number;
  usdSgdRate?: number;
  usdCnyRate?: number;
  currencyMode?: CurrencyMode;
  applyMask?: (value: string) => string;
  onToggleIncognito?: () => void;
}

export function SummaryTable({ items, originalAmountUsd, currentBalanceUsd, yearBeginBalanceUsd, originalAmountSgd, usdSgdRate, usdCnyRate, currencyMode, applyMask, onToggleIncognito }: SummaryTableProps) {
  const startDate = new Date(2025, 9, 20); // November 20, 2025 (month is 0-indexed, so 10 = November)
  const today = new Date();
  // Calculate total calendar days (includes all days: trading and non-trading days)
  const daysDiff = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate annualized return (always based on USD)
  const annualizedReturn = originalAmountUsd && currentBalanceUsd
    ? calculateAnnualizedReturn(currentBalanceUsd, originalAmountUsd, daysDiff)
    : 0;

  // Calculate values for row 4-6 col 1 (relative to yearBeginBalanceUsd, always in USD)
  const yearBeginPnL = yearBeginBalanceUsd && currentBalanceUsd !== undefined
    ? calculateAccountPnL(currentBalanceUsd, yearBeginBalanceUsd)
    : undefined;
  const yearBeginPnLPercent = yearBeginBalanceUsd && yearBeginBalanceUsd > 0 && yearBeginPnL !== undefined
    ? calculateAccountPnLPercent(yearBeginPnL, yearBeginBalanceUsd)
    : undefined;
  const yearBeginAnnualizedReturn = yearBeginBalanceUsd && currentBalanceUsd !== undefined && daysDiff > 0 && yearBeginBalanceUsd > 0
    ? calculateAnnualizedReturn(currentBalanceUsd, yearBeginBalanceUsd, daysDiff)
    : undefined;
  
  // Currency formatting helpers using shared utility functions
  const rates = {
    usdSgdRate: usdSgdRate || 1,
    usdCnyRate: usdCnyRate || 1,
  };
  
  const formatCurrencyValue = (value: number) => 
    formatCurrency(value, currencyMode as CurrencyMode, rates);
  
  const formatCurrencyValueNoPrefix = (value: number) => 
    formatCurrencyNoPrefix(value, currencyMode as CurrencyMode, rates);
  
  const formatCurrencyValueFromSgdBase = (sgdValue: number) => 
    formatCurrencyFromSgdBase(sgdValue, currencyMode as CurrencyMode, rates);

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
          {originalAmountUsd !== undefined && currentBalanceUsd !== undefined && applyMask && (
            <>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Initial Balance</td>
                <td className={styles.summaryValue}>
                  {yearBeginBalanceUsd !== undefined && yearBeginBalanceUsd > 0
                    ? applyMask(formatCurrencyValue(yearBeginBalanceUsd))
                    : ""}
                </td>
                <td className={styles.summaryValue}>
                  {originalAmountSgd !== undefined && originalAmountSgd > 0 && usdSgdRate !== undefined
                    ? applyMask(formatCurrencyValueFromSgdBase(originalAmountSgd))
                    : ""}
                </td>
              </tr>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Current Balance</td>
                <td className={styles.summaryValue}></td>
                <td className={styles.summaryValue}>
                  {currentBalanceUsd !== undefined
                    ? applyMask(formatCurrencyValue(currentBalanceUsd))
                    : ""}
                </td>
              </tr>
            </>
          )}
          {originalAmountUsd !== undefined && currentBalanceUsd !== undefined && applyMask && (
            <tr className={styles.summaryRow}>
              <td className={styles.summaryLabel}>Account PnL</td>
              <td className={`${styles.summaryValue} ${yearBeginPnL !== undefined 
                ? (yearBeginPnL >= 0 ? styles.positive : styles.negative)
                : ""}`}>
                {yearBeginPnL !== undefined && applyMask
                  ? applyMask(formatCurrencyValueNoPrefix(yearBeginPnL))
                  : ""}
              </td>
              <td className={`${styles.summaryValue} ${currentBalanceUsd !== undefined && originalAmountUsd !== undefined
                ? (calculateAccountPnL(currentBalanceUsd, originalAmountUsd) >= 0 ? styles.positive : styles.negative)
                : ""}`}>
                {currentBalanceUsd !== undefined && originalAmountUsd !== undefined
                  ? applyMask(formatCurrencyValueNoPrefix(calculateAccountPnL(currentBalanceUsd, originalAmountUsd)))
                  : ""}
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
                    <td className={item.label === "Account PnL" 
                      ? (yearBeginPnLPercent !== undefined
                        ? `${styles.summaryPercent} ${yearBeginPnLPercent >= 0 ? styles.positive : styles.negative}`
                        : styles.summaryPercent)
                      : className}>
                      {item.label === "Account PnL" 
                        ? (yearBeginPnLPercent !== undefined
                          ? formatPercent(yearBeginPnLPercent)
                          : "")
                        : item.display}
                    </td>
                    <td className={percentClass}>
                      {item.percentDisplay ?? ""}
                    </td>
                  </tr>
                  {item.label === "Account PnL" && (
                    <tr className={styles.summaryRow}>
                      <td className={styles.summaryLabel}>Annualized %</td>
                      <td className={yearBeginAnnualizedReturn !== undefined
                        ? `${styles.summaryValue} ${yearBeginAnnualizedReturn >= 0 ? styles.positive : styles.negative}`
                        : styles.summaryValue}>
                        {yearBeginAnnualizedReturn !== undefined
                          ? formatPercent(yearBeginAnnualizedReturn)
                          : ""}
                      </td>
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

