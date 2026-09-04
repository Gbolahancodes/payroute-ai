import { CHANNELS, type Channel, type ChannelScore, type RiskTier } from "@/types";
import { Badge } from "./ui/primitives";

const TC: Record<RiskTier, string> = { 
  low: "var(--risk-low)", 
  medium: "var(--risk-med)", 
  high: "var(--risk-high)" 
};

export default function ChannelComparison({
  scores,
  current,
  recommended,
  onPick,
}: {
  scores: ChannelScore[];
  current: Channel;
  recommended?: Channel;
  onPick: (c: Channel) => void;
}) {
  const best = Math.min(...scores.map((s) => s.failureProbability));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
      {scores.map((s, i) => {
        const label = CHANNELS.find((c) => c.id === s.channel)!;
        const isCurrent = s.channel === current;
        const isBest = s.failureProbability === best;
        const isRec = s.channel === recommended;
        return (
          <button
            key={s.channel}
            onClick={() => onPick(s.channel)}
            className="fade-up"
            style={{
              animationDelay: `${i * 45}ms`,
              display: "flex",
              flexDirection: "column",
              padding: 16,
              textAlign: "left",
              background: "transparent",
              border: "none",
              borderLeft: i > 0 ? "1px solid var(--rule)" : "none",
              borderTop: isRec ? "2px solid var(--ember)" : "2px solid transparent",
              cursor: "pointer",
              position: "relative",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cream)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {isBest && (
              <span
                className="font-mono text-[8px] uppercase"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  border: "1px solid rgba(26,107,62,0.5)",
                  background: "var(--risk-low-bg)",
                  padding: "2px 6px",
                  color: "var(--risk-low)",
                  letterSpacing: "0.12em",
                }}
              >
                safest
              </span>
            )}
            <div className="font-mono text-[9px] uppercase" style={{ color: "var(--ink-3)", letterSpacing: "0.18em", marginBottom: 4 }}>
              {label.short}
              {isCurrent && <span style={{ marginLeft: 6, color: "var(--ember)" }}>selected</span>}
            </div>
            <div className="font-mono tabular-nums" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: TC[s.tier], marginTop: 4 }}>
              {(s.failureProbability * 100).toFixed(1)}<span style={{ fontSize: 14, fontWeight: 400 }}>%</span>
            </div>
            <div style={{ marginTop: 8 }}>
              <Badge tier={s.tier}>{s.tier}</Badge>
            </div>
            <div
              className="font-mono text-[10px]"
              style={{ marginTop: 12, borderTop: "1px solid var(--rule)", paddingTop: 8, color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 4 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>ETA</span><span style={{ color: "var(--ink-2)" }}>~{s.etaSeconds}s</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Fee</span><span style={{ color: "var(--ink-2)" }}>₦{s.feeNaira}</span>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-2)" }}>{label.label}</div>
          </button>
        );
      })}
    </div>
  );
}