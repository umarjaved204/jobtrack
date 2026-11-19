"""The interfaces the matcher depends on, and a deterministic fake for tests.

- `TokenCounter`: all chunking needs. In production that's the model's tokenizer alone
  (`bge_tokenizer.py`): the browser computes the embeddings (ADR 0004).
- `Embedder`: a counter that can also embed, for computing vectors on this server
  (`local_embedder.py`, `MATCH_EMBEDDINGS=server`) and in tests (`FakeEmbedder`).
"""

import hashlib
import re
from collections.abc import Sequence
from typing import Protocol

import numpy as np
import numpy.typing as npt

Vectors = npt.NDArray[np.float32]


class TokenCounter(Protocol):
    @property
    def max_tokens(self) -> int:
        """The model's input limit, special tokens included. Chunks must fit within it."""
        ...

    def count_tokens(self, text: str) -> int:
        """Tokens the model would see for `text`, special tokens included."""
        ...


class Embedder(TokenCounter, Protocol):
    @property
    def model_name(self) -> str:
        """Stored with every result; part of the resume-embedding cache key."""
        ...

    def embed(self, texts: Sequence[str]) -> Vectors:
        """One row per text, shape (len(texts), dim). Rows need not be normalised."""
        ...


_WORD = re.compile(r"\w+|[^\w\s]")


class FakeEmbedder:
    """Hashed bag of words: texts that share words are similar, and nothing else is.

    Deterministic across runs and machines (blake2b, not Python's randomised `hash`), with
    no model download, so unit and API tests run anywhere. Never used in production.
    `max_tokens` is configurable so tests can exercise chunk splitting on short texts.
    Tokens: one per word or punctuation mark, plus 2 for the [CLS]/[SEP] a BERT-style
    model adds.
    """

    SPECIAL_TOKENS = 2

    def __init__(self, *, max_tokens: int = 512, dim: int = 256) -> None:
        self._max_tokens = max_tokens
        self._dim = dim
        self.embedded_texts = 0  # lets tests check what the cache saved

    @property
    def model_name(self) -> str:
        return f"fake-bow-{self._dim}"

    @property
    def max_tokens(self) -> int:
        return self._max_tokens

    def count_tokens(self, text: str) -> int:
        return len(_WORD.findall(text)) + self.SPECIAL_TOKENS

    def embed(self, texts: Sequence[str]) -> Vectors:
        vectors = np.zeros((len(texts), self._dim), dtype=np.float32)
        for row, text in enumerate(texts):
            for word in re.findall(r"\w+", text.casefold()):
                digest = hashlib.blake2b(word.encode(), digest_size=8).digest()
                index = int.from_bytes(digest[:4], "little") % self._dim
                sign = 1.0 if digest[4] & 1 else -1.0
                vectors[row, index] += sign
        self.embedded_texts += len(texts)
        return vectors
