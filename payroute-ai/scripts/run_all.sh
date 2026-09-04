#!/usr/bin/env bash
# PayRoute AI — run the full ML pipeline end to end, then print next steps.
# Usage:  bash scripts/run_all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> [1/4] Generating synthetic data"
python ml/generate_data.py --rows "${ROWS:-80000}"

echo "==> [2/4] Training failure model (XGBoost -> ONNX + SHAP)"
python ml/train_model.py

echo "==> [3/4] Building corridor graph model"
python ml/graph_model.py

echo "==> [4/4] Running drift monitor (with simulated degradation)"
python ml/drift_monitor.py

cat <<'EOF'

============================================================
 Pipeline complete. Artifacts are in ./data and ./models
============================================================

Next steps (two terminals):

  # Terminal 1 — API
  uvicorn api.main:app --reload
  # -> http://localhost:8000/docs

  # Terminal 2 — Web
  cd web && npm install && npm run dev
  # -> http://localhost:5173

EOF
