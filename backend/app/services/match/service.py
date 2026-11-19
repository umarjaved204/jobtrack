"""The match API's service: prepare, score and store, read back (ADR 0004).

`MATCH_EMBEDDINGS` decides where the vectors come from:

- **client** (production): `prepare` chunks both texts with the browser model's tokenizer
  and returns the chunks with a digest. The browser embeds them and calls `create_match`
  with the digest and the vectors. The server re-chunks deterministically; a different
  digest means the texts (or the model) changed since `prepare`, and the request is a 409.
  The vectors are checked for everything cheap (shape, finite, unit length): they can't be
  verified without running the model, which is the point of not running it here. That is
  acceptable because a user can only affect their own score (ADR 0004, "Trusting client
  vectors"). Client vectors never enter the shared resume-embedding cache: another user
  with the same resume text would get them.
- **server** (dev, self-hosting): the server embeds with fastembed, one match at a time per
  process; a request that can't start within a few seconds gets a 503 with Retry-After.
- **off**: matching endpoints answer 503; `GET /match/config` tells the page why.

Skills, keywords and the score are always computed here, from the text.

A resume's text is frozen once a match uses it (`services/resumes.py`). Saving re-reads
the text `FOR SHARE`, and a text edit locks the row before checking for uses, so an edit
can't slip in between scoring and saving: one of the two waits for the other.
"""

import base64
import binascii
import hashlib
import json
import threading
import uuid
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import numpy as np
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import (
    ConflictError,
    FieldValidationError,
    NotFoundError,
    ServiceUnavailableError,
    UnprocessableError,
)
from app.core.rate_limit import Limit, limiter
from app.models import Application, MatchResult, ResumeVersion, User
from app.schemas.common import Page
from app.schemas.match import (
    MAX_JD_CHARS,
    MAX_JD_CHUNKS,
    MAX_RESUME_CHUNKS,
    EmbeddingsMode,
    EvidencePair,
    MatchConfig,
    MatchCreate,
    MatchPrepare,
    MatchPrepared,
    MatchRead,
    MatchSummary,
    ModelSpec,
    SkillRequirement,
)
from app.services import applications
from app.services.match.browser_model import BROWSER_MODEL, BROWSER_MODEL_NAME, get_bge_tokenizer
from app.services.match.chunking import (
    CHUNKING_VERSION,
    Chunk,
    chunk_job_description,
    chunk_resume,
)
from app.services.match.embedder import Embedder, TokenCounter, Vectors
from app.services.match.keywords import suggest_keywords
from app.services.match.local_embedder import MODEL_NAME as LOCAL_MODEL_NAME
from app.services.match.scoring import CALIBRATIONS, SCORING_VERSION, calibration_for, score_match
from app.services.match.semantic import (
    ResumeEmbeddingCache,
    SemanticMatch,
    max_sim,
    semantic_match,
)
from app.services.match.skills import JdRequirement, compare_skills
from app.services.match.taxonomy import load_taxonomy

NOT_FOUND = "Match not found"
RESUME_NOT_FOUND = "Resume version not found"
RESUME_ARCHIVED = "This resume version is archived. Unarchive it to match against it."
SWITCHED_OFF = "Matching is switched off on this server"
CHANGED = "The resume or the job description changed since the match was prepared. Try again."
BUSY = "Another match is running. Try again in a few seconds."
SERVER_MODE_ONLY = "This server computes the embeddings itself: send the match without them"

UNIT_TOLERANCE = 1e-3
SERVER_WAIT_SECONDS = 10
BUSY_RETRY_AFTER_SECONDS = 15
JD_EXCERPT_CHARS = 120
# The list reads only this much of each JD to find its first line.
JD_EXCERPT_SOURCE_CHARS = 400


# --------------------------------------------------------------------------- config


def _mode() -> EmbeddingsMode:
    return get_settings().match_embeddings


def _active_model_name(mode: EmbeddingsMode) -> str | None:
    return {"client": BROWSER_MODEL_NAME, "server": LOCAL_MODEL_NAME}.get(mode)


def _browser_spec() -> ModelSpec:
    return ModelSpec(
        id=BROWSER_MODEL.id,
        revision=BROWSER_MODEL.revision,
        dtype=BROWSER_MODEL.dtype,
        dim=BROWSER_MODEL.dim,
    )


