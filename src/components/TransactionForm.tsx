import { BANKS, CHANNELS, type TransactionInput } from "../types";
import { Button, Field, Select } from "./ui/primitives";

export default function TransactionForm({ tx, onChange, onScore, loading }: {
  tx: TransactionInput;
  onChange: (tx: TransactionInput) => void;
  onScore: () => void;
  loading: boolean;
}) {
  const set = <K extends keyof TransactionInput>(k: K, v: TransactionInput[K]) => {
    let updated = { ...tx, [k]: v };
    
    // Auto-adjust receiver bank if it conflicts with the new sender bank
    if (k === "senderBank" && v === tx.receiverBank) {
      const alternative = BANKS.find((b) => b !== v);
      if (alternative) updated.receiverBank = alternative;
    }
    
    onChange(updated);
  };

  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
      <Field label="Amount (₦)">
        <div style={{ position: "relative" }}>
          <span
            className="font-mono text-[13px]"
            style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)", pointerEvents: "none" }}
          >
            ₦
          </span>
          <input
            type="number"
            value={tx.amount}
            min={100}
            step={1000}
            onChange={(e) => set("amount", Math.max(0, Number(e.target.value)))}
            className="input-line"
            style={{ paddingLeft: 16 }}
          />
        </div>
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Sender bank">
          <Select value={tx.senderBank} onChange={(e) => set("senderBank", e.target.value as TransactionInput["senderBank"])}>
            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        
        <Field label="Receiver bank">
          <Select value={tx.receiverBank} onChange={(e) => set("receiverBank", e.target.value as TransactionInput["receiverBank"])}>
            {BANKS
              .filter((b) => b !== tx.senderBank) // Filter out the sender bank dynamically
              .map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Channel">
        <Select value={tx.channel} onChange={(e) => set("channel", e.target.value as TransactionInput["channel"])}>
          {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
      </Field>

      <Field label={`Time of day — ${String(tx.hour).padStart(2, "0")}:00`}>
        <input
          type="range" min={0} max={23} value={tx.hour}
          onChange={(e) => set("hour", Number(e.target.value))}
          className="range-slider"
          style={{ marginTop: 8 }}
        />
        <div className="font-mono text-[9px]" style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: "var(--ink-3)", letterSpacing: "0.12em" }}>
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </Field>

      <Button onClick={onScore} disabled={loading} className="w-full" style={{ marginTop: 4 }}>
        {loading ? (
          <>
            <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
            Scoring...
          </>
        ) : "Score transaction"}
      </Button>
    </div>
  );
}