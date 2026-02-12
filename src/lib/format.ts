/**
 * Formatting Utilities
 * 
 * 所有格式化函数集中在此文件
 * 包含: 数字格式化、货币格式化、日期格式化
 */

// ========== Basic Formatting (基础格式化) ==========

export const formatMoney = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatPercent = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";

export const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatExpiry = (expiry?: string) => {
  if (!expiry || expiry.length !== 8) return "-";
  return `${expiry.slice(0, 4)}-${expiry.slice(4, 6)}-${expiry.slice(6, 8)}`;
};

// ========== Currency Formatting (货币格式化) ==========

export type CurrencyMode = "USD" | "SGD" | "CNY";

interface CurrencyRates {
  usdSgdRate: number;
  usdCnyRate: number;
}

/**
 * Format currency value with prefix based on currency mode
 * @param value - Value in USD
 * @param currencyMode - Target currency mode
 * @param rates - Exchange rates
 * @returns Formatted string with currency prefix (e.g., "$1,234.56", "S$1,234.56", "¥1,234.56")
 */
export function formatCurrency(
  value: number,
  currencyMode: CurrencyMode,
  rates: CurrencyRates
): string {
  let displayValue: number;
  let prefix: string;
  
  if (currencyMode === "SGD") {
    displayValue = value * rates.usdSgdRate;
    prefix = "S$";
  } else if (currencyMode === "CNY") {
    displayValue = value * rates.usdCnyRate;
    prefix = "¥";
  } else {
    displayValue = value;
    prefix = "$";
  }
  
  return `${prefix}${formatMoney(displayValue)}`;
}

/**
 * Format currency value without prefix (for PnL values)
 * @param value - Value in USD
 * @param currencyMode - Target currency mode
 * @param rates - Exchange rates
 * @returns Formatted string without currency prefix (e.g., "1,234.56")
 */
export function formatCurrencyNoPrefix(
  value: number,
  currencyMode: CurrencyMode,
  rates: CurrencyRates
): string {
  let displayValue: number;
  
  if (currencyMode === "SGD") {
    displayValue = value * rates.usdSgdRate;
  } else if (currencyMode === "CNY") {
    displayValue = value * rates.usdCnyRate;
  } else {
    displayValue = value;
  }
  
  return formatMoney(displayValue);
}

/**
 * Format currency from SGD base value
 * Always uses SGD value as base, then converts based on currencyMode
 * @param sgdValue - Value in SGD
 * @param currencyMode - Target currency mode
 * @param rates - Exchange rates
 * @returns Formatted string with currency prefix
 */
export function formatCurrencyFromSgdBase(
  sgdValue: number,
  currencyMode: CurrencyMode,
  rates: CurrencyRates
): string {
  let displayValue: number;
  let prefix: string;
  
  if (currencyMode === "SGD") {
    displayValue = sgdValue;
    prefix = "S$";
  } else if (currencyMode === "CNY") {
    // Convert SGD to USD first, then to CNY
    const usdValue = sgdValue / rates.usdSgdRate;
    displayValue = usdValue * rates.usdCnyRate;
    prefix = "¥";
  } else {
    // Convert SGD to USD
    displayValue = sgdValue / rates.usdSgdRate;
    prefix = "$";
  }
  
  return `${prefix}${formatMoney(displayValue)}`;
}

// ========== Time Formatting (时间格式化) ==========

/**
 * Format a date as a human-readable "time ago" string
 * @param date - The date to format
 * @returns Formatted string (e.g., "5 seconds ago", "2 minutes ago")
 */
export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return `${diffSeconds} second${diffSeconds !== 1 ? "s" : ""} ago`;
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  }
}
