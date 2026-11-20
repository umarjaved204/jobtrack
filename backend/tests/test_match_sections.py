"""Job description sections: headings, inline preferred markers, ignored parts."""

import pytest

from app.services.match.sections import SectionKind, heading_kind, split_sections

REQ, PREF, NEUTRAL, IGNORED = (
    SectionKind.REQUIRED,
    SectionKind.PREFERRED,
    SectionKind.NEUTRAL,
    SectionKind.IGNORED,
)


@pytest.mark.parametrize(
    ("line", "kind"),
    [
        ("Requirements", REQ),
        ("Requirements:", REQ),
        ("**About you**", REQ),
        ("What you\u2019ll need", REQ),
        ("What you'll need:", REQ),
        ("Minimum qualifications", REQ),
        ("Skills and experience", REQ),
        ("Must-haves", REQ),
        ("## Nice to have", PREF),
        ("Nice-to-haves:", PREF),
        ("Preferred qualifications", PREF),
        ("Desired skills", PREF),
        ("Bonus points", PREF),
        ("Responsibilities", NEUTRAL),
        ("About the role", NEUTRAL),
        ("Tech stack:", NEUTRAL),
        ("About Northwind", IGNORED),
        ("Benefits & perks", IGNORED),
        ("Bonus & benefits:", IGNORED),
        ("How to apply", IGNORED),
    ],
)
def test_recognises_headings(line: str, kind: SectionKind) -> None:
    assert heading_kind(line) is kind


@pytest.mark.parametrize(
    "line",
    [
        "Experience with Python",
        "Strong Python experience",
        "- Experience with Python",
        "* Requirements gathering with stakeholders",
        "5+ years of experience",
        "You have shipped production systems in Go and Rust for several years.",
        "Requirements.",
        "",
    ],
)
def test_ordinary_lines_are_not_headings(line: str) -> None:
    assert heading_kind(line) is None


def kind_of(text: str, phrase: str) -> SectionKind:
    return split_sections(text).kind_at(text.index(phrase))


JD = """Backend Engineer
We move freight. You will build tracking services in Python.

Requirements:
- PostgreSQL in production
- Docker; Kubernetes is a plus.

Nice to have
- Kafka

Benefits
- AWS certification budget
"""


def test_headings_switch_the_section_for_the_lines_below() -> None:
    assert kind_of(JD, "Python") is NEUTRAL
    assert kind_of(JD, "PostgreSQL") is REQ
    assert kind_of(JD, "Docker") is REQ
    assert kind_of(JD, "Kafka") is PREF
    assert kind_of(JD, "AWS") is IGNORED
    assert split_sections(JD).detected


def test_preferred_markers_apply_per_sentence() -> None:
    assert kind_of(JD, "Kubernetes") is PREF
    text = "Python is required. Go would be great. Rust, ideally."
    assert kind_of(text, "Python") is NEUTRAL
    assert kind_of(text, "Go") is PREF
    assert kind_of(text, "Rust") is PREF


def test_markers_do_not_reach_into_ignored_sections() -> None:
    text = "About us\nWe prefer Slack, ideally."
    assert kind_of(text, "Slack") is IGNORED


def test_unstructured_text_is_not_detected() -> None:
    sections = split_sections("We need Python, Django and PostgreSQL.\nShip often.")
    assert not sections.detected
    assert {span.kind for span in sections.spans} == {NEUTRAL}


def test_offsets_cover_the_text() -> None:
    spans = split_sections(JD).spans
    assert spans[0].start == 0
    assert all(span.start < span.end <= len(JD) for span in spans)
