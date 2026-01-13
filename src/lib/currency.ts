import { formatMoney } from "./format";

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

