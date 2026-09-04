# PayRoute AI

Nigerian interbank transfer failure prediction and smart rail routing. Built with React + Vite on the frontend and FastAPI on the backend.

The frontend works standalone using an in-browser synthetic engine. When a FastAPI backend is running locally, it switches to live predictions automatically — the header indicator shows which mode is active.

---

## Frontend

**Requirements:** Node.js 18+, pnpm

```bash
pnpm install
pnpm dev
```

Opens at `http://localhost:5173`.

---

## Backend (FastAPI)

**Requirements:** Python 3.10+

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

Or with a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Run the server

```bash
uvicorn main:app --reload --port 8000
```

### 3. Verify it's up

```bash
curl http://localhost:8000/health
```

Should return `{"status": "ok"}`.

### 4. Run frontend

In a separate terminal:

```bash
pnpm dev
```

The header will switch from **"Browser mock"** to **"Live backend"** once the ping succeeds.

---

## API contract

The frontend posts to these four endpoints:

| Method | Path | Body | Returns |
|--------|------|------|---------|
| `GET` | `/health` | — | `{"status": "ok"}` |
| `POST` | `/predict` | `TransactionInput` | `PredictResponse` |
| `POST` | `/predict/compare` | `TransactionInput` | `ChannelScore[]` |
| `POST` | `/simulate-degradation` | — | `{ graph, drift }` |

### TransactionInput

```json
{
  "amount": 250000,
  "senderBank": "Opay",
  "receiverBank": "GTBank",
  "channel": "bank_transfer",
  "hour": 23
}
```

`channel` is one of: `bank_transfer` `card` `ussd` `mobile_money`

### PredictResponse

```json
{
  "failureProbability": 0.34,
  "tier": "medium",
  "baseRate": 0.087,
  "shap": [
    { "feature": "corridor_reliability", "label": "Corridor health 61%", "contribution": 1.44 }
  ],
  "agent": {
    "steps": [
      { "tool": "get_corridor_health", "args": {}, "result": "reliability=61%", "ms": 42 }
    ],
    "recommendedChannel": "card",
    "rationale": "Route via Card...",
    "mode": "rule-based"
  }
}
```

### ChannelScore[]

```json
[
  { "channel": "card", "failureProbability": 0.11, "tier": "low", "etaSeconds": 4, "feeNaira": 100 }
]
```

---

## Configuration

The backend URL is set in `.env.local`:

```
VITE_API_URL=http://localhost:8000
```

Change the port if your FastAPI runs elsewhere. The file is already created — just edit it and restart `pnpm dev`.

---

## Project structure

```
├── src/
│   ├── App.tsx                  # Root layout and state
│   ├── index.css                # Global styles and design tokens
│   ├── main.tsx                 # React entrypoint
│   ├── api/
│   │   └── client.ts            # Backend client + in-browser fallback
│   ├── components/
│   │   ├── TransactionForm.tsx
│   │   └── ui/primitives.tsx
│   └── types/index.ts           # Shared types mirroring FastAPI schema
├── .env.local                   # VITE_API_URL (gitignored by default)
└── README.md
```
