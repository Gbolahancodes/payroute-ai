import { useState } from "react";
import type { CorridorGraph as GraphData, GraphNode, GraphEdge } from "@/types";

function edgeColor(r: number) {
  if (r < 0.55) return "var(--risk-high)";
  if (r < 0.75) return "var(--risk-med)";
  return "var(--risk-low)";
}

export default function CorridorGraph({ graph, activePair }: {
  graph: GraphData;
  activePair?: [string, string];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 100, H = 100;
  const pos = Object.fromEntries(graph.nodes.map((n: GraphNode) => [n.id, n]));
  const isActiveEdge = (s: string, t: string) =>
    activePair && ((s === activePair[0] && t === activePair[1]) || (s === activePair[1] && t === activePair[0]));

  return (
    <div style={{ padding: "16px 20px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxHeight: 260 }}>
        {graph.edges.map((e: GraphEdge) => {
          const a = pos[e.source], b = pos[e.target];
          if (!a || !b) return null;
          const active = isActiveEdge(e.source, e.target);
          const dim = hover && hover !== e.source && hover !== e.target;
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={a.x * W} y1={a.y * H} x2={b.x * W} y2={b.y * H}
              stroke={edgeColor(e.reliability)}
              strokeWidth={active ? 1.6 : 0.4 + e.reliability * 0.5}
              strokeLinecap="round"
              opacity={dim ? 0.06 : active ? 1 : 0.45}
              strokeDasharray={e.degraded ? "1.5 1.5" : undefined}
              style={{ transition: "stroke 0.6s, opacity 0.25s, stroke-width 0.25s" }}
            />
          );
        })}
        {graph.nodes.map((n: GraphNode) => {
          const isActive = activePair?.includes(n.id);
          const r = 1.4 + n.volume * 2.0;
          return (
            <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
              <circle
                cx={n.x * W} cy={n.y * H} r={r}
                fill={isActive ? "var(--ember)" : "var(--white)"}
                stroke={isActive ? "var(--ember)" : "var(--rule)"}
                strokeWidth={isActive ? 1 : 0.5}
                style={{ transition: "fill 0.3s, stroke 0.3s" }}
              />
              <text
                x={n.x * W} y={n.y * H - r - 1.5}
                textAnchor="middle"
                fill={hover === n.id || isActive ? "var(--ink)" : "var(--ink-3)"}
                fontSize="2.4"
                fontFamily="'JetBrains Mono', monospace"
                style={{ transition: "fill 0.2s" }}
              >
                {n.id}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="font-mono text-[9px] uppercase" style={{ display: "flex", gap: 20, marginTop: 4, color: "var(--ink-3)", letterSpacing: "0.14em" }}>
        <Legend c="var(--risk-low)" label="healthy" />
        <Legend c="var(--risk-med)" label="watch" />
        <Legend c="var(--risk-high)" label="degraded" />
        <span style={{ marginLeft: "auto", fontSize: 8, opacity: 0.6 }}>hover to highlight</span>
      </div>
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "block", width: 20, height: 1, background: c }} />
      {label}
    </span>
  );
}