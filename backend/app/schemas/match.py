"""AI match requests and responses (ADR 0004; flow in docs/architecture.md "Match API")."""

import uuid
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

from app.schemas.common import UtcDatetime

# Same normalisation as resume text; 20k characters covers the longest real JDs we found.
MAX_JD_CHARS = 20_000
# Chunks are lines, so these bound the vectors a request carries (and the browser's work):
# the worst case we measured (a 50k-character resume, a 20k JD) has 336 and 134.
MAX_RESUME_CHUNKS = 600
MAX_JD_CHUNKS = 300
VECTOR_BYTES = 4  # float32
# base64 of rows x dim x 4 bytes, with the 384-dimension browser model.
MAX_RESUME_VECTORS_CHARS = (MAX_RESUME_CHUNKS * 384 * VECTOR_BYTES + 2) // 3 * 4
MAX_JD_VECTORS_CHARS = (MAX_JD_CHUNKS * 384 * VECTOR_BYTES + 2) // 3 * 4

EmbeddingsMode = Literal["client", "server", "off"]


def _normalise_jd(value: str) -> str:
    text = value.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").strip()
    if not text:
        raise ValueError("Paste the job description")
    if len(text) > MAX_JD_CHARS:
        raise ValueError(f"Job description must be at most {MAX_JD_CHARS:,} characters")
    return text


JdText = Annotated[str, AfterValidator(_normalise_jd)]


class ModelSpec(BaseModel):
    """What the browser loads: files at /models/<id>/<revision>/ (ADR 0004)."""

    id: str
    revision: str
    dtype: str
    dim: int


class MatchConfig(BaseModel):
    embeddings: EmbeddingsMode
    model: ModelSpec | None  # client mode only
    max_jd_chars: int
    max_resume_chunks: int
    max_jd_chunks: int


class MatchPrepare(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume_id: uuid.UUID
    jd_text: JdText


class MatchPrepared(BaseModel):
    """Client mode: embed these chunks, in order, and send them back with the digest."""

    model: ModelSpec
    digest: str
    jd_chunks: list[str]
    resume_chunks: list[str]


class ClientEmbeddings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # From /match/prepare: proves the vectors are for the chunks the server derives now.
    digest: Annotated[str, Field(min_length=64, max_length=64)]
    # Little-endian float32, row-major (one row per chunk), base64. JSON numbers would be
    # ~4x larger for the same values.
    jd: Annotated[str, Field(max_length=MAX_JD_VECTORS_CHARS)]
    resume: Annotated[str, Field(max_length=MAX_RESUME_VECTORS_CHARS)]


class MatchCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume_id: uuid.UUID
    jd_text: JdText
    application_id: uuid.UUID | None = None
    # Required with MATCH_EMBEDDINGS=client; not accepted with server.
    embeddings: ClientEmbeddings | None = None


class SkillRequirement(BaseModel):
    skills: list[str]  # any one meets it
    label: str  # "Python", "FastAPI, Django or Flask"
    required: bool  # False: a nice-to-have


class EvidencePair(BaseModel):
    jd_text: str
    resume_text: str
    similarity: float  # raw cosine


class MatchSummary(BaseModel):
    id: uuid.UUID
    score: int
    resume_version_id: uuid.UUID
    resume_label: str
    application_id: uuid.UUID | None
    company: str | None
    role_title: str | None
    jd_excerpt: str  # the first line of the JD, shortened
    # Scored with today's model and versions; older results aren't comparable (re-run).
    is_current: bool
    created_at: UtcDatetime


class MatchRead(MatchSummary):
    jd_text: str
    skill_coverage: float | None  # 0-1; None when the JD named no known skills
    semantic_score: float  # 0-1, calibrated
    matched_skills: list[SkillRequirement]
    missing_skills: list[SkillRequirement]
    suggested_keywords: list[str]
    evidence: list[EvidencePair]
    sections_detected: bool
    model_name: str
    scoring_version: int
    calibration_version: int
    taxonomy_version: int
