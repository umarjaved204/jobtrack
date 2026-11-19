"""Semantic similarity between a job description and a resume, with evidence.

For each JD chunk, take the most similar resume chunk (cosine, "max-sim"). The similarity
is the weighted mean of those maxima, with section weights from `chunking.py` (preferred
lines count half). This is the *raw* similarity; `scoring.py` calibrates it before it
reaches the user, because raw cosines from bge models bunch in a narrow band.

Evidence: the JD lines with the strongest weighted match, each paired with the resume line
that matched it best.

Resume embeddings are cached (LRU, in memory) by sha256 of the text + model name + chunking
version + token limit. That is safe because a resume's text is frozen once it is used
(`services/resumes.py`), and even an edited text simply gets a new key.
"""

import hashlib
import threading
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np

from app.services.match.chunking import CHUNKING_VERSION, chunk_job_description, chunk_resume
from app.services.match.embedder import Embedder, Vectors

EVIDENCE_PAIRS = 5
# Each cached resume is roughly chunks x dim x 4 bytes (400 x 384 x 4 = 600 KB at most),
# so 16 entries stay around 10 MB on a 512 MB instance.
RESUME_CACHE_SIZE = 16


@dataclass(frozen=True)
class Evidence:
    jd_text: str
    resume_text: str
    similarity: float


@dataclass(frozen=True)
class SemanticMatch:
    similarity: float  # raw weighted mean of max cosines, -1..1
    evidence: list[Evidence]
    jd_chunks: int
    resume_chunks: int


@dataclass(frozen=True)
class EmbeddedResume:
    texts: list[str]
    vectors: Vectors  # L2-normalised, read-only


def _normalise(vectors: Vectors) -> Vectors:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # an all-zero vector stays zero: similarity 0 to everything
    normalised: Vectors = (vectors / norms).astype(np.float32)
    return normalised


class ResumeEmbeddingCache:
    def __init__(self, maxsize: int = RESUME_CACHE_SIZE) -> None:
        self._maxsize = maxsize
        self._entries: OrderedDict[tuple[str, str, int, int], EmbeddedResume] = OrderedDict()
        self._lock = threading.Lock()

    def __len__(self) -> int:
        return len(self._entries)

    def get(self, resume_text: str, embedder: Embedder) -> EmbeddedResume:
        key = (
            hashlib.sha256(resume_text.encode()).hexdigest(),
            embedder.model_name,
            CHUNKING_VERSION,
            embedder.max_tokens,
        )
        with self._lock:
            cached = self._entries.get(key)
            if cached is not None:
                self._entries.move_to_end(key)
                return cached

        # Embed outside the lock; at worst two threads embed the same resume once each.
        texts = [chunk.text for chunk in chunk_resume(resume_text, embedder)]
        vectors = _normalise(embedder.embed(texts))
        vectors.setflags(write=False)
        entry = EmbeddedResume(texts, vectors)

        with self._lock:
            self._entries[key] = entry
            self._entries.move_to_end(key)
            while len(self._entries) > self._maxsize:
                self._entries.popitem(last=False)
        return entry

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


def semantic_match(
    jd_text: str, resume_text: str, embedder: Embedder, cache: ResumeEmbeddingCache
) -> SemanticMatch:
    resume = cache.get(resume_text, embedder)
    jd_chunks = chunk_job_description(jd_text, embedder)
    if not jd_chunks or not resume.texts:
        return SemanticMatch(0.0, [], len(jd_chunks), len(resume.texts))

    jd_vectors = _normalise(embedder.embed([chunk.text for chunk in jd_chunks]))
    similarities = jd_vectors @ resume.vectors.T  # (jd chunks, resume chunks)
    best = similarities.argmax(axis=1)
    maxima = similarities[np.arange(len(jd_chunks)), best]
    weights = np.array([chunk.weight for chunk in jd_chunks], dtype=np.float32)
    similarity = float(np.clip((maxima * weights).sum() / weights.sum(), -1.0, 1.0))

    order = np.argsort(-(maxima * weights), kind="stable")[:EVIDENCE_PAIRS]
    evidence = [
        Evidence(
            jd_text=jd_chunks[i].text,
            resume_text=resume.texts[best[i]],
            similarity=round(float(maxima[i]), 4),
        )
        for i in order
    ]
    return SemanticMatch(similarity, evidence, len(jd_chunks), len(resume.texts))
