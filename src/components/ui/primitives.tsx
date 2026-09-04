import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function SectionLabel({
  label,
  sub,
  action,
}: {
  label: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3"
      style={{ borderBottom: "1px solid var(--rule)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="shrink-0"
          style={{ width: 2, height: 14, background: "var(--ink)", display: "block" }}
        />
        <span className="font-mono text-[10px] uppercase text-ink-3" style={{ letterSpacing: "0.18em" }}>
          {label}
        </span>
        {sub && (
          <span className="font-mono text-[9px] text-ink-3" style={{ opacity: 0.55 }}>
            {sub}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 border px-4 py-2 font-mono text-[11px] uppercase font-medium transition-all duration-150 focus:outline-none disabled:opacity-40 disabled:pointer-events-none cursor-pointer";
  const style: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--ink)", borderColor: "var(--ink)", color: "#fff" }
      : variant === "danger"
        ? { background: "var(--rule-2)", borderColor: "var(--ink)", color: "var(--ink)" }
        : { background: "transparent", borderColor: "var(--rule)", color: "var(--ink-2)" };

  return (
    <button className={`${base} ${className}`} style={{ ...style, letterSpacing: "0.12em", borderRadius: 0 }} {...props}>
      {children}
    </button>
  );
}

export function Badge({ tier, children }: { tier: "low" | "medium" | "high"; children: ReactNode }) {
  const styles = {
    low:    { color: "var(--risk-low)",  background: "var(--risk-low-bg)",  border: "1px solid var(--rule)" },
    medium: { color: "var(--risk-med)",  background: "var(--risk-med-bg)",  border: "1px solid var(--rule)" },
    high:   { color: "var(--risk-high)", background: "var(--risk-high-bg)", border: "1px solid var(--rule)" },
  }[tier];
  return (
    <span
      className="inline-flex items-center font-mono text-[9px] uppercase px-1.5 py-0.5"
      style={{ ...styles, letterSpacing: "0.15em", borderRadius: 0 }}
    >
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span
        className="mb-1 block font-mono text-[9px] uppercase text-ink-3"
        style={{ letterSpacing: "0.18em" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={`select-line ${className}`} {...props}>
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2"
        style={{ color: "var(--ink-3)" }}
        width="10" height="10" viewBox="0 0 10 10" fill="none"
      >
        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function tierColor(tier: "low" | "medium" | "high") {
  return { low: "var(--risk-low)", medium: "var(--risk-med)", high: "var(--risk-high)" }[tier];
}
