"""Skills taxonomy: the shipped file is valid, aliases resolve, and tricky names behave."""

from typing import Any

import pytest

from app.services.match.taxonomy import Taxonomy, form_key, load_taxonomy


def found(text: str) -> list[str]:
    return [hit.skill for hit in load_taxonomy().find(text)]


def test_shipped_taxonomy_loads_and_is_a_few_hundred_skills() -> None:
    taxonomy = load_taxonomy()
    assert taxonomy.version >= 1
    assert 200 <= len(taxonomy.skills) <= 600


@pytest.mark.parametrize(
    ("text", "skill"),
    [
        ("JS", "JavaScript"),
        ("ES6", "JavaScript"),
        ("Postgres", "PostgreSQL"),
        ("k8s", "Kubernetes"),
        ("K8S", "Kubernetes"),
        ("React.js", "React"),
        ("ReactJS", "React"),
        ("Golang", "Go"),
        ("sklearn", "scikit-learn"),
        ("GCP", "Google Cloud"),
        ("SQL Server", "Microsoft SQL Server"),
        ("Node.js", "Node.js"),
        ("NodeJS", "Node.js"),
        ("RESTful APIs", "REST APIs"),
        ("machine-learning", "Machine learning"),
        ("Machine   Learning", "Machine learning"),
        ("test driven development", "Test-driven development"),
        ("Data modeling", "Data modelling"),
    ],
)
def test_aliases_resolve_to_the_canonical_skill(text: str, skill: str) -> None:
    assert found(f"Experience with {text} in production.") == [skill]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # C, C++ and C# are three skills; none hides inside another.
        ("C/C++ and C#", ["C", "C++", "C#"]),
        ("C++ and Python", ["C++", "Python"]),
        ("C# and .NET Core", ["C#", ".NET"]),
        ("Objective-C and Swift", ["Objective-C", "Swift"]),
        # .NET inside ASP.NET is ASP.NET (which implies .NET separately).
        ("ASP.NET Core and Python", ["ASP.NET", "Python"]),
        # Dotted names: no "JS" in Node.js, no "Vue" alone in Vue.js.
        ("Node.js and Vue.js", ["Node.js", "Vue"]),
        # Longest form wins.
        ("React Native and Python", ["React Native", "Python"]),
        ("PL/SQL, T-SQL and MySQL", ["PL/SQL", "T-SQL", "MySQL"]),
        ("Java and JavaScript", ["Java", "JavaScript"]),
        ("MLflow and ML", ["MLflow", "Machine learning"]),
        # Right-hand hyphens are fine for ordinary skills.
        ("Python-based tooling on AWS", ["Python", "AWS"]),
    ],
)
def test_tricky_names(text: str, expected: list[str]) -> None:
    assert found(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "Go to market with our sales team",
        "Go above and beyond for customers",
        "We have a plan B and a plan C",
        "R&D budget ownership",
        "Reporting to C-level executives",
        "Spring 2027 internship",
        "Excel at stakeholder communication",
        "the rest of the team",
        "We value a lean process",
        "go, r and c in lowercase are just words",
        "Experience with C.",
    ],
)
def test_ambiguous_words_need_a_skills_context(text: str) -> None:
    assert found(text) == []


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Go, Python and Kubernetes", ["Go", "Python", "Kubernetes"]),
        ("Strong C programming skills", ["C"]),
        ("Building Go services", ["Go"]),
        ("R and SQL for analysis", ["R", "SQL"]),
        ("Nice to have:\n- Go\n- R,", ["Go", "R"]),
        ("REST services", ["REST APIs"]),
        ("Excel, Tableau", ["Microsoft Excel", "Tableau"]),
    ],
)
def test_ambiguous_words_count_in_a_skills_context(text: str, expected: list[str]) -> None:
    assert found(text) == expected


def test_context_word_on_the_next_line_does_not_count() -> None:
    assert found("Ready to Go\nExperience matters") == []


def test_names_adds_implied_skills() -> None:
    names = load_taxonomy().names("Built services with Django and Spring Boot on EKS")
    assert {"Django", "Python", "Spring Boot", "Spring", "Java", "Amazon EKS", "AWS"} <= names
    assert "Kubernetes" in names


@pytest.mark.parametrize(
    ("tool", "general"),
    [
        ("Celery", "Message queues"),
        ("Celery", "Python"),
        ("RabbitMQ", "Message queues"),
        ("Kafka", "Message queues"),
        ("SQS", "Message queues"),
        ("pytest", "Test automation"),
        ("pytest", "Python"),
        ("Jest", "Test automation"),
        ("Vitest", "Test automation"),
        ("JUnit", "Test automation"),
        ("Cypress", "Test automation"),
        ("Selenium", "Test automation"),
    ],
)
def test_a_tool_implies_the_practice_it_is_part_of(tool: str, general: str) -> None:
    assert general in load_taxonomy().names(f"Used {tool} daily.")


def test_implications_only_point_from_specific_to_general() -> None:
    """No skill is implied back by anything it implies: "pytest" means "Test automation",
    never the other way round (asking for either must not demand the other)."""
    taxonomy = load_taxonomy()
    for name, skill in taxonomy.skills.items():
        for target in skill.implies:
            assert name not in taxonomy.with_implied({target}), f"{name} <-> {target}"


def test_the_practice_does_not_imply_a_tool() -> None:
    names = load_taxonomy().names("Message queues and test automation")
    assert names == {"Message queues", "Test automation"}


def test_hits_carry_offsets() -> None:
    text = "We use Kafka."
    (hit,) = load_taxonomy().find(text)
    assert text[hit.start : hit.end] == "Kafka"


def test_form_key_folds_case_and_separators() -> None:
    assert form_key("Machine - Learning") == form_key("machine learning")


def _taxonomy(*skills: dict[str, Any], version: Any = 1) -> Taxonomy:
    return Taxonomy.from_dict({"version": version, "skills": list(skills)})


def test_validation_rejects_a_form_shared_by_two_skills() -> None:
    with pytest.raises(ValueError, match="clashes"):
        _taxonomy(
            {"name": "Go", "category": "language"},
            {"name": "Golang tooling", "aliases": ["go"], "category": "devops"},
        )


@pytest.mark.parametrize(
    ("skills", "message"),
    [
        (
            [{"name": "X", "category": "language"}, {"name": "X", "category": "language"}],
            "Duplicate",
        ),
        ([{"name": "X", "category": "nonsense"}], "category"),
        ([{"name": "X", "category": "language", "ambiguous": ["Y"]}], "ambiguous"),
        ([{"name": "X", "category": "language", "implies": ["Nope"]}], "implies"),
        ([{"name": "X", "category": "language", "implies": ["X"]}], "implies"),
    ],
)
def test_validation_rejects_bad_entries(skills: list[dict[str, Any]], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        _taxonomy(*skills)


@pytest.mark.parametrize("version", [0, "1", None])
def test_validation_rejects_bad_versions(version: Any) -> None:
    with pytest.raises(ValueError, match="version"):
        _taxonomy({"name": "X", "category": "language"}, version=version)
