"""Skill requirements (alternatives, required vs preferred), coverage and keywords."""

import pytest

from app.services.match.keywords import MAX_KEYWORDS, frequent_terms, suggest_keywords
from app.services.match.skills import JdRequirement, compare_skills, jd_requirements

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


def req(*skills: str, required: bool = True) -> JdRequirement:
    return JdRequirement(skills, required)


def labels(jd: str) -> list[str]:
    return [r.label for r in jd_requirements(jd)[0]]


def test_required_and_preferred_requirements_in_jd_order() -> None:
    requirements, detected = jd_requirements(JD)
    assert detected
    assert requirements == [
        req("Python"),
        req("Django", "FastAPI"),
        req("PostgreSQL"),
        req("Redis"),
        req("Docker"),
        req("CI/CD"),
        req("Kubernetes", required=False),
        req("Go", required=False),
        req("Apache Kafka", required=False),
    ]


def test_ignored_sections_do_not_ask_for_skills() -> None:
    requirements, _ = jd_requirements(JD)
    assert "AWS" not in {skill for r in requirements for skill in r.skills}


def test_a_skill_mentioned_as_required_anywhere_is_required() -> None:
    requirements, _ = jd_requirements("Requirements:\n- Go\n\nNice to have:\n- Go and Rust\n")
    assert requirements == [req("Go"), req("Rust", required=False)]


def test_implied_skills_inherit_the_status() -> None:
    requirements, _ = jd_requirements("Nice to have:\n- Spring Boot\n")
    assert requirements == [
        req("Spring Boot", required=False),
        req("Java", required=False),
        req("Spring", required=False),
    ]


# ---------------------------------------------------------------- alternatives


@pytest.mark.parametrize(
    ("jd", "expected"),
    [
        ("Experience with FastAPI, Django or Flask.", ["FastAPI, Django or Flask", "Python"]),
        ("Dashboards in Power BI or Tableau.", ["Power BI or Tableau"]),
        ("Frameworks: React/Vue", ["React or Vue"]),
        ("Express, NestJS or similar", ["Express or NestJS"]),
        ("Celery, SQS and/or RabbitMQ", ["Celery, Amazon SQS or RabbitMQ"]),
    ],
)
def test_lists_with_or_are_one_requirement(jd: str, expected: list[str]) -> None:
    assert labels(jd)[: len(expected)] == expected


@pytest.mark.parametrize(
    "jd",
    ["React, TypeScript and Redux.", "React, TypeScript, Redux", "React and TypeScript and Redux"],
)
def test_lists_without_or_are_separate_requirements(jd: str) -> None:
    assert labels(jd)[:3] == ["React", "TypeScript", "Redux"]


def test_alternatives_never_span_lines_or_other_words() -> None:
    # (Not "Go": an ambiguous form, rightly ignored in "- or Go".)
    assert labels("- Python\n- or Rust") == ["Python", "Rust"]
    assert labels("Python, and ideally Go or Rust.") == ["Python", "Go or Rust"]


def test_alternatives_imply_only_what_every_option_implies() -> None:
    assert labels("Django or FastAPI") == ["Django or FastAPI", "Python"]
    assert labels("Django or Ruby on Rails") == ["Django or Ruby on Rails"]


def test_a_group_with_a_skill_asked_for_alone_is_dropped() -> None:
    jd = "Requirements:\n- Python\n- Python or Go\n\nNice to have:\n- Rust or Go\n- Rust\n"
    requirements, _ = jd_requirements(jd)
    assert requirements == [req("Python"), req("Rust", required=False)]


def test_a_preferred_skill_does_not_drop_a_required_group() -> None:
    jd = "Requirements:\n- Python or Go\n\nNice to have:\n- Go\n"
    requirements, _ = jd_requirements(jd)
    assert requirements == [req("Python", "Go"), req("Go", required=False)]


def test_a_repeated_group_is_one_requirement() -> None:
    jd = "Nice to have:\n- Vue or Svelte\n\nRequirements:\n- Vue or Svelte\n"
    assert jd_requirements(jd)[0] == [req("Vue", "Svelte")]


def test_any_option_meets_a_group_and_a_missing_group_suggests_its_first() -> None:
    jd = "Requirements:\n- FastAPI, Django or Flask\n- Power BI or Tableau\n"
    resume = "Built Flask services in Python."
    comparison = compare_skills(jd, resume)
    assert [r.label for r in comparison.matched] == ["FastAPI, Django or Flask", "Python"]
    assert [r.label for r in comparison.missing] == ["Power BI or Tableau"]
    assert suggest_keywords(comparison, jd, resume)[0] == "Power BI"


# ---------------------------------------------------------------- comparison


def test_compare_uses_implied_resume_skills() -> None:
    comparison = compare_skills(JD, RESUME)
    # Django implies Python and meets "Django or FastAPI"; GitHub Actions implies CI/CD.
    assert [r.label for r in comparison.matched] == [
        "Python",
        "Django or FastAPI",
        "PostgreSQL",
        "Docker",
        "CI/CD",
        "Apache Kafka",
    ]
    assert [r.label for r in comparison.missing] == ["Redis", "Kubernetes", "Go"]


def test_coverage_counts_preferred_requirements_at_half() -> None:
    comparison = compare_skills(JD, RESUME)
    assert (comparison.required_matched, comparison.required_total) == (5, 6)
    assert (comparison.preferred_matched, comparison.preferred_total) == (1, 3)
    assert comparison.coverage == pytest.approx((5 + 0.5) / (6 + 1.5))


def test_jd_without_skills_has_no_coverage() -> None:
    comparison = compare_skills(
        "We are hiring a friendly person to answer phones and greet visitors.", RESUME
    )
    assert comparison.matched == comparison.missing == []
    assert comparison.coverage is None


def test_unstructured_jd_counts_everything_as_required() -> None:
    comparison = compare_skills("We need Python, Rust and Kafka.", RESUME)
    assert not comparison.sections_detected
    assert all(r.required for r in (*comparison.matched, *comparison.missing))
    assert comparison.coverage == pytest.approx(2 / 3)


def test_records_the_taxonomy_version() -> None:
    assert compare_skills(JD, RESUME).taxonomy_version >= 1


# ---------------------------------------------------------------- keywords


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
    assert suggestions[:3] == ["Redis", "Kubernetes", "Go"]
    assert {"freight", "shipment"} <= set(suggestions)
    assert len(suggestions) <= MAX_KEYWORDS


def test_suggestions_never_exceed_the_cap() -> None:
    many = ", ".join(["Rust", "Go", "Scala", "Kotlin", "Elixir", "Haskell", "Swift", "Ruby"])
    jd = f"Requirements:\n- {many}\n- Terraform, Ansible, Helm, Istio, Pulumi\n"
    comparison = compare_skills(jd, "Python")
    assert len(suggest_keywords(comparison, jd, "Python")) == MAX_KEYWORDS
