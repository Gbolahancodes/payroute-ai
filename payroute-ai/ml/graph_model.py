"""
PayRoute AI — corridor graph model.

Builds a NetworkX graph of banks (nodes) and corridors (edges) weighted by
historical reliability computed from the synthetic transactions.

Embedding path (best-effort, degrades cleanly):
    1. Try Node2Vec.
    2. If Node2Vec (or its deps) is unavailable, fall back to a spectral
       embedding from the graph Laplacian (pure NumPy/NetworkX).
The path actually used is printed and stored in the artifact.

We intentionally do NOT hard-depend on torch / torch-geometric — per the
brief, if the GraphSAGE stack is painful to install we take the documented
fallback rather than burning time on it.

Run:  python ml/graph_model.py
Output: models/corridor_embeddings.pkl
"""

from __future__ import annotations

import os
import pickle

import networkx as nx
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "transactions.csv")
MODELS = os.path.join(HERE, "..", "models")


def build_graph(df: pd.DataFrame) -> nx.Graph:
    """Undirected graph; edge reliability = 1 - observed failure rate."""
    g = nx.Graph()
    grp = df.groupby(["sender_bank", "receiver_bank"]).agg(
        n=("failed", "size"), fail=("failed", "mean"),
        rel=("corridor_reliability", "mean"),
    ).reset_index()

    for _, r in grp.iterrows():
        a, b = r["sender_bank"], r["receiver_bank"]
        reliability = float(1.0 - r["fail"])
        vol = int(r["n"])
        if g.has_edge(a, b):
            # merge both directions
            e = g[a][b]
            tot = e["volume"] + vol
            e["reliability"] = (e["reliability"] * e["volume"] + reliability * vol) / tot
            e["volume"] = tot
        else:
            g.add_edge(a, b, reliability=reliability, volume=vol)
    return g


def spectral_embedding(g: nx.Graph, dim: int = 8) -> dict[str, np.ndarray]:
    """Pure-NumPy fallback: eigenvectors of the normalized Laplacian."""
    nodes = list(g.nodes())
    L = nx.normalized_laplacian_matrix(g, nodelist=nodes).toarray()
    vals, vecs = np.linalg.eigh(L)
    emb = vecs[:, 1:dim + 1]  # skip trivial first eigenvector
    return {n: emb[i] for i, n in enumerate(nodes)}


def node2vec_embedding(g: nx.Graph, dim: int = 8) -> dict[str, np.ndarray]:
    from node2vec import Node2Vec  # raises if unavailable
    n2v = Node2Vec(g, dimensions=dim, walk_length=15, num_walks=50,
                   workers=1, weight_key="reliability", quiet=True)
    m = n2v.fit(window=5, min_count=1, batch_words=64)
    return {n: m.wv[str(n)] for n in g.nodes()}


def main() -> None:
    os.makedirs(MODELS, exist_ok=True)
    print("[graph] loading data + building corridor graph...")
    df = pd.read_csv(DATA)
    g = build_graph(df)
    print(f"[graph] {g.number_of_nodes()} nodes, {g.number_of_edges()} edges")

    path = "node2vec"
    try:
        emb = node2vec_embedding(g)
    except Exception as e:
        print(f"[graph] Node2Vec unavailable ({e.__class__.__name__}); "
              f"using spectral embedding fallback.")
        emb = spectral_embedding(g)
        path = "spectral_fallback"

    artifact = {
        "embedding_path": path,
        "embeddings": {n: np.asarray(v).tolist() for n, v in emb.items()},
        "edges": [
            {"source": u, "target": v,
             "reliability": float(d["reliability"]), "volume": int(d["volume"])}
            for u, v, d in g.edges(data=True)
        ],
    }
    with open(os.path.join(MODELS, "corridor_embeddings.pkl"), "wb") as f:
        pickle.dump(artifact, f)
    print(f"[graph] saved models/corridor_embeddings.pkl (path={path})")


def get_corridor_health(bank_a: str, bank_b: str) -> float:
    """Return reliability in [0,1] for a corridor, from the saved artifact."""
    p = os.path.join(MODELS, "corridor_embeddings.pkl")
    if not os.path.exists(p):
        return 0.85
    with open(p, "rb") as f:
        art = pickle.load(f)
    for e in art["edges"]:
        if {e["source"], e["target"]} == {bank_a, bank_b}:
            return float(e["reliability"])
    return 0.85


if __name__ == "__main__":
    main()
