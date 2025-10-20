"""English → Tamil transliteration helpers with rich offline fallbacks."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, List

_logger = logging.getLogger(__name__)

try:  # pragma: no cover - optional dependency
    from indic_transliteration import sanscript
    from indic_transliteration.sanscript import transliterate as indic_transliterate

    _HAVE_INDIC = True
except Exception:  # pragma: no cover - fallback path
    _HAVE_INDIC = False

try:  # pragma: no cover - optional dependency
    from tamil.utf8 import get_letters as _tamil_get_letters  # noqa: F401
    from tamil.utf8.tanglish import tanglish_to_unicode

    _HAVE_OPENTAMIL = True
except Exception:  # pragma: no cover
    _HAVE_OPENTAMIL = False

MAX_CANDIDATES = 8

CONSONANT_MAP: dict[str, list[str]] = {
    "ksh": ["க்ஷ"],
    "ng": ["ங"],
    "nj": ["ஞ"],
    "sh": ["ஷ", "ச"],
    "zh": ["ழ"],
    "th": ["ட", "த"],
    "dh": ["ட", "த"],
    "ph": ["ப", "ஃப்"],
    "bh": ["ப"],
    "kh": ["க"],
    "gh": ["க"],
    "wh": ["வ"],
    "rr": ["ற", "ர"],
    "ll": ["ல", "ள", "ழ"],
    "nn": ["ன்ன", "ண்ண", "ந்ந"],
    "tr": ["டிர", "த்ர"],
    "sr": ["ஸ்ர", "ச்ர"],
    "ps": ["ப்ஸ்", "ப்ச"],
    "ts": ["ட்ஸ்", "டச"],
    "j": ["ஜ", "ச"],
    "k": ["க"],
    "g": ["க"],
    "c": ["க", "ச"],
    "s": ["ச", "ஸ"],
    "t": ["த", "ட"],
    "d": ["ட", "த"],
    "n": ["ண", "ந", "ன"],
    "p": ["ப"],
    "b": ["ப"],
    "m": ["ம"],
    "y": ["ய"],
    "r": ["ர", "ற"],
    "l": ["ல", "ள", "ழ"],
    "v": ["வ"],
    "w": ["வ"],
    "z": ["ஸ", "ஜ", "ஶ"],
    "f": ["ஃப்", "ப"],
    "h": ["ஹ", "க"],
    "q": ["க"],
    "x": ["க்ஸ்", "ச"],
    "mm": ["ம்ம"],
    "pp": ["ப்ப"],
    "tt": ["ட்ட", "த்த"],
    "kk": ["க்க"],
    "": [""],
}

VOWEL_SIGN_MAP: dict[str, list[str]] = {
    "": ["்", ""],
    "a": ["", "ா"],
    "aa": ["ா"],
    "ah": ["ா"],
    "i": ["ி"],
    "ii": ["ீ"],
    "ee": ["ீ", "ே"],
    "e": ["ெ", "ே"],
    "ai": ["ை"],
    "ae": ["ே"],
    "ei": ["ே"],
    "u": ["ு"],
    "uu": ["ூ"],
    "oo": ["ோ", "ூ"],
    "o": ["ோ", "ொ"],
    "oh": ["ோ"],
    "ou": ["ௌ"],
    "au": ["ௌ"],
}

PURE_VOWEL_MAP: dict[str, list[str]] = {
    "a": ["அ", "ஆ"],
    "aa": ["ஆ"],
    "ah": ["ஆ"],
    "i": ["இ"],
    "ii": ["ஈ"],
    "ee": ["ஈ", "ஏ"],
    "e": ["எ", "ஏ"],
    "ai": ["ஐ"],
    "ae": ["ஏ"],
    "ei": ["ஏ"],
    "u": ["உ"],
    "uu": ["ஊ"],
    "oo": ["ஊ", "ஓ"],
    "o": ["ஓ", "ஒ"],
    "oh": ["ஓ"],
    "ou": ["ஔ"],
    "au": ["ஔ"],
}

SPECIAL_SEQ: dict[str, list[str]] = {
    "sri": ["ஸ்ரீ", "ஸ்ரி", "ச்ரி"],
    "shri": ["ஸ்ரீ", "ஷ்ரீ"],
    "om": ["ஓம்"],
}

CONSONANT_KEYS = sorted(CONSONANT_MAP, key=len, reverse=True)
VOWEL_KEYS = sorted(
    {key for key in (*VOWEL_SIGN_MAP.keys(), *PURE_VOWEL_MAP.keys()) if key},
    key=len,
    reverse=True,
)


@dataclass
class TransliterationResult:
    candidates: list[str]
    engine: str
    notes: list[str]


def transliterate_tamil(text: str, scheme: str = "itrans") -> TransliterationResult:
    """Transliterate latin text into Tamil script and provide suggestions."""

    cleaned = text.strip()
    if not cleaned:
        return TransliterationResult(candidates=[], engine="noop", notes=[])

    suggestions: list[str] = []
    notes: list[str] = []

    if _HAVE_INDIC:
        try:
            mapped = indic_transliterate(cleaned, scheme, sanscript.TAMIL)
            suggestions.append(mapped)
        except Exception as exc:  # pragma: no cover - log and continue
            _logger.warning("indic-transliteration failed: %s", exc, exc_info=True)
            notes.append("indic-transliteration failed; using fallbacks")
    else:
        notes.append("Install optional dependency 'indic-transliteration' for high quality output")

    if _HAVE_OPENTAMIL:
        try:
            tamil_text = tanglish_to_unicode(cleaned)
            suggestions.append(tamil_text)
        except Exception as exc:  # pragma: no cover
            _logger.warning("open-tamil transliteration failed: %s", exc, exc_info=True)
            notes.append("open-tamil fallback failed")

    fallback_candidates = _fallback_transliterate(cleaned)
    suggestions.extend(fallback_candidates)

    # Deduplicate while preserving order and limit to MAX_CANDIDATES
    seen = set()
    ordered: list[str] = []
    for candidate in suggestions:
        if not candidate:
            continue
        if candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
        if len(ordered) >= MAX_CANDIDATES:
            break

    if not ordered:
        ordered.append(cleaned)

    return TransliterationResult(candidates=ordered, engine=_detect_engine(ordered), notes=notes)


def _detect_engine(candidates: list[str]) -> str:
    if not candidates:
        return "fallback"
    return "hybrid"


def _fallback_transliterate(text: str) -> list[str]:
    """Rule-based offline transliteration with multiple suggestions."""

    outputs = _transduce(text.lower())
    if not outputs:
        return [text]
    return outputs[:MAX_CANDIDATES]


@lru_cache(maxsize=4096)
def _transduce(fragment: str) -> List[str]:
    if not fragment:
        return [""]

    results: list[str] = []

    # Preserve whitespace
    if fragment[0].isspace():
        for tail in _transduce(fragment[1:]):
            results.append(fragment[0] + tail)
        return _limit(results)

    # Preserve punctuation / numerals
    if not fragment[0].isalpha():
        for tail in _transduce(fragment[1:]):
            results.append(fragment[0] + tail)
        return _limit(results)

    for seq, tamil_seq in SPECIAL_SEQ.items():
        if fragment.startswith(seq):
            for tamil in tamil_seq:
                for tail in _transduce(fragment[len(seq) :]):
                    results.append(tamil + tail)

    for vowel in VOWEL_KEYS:
        if fragment.startswith(vowel) and vowel in PURE_VOWEL_MAP:
            for letter in PURE_VOWEL_MAP[vowel]:
                for tail in _transduce(fragment[len(vowel) :]):
                    results.append(letter + tail)

    for consonant_key in CONSONANT_KEYS:
        if not consonant_key:
            continue
        if not fragment.startswith(consonant_key):
            continue

        remaining_index = len(consonant_key)
        consonant_letters = CONSONANT_MAP.get(consonant_key, [""])

        # Try vowels (including empty for pure consonant)
        vowel_candidates = [""] + VOWEL_KEYS
        for vowel_key in vowel_candidates:
            if vowel_key:
                if not fragment.startswith(vowel_key, remaining_index):
                    continue
                consumed = remaining_index + len(vowel_key)
            else:
                consumed = remaining_index
                # Pure consonant only if we have another consonant or boundary
                if consumed < len(fragment):
                    next_char = fragment[consumed]
                    if next_char.isalpha():
                        if not any(
                            key and fragment.startswith(key, consumed)
                            for key in CONSONANT_KEYS
                        ):
                            continue

            syllables = _apply_consonant_vowel(consonant_letters, vowel_key)
            for syllable in syllables:
                for tail in _transduce(fragment[consumed:]):
                    results.append(syllable + tail)

    return _limit(results)


def _apply_consonant_vowel(consonant_letters: Iterable[str], vowel_key: str) -> list[str]:
    vowel_key = vowel_key or ""
    vowel_signs = VOWEL_SIGN_MAP.get(vowel_key, [""])
    combinations: list[str] = []
    for base in consonant_letters:
        if not base:
            continue
        for sign in vowel_signs:
            combinations.append(base + sign)
    return combinations or list(consonant_letters)


def _limit(candidates: Iterable[str]) -> list[str]:
    seen = set()
    ordered: list[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
        if len(ordered) >= MAX_CANDIDATES:
            break
    return ordered
