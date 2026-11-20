"""The score formula, the calibration constants, and the score on the labelled pairs.

The calibration constants in `scoring.py` must be what `scripts/calibrate_match.py` fits
from the committed measurements; the labelled-pair checks guard the whole pipeline
(taxonomy, sections, calibration) against regressions. Their thresholds and the measured
values are in docs/architecture.md "Match scoring".
"""

import statistics
from functools import cache

import pytest

from app.services.match.browser_model import BROWSER_MODEL_NAME
from app.services.match.chunking import CHUNKING_VERSION
from app.services.match.local_embedder import MODEL_NAME as LOCAL_MODEL_NAME
from app.services.match.scoring import (
    CALIBRATIONS,
    SCORING_VERSION,
    Calibration,
    UncalibratedModelError,
    calibration_for,
    score_match,
)
from app.services.match.skills import compare_skills
from scripts.calibrate_match import fit_anchors, load_pairs, load_raw, pair_key, read_text

CALIBRATION = Calibration(version=7, zero=0.6, one=0.8)


# ---------------------------------------------------------------- formula


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(0.5, 0.0), (0.6, 0.0), (0.65, 0.25), (0.7, 0.5), (0.8, 1.0), (0.95, 1.0)],
)
def test_calibration_is_linear_between_the_anchors_and_clipped(raw: float, expected: float) -> None:
    assert CALIBRATION.apply(raw) == pytest.approx(expected)


def test_score_weights_skills_60_and_semantic_40() -> None:
    score = score_match(0.5, 0.7, CALIBRATION)  # semantic 0.5
    assert score.value == 50
    score = score_match(1.0, 0.6, CALIBRATION)  # semantic 0
    assert score.value == 60
    score = score_match(0.0, 0.8, CALIBRATION)  # semantic 1
    assert score.value == 40


def test_without_skills_the_score_is_semantic_alone() -> None:
    score = score_match(None, 0.75, CALIBRATION)
    assert score.value == 75
    assert score.skill_coverage is None
    assert score.semantic == pytest.approx(0.75)


def test_score_is_a_whole_number_with_its_parts_and_versions() -> None:
    score = score_match(2 / 3, 0.6123, CALIBRATION)
    assert score.value == 42  # 100 x (0.6 x 2/3 + 0.4 x 0.0615) = 42.46
    assert isinstance(score.value, int)
    assert score.raw_similarity == 0.6123
    assert (score.scoring_version, score.calibration_version) == (SCORING_VERSION, 7)


@pytest.mark.parametrize(("coverage", "raw"), [(0.0, -1.0), (1.0, 1.0), (None, -1.0), (None, 1.0)])
def test_score_stays_in_range(coverage: float | None, raw: float) -> None:
    assert 0 <= score_match(coverage, raw, CALIBRATION).value <= 100


def test_an_uncalibrated_model_is_an_error() -> None:
    with pytest.raises(UncalibratedModelError):
        calibration_for("fake-bow-256")
    assert calibration_for("fake", {"fake": CALIBRATION}) is CALIBRATION


def test_scoring_and_chunking_versions_move_together() -> None:
    # Chunking changes the raw similarities: bump SCORING_VERSION, re-run
    # scripts/calibrate_match.py and update the calibrations, then update this pair.
    assert (SCORING_VERSION, CHUNKING_VERSION) == (1, 1)


# ---------------------------------------------------------------- calibration constants


def test_both_model_builds_are_calibrated_and_measured() -> None:
    assert set(CALIBRATIONS) == {BROWSER_MODEL_NAME, LOCAL_MODEL_NAME}
    raw = load_raw()
    assert set(raw) == set(CALIBRATIONS)
    keys = {pair_key(p) for p in load_pairs()}
    for measured in raw.values():
        assert set(measured) == keys


@pytest.mark.parametrize("model_name", sorted(CALIBRATIONS))
def test_calibration_constants_are_the_fit_of_the_measurements(model_name: str) -> None:
    pairs = load_pairs()
    measured = load_raw()[model_name]
    zero, one = fit_anchors([measured[pair_key(p)] for p in pairs], [p["grade"] for p in pairs])
    calibration = CALIBRATIONS[model_name]
    assert calibration.zero == pytest.approx(zero, abs=1e-4)
    assert calibration.one == pytest.approx(one, abs=1e-4)


def test_the_two_builds_agree_closely() -> None:
    raw = load_raw()
    drift = [
        abs(raw[BROWSER_MODEL_NAME][key] - raw[LOCAL_MODEL_NAME][key])
        for key in raw[BROWSER_MODEL_NAME]
    ]
    assert max(drift) < 0.01


# ---------------------------------------------------------------- labelled pairs


@cache
def labelled_scores() -> list[tuple[int, int]]:
    """(grade, score) per pair, for the browser model (what users run)."""
    calibration = CALIBRATIONS[BROWSER_MODEL_NAME]
    measured = load_raw()[BROWSER_MODEL_NAME]
    results = []
    for pair in load_pairs():
        skills = compare_skills(read_text("jds", pair["jd"]), read_text("resumes", pair["resume"]))
        score = score_match(skills.coverage, measured[pair_key(pair)], calibration)
        results.append((pair["grade"], score.value))
    return results


def test_mean_score_rises_with_each_grade() -> None:
    means = [
        statistics.mean(score for grade, score in labelled_scores() if grade == g) for g in range(4)
    ]
    assert means == sorted(means)
    assert len(set(means)) == 4


def test_pairs_of_different_grades_are_almost_always_ordered() -> None:
    """Concordance: of all (higher grade, lower grade) combinations, the share where the
    higher grade scores higher (ties count half)."""
    scores = labelled_scores()
    outcomes = [
        1.0 if high > low else 0.5 if high == low else 0.0
        for g_high, high in scores
        for g_low, low in scores
        if g_high > g_low
    ]
    assert statistics.mean(outcomes) >= 0.95


def test_the_role_scores_well_and_a_different_profession_scores_low() -> None:
    scores = labelled_scores()
    assert min(score for grade, score in scores if grade == 3) >= 60
    assert max(score for grade, score in scores if grade == 0) <= 20


# ---------------------------------------------------------------- measurements are current


@pytest.mark.model
def test_browser_measurements_are_current() -> None:
    """Re-measures with the browser's q8 file (needs `pnpm fetch-model` in frontend/)."""
    from scripts.calibrate_match import BROWSER_ONNX, OnnxBrowserEmbedder, measure

    if not BROWSER_ONNX.exists():
        pytest.skip("run `pnpm fetch-model` in frontend/ first")
    fresh = measure(OnnxBrowserEmbedder())
    stored = load_raw()[BROWSER_MODEL_NAME]
    assert fresh == pytest.approx(stored, abs=1e-4)


@pytest.mark.model
def test_server_measurements_are_current() -> None:
    from scripts.calibrate_match import measure, server_embedder

    fresh = measure(server_embedder())
    stored = load_raw()[LOCAL_MODEL_NAME]
    assert fresh == pytest.approx(stored, abs=1e-4)
