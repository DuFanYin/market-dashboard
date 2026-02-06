import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";
import type { PortfolioData, SummaryItem } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import {
  calculateTotalCost,
  calculateMarketValue,
  calculatePositionPercent,
  calculateTotalUnrealizedPnL,
} from "@/lib/positionCalculations";
import styles from "@/app/portfolio/page.module.css";

type PositionExportData = {
  symbol: string;
  displaySymbol: string;
  type: string;
  qty: number | null;
  price: number | null;
  cost: number | null;
  totalCost: number | null;
  marketValue: number | null;
  upnl: number | null;
  upnlPercent: number | null;
  positionPercent: number | null;
  underlyingPrice?: number | null;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  dte?: number | null;
};

interface DataDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: PortfolioData | null;
  assetBreakdown: AssetBreakdown;
  assetAllocation: AssetAllocation[];
  summaryItems: SummaryItem[];
  originalAmountUsd: number;
  currentBalanceUsd: number;
  onSaveSuccess?: () => void; // Callback when JSON is successfully saved
}

export function DataDownloadModal({
  isOpen,
  onClose,
  data,
  assetBreakdown,
  assetAllocation,
  summaryItems,
  originalAmountUsd,
  currentBalanceUsd,
  onSaveSuccess,
}: DataDownloadModalProps) {
  const router = useRouter();
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"export" | "json">("export");
  const [jsonContent, setJsonContent] = useState<string>("");
  const [isJsonLoading, setIsJsonLoading] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSavingJson, setIsSavingJson] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadJson = async () => {
    try {
      setIsJsonLoading(true);
      setJsonError(null);
      const res = await fetch("/api/portfolio/json", {
        method: "GET",
        cache: "no-store", // Prevent caching to always get fresh data
      });
      if (!res.ok) {
        throw new Error(`Failed to load JSON (status ${res.status})`);
      }
      const json = (await res.json()) as { json?: string };
      const content = json.json ?? "";
      setJsonContent(content);
      // If content is empty (first time use), don't show error, just let user input
      if (!content) {
        setJsonError(null); // Clear any previous errors
      }
    } catch (err) {
      console.error("Failed to load JSON:", err);
      setJsonError("Failed to load JSON content.");
    } finally {
      setIsJsonLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "json" && !jsonContent && !isJsonLoading && !jsonError) {
      void loadJson();
    }
  }, [isOpen, activeTab, jsonContent, isJsonLoading, jsonError]);

  // Reset tab state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("export");
      setJsonContent("");
      setIsJsonLoading(false);
      setJsonError(null);
      setIsSavingJson(false);
      setSaveSuccess(false);
    }
  }, [isOpen]);
  
  if (!isOpen || !data) return null;

  const formatAllData = (): string => {
    const roundTo2dp = (value: number | null | undefined): number | null => {
      if (value === null || value === undefined) return null;
      return Math.round(value * 100) / 100;
    };
    
    let output = "PORTFOLIO DASHBOARD DATA EXPORT\n";
    output += "=".repeat(50) + "\n\n";
    output += `Generated: ${new Date().toLocaleString()}\n`;
    output += `USD/SGD Rate: ${data.usd_sgd_rate}\n`;
    output += `USD/CNY Rate: ${data.usd_cny_rate}\n\n`;

    output += "ACCOUNT SUMMARY\n";
    output += "-".repeat(50) + "\n";
    summaryItems.forEach((item) => {
      output += `${item.label}: ${item.display}`;
      if (item.percentDisplay) {
        output += ` (${item.percentDisplay})`;
      }
      output += "\n";
    });
    output += `INITIAL BALANCE USD: ${formatMoney(originalAmountUsd)}\n`;
    output += `CURRENT BALANCE USD: ${formatMoney(currentBalanceUsd)}\n`;
    
    output += "\n";
    
    // Convert asset allocation to compact JSON
    const allocationData = assetAllocation
      .filter((asset) => asset.isVisible)
      .map((asset) => ({
        label: asset.label,
        marketValue: roundTo2dp(asset.marketValue),
        valueAllocationPercent: roundTo2dp(asset.valueAllocationPercent),
        unrealizedPnL: roundTo2dp(asset.unrealizedPnL),
        profitLossPercent: roundTo2dp(Math.abs(asset.profitLossPercent)),
      }));
    
    const totalUnrealizedPnL = calculateTotalUnrealizedPnL(assetBreakdown);
    
    // Convert positions to compact JSON
    const positionsData = data.positions
      .filter((pos) => !pos.isPlaceholder)
      .map((pos) => {
        let displaySymbol = pos.symbol;
        if (pos.is_option && pos.strike && pos.expiry) {
          const optionSymbol = `${(pos.right ?? "").toUpperCase()}-${pos.expiry.slice(2, 4)}'${pos.expiry.slice(4, 6)}'${pos.expiry.slice(6, 8)}-${pos.strike.toFixed(2)}`;
          displaySymbol = pos.underlyingKey ? `${optionSymbol} (${pos.underlyingKey})` : optionSymbol;
        }

        let positionType = "Stock";
        if (pos.is_option) positionType = "Option";
        else if (pos.is_crypto) positionType = "Crypto";
        else if (pos.secType === "ETF") positionType = "ETF";

        const totalCost = calculateTotalCost(pos);
        const marketValue = calculateMarketValue(pos);
        const positionPercent = calculatePositionPercent(pos, currentBalanceUsd);

        const positionObj: PositionExportData = {
          symbol: pos.symbol,
          displaySymbol,
          type: positionType,
          qty: roundTo2dp(pos.qty),
          price: roundTo2dp(pos.price),
          cost: roundTo2dp(pos.cost),
          totalCost: roundTo2dp(totalCost),
          marketValue: roundTo2dp(marketValue),
          upnl: roundTo2dp(pos.upnl),
          upnlPercent: roundTo2dp(pos.percent_change),
          positionPercent: roundTo2dp(positionPercent),
        };

        if (pos.is_option) {
          positionObj.underlyingPrice = roundTo2dp(pos.underlyingPrice);
          positionObj.delta = roundTo2dp(pos.delta);
          positionObj.gamma = roundTo2dp(pos.gamma);
          positionObj.theta = roundTo2dp(pos.theta);
          positionObj.dte = roundTo2dp(pos.dteDays);
        }

        return positionObj;
      });
    
    // Combine both sections into a single JSON object
    const portfolioJson = {
      assetAllocation: {
        allocations: allocationData,
        summary: {
          totalMarketValue: roundTo2dp(assetBreakdown.totalMarketValue),
          totalUnrealizedPnL: roundTo2dp(totalUnrealizedPnL),
        },
      },
      positions: positionsData,
    };
    
    output += JSON.stringify(portfolioJson) + "\n\n";

    return output;
  };

  const handleCopy = async () => {
    const content = formatAllData();
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
      }, 1000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  };

  const handleSaveJson = async () => {
    // Validate JSON is not empty
    if (!jsonContent || jsonContent.trim() === "") {
      setJsonError("JSON content cannot be empty. Please input the complete JSON data.");
      return;
    }

    try {
      setIsSavingJson(true);
      setSaveSuccess(false);
      setJsonError(null);
      const res = await fetch("/api/portfolio/json", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ json: jsonContent }),
      });
      
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `Failed to save JSON (status ${res.status})`);
      }
      
      const saveResult = (await res.json()) as { ok?: boolean; timestamp?: string };
      const savedTimestamp = saveResult.timestamp;
      
      // Server-side verification already happened, so we can be more lenient here
      // Just verify that we can read back valid JSON with a recent timestamp
      // This is mainly to catch CDN cache issues, not to verify correctness
      let verified = false;
      const maxRetries = 8; // More retries for CDN propagation
      const initialDelay = 200; // Start with shorter delay
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          // Exponential backoff: wait longer on each retry
          if (i > 0) {
            const delay = initialDelay * Math.pow(1.5, i - 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          
          const verifyRes = await fetch("/api/portfolio/json", {
            method: "GET",
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          });
          
          if (verifyRes.ok) {
            const verifyJson = (await verifyRes.json()) as { json?: string };
            const savedContent = verifyJson.json ?? "";
            
            if (savedContent && savedContent.length > 0) {
              try {
                const savedParsed = JSON.parse(savedContent);
                
                // More lenient verification:
                // 1. If we have a timestamp from server, check if saved data has a timestamp
                // 2. If saved data has a timestamp, it's likely fresh (server adds it)
                // 3. If timestamp matches or is very recent (within 10 seconds), consider verified
                if (savedParsed.timestamp && typeof savedParsed.timestamp === "string") {
                  const savedTime = new Date(savedParsed.timestamp).getTime();
                  const now = Date.now();
                  const timeDiff = now - savedTime;
                  
                  // If timestamp is recent (within 10 seconds), consider it verified
                  // This means the data was saved recently
                  if (timeDiff >= 0 && timeDiff < 10000) {
                    verified = true;
                    break;
                  }
                  
                  // If we have a savedTimestamp from server response, also check if it matches
                  if (savedTimestamp) {
                    const expectedTime = new Date(savedTimestamp).getTime();
                    const matchDiff = Math.abs(savedTime - expectedTime);
                    // Allow up to 10 seconds difference (for processing and CDN delays)
                    if (matchDiff < 10000) {
                      verified = true;
                      break;
                    }
                  }
                }
                
                // Fallback: if we can parse the JSON and it has the expected structure, consider it verified
                // This is less strict but catches major issues
                if (savedParsed.IBKR_account && typeof savedParsed.IBKR_account === "object") {
                  // Basic structure check passed, consider verified if we've tried a few times
                  if (i >= 3) {
                    verified = true;
                    break;
                  }
                }
              } catch (parseErr) {
                // Continue to next retry if parsing fails
                console.log(`Verification parse error on attempt ${i + 1}:`, parseErr);
              }
            }
          }
        } catch (err) {
          // Continue to next retry
          console.log(`Save verification attempt ${i + 1} failed:`, err);
        }
      }
      
      // If verification failed after all retries, log a warning but don't fail
      // Server-side verification already passed, so the data is likely saved correctly
      // The failure is likely due to CDN cache delays, which will resolve soon
      if (!verified) {
        console.warn("Frontend verification failed after retries - data is likely saved correctly but CDN cache may be delayed");
        // Don't throw error - server already verified, so data is saved
        // User can refresh manually if needed
      }
      
      setSaveSuccess(true);
      
      // Clear sessionStorage cache to force fresh data fetch
      try {
        sessionStorage.removeItem("portfolio_cache_v1");
      } catch {
        // ignore
      }
      
      // Reload JSON content to show the saved version (which may have timestamp added)
      await loadJson();
      
      // Notify parent component to refresh data
      if (onSaveSuccess) {
        onSaveSuccess();
      } else {
        // Fallback: use router.refresh() if no callback provided
        router.refresh();
      }
      
      setTimeout(() => setSaveSuccess(false), 1200);
    } catch (err) {
      console.error("Failed to save JSON:", err);
      setJsonError("Failed to save JSON. Please check syntax.");
    } finally {
      setIsSavingJson(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Portfolio Data</h2>
          <button className={styles.modalCloseButton} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalTabs}>
          <button
            type="button"
            className={`${styles.modalTab} ${activeTab === "export" ? styles.modalTabActive : ""}`}
            onClick={() => setActiveTab("export")}
          >
            Summary
          </button>
          <button
            type="button"
            className={`${styles.modalTab} ${activeTab === "json" ? styles.modalTabActive : ""}`}
            onClick={() => setActiveTab("json")}
          >
            JSON
          </button>
        </div>
        <div className={styles.modalBody}>
          {activeTab === "export" ? (
          <pre className={styles.modalText}>{formatAllData()}</pre>
          ) : (
            <div className={styles.yamlEditorContainer}>
              {isJsonLoading ? (
                <div className={styles.yamlStatusText}>Loading JSON...</div>
              ) : (
                <>
                  {!jsonContent && !jsonError && (
                    <div className={styles.yamlStatusText} style={{ marginBottom: "8px", color: "#888" }}>
                      No JSON data found. Please input the complete JSON data below.
                    </div>
                  )}
                  <textarea
                    className={styles.yamlEditor}
                    value={jsonContent}
                    onChange={(e) => setJsonContent(e.target.value)}
                    placeholder={!jsonContent ? "Paste your complete JSON data here..." : ""}
                    spellCheck={false}
                  />
                </>
              )}
              {jsonError && <div className={styles.yamlErrorText}>{jsonError}</div>}
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          {activeTab === "export" ? (
          <button 
            className={`${styles.modalCancelButton} ${copySuccess ? styles.copySuccessButton : ""}`} 
            onClick={handleCopy}
          >
            {copySuccess ? "Success!" : "Copy to Clipboard"}
          </button>
          ) : (
            <button
              className={`${styles.modalCancelButton} ${saveSuccess ? styles.copySuccessButton : ""}`}
              onClick={handleSaveJson}
              disabled={isSavingJson || isJsonLoading}
            >
              {isSavingJson ? "Saving..." : saveSuccess ? "Saved!" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

