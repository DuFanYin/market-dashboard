/**
 * Market Status Utilities
 * 
 * Shared logic for determining US market status
 * Can be used by both client (hooks) and server (API routes)
 */

export type MarketStatus = "pre-market" | "open" | "post-market" | "night" | "closed";

export interface MarketStatusInfo {
  status: MarketStatus;
  isUsMarketOpen: boolean;
  label: string;
  timeZone: "EST" | "EDT";
}

/**
 * Compute current US market status based on Eastern Time
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 */
export function computeUsMarketStatus(): MarketStatusInfo {
  const now = new Date();
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const day = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);

  const tzParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(now);
  const tzName = tzParts.find((p) => p.type === "timeZoneName")?.value ?? "";
  
  let timeZone: "EST" | "EDT";
  if (tzName.includes("EDT") || tzName.includes("DT")) {
    timeZone = "EDT";
  } else if (tzName.includes("EST") || tzName.includes("ST")) {
    timeZone = "EST";
  } else {
    const month = now.getUTCMonth() + 1;
    timeZone = month >= 3 && month <= 11 ? "EDT" : "EST";
  }

  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(day ?? "");
  const totalMinutes = hour * 60 + minute;

  let status: MarketStatus;
  let isUsMarketOpen: boolean;

  const isNightHours = totalMinutes >= 20 * 60 || totalMinutes < 4 * 60;

  if (isNightHours) {
    status = "night";
    isUsMarketOpen = false;
  } else if (!weekday) {
    status = "closed";
    isUsMarketOpen = false;
  } else {
    if (totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30) {
      status = "pre-market";
      isUsMarketOpen = false;
    } else if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60) {
      status = "open";
      isUsMarketOpen = true;
    } else if (totalMinutes >= 16 * 60 && totalMinutes < 20 * 60) {
      status = "post-market";
      isUsMarketOpen = false;
    } else {
      status = "night";
      isUsMarketOpen = false;
    }
  }

  return {
    status,
    isUsMarketOpen,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    timeZone,
  };
}

/**
 * Quick check if US market is currently open
 */
export function isUsMarketOpen(): boolean {
  return computeUsMarketStatus().isUsMarketOpen;
}
