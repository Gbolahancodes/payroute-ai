// PayRoute AI — shared types. Mirrors the FastAPI schema contract from the brief.

export type Channel = "bank_transfer" | "card" | "ussd" | "mobile_money";

export const CHANNELS: { id: Channel; label: string; short: string }[] = [
  { id: "bank_transfer", label: "Bank Transfer (NIP)", short: "NIP" },
  { id: "card", label: "Card", short: "CARD" },
  { id: "ussd", label: "USSD", short: "USSD" },
  { id: "mobile_money", label: "Mobile Money", short: "MOMO" },
];

export const BANKS = [
  "GTBank",
  "Access Bank",
  "Zenith Bank",
  "UBA",
  "First Bank",
  "Kuda",
  "Opay",
  "Moniepoint",
  "Fidelity Bank",
  "Stanbic IBTC",
] as const;

export type Bank = (typeof BANKS)[number];

export type RiskTier = "low" | "medium" | "high";

export interface TransactionInput {
  amount: number;
  senderBank: Bank;
  receiverBank: Bank;
  channel: Channel;
  hour: number; // 0-23
}

export interface ShapFactor {
  feature: string;
  label: string;
  contribution: number; // signed log-odds contribution
}

export interface AgentStep {
  tool: string;
  args: Record<string, string | number>;
  result: string;
  ms: number;
}

export interface AgentRecommendation {
  steps: AgentStep[];
  recommendedChannel: Channel;
  rationale: string;
  mode: "rule-based" | "llm";
}

export interface PredictResponse {
  failureProbability: number; // 0-1
  tier: RiskTier;
  baseRate: number;
  shap: ShapFactor[];
  agent: AgentRecommendation;
}

export interface ChannelScore {
  channel: Channel;
  failureProbability: number;
  tier: RiskTier;
  etaSeconds: number;
  feeNaira: number;
}

export interface GraphNode {
  id: Bank;
  x: number;
  y: number;
  volume: number;
}

export interface GraphEdge {
  source: Bank;
  target: Bank;
  reliability: number; // 0-1
  degraded?: boolean;
}

export interface CorridorGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DriftSummary {
  degraded: boolean;
  corridorsAffected: number;
  baselineFailureRate: number;
  currentFailureRate: number;
  psi: number; // population stability index
  window: string;
}
