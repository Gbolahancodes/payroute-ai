import { useEffect, useState } from "react";
import {
  getApiMode,
  isDegraded,
  onApiModeChange,
  pingBackend,
  predict,
  predictCompare,
  type ApiMode,
} from "./api/client";
import TransactionForm from "./components/TransactionForm";
import { CHANNELS } from "./types";
import type { PredictResponse, TransactionInput } from "./types";

const DEFAULT_TX: TransactionInput = {
  amount: 250000,
  senderBank: "Opay",
  receiverBank: "GTBank",
  channel: "bank_transfer",
  hour: 23,
};

export default function App() {
  const [tx, setTx] = useState<TransactionInput>(DEFAULT_TX);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiMode, setApiMode] = useState<ApiMode>(getApiMode);

  useEffect(() => {
    pingBackend();
    return onApiModeChange(setApiMode);
  }, []);

  async function runScore(next: TransactionInput = tx) {
    setLoading(true);
    try {
      const [r] = await Promise.all([predict(next), predictCompare(next)]);
      setResult(r);
    } catch (err) {
      console.error("Scoring failed:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runScore(DEFAULT_TX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const degraded = isDegraded();
  const pct = result ? Math.round(result.failureProbability * 100) : null;
  const rec = result?.agent?.recommendedChannel;
  const recLabel = rec ? (CHANNELS.find((c) => c.id === rec)?.label ?? rec) : null;
  const isLive = apiMode === "backend";

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#0A0A0A" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #D0D0D0", padding: "18px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>
          PayRoute AI
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "5px 10px",
              border: "1px solid #D0D0D0",
              background: isLive ? "#0A0A0A" : "transparent",
              color: isLive ? "#fff" : "#888",
              userSelect: "none",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isLive ? "#fff" : "#888",
                flexShrink: 0,
                animation: isLive ? "pulse 1.8s ease-in-out infinite" : "none",
              }}
            />
            {isLive ? "Live backend" : "Browser mock"}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#888" }}>
            {degraded ? "Network degraded" : "Network nominal"}
          </div>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "#888", marginBottom: 24 }}>
            Transfer details
          </div>
          <TransactionForm tx={tx} onChange={setTx} onScore={() => runScore()} loading={loading} />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "#888", marginBottom: 24 }}>
            Risk score
          </div>
          {!result && !loading && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#888" }}>
              Score a transaction to see results.
            </div>
          )}
          {loading && !result && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#888" }}>
              Scoring...
            </div>
          )}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 72, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em" }}>
                  {pct}<span style={{ fontSize: 28, fontWeight: 400 }}>%</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 8, color: "#888" }}>
                  failure probability
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4, color: "#888" }}>
                  base rate {(result.baseRate * 100).toFixed(1)}%
                </div>
              </div>
              <div style={{ borderTop: "1px solid #D0D0D0", paddingTop: 28 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "#888", marginBottom: 12 }}>
                  Verdict
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600 }}>
                  {result.tier === "low" ? "Safe to send" : result.tier === "medium" ? "Elevated risk" : "High risk — reroute"}
                </div>
              </div>
              {recLabel && (
                <div style={{ borderTop: "1px solid #D0D0D0", paddingTop: 28 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em", color: "#888", marginBottom: 12 }}>
                    Recommended rail
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    {recLabel}
                  </div>
                  {result.agent?.rationale && (
                    <div style={{ fontSize: 13, lineHeight: 1.65, color: "#3A3A3A" }}>
                      {result.agent.rationale}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}