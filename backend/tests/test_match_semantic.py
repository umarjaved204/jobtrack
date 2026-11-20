"""Chunking (never over the token limit, never losing text), max-sim similarity, the cache."""

import random

import numpy as np
import pytest

from app.services.match.chunking import (
    ChunkingError,
    chunk_job_description,
    chunk_resume,
    split_to_fit,
)
from app.services.match.embedder import FakeEmbedder
from app.services.match.semantic import ResumeEmbeddingCache, semantic_match

_WORDS_TEXT = (
    "ship freight track carrier python django postgres docker redis queue rates invoice "
    "customs pallet route depot driver api schema index migrate deploy monitor alert"
)
WORDS = _WORDS_TEXT.split()


def random_text(rng: random.Random, words: int) -> str:
    parts = []
    for _ in range(words):
        word = rng.choice(WORDS)
        roll = rng.random()
        if roll < 0.08:
            word += "."
        elif roll < 0.14:
            word += ","
        parts.append(word)
    return " ".join(parts)


@pytest.mark.parametrize("max_tokens", [5, 8, 16, 64])
def test_split_to_fit_never_exceeds_the_limit_and_loses_nothing(max_tokens: int) -> None:
    embedder = FakeEmbedder(max_tokens=max_tokens)
    rng = random.Random(max_tokens)  # noqa: S311 (test data, not crypto)
    for _ in range(200):
        text = random_text(rng, rng.randint(1, 120))
        pieces = split_to_fit(text, embedder)
        assert all(embedder.count_tokens(p) <= max_tokens for p in pieces)
        assert " ".join(pieces).split() == text.split()


def test_one_enormous_word_is_split_between_characters() -> None:
    embedder = FakeEmbedder(max_tokens=5)
    word = "https://example.org/" + "a_b" * 40  # one "word", many punctuation tokens
    pieces = split_to_fit(word, embedder)
    assert len(pieces) > 1
    assert all(embedder.count_tokens(p) <= 5 for p in pieces)
    assert "".join(pieces) == word


def test_a_limit_below_the_special_tokens_is_a_configuration_error() -> None:
    with pytest.raises(ChunkingError):
        split_to_fit("hello world", FakeEmbedder(max_tokens=2))


def test_short_text_is_one_chunk() -> None:
    assert split_to_fit("Python and Django", FakeEmbedder()) == ["Python and Django"]


def test_resume_chunks_are_lines_without_bullets_or_blanks() -> None:
    text = "Sam Okafor\n\n- Built Django APIs\n\u2022 Ran Postgres\n  3) Led a team of four\n"
    chunks = chunk_resume(text, FakeEmbedder())
    assert [c.text for c in chunks] == [
        "Sam Okafor",
        "Built Django APIs",
        "Ran Postgres",
        "Led a team of four",
    ]
    assert {c.weight for c in chunks} == {1.0}


JD = """Backend Engineer
You will build freight tracking services.

Requirements:
- Python and Django
- PostgreSQL in production

Nice to have:
- Kubernetes

Benefits
- Free lunch
"""


def test_jd_chunks_skip_headings_and_ignored_sections_and_weight_preferred_lines() -> None:
    chunks = chunk_job_description(JD, FakeEmbedder())
    assert [(c.text, c.weight) for c in chunks] == [
        ("Backend Engineer", 1.0),
        ("You will build freight tracking services.", 1.0),
        ("Python and Django", 1.0),
        ("PostgreSQL in production", 1.0),
        ("Kubernetes", 0.5),
    ]


def test_inline_preferred_marker_halves_the_weight() -> None:
    chunks = chunk_job_description("Kubernetes is a plus.\nPython daily.", FakeEmbedder())
    assert [c.weight for c in chunks] == [0.5, 1.0]


def test_a_jd_of_only_headings_falls_back_to_every_line() -> None:
    chunks = chunk_job_description("Requirements:\nNice to have:\n", FakeEmbedder())
    assert [c.text for c in chunks] == ["Requirements:", "Nice to have:"]


def test_long_jd_lines_are_split_not_truncated() -> None:
    embedder = FakeEmbedder(max_tokens=10)
    line = " ".join(WORDS)
    chunks = chunk_job_description(f"Requirements:\n- {line}\n", embedder)
    assert len(chunks) > 1
    assert all(embedder.count_tokens(c.text) <= 10 for c in chunks)
    assert " ".join(c.text for c in chunks).split() == WORDS


