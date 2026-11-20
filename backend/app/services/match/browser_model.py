"""The model the browser embeds with, and its tokenizer for chunking here (ADR 0004).

In production (`MATCH_EMBEDDINGS=client`) the browser computes the embeddings with
Transformers.js. The server still chunks both texts, so it needs exact token counts for
the same model: it ships only the model's `tokenizer.json` (~0.7 MB, no weights), pinned
to the same repository revision the browser downloads. A test checks the file's git blob
id against that revision, so the two can't drift apart.

- **Pinned revision:** a commit hash, never `main`. Hugging Face serves files at a commit
  immutably, so the weights can't change under us and stored scores stay comparable.
  Changing any constant here changes vectors: recalibrate and bump the scoring version.
- **`q8`:** Transformers.js loads `onnx/model_quantized.onnx` (34 MB).
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from tokenizers import Tokenizer


@dataclass(frozen=True)
class BrowserModel:
    id: str
    revision: str
    dtype: str
    dim: int
    max_tokens: int


BROWSER_MODEL = BrowserModel(
    id="Xenova/bge-small-en-v1.5",
    revision="ea104dacec62c0de699686887e3f920caeb4f3e3",
    dtype="q8",
    dim=384,
    # tokenizer_config.json "model_max_length" at that revision; [CLS] and [SEP] included.
    max_tokens=512,
)
# Stored with every result made with the browser's vectors, and the key for its
# calibration (`scoring.py`): the revision is part of the name, so new weights never reuse
# old constants.
BROWSER_MODEL_NAME = f"{BROWSER_MODEL.id}@{BROWSER_MODEL.revision}"

TOKENIZER_PATH = Path(__file__).with_name("bge-small-en-v1.5.tokenizer.json")
# `git hash-object` of tokenizer.json at BROWSER_MODEL.revision (Hugging Face's ETag).
TOKENIZER_GIT_BLOB = "688882a79f44442ddc1f60d70334a7ff5df0fb47"


class BgeTokenizer:
    """A `TokenCounter` for the browser model: exact counts, no truncation, no padding."""

    def __init__(self, path: Path = TOKENIZER_PATH) -> None:
        tokenizer = Tokenizer.from_file(str(path))
        # The file sets neither today; turned off explicitly so a count can never be capped.
        tokenizer.no_truncation()
        tokenizer.no_padding()
        self._tokenizer = tokenizer

    @property
    def max_tokens(self) -> int:
        return BROWSER_MODEL.max_tokens

    def count_tokens(self, text: str) -> int:
        return len(self._tokenizer.encode(text).ids)


@lru_cache
def get_bge_tokenizer() -> BgeTokenizer:
    """Loaded once per process (~50 ms), on first use."""
    return BgeTokenizer()
