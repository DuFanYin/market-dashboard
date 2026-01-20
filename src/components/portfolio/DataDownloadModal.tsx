import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import type { PortfolioData } from "@/types/portfolio";
import type { AssetAllocation, AssetBreakdown } from "@/hooks/usePortfolioCalculations";
import type { SummaryItem } from "@/types/portfolio";
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
}: DataDownloadModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<"export" | "yaml">("export");
  const [yamlContent, setYamlContent] = useState<string>("");
  const [isYamlLoading, setIsYamlLoading] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [isSavingYaml, setIsSavingYaml] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadYaml = async () => {
    try {
      setIsYamlLoading(true);
      setYamlError(null);
      const res = await fetch("/api/portfolio/yaml", {
        method: "GET",
      });
      if (!res.ok) {
        throw new Error(`Failed to load YAML (status ${res.status})`);
      }
      const json = (await res.json()) as { yaml?: string };
      setYamlContent(json.yaml ?? "");
    } catch (err) {
      console.error("Failed to load YAML:", err);
      setYamlError("Failed to load YAML content.");
    } finally {
      setIsYamlLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeTab === "yaml" && !yamlContent && !isYamlLoading && !yamlError) {
      void loadYaml();
    }
  }, [isOpen, activeTab, yamlContent, isYamlLoading, yamlError]);

  // Reset tab state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setActiveTab("export");
      setYamlContent("");
      setIsYamlLoading(false);
      setYamlError(null);
      setIsSavingYaml(false);
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
    output += `USD/SGD Rate: ${data.usd_sgd_rate}\n\n`;

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

  const handleSaveYaml = async () => {
    try {
      setIsSavingYaml(true);
      setSaveSuccess(false);
      setYamlError(null);
      const res = await fetch("/api/portfolio/yaml", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ yaml: yamlContent }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `Failed to save YAML (status ${res.status})`);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1200);
    } catch (err) {
      console.error("Failed to save YAML:", err);
      setYamlError("Failed to save YAML. Please check syntax.");
    } finally {
      setIsSavingYaml(false);
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
            className={`${styles.modalTab} ${activeTab === "yaml" ? styles.modalTabActive : ""}`}
            onClick={() => setActiveTab("yaml")}
          >
            YAML
          </button>
        </div>
        <div className={styles.modalBody}>
          {activeTab === "export" ? (
            <pre className={styles.modalText}>{formatAllData()}</pre>
          ) : (
            <div className={styles.yamlEditorContainer}>
              {isYamlLoading ? (
                <div className={styles.yamlStatusText}>Loading YAML...</div>
              ) : (
                <textarea
                  className={styles.yamlEditor}
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  spellCheck={false}
                />
              )}
              {yamlError && <div className={styles.yamlErrorText}>{yamlError}</div>}
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
              onClick={handleSaveYaml}
              disabled={isSavingYaml || isYamlLoading}
            >
              {isSavingYaml ? "Saving..." : saveSuccess ? "Saved!" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

