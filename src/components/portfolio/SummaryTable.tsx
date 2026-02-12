import React from "react";
import type { SummaryItem } from "@/types";
import { formatPercent } from "@/lib/format";
import { formatCurrency, formatCurrencyNoPrefix, formatCurrencyFromSgdBase, type CurrencyMode } from "@/lib/format";
import {
  calculateAccountPnL,
  calculateAccountPnLPercent,
  calculateAnnualizedReturn,
  calculateTotalUnrealizedPnL,
  type AssetBreakdown,
} from "@/lib/accountStats";
import styles from "@/app/portfolio/page.module.css";

interface SummaryTableProps {
  items: SummaryItem[];
  originalAmountUsd?: number;
  currentBalanceUsd?: number;
  yearBeginBalanceSgd?: number;
  assetBreakdown?: AssetBreakdown;
  maxValue?: number;
  minValue?: number;
  maxDrawdownPercent?: number;
  usdSgdRate?: number;
  usdCnyRate?: number;
  currencyMode?: CurrencyMode;
  applyMask?: (value: string) => string;
  onToggleIncognito?: () => void;
}

export function SummaryTable({ items, originalAmountUsd, currentBalanceUsd, yearBeginBalanceSgd, assetBreakdown, maxValue, minValue, maxDrawdownPercent, usdSgdRate, usdCnyRate, currencyMode, applyMask, onToggleIncognito }: SummaryTableProps) {
  // 计算从当年年初到现在的自然日差（包含周末、假期），用于年化收益计算
  const today = new Date();
  const yearBeginDate = new Date(today.getFullYear(), 0, 1); // 当年 1 月 1 日
  const yearBeginDaysDiff = Math.floor(
    (today.getTime() - yearBeginDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  

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
  
  // Calculate unrealised and realised PnL
  const unrealisedPnL = assetBreakdown 
    ? calculateTotalUnrealizedPnL(assetBreakdown)
    : undefined;
  const realisedPnL = (yearBeginPnL !== undefined && unrealisedPnL !== undefined)
    ? yearBeginPnL - unrealisedPnL
    : undefined;
  
  // Use persisted max drawdown (historical maximum drawdown)
  const maxDrawdown = maxDrawdownPercent;
  
  // Calculate current drawdown from peak (max_value) to current balance
  const currentDrawdown = (maxValue !== undefined && currentBalanceUsd !== undefined && maxValue > 0)
    ? ((currentBalanceUsd - maxValue) / maxValue) * 100
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
          {originalAmountUsd !== undefined && currentBalanceUsd !== undefined && applyMask && (
            <>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Balance</td>
                <td className={styles.summaryValue}>
                  {yearBeginBalanceSgd !== undefined && yearBeginBalanceSgd > 0
                    ? applyMask(formatCurrencyValueFromSgdBase(yearBeginBalanceSgd))
                    : ""}
                </td>
                <td className={styles.summaryValue}>
                  {currentBalanceUsd !== undefined
                    ? applyMask(formatCurrencyValue(currentBalanceUsd))
                    : ""}
                </td>
              </tr>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>r/u PnL</td>
                <td className={`${styles.summaryValue} ${realisedPnL !== undefined 
                  ? (realisedPnL >= 0 ? styles.positive : styles.negative)
                  : ""}`}>
                  {realisedPnL !== undefined && applyMask
                    ? applyMask(formatCurrencyValueNoPrefix(realisedPnL))
                    : ""}
                </td>
                <td className={`${styles.summaryValue} ${unrealisedPnL !== undefined 
                  ? (unrealisedPnL >= 0 ? styles.positive : styles.negative)
                  : ""}`}>
                  {unrealisedPnL !== undefined && applyMask
                    ? applyMask(formatCurrencyValueNoPrefix(unrealisedPnL))
                    : ""}
                </td>
              </tr>
              <tr className={styles.summaryRow}>
                <td className={styles.summaryLabel}>Account PnL</td>
                <td className={styles.summaryValue}></td>
                <td className={`${styles.summaryValue} ${yearBeginPnL !== undefined 
                  ? (yearBeginPnL >= 0 ? styles.positive : styles.negative)
                  : ""}`}>
                  {yearBeginPnL !== undefined && applyMask
                    ? applyMask(formatCurrencyValueNoPrefix(yearBeginPnL))
                    : ""}
                </td>
              </tr>
            </>
          )}
          {items.length > 0 && (() => {
            const firstItem = items[0];
            const className =
              firstItem.isUpnl && typeof firstItem.numericValue === "number"
                ? `${styles.summaryValue} ${firstItem.numericValue >= 0 ? styles.positive : styles.negative}`
                : styles.summaryValue;
            
            // Special handling for Utilization - put value in third column
            if (firstItem.label === "Utilization") {
              return (
                <tr key={firstItem.label} className={styles.summaryRow}>
                  <td className={styles.summaryLabel}>{firstItem.label}</td>
                  <td className={styles.summaryValue}></td>
                  <td className={styles.summaryValue}>{firstItem.display}</td>
                </tr>
              );
            }
            
            return (
              <React.Fragment key={firstItem.label}>
                <tr className={styles.summaryRow}>
                  <td className={styles.summaryLabel}>{firstItem.label === "Account PnL" ? "Account PnL %" : firstItem.label}</td>
                  <td className={firstItem.label === "Account PnL" 
                    ? (yearBeginPnLPercent !== undefined
                      ? `${styles.summaryPercent} ${styles.summaryPercentNarrow} ${yearBeginPnLPercent >= 0 ? styles.positive : styles.negative}`
                      : `${styles.summaryPercent} ${styles.summaryPercentNarrow}`)
                    : className}>
                    {firstItem.label === "Account PnL" 
                      ? (yearBeginPnLPercent !== undefined
                        ? formatPercent(yearBeginPnLPercent)
                        : "")
                      : firstItem.display}
                  </td>
                  <td className={firstItem.label === "Account PnL" && yearBeginAnnualizedReturn !== undefined
                    ? `${styles.summaryValue} ${yearBeginAnnualizedReturn >= 0 ? styles.positive : styles.negative}`
                    : styles.summaryValue}>
                    {firstItem.label === "Account PnL" && yearBeginAnnualizedReturn !== undefined
                      ? formatPercent(yearBeginAnnualizedReturn)
                      : ""}
                  </td>
                </tr>
                  {firstItem.label === "Account PnL" && (
                  <tr className={styles.summaryRow}>
                    <td className={styles.summaryLabel}>Max/Min</td>
                    <td className={styles.summaryValue}>
                      {maxValue !== undefined && maxValue > 0 && applyMask
                        ? applyMask(formatCurrencyValue(maxValue))
                        : ""}
                    </td>
                    <td className={styles.summaryValue}>
                      {minValue !== undefined && minValue > 0 && applyMask
                        ? applyMask(formatCurrencyValue(minValue))
                        : ""}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })()}
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>Drawdown</td>
            <td className={`${styles.summaryValue} ${currentDrawdown !== undefined && currentDrawdown < 0 ? styles.negative : ""}`}>
              {currentDrawdown !== undefined && applyMask
                ? applyMask(formatPercent(currentDrawdown))
                : ""}
            </td>
            <td className={`${styles.summaryValue} ${maxDrawdown !== undefined && maxDrawdown < 0 ? styles.negative : ""}`}>
              {maxDrawdown !== undefined && applyMask
                ? applyMask(formatPercent(maxDrawdown))
                : ""}
            </td>
          </tr>
          {items
            .slice(1)
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
                    </td>
                  </tr>
                  {item.label === "Account PnL" && (
                    <tr className={styles.summaryRow}>
                      <td className={styles.summaryLabel}>Max/Min</td>
                      <td className={styles.summaryValue}>
                        {maxValue !== undefined && maxValue > 0 && applyMask
                          ? applyMask(formatCurrencyValue(maxValue))
                          : ""}
                      </td>
                      <td className={styles.summaryValue}>
                        {minValue !== undefined && minValue > 0 && applyMask
                          ? applyMask(formatCurrencyValue(minValue))
                          : ""}
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