def get_config() -> MatchConfig:
    mode = _mode()
    return MatchConfig(
        embeddings=mode,
        model=_browser_spec() if mode == "client" else None,
        max_jd_chars=MAX_JD_CHARS,
        max_resume_chunks=MAX_RESUME_CHUNKS,
        max_jd_chunks=MAX_JD_CHUNKS,
    )


def _require_enabled() -> EmbeddingsMode:
    mode = _mode()
    if mode == "off":
        raise ServiceUnavailableError(SWITCHED_OFF)
    return mode


def _limit(user: User, action: str) -> None:
    settings = get_settings()
    if settings.rate_limit_enabled:
        limiter.hit(
            f"match:{action}:user:{user.id}",
            Limit(settings.rate_limit_match_per_user, settings.rate_limit_match_window_seconds),
        )


# --------------------------------------------------------------------------- inputs


def _resume_text(db: Session, user: User, resume_id: uuid.UUID) -> str:
    row = db.execute(
        select(ResumeVersion.content_text, ResumeVersion.archived_at).where(
            ResumeVersion.id == resume_id, ResumeVersion.user_id == user.id
        )
    ).one_or_none()
    if row is None:
        raise NotFoundError(RESUME_NOT_FOUND)
    if row.archived_at is not None:
        raise UnprocessableError(RESUME_ARCHIVED)
    return str(row.content_text)


def _chunks(jd_text: str, resume_text: str, counter: TokenCounter) -> tuple[list[Chunk], list[str]]:
    jd_chunks = chunk_job_description(jd_text, counter)
    if len(jd_chunks) > MAX_JD_CHUNKS:
        raise FieldValidationError(
            "jd_text", f"Job description has too many lines to match (over {MAX_JD_CHUNKS})"
        )
    resume_texts = [chunk.text for chunk in chunk_resume(resume_text, counter)]
    if len(resume_texts) > MAX_RESUME_CHUNKS:
        raise UnprocessableError(
            f"This resume has too many separate lines to match (over {MAX_RESUME_CHUNKS})"
        )
    return jd_chunks, resume_texts


def _digest(model_name: str, jd_chunks: list[Chunk], resume_texts: list[str]) -> str:
    payload = [model_name, CHUNKING_VERSION, [c.text for c in jd_chunks], resume_texts]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode()).hexdigest()


def _decode(encoded: str, rows: int, part: str) -> Vectors:
    """base64 little-endian float32, rows x dim, each row unit length."""
    dim = BROWSER_MODEL.dim
    try:
        raw = base64.b64decode(encoded, validate=True)
    except binascii.Error:
        raise FieldValidationError("embeddings", f"{part} vectors aren't valid base64") from None
    if len(raw) != rows * dim * 4:
        raise FieldValidationError(
            "embeddings", f"Expected {rows} {part} vectors of {dim} dimensions"
        )
    vectors: Vectors = np.frombuffer(raw, dtype="<f4").astype(np.float32).reshape(rows, dim)
    if not np.isfinite(vectors).all():
        raise FieldValidationError("embeddings", f"{part} vectors contain non-finite values")
    if rows and np.abs(np.linalg.norm(vectors, axis=1) - 1).max() > UNIT_TOLERANCE:
        raise FieldValidationError("embeddings", f"{part} vectors must be unit length")
    return vectors


# --------------------------------------------------------------------------- server mode


@lru_cache(maxsize=1)
def _local_embedder() -> Embedder:
    from app.services.match.local_embedder import LocalEmbedder

    settings = get_settings()
    return LocalEmbedder(settings.match_model_dir, offline=settings.match_model_offline)


# Vectors computed here, so safe to share between users (by text hash; see semantic.py).
_server_cache = ResumeEmbeddingCache()
_server_slot = threading.Semaphore(1)


def _server_semantic(jd_text: str, resume_text: str) -> tuple[SemanticMatch, str]:
    embedder = _local_embedder()
    if not _server_slot.acquire(timeout=SERVER_WAIT_SECONDS):
        raise ServiceUnavailableError(BUSY, headers={"Retry-After": str(BUSY_RETRY_AFTER_SECONDS)})
    try:
        _chunks(jd_text, resume_text, embedder)  # the same limits as client mode
        return semantic_match(jd_text, resume_text, embedder, _server_cache), embedder.model_name
    finally:
        _server_slot.release()


