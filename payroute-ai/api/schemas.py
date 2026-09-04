"""PayRoute AI — Pydantic request/response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel


Channel = Literal["bank_transfer", "card", "ussd", "mobile_money"]
Tier = Literal["low", "medium", "high"]


class TransactionInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    amount: float
    sender_bank: str = Field(alias="senderBank")
    receiver_bank: str = Field(alias="receiverBank")
    channel: str
    hour: int

class ShapFactor(BaseModel):
    feature: str
    label: str
    contribution: float


class AgentStep(BaseModel):
    tool: str
    args: dict
    result: str
    ms: int


class AgentRecommendation(BaseModel):
    steps: list[AgentStep]
    recommended_channel: Channel
    rationale: str
    mode: Literal["rule-based", "llm"]


class PredictResponse(BaseModel):
    failure_probability: float
    tier: Tier
    base_rate: float
    shap: list[ShapFactor]
    agent: AgentRecommendation


class ChannelScore(BaseModel):
    channel: Channel
    failure_probability: float
    tier: Tier
    eta_seconds: int
    fee_naira: int


class GraphNode(BaseModel):
    id: str
    x: float
    y: float
    volume: float


class GraphEdge(BaseModel):
    source: str
    target: str
    reliability: float
    degraded: bool = False


class CorridorGraph(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class DriftSummary(BaseModel):
    degraded: bool
    corridors_affected: int
    baseline_failure_rate: float
    current_failure_rate: float
    psi: float
    window: str


class SimulateResponse(BaseModel):
    graph: CorridorGraph
    drift: DriftSummary
