"""Measure raw semantic similarity on the labelled pairs (docs/architecture.md "Match scoring").

    uv run python -m scripts.calibrate_match            # both models
    uv run python -m scripts.calibrate_match --only browser

For every pair in `calibration_data/pairs.json` it computes the raw similarity with the
server's own code (`semantic_match`) and writes them to
`calibration_data/raw_similarities.json`, which is committed, and prints the fitted anchors
for `CALIBRATIONS` in `app/services/match/scoring.py`. `tests/test_match_scoring.py` re-fits
them from that file and checks the constants match, so re-run this (then update the
constants and bump the calibration version) whenever the model, chunking or section
weights change. A `model`-marked test checks the file is still current.

Models:
- **browser**: the exact q8 ONNX file the browser runs (`frontend/public/models`, put there
  by `pnpm fetch-model`), run here with ONNX Runtime, with the shipped `tokenizer.json` and
  [CLS] pooling, as `embed-runtime.ts` does. Native and WebAssembly ONNX Runtime can differ
  in the last float bits; that is far below what calibration can resolve.
- **server**: fastembed's bge build (`MATCH_EMBEDDINGS=server`), downloaded into
  MATCH_MODEL_DIR on first use.
"""

import argparse
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import numpy as np

from app.services.match.browser_model import (
    BROWSER_MODEL,
    BROWSER_MODEL_NAME,
    TOKENIZER_PATH,
    get_bge_tokenizer,
)
from app.services.match.embedder import Embedder, Vectors
from app.services.match.semantic import ResumeEmbeddingCache, semantic_match

DATA = Path(__file__).with_name("calibration_data")
PAIRS_PATH = DATA / "pairs.json"
RAW_PATH = DATA / "raw_similarities.json"
BROWSER_ONNX = (
    Path(__file__).resolve().parents[2]
    / "frontend/public/models"
    / BROWSER_MODEL.id
    / BROWSER_MODEL.revision
    / "onnx/model_quantized.onnx"
)


def load_pairs() -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))["pairs"]
    return pairs


def read_text(kind: str, name: str) -> str:
    return (DATA / kind / f"{name}.txt").read_text(encoding="utf-8").strip()


def pair_key(pair: dict[str, Any]) -> str:
    return f"{pair['resume']}|{pair['jd']}"


def load_raw() -> dict[str, dict[str, float]]:
    """model name -> pair key -> raw similarity, as last measured."""
    models: dict[str, dict[str, float]] = json.loads(RAW_PATH.read_text(encoding="utf-8"))["models"]
    return models


def fit_anchors(raw: Sequence[float], grades: Sequence[int]) -> tuple[float, float]:
    """Least-squares line of grade / 3 on raw similarity; returns the raw values where it
    crosses 0 and 1 (`Calibration.zero` and `.one`)."""
    slope, intercept = np.polyfit(np.asarray(raw), np.asarray(grades) / 3, 1)
    return float(-intercept / slope), float((1 - intercept) / slope)


class OnnxBrowserEmbedder:
    """The browser's model file under native ONNX Runtime. One text per run: no padding,
    so nothing depends on how a batch was assembled."""

    def __init__(self, onnx_path: Path = BROWSER_ONNX) -> None:
        import onnxruntime  # type: ignore[import-untyped]  # via fastembed; no stubs
        from tokenizers import Tokenizer

        if not onnx_path.exists():
            raise SystemExit(f"{onnx_path} is missing: run `pnpm fetch-model` in frontend/")
        self._session = onnxruntime.InferenceSession(
            str(onnx_path), providers=["CPUExecutionProvider"]
        )
        tokenizer = Tokenizer.from_file(str(TOKENIZER_PATH))
        tokenizer.no_truncation()
        tokenizer.no_padding()
        self._tokenizer = tokenizer
        self._counter = get_bge_tokenizer()

    @property
    def model_name(self) -> str:
        return BROWSER_MODEL_NAME

    @property
    def max_tokens(self) -> int:
        return self._counter.max_tokens

    def count_tokens(self, text: str) -> int:
        return self._counter.count_tokens(text)

    def embed(self, texts: Sequence[str]) -> Vectors:
        rows = []
        for text in texts:
            encoding = self._tokenizer.encode(text)
            ids = np.array([encoding.ids], dtype=np.int64)
            (hidden,) = self._session.run(
                ["last_hidden_state"],
                {
                    "input_ids": ids,
                    "attention_mask": np.ones_like(ids),
                    "token_type_ids": np.zeros_like(ids),
                },
            )
            rows.append(np.asarray(hidden, dtype=np.float32)[0, 0])  # [CLS]
        return np.vstack(rows) if rows else np.zeros((0, BROWSER_MODEL.dim), np.float32)


def server_embedder() -> Embedder:
    from app.core.config import get_settings
    from app.services.match.local_embedder import LocalEmbedder

    settings = get_settings()
    return LocalEmbedder(settings.match_model_dir, offline=settings.match_model_offline)


def measure(embedder: Embedder) -> dict[str, float]:
    cache = ResumeEmbeddingCache()
    return {
        pair_key(pair): round(
            semantic_match(
                read_text("jds", pair["jd"]), read_text("resumes", pair["resume"]), embedder, cache
            ).similarity,
            5,
        )
        for pair in load_pairs()
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--only", choices=["browser", "server"])
    args = parser.parse_args()

    existing: dict[str, Any] = (
        json.loads(RAW_PATH.read_text(encoding="utf-8")) if RAW_PATH.exists() else {}
    )
    models: dict[str, dict[str, float]] = existing.get("models", {})
    factories = {"browser": OnnxBrowserEmbedder, "server": server_embedder}
    for name, factory in factories.items():
        if args.only and args.only != name:
            continue
        embedder = factory()
        measured = models[embedder.model_name] = measure(embedder)
        pairs = load_pairs()
        zero, one = fit_anchors([measured[pair_key(p)] for p in pairs], [p["grade"] for p in pairs])
        print(f"{embedder.model_name}: {len(measured)} pairs, zero={zero:.4f} one={one:.4f}")

    output = {
        "about": "Raw semantic similarity per labelled pair (scripts/calibrate_match.py).",
        "models": dict(sorted(models.items())),
    }
    RAW_PATH.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {RAW_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