# --------------------------------------------------------------------------- prepare, create


def prepare(db: Session, user: User, data: MatchPrepare) -> MatchPrepared:
    if _require_enabled() != "client":
        raise UnprocessableError(SERVER_MODE_ONLY)
    _limit(user, "prepare")
    resume_text = _resume_text(db, user, data.resume_id)
    jd_chunks, resume_texts = _chunks(data.jd_text, resume_text, get_bge_tokenizer())
    return MatchPrepared(
        model=_browser_spec(),
        digest=_digest(BROWSER_MODEL_NAME, jd_chunks, resume_texts),
        jd_chunks=[chunk.text for chunk in jd_chunks],
        resume_chunks=resume_texts,
    )


def _requirement(requirement: JdRequirement) -> dict[str, Any]:
    return {
        "skills": list(requirement.skills),
        "label": requirement.label,
        "required": requirement.required,
    }


def create_match(db: Session, user: User, data: MatchCreate) -> MatchRead:
    mode = _require_enabled()
    _limit(user, "create")
    resume_text = _resume_text(db, user, data.resume_id)
    if data.application_id is not None:
        applications.get_application(db, user, data.application_id)  # 404 unless owned

    if mode == "client":
        if data.embeddings is None:
            raise FieldValidationError("embeddings", "Field required", error_type="missing")
        jd_chunks, resume_texts = _chunks(data.jd_text, resume_text, get_bge_tokenizer())
        if data.embeddings.digest != _digest(BROWSER_MODEL_NAME, jd_chunks, resume_texts):
            raise ConflictError(CHANGED)
        semantic = max_sim(
            jd_chunks,
            _decode(data.embeddings.jd, len(jd_chunks), "Job description"),
            resume_texts,
            _decode(data.embeddings.resume, len(resume_texts), "Resume"),
        )
        model_name = BROWSER_MODEL_NAME
    else:
        if data.embeddings is not None:
            raise FieldValidationError("embeddings", SERVER_MODE_ONLY)
        db.commit()  # don't keep a transaction open while the model runs
        semantic, model_name = _server_semantic(data.jd_text, resume_text)

    skills = compare_skills(data.jd_text, resume_text)
    score = score_match(skills.coverage, semantic.similarity, calibration_for(model_name))

    # Saving freezes the resume's text; it must still be the text that was scored.
    current_text = db.scalar(
        select(ResumeVersion.content_text)
        .where(ResumeVersion.id == data.resume_id)
        .with_for_update(read=True)
    )
    if current_text != resume_text:
        raise ConflictError(CHANGED)

    result = MatchResult(
        id=uuid.uuid4(),
        user_id=user.id,
        resume_version_id=data.resume_id,
        application_id=data.application_id,
        jd_text=data.jd_text,
        score=score.value,
        skill_coverage=score.skill_coverage,
        semantic_score=score.semantic,
        matched_skills=[_requirement(r) for r in skills.matched],
        missing_skills=[_requirement(r) for r in skills.missing],
        suggested_keywords=suggest_keywords(skills, data.jd_text, resume_text),
        evidence=[
            {"jd_text": e.jd_text, "resume_text": e.resume_text, "similarity": e.similarity}
            for e in semantic.evidence
        ],
        sections_detected=skills.sections_detected,
        model_name=model_name,
        scoring_version=score.scoring_version,
        calibration_version=score.calibration_version,
        taxonomy_version=skills.taxonomy_version,
        # In Python, not the DB's now() (per transaction): history orders by it.
        created_at=datetime.now(UTC),
    )
    db.add(result)
    db.commit()
    return get_match(db, user, result.id)


# --------------------------------------------------------------------------- read


def _is_current(
    model_name: str, scoring_version: int, calibration_version: int, taxonomy_version: int
) -> bool:
    """Scored with the model this server uses now, and today's versions: comparable with a
    fresh run. Anything else offers a re-run."""
    calibration = CALIBRATIONS.get(model_name)
    return (
        model_name == _active_model_name(_mode())
        and calibration is not None
        and calibration_version == calibration.version
        and scoring_version == SCORING_VERSION
        and taxonomy_version == load_taxonomy().version
    )


