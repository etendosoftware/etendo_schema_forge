"""`expectAnswer`: a deterministic matcher over the agent's final answer (D46, plan §5.5).

No LLM judge: a judge would add its own variance to criterion 1 and put a second
model inside the measurement. The price is conservative false negatives (an
answer phrased in a way the matcher does not read), accepted exactly as D34
accepted them for `expectEffect`.

Pure: no I/O, no provider, no MCP. The answer is matched as the user read it —
`finalAnswer`, in the task's language — never `verdict.achieved`.

Spec (after `{{steps.*}}` refs are resolved by the caller):

    expectAnswer:
      all:                       # every item must be found
        - { number: 121, tolerance: 0.01 }
        - { number: 3, near: "unidades" }     # small numbers need an anchor
        - { number: 21, percent: true }       # only matches "21 %"
        - { text: "Cliente Paridad" }
      none:                      # no item may be found
        - { text: "no encontré" }

A bare list is shorthand for `all:`.

Bump MATCHER_VERSION on ANY change to what matches: it is a pin (plan §6), so
two comparisons matched under different rules are refused as a stability pair.
"""

from __future__ import annotations

import bisect
import functools
import re
import unicodedata
from typing import Any

#: v2 (S5 review): numbers inside ids, dates and percentages are no longer read
#: as plain numbers; `near:` and `percent:`; plain spaces no longer group
#: digits; `text:` matches on word boundaries.
#: v3: `near:` binds the anchor to its NEAREST number only (see _nearest).
#: v4: document numbers after "Nº"/"No."/"núm."/"#", clock times and
#: international phone numbers are not numbers either.
MATCHER_VERSION = 4

#: A literal integer below this, with no `near:` anchor and no tolerance, is
#: refused at load: "10" or "3" appears in almost any answer (a day, a line
#: count, a document number), so on its own it proves nothing.
SMALL_NUMBER = 100
#: How far (characters, gap between the two spans) a `near:` anchor may be.
NEAR_WINDOW = 30

# A numeric token: optional sign, digits with optional group separators and an
# optional decimal part. Group separators are `.`, `,`, NBSP and narrow NBSP —
# NOT a plain space (see number_candidates). The context checks that keep ids,
# dates and percentages out live in `extract_numbers`, not in this pattern.
_NUMBER_RE = re.compile(
    r"([-−]?)(\d{1,3}(?:[.,  ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)"
)
_GROUP_SPACES = "  "
_DASHES = "-−–"
# What comes right before a document number: "Nº", "nº", "N.º", "N°", "No.",
# "núm.", "num", "#". "no" WITHOUT a dot is the Spanish negation and stays out.
_NUMERO_RE = re.compile(r"(?:(?<!\w)n\.?\s?[º°]|(?<!\w)no\.|(?<!\w)n[uú]m\b\.?|#)\s*$", re.IGNORECASE)
# An international phone number: "+", a country code, then at least two more
# digit groups ("+34 600 123 456", "+34-600-123-456", "+34 600123456").
_PHONE_RE = re.compile(r"\+\d{1,3}(?:[   -]?\d{2,4}){2,}")


def number_candidates(token: str) -> list[float]:
    """Every value a numeric token can mean, Spanish and English conventions alike.

    - both `.` and `,` present: the LAST one is the decimal separator
      (`1.234,56` and `1,234.56` are both 1234.56);
    - NBSP / narrow NBSP only group (`1 234,56` as `Intl.NumberFormat('es')`
      writes it). A PLAIN space never groups: "Hay 3 120 unidades" is two
      numbers, 3 and 120, and reading 3120 there is a false positive no
      tolerance can undo;
    - one kind of separator appearing more than once groups thousands
      (`1.234.567`);
    - appearing once with exactly three digits after it is AMBIGUOUS
      (`1.234` is 1234 in Spanish and 1.234 in English): both values are
      returned, and a match on either counts;
    - otherwise it is the decimal separator (`121,5`, `0.75`).
    """
    sign = -1.0 if token[:1] in "-−" else 1.0
    body = token.lstrip("-−")
    for space in _GROUP_SPACES:
        body = body.replace(space, "")
    dots, commas = body.count("."), body.count(",")
    if dots and commas:
        decimal = "." if body.rfind(".") > body.rfind(",") else ","
        group = "," if decimal == "." else "."
        return [sign * float(body.replace(group, "").replace(decimal, "."))]
    sep = "." if dots else "," if commas else None
    if sep is None:
        return [sign * float(body)]
    if body.count(sep) > 1:
        return [sign * float(body.replace(sep, ""))]
    whole, frac = body.split(sep)
    as_decimal = sign * float(f"{whole}.{frac}")
    if len(frac) == 3 and whole and whole != "0":
        return [sign * float(whole + frac), as_decimal]
    return [as_decimal]


def _is_word(char: str) -> bool:
    return char.isalnum() or char == "_"


