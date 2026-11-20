"""The real fastembed model. Marked `model`: skipped by default and in CI.

Run locally with `uv run pytest -m model` (downloads the model into MATCH_MODEL_DIR on the
first run). The Docker build runs its own smoke check against the baked-in model.
"""

import re
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest

from app.core.config import get_settings
from app.services.match.chunking import chunk_job_description, chunk_resume
from app.services.match.local_embedder import MODEL_NAME, LocalEmbedder
from app.services.match.semantic import ResumeEmbeddingCache, semantic_match

DOCKERFILE = Path(__file__).resolve().parents[1] / "Dockerfile"


def test_dockerfile_bakes_the_same_model() -> None:
    """Not marked: runs everywhere, so the image and the code can't drift apart."""
    match = re.search(r"^ARG MATCH_MODEL=(\S+)$", DOCKERFILE.read_text(encoding="utf-8"), re.M)
    assert match is not None, "Dockerfile must declare ARG MATCH_MODEL=..."
    assert match.group(1) == MODEL_NAME


@pytest.fixture(scope="module")
def embedder(monkeypatch_module: pytest.MonkeyPatch) -> LocalEmbedder:
    # huggingface_hub warns about symlinks on Windows; every warning fails the run.
    monkeypatch_module.setenv("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    settings = get_settings()
    embedder = LocalEmbedder(settings.match_model_dir, offline=settings.match_model_offline)
    embedder.load()
    return embedder


@pytest.fixture(scope="module")
def monkeypatch_module() -> Iterator[pytest.MonkeyPatch]:
    with pytest.MonkeyPatch.context() as patch:
        yield patch


@pytest.mark.model
def test_loads_lazily_and_reports_the_limit(embedder: LocalEmbedder) -> None:
    assert embedder.is_loaded
    assert embedder.model_name == MODEL_NAME
    assert embedder.max_tokens == 512
    assert LocalEmbedder(Path("unused"), offline=True).is_loaded is False


@pytest.mark.model
def test_token_counts_are_not_truncated(embedder: LocalEmbedder) -> None:
    assert embedder.count_tokens("Kubernetes " * 700) > 512


@pytest.mark.model
def test_embeddings_are_normalised_and_meaningful(embedder: LocalEmbedder) -> None:
    vectors = embedder.embed(
        [
            "Built Django REST APIs on PostgreSQL",
            "Developed Python web services with Django",
            "Baked sourdough bread every morning",
        ]
    )
    assert vectors.shape == (3, 384)
    np.testing.assert_allclose(np.linalg.norm(vectors, axis=1), 1.0, rtol=1e-4)
    assert float(vectors[0] @ vectors[1]) > float(vectors[0] @ vectors[2])


@pytest.mark.model
def test_embed_refuses_text_it_would_truncate(embedder: LocalEmbedder) -> None:
    with pytest.raises(ValueError, match="exceeds"):
        embedder.embed(["Kubernetes " * 700])


@pytest.mark.model
def test_batching_keeps_the_input_order(embedder: LocalEmbedder) -> None:
    texts = ["short", "a much longer line about Kubernetes operators " * 20, "mid length text"]
    together = embedder.embed(texts)
    one_by_one = np.vstack([embedder.embed([t]) for t in texts])
    np.testing.assert_allclose(together, one_by_one, atol=1e-4)


@pytest.mark.model
def test_chunks_fit_the_real_tokenizer(embedder: LocalEmbedder) -> None:
    long_line = "Designed event-driven freight tracking with Kafka and PostgreSQL. " * 120
    for chunks in (
        chunk_resume(long_line, embedder),
        chunk_job_description(f"Requirements:\n- {long_line}", embedder),
    ):
        assert len(chunks) > 1
        assert all(embedder.count_tokens(c.text) <= embedder.max_tokens for c in chunks)


@pytest.mark.model
def test_end_to_end_semantic_match(embedder: LocalEmbedder) -> None:
    jd = "Requirements:\n- Build Django REST APIs\n- Tune PostgreSQL queries\n"
    resume = "Built Django REST APIs for a freight platform\nTuned slow PostgreSQL queries"
    related = semantic_match(jd, resume, embedder, ResumeEmbeddingCache())
    unrelated = semantic_match(
        jd, "Head pastry chef\nRan a bakery team of six", embedder, ResumeEmbeddingCache()
    )
    assert related.similarity > unrelated.similarity
    assert related.evidence[0].resume_text in resume.splitlines()


@pytest.mark.model
def test_shipped_tokenizer_counts_like_fastembeds(embedder: LocalEmbedder) -> None:
    """The browser model's tokenizer.json and fastembed's bge build tokenize identically,
    so chunks fit either model."""
    from app.services.match.browser_model import get_bge_tokenizer

    tokenizer = get_bge_tokenizer()
    data = Path(__file__).resolve().parents[1] / "scripts" / "bench_data"
    for name in ("resume_two_page.txt", "jd_long.txt"):
        for line in (data / name).read_text(encoding="utf-8").splitlines():
            assert tokenizer.count_tokens(line) == embedder.count_tokens(line), line
