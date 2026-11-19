"""Which parts of a job description are requirements, nice-to-haves, or neither.

A heading switches the section for the lines below it:

- **required**: "Requirements", "Must have", "What you'll need", "Qualifications"...
- **preferred**: "Nice to have", "Preferred qualifications", "Bonus points"...
- **neutral**: "Responsibilities", "The role", "Tech stack"... Skills here describe the job,
  so they count as required.
- **ignored**: "About us", "Benefits", "How to apply"... Skills here aren't asked of the
  candidate ("we sponsor AWS certifications") and don't count.

A heading is a short line that ends with a colon, starts with `#` or bold markup, or (with
no decoration) consists of a heading phrase and a few heading words ("Desired skills").
Bullets are never headings unless they end with a colon, so "- Experience with Python"
stays a requirement.

Text before the first heading is neutral. Inside any section except ignored ones, a sentence
with a marker such as "is a plus" or "nice to have" is preferred ("Go is a plus."). Markers
are per sentence, not per clause: "Python, and ideally Go" marks both as preferred.

`detected` is true only when something told required and preferred apart (a required or
preferred heading, or a preferred marker). Without that, every skill counts as required and
the UI says the split couldn't be detected.

English only, like the rest of the matcher.
"""

import re
from dataclasses import dataclass
from enum import StrEnum


class SectionKind(StrEnum):
    REQUIRED = "required"
    PREFERRED = "preferred"
    NEUTRAL = "neutral"
    IGNORED = "ignored"


@dataclass(frozen=True)
class Span:
    """A piece of the text (character offsets) and the kind of section it belongs to."""

    start: int
    end: int
    kind: SectionKind


@dataclass(frozen=True)
class Sections:
    spans: list[Span]
    detected: bool

    def kind_at(self, offset: int) -> SectionKind:
        for span in self.spans:
            if span.start <= offset < span.end:
                return span.kind
        return SectionKind.NEUTRAL


_APOS = "['\u2019]"
# Checked in this order: "Preferred qualifications" is preferred, "Bonus & benefits" ignored.
_HEADINGS: list[tuple[SectionKind, str]] = [
    (
        SectionKind.IGNORED,
        r"about (?!you\b|the role\b|this role\b|the job\b|the position\b)[a-z]+|who we are|"
        r"benefits|perks|what we offer|why (?:join|work)|compensation|salary|"
        r"equal opportunit|diversity|how to apply|our values|life at|our culture",
    ),
    (
        SectionKind.PREFERRED,
        r"nice[ -]to[ -]haves?|preferred|bonus points?|bonus|desirable|desired|"
        r"good[ -]to[ -]haves?|pluses|extra credit|even better|ideally",
    ),
    (
        SectionKind.REQUIRED,
        rf"requirements?|required|must[ -]haves?|essential|qualifications|"
        rf"what you{_APOS}ll need|what you need|what we{_APOS}re looking for|"
        rf"what we look for|you have|you{_APOS}ll have|about you|who you are|"
        rf"skills|experience|you bring|you should have",
    ),
    (
        SectionKind.NEUTRAL,
        rf"responsibilities|what you{_APOS}ll do|what you will do|the role|your role|"
        rf"about the role|about this role|about the job|the job|day[ -]to[ -]day|duties|"
        rf"overview|description|tech stack|our stack|the opportunity|the position|"
        rf"your impact|the team",
    ),
]

# Words allowed around the heading phrase on an undecorated line, so a short requirement
# such as "Experience with Python" or "Strong Python experience" isn't taken for a heading.
_QUALIFIERS = (
    r"(?:(?:key|core|minimum|basic|preferred|required|desired|technical|additional|"
    r"our|your|the|essential|general|main|other|job)\s+){0,3}"
)
_TRAILERS = (
    r"(?:\s+(?:and|&|skills|experience|qualifications|requirements|points|the|role|to|"
    r"have|haves|we|offer|you|need|responsibilities|benefits|perks|culture|values)){0,3}"
)
_DECORATION = re.compile(r"^[\s#*_>]+|[\s*_:]+$")
_BULLET = re.compile(r"^(?:[-\u2022\u00b7\u2013\u2014]|\*\s|\d+[.)])")  # bullets and dashes
_SENTENCE = re.compile(r"[^.;!?\n]+[.;!?]*")
_PREFERRED_MARKER = re.compile(
    r"\b(?:nice[ -]to[ -]have|(?:is|are|would be|a big|a huge) (?:a )?plus|a plus\b|"
    r"bonus points?|is a bonus|preferred|preferably|desirable|ideally|not required|"
    r"not essential|would be great|good to have)\b",
    re.IGNORECASE,
)
_MAX_HEADING_WORDS = 6
_SEARCH = [(kind, re.compile(phrase)) for kind, phrase in _HEADINGS]
_WHOLE = [(kind, re.compile(f"{_QUALIFIERS}(?:{phrase}){_TRAILERS}")) for kind, phrase in _HEADINGS]


def heading_kind(line: str) -> SectionKind | None:
    """The section a line starts, or None if it isn't a heading."""
    raw = line.strip()
    colon = raw.endswith(":")
    if _BULLET.match(raw) and not colon:
        return None
    decorated = colon or raw.startswith(("#", "**", "__"))
    cleaned = " ".join(_DECORATION.sub("", raw).casefold().split())
    if not cleaned or len(cleaned.split()) > _MAX_HEADING_WORDS:
        return None
    if any(c.isdigit() for c in cleaned) or cleaned.endswith((".", "!", "?", ",", ";")):
        return None
    if decorated:
        return next((kind for kind, pattern in _SEARCH if pattern.search(cleaned)), None)
    return next((kind for kind, pattern in _WHOLE if pattern.fullmatch(cleaned)), None)


def split_sections(text: str) -> Sections:
    spans: list[Span] = []
    detected = False
    current = SectionKind.NEUTRAL
    offset = 0
    for line in text.splitlines(keepends=True):
        start, offset = offset, offset + len(line)
        kind = heading_kind(line)
        if kind is not None:
            current = kind
            detected = detected or kind in (SectionKind.REQUIRED, SectionKind.PREFERRED)
            # The heading's own words ("Experience with Python:") belong to its section.
            spans.append(Span(start, offset, kind))
            continue
        if current in (SectionKind.IGNORED, SectionKind.PREFERRED):
            spans.append(Span(start, offset, current))
            continue
        for sentence in _SENTENCE.finditer(line):
            marked = _PREFERRED_MARKER.search(sentence.group()) is not None
            detected = detected or marked
            kind = SectionKind.PREFERRED if marked else current
            spans.append(Span(start + sentence.start(), start + sentence.end(), kind))
    return Sections(spans, detected)
