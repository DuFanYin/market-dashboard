"use client";

import type { MarketStatus, MarketStatusInfo } from "@/hooks/useMarketData";
import styles from "./MarketStatusBanner.module.css";

interface MarketStatusBannerProps {
  marketStatus?: MarketStatusInfo;
  // For backward compatibility - will use marketStatus if provided
  isUsMarketOpen?: boolean;
  nyTimeLabel: string;
  lastRefreshTime?: Date | null;
  timeAgo?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

function getStatusLabel(status: MarketStatus): string {
  switch (status) {
    case "pre-market":
      return "PRE-MARKET";
    case "open":
      return "OPEN";
    case "post-market":
      return "POST-MARKET";
    case "night":
      return "NIGHT";
    case "closed":
      return "CLOSED";
    default:
      return "CLOSED";
  }
}

function getStatusClass(status: MarketStatus): string {
  switch (status) {
    case "pre-market":
      return styles.statusPreMarket;
    case "open":
      return styles.statusOpen;
    case "post-market":
      return styles.statusPostMarket;
    case "night":
      return styles.statusNight;
    case "closed":
      return styles.statusClosed;
    default:
      return styles.statusClosed;
  }
}

function getBannerClass(status: MarketStatus): string {
  switch (status) {
    case "pre-market":
      return styles.bannerPreMarket;
    case "open":
      return styles.bannerOpen;
    case "post-market":
      return styles.bannerPostMarket;
    case "night":
      return styles.bannerNight;
    case "closed":
      return styles.bannerClosed;
    default:
      return styles.bannerClosed;
  }
}

export function MarketStatusBanner({
  marketStatus,
  isUsMarketOpen,
  nyTimeLabel,
  lastRefreshTime,
  timeAgo,
  isLoading,
  onRefresh,
}: MarketStatusBannerProps) {
  // Use marketStatus if provided, otherwise fall back to isUsMarketOpen for backward compatibility
  const status: MarketStatus = marketStatus?.status ?? (isUsMarketOpen ? "open" : "closed");
  const timeZone = marketStatus?.timeZone ?? "ET";

  return (
    <div className={`${styles.marketBanner} ${getBannerClass(status)}`}>
      <div className={styles.bannerContent}>
        <div className={styles.bannerCenter}>
          <span className={styles.bannerLabel}>US Stock Market: </span>
          <span className={getStatusClass(status)}>{getStatusLabel(status)}</span>
          <span className={styles.bannerTime}>
            (NY {nyTimeLabel} {timeZone})
          </span>
        </div>
        {lastRefreshTime && timeAgo && (
          <div
            className={styles.lastRefreshTime}
            onClick={onRefresh}
            style={{ cursor: isLoading ? "wait" : "pointer" }}
          >
            Last refreshed: {isLoading ? "Refreshing..." : timeAgo}
          </div>
        )}
      </div>
    </div>
  );
}
