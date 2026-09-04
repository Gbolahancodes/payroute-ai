import { useEffect, useRef, useState } from "react";
import type { RiskTier } from "@/types";

const colorMap: Record<RiskTier, string> = { 
  low: "var(--risk-low)", 
  medium: "var(--risk-med)", 
  high: "var(--risk-high)" 
};

export default function RiskGauge({ value, tier, baseRate }: {
  value: number;
  tier: RiskTier;
  baseRate: number;
}) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>(0);

  useEffect(() => {
    const start = display;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 750);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(start + (value - start) * eased);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const R = 78, cx = 120, cy = 110;
  const arcPoint = (frac: number) => {
    const a = Math.PI - frac * Math.PI;
    return [cx + R * Math.cos(a), cy - R * Math.sin(a)];
  };

  const angle = Math.PI - display * Math.PI;
  const [nx, ny] = [cx + (R - 4) * Math.cos(angle), cy - (R - 4) * Math.sin(angle)];
  const color = colorMap[tier];

  const arc = (from: number, to: number) => {
    const [x1, y1] = arcPoint(from);
    const [x2, y2] = arcPoint(to);
    return `M ${x1} ${y1} A ${R} ${R} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const zones = [
    { from: 0, to: 0.1, c: "var(--risk-low)" },
    { from: 0.1, to: 0.3, c: "var(--risk-med)" },
    { from: 0.3, to: 1, c: "var(--risk-high)" },
  ];

  const [bx, by] = arcPoint(baseRate);
  const tierLabel = tier === "low" ? "Safe to send" : tier === "medium" ? "Elevated risk" : "High risk — reroute";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0" }}>
      <svg viewBox="0 0 240 130" style={{ width: "100%", maxWidth: 300 }}>
        <path d={arc(0, 1)} fill="none" stroke="var(--rule-2)" strokeWidth="10" strokeLinecap="butt" />
        {zones.map((z) => (
          <path
            key={z.from}
            d={arc(z.from, z.to)}
            fill="none"
            stroke={z.c}
            strokeWidth="10"
            strokeLinecap="butt"
            opacity={display >= z.from ? 0.85 : 0.12}
            style={{ transition: "opacity 0.5s" }}
          />
        ))}
        <circle cx={bx} cy={by} r="2.5" fill="var(--ink)" opacity="0.25" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill="var(--white)" stroke={color} strokeWidth="2" />
      </svg>
      <div style={{ marginTop: -8, textAlign: "center" }}>
        <div className="font-mono tabular-nums" style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color }}>
          {Math.round(display * 100)}<span style={{ fontSize: 22, fontWeight: 400 }}>%</span>
        </div>
        <div className="font-mono text-[11px] font-semibold uppercase mt-1" style={{ color, letterSpacing: "0.12em" }}>
          {tierLabel}
        </div>
        <div className="font-mono text-[10px] mt-1" style={{ color: "var(--ink-3)" }}>
          base rate {(baseRate * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}