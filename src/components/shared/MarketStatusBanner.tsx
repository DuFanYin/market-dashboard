"use client";

import type { MarketStatus, MarketStatusInfo } from "@/hooks";

interface MarketStatusBannerProps {
  marketStatus?: MarketStatusInfo;
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
      return "msb-status-pre";
    case "open":
      return "msb-status-open";
    case "post-market":
      return "msb-status-post";
    case "night":
      return "msb-status-night";
    case "closed":
      return "msb-status-closed";
    default:
      return "msb-status-closed";
  }
}

function getBannerClass(status: MarketStatus): string {
  switch (status) {
    case "pre-market":
      return "msb-banner-pre";
    case "open":
      return "msb-banner-open";
    case "post-market":
      return "msb-banner-post";
    case "night":
      return "msb-banner-night";
    case "closed":
      return "msb-banner-closed";
    default:
      return "msb-banner-closed";
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
  const status: MarketStatus = marketStatus?.status ?? (isUsMarketOpen ? "open" : "closed");
  const timeZone = marketStatus?.timeZone ?? "ET";

  return (
    <>
      <style>{`
        .msb-banner {
          padding: 6px 12px;
          font-size: 12px;
          text-align: center;
          margin: 0;
          margin-top: 8px;
          user-select: none;
        }
        @media (min-width: 640px) {
          .msb-banner { padding: 12px; font-size: 14px; }
        }
        .msb-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          user-select: none;
        }
        .msb-center {
          text-align: center;
          font-size: 14px;
          user-select: none;
        }
        .msb-label {
          display: none;
          user-select: none;
        }
        @media (min-width: 640px) {
          .msb-label { display: inline; }
        }
        .msb-time {
          margin-left: 8px;
          font-size: 14px;
          color: #888888;
          user-select: none;
        }
        .msb-banner-open { color: #2e7d32; }
        .msb-banner-pre, .msb-banner-post, .msb-banner-night { color: #ffc107; }
        .msb-banner-closed { color: #c62828; }
        .msb-status-open { color: #2e7d32; font-weight: 600; user-select: none; }
        .msb-status-pre, .msb-status-post, .msb-status-night { color: #ffc107; font-weight: 600; user-select: none; }
        .msb-status-closed { color: #c62828; font-weight: 600; user-select: none; }
        .msb-refresh {
          font-size: 12px;
          color: #888888;
          text-align: center;
          padding: 0 4px;
          margin: 0;
          margin-top: 6px;
          transition: outline 0.2s;
          border-radius: 2px;
          user-select: none;
        }
        .msb-refresh:hover {
          outline: 1px solid #ffffff;
          outline-offset: 2px;
        }
      `}</style>
      <div className={`msb-banner ${getBannerClass(status)}`}>
        <div className="msb-content">
          <div className="msb-center">
            <span className="msb-label">US Stock Market: </span>
            <span className={getStatusClass(status)}>{getStatusLabel(status)}</span>
            <span className="msb-time">
              (NY {nyTimeLabel} {timeZone})
            </span>
          </div>
          {lastRefreshTime && timeAgo && (
            <div
              className="msb-refresh"
              onClick={onRefresh}
              style={{ cursor: isLoading ? "wait" : "pointer" }}
            >
              Last refreshed: {isLoading ? "Refreshing..." : timeAgo}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
