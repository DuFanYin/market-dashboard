import React from "react";
import type { Position } from "@/types";
import { formatPercent } from "@/lib/format";
import { formatCurrency, formatCurrencyNoPrefix, formatCurrencyFromSgdBase, type CurrencyMode } from "@/lib/format";
import {
  calculateAccountPnL,
  calculateAnnualizedReturn,
  calculateTotalUnrealizedPnL,
  calculatePositionLevelPnL,
  type AssetBreakdown,
} from "@/lib/accountStats";
import styles from "@/app/portfolio/page.module.css";

interface SummaryTableProps {
  currentBalanceUsd?: number;
  yearBeginBalanceSgd?: number;
  assetBreakdown?: AssetBreakdown;
  positions?: Position[];
  maxValue?: number;
  minValue?: number;
  maxDrawdownPercent?: number;
  totalTheta?: number;
  utilization?: number;
  usdSgdRate?: number;
  usdCnyRate?: number;
  currencyMode?: CurrencyMode;
  applyMask?: (value: string) => string;
  onToggleIncognito?: () => void;
}

export function SummaryTable({ currentBalanceUsd, yearBeginBalanceSgd, assetBreakdown, positions, maxValue, minValue, maxDrawdownPercent, totalTheta, utilization, usdSgdRate, usdCnyRate, currencyMode, applyMask, onToggleIncognito }: SummaryTableProps) {
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
  const currentDrawdownPercent = (maxValue !== undefined && currentBalanceUsd !== undefined && maxValue > 0)
    ? ((currentBalanceUsd - maxValue) / maxValue) * 100
    : undefined;
  const currentDrawdownAmount = (maxValue !== undefined && currentBalanceUsd !== undefined && maxValue > 0)
    ? currentBalanceUsd - maxValue
    : undefined;
  
  // Calculate MDD amount from maxDrawdownPercent and maxValue
  const maxDrawdownAmount = (maxValue !== undefined && maxDrawdownPercent !== undefined && maxValue > 0)
    ? maxValue * (maxDrawdownPercent / 100)
    : undefined;
  
  // Calculate unrealised PnL positive and negative parts from each position (not netted by asset class)
  const { gains, losses } = positions && positions.length > 0
    ? calculatePositionLevelPnL(positions)
    : { gains: 0, losses: 0 };
  const uProfit = gains > 0 ? gains : undefined;
  const uLoss = losses > 0 ? -losses : undefined; // Keep as negative value for display
  
  // Calculate unrealised PnL percentage
  const uPnlPercent = (yearBeginBalanceUsd !== undefined && yearBeginBalanceUsd > 0 && unrealisedPnL !== undefined)
    ? (unrealisedPnL / yearBeginBalanceUsd) * 100
    : undefined;
  
  // Calculate account age (days since year begin)
  const accountAge = yearBeginDaysDiff;
  
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
          {/* Row 1: Balance Bef. (label) | Balance Bef. value (col2) | Acct Min (label) | Acct Min value (col4) | Utilization (label) | Utilization value (col6) */}
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>Balance Bef.</td>
            <td className={styles.summaryValue}>
              {yearBeginBalanceSgd !== undefined && yearBeginBalanceSgd > 0 && applyMask
                ? applyMask(formatCurrencyValueFromSgdBase(yearBeginBalanceSgd))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Acct Min</td>
            <td className={styles.summaryValue}>
              {minValue !== undefined && minValue > 0 && applyMask
                ? applyMask(formatCurrencyValue(minValue))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Utilization</td>
            <td className={styles.summaryValue}>
              {utilization !== undefined && applyMask
                ? applyMask(formatPercent(utilization * 100))
                : ""}
            </td>
          </tr>
          
          {/* Row 2: Balance Aft. (label) | Balance Aft. value (col2) | Acct Max (label) | Acct Max value (col4) | Total Theta (label) | Total Theta value (col6) */}
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>Balance Aft.</td>
            <td className={styles.summaryValue}>
              {currentBalanceUsd !== undefined && applyMask
                ? applyMask(formatCurrencyValue(currentBalanceUsd))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Acct Max</td>
            <td className={styles.summaryValue}>
              {maxValue !== undefined && maxValue > 0 && applyMask
                ? applyMask(formatCurrencyValue(maxValue))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Total Theta</td>
            <td className={styles.summaryValue}>
              {totalTheta !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(totalTheta))
                : ""}
            </td>
          </tr>
          
          {/* Row 3: uProfit (label) | uProfit value (col2) | Drawdown (label) | Drawdown value (col4) | Acct Age (label) | Acct Age value (col6) */}
          <tr className={styles.summaryRow}>
            <td className={`${styles.summaryLabel} ${uProfit !== undefined ? styles.positive : ""}`}>uProfit</td>
            <td className={`${styles.summaryValue} ${uProfit !== undefined ? styles.positive : ""}`}>
              {uProfit !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(uProfit))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Drawdown</td>
            <td className={`${styles.summaryValue} ${currentDrawdownAmount !== undefined && currentDrawdownAmount < 0 ? styles.negative : ""}`}>
              {currentDrawdownAmount !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(currentDrawdownAmount))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Acct Age</td>
            <td className={styles.summaryValue}>
              {accountAge !== undefined ? `${accountAge}d` : ""}
            </td>
          </tr>
          
          {/* Row 4: uLoss (label) | uLoss value (col2) | Drawdown % (label) | Drawdown % value (col4) | (empty) | (empty) */}
          <tr className={styles.summaryRow}>
            <td className={`${styles.summaryLabel} ${uLoss !== undefined ? styles.negative : ""}`}>uLoss</td>
            <td className={`${styles.summaryValue} ${uLoss !== undefined ? styles.negative : ""}`}>
              {uLoss !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(uLoss))
                : ""}
            </td>
            <td className={styles.summaryLabel}>Drawdown %</td>
            <td className={`${styles.summaryValue} ${currentDrawdownPercent !== undefined && currentDrawdownPercent < 0 ? styles.negative : ""}`}>
              {currentDrawdownPercent !== undefined && applyMask
                ? applyMask(formatPercent(currentDrawdownPercent))
                : ""}
            </td>
            <td className={styles.summaryLabel}></td>
            <td className={styles.summaryValue}></td>
          </tr>
          
          {/* Row 5: Net uPnl (label) | Net uPnl value (col2) | MDD (label) | MDD value (col4) | (empty) | (empty) */}
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>Net uPnl</td>
            <td className={`${styles.summaryValue} ${unrealisedPnL !== undefined 
              ? (unrealisedPnL >= 0 ? styles.positive : styles.negative)
              : ""}`}>
              {unrealisedPnL !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(unrealisedPnL))
                : ""}
            </td>
            <td className={styles.summaryLabel}>MDD</td>
            <td className={`${styles.summaryValue} ${maxDrawdownAmount !== undefined && maxDrawdownAmount < 0 ? styles.negative : ""}`}>
              {maxDrawdownAmount !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(maxDrawdownAmount))
                : ""}
            </td>
            <td className={styles.summaryLabel}></td>
            <td className={styles.summaryValue}></td>
          </tr>
          
          {/* Row 6: uPnl % (label) | uPnl % value (col2) | MDD % (label) | MDD % value (col4) | (empty) | (empty) */}
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>uPnl %</td>
            <td className={`${styles.summaryValue} ${uPnlPercent !== undefined 
              ? (uPnlPercent >= 0 ? styles.positive : styles.negative)
              : ""}`}>
              {uPnlPercent !== undefined && applyMask
                ? applyMask(formatPercent(uPnlPercent))
                : ""}
            </td>
            <td className={styles.summaryLabel}>MDD %</td>
            <td className={`${styles.summaryValue} ${maxDrawdown !== undefined && maxDrawdown < 0 ? styles.negative : ""}`}>
              {maxDrawdown !== undefined && applyMask
                ? applyMask(formatPercent(maxDrawdown))
                : ""}
            </td>
            <td className={styles.summaryLabel}></td>
            <td className={styles.summaryValue}></td>
          </tr>
          
          {/* Row 7: YTM % (label) | YTM % value (col2) | rPNL (label) | rPNL value (col4) | (empty) | (empty) */}
          <tr className={styles.summaryRow}>
            <td className={styles.summaryLabel}>YTM %</td>
            <td className={`${styles.summaryValue} ${yearBeginAnnualizedReturn !== undefined 
              ? (yearBeginAnnualizedReturn >= 0 ? styles.positive : styles.negative)
              : ""}`}>
              {yearBeginAnnualizedReturn !== undefined && applyMask
                ? applyMask(formatPercent(yearBeginAnnualizedReturn))
                : ""}
            </td>
            <td className={styles.summaryLabel}>rPNL</td>
            <td className={`${styles.summaryValue} ${realisedPnL !== undefined 
              ? (realisedPnL >= 0 ? styles.positive : styles.negative)
              : ""}`}>
              {realisedPnL !== undefined && applyMask
                ? applyMask(formatCurrencyValueNoPrefix(realisedPnL))
                : ""}
            </td>
            <td className={styles.summaryLabel}></td>
            <td className={styles.summaryValue}></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

