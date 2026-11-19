"""What a job description asks for, and which of it a resume shows.

A JD's skills become **requirements**. Most are one skill; a list of alternatives is one
requirement that any of its skills satisfies:

- Alternatives are taxonomy skills on one line joined only by `,` `/` `or` `and/or`, with
  at least one `or` or `/` ("FastAPI, Django or Flask", "Power BI or Tableau",
  "React/Vue"), or a list followed by "or similar" ("Express, NestJS or similar").
  Lists joined only by commas or "and" are separate requirements ("React and TypeScript").
- A requirement is **required** if it appears anywhere in a required or neutral part of the
  JD, and **preferred** if only in preferred parts (see `sections.py`). Ignored parts (about
  us, benefits) don't count.
- Implied skills inherit the status. For alternatives, only what *every* option implies:
  "Django or FastAPI" asks for Python; "Django or Rails" asks for neither Python nor Ruby.
- A group is dropped when one of its skills is also asked for on its own with at least the
  same status: "Python" plus "Python or Go" is just "Python".

Coverage weights preferred requirements at half: matched (required + ½ preferred) divided
by found (required + ½ preferred). It is None when the JD names no taxonomy skills; the
score then uses semantic similarity alone and says so.
"""

import re
from dataclasses import dataclass

from app.services.match.sections import SectionKind, split_sections
from app.services.match.taxonomy import SkillHit, Taxonomy, load_taxonomy

PREFERRED_WEIGHT = 0.5

# What may sit between two alternatives (same line only): "," "/" "or" "and/or".
_SEPARATOR = re.compile(r"[ \t]*(?:,[ \t]*(?:(?:and/)?or[ \t]+)?|/|[ \t](?:and/)?or[ \t]+)[ \t]*")
_HAS_OR = re.compile(r"\bor\b|/")
_OR_SIMILAR = re.compile(
    r"[ \t]*,?[ \t]*or[ \t]+(?:similar|equivalent|comparable|other|another|alternative)\b"
)


@dataclass(frozen=True)
class JdRequirement:
    skills: tuple[str, ...]  # any one satisfies it; one skill for most requirements
    required: bool

    @property
    def label(self) -> str:
        """ "Python", "Power BI or Tableau", "FastAPI, Django or Flask"."""
        if len(self.skills) == 1:
            return self.skills[0]
        return f"{', '.join(self.skills[:-1])} or {self.skills[-1]}"


@dataclass(frozen=True)
class SkillComparison:
    matched: list[JdRequirement]
    missing: list[JdRequirement]
    # False when the JD gave no way to tell required from preferred (all count as required).
    sections_detected: bool
    taxonomy_version: int

    @property
    def required_total(self) -> int:
        return sum(1 for r in (*self.matched, *self.missing) if r.required)

    @property
    def required_matched(self) -> int:
        return sum(1 for r in self.matched if r.required)

    @property
    def preferred_total(self) -> int:
        return sum(1 for r in (*self.matched, *self.missing) if not r.required)

    @property
    def preferred_matched(self) -> int:
        return sum(1 for r in self.matched if not r.required)

    @property
    def coverage(self) -> float | None:
        """0-1 share of the JD's requirements the resume meets, or None if it names none."""
        found = self.required_total + PREFERRED_WEIGHT * self.preferred_total
        if found == 0:
            return None
        return (self.required_matched + PREFERRED_WEIGHT * self.preferred_matched) / found


def _runs(text: str, hits: list[SkillHit]) -> list[tuple[list[SkillHit], bool]]:
    """Consecutive hits joined only by separators, and whether each run is alternatives."""
    runs: list[tuple[list[SkillHit], bool]] = []
    current: list[SkillHit] = []
    has_or = False

    def close() -> None:
        if current:
            tail = text[current[-1].end :]
            runs.append((list(current), has_or or bool(_OR_SIMILAR.match(tail))))

    for hit in hits:
        if current:
            gap = text[current[-1].end : hit.start]
            if _SEPARATOR.fullmatch(gap):
                current.append(hit)
                has_or = has_or or bool(_HAS_OR.search(gap))
                continue
            close()
        current, has_or = [hit], False
    close()
    return runs


def jd_requirements(
    jd_text: str, taxonomy: Taxonomy | None = None
) -> tuple[list[JdRequirement], bool]:
    """The JD's requirements in order of first mention, and whether sections were detected."""
    taxonomy = taxonomy or load_taxonomy()
    sections = split_sections(jd_text)
    required: dict[tuple[str, ...], bool] = {}  # skills -> required; insertion = first mention

    def note(skills: tuple[str, ...], is_required: bool) -> None:
        required[skills] = required.get(skills, False) or is_required

    for run, alternatives in _runs(jd_text, taxonomy.find(jd_text)):
        kind = sections.kind_at(run[0].start)
        if kind is SectionKind.IGNORED:
            continue
        is_required = kind is not SectionKind.PREFERRED
        groups = (
            [tuple(dict.fromkeys(hit.skill for hit in run))]
            if alternatives
            else [(hit.skill,) for hit in run]
        )
        for skills in groups:
            note(skills, is_required)
            implied = set.intersection(*(taxonomy.with_implied({s}) - {s} for s in skills))
            for skill in sorted(implied - set(skills)):
                note((skill,), is_required)

    def redundant(skills: tuple[str, ...], is_required: bool) -> bool:
        # A group with a skill that is asked for alone, at least as strongly.
        return len(skills) > 1 and any(
            required.get((skill,), False) or (not is_required and (skill,) in required)
            for skill in skills
        )

    requirements = [
        JdRequirement(skills, is_required)
        for skills, is_required in required.items()
        if not redundant(skills, is_required)
    ]
    return requirements, sections.detected


def compare_skills(
    jd_text: str, resume_text: str, taxonomy: Taxonomy | None = None
) -> SkillComparison:
    taxonomy = taxonomy or load_taxonomy()
    wanted, detected = jd_requirements(jd_text, taxonomy)
    have = taxonomy.names(resume_text)
    met = [r for r in wanted if any(skill in have for skill in r.skills)]
    return SkillComparison(
        matched=met,
        missing=[r for r in wanted if r not in met],
        sections_detected=detected,
        taxonomy_version=taxonomy.version,
    )
