import type { ShapFactor } from "@/types";

export default function ShapWaterfall({ shap }: { shap: ShapFactor[] }) {
  const max = Math.max(...shap.map((s) => Math.abs(s.contribution)), 0.5);
  return (
    <div style={{ padding: "16px 20px" }}>
      <div
        className="font-mono text-[9px] uppercase"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 16,
          borderBottom: "1px solid var(--rule)",
          paddingBottom: 8,
          marginBottom: 12,
          color: "var(--ink-3)",
          letterSpacing: "0.18em",
        }}
      >
        <span>Feature</span>
        <span>Contribution</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {shap.map((s, i) => {
          const pct = (Math.abs(s.contribution) / max) * 44;
          const raises = s.contribution >= 0;
          const color = raises ? "var(--risk-high)" : "var(--risk-low)";
          return (
            <div key={s.feature} className="fade-up" style={{ animationDelay: `${i * 55}ms` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.3 }}>{s.label}</span>
                <span className="font-mono text-[11px] tabular-nums" style={{ color, flexShrink: 0 }}>
                  {raises ? "+" : ""}{s.contribution.toFixed(2)}
                </span>
              </div>
              <div style={{ position: "relative", height: 3, background: "var(--rule-2)" }}>
                <div style={{ position: "absolute", inset: 0, left: "50%", width: 1, background: "var(--rule)" }} />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    background: color,
                    width: `${pct}%`,
                    left: raises ? "50%" : `${50 - pct}%`,
                    transition: "all 0.5s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="font-mono text-[9px] uppercase"
        style={{ display: "flex", justifyContent: "space-between", marginTop: 16, color: "var(--ink-3)", letterSpacing: "0.14em" }}
      >
        <span style={{ color: "var(--risk-low)" }}>← lowers risk</span>
        <span>baseline</span>
        <span style={{ color: "var(--risk-high)" }}>raises risk →</span>
      </div>
    </div>
  );
}