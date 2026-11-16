"""The versioned decision rule (rule 3): every step and its margin edges (plan §5.6, D47; plan 2026-10-22 §3.4).

@covers mcp-tests/runner/decide.py
"""

from __future__ import annotations

import unittest

from runner import decide
from runner.decide import Side

P = decide.resolve_parameters(None)


def ok(successes=3, calls=10.0, unrecovered=0, tokens=1000.0, nbytes=500.0):
    return Side(successes=successes, attempts=3, median_calls=calls, unrecovered=unrecovered,
                median_tokens=tokens, median_bytes=nbytes)


class CapabilityStepTest(unittest.TestCase):
    def test_one_side_not_possible_the_other_wins_by_capability(self):
        d = decide.decide(ok(), Side(capability="notPossible"), P)
        self.assertEqual((d.status, d.winner, d.decided_by), ("decided", "subject", "0-capability"))
        d = decide.decide(Side(capability="notPossible"), ok(successes=0), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "0-capability"))

    def test_both_not_possible_is_excluded(self):
        d = decide.decide(Side(capability="notPossible"), Side(capability="notPossible"), P)
        self.assertEqual(d.status, "excluded")
        self.assertIsNone(d.winner)

    def test_a_stale_declaration_is_not_evaluable(self):
        d = decide.decide(ok(), Side(capability="invalidDeclaration"), P)
        self.assertEqual(d.status, "notEvaluable")
        self.assertIn("invalidDeclaration", d.reason)

    def test_capability_win_still_needs_the_capable_side_measured(self):
        d = decide.decide(Side(not_evaluable="1 of 3 measured attempts"), Side(capability="notPossible"), P)
        self.assertEqual(d.status, "notEvaluable")

    def test_a_side_short_of_attempts_is_not_evaluable(self):
        d = decide.decide(ok(), Side(not_evaluable="2 of 3 measured attempts"), P)
        self.assertEqual((d.status, d.winner), ("notEvaluable", None))
        self.assertTrue(d.reason.startswith("reference:"))


class SubjectMustSucceedTest(unittest.TestCase):
    """Rule 3 (Valentin, 2026-11-05): Etendo has to work every time, so a failed attempt loses."""

    def test_one_failed_subject_attempt_loses_even_when_it_is_cheaper(self):
        d = decide.decide(ok(successes=2, tokens=100), ok(successes=3, tokens=9000), P)
        self.assertEqual((d.status, d.winner, d.decided_by), ("decided", "reference", "1-subjectFailed"))
        self.assertEqual(d.margin, {"step": 1, "subject": 2, "attempts": 3, "reference": 3})

    def test_it_loses_even_when_the_reference_failed_too(self):
        for reference in (ok(successes=2), ok(successes=0, calls=None)):
            d = decide.decide(ok(successes=2), reference, P)
            self.assertEqual((d.winner, d.decided_by), ("reference", "1-subjectFailed"))
        d = decide.decide(ok(successes=0, calls=None), ok(successes=0, calls=None, unrecovered=5), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "1-subjectFailed"))

    def test_a_recovered_error_is_not_a_failure(self):
        d = decide.decide(ok(successes=3, unrecovered=0), ok(successes=3, tokens=5000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "3-tokens"))


class SuccessStepTest(unittest.TestCase):
    def test_more_successes_wins_and_one_attempt_is_fragile(self):
        d = decide.decide(ok(successes=3), ok(successes=2, calls=1), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "1-success"))
        self.assertTrue(d.fragile)


class UnrecoveredStepTest(unittest.TestCase):
    def test_fewer_unrecovered_errors_wins(self):
        d = decide.decide(ok(unrecovered=3), ok(unrecovered=1), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "2-unrecovered"))
        self.assertFalse(d.fragile, "two errors apart is not a single-error call")

    def test_a_single_unrecovered_error_apart_is_fragile(self):
        d = decide.decide(ok(unrecovered=0), ok(unrecovered=1), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "2-unrecovered"))
        self.assertEqual(d.fragile_reasons, ["step 2 decided by a single unrecovered error"])

    def test_errors_decide_before_tokens(self):
        # The side with more errors is far cheaper; errors still come first.
        d = decide.decide(ok(unrecovered=2, tokens=100), ok(unrecovered=0, tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "2-unrecovered"))


