"""Skills taxonomy: loading, validation and finding skills in free text.

The taxonomy (`skills.json`) is curated and versioned: bump `version` whenever a change
could alter which skills a text contains, because stored match results record the version
they were scored with.

Matching rules (unit-tested in `tests/test_match_taxonomy.py`):

- Forms (a skill's name and aliases) match case-insensitively, with flexible spaces and
  hyphens ("machine-learning" = "Machine learning"), on custom word boundaries that treat
  `+ # &` as part of a word so C doesn't match inside C++ or C#, and R doesn't match R&D.
- A form never matches as a dotted part of a longer token: "JS" isn't found in "Node.js".
  Hyphens on the right are allowed ("Python-based"), except for ambiguous forms.
- **Ambiguous** forms (C, R, Go, Spring, Excel...) are ordinary words too. They match only
  case-sensitively, never glued to a hyphenated word ("C-level", "Go-to-market"), and only
  in a skills context: another unambiguous skill on the same line, a following word on the
  same line such as "language" or "developer" ("Go services"), or alone on a line as a list
  item ("- Go"). This misses "Proficient in R" in a sentence; that is the price of not
  flagging "Plan C" or "Go above and beyond".
- Longer forms win at the same position ("React Native" over "React"; "SQL Server" over
  "SQL").
"""

import json
import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

TAXONOMY_PATH = Path(__file__).with_name("skills.json")

CATEGORIES = frozenset(
    {
        "language",
        "frontend",
        "mobile",
        "backend",
        "database",
        "cloud",
        "devops",
        "testing",
        "ml",
        "data",
        "security",
        "design",
        "practice",
        "product",
        "business",
        "hardware",
        "other",
    }
)

# A word right after an ambiguous form that shows it names a skill ("Go services").
CONTEXT_WORDS = frozenset(
    {
        "language",
        "languages",
        "programming",
        "developer",
        "developers",
        "development",
        "engineer",
        "engineers",
        "engineering",
        "code",
        "codebase",
        "services",
        "service",
        "backend",
        "framework",
        "experience",
        "applications",
        "apps",
    }
)

# `\w` plus the characters that continue a tech token (C++, C#, R&D).
_WORD = r"[\w+#&]"
_LEFT = rf"(?<!{_WORD})(?<!\w\.)"
_RIGHT = rf"(?!{_WORD})(?!\.\w)"
# Ambiguous forms also refuse hyphenated neighbours ("C-level", "Go-to-market").
_LEFT_STRICT = r"(?<!\w-)"
_RIGHT_STRICT = r"(?!-\w)"
_SEPARATOR = re.compile(r"[\s-]+")
_NEXT_WORD = re.compile(r"[ \t]*([A-Za-z]+)")
# What may surround a form on a line of its own ("- Go", "\u2022 R,") for it to count as a
# list item naming the skill.
_LIST_DECORATION = " \t-\u2022\u00b7\u2013\u2014*,.;:()"  # bullets and dashes


def form_key(form: str) -> str:
    """How forms are compared: case-folded, with runs of spaces/hyphens as one space."""
    return _SEPARATOR.sub(" ", form.strip()).casefold()


def _form_pattern(form: str, *, ambiguous: bool) -> str:
    body = r"[\s-]+".join(re.escape(part) for part in _SEPARATOR.split(form.strip()))
    if ambiguous:
        return f"{_LEFT_STRICT}{body}{_RIGHT_STRICT}"
    return f"(?i:{body})"


@dataclass(frozen=True)
class Skill:
    name: str
    category: str
    aliases: tuple[str, ...] = ()
    ambiguous: frozenset[str] = frozenset()
    implies: tuple[str, ...] = ()

    @property
    def forms(self) -> tuple[str, ...]:
        return (self.name, *self.aliases)


@dataclass(frozen=True)
class SkillHit:
    """One occurrence of a skill in a text (character offsets into that text)."""

    skill: str
    start: int
    end: int


