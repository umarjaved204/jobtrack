"""Splitting resumes and job descriptions into pieces the model can embed whole.

One chunk per non-empty line (a bullet, a sentence-per-line paragraph, a skills list), with
bullet marks stripped, so evidence pairs read as "JD line ↔ resume line". A line over the
model's token limit is split at sentence ends, then between words, then (for one enormous
"word", such as a pasted URL) between characters. Nothing is ever truncated or dropped:
every chunk is checked with the model's own tokenizer, and each split piece is checked again.

Job descriptions also skip heading lines and ignored sections (about us, benefits), and
weight each line by its section: required and neutral lines count fully, preferred lines
half. If that leaves nothing (a JD that is all headings), every line counts with weight 1.

Bump `CHUNKING_VERSION` whenever a change could produce different chunks for the same
text: it is part of the resume-embedding cache key.
"""

import re
from dataclasses import dataclass

from app.services.match.embedder import TokenCounter
from app.services.match.sections import SectionKind, heading_kind, split_sections

CHUNKING_VERSION = 1

SECTION_WEIGHTS = {
    SectionKind.REQUIRED: 1.0,
    SectionKind.NEUTRAL: 1.0,
    SectionKind.PREFERRED: 0.5,
}

_BULLET_PREFIX = re.compile(r"^(?:[\s\-\u2022\u00b7\u2013\u2014*>]|\d+[.)](?=\s))+")
_SENTENCE_END = re.compile(r"(?<=[.;!?])\s+")


@dataclass(frozen=True)
class Chunk:
    text: str
    weight: float = 1.0


class ChunkingError(RuntimeError):
    """The model's limit is too small to hold even one character (a configuration bug)."""


def _clean(line: str) -> str:
    return " ".join(_BULLET_PREFIX.sub("", line).split())


def split_to_fit(text: str, embedder: TokenCounter) -> list[str]:
    """`text` as one or more pieces that each fit the model, in order, losing nothing."""
    if embedder.count_tokens(text) <= embedder.max_tokens:
        return [text]
    sentences = _SENTENCE_END.split(text)
    if len(sentences) > 1:
        return _pack(sentences, embedder)
    words = text.split()
    if len(words) > 1:
        return _pack(words, embedder)
    return _split_characters(text, embedder)


def _pack(parts: list[str], embedder: TokenCounter) -> list[str]:
    """Greedily join parts (sentences or words) with spaces while the total fits.

    Costs are counted per part (tokens minus the special tokens an empty text gets), which
    is exact for BERT-style tokenizers because they split on whitespace before WordPiece.
    Each packed piece is still re-checked, and halved if a tokenizer disagrees.
    """
    base = embedder.count_tokens("")
    pieces: list[str] = []
    current: list[str] = []
    used = base
    for part in parts:
        for fitted in split_to_fit(part, embedder):
            cost = embedder.count_tokens(fitted) - base
            if current and used + cost > embedder.max_tokens:
                pieces.append(" ".join(current))
                current, used = [], base
            current.append(fitted)
            used += cost
    if current:
        pieces.append(" ".join(current))
    return [checked for piece in pieces for checked in _verified(piece, embedder)]


def _verified(piece: str, embedder: TokenCounter) -> list[str]:
    if embedder.count_tokens(piece) <= embedder.max_tokens:
        return [piece]
    words = piece.split()
    if len(words) < 2:  # unreachable: single parts come from split_to_fit, so they fit
        return split_to_fit(piece, embedder)
    middle = len(words) // 2
    return _verified(" ".join(words[:middle]), embedder) + _verified(
        " ".join(words[middle:]), embedder
    )


def _split_characters(word: str, embedder: TokenCounter) -> list[str]:
    pieces: list[str] = []
    start = 0
    while start < len(word):
        # Binary search for the longest prefix of the rest that fits.
        low, high = start + 1, len(word)
        if embedder.count_tokens(word[start:low]) > embedder.max_tokens:
            raise ChunkingError(f"max_tokens={embedder.max_tokens} can't fit one character")
        while low < high:
            middle = (low + high + 1) // 2
            if embedder.count_tokens(word[start:middle]) <= embedder.max_tokens:
                low = middle
            else:
                high = middle - 1
        pieces.append(word[start:low])
        start = low
    return pieces


def chunk_resume(text: str, embedder: TokenCounter) -> list[Chunk]:
    chunks: list[Chunk] = []
    for line in text.splitlines():
        cleaned = _clean(line)
        if cleaned:
            chunks.extend(Chunk(piece) for piece in split_to_fit(cleaned, embedder))
    return chunks


def chunk_job_description(text: str, embedder: TokenCounter) -> list[Chunk]:
    sections = split_sections(text)
    chunks: list[Chunk] = []
    offset = 0
    for line in text.splitlines(keepends=True):
        start, offset = offset, offset + len(line)
        cleaned = _clean(line)
        if not cleaned or heading_kind(line) is not None:
            continue
        # The kind where the line's content starts (sentence markers can make it preferred).
        content_start = start + len(line) - len(line.lstrip())
        weight = SECTION_WEIGHTS.get(sections.kind_at(content_start))
        if weight is None:  # ignored section
            continue
        chunks.extend(Chunk(piece, weight) for piece in split_to_fit(cleaned, embedder))
    return chunks or chunk_resume(text, embedder)