class TokensStepTest(unittest.TestCase):
    def test_tokens_at_ten_percent_decide(self):
        d = decide.decide(ok(tokens=900), ok(tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "3-tokens"))
        self.assertAlmostEqual(d.margin["gap"], 0.10)

    def test_tokens_decide_before_calls(self):
        # Plan 2026-10-22 §3.4: the verb + discovery design makes more calls but
        # spends fewer tokens; rule 1 gave this task to the other side on calls.
        d = decide.decide(ok(calls=12, tokens=20_000), ok(calls=4, tokens=100_000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "3-tokens"))

    def test_a_token_win_just_past_the_threshold_is_fragile(self):
        # 12 % gap: decides (>= 10 %) but within the 5-point band.
        d = decide.decide(ok(tokens=880), ok(tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "3-tokens"))
        self.assertIn("step 3 gap within the fragile band of its threshold", d.fragile_reasons)
        self.assertFalse(decide.decide(ok(tokens=800), ok(tokens=1000), P).fragile)

    def test_missing_tokens_make_the_task_not_evaluable(self):
        # No byte fallback: bytes leave the catalogue out (plan §3.4).
        for s, r, who in ((ok(tokens=None), ok(), "subject"), (ok(), ok(tokens=None), "reference")):
            d = decide.decide(s, r, P)
            self.assertEqual((d.status, d.reason), ("notEvaluable", f"{who}: token usage missing"))

    def test_missing_tokens_do_not_matter_without_successes(self):
        # A reference with no success needs no token usage: the subject wins on successes.
        none = Side(successes=0, attempts=3, median_calls=None, median_tokens=None)
        self.assertEqual(decide.decide(ok(), none, P).decided_by, "1-success")


class CallsStepTest(unittest.TestCase):
    def test_calls_decide_when_tokens_are_within_their_margin(self):
        d = decide.decide(ok(calls=10, tokens=950), ok(calls=8, tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "4-calls"))
        self.assertAlmostEqual(d.margin["gap"], 0.20)

    def test_nineteen_percent_falls_through_to_a_fragile_tie(self):
        d = decide.decide(ok(calls=100), ok(calls=81), P)
        self.assertEqual(d.decided_by, "5-tie")
        self.assertIn("step 4 gap just under its threshold", d.fragile_reasons)

    def test_a_tie_records_both_margins(self):
        d = decide.decide(ok(tokens=930), ok(tokens=1000), P)
        self.assertEqual(d.decided_by, "5-tie")
        self.assertEqual((d.margin["tokens"]["metric"], d.margin["calls"]["metric"]), ("tokens", "calls"))
        self.assertIn("step 3 gap just under its threshold", d.fragile_reasons)
        self.assertFalse(decide.decide(ok(), ok(), P).fragile)


class RuleOneRefusedTest(unittest.TestCase):
    def test_a_suite_asking_for_rule_one_is_refused(self):
        with self.assertRaises(decide.RuleMismatch):
            decide.resolve_parameters({"ruleVersion": 1})


class VersioningTest(unittest.TestCase):
    def test_parameters_come_from_the_declared_block(self):
        params = decide.resolve_parameters({"ruleVersion": 3, "callsMargin": 0.5})
        self.assertEqual(params["callsMargin"], 0.5)
        self.assertEqual(params["tokensMargin"], decide.DEFAULT_PARAMETERS["tokensMargin"])
        d = decide.decide(ok(calls=10), ok(calls=8), params)
        self.assertEqual(d.decided_by, "5-tie", "a 20 % calls gap no longer decides under a 50 % margin")

    def test_an_unknown_rule_version_is_refused(self):
        with self.assertRaises(decide.RuleMismatch):
            decide.resolve_parameters({"ruleVersion": decide.RULE_VERSION + 1})

    def test_descriptor_records_version_and_a_parameter_sha(self):
        a = decide.rule_descriptor(decide.resolve_parameters(None))
        b = decide.rule_descriptor(decide.resolve_parameters({"tokensMargin": 0.2}))
        self.assertEqual(a["version"], decide.RULE_VERSION)
        self.assertNotEqual(a["parametersSha"], b["parametersSha"])


if __name__ == "__main__":
    unittest.main()
