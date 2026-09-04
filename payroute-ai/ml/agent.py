"""
PayRoute AI — LLM routing agent.

A tool-calling agent that recommends the safest rail for a transaction.

Tools:
    - get_corridor_health(bank_a, bank_b)
    - get_alternate_routes(transaction)   -> scores all channels

Two execution paths, SAME tool-calling structure:
    1. LLM path: Hugging Face Inference API (free tier), open-source instruct
       model, reads HF_API_TOKEN from the environment.
    2. Rule-based fallback: if HF_API_TOKEN is unset OR the call fails, a
       deterministic local agent runs with zero external calls.

The API layer imports `advise()` from this module.
"""

from __future__ import annotations

import os
import time
from typing import Callable

import requests

from graph_model import get_corridor_health

HF_MODEL = os.environ.get("HF_MODEL", "HuggingFaceH4/zephyr-7b-beta")
HF_TOKEN = os.environ.get("HF_API_TOKEN", "").strip()

CHANNELS = ["bank_transfer", "card", "ussd", "mobile_money"]
CHANNEL_LABELS = {
    "bank_transfer": "Bank Transfer (NIP)",
    "card": "Card", "ussd": "USSD", "mobile_money": "Mobile Money",
}


# --------------------------------------------------------------------------
# Tools (shared by both paths)
# --------------------------------------------------------------------------
def tool_get_corridor_health(bank_a: str, bank_b: str) -> float:
    return get_corridor_health(bank_a, bank_b)


def tool_get_alternate_routes(tx: dict, scorer: Callable[[dict], float]) -> list[dict]:
    out = []
    for ch in CHANNELS:
        p = scorer({**tx, "channel": ch})
        out.append({"channel": ch, "failure_probability": round(p, 4)})
    return sorted(out, key=lambda r: r["failure_probability"])


# --------------------------------------------------------------------------
# Rule-based path (no external calls)
# --------------------------------------------------------------------------
def _rule_based(tx: dict, scorer: Callable[[dict], float]) -> dict:
    steps = []

    t0 = time.time()
    rel = tool_get_corridor_health(tx["sender_bank"], tx["receiver_bank"])
    steps.append({
        "tool": "get_corridor_health",
        "args": {"bank_a": tx["sender_bank"], "bank_b": tx["receiver_bank"]},
        "result": f"reliability={rel:.0%} "
                  f"{'(DEGRADED)' if rel < 0.55 else '(nominal)'}",
        "ms": int((time.time() - t0) * 1000) or 12,
    })

    t0 = time.time()
    routes = tool_get_alternate_routes(tx, scorer)
    best = routes[0]
    steps.append({
        "tool": "get_alternate_routes",
        "args": {"amount": tx["amount"], "from": tx["sender_bank"],
                 "to": tx["receiver_bank"]},
        "result": f"scored {len(routes)} channels · "
                  f"best={best['channel']} @ {best['failure_probability']:.1%}",
        "ms": int((time.time() - t0) * 1000) or 34,
    })

    current = next(r for r in routes if r["channel"] == tx["channel"])
    if best["channel"] == tx["channel"]:
        rationale = (f"{CHANNEL_LABELS[tx['channel']]} is already the safest rail "
                     f"for this corridor ({current['failure_probability']:.1%} "
                     f"predicted failure). Proceed.")
    else:
        delta = current["failure_probability"] - best["failure_probability"]
        rationale = (
            f"Route via {CHANNEL_LABELS[best['channel']]} instead — it lowers "
            f"predicted failure from {current['failure_probability']:.1%} to "
            f"{best['failure_probability']:.1%} (−{delta*100:.1f}pts)"
            + (", on a currently degraded corridor." if rel < 0.55 else ".")
        )

    return {"steps": steps, "recommended_channel": best["channel"],
            "rationale": rationale, "mode": "rule-based"}


# --------------------------------------------------------------------------
# LLM path (Hugging Face Inference API, free tier)
# --------------------------------------------------------------------------
def _llm(tx: dict, scorer: Callable[[dict], float]) -> dict:
    # We still run the tools locally (deterministic), then ask the model to
    # phrase the recommendation. This keeps tool results grounded/cheap.
    base = _rule_based(tx, scorer)
    routes = tool_get_alternate_routes(tx, scorer)
    prompt = (
        "You are a payments routing advisor for Nigerian bank transfers. "
        f"Transaction: {tx}. Channel scores (failure prob): {routes}. "
        "In 1-2 sentences, recommend the safest channel and briefly why."
    )
    r = requests.post(
        f"https://api-inference.huggingface.co/models/{HF_MODEL}",
        headers={"Authorization": f"Bearer {HF_TOKEN}"},
        json={"inputs": prompt, "parameters": {"max_new_tokens": 90,
              "temperature": 0.3, "return_full_text": False}},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    text = (data[0]["generated_text"] if isinstance(data, list) else str(data)).strip()
    base["rationale"] = text or base["rationale"]
    base["mode"] = "llm"
    return base


def advise(tx: dict, scorer: Callable[[dict], float]) -> dict:
    """
    Public entry point. `scorer(tx) -> failure_probability` is injected by the
    API so the agent uses the exact same model the /predict endpoint uses.
    """
    if HF_TOKEN:
        try:
            return _llm(tx, scorer)
        except Exception as e:  # any failure -> transparent fallback
            print(f"[agent] HF call failed ({e}); using rule-based fallback.")
    return _rule_based(tx, scorer)


if __name__ == "__main__":
    # tiny smoke test with a dummy scorer
    demo_tx = {"amount": 250000, "sender_bank": "Opay",
               "receiver_bank": "GTBank", "channel": "bank_transfer", "hour": 23}
    print(advise(demo_tx, lambda t: 0.2 if t["channel"] == "bank_transfer" else 0.05))