def extract_numbers(text: str) -> list[dict[str, Any]]:
    """Every free-standing numeric token in `text`, with the values it can mean.

    Left out, because a number there is not an amount the answer states:
    - a token touching a letter, a digit run, `_` or `/` — ids and dates
      (`FV2026`, `FV/2026/0010`, `14/10/2026`);
    - a token joined by a dash to a word or number (`FV-2026`, `2026-10-14`);
    - a token followed by another separator and digit (`14.10.2026`);
    - a clock time: a token joined by `:` to another digit (`10:00`,
      `…T10:00:00Z`). A colon that is a label (`Total: 121`) does not count;
    - a document number after "Nº"/"No."/"núm."/"#" (`Pedido Nº 10`);
    - any part of an international phone number (`+34 600 123 456`).
    A token followed by `%` (spaces allowed) is kept with `percent: True`: it
    matches only an item that asks for a percentage.
    """
    text = text or ""
    phones = [m.span() for m in _PHONE_RE.finditer(text)]
    phone = 0  # both lists are in text order: one forward pass
    out = []
    for match in _NUMBER_RE.finditer(text):
        sign, body = match.group(1), match.group(2)
        start, end = match.start(), match.end()
        before = text[start - 1] if start > 0 else ""
        after = text[end] if end < len(text) else ""
        if sign and before and (_is_word(before) or before in "/.,"):
            continue  # FV-2026: the dash joins an id, it is not a sign
        if not sign and before in _DASHES and start > 1 and _is_word(text[start - 2]):
            continue  # 2026-10-14 (middle part), FV-0012
        if before and (_is_word(before) or before in "/.,"):
            continue
        if after and (_is_word(after) or after == "/"):
            continue
        if after in _DASHES and end + 1 < len(text) and text[end + 1].isdigit():
            continue  # 2026-10-14 (first part)
        if after in ".," and end + 1 < len(text) and text[end + 1].isdigit():
            continue  # 14.10.2026, or a longer number the pattern did not take whole
        if before == ":" and start > 1 and text[start - 2].isdigit():
            continue  # 10:00 (minutes), T10:00:00Z
        if after == ":" and end + 1 < len(text) and text[end + 1].isdigit():
            continue  # 10:00 (hours)
        while phone < len(phones) and phones[phone][1] <= start:
            phone += 1
        if phone < len(phones) and phones[phone][0] < end:
            continue  # +34 600 123 456
        if _NUMERO_RE.search(text, max(0, start - 8), start):
            continue  # Pedido Nº 10: a document number, not an amount
        rest = text[end:end + 3].lstrip("   ")
        percent = rest.startswith("%")
        out.append({
            "token": (sign + body).strip(),
            "values": number_candidates(sign + body),
            "percent": percent,
            "span": (start, end),
        })
    return out


def _fold(text: str) -> str:
    """Accent- and case-folded, ONE character per input character.

    Positions stay aligned with the original text, which `near:` needs.
    """
    if text.isascii():
        return text.lower()
    return "".join(_fold_char(char) for char in text)


@functools.lru_cache(maxsize=4096)
def _fold_char(char: str) -> str:
    base = unicodedata.normalize("NFKD", char)[:1] or char
    folded = base.casefold()
    return folded if len(folded) == 1 else base.lower()


def normalize_text(text: str) -> str:
    """Case- and accent-insensitive, whitespace collapsed."""
    decomposed = unicodedata.normalize("NFKD", text or "")
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(stripped.casefold().split())


def _phrase_pattern(phrase: str) -> re.Pattern[str]:
    """A whole-word, whitespace-tolerant pattern for an already folded phrase."""
    words = [re.escape(w) for w in phrase.split()]
    return re.compile(r"(?<!\w)" + r"\s+".join(words) + r"(?!\w)")


def _expected_number(value: Any) -> float:
    """The expected value of a `number:` item: a number, or a string that reads as one.

    A string that Python reads as a float (`"121.00"`, `"1.234"`) is taken that
    way: it is what a resolved `{{steps.*}}` reference from an API looks like.
    Otherwise it is read with the locale rules and must be unambiguous: an
    expectation of `"1,234"` could mean two things, and an expectation must not.
    """
    if isinstance(value, bool):
        raise ValueError(f"expectAnswer number is a boolean: {value!r}")
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            pass
        candidates = number_candidates(value.strip())
        if len(candidates) == 1:
            return candidates[0]
    raise ValueError(f"expectAnswer number {value!r} is not an unambiguous number")