class Taxonomy:
    def __init__(self, version: int, skills: list[Skill]) -> None:
        self.version = version
        self.skills: dict[str, Skill] = {}
        # form_key -> (skill name, ambiguous?). Keys are unique across all skills, so one
        # lookup serves case-sensitive and insensitive forms alike.
        self._forms: dict[str, tuple[str, bool]] = {}
        alternatives: list[tuple[str, str]] = []

        for skill in skills:
            if skill.name in self.skills:
                raise ValueError(f"Duplicate skill {skill.name!r}")
            if skill.category not in CATEGORIES:
                raise ValueError(f"{skill.name!r}: unknown category {skill.category!r}")
            unknown = skill.ambiguous - set(skill.forms)
            if unknown:
                raise ValueError(f"{skill.name!r}: ambiguous forms not in its forms: {unknown}")
            self.skills[skill.name] = skill
            for form in skill.forms:
                key = form_key(form)
                owner = self._forms.get(key)
                if owner is not None:
                    raise ValueError(f"Form {form!r} of {skill.name!r} clashes with {owner[0]!r}")
                is_ambiguous = form in skill.ambiguous
                self._forms[key] = (skill.name, is_ambiguous)
                alternatives.append((form, _form_pattern(form, ambiguous=is_ambiguous)))

        for skill in skills:
            for target in skill.implies:
                if target not in self.skills or target == skill.name:
                    raise ValueError(f"{skill.name!r} implies unknown skill {target!r}")

        # Longest first: Python's alternation takes the first alternative that matches, so
        # "React Native" must come before "React". Grouping by first character means each
        # position tries one group instead of every form (several times faster).
        alternatives.sort(key=lambda item: len(item[0]), reverse=True)
        groups: dict[str, list[str]] = {}
        for form, pattern in alternatives:
            groups.setdefault(form[0].casefold(), []).append(pattern)
        joined = "|".join(
            f"(?={re.escape(first)}|{re.escape(first.upper())})(?:{'|'.join(patterns)})"
            for first, patterns in groups.items()
        )
        self._pattern = re.compile(f"{_LEFT}(?:{joined}){_RIGHT}")

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Taxonomy":
        version = data["version"]
        if not isinstance(version, int) or version < 1:
            raise ValueError("Taxonomy version must be a positive integer")
        skills = [
            Skill(
                name=entry["name"],
                category=entry["category"],
                aliases=tuple(entry.get("aliases", ())),
                ambiguous=frozenset(entry.get("ambiguous", ())),
                implies=tuple(entry.get("implies", ())),
            )
            for entry in data["skills"]
        ]
        return cls(version, skills)

    def find(self, text: str) -> list[SkillHit]:
        """Every skill occurrence in `text`, in order. Implied skills are not added here."""
        raw: list[tuple[SkillHit, bool]] = []
        for match in self._pattern.finditer(text):
            name, ambiguous = self._forms[form_key(match.group())]
            raw.append((SkillHit(name, match.start(), match.end()), ambiguous))

        # Lines with at least one unambiguous skill give context to ambiguous ones.
        lines_with_context = {
            _line_number(text, hit.start) for hit, ambiguous in raw if not ambiguous
        }
        return [
            hit
            for hit, ambiguous in raw
            if not ambiguous
            or _line_number(text, hit.start) in lines_with_context
            or _followed_by_context_word(text, hit.end)
            or _alone_on_line(text, hit)
        ]

    def names(self, text: str) -> set[str]:
        """The skills `text` mentions, plus everything they imply."""
        return self.with_implied({hit.skill for hit in self.find(text)})

    def with_implied(self, names: set[str]) -> set[str]:
        result = set(names)
        pending = list(names)
        while pending:
            for target in self.skills[pending.pop()].implies:
                if target not in result:
                    result.add(target)
                    pending.append(target)
        return result


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset)


def _followed_by_context_word(text: str, end: int) -> bool:
    match = _NEXT_WORD.match(text, end)
    return match is not None and match.group(1).casefold() in CONTEXT_WORDS


def _alone_on_line(text: str, hit: SkillHit) -> bool:
    line_start = text.rfind("\n", 0, hit.start) + 1
    line_end = text.find("\n", hit.end)
    line_end = len(text) if line_end == -1 else line_end
    before = text[line_start : hit.start].strip(_LIST_DECORATION)
    after = text[hit.end : line_end].strip(_LIST_DECORATION)
    return not before and not after


@cache
def load_taxonomy() -> Taxonomy:
    with TAXONOMY_PATH.open(encoding="utf-8") as file:
        return Taxonomy.from_dict(json.load(file))
