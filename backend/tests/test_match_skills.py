"""Skill comparison (matched, missing, required vs preferred, coverage) and keywords."""

import pytest

from app.services.match.keywords import MAX_KEYWORDS, frequent_terms, suggest_keywords
from app.services.match.skills import JdSkill, compare_skills, jd_skills

JD = """Senior Backend Engineer, Northwind Freight

We build logistics software for freight forwarders. You will own shipment tracking.

What you'll need:
- Python (Django or FastAPI)
- PostgreSQL and Redis in production
- Docker and CI/CD
- Comfortable with shipment data, freight rates and carrier integrations

Nice to have:
- Kubernetes
- Go
- Experience with Kafka for shipment events

Benefits
- We sponsor AWS certifications
"""

RESUME = """Sam Okafor, backend developer
Built Django REST APIs on PostgreSQL; deployed with Docker and GitHub Actions.
Wrote Kafka consumers for order events."""


def test_required_and_preferred_skills_in_jd_order() -> None:
    skills, detected = jd_skills(JD)
    assert detected
    assert skills == [
        JdSkill("Python", True),
        JdSkill("Django", True),
        JdSkill("FastAPI", True),
        JdSkill("PostgreSQL", True),
        JdSkill("Redis", True),
        JdSkill("Docker", True),
        JdSkill("CI/CD", True),
        JdSkill("Kubernetes", False),
        JdSkill("Go", False),
        JdSkill("Apache Kafka", False),
    ]


def test_ignored_sections_do_not_ask_for_skills() -> None:
    skills, _ = jd_skills(JD)
    assert "AWS" not in {s.skill for s in skills}


def test_a_skill_mentioned_as_required_anywhere_is_required() -> None:
    skills, _ = jd_skills("Requirements:\n- Go\n\nNice to have:\n- Go and Rust\n")
    assert JdSkill("Go", True) in skills
    assert JdSkill("Rust", False) in skills


def test_implied_skills_inherit_the_status() -> None:
    skills, _ = jd_skills("Nice to have:\n- Spring Boot\n")
    assert {s.skill: s.required for s in skills} == {
        "Spring Boot": False,
        "Java": False,
        "Spring": False,
    }


def test_compare_uses_implied_resume_skills() -> None:
    comparison = compare_skills(JD, RESUME)
    matched = {s.skill for s in comparison.matched}
    # Django implies Python; GitHub Actions implies CI/CD.
    assert {"Python", "Django", "PostgreSQL", "Docker", "CI/CD", "Apache Kafka"} == matched
    assert [s.skill for s in comparison.missing] == ["FastAPI", "Redis", "Kubernetes", "Go"]


def test_coverage_counts_preferred_skills_at_half() -> None:
    comparison = compare_skills(JD, RESUME)
    assert (comparison.required_matched, comparison.required_total) == (5, 7)
    assert (comparison.preferred_matched, comparison.preferred_total) == (1, 3)
    assert comparison.coverage == pytest.approx((5 + 0.5) / (7 + 1.5))


def test_jd_without_skills_has_no_coverage() -> None:
    comparison = compare_skills(
        "We are hiring a friendly person to answer phones and greet visitors.", RESUME
    )
    assert comparison.matched == comparison.missing == []
    assert comparison.coverage is None


def test_unstructured_jd_counts_everything_as_required() -> None:
    comparison = compare_skills("We need Python, Rust and Kafka.", RESUME)
    assert not comparison.sections_detected
    assert all(s.required for s in (*comparison.matched, *comparison.missing))
    assert comparison.coverage == pytest.approx(2 / 3)


def test_records_the_taxonomy_version() -> None:
    assert compare_skills(JD, RESUME).taxonomy_version >= 1


def test_frequent_terms_skip_stopwords_skills_resume_words_and_ignored_parts() -> None:
    jd = (
        "Shipment tracking for freight. Freight rates and shipments.\n"
        "Kafka Kafka Kafka. Tracking matters.\n"
        "Benefits\nPension pension pension"
    )
    resume = "I built tracking dashboards."
    # Ties keep JD order.
    assert frequent_terms(jd, resume) == ["shipment", "freight"]


def test_frequent_terms_need_two_mentions() -> None:
    assert frequent_terms("Freight. Logistics.", "") == []


def test_suggestions_put_missing_required_skills_first_and_cap_the_list() -> None:
    comparison = compare_skills(JD, RESUME)
    suggestions = suggest_keywords(comparison, JD, RESUME)
    assert suggestions[:4] == ["FastAPI", "Redis", "Kubernetes", "Go"]
    assert {"freight", "shipment"} <= set(suggestions)
    assert len(suggestions) <= MAX_KEYWORDS


def test_suggestions_never_exceed_the_cap() -> None:
    many = ", ".join(["Rust", "Go", "Scala", "Kotlin", "Elixir", "Haskell", "Swift", "Ruby"])
    jd = f"Requirements:\n- {many}\n- Terraform, Ansible, Helm, Istio, Pulumi\n"
    comparison = compare_skills(jd, "Python")
    assert len(suggest_keywords(comparison, jd, "Python")) == MAX_KEYWORDS
