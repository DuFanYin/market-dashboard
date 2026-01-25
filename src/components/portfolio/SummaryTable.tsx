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
  yearBeginBalanceSgd?: number;
  originalAmountSgd?: number;
  usdSgdRate?: number;
  usdCnyRate?: number;
  currencyMode?: CurrencyMode;
  applyMask?: (value: string) => string;
  onToggleIncognito?: () => void;
}

export function SummaryTable({ items, originalAmountUsd, currentBalanceUsd, yearBeginBalanceSgd, originalAmountSgd, usdSgdRate, usdCnyRate, currencyMode, applyMask, onToggleIncognito }: SummaryTableProps) {
  // 起点 1：整体账户从最初投入开始的年化收益（例：2025-10-20）
  const overallStartDate = new Date(2025, 9, 20); // 2025-10-20（month 0-indexed, 9 = October）
  // 起点 2：当年的年初，用于 yearBeginBalanceSgd 的年化收益
  const today = new Date();
  const yearBeginDate = new Date(today.getFullYear(), 0, 1); // 当年 1 月 1 日

  // 计算自然日差（包含周末、假期）
  const overallDaysDiff = Math.floor(
    (today.getTime() - overallStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const yearBeginDaysDiff = Math.floor(
    (today.getTime() - yearBeginDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // 年化收益 1：currentBalanceUsd 相对 originalAmountUsd，从 overallStartDate 起算
  const annualizedReturn = originalAmountUsd && currentBalanceUsd && overallDaysDiff > 0
    ? calculateAnnualizedReturn(currentBalanceUsd, originalAmountUsd, overallDaysDiff)
    : 0;

  // Convert yearBeginBalanceSgd to USD for calculations (since currentBalanceUsd is in USD)
  const yearBeginBalanceUsd = (yearBeginBalanceSgd !== undefined && yearBeginBalanceSgd > 0 && usdSgdRate !== undefined && usdSgdRate > 0)
    ? yearBeginBalanceSgd / usdSgdRate
    : undefined;

  // Calculate values for row 4-6 col 2 (relative to yearBeginBalanceSgd, converted to USD for comparison)
  const yearBeginPnL = (yearBeginBalanceUsd !== undefined && currentBalanceUsd !== undefined)
    ? calculateAccountPnL(currentBalanceUsd, yearBeginBalanceUsd)
    : undefined;
  const yearBeginPnLPercent = (yearBeginBalanceUsd !== undefined && yearBeginBalanceUsd > 0 && yearBeginPnL !== undefined)
    ? calculateAccountPnLPercent(yearBeginPnL, yearBeginBalanceUsd)
    : undefined;
  // 年化收益 2：currentBalanceUsd 相对 yearBeginBalanceUsd（从 SGD 转换），从当年年初起算
  const yearBeginAnnualizedReturn = (yearBeginBalanceUsd !== undefined && currentBalanceUsd !== undefined && yearBeginDaysDiff > 0 && yearBeginBalanceUsd > 0)
    ? calculateAnnualizedReturn(currentBalanceUsd, yearBeginBalanceUsd, yearBeginDaysDiff)
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
            <td className={styles.summaryValue}>{overallDaysDiff}d</td>
          </tr>
          {originalAmountUsd !== undefined && currentBalanceUsd !== undefined && applyMask && (
            <>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Initial Balance</td>
                <td className={styles.summaryValue}>
                  {yearBeginBalanceSgd !== undefined && yearBeginBalanceSgd > 0
                    ? applyMask(formatCurrencyValueFromSgdBase(yearBeginBalanceSgd))
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
                        ? `${styles.summaryPercent} ${styles.summaryPercentNarrow} ${yearBeginPnLPercent >= 0 ? styles.positive : styles.negative}`
                        : `${styles.summaryPercent} ${styles.summaryPercentNarrow}`)
                      : className}>
                      {item.label === "Account PnL" 
                        ? (yearBeginPnLPercent !== undefined
                          ? formatPercent(yearBeginPnLPercent)
                          : "")
                        : item.display}
                    </td>
                    <td className={item.label === "Account PnL"
                      ? `${percentClass} ${styles.summaryPercentNarrow}`
                      : percentClass}>
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