def test_fake_embedder_is_deterministic_and_bag_of_words() -> None:
    embedder = FakeEmbedder()
    a, b, c = embedder.embed(["python django api", "API Django python", "pallet depot route"])
    np.testing.assert_array_equal(a, b)  # same words, any order or case
    np.testing.assert_array_equal(embedder.embed(["python django api"])[0], a)  # stable
    # No shared words: only hash collisions can make these overlap, and these don't.
    assert float(a @ c) == 0.0


def test_identical_texts_are_fully_similar() -> None:
    text = "Built Django APIs\nRan PostgreSQL in production"
    result = semantic_match(text, text, FakeEmbedder(), ResumeEmbeddingCache())
    assert result.similarity == pytest.approx(1.0, abs=1e-5)


def test_similarity_is_the_weighted_mean_of_each_jd_lines_best_match() -> None:
    embedder = FakeEmbedder()
    jd = "Requirements:\n- alpha beta gamma\n\nNice to have:\n- delta epsilon zeta\n"
    resume = "alpha beta gamma\nunrelated words here"
    vectors = embedder.embed(["delta epsilon zeta", "alpha beta gamma", "unrelated words here"])
    vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
    preferred_best = max(float(vectors[0] @ vectors[1]), float(vectors[0] @ vectors[2]))

    result = semantic_match(jd, resume, embedder, ResumeEmbeddingCache())

    assert result.similarity == pytest.approx((1.0 + 0.5 * preferred_best) / 1.5, abs=1e-5)
    assert (result.jd_chunks, result.resume_chunks) == (2, 2)


def test_evidence_pairs_each_jd_line_with_its_best_resume_line() -> None:
    jd = "Requirements:\n- Django REST APIs\n- PostgreSQL tuning\n- Kafka consumers\n"
    resume = "Kafka consumers for orders\nTuned PostgreSQL indexes\nBuilt Django REST APIs"
    result = semantic_match(jd, resume, FakeEmbedder(), ResumeEmbeddingCache())
    pairs = {e.jd_text: e.resume_text for e in result.evidence}
    assert pairs == {
        "Django REST APIs": "Built Django REST APIs",
        "PostgreSQL tuning": "Tuned PostgreSQL indexes",
        "Kafka consumers": "Kafka consumers for orders",
    }
    similarities = [e.similarity for e in result.evidence]
    assert similarities == sorted(similarities, reverse=True)


def test_evidence_is_capped() -> None:
    jd = "\n".join(f"line {word}" for word in WORDS)
    result = semantic_match(jd, "line ship", FakeEmbedder(), ResumeEmbeddingCache())
    assert len(result.evidence) == 5


def test_cache_embeds_a_resume_once() -> None:
    embedder = FakeEmbedder()
    cache = ResumeEmbeddingCache()
    resume = "Built Django APIs\nRan PostgreSQL"
    semantic_match("Django developer", resume, embedder, cache)
    after_first = embedder.embedded_texts
    semantic_match("PostgreSQL administrator", resume, embedder, cache)
    # Second match embeds only the JD's single chunk.
    assert embedder.embedded_texts == after_first + 1
    assert len(cache) == 1


def test_cache_key_includes_the_model_and_token_limit() -> None:
    cache = ResumeEmbeddingCache()
    resume = "Built Django APIs"
    first = cache.get(resume, FakeEmbedder())
    assert cache.get(resume, FakeEmbedder(dim=128)) is not first
    assert cache.get(resume, FakeEmbedder(max_tokens=64)) is not first
    assert cache.get(resume, FakeEmbedder()) is first
    assert len(cache) == 3


def test_cache_evicts_the_least_recently_used() -> None:
    embedder = FakeEmbedder()
    cache = ResumeEmbeddingCache(maxsize=2)
    a = cache.get("resume a", embedder)
    cache.get("resume b", embedder)
    assert cache.get("resume a", embedder) is a  # a is now most recent
    cache.get("resume c", embedder)  # evicts b
    assert len(cache) == 2
    assert cache.get("resume a", embedder) is a
    before = embedder.embedded_texts
    cache.get("resume b", embedder)
    assert embedder.embedded_texts == before + 1


def test_cached_vectors_are_read_only_and_normalised() -> None:
    entry = ResumeEmbeddingCache().get("Built Django APIs\nRan PostgreSQL", FakeEmbedder())
    assert not entry.vectors.flags.writeable
    np.testing.assert_allclose(np.linalg.norm(entry.vectors, axis=1), 1.0, rtol=1e-5)
