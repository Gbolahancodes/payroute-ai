import { CHANNELS, type AgentRecommendation, type AgentStep, type Channel } from "@/types";

export default function AgentAdvisorPanel({ agent, loading }: {
  agent?: AgentRecommendation;
  loading?: boolean;
}) {
  return (
    <div style={{ padding: "16px 20px" }}>
      <div
        className="font-mono text-[11px]"
        style={{
          border: "1px solid var(--rule)",
          background: "var(--cream)",
          padding: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--ink-3)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--risk-low)", flexShrink: 0 }} />
          <span style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 9 }}>agent trace</span>
          <span
            style={{
              marginLeft: "auto",
              border: "1px solid var(--rule)",
              padding: "2px 6px",
              fontSize: 8,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
          >
            {agent?.mode ?? "rule-based"}
          </span>
        </div>
        {loading && !agent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1].map((i: number) => (
              <div key={i} className="pulse-soft" style={{ height: 16, background: "var(--rule-2)" }} />
            ))}
          </div>
        )}
        {!agent && !loading && (
          <span style={{ color: "var(--ink-3)", fontSize: 10 }}>Waiting for transaction score</span>
        )}
        {agent?.steps.map((step: AgentStep, i: number) => (
          <div
            key={i}
            className="fade-up"
            style={{
              borderLeft: "2px solid var(--rule)",
              paddingLeft: 12,
              paddingBottom: i < (agent.steps.length - 1) ? 12 : 0,
              animationDelay: `${i * 100}ms`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "var(--ember)" }}>›</span>
              <span style={{ color: "var(--ink)" }}>{step.tool}</span>
              <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--ink-3)" }}>{step.ms}ms</span>
            </div>
            <div style={{ marginTop: 2, paddingLeft: 12, color: "var(--ink-3)", fontSize: 10 }}>
              {Object.entries(step.args).map(([k, v]: [string, string | number]) => (
                <span key={k} style={{ marginRight: 8 }}>
                  {k}=<span style={{ color: "var(--ink-2)" }}>{String(v)}</span>
                </span>
              ))}
            </div>
            <div style={{ marginTop: 4, paddingLeft: 12, color: "var(--risk-low)", fontSize: 10 }}>→ {step.result}</div>
          </div>
        ))}
      </div>

      {agent && (
        <div
          className="fade-up"
          style={{
            borderLeft: "3px solid var(--ember)",
            background: "var(--ember-soft)",
            padding: "12px 16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="5" cy="5" r="4" fill="var(--ember)" />
              <path d="M5 3v3M5 7.5v.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span
              className="font-mono text-[9px] uppercase"
              style={{ color: "var(--ember)", letterSpacing: "0.18em" }}
            >
              recommendation
            </span>
            <span
              className="font-mono text-[9px] uppercase"
              style={{
                marginLeft: "auto",
                border: "1px solid rgba(181,68,15,0.3)",
                padding: "2px 6px",
                color: "var(--ember)",
              }}
            >
              {CHANNELS.find((c: { id: Channel; label: string; short: string }) => c.id === agent.recommendedChannel)?.short ?? agent.recommendedChannel}
            </span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink)", margin: 0 }}>{agent.rationale}</p>
        </div>
      )}
    </div>
  );
}