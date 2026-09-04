"""
PayRoute AI — failure-prediction model training.

- XGBoost binary classifier on a TIME-ORDERED train/val/test split
  (we split by timestamp so we never leak the future into the past).
- Logs params + metrics + artifacts to MLflow (local ./mlruns).
- Exports the model to ONNX  -> models/failure_model.onnx
  (best-effort; also always saves a pickle booster as a fallback).
- Fits + saves a SHAP TreeExplainer -> models/shap_explainer.pkl
- Saves eval metrics -> models/eval_metrics.json

Run:  python ml/train_model.py
"""

from __future__ import annotations

import json
import os
import pickle

import numpy as np
import pandas as pd
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    roc_auc_score,
)

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "transactions.csv")
MODELS = os.path.join(HERE, "..", "models")

FEATURES = ["amount", "hour", "sender_bank", "receiver_bank", "channel"]
CATEGORICAL = ["sender_bank", "receiver_bank", "channel"]


def encode(df: pd.DataFrame, cats: dict[str, list[str]] | None = None):
    """Simple, deterministic ordinal encoding for categoricals."""
    df = df.copy()
    if cats is None:
        cats = {c: sorted(df[c].unique().tolist()) for c in CATEGORICAL}
    for c in CATEGORICAL:
        mapping = {v: i for i, v in enumerate(cats[c])}
        df[c] = df[c].map(mapping).fillna(-1).astype(int)
    return df, cats


def main() -> None:
    import xgboost as xgb

    os.makedirs(MODELS, exist_ok=True)
    print("[train] loading data...")
    df = pd.read_csv(DATA).sort_values("timestamp").reset_index(drop=True)

    # time-ordered split: 70% train / 15% val / 15% test
    n = len(df)
    tr_end, va_end = int(n * 0.70), int(n * 0.85)
    train, val, test = df.iloc[:tr_end], df.iloc[tr_end:va_end], df.iloc[va_end:]

    train_e, cats = encode(train)
    val_e, _ = encode(val, cats)
    test_e, _ = encode(test, cats)

    Xtr, ytr = train_e[FEATURES].astype("float32"), train_e["failed"]
    Xva, yva = val_e[FEATURES].astype("float32"), val_e["failed"]
    Xte, yte = test_e[FEATURES].astype("float32"), test_e["failed"]

    params = dict(
        n_estimators=300, max_depth=5, learning_rate=0.08,
        subsample=0.9, colsample_bytree=0.9,
        eval_metric="logloss", n_jobs=4, random_state=42,
    )
    model = xgb.XGBClassifier(**params)

    print("[train] fitting XGBoost...")
    model.fit(Xtr, ytr, eval_set=[(Xva, yva)], verbose=False)

    proba = model.predict_proba(Xte)[:, 1]
    metrics = {
        "roc_auc": float(roc_auc_score(yte, proba)),
        "pr_auc": float(average_precision_score(yte, proba)),
        "f1_at_0.5": float(f1_score(yte, (proba >= 0.5).astype(int))),
        "brier": float(brier_score_loss(yte, proba)),
        "base_rate": float(df["failed"].mean()),
        "n_train": int(len(train)), "n_test": int(len(test)),
    }
    print("[train] test metrics:", json.dumps(metrics, indent=2))

    # ---- MLflow (local, no server needed) --------------------------------
    try:
        import mlflow
        mlflow.set_tracking_uri("file:" + os.path.join(HERE, "..", "mlruns"))
        mlflow.set_experiment("payroute-failure-model")
        with mlflow.start_run():
            mlflow.log_params(params)
            mlflow.log_metrics(metrics)
        print("[train] logged run to MLflow (./mlruns)")
    except Exception as e:  # pragma: no cover
        print(f"[train] MLflow logging skipped: {e}")

    # ---- persist model artifacts -----------------------------------------
    with open(os.path.join(MODELS, "failure_model.pkl"), "wb") as f:
        pickle.dump({"model": model, "cats": cats, "features": FEATURES}, f)
    print("[train] saved models/failure_model.pkl")

    # ONNX export (best-effort; API falls back to pickle if this is absent)
    try:
        from onnxmltools import convert_xgboost
        from onnxmltools.convert.common.data_types import FloatTensorType
        onnx_model = convert_xgboost(
            model, initial_types=[("input", FloatTensorType([None, len(FEATURES)]))]
        )
        with open(os.path.join(MODELS, "failure_model.onnx"), "wb") as f:
            f.write(onnx_model.SerializeToString())
        print("[train] exported models/failure_model.onnx")
    except Exception as e:  # pragma: no cover
        print(f"[train] ONNX export skipped ({e}); pickle model will be used.")

    # ---- SHAP explainer ---------------------------------------------------
    try:
        import shap
        explainer = shap.TreeExplainer(model)
        with open(os.path.join(MODELS, "shap_explainer.pkl"), "wb") as f:
            pickle.dump({"explainer": explainer, "features": FEATURES, "cats": cats}, f)
        print("[train] saved models/shap_explainer.pkl")
    except Exception as e:  # pragma: no cover
        print(f"[train] SHAP explainer skipped: {e}")

    with open(os.path.join(MODELS, "eval_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    print("[train] saved models/eval_metrics.json")


if __name__ == "__main__":
    main()
