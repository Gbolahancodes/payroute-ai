import {
  BANKS,
  CHANNELS,
  type AgentRecommendation,
  type Bank,
  type Channel,
  type ChannelScore,
  type CorridorGraph,
  type DriftSummary,
  type GraphEdge,
  type PredictResponse,
  type RiskTier,
  type ShapFactor,
  type TransactionInput,
} from "../types";

const BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type ApiMode = "backend" | "mock";
let _mode: ApiMode = "mock";
let _modeResolved = false;
let _modeListeners: Array<(m: ApiMode) => void> = [];

export function getApiMode(): ApiMode {
  return _mode;
}

export function onApiModeChange(fn: (m: ApiMode) => void): () => void {
  _modeListeners.push(fn);
  return () => { _modeListeners = _modeListeners.filter((l) => l !== fn); };
}

function setMode(m: ApiMode) {
  if (_mode === m && _modeResolved) return;
  _mode = m;
  _modeResolved = true;
  _modeListeners.forEach((fn) => fn(m));
}

let _pingPromise: Promise<boolean> | null = null;
export async function pingBackend(): Promise<boolean> {
  if (_pingPromise) return _pingPromise;
  _pingPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
      const ok = res.ok;
      setMode(ok ? "backend" : "mock");
      return ok;
    } catch {
      setMode("mock");
      return false;
    }
  })();
  return _pingPromise;
}

