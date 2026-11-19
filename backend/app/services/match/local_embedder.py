"""fastembed (ONNX Runtime) embedder: `BAAI/bge-small-en-v1.5`, on this server (ADR 0004).

Used with `MATCH_EMBEDDINGS=server` (dev, self-hosting) and as the reference the browser
build is compared against; production embeds in the browser. Measured too slow for
Render's free tier (ADR 0004, Revision 1).

- **Pinned:** the model name here and the fastembed version in `pyproject.toml` (exact pin).
  An image built with `BAKE_MATCH_MODEL=true` downloads the same model at build time
  (`MATCH_MODEL` in the Dockerfile; a test keeps the two in sync). Changing either changes
  scores: bump the scoring version with it.
- **Lazy:** nothing loads at import or startup. `load()` runs on the first match (or the
  warm-up endpoint) and is thread-safe; later calls return at once.
- **1 thread:** ONNX Runtime gets one intra-op and one inter-op thread. Render's free tier
  has 0.1 CPU, so more threads would only add contention with request handling.
- **Exact token counts:** fastembed's own tokenizer truncates at 512 tokens, so its counts
  can never exceed the limit and would hide over-long chunks. We count with an untruncated
  copy of the same tokenizer, and take the limit from fastembed's truncation setting.
- **Bounded batches:** texts are sorted by length and batched under a token budget, so one
  long chunk can't pad a large batch to 512 tokens (attention memory grows with
  batch x length^2, which matters at 512 MB).
"""

import threading
import time
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from tokenizers import Tokenizer

from app.services.match.embedder import Vectors

if TYPE_CHECKING:
    from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"
# Max (texts in a batch x padded length). 2048 means 4 texts at 512 tokens or ~100 short
# lines; measured in scripts/bench_match.py.
BATCH_TOKEN_BUDGET = 2048


@dataclass(frozen=True)
class _Loaded:
    model: "TextEmbedding"
    tokenizer: Tokenizer  # untruncated, unpadded
    max_tokens: int


class LocalEmbedder:
    def __init__(self, cache_dir: Path, *, offline: bool) -> None:
        self._cache_dir = cache_dir
        self._offline = offline
        self._lock = threading.Lock()
        self._loaded: _Loaded | None = None
        self.load_seconds: float | None = None

    @property
    def model_name(self) -> str:
        return MODEL_NAME

    @property
    def is_loaded(self) -> bool:
        return self._loaded is not None

    def load(self) -> None:
        self._ensure_loaded()

    def _ensure_loaded(self) -> _Loaded:
        loaded = self._loaded
        if loaded is not None:
            return loaded
        with self._lock:
            if self._loaded is not None:
                return self._loaded
            started = time.perf_counter()
            # Imported here so that importing the app (tests, CLI, cold start) never pulls
            # in ONNX Runtime.
            from fastembed import TextEmbedding

            model = TextEmbedding(
                MODEL_NAME,
                cache_dir=str(self._cache_dir),
                threads=1,
                local_files_only=self._offline,
            )
            fastembed_tokenizer = getattr(model.model, "tokenizer", None)
            if not isinstance(fastembed_tokenizer, Tokenizer):
                raise RuntimeError("fastembed changed: no tokenizer on the loaded model")
            truncation = fastembed_tokenizer.truncation or {}
            tokenizer = Tokenizer.from_str(fastembed_tokenizer.to_str())
            tokenizer.no_truncation()
            tokenizer.no_padding()

            self._loaded = _Loaded(model, tokenizer, int(truncation.get("max_length", 512)))
            self.load_seconds = time.perf_counter() - started
            return self._loaded

    @property
    def max_tokens(self) -> int:
        return self._ensure_loaded().max_tokens

    def count_tokens(self, text: str) -> int:
        return len(self._ensure_loaded().tokenizer.encode(text).ids)

    def embed(self, texts: Sequence[str]) -> Vectors:
        loaded = self._ensure_loaded()
        if not texts:
            return np.zeros((0, 0), dtype=np.float32)

        lengths = [len(e.ids) for e in loaded.tokenizer.encode_batch(list(texts))]
        longest = max(lengths)
        if longest > loaded.max_tokens:
            # fastembed would silently truncate; chunking.py must have split it first.
            raise ValueError(f"Text of {longest} tokens exceeds the {loaded.max_tokens} limit")
        order = sorted(range(len(texts)), key=lengths.__getitem__)
        rows: list[Vectors] = [np.empty(0, dtype=np.float32)] * len(texts)
        batch: list[int] = []
        for index in order:
            # Sorted ascending, so this text is the longest in the batch so far.
            if batch and (len(batch) + 1) * lengths[index] > BATCH_TOKEN_BUDGET:
                _embed_batch(loaded.model, texts, batch, rows)
                batch = []
            batch.append(index)
        if batch:
            _embed_batch(loaded.model, texts, batch, rows)
        return np.vstack(rows).astype(np.float32)


def _embed_batch(
    model: "TextEmbedding", texts: Sequence[str], batch: list[int], rows: list[Vectors]
) -> None:
    vectors = model.embed([texts[i] for i in batch], batch_size=len(batch))
    for index, vector in zip(batch, vectors, strict=True):
        rows[index] = np.asarray(vector, dtype=np.float32)