def _check_item(item: dict[str, Any], folded: str, numbers: list[dict[str, Any]]) -> dict[str, Any]:
    if "number" in item:
        expected = _expected_number(item["number"])
        tolerance = float(item.get("tolerance", 0))
        want_percent = bool(item.get("percent", False))
        anchor = item.get("near")
        pool = numbers
        if anchor:
            spans = [m.span() for m in _phrase_pattern(_fold(" ".join(str(anchor).split()))).finditer(folded)]
            starts = [n["span"][0] for n in numbers]
            pool = [n for n in (_nearest(numbers, starts, s) for s in spans) if n is not None]
        candidates = [n for n in pool if n["percent"] == want_percent
                      and any(abs(v - expected) <= tolerance + 1e-9 for v in n["values"])]
        result = {"number": expected, "tolerance": tolerance, "found": [n["token"] for n in candidates],
                  "ok": bool(candidates)}
        if anchor:
            result["near"] = anchor
        if want_percent:
            result["percent"] = True
        return result
    needle = " ".join(_fold(str(item["text"])).split())
    ok = bool(needle) and _phrase_pattern(needle).search(folded) is not None
    return {"text": item["text"], "ok": ok}


def _nearest(numbers: list[dict[str, Any]], starts: list[int],
             anchor: tuple[int, int]) -> dict[str, Any] | None:
    """The one number an anchor occurrence talks about, or None.

    Only the token nearest to the anchor (smallest gap, within NEAR_WINDOW)
    counts, whatever its value: in "10 unidades y 3 cajas" "unidades" is about
    10 and "cajas" about 3, so `{number: 3, near: unidades}` must fail. A tie
    goes to the token BEFORE the anchor ("10 unidades" is the usual order).

    Tokens never overlap and are in text order, so the nearest one is either
    the last token starting before the anchor ends or the first one starting
    after it: a bisect per anchor, O(log n), not a scan (a 1 MB answer has
    tens of thousands of both).
    """
    i = bisect.bisect_left(starts, anchor[1])
    inside = [n for n in numbers[max(0, i - 1):i + 1] if _gap(n["span"], anchor) <= NEAR_WINDOW]
    if not inside:
        return None
    return min(inside, key=lambda n: (_gap(n["span"], anchor), n["span"][0] >= anchor[1]))


def _gap(a: tuple[int, int], b: tuple[int, int]) -> int:
    """Characters between two spans; 0 when they touch or overlap."""
    return max(0, max(a[0], b[0]) - min(a[1], b[1]))


def is_small_literal(item: dict[str, Any]) -> bool:
    """A literal small integer with nothing to pin it down (see SMALL_NUMBER)."""
    value = item.get("number")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False  # a {{steps.*}} reference is only known at run time
    return (float(value).is_integer() and abs(value) < SMALL_NUMBER
            and not item.get("near") and not item.get("tolerance") and not item.get("percent"))


def normalize_spec(spec: Any) -> dict[str, list[dict[str, Any]]]:
    """`{all, none}` from either a mapping or a bare list; validates every item."""
    if isinstance(spec, list):
        spec = {"all": spec}
    if not isinstance(spec, dict) or not set(spec) <= {"all", "none"}:
        raise ValueError("expectAnswer must be a list or a mapping with `all:` and/or `none:`")
    out = {"all": list(spec.get("all") or []), "none": list(spec.get("none") or [])}
    if not out["all"] and not out["none"]:
        raise ValueError("expectAnswer declares no item")
    for item in out["all"] + out["none"]:
        if not isinstance(item, dict) or len({"number", "text"} & set(item)) != 1:
            raise ValueError(f"expectAnswer item {item!r} needs exactly one of `number:` or `text:`")
        if not set(item) <= {"number", "text", "tolerance", "near", "percent"}:
            raise ValueError(f"expectAnswer item {item!r} has unknown keys")
        if "number" not in item and set(item) & {"tolerance", "near", "percent"}:
            raise ValueError(f"expectAnswer item {item!r}: tolerance/near/percent go with `number:`")
        if "tolerance" in item and float(item["tolerance"]) < 0:
            raise ValueError(f"expectAnswer item {item!r}: tolerance must be >= 0")
        if "near" in item and not str(item["near"]).strip():
            raise ValueError(f"expectAnswer item {item!r}: near needs a text anchor")
    return out


def check_answer(answer: str | None, spec: Any) -> dict[str, Any]:
    """Match `answer` against a resolved spec.

    `verified` is False when there is no answer at all: a loop that never
    answered the user did not give the expected answer. It is never None here —
    "could not check" (no agent run, an unresolvable reference) is the caller's
    to decide, before calling.
    """
    normalized = normalize_spec(spec)
    text = answer or ""
    numbers = extract_numbers(text)
    folded = _fold(text)
    present = [_check_item(i, folded, numbers) for i in normalized["all"]]
    absent = [_check_item(i, folded, numbers) for i in normalized["none"]]
    verified = answer is not None and all(c["ok"] for c in present) and not any(c["ok"] for c in absent)
    return {
        "matcherVersion": MATCHER_VERSION,
        "verified": verified,
        "answered": answer is not None,
        "all": present,
        "none": absent,
    }
