"""The match score: skill coverage and calibrated semantic similarity (ADR 0004).

    score = 100 x (0.6 x skill coverage + 0.4 x semantic)     when the JD names skills
    score = 100 x semantic                                     when it names none

Both parts are 0-1. Skill coverage comes from `skills.py`. Semantic is the raw similarity
from `semantic.py`, calibrated per model: raw cosines from bge models bunch in a narrow
band (about 0.59-0.75 on our labelled pairs), so they are mapped linearly from the raw
value that predicts "a different profession" (0) to the one that predicts "the role"
(1), and clipped. The two anchors are a least-squares fit of grade / 3 on raw similarity
over the hand-graded pairs in `scripts/calibration_data/`; `tests/test_match_scoring.py`
re-fits them from the committed measurements and checks the constants below.
docs/architecture.md "Match scoring" has the method and the validation numbers.

The score is an estimate of overlap, not a prediction of how any employer or ATS ranks a
resume; the UI says so. It is a whole number: more digits would be false precision.

Versions (stored with every result; results with different versions are never compared):
- `SCORING_VERSION`: the formula and weights, how skills become requirements (`skills.py`),
  chunking and section weights. Bump it when any of those change (chunking also bumps
  `CHUNKING_VERSION`). Still 1: no result was stored before the requirement rules landed.
- `Calibration.version`: per model. Bump it when its anchors are re-fitted.
- The taxonomy carries its own version (`skills.json`).
"""

from dataclasses import dataclass

from app.services.match.browser_model import BROWSER_MODEL_NAME
from app.services.match.local_embedder import MODEL_NAME as LOCAL_MODEL_NAME

SCORING_VERSION = 1
SKILLS_WEIGHT = 0.6


@dataclass(frozen=True)
class Calibration:
    version: int
    zero: float  # raw similarity that maps to 0
    one: float  # raw similarity that maps to 1

    def apply(self, raw_similarity: float) -> float:
        value = (raw_similarity - self.zero) / (self.one - self.zero)
        return min(max(value, 0.0), 1.0)


# Fitted by `uv run python -m scripts.calibrate_match` (see tests/test_match_scoring.py).
CALIBRATIONS: dict[str, Calibration] = {
    # What users run: the browser's q8 build.
    BROWSER_MODEL_NAME: Calibration(version=1, zero=0.6119, one=0.7480),
    # MATCH_EMBEDDINGS=server (fastembed's build of the same model).
    LOCAL_MODEL_NAME: Calibration(version=1, zero=0.6118, one=0.7505),
}


class UncalibratedModelError(LookupError):
    """No calibration for this model: its raw similarities can't be turned into a score."""


def calibration_for(
    model_name: str, calibrations: dict[str, Calibration] = CALIBRATIONS
) -> Calibration:
    try:
        return calibrations[model_name]
    except KeyError:
        raise UncalibratedModelError(model_name) from None


@dataclass(frozen=True)
class Score:
    value: int  # 0-100
    skill_coverage: float | None  # 0-1; None when the JD names no taxonomy skills
    semantic: float  # calibrated, 0-1
    raw_similarity: float
    scoring_version: int
    calibration_version: int


def score_match(
    skill_coverage: float | None, raw_similarity: float, calibration: Calibration
) -> Score:
    semantic = calibration.apply(raw_similarity)
    if skill_coverage is None:
        combined = semantic
    else:
        combined = SKILLS_WEIGHT * skill_coverage + (1 - SKILLS_WEIGHT) * semantic
    return Score(
        value=round(100 * combined),
        skill_coverage=skill_coverage,
        semantic=semantic,
        raw_similarity=raw_similarity,
        scoring_version=SCORING_VERSION,
        calibration_version=calibration.version,
    )
