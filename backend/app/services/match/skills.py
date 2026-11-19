"""Skills a job description asks for, and which of them a resume shows.

A JD skill is **required** if it appears anywhere in a required or neutral part of the JD,
and **preferred** if it appears only in preferred parts (see `sections.py`). Skills that
appear only in ignored parts (about us, benefits) don't count. Implied skills inherit the
status of the skill that implies them ("Django" asks for Python too).

Coverage weights preferred skills at half: matched (required + ½ preferred) divided by
found (required + ½ preferred). It is None when the JD names no taxonomy skills; the score
then uses semantic similarity alone and says so.
"""

from dataclasses import dataclass

from app.services.match.sections import SectionKind, split_sections
from app.services.match.taxonomy import Taxonomy, load_taxonomy

PREFERRED_WEIGHT = 0.5


@dataclass(frozen=True)
class JdSkill:
    skill: str
    required: bool


@dataclass(frozen=True)
class SkillComparison:
    matched: list[JdSkill]
    missing: list[JdSkill]
    # False when the JD gave no way to tell required from preferred (all count as required).
    sections_detected: bool
    taxonomy_version: int

    @property
    def required_total(self) -> int:
        return sum(1 for s in (*self.matched, *self.missing) if s.required)

    @property
    def required_matched(self) -> int:
        return sum(1 for s in self.matched if s.required)

    @property
    def preferred_total(self) -> int:
        return sum(1 for s in (*self.matched, *self.missing) if not s.required)

    @property
    def preferred_matched(self) -> int:
        return sum(1 for s in self.matched if not s.required)

    @property
    def coverage(self) -> float | None:
        """0-1 share of the JD's skills the resume shows, or None if the JD names none."""
        found = self.required_total + PREFERRED_WEIGHT * self.preferred_total
        if found == 0:
            return None
        return (self.required_matched + PREFERRED_WEIGHT * self.preferred_matched) / found


def jd_skills(jd_text: str, taxonomy: Taxonomy | None = None) -> tuple[list[JdSkill], bool]:
    """The JD's skills in order of first mention, and whether sections were detected."""
    taxonomy = taxonomy or load_taxonomy()
    sections = split_sections(jd_text)
    required: dict[str, bool] = {}  # insertion order = first mention

    def note(skill: str, is_required: bool) -> None:
        required[skill] = required.get(skill, False) or is_required

    for hit in taxonomy.find(jd_text):
        kind = sections.kind_at(hit.start)
        if kind is SectionKind.IGNORED:
            continue
        is_required = kind is not SectionKind.PREFERRED
        note(hit.skill, is_required)
        for implied in sorted(taxonomy.with_implied({hit.skill}) - {hit.skill}):
            note(implied, is_required)

    return [JdSkill(skill, req) for skill, req in required.items()], sections.detected


def compare_skills(
    jd_text: str, resume_text: str, taxonomy: Taxonomy | None = None
) -> SkillComparison:
    taxonomy = taxonomy or load_taxonomy()
    wanted, detected = jd_skills(jd_text, taxonomy)
    have = taxonomy.names(resume_text)
    return SkillComparison(
        matched=[s for s in wanted if s.skill in have],
        missing=[s for s in wanted if s.skill not in have],
        sections_detected=detected,
        taxonomy_version=taxonomy.version,
    )
