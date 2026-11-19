"""Suggested keywords: what the JD stresses that the resume doesn't say.

Missing taxonomy skills come first (required, then preferred, in JD order). The rest are
frequent JD terms: words that appear at least twice in the parts of the JD that count (not
"About us" or "Benefits"), aren't stopwords or job-ad boilerplate, aren't part of a skill
the taxonomy already found, and don't appear in the resume. Plurals are folded crudely
("pipelines" = "pipeline"); there is deliberately no stemmer or NLP dependency.
"""

import re
from collections import Counter

from app.services.match.sections import SectionKind, split_sections
from app.services.match.skills import SkillComparison
from app.services.match.taxonomy import Taxonomy, load_taxonomy

MAX_KEYWORDS = 10
MAX_TERMS = 5
MIN_TERM_COUNT = 2
MIN_TERM_LENGTH = 3

_TOKEN = re.compile(r"[a-z][a-z0-9+#]*(?:['-][a-z0-9+#]+)*")

# Typographic apostrophes are folded to ' before tokenising, so ASCII forms suffice.
_STOPWORDS_TEXT = """
    a about above across after again against all almost along also although always am among
    an and any anyone anything are around as at be because been before being below between
    both but by can cannot could did do does doing done down during each either else enough
    etc even ever every few for from further get gets getting give given go goes going good
    great had has have having he her here hers herself him himself his how however i if in
    into is it its itself just keep least less let like likely made make makes making many
    may me might more most much must my myself near need needed needs neither never new next
    no nor not now of off often on once one only onto or other others otherwise our ours
    ourselves out over own per perhaps please plus quite rather really same see seem shall
    she should since so some something sometimes still such than that the their theirs them
    themselves then there these they this those though through throughout thus to together
    too toward towards under until up upon us use used uses using very via want was way we
    well were what whatever when where whether which while who whole whom whose why will with
    within without would yet you your yours yourself yourselves
    you'll you're you've we're we'll we've it's don't won't can't isn't aren't
    ability able apply applicant applicants applying based best bonus build building candidate
    candidates closely company day days deliver desired drive environment excellent
    experience experienced expertise familiar familiarity full help high highly ideal ideally
    including join key knowledge level looking month months nice opportunity part passion
    passionate people plus position preferred proven related relevant required requirement
    requirements responsibilities responsible role roles salary skill skills solid strong
    successful support team teams time understanding wide work working works world year years
    """
STOPWORDS = frozenset(_STOPWORDS_TEXT.split())


def _words(text: str) -> list[str]:
    return _TOKEN.findall(text.casefold().replace("\u2019", "'"))


def _fold(word: str) -> str:
    """Crude plural folding: "pipelines" -> "pipeline", but not "class" or "kubernetes"."""
    if len(word) > MIN_TERM_LENGTH and word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def frequent_terms(
    jd_text: str, resume_text: str, taxonomy: Taxonomy | None = None, limit: int = MAX_TERMS
) -> list[str]:
    taxonomy = taxonomy or load_taxonomy()
    # Blank out skill mentions and ignored sections, keeping offsets and line breaks.
    chars = list(jd_text.casefold())
    blanks = [(hit.start, hit.end) for hit in taxonomy.find(jd_text)]
    blanks += [
        (span.start, span.end)
        for span in split_sections(jd_text).spans
        if span.kind is SectionKind.IGNORED
    ]
    for start, end in blanks:
        chars[start:end] = [" " if c != "\n" else c for c in chars[start:end]]
    text = "".join(chars)

    in_resume = {_fold(word) for word in _words(resume_text)}
    counts: Counter[str] = Counter()
    first_form: dict[str, str] = {}
    for word in _words(text):
        if len(word) < MIN_TERM_LENGTH or word in STOPWORDS:
            continue
        key = _fold(word)
        if key in in_resume or key in STOPWORDS:
            continue
        counts[key] += 1
        first_form.setdefault(key, word)

    # Most frequent first; ties keep JD order (Counter preserves insertion order).
    ranked = sorted(
        (key for key, count in counts.items() if count >= MIN_TERM_COUNT),
        key=lambda key: -counts[key],
    )
    return [first_form[key] for key in ranked[:limit]]


def suggest_keywords(
    comparison: SkillComparison,
    jd_text: str,
    resume_text: str,
    taxonomy: Taxonomy | None = None,
) -> list[str]:
    missing = [s.skill for s in comparison.missing if s.required]
    missing += [s.skill for s in comparison.missing if not s.required]
    suggestions: list[str] = []
    seen: set[str] = set()
    for word in [*missing, *frequent_terms(jd_text, resume_text, taxonomy)]:
        if word.casefold() not in seen:
            seen.add(word.casefold())
            suggestions.append(word)
    return suggestions[:MAX_KEYWORDS]
