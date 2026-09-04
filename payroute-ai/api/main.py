

from __future__ import annotations

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import math
import os
import pickle
import sys

import numpy as np

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# make the ml/ modules importable (agent, graph_model)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "ml"))

from .schemas import (  # noqa: E402
    ChannelScore, CorridorGraph, DriftSummary, PredictResponse,
    SimulateResponse, TransactionInput,
)

MODELS = os.path.join(ROOT, "models")
BANKS = ["GTBank", "Access Bank", "Zenith Bank", "UBA", "First Bank",
         "Kuda", "Opay", "Moniepoint", "Fidelity Bank", "Stanbic IBTC"]
CHANNELS = ["bank_transfer", "card", "ussd", "mobile_money"]
FEATURES = ["amount", "hour", "sender_bank", "receiver_bank", "channel"]

CHANNEL_ETA = {"bank_transfer": 12, "card": 4, "ussd": 30, "mobile_money": 18}

app = FastAPI(title="PayRoute AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in
                   os.environ.get("CORS_ORIGINS",
                                  "http://localhost:5173,http://127.0.0.1:5173").split(",")],
    allow_methods=["*"], allow_headers=["*"],
)

# --------------------------------------------------------------------------
# Artifact loading (with graceful degradation if training hasn't run yet)
# --------------------------------------------------------------------------
STATE: dict = {"model": None, "onnx": None, "cats": None,
               "shap": None, "explainer": None, "metrics": {"base_rate": 0.087}}


def _load():
    # metrics
    mp = os.path.join(MODELS, "eval_metrics.json")
    if os.path.exists(mp):
        STATE["metrics"] = json.load(open(mp))

    # model: prefer ONNX runtime, fall back to pickled XGBoost
    onnx_p = os.path.join(MODELS, "failure_model.onnx")
    pkl_p = os.path.join(MODELS, "failure_model.pkl")
    if os.path.exists(pkl_p):
        obj = pickle.load(open(pkl_p, "rb"))
        STATE["model"], STATE["cats"] = obj["model"], obj["cats"]
    if os.path.exists(onnx_p):
        try:
            import onnxruntime as ort
            STATE["onnx"] = ort.InferenceSession(onnx_p)
            print("[api] loaded ONNX model")
        except Exception as e:
            print(f"[api] ONNX load failed ({e}); using pickle model")

    sp = os.path.join(MODELS, "shap_explainer.pkl")
    if os.path.exists(sp):
        obj = pickle.load(open(sp, "rb"))
        STATE["explainer"], STATE["cats"] = obj["explainer"], obj["cats"]


_load()

try:
    from agent import advise
    from graph_model import get_corridor_health
except Exception as e:  # pragma: no cover
    print(f"[api] agent/graph import warning: {e}")
    advise = None
    def get_corridor_health(a, b):  # type: ignore
        return 0.85


# --------------------------------------------------------------------------
# Scoring helpers
# --------------------------------------------------------------------------
def _encode(tx: TransactionInput) -> np.ndarray:
    cats = STATE["cats"] or {}
    def idx(col, val):
        return cats.get(col, []).index(val) if val in cats.get(col, []) else -1
    return np.array([[
        float(tx.amount), float(tx.hour),
        idx("sender_bank", tx.sender_bank),
        idx("receiver_bank", tx.receiver_bank),
        idx("channel", tx.channel),
    ]], dtype=np.float32)


def _fallback_score(tx: TransactionInput) -> float:
    """Analytic fallback if no trained model is present (keeps API usable)."""
    rel = get_corridor_health(tx.sender_bank, tx.receiver_bank)
    off = {"bank_transfer": 0.0, "card": -0.35, "ussd": 0.55, "mobile_money": 0.25}
    z = -2.6 + (0.85 - rel) * 6.0 + off[tx.channel]
    z += (math.log10(max(tx.amount, 1000)) - 4) * 0.6
    z += 0.5 if (tx.hour >= 23 or tx.hour <= 4) else 0.0
    z += 0.2 if 8 <= tx.hour <= 10 else 0.0
    return 1 / (1 + math.exp(-z))


def score(tx: TransactionInput) -> float:
    X = _encode(tx)
    if STATE["onnx"] is not None:
        out = STATE["onnx"].run(None, {STATE["onnx"].get_inputs()[0].name: X})
        # onnxmltools xgboost -> [labels, probabilities(list of dict/array)]
        probs = out[1]
        try:
            return float(probs[0][1])
        except Exception:
            return float(probs[0].get(1, 0.1)) if isinstance(probs[0], dict) else 0.1
    if STATE["model"] is not None:
        return float(STATE["model"].predict_proba(X)[0, 1])
    return _fallback_score(tx)


def tier_of(p: float) -> str:
    return "low" if p < 0.1 else "medium" if p < 0.3 else "high"


