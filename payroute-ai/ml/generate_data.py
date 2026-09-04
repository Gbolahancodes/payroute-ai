"""
PayRoute AI — synthetic transaction generator.

============================ SYNTHETIC DATA ============================
Everything produced here is FAKE and for demo/portfolio use only. No real
customers, banks, or transactions are involved.
=======================================================================

Design of the synthetic label
------------------------------
The core idea the whole product rests on: every (sender_bank, receiver_bank)
pair is a "corridor" that carries a hidden latent *reliability* in [0, 1].
That latent value drifts over time as a random walk with occasional
regime-shift events (simulating real interbank rail degradation). The
observed failure label is drawn probabilistically from that latent value
PLUS amount, channel and time-of-day effects, PLUS noise -- so a model can
recover most, but not all, of the signal (just like reality).

Run:  python ml/generate_data.py [--rows 80000]
Output:
    data/transactions.csv
    data/data_dictionary.md
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "data")

BANKS = [
    "GTBank", "Access Bank", "Zenith Bank", "UBA", "First Bank",
    "Kuda", "Opay", "Moniepoint", "Fidelity Bank", "Stanbic IBTC",
]

# channel -> (population weight, base failure log-odds offset)
CHANNELS = {
    "bank_transfer": (0.45, 0.00),
    "card":          (0.25, -0.35),
    "ussd":          (0.15, 0.55),
    "mobile_money":  (0.15, 0.25),
}


def _sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def build_latent_reliability(days: int, seed: int) -> dict[tuple[str, str], np.ndarray]:
    """
    For every ordered bank pair, build a daily latent reliability series.

    Random walk starting from a bank-pair-specific baseline, clipped to
    [0.35, 0.99]. With small probability on any given day a corridor enters
    a multi-day "regime shift" (degradation event) that sharply lowers
    reliability -- this is what the drift monitor later detects.
    """
    rng = np.random.default_rng(seed)
    series: dict[tuple[str, str], np.ndarray] = {}
    for a in BANKS:
        for b in BANKS:
            if a == b:
                continue
            base = rng.uniform(0.70, 0.97)
            walk = np.cumsum(rng.normal(0, 0.01, size=days))
            rel = np.clip(base + walk, 0.35, 0.99)

            # inject occasional regime-shift degradation events
            d = 0
            while d < days:
                if rng.random() < 0.01:               # ~1% chance/day to start
                    length = rng.integers(3, 10)
                    drop = rng.uniform(0.25, 0.5)
                    rel[d:d + length] = np.clip(rel[d:d + length] - drop, 0.1, 0.99)
                    d += length
                else:
                    d += 1
            series[(a, b)] = rel
    return series


def generate(rows: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    fake = Faker()
    Faker.seed(seed)

    days = 120
    start = datetime(2025, 1, 1)
    latent = build_latent_reliability(days, seed)

    ch_names = list(CHANNELS.keys())
    ch_weights = np.array([CHANNELS[c][0] for c in ch_names])
    ch_weights = ch_weights / ch_weights.sum()
    ch_offset = {c: CHANNELS[c][1] for c in ch_names}

    records = []
    for _ in range(rows):
        a, b = rng.choice(BANKS, size=2, replace=False)
        day = int(rng.integers(0, days))
        ts = start + timedelta(days=day, seconds=int(rng.integers(0, 86400)))
        hour = ts.hour

        # log-normal amount (naira), floored
        amount = float(np.clip(rng.lognormal(mean=10.8, sigma=1.1), 500, 5_000_000))
        channel = str(rng.choice(ch_names, p=ch_weights))

        rel = float(latent[(a, b)][day])

        # ---- failure log-odds (the ground-truth generative model) --------
        z = -2.6
        z += (0.85 - rel) * 6.0                    # corridor reliability (dominant)
        z += ch_offset[channel]                    # channel effect
        z += (np.log10(max(amount, 1000)) - 4) * 0.6   # large amounts hang more
        if hour >= 23 or hour <= 4:                # overnight batch cutoffs
            z += 0.5
        if 8 <= hour <= 10:                        # morning rush congestion
            z += 0.2
        z += rng.normal(0, 0.4)                    # irreducible noise

        p = float(_sigmoid(np.array([z]))[0])
        failed = int(rng.random() < p)

        records.append({
            "transaction_id": fake.uuid4(),
            "timestamp": ts.isoformat(),
            "day_index": day,
            "hour": hour,
            "sender_bank": a,
            "receiver_bank": b,
            "channel": channel,
            "amount": round(amount, 2),
            "corridor_reliability": round(rel, 4),   # latent (kept for EDA/graph)
            "failed": failed,
        })

    df = pd.DataFrame.from_records(records).sort_values("timestamp").reset_index(drop=True)
    return df


def write_dictionary(df: pd.DataFrame) -> None:
    rate = df["failed"].mean()
    doc = f"""# Data Dictionary — transactions.csv

> **SYNTHETIC DATA.** Generated by `ml/generate_data.py`. Not real.

Rows: {len(df):,} · overall failure rate: {rate:.3%}

| Column | Type | Description |
|---|---|---|
| `transaction_id` | str | Fake UUID (Faker). |
| `timestamp` | ISO datetime | When the transfer was attempted. |
| `day_index` | int | Day 0-119 of the simulation window. |
| `hour` | int | Hour of day 0-23. |
| `sender_bank` | str | Originating bank. |
| `receiver_bank` | str | Destination bank. |
| `channel` | str | `bank_transfer` \\| `card` \\| `ussd` \\| `mobile_money`. |
| `amount` | float | Transfer amount in NGN (log-normal). |
| `corridor_reliability` | float | **Latent** health of the (sender, receiver) corridor at that time, in [0,1]. Drifts as a random walk with regime-shift degradation events. This is the hidden driver of failures. |
| `failed` | int | **Label.** 1 if the transfer failed/hung, else 0. |

## Label logic
`failed ~ Bernoulli(sigmoid(z))` where

```
z = -2.6
  + (0.85 - corridor_reliability) * 6.0     # dominant term
  + channel_offset[channel]
  + (log10(amount) - 4) * 0.6
  + 0.5 if overnight (23:00-04:00) else 0
  + 0.2 if morning rush (08:00-10:00) else 0
  + Normal(0, 0.4)                            # irreducible noise
```

Channel offsets: bank_transfer 0.0, card -0.35, ussd +0.55, mobile_money +0.25.
"""
    with open(os.path.join(DATA_DIR, "data_dictionary.md"), "w") as f:
        f.write(doc)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=80_000)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    print(f"[generate_data] generating {args.rows:,} synthetic rows...")
    df = generate(args.rows, args.seed)
    out = os.path.join(DATA_DIR, "transactions.csv")
    df.to_csv(out, index=False)
    write_dictionary(df)
    print(f"[generate_data] wrote {out}  (failure rate {df['failed'].mean():.3%})")
    print("[generate_data] wrote data/data_dictionary.md")


if __name__ == "__main__":
    main()