def _excerpt(jd_text: str) -> str:
    first = next((line.strip() for line in jd_text.splitlines() if line.strip()), "")
    if len(first) <= JD_EXCERPT_CHARS:
        return first
    return first[: JD_EXCERPT_CHARS - 1].rstrip() + "…"


def _base_query(user: User) -> Select[MatchResult, str, str | None, str | None]:
    return (
        select(MatchResult, ResumeVersion.label, Application.company, Application.role_title)
        .join(ResumeVersion, ResumeVersion.id == MatchResult.resume_version_id)
        .outerjoin(Application, Application.id == MatchResult.application_id)
        .where(MatchResult.user_id == user.id)
    )


def _summary_fields(
    result: MatchResult, label: str, company: str | None, role: str | None
) -> dict[str, Any]:
    return {
        "id": result.id,
        "score": round(result.score),
        "resume_version_id": result.resume_version_id,
        "resume_label": label,
        "application_id": result.application_id,
        "company": company,
        "role_title": role,
        "jd_excerpt": _excerpt(result.jd_text),
        "is_current": _is_current(
            result.model_name,
            result.scoring_version,
            result.calibration_version,
            result.taxonomy_version,
        ),
        "created_at": result.created_at,
    }


def get_match(db: Session, user: User, match_id: uuid.UUID) -> MatchRead:
    row = db.execute(_base_query(user).where(MatchResult.id == match_id)).one_or_none()
    if row is None:
        raise NotFoundError(NOT_FOUND)
    result, label, company, role = row
    return MatchRead(
        **_summary_fields(result, label, company, role),
        jd_text=result.jd_text,
        skill_coverage=result.skill_coverage,
        semantic_score=result.semantic_score,
        matched_skills=[SkillRequirement.model_validate(item) for item in result.matched_skills],
        missing_skills=[SkillRequirement.model_validate(item) for item in result.missing_skills],
        suggested_keywords=result.suggested_keywords,
        evidence=[EvidencePair.model_validate(item) for item in result.evidence],
        sections_detected=result.sections_detected,
        model_name=result.model_name,
        scoring_version=result.scoring_version,
        calibration_version=result.calibration_version,
        taxonomy_version=result.taxonomy_version,
    )


def list_matches(
    db: Session,
    user: User,
    *,
    application_id: uuid.UUID | None,
    page: int,
    page_size: int,
) -> Page[MatchSummary]:
    """Newest first. Reads only the start of each JD (for its excerpt)."""
    filters = [MatchResult.user_id == user.id]
    if application_id is not None:
        filters.append(MatchResult.application_id == application_id)
    total = db.scalar(select(func.count()).select_from(MatchResult).where(*filters)) or 0

    stmt = (
        select(
            MatchResult.id,
            MatchResult.score,
            MatchResult.resume_version_id,
            ResumeVersion.label,
            MatchResult.application_id,
            Application.company,
            Application.role_title,
            func.left(MatchResult.jd_text, JD_EXCERPT_SOURCE_CHARS),
            MatchResult.model_name,
            MatchResult.scoring_version,
            MatchResult.calibration_version,
            MatchResult.taxonomy_version,
            MatchResult.created_at,
        )
        .join(ResumeVersion, ResumeVersion.id == MatchResult.resume_version_id)
        .outerjoin(Application, Application.id == MatchResult.application_id)
        .where(*filters)
        .order_by(MatchResult.created_at.desc(), MatchResult.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    items = []
    for row in db.execute(stmt):
        items.append(
            MatchSummary(
                id=row.id,
                score=round(row.score),
                resume_version_id=row.resume_version_id,
                resume_label=row.label,
                application_id=row.application_id,
                company=row.company,
                role_title=row.role_title,
                jd_excerpt=_excerpt(row[7]),
                is_current=_is_current(
                    row.model_name,
                    row.scoring_version,
                    row.calibration_version,
                    row.taxonomy_version,
                ),
                created_at=row.created_at,
            )
        )
    return Page(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=applications.page_count(total, page_size),
    )