async function apiFetch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: body !== undefined ? "POST" : "GET",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} — ${res.status}`);
  return res.json() as Promise<T>;
}

// --- Mock Engine Helpers ---
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const CHANNEL_RISK: Record<Channel, number> = {
  bank_transfer: 0.0,
  card: -0.35,
  ussd: 0.55,
  mobile_money: 0.25,
};
const CHANNEL_ETA: Record<Channel, number> = {
  bank_transfer: 12,
  card: 4,
  ussd: 30,
  mobile_money: 18,
};
const CHANNEL_FEE = (amount: number): Record<Channel, number> => ({
  bank_transfer: Math.min(50, 10 + amount * 0.0005),
  card: Math.max(100, amount * 0.015),
  ussd: 20,
  mobile_money: Math.min(100, amount * 0.01),
});

let degradedCorridors = new Set<string>();
function corridorKey(a: Bank, b: Bank) {
  return `${a}->${b}`;
}
export function corridorReliability(a: Bank, b: Bank): number {
  const base = 0.72 + hash(corridorKey(a, b)) * 0.26;
  const key = corridorKey(a, b);
  if (degradedCorridors.has(key)) return clamp(base - 0.45);
  return clamp(base);
}
function timeRisk(hour: number): number {
  const night = hour >= 23 || hour <= 4 ? 0.5 : 0;
  const rush = hour >= 8 && hour <= 10 ? 0.2 : 0;
  return night + rush;
}
function amountRisk(amount: number): number {
  const l = Math.log10(Math.max(amount, 1000));
  return (l - 4) * 0.6;
}
const BASE_RATE = 0.087;

function mockScore(tx: TransactionInput): { p: number; shap: ShapFactor[] } {
  const rel = corridorReliability(tx.senderBank, tx.receiverBank);
  const intercept = -2.6;
  const relTerm = (0.85 - rel) * 6.0;
  const chanTerm = CHANNEL_RISK[tx.channel];
  const amtTerm = amountRisk(tx.amount);
  const timeTerm = timeRisk(tx.hour);
  const z = intercept + relTerm + chanTerm + amtTerm + timeTerm;
  const p = clamp(sigmoid(z), 0.002, 0.985);
  const shap: ShapFactor[] = [
    { feature: "corridor_reliability", label: `Corridor health ${(rel * 100).toFixed(0)}%`, contribution: relTerm },
    { feature: "channel", label: `Channel: ${CHANNELS.find((c) => c.id === tx.channel)!.short}`, contribution: chanTerm },
    { feature: "amount", label: `Amount ${tx.amount.toLocaleString()}`, contribution: amtTerm },
    { feature: "time_of_day", label: `Hour ${String(tx.hour).padStart(2, "0")}:00`, contribution: timeTerm },
  ].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { p, shap };
}

export function tierOf(p: number): RiskTier {
  if (p < 0.1) return "low";
  if (p < 0.3) return "medium";
  return "high";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mockChannelScores(tx: TransactionInput): ChannelScore[] {
  const fees = CHANNEL_FEE(tx.amount);
  return CHANNELS.map(({ id }) => {
    const { p } = mockScore({ ...tx, channel: id });
    return { channel: id, failureProbability: p, tier: tierOf(p), etaSeconds: CHANNEL_ETA[id], feeNaira: Math.round(fees[id]) };
  });
}

function buildMockAgent(tx: TransactionInput, compare: ChannelScore[]): AgentRecommendation {
  const best = [...compare].sort((a, b) => a.failureProbability - b.failureProbability)[0];
  const current = compare.find((c) => c.channel === tx.channel)!;
  const rel = corridorReliability(tx.senderBank, tx.receiverBank);
  const steps: AgentRecommendation["steps"] = [
    {
      tool: "get_corridor_health",
      args: { bank_a: tx.senderBank, bank_b: tx.receiverBank },
      result: `reliability=${(rel * 100).toFixed(0)}% ${rel < 0.55 ? "(DEGRADED)" : "(nominal)"}`,
      ms: 42,
    },
    {
      tool: "get_alternate_routes",
      args: { amount: tx.amount, from: tx.senderBank, to: tx.receiverBank },
      result: `scored ${compare.length} channels — best=${CHANNELS.find((c) => c.id === best.channel)!.short} @ ${(best.failureProbability * 100).toFixed(1)}%`,
      ms: 88,
    },
  ];
  const savings = current.failureProbability - best.failureProbability;
  const rationale =
    best.channel === tx.channel
      ? `${CHANNELS.find((c) => c.id === tx.channel)!.short} is already the safest rail for this corridor (${(current.failureProbability * 100).toFixed(1)}% predicted failure). Proceed.`
      : `Route via ${CHANNELS.find((c) => c.id === best.channel)!.label} instead — it lowers predicted failure from ${(current.failureProbability * 100).toFixed(1)}% to ${(best.failureProbability * 100).toFixed(1)}% (−${(savings * 100).toFixed(1)}pts) on the ${tx.senderBank} → ${tx.receiverBank} corridor${rel < 0.55 ? ", which is currently degraded" : ""}.`;
  return { steps, recommendedChannel: best.channel, rationale, mode: "rule-based" };
}

// --- Public API ---
export async function predict(tx: TransactionInput): Promise<PredictResponse> {
  const live = await pingBackend();
  if (live) {
    const data = await apiFetch<any>("/predict", tx);
    return {
      failureProbability: data.failure_probability ?? data.failureProbability ?? 0,
      tier: data.tier ?? "low",
      baseRate: data.base_rate ?? data.baseRate ?? 0.087,
      shap: data.shap ?? [],
      agent: {
        steps: data.agent?.steps ?? [],
        recommendedChannel: data.agent?.recommended_channel ?? data.agent?.recommendedChannel,
        rationale: data.agent?.rationale ?? "",
        mode: data.agent?.mode ?? "rule-based"
      }
    };
  }
  
  await delay(420);
  const { p, shap } = mockScore(tx);
  const compare = mockChannelScores(tx);
  return { failureProbability: p, tier: tierOf(p), baseRate: BASE_RATE, shap, agent: buildMockAgent(tx, compare) };
}

export async function predictCompare(tx: TransactionInput): Promise<ChannelScore[]> {
  const live = await pingBackend();
  if (live) {
    const data = await apiFetch<any[]>("/predict/compare", tx);
    return data.map((s: any) => ({
      channel: s.channel,
      failureProbability: s.failure_probability ?? s.failureProbability ?? 0,
      tier: s.tier ?? "low",
      etaSeconds: s.eta_seconds ?? s.etaSeconds ?? 5,
      feeNaira: s.fee_naira ?? s.feeNaira ?? 50
    }));
  }
  
  await delay(300);
  return mockChannelScores(tx);
}

export function getCorridorGraph(): CorridorGraph {
  const n = BANKS.length;
  const nodes = BANKS.map((id, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { id, x: 0.5 + Math.cos(angle) * 0.38, y: 0.5 + Math.sin(angle) * 0.38, volume: 0.3 + hash(id) * 0.7 };
  });
  const edges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = BANKS[i];
      const b = BANKS[j];
      if (hash(`edge-${a}-${b}`) > 0.55) {
        edges.push({
          source: a,
          target: b,
          reliability: corridorReliability(a, b),
          degraded: degradedCorridors.has(corridorKey(a, b)) || degradedCorridors.has(corridorKey(b, a)),
        });
      }
    }
  }
  return { nodes, edges };
}

export async function simulateDegradation(): Promise<{ graph: CorridorGraph; drift: DriftSummary }> {
  const live = await pingBackend();
  if (live) return apiFetch<{ graph: CorridorGraph; drift: DriftSummary }>("/simulate-degradation");
  
  await delay(500);
  const toggleOn = degradedCorridors.size === 0;
  degradedCorridors = new Set();
  let affected = 0;
  if (toggleOn) {
    const targets: [Bank, Bank][] = [
      ["Opay", "GTBank"], ["Opay", "Access Bank"],
      ["Moniepoint", "Zenith Bank"], ["Moniepoint", "UBA"], ["Kuda", "First Bank"],
    ];
    for (const [a, b] of targets) {
      degradedCorridors.add(corridorKey(a, b));
      degradedCorridors.add(corridorKey(b, a));
      affected++;
    }
  }
  const drift: DriftSummary = {
    degraded: toggleOn,
    corridorsAffected: affected,
    baselineFailureRate: BASE_RATE,
    currentFailureRate: toggleOn ? 0.243 : BASE_RATE,
    psi: toggleOn ? 0.38 : 0.02,
    window: "last 6h vs baseline",
  };
  return { graph: getCorridorGraph(), drift };
}

export function isDegraded(): boolean {
  return degradedCorridors.size > 0;
}