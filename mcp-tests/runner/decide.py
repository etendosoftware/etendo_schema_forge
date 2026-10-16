"""The decision rule: which MCP won a task (plan §5.6, D47).

Pure and versioned. No file, no LLM, no MCP: it takes the two sides' aggregates
(built by `report.py`) and returns a winner plus the criterion that decided it.

The rule is code, its thresholds are data. `RULE_VERSION` names the code; the
parameters come from the suite's `decision:` block (copied into compare.json by
the runner) and default to `DEFAULT_PARAMETERS`. Both are recorded in every
summary, so a number is never read without the rule that produced it. Changing
the ORDER of the steps, what a step compares, or how a margin is computed is a
`RULE_VERSION` bump; changing a threshold is a parameter change, visible in the
recorded parameters and their sha.

Steps, subject vs reference:

  0. Capability (D49): exactly one side `notPossible` -> the other wins.
     Both `notPossible` -> excluded (invalid task). A stale declaration
     (`invalidDeclaration`) or a side short of N measured, verified attempts
     -> not evaluable.
  1. More successful attempts wins. Both 0/N -> tie: steps 2-4 would otherwise
     reward whoever gives up faster.
  2. Median calls over SUCCESSFUL attempts; the lower wins if the relative gap
     |a-b| / max(a,b) >= callsMargin.
  3. Fewer unrecovered errors (summed over the measured attempts) wins.
  4. Median total loop tokens over successful attempts (catalogue included);
     the lower wins if the relative gap >= tokensMargin. When either side lacks
     token usage on any successful attempt, the same comparison runs on summed
     result bytes and `decidedBy` says `4-bytes`.
  5. Otherwise a tie (it still counts in the KR denominator).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

RULE_VERSION = 1

DEFAULT_PARAMETERS: dict[str, float] = {
    # Plan §5.6 / §9 decision 8.
    "callsMargin": 0.20,
    "tokensMargin": 0.10,
    # Plan §6: a margin within this many points of its threshold makes the
    # result fragile (expected to flip between runs).
    "fragileBand": 0.05,
}

# Float noise must not decide a margin edge: 8 vs 10 calls is exactly 20 %.
_EPS = 1e-9

SUBJECT, REFERENCE, TIE = "subject", "reference", "tie"


class RuleMismatch(ValueError):
    """The suite asks for a rule version this code does not implement."""


def resolve_parameters(declared: dict[str, Any] | None) -> dict[str, Any]:
    """Merge a suite/compare `decision:` block over the defaults.

    A declared `ruleVersion` different from `RULE_VERSION` is refused rather
    than silently re-interpreted under another rule.
    """
    declared = dict(declared or {})
    version = declared.pop("ruleVersion", None)
    if version is not None and version != RULE_VERSION:
        raise RuleMismatch(
            f"decision.ruleVersion {version} is not implemented (this code is rule {RULE_VERSION})"
        )
    params = dict(DEFAULT_PARAMETERS)
    for key, value in declared.items():
        if key in DEFAULT_PARAMETERS:
            params[key] = float(value)
    return params


def rule_descriptor(params: dict[str, Any]) -> dict[str, Any]:
    """What a summary records about the rule that produced it."""
    canonical = json.dumps(params, sort_keys=True, separators=(",", ":"))
    return {
        "version": RULE_VERSION,
        "parameters": dict(sorted(params.items())),
        "parametersSha": hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12],
    }


@dataclass(frozen=True)
class Side:
    """One target's aggregate for one task — the only input the rule reads.

    `capability` is "possible" | "notPossible" | "invalidDeclaration".
    `notEvaluable` holds the reason a possible side cannot be compared (short of
    N measured attempts, or an attempt whose success could not be verified).
    """

    capability: str = "possible"
    not_evaluable: str | None = None
    successes: int = 0
    attempts: int = 0
    median_calls: float | None = None
    unrecovered: int = 0
    median_tokens: float | None = None
    median_bytes: float | None = None


@dataclass
class Decision:
    status: str  # "decided" | "excluded" | "notEvaluable"
    winner: str | None = None  # subject | reference | tie
    decided_by: str | None = None
    reason: str | None = None
    margin: dict[str, Any] | None = None
    fragile: bool = False
    fragile_reasons: list[str] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "winner": self.winner,
            "decidedBy": self.decided_by,
            "reason": self.reason,
            "margin": self.margin,
            "fragile": self.fragile,
            "fragileReasons": self.fragile_reasons,
        }


def relative_gap(a: float, b: float) -> float:
    """|a-b| / max(a,b); 0 when both are 0."""
    top = max(a, b)
    return 0.0 if top <= 0 else abs(a - b) / top


def _lower_wins(a: float, b: float) -> str:
    return SUBJECT if a < b else REFERENCE


def decide(subject: Side, reference: Side, params: dict[str, Any] | None = None) -> Decision:
    params = params or dict(DEFAULT_PARAMETERS)
    band = params["fragileBand"]

    # --- step 0: capability -------------------------------------------------
    for name, side in (("subject", subject), ("reference", reference)):
        if side.capability == "invalidDeclaration":
            return Decision("notEvaluable", reason=f"{name}: notPossible declaration is stale (invalidDeclaration)")
    s_np, r_np = subject.capability == "notPossible", reference.capability == "notPossible"
    if s_np and r_np:
        return Decision("excluded", reason="notPossible on both platforms (invalid task)")
    if s_np != r_np:
        other = reference if s_np else subject
        if other.not_evaluable:
            # The capable side still has to have been measured: a win by
            # capability is not awarded for a run that never happened.
            return Decision("notEvaluable", reason=f"{'reference' if s_np else 'subject'}: {other.not_evaluable}")
        return Decision("decided", REFERENCE if s_np else SUBJECT, "0-capability",
                        margin={"step": 0})
    for name, side in (("subject", subject), ("reference", reference)):
        if side.not_evaluable:
            return Decision("notEvaluable", reason=f"{name}: {side.not_evaluable}")

    fragile_reasons: list[str] = []

    # --- step 1: successes --------------------------------------------------
    diff = subject.successes - reference.successes
    if diff != 0:
        if abs(diff) == 1:
            fragile_reasons.append("step 1 decided by a single attempt")
        return _done(SUBJECT if diff > 0 else REFERENCE, "1-success",
                     {"step": 1, "subject": subject.successes, "reference": reference.successes,
                      "difference": abs(diff)}, fragile_reasons)
    if subject.successes == 0:
        return _done(TIE, "1-noSuccess", {"step": 1, "subject": 0, "reference": 0}, fragile_reasons)

    # --- step 2: median calls over successful attempts ----------------------
    a, b = subject.median_calls, reference.median_calls
    gap = relative_gap(a, b)
    calls_margin = params["callsMargin"]
    margin2 = {"step": 2, "subject": a, "reference": b, "gap": round(gap, 6),
               "threshold": calls_margin, "distance": round(gap - calls_margin, 6)}
    if gap + _EPS >= calls_margin:
        if gap - calls_margin < band - _EPS:
            fragile_reasons.append("step 2 gap within the fragile band of its threshold")
        return _done(_lower_wins(a, b), "2-calls", margin2, fragile_reasons)
    if calls_margin - gap <= band + _EPS and gap > 0:
        fragile_reasons.append("step 2 gap just under its threshold")

    # --- step 3: unrecovered errors -----------------------------------------
    if subject.unrecovered != reference.unrecovered:
        if abs(subject.unrecovered - reference.unrecovered) == 1:
            fragile_reasons.append("step 3 decided by a single unrecovered error")
        return _done(_lower_wins(subject.unrecovered, reference.unrecovered), "3-unrecovered",
                     {"step": 3, "subject": subject.unrecovered, "reference": reference.unrecovered,
                      "difference": abs(subject.unrecovered - reference.unrecovered)}, fragile_reasons)

    # --- step 4: tokens, or bytes when tokens are missing --------------------
    if subject.median_tokens is not None and reference.median_tokens is not None:
        a, b, label = subject.median_tokens, reference.median_tokens, "4-tokens"
    else:
        # Past step 1 both sides have >= 1 success, and a successful attempt
        # always has a byte sum (0 when it made no call), so a median is always
        # there. Reaching None anyway means the aggregate is broken: say so
        # instead of comparing 0 with 0 and calling it a measured tie.
        if subject.median_bytes is None or reference.median_bytes is None:
            raise ValueError("step 4 reached without a byte median on a side with successes")
        a, b, label = subject.median_bytes, reference.median_bytes, "4-bytes"
    gap = relative_gap(a, b)
    tokens_margin = params["tokensMargin"]
    margin4 = {"step": 4, "metric": label[2:], "subject": a, "reference": b, "gap": round(gap, 6),
               "threshold": tokens_margin, "distance": round(gap - tokens_margin, 6)}
    if gap + _EPS >= tokens_margin:
        if gap - tokens_margin < band - _EPS:
            fragile_reasons.append("step 4 gap within the fragile band of its threshold")
        return _done(_lower_wins(a, b), label, margin4, fragile_reasons)
    if tokens_margin - gap <= band + _EPS and gap > 0:
        fragile_reasons.append("step 4 gap just under its threshold")

    # --- step 5: tie ---------------------------------------------------------
    return _done(TIE, "5-tie", {"step": 5, "calls": margin2, "cost": margin4}, fragile_reasons)


def _done(winner: str, decided_by: str, margin: dict[str, Any], fragile_reasons: list[str]) -> Decision:
    return Decision("decided", winner, decided_by, margin=margin,
                    fragile=bool(fragile_reasons), fragile_reasons=list(fragile_reasons))
