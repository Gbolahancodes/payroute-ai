# PayRoute AI — API container.
FROM python:3.11-slim

WORKDIR /app

# system deps for xgboost / onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# copy source + trained artifacts (build after running scripts/run_all.sh)
COPY ml ./ml
COPY api ./api
COPY models ./models

EXPOSE 8000
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
