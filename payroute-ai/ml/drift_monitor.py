"""
PayRoute AI — drift monitoring.

Uses Evidently to compare a baseline window against a current window of
transactions and produce a data-drift report. Also simulates a network
degradation event so the before/after is visibly different, and exposes a
compact JSON summary the API serves to the frontend (the frontend never
parses Evidently's HTML).

Run:  python ml/drift_monitor.py
Output:
    models/drift_report.html
    models/drift_summary.json
"""

from __future__ import annotations

import json
import os

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "transactions.csv")
MODELS = os.path.join(HERE, "..", "models")


def _psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index between two distributions."""
    q = np.quantile(expected, np.linspace(0, 1, bins + 1))
    q[0], q[-1] = -np.inf, np.inf
    e = np.histogram(expected, bins=q)[0] / max(len(expected), 1) + 1e-6
    a = np.histogram(actual, bins=q)[0] / max(len(actual), 1) + 1e-6
    return float(np.sum((a - e) * np.log(a / e)))


def simulate_degradation(current: pd.DataFrame) -> pd.DataFrame:
    """Knock down reliability on a cluster of corridors and re-roll failures."""
    df = current.copy()
    hit = df["sender_bank"].isin(["Opay", "Moniepoint", "Kuda"])
    df.loc[hit, "corridor_reliability"] = (
        df.loc[hit, "corridor_reliability"] * 0.45
    ).clip(0.1, 0.99)
    z = -2.6 + (0.85 - df["corridor_reliability"]) * 6.0
    p = 1 / (1 + np.exp(-z))
    rng = np.random.default_rng(7)
    df["failed"] = (rng.random(len(df)) < p).astype(int)
    return df


def build_summary(baseline: pd.DataFrame, current: pd.DataFrame,
                  degraded: bool) -> dict:
    return {
        "degraded": degraded,
        "window": "last 20% of records vs prior baseline",
        "baseline_failure_rate": round(float(baseline["failed"].mean()), 4),
        "current_failure_rate": round(float(current["failed"].mean()), 4),
        "psi_failure": round(_psi(baseline["failed"].to_numpy().astype(float),
                                  current["failed"].to_numpy().astype(float)), 4),
        "psi_reliability": round(_psi(baseline["corridor_reliability"].to_numpy(),
                                      current["corridor_reliability"].to_numpy()), 4),
        "corridors_affected": int(
            current[current["corridor_reliability"] < 0.55]
            .groupby(["sender_bank", "receiver_bank"]).ngroups
        ),
    }


def run(degrade: bool = True) -> dict:
    os.makedirs(MODELS, exist_ok=True)
    df = pd.read_csv(DATA).sort_values("timestamp").reset_index(drop=True)
    cut = int(len(df) * 0.8)
    baseline, current = df.iloc[:cut].copy(), df.iloc[cut:].copy()

    if degrade:
        current = simulate_degradation(current)

    # Evidently HTML report (best-effort; summary is always produced)
    try:
        from evidently.metric_preset import DataDriftPreset
        from evidently.report import Report
        cols = ["amount", "hour", "corridor_reliability", "failed"]
        report = Report(metrics=[DataDriftPreset()])
        report.run(reference_data=baseline[cols], current_data=current[cols])
        report.save_html(os.path.join(MODELS, "drift_report.html"))
        print("[drift] wrote models/drift_report.html")
    except Exception as e:  # pragma: no cover
        print(f"[drift] Evidently HTML skipped ({e}); JSON summary still written.")

    summary = build_summary(baseline, current, degrade)
    with open(os.path.join(MODELS, "drift_summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print("[drift] wrote models/drift_summary.json:", json.dumps(summary, indent=2))
    return summary


if __name__ == "__main__":
    run(degrade=True)
