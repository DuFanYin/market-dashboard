"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePortfolioCalculations, usePortfolioData } from "@/hooks";
import { HamburgerNav } from "@/components/shared/HamburgerNav";
import { formatPortfolioExport } from "@/lib/portfolioExport";
import styles from "./page.module.css";

type TabId = "summary" | "json" | "history";

export default function DataPage() {
  const router = useRouter();
  const { data, isLoading } = usePortfolioData({ redirectOnNotFound: false });
  const applyMask = useCallback((value: string): string => value, []);
  const { assetBreakdown, summaryItems, assetAllocation } = usePortfolioCalculations(data, applyMask);

  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [copySuccess, setCopySuccess] = useState(false);
  const [jsonContent, setJsonContent] = useState("");
  const [isJsonLoading, setIsJsonLoading] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isSavingJson, setIsSavingJson] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<Array<Record<string, unknown>>>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadJson = useCallback(async () => {
    try {
      setIsJsonLoading(true);
      setJsonError(null);
      const res = await fetch("/api/portfolio/json", { method: "GET", cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = (await res.json()) as { json?: string };
      setJsonContent(json.json ?? "");
    } catch {
      setJsonError("Failed to load JSON.");
    } finally {
      setIsJsonLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setIsHistoryLoading(true);
      setHistoryError(null);
      const res = await fetch("/api/history", { cache: "no-store" });
      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as { error?: string; details?: string };
        const errorMsg = errorData.details || errorData.error || `HTTP ${res.status}`;
        throw new Error(`Failed to load history: ${errorMsg}`);
      }
      const entries = (await res.json()) as Array<Record<string, unknown>>;
      setHistoryEntries(entries);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load history.";
      console.error("[DataPage] Failed to load history:", errorMsg);
      setHistoryError(errorMsg);
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "json" && !jsonContent && !isJsonLoading && !jsonError) void loadJson();
  }, [activeTab, jsonContent, isJsonLoading, jsonError, loadJson]);

  useEffect(() => {
    if (activeTab === "history") void loadHistory();
  }, [activeTab, loadHistory]);

  const handleSaveJson = async () => {
    if (!jsonContent.trim()) {
      setJsonError("JSON content cannot be empty.");
      return;
    }
    try {
      setIsSavingJson(true);
      setJsonError(null);
      const res = await fetch("/api/portfolio/json", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: jsonContent }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Save failed");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1200);
      try {
        sessionStorage.removeItem("portfolio_cache_v1");
      } catch {
        /* ignore */
      }
      if (router) router.refresh();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Failed to save JSON.");
    } finally {
      setIsSavingJson(false);
    }
  };

  const handleCopySummary = async () => {
    if (!data) return;
    const text = formatPortfolioExport(
      data,
      assetAllocation,
      assetBreakdown,
      summaryItems,
      data.original_amount_usd,
      data.net_liquidation
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1000);
    } catch {
      /* ignore */
    }
  };

  const handleCopyHistory = async () => {
    try {
      const jsonlContent = historyEntries.map((e) => JSON.stringify(e)).join("\n") + (historyEntries.length ? "\n" : "");
      await navigator.clipboard.writeText(jsonlContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1000);
    } catch {
      /* ignore */
    }
  };

  const summaryText =
    data &&
    formatPortfolioExport(
      data,
      assetAllocation,
      assetBreakdown,
      summaryItems,
      data.original_amount_usd,
      data.net_liquidation
    );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <HamburgerNav />
            <h1 className={styles.title}>Data</h1>
          </div>
        </header>

        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "summary" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("summary")}
          >
            Summary
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "json" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("json")}
          >
            JSON
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "history" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("history")}
          >
            History
          </button>
        </div>

        <div className={styles.body}>
          {activeTab === "summary" && (
            <>
              {isLoading && !data && <div className={styles.placeholder}>Loading portfolio...</div>}
              {!isLoading && !data && <div className={styles.placeholder}>No portfolio data. Open Portfolio first.</div>}
              {data && summaryText && <pre className={styles.preText}>{summaryText}</pre>}
            </>
          )}
          {activeTab === "json" && (
            <div className={styles.editorContainer}>
              {isJsonLoading ? (
                <div className={styles.statusText}>Loading JSON...</div>
              ) : (
                <>
                  {!jsonContent && !jsonError && (
                    <div className={styles.statusText} style={{ marginBottom: 8, color: "#888" }}>
                      Paste or edit portfolio JSON below.
                    </div>
                  )}
                  <textarea
                    className={styles.editor}
                    value={jsonContent}
                    onChange={(e) => setJsonContent(e.target.value)}
                    placeholder="Paste JSON here..."
                    spellCheck={false}
                  />
                </>
              )}
              {jsonError && <div className={styles.errorText}>{jsonError}</div>}
            </div>
          )}
          {activeTab === "history" && (
            <>
              {isHistoryLoading && <div className={styles.statusText}>Loading history...</div>}
              {!isHistoryLoading && historyError && <div className={styles.errorText}>{historyError}</div>}
              {!isHistoryLoading && !historyError && (
                <>
                  {historyEntries.length === 0 && <div className={styles.statusText}>No history data.</div>}
                  {historyEntries.length > 0 && (
                    <div className={styles.tableContainer}>
                      <table className={styles.historyTable}>
                        <thead>
                          <tr>
                            <th>Date/Time</th>
                            <th>Net Liquidation</th>
                            <th>Principal (SGD)</th>
                            <th>USD/SGD Rate</th>
                            <th>Stock MV</th>
                            <th>Option MV</th>
                            <th>Crypto MV</th>
                            <th>ETF MV</th>
                            <th>Cash</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyEntries.map((entry, idx) => (
                            <tr key={idx}>
                              <td>{String(entry.datetime || "")}</td>
                              <td className={styles.numberCell}>
                                {typeof entry.net_liquidation === "number"
                                  ? entry.net_liquidation.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.principal_sgd === "number"
                                  ? entry.principal_sgd.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.usd_sgd_rate === "number" ? entry.usd_sgd_rate.toFixed(4) : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.total_stock_mv === "number"
                                  ? entry.total_stock_mv.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.total_option_mv === "number"
                                  ? entry.total_option_mv.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.total_crypto_mv === "number"
                                  ? entry.total_crypto_mv.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.total_etf_mv === "number"
                                  ? entry.total_etf_mv.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                              <td className={styles.numberCell}>
                                {typeof entry.cash === "number"
                                  ? entry.cash.toLocaleString("en-US", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })
                                  : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          {activeTab === "summary" && (
            <button
              type="button"
              className={`${styles.btn} ${copySuccess ? styles.btnSuccess : ""}`}
              onClick={handleCopySummary}
              disabled={!data}
            >
              {copySuccess ? "Copied!" : "Copy to Clipboard"}
            </button>
          )}
          {activeTab === "json" && (
            <button
              type="button"
              className={`${styles.btn} ${saveSuccess ? styles.btnSuccess : ""}`}
              onClick={handleSaveJson}
              disabled={isSavingJson || isJsonLoading}
            >
              {isSavingJson ? "Saving..." : saveSuccess ? "Saved!" : "Save"}
            </button>
          )}
          {activeTab === "history" && (
            <button
              type="button"
              className={`${styles.btn} ${copySuccess ? styles.btnSuccess : ""}`}
              onClick={handleCopyHistory}
              disabled={historyEntries.length === 0}
            >
              {copySuccess ? "Copied!" : "Copy JSONL to Clipboard"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