def _shap_factors(tx: TransactionInput):
    labels = {
        "amount": f"Amount ₦{int(tx.amount):,}",
        "hour": f"Hour {tx.hour:02d}:00",
        "sender_bank": f"Sender {tx.sender_bank}",
        "receiver_bank": f"Receiver {tx.receiver_bank}",
        "channel": f"Channel {tx.channel}",
    }
    if STATE["explainer"] is not None:
        try:
            vals = STATE["explainer"].shap_values(_encode(tx))[0]
            out = [{"feature": f, "label": labels[f], "contribution": float(v)}
                   for f, v in zip(FEATURES, vals)]
            out.sort(key=lambda d: abs(d["contribution"]), reverse=True)
            return out
        except Exception:
            pass
    # fallback: reconstruct the generative terms
    rel = get_corridor_health(tx.sender_bank, tx.receiver_bank)
    off = {"bank_transfer": 0.0, "card": -0.35, "ussd": 0.55, "mobile_money": 0.25}
    time_term = (0.5 if (tx.hour >= 23 or tx.hour <= 4) else 0.0) + \
                (0.2 if 8 <= tx.hour <= 10 else 0.0)
    out = [
        {"feature": "corridor_reliability",
         "label": f"Corridor health {rel:.0%}", "contribution": (0.85 - rel) * 6.0},
        {"feature": "channel", "label": labels["channel"], "contribution": off[tx.channel]},
        {"feature": "amount", "label": labels["amount"],
         "contribution": (math.log10(max(tx.amount, 1000)) - 4) * 0.6},
        {"feature": "hour", "label": labels["hour"], "contribution": time_term},
    ]
    out.sort(key=lambda d: abs(d["contribution"]), reverse=True)
    return out


def _channel_scores(tx: TransactionInput) -> list[dict]:
    res = []
    for ch in CHANNELS:
        t = tx.model_copy(update={"channel": ch})
        p = score(t)
        fee = {"bank_transfer": min(50, 10 + tx.amount * 0.0005),
               "card": max(100, tx.amount * 0.015),
               "ussd": 20, "mobile_money": min(100, tx.amount * 0.01)}[ch]
        res.append({"channel": ch, "failure_probability": round(p, 4),
                    "tier": tier_of(p), "eta_seconds": CHANNEL_ETA[ch],
                    "fee_naira": int(round(fee))})
    return res


# --------------------------------------------------------------------------
# Corridor graph state (in-memory degradation toggle)
# --------------------------------------------------------------------------
_degraded_banks: set[str] = set()


def _graph() -> dict:
    n = len(BANKS)
    nodes = []
    for i, b in enumerate(BANKS):
        ang = i / n * 2 * math.pi - math.pi / 2
        nodes.append({"id": b, "x": 0.5 + math.cos(ang) * 0.38,
                      "y": 0.5 + math.sin(ang) * 0.38,
                      "volume": 0.3 + (hash(b) % 100) / 100 * 0.7})
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            a, b = BANKS[i], BANKS[j]
            if (hash(f"{a}{b}") % 100) / 100 > 0.55:
                rel = get_corridor_health(a, b)
                degraded = a in _degraded_banks or b in _degraded_banks
                if degraded:
                    rel = max(0.15, rel - 0.45)
                edges.append({"source": a, "target": b,
                              "reliability": round(rel, 3), "degraded": degraded})
    return {"nodes": nodes, "edges": edges}


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok",
            "model": "onnx" if STATE["onnx"] else "pickle" if STATE["model"] else "analytic-fallback",
            "explainer": STATE["explainer"] is not None}


@app.post("/predict", response_model=PredictResponse)
def predict(tx: TransactionInput):
    if tx.sender_bank == tx.receiver_bank:
        raise HTTPException(400, "sender_bank and receiver_bank must differ")
    p = score(tx)
    agent = (advise(tx.model_dump(), lambda d: score(TransactionInput(**d)))
             if advise else {"steps": [], "recommended_channel": tx.channel,
                             "rationale": "Agent unavailable.", "mode": "rule-based"})
    return {"failure_probability": round(p, 4), "tier": tier_of(p),
            "base_rate": STATE["metrics"].get("base_rate", 0.087),
            "shap": _shap_factors(tx), "agent": agent}


@app.post("/predict/compare", response_model=list[ChannelScore])
def predict_compare(tx: TransactionInput):
    return _channel_scores(tx)


@app.get("/corridor-graph", response_model=CorridorGraph)
def corridor_graph():
    return _graph()


@app.post("/simulate-degradation", response_model=SimulateResponse)
def simulate_degradation():
    global _degraded_banks
    if _degraded_banks:
        _degraded_banks = set()
        drift = {"degraded": False, "corridors_affected": 0,
                 "baseline_failure_rate": STATE["metrics"].get("base_rate", 0.087),
                 "current_failure_rate": STATE["metrics"].get("base_rate", 0.087),
                 "psi": 0.02, "window": "last 6h vs baseline"}
    else:
        _degraded_banks = {"Opay", "Moniepoint", "Kuda"}
        g = _graph()
        affected = sum(1 for e in g["edges"] if e["degraded"])
        drift = {"degraded": True, "corridors_affected": affected,
                 "baseline_failure_rate": STATE["metrics"].get("base_rate", 0.087),
                 "current_failure_rate": 0.243, "psi": 0.38,
                 "window": "last 6h vs baseline"}
    return {"graph": _graph(), "drift": drift}
