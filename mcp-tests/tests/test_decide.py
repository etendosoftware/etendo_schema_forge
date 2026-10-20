"""The versioned decision rule: every step and its margin edges (plan §5.6, D47).

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


class SuccessStepTest(unittest.TestCase):
    def test_more_successes_wins_and_one_attempt_is_fragile(self):
        d = decide.decide(ok(successes=3), ok(successes=2, calls=1), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "1-success"))
        self.assertTrue(d.fragile)
        d = decide.decide(ok(successes=1), ok(successes=3), P)
        self.assertEqual(d.winner, "reference")
        self.assertFalse(d.fragile)

    def test_both_zero_of_n_is_a_tie_not_a_race_to_give_up(self):
        d = decide.decide(ok(successes=0, calls=None), ok(successes=0, calls=None, unrecovered=5), P)
        self.assertEqual((d.winner, d.decided_by), ("tie", "1-noSuccess"))


class CallsStepTest(unittest.TestCase):
    def test_exactly_twenty_percent_decides(self):
        d = decide.decide(ok(calls=10), ok(calls=8), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "2-calls"))
        self.assertAlmostEqual(d.margin["gap"], 0.20)

    def test_nineteen_percent_falls_through(self):
        d = decide.decide(ok(calls=100), ok(calls=81), P)
        self.assertNotEqual(d.decided_by, "2-calls")
        self.assertEqual(d.decided_by, "5-tie")
        self.assertTrue(d.fragile, "a gap just under the threshold can flip")

    def test_a_wide_gap_is_not_fragile(self):
        d = decide.decide(ok(calls=4), ok(calls=10), P)
        self.assertEqual((d.winner, d.decided_by, d.fragile), ("subject", "2-calls", False))


class UnrecoveredStepTest(unittest.TestCase):
    def test_fewer_unrecovered_errors_wins(self):
        d = decide.decide(ok(unrecovered=3), ok(unrecovered=1), P)
        self.assertEqual((d.winner, d.decided_by), ("reference", "3-unrecovered"))
        self.assertFalse(d.fragile, "two errors apart is not a single-error call")

    def test_a_single_unrecovered_error_apart_is_fragile(self):
        d = decide.decide(ok(unrecovered=0), ok(unrecovered=1), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "3-unrecovered"))
        self.assertTrue(d.fragile)
        self.assertEqual(d.fragile_reasons, ["step 3 decided by a single unrecovered error"])


class CostStepTest(unittest.TestCase):
    def test_tokens_at_ten_percent_decide(self):
        d = decide.decide(ok(tokens=900), ok(tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "4-tokens"))

    def test_tokens_under_ten_percent_tie(self):
        d = decide.decide(ok(tokens=910), ok(tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("tie", "5-tie"))

    def test_missing_tokens_fall_back_to_bytes(self):
        d = decide.decide(ok(tokens=None, nbytes=300), ok(tokens=1000, nbytes=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "4-bytes"))
        self.assertEqual(d.margin["metric"], "bytes")

    def test_a_token_win_just_past_the_threshold_is_fragile(self):
        # 12 % gap: decides (>= 10 %) but within the 5-point band.
        d = decide.decide(ok(tokens=880), ok(tokens=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "4-tokens"))
        self.assertTrue(d.fragile)
        self.assertIn("step 4 gap within the fragile band of its threshold", d.fragile_reasons)
        # 20 %: clear of the band.
        self.assertFalse(decide.decide(ok(tokens=800), ok(tokens=1000), P).fragile)

    def test_a_token_tie_just_under_the_threshold_is_fragile(self):
        d = decide.decide(ok(tokens=930), ok(tokens=1000), P)
        self.assertEqual(d.decided_by, "5-tie")
        self.assertIn("step 4 gap just under its threshold", d.fragile_reasons)
        self.assertFalse(decide.decide(ok(tokens=1000), ok(tokens=1000), P).fragile)

    def test_the_byte_fallback_has_the_same_fragile_band(self):
        d = decide.decide(ok(tokens=None, nbytes=880), ok(tokens=None, nbytes=1000), P)
        self.assertEqual((d.winner, d.decided_by), ("subject", "4-bytes"))
        self.assertTrue(d.fragile)
        d = decide.decide(ok(tokens=None, nbytes=930), ok(tokens=None, nbytes=1000), P)
        self.assertEqual(d.decided_by, "5-tie")
        self.assertTrue(d.fragile)
        self.assertEqual(d.margin["cost"]["metric"], "bytes")

    def test_a_missing_byte_median_past_step_one_is_an_error_not_a_tie(self):
        with self.assertRaises(ValueError):
            decide.decide(ok(tokens=None, nbytes=None), ok(tokens=None, nbytes=None), P)


class VersioningTest(unittest.TestCase):
    def test_parameters_come_from_the_declared_block(self):
        params = decide.resolve_parameters({"ruleVersion": 1, "callsMargin": 0.5})
        self.assertEqual(params["callsMargin"], 0.5)
        self.assertEqual(params["tokensMargin"], decide.DEFAULT_PARAMETERS["tokensMargin"])
        d = decide.decide(ok(calls=10), ok(calls=8), params)
        self.assertNotEqual(d.decided_by, "2-calls")

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
