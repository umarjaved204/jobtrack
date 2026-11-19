"""The shipped tokenizer of the browser model (no weights, so these run everywhere)."""

import hashlib
from pathlib import Path

import pytest

from app.services.match.browser_model import (
    BROWSER_MODEL,
    TOKENIZER_GIT_BLOB,
    TOKENIZER_PATH,
    BgeTokenizer,
    get_bge_tokenizer,
)
from app.services.match.chunking import chunk_job_description, chunk_resume

BENCH_DATA = Path(__file__).resolve().parents[1] / "scripts" / "bench_data"


def git_blob_id(data: bytes) -> str:
    """What `git hash-object` prints, and what Hugging Face serves as the file's ETag."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data, usedforsecurity=False).hexdigest()


def test_file_is_the_pinned_revision_byte_for_byte() -> None:
    """Catches a re-download from another revision and any newline/whitespace "fix"
    (the file is excluded from pre-commit's fixers and marked -text in .gitattributes)."""
    assert git_blob_id(TOKENIZER_PATH.read_bytes()) == TOKENIZER_GIT_BLOB


def test_revision_is_a_commit_hash_not_a_branch() -> None:
    assert len(BROWSER_MODEL.revision) == 40
    assert int(BROWSER_MODEL.revision, 16) >= 0


def test_counts_special_tokens_and_lowercases() -> None:
    tokenizer = BgeTokenizer()
    assert tokenizer.count_tokens("") == 2  # [CLS] [SEP]
    assert tokenizer.count_tokens("Python") == 3
    assert tokenizer.count_tokens("PYTHON") == tokenizer.count_tokens("python")


def test_counts_are_never_truncated() -> None:
    tokenizer = get_bge_tokenizer()
    assert tokenizer.max_tokens == 512
    assert tokenizer.count_tokens("Kubernetes " * 700) > 1000


@pytest.mark.parametrize("name", ["resume_two_page.txt", "jd_long.txt"])
def test_real_documents_chunk_within_the_limit(name: str) -> None:
    tokenizer = get_bge_tokenizer()
    text = (BENCH_DATA / name).read_text(encoding="utf-8")
    chunks = chunk_resume(text, tokenizer) + chunk_job_description(text, tokenizer)
    assert chunks
    assert all(tokenizer.count_tokens(chunk.text) <= tokenizer.max_tokens for chunk in chunks)


def test_an_over_long_line_is_split_to_fit() -> None:
    tokenizer = get_bge_tokenizer()
    line = "Designed and operated event pipelines in Kafka and Python. " * 60
    chunks = chunk_resume(line, tokenizer)
    assert len(chunks) > 1
    assert all(tokenizer.count_tokens(chunk.text) <= 512 for chunk in chunks)
