"""Comparison metrics, KR summary and stability, from hand-built run directories.

The fixture `fixtures/compare-okr/` is a two-target comparison (local = etendo-go,
holded) with REPEAT=3 and one task per decision path. Its `events.ndjson`
deliberately disagrees with the probe files, so reading it would show up.

@covers mcp-tests/runner/report.py
"""

from __future__ import annotations

import copy
import io
import json
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from runner import report

FIXTURE = Path(__file__).parent / "fixtures" / "compare-okr"


def _copy_fixture() -> Path:
    dest = Path(tempfile.mkdtemp()) / "cmp"
    shutil.copytree(FIXTURE, dest)
    return dest


def _edit_compare(cmp_dir: Path, change) -> None:
    path = cmp_dir / "compare.json"
    compare = json.loads(path.read_text())
    change(compare)
    path.write_text(json.dumps(compare))


def _task(summary, task_id):
    return next(t for t in summary["tasks"] if t["task"] == task_id)


class NineItemsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.summary = report.build_summary(FIXTURE)

    def test_items_of_a_side_with_a_rescheduled_harness_error(self):
        side = _task(self.summary, "q-product-prices-stock")["reference"]
        items = side["items"]
        # attempt 2 hit a 429 and was replaced by attempt 4: kept on file, not counted.
        self.assertEqual(side["attempts"], {"files": 4, "measured": 3, "harnessErrors": 1, "counted": 3})
        self.assertEqual([a["attempt"] for a in side["perAttempt"] if a["measured"]], [1, 3, 4])
        self.assertEqual(items["success"], 2)                                   # 1
        self.assertEqual(items["consistency"], {"successes": 2, "of": 3, "ratio": 0.6667})  # 2
        self.assertEqual(items["medianCalls"], 2.0)                             # 3: successes only
        self.assertEqual(items["firstCallSuccess"], {"ok": 3, "of": 3})         # 4
        self.assertEqual(items["unrecoveredErrors"], 1)                         # 5
        self.assertEqual(items["selfCorrectedErrors"], {"count": 0, "ofErrors": 1, "ratio": 0.0})  # 6
        self.assertEqual(items["stumbles"], {"total": 2, "errorCalls": 1, "wastedCalls": 1,
                                             "partlySelfReported": True})       # 7
        self.assertEqual(items["silentWrong"], 1)                               # 8: OKAY + check failed
        self.assertEqual(items["cost"]["medianTokens"], 6000.0)                  # 9
        self.assertEqual(items["cost"]["medianBytes"], 200.0)
        self.assertEqual(side["crossCheck"]["selfReportedUnrecovered"], 1)

    def test_an_error_followed_by_a_success_on_the_same_tool_is_self_corrected(self):
        items = _task(self.summary, "q-product-prices-stock")["subject"]["items"]
        self.assertEqual(items["unrecoveredErrors"], 0)
        self.assertEqual(items["selfCorrectedErrors"]["count"], 1)
        self.assertEqual(items["firstCallSuccess"], {"ok": 2, "of": 3})

    def test_priming_is_shown_as_an_estimate_next_to_the_total(self):
        priming = _task(self.summary, "f-process-sales-order")["reference"]["items"]["cost"]["priming"]
        # holded catalogue 8000 bytes / 4 = 2000 tokens, x 8 turns (median).
        self.assertEqual(priming["catalogueTokens"], 2000)
        self.assertEqual(priming["medianPrimingTokens"], 16000)
        self.assertTrue(priming["estimate"])


class UnitRulesTest(unittest.TestCase):
    def test_unrecovered_means_no_later_success_on_the_same_tool(self):
        calls = [{"tool": "a", "error": True}, {"tool": "b", "error": False},
                 {"tool": "b", "error": True}, {"tool": "a", "error": False}]
        self.assertEqual(report.unrecovered_errors(calls), 1)

    def test_success_is_objective_only(self):
        self.assertTrue(report.attempt_success({"effectVerified": True}))
        self.assertFalse(report.attempt_success({"effectVerified": True, "answerVerified": False}))
        self.assertIsNone(report.attempt_success({"effectVerified": None, "verdict": {"outcome": "OKAY"}}))
        self.assertFalse(report.attempt_success({"success": False, "effectVerified": True}))

    def test_first_call_is_none_without_calls(self):
        self.assertIsNone(report.measure_attempt(1, {"toolCalls": [], "harnessError": None})["firstCallOk"])

    def test_an_unverifiable_attempt_makes_the_side_not_evaluable(self):
        target = report.TargetRecords("t", {}, {"p": report.ProbeRecords(attempts=[
            (n, {"harnessError": None, "toolCalls": [], "effectVerified": None}) for n in (1, 2, 3)])})
        entry, side = report.aggregate_side(target, "p", 3, "etendo-go")
        self.assertIn("not verifiable", side.not_evaluable)

    def test_run_cost_tokens_are_null_not_zero_without_usage(self):
        cost = report._run_cost([report.measure_attempt(1, {"harnessError": {"kind": "setup"}, "usage": None})])
        self.assertIsNone(cost["loopTokens"])
        self.assertIsNone(cost["reportTokens"])
        self.assertEqual(cost["attemptsWithoutLoopUsage"], 1)

    def test_run_cost_totals_skip_attempts_without_usage(self):
        measures = [
            report.measure_attempt(1, {"harnessError": None, "usage": {"loop": {"totalTokens": 100, "turns": 1},
                                                                       "report": {"totalTokens": 20}}}),
            report.measure_attempt(2, {"harnessError": {"kind": "provider"}, "usage": None}),
            report.measure_attempt(3, {"harnessError": None, "usage": {"loop": {"totalTokens": 50, "turns": 1},
                                                                       "report": None}}),
            # Measured, but the gateway sent no usage: also an attempt without it.
            report.measure_attempt(4, {"harnessError": None, "usage": {"loop": {"totalTokens": None}}}),
        ]
        cost = report._run_cost(measures)
        self.assertEqual((cost["attempts"], cost["harnessErrors"]), (4, 1))
        self.assertEqual((cost["loopTokens"], cost["reportTokens"]), (150, 20))
        self.assertEqual(cost["attemptsWithoutLoopUsage"], 2)

    def _side_with_catalogue(self, server):
        attempts = [(n, {"harnessError": None, "effectVerified": True, "toolCalls": [],
                         "usage": {"loop": {"totalTokens": 1000, "turns": 2}}}) for n in (1, 2, 3)]
        target = report.TargetRecords("t", {"server": server}, {"p": report.ProbeRecords(attempts=attempts)})
        entry, _ = report.aggregate_side(target, "p", 3, "etendo-go")
        return entry["items"]["cost"]["priming"]

    def test_priming_needs_the_catalogue_size(self):
        self.assertIsNone(self._side_with_catalogue({"catalogue": {"sha": "x", "toolCount": 3}}))
        self.assertIsNone(self._side_with_catalogue(None))
        priming = self._side_with_catalogue({"catalogue": {"sha": "x", "bytes": 400}})
        # 400 B / 4 = 100 tokens, x 2 turns = 200; the rest of the 1000 is the task.
        self.assertEqual(priming, {"estimate": True, "catalogueTokens": 100,
                                   "medianPrimingTokens": 200, "medianRemainderTokens": 800})

    def test_legacy_flat_probe_file_reads_as_attempt_one(self):
        run = Path(tempfile.mkdtemp())
        (run / "probes").mkdir()
        (run / "probes" / "p.json").write_text(json.dumps({"harnessError": None}))
        self.assertEqual([n for n, _ in report.load_target(run, "t").probes["p"].attempts], [1])


class SummaryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.summary = report.build_summary(FIXTURE)

    def test_every_task_lands_on_its_decision_path(self):
        got = {t["task"]: (t["status"], t["winner"], t["decidedBy"]) for t in self.summary["tasks"]}
        self.assertEqual(got, {
            "w-invoice-one-product-issued": ("decided", "subject", "0-capability"),
            "q-product-prices-stock": ("decided", "subject", "1-success"),
            "f-process-sales-order": ("decided", "reference", "2-calls"),
            "e-unknown-document": ("decided", "tie", "1-noSuccess"),
            "q-both-not-possible": ("excluded", None, None),
            "q-short-of-attempts": ("notEvaluable", None, None),
            "q-tokens-missing": ("decided", "subject", "4-bytes"),
        })

    def test_kr_is_split_by_capability_and_measurement(self):
        kr = self.summary["kr"]
        self.assertEqual(kr["tasks"], 7)
        self.assertEqual(kr["evaluated"], 5, "excluded and not-evaluable tasks are out of the denominator")
        self.assertEqual(kr["subjectWins"], {"total": 3, "byCapability": 1, "byMeasurement": 2})
        self.assertEqual(kr["referenceWins"], {"total": 1, "byCapability": 0, "byMeasurement": 1})
        self.assertEqual(kr["ties"], 1)
        self.assertEqual((kr["winRate"], kr["winRateByCapability"], kr["winRateByMeasurement"]), (0.6, 0.2, 0.4))

    def test_stumble_indicators_per_target(self):
        s = self.summary["stumbleIndicators"]
        self.assertEqual((s["holded"]["stumbles"], s["holded"]["attempts"]), (2, 15))
        self.assertEqual(s["holded"]["perAttempt"], 0.1333)
        self.assertEqual((s["holded"]["tasksWithAnyStumble"], s["holded"]["tasks"]), (1, 5))
        self.assertEqual(s["local"]["tasksWithAnyStumble"], 1)

    def test_capability_gaps_and_uncounted_tasks_are_listed(self):
        gaps = {(g["task"], g["target"]) for g in self.summary["capabilityGaps"]}
        self.assertIn(("w-invoice-one-product-issued", "holded"), gaps)
        self.assertEqual([r["task"] for r in self.summary["excluded"]], ["q-both-not-possible"])
        self.assertEqual([r["task"] for r in self.summary["notEvaluable"]], ["q-short-of-attempts"])

    def test_unofficial_when_a_target_is_not_fresh(self):
        self.assertFalse(self.summary["official"])
        self.assertEqual(self.summary["freshness"]["holded"]["status"], "clean")
        self.assertIn("UNOFFICIAL", report.render_markdown(self.summary).splitlines()[0])

    def test_official_when_every_target_is_fresh(self):
        cmp_dir = _copy_fixture()
        compare = json.loads((cmp_dir / "compare.json").read_text())
        for t in compare["targets"]:
            t["freshness"]["status"] = "fresh"
        (cmp_dir / "compare.json").write_text(json.dumps(compare))
        summary = report.build_summary(cmp_dir)
        self.assertTrue(summary["official"])
        self.assertIn("OFFICIAL", report.render_markdown(summary).splitlines()[0])

    def test_a_comparison_needs_exactly_two_targets(self):
        cmp_dir = _copy_fixture()
        _edit_compare(cmp_dir, lambda c: c["targets"].append({"name": "third"}))
        with self.assertRaisesRegex(ValueError, "exactly two targets, found 3"):
            report.build_summary(cmp_dir)

    def test_an_unknown_rule_version_surfaces_from_build_summary(self):
        cmp_dir = _copy_fixture()
        _edit_compare(cmp_dir, lambda c: c["decision"].update(ruleVersion=99))
        with self.assertRaises(report.rule.RuleMismatch):
            report.build_summary(cmp_dir)

    def _decisions(self, summary):
        return {t["task"]: (t["status"], t["winner"], t["decidedBy"]) for t in summary["tasks"]}

    def test_targets_may_be_a_dict_keyed_by_name(self):
        cmp_dir = _copy_fixture()

        def to_dict(c):
            c["targets"] = {t.pop("name"): t for t in c["targets"]}
        _edit_compare(cmp_dir, to_dict)
        summary = report.build_summary(cmp_dir)
        self.assertEqual(self._decisions(summary), self._decisions(self.summary))
        self.assertEqual(summary["pins"]["targets"]["holded"]["platform"], "holded")
        self.assertEqual(summary["freshness"]["local"]["status"], "fresh")

    def test_without_a_targets_key_the_target_dirs_are_discovered(self):
        cmp_dir = _copy_fixture()
        _edit_compare(cmp_dir, lambda c: c.pop("targets"))
        summary = report.build_summary(cmp_dir)
        self.assertEqual((summary["kr"]["subject"], summary["kr"]["reference"]), ("local", "holded"))
        self.assertEqual(self._decisions(summary), self._decisions(self.summary))
        # Nothing declares freshness any more: unknown, so unofficial.
        self.assertEqual({f["status"] for f in summary["freshness"].values()}, {"unknown"})
        self.assertFalse(summary["official"])

    def test_missing_freshness_is_unknown_and_unofficial(self):
        cmp_dir = _copy_fixture()

        def fresh_but_one(c):
            c["targets"][0]["freshness"]["status"] = "fresh"
            del c["targets"][1]["freshness"]
        _edit_compare(cmp_dir, fresh_but_one)
        summary = report.build_summary(cmp_dir)
        self.assertEqual(summary["freshness"]["holded"],
                         {"status": "unknown", "checkedAt": None, "initializedAt": None})
        self.assertFalse(summary["official"])

    def test_pipes_in_table_cells_are_escaped(self):
        cmp_dir = _copy_fixture()
        np_file = cmp_dir / "targets/holded/probes/w-invoice-one-product-issued/not-possible.json"
        np = json.loads(np_file.read_text())
        np["declaration"]["reason"] = "no create_invoice | no draft"
        np_file.write_text(json.dumps(np))
        md = report.render_markdown(report.build_summary(cmp_dir))
        row = next(line for line in md.splitlines() if "no create_invoice" in line)
        self.assertIn("no create_invoice \\| no draft", row)
        # Still the 15 columns of the header: the pipe did not open a new cell.
        header = next(line for line in md.splitlines() if line.startswith("| Task |"))
        unescaped = lambda line: line.replace("\\|", "").count("|")  # noqa: E731
        self.assertEqual(unescaped(row), unescaped(header))

    def test_rule_version_and_parameters_are_recorded(self):
        self.assertEqual(self.summary["rule"]["version"], 1)
        self.assertEqual(self.summary["rule"]["parameters"]["callsMargin"], 0.2)
        self.assertEqual(self.summary["pins"]["rule"], {k: self.summary["rule"][k]
                                                        for k in ("version", "parameters", "parametersSha")})

    def test_markdown_shows_not_possible_and_no_raw_tool_result(self):
        md = report.render_markdown(self.summary)
        self.assertIn("not possible (goal): Holded's MCP has no tool to create an invoice.", md)
        self.assertNotIn("finalAnswer", md)
        self.assertNotIn("listo", md)

    def test_report_is_identical_without_events_and_byte_stable(self):
        cmp_dir = _copy_fixture()
        report.write_summary(cmp_dir)
        before = ((cmp_dir / "summary.json").read_bytes(), (cmp_dir / "summary.md").read_bytes())
        for events in cmp_dir.glob("targets/*/events.ndjson"):
            events.unlink()
        report.write_summary(cmp_dir)
        after = ((cmp_dir / "summary.json").read_bytes(), (cmp_dir / "summary.md").read_bytes())
        self.assertEqual(before, after)

    def test_cli_report_writes_both_files(self):
        cmp_dir = _copy_fixture()
        with redirect_stdout(io.StringIO()) as out:
            self.assertEqual(report.main(["report", str(cmp_dir)]), 0)
        self.assertTrue((cmp_dir / "summary.json").exists())
        self.assertIn("UNOFFICIAL", out.getvalue())


class StabilityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base = report.build_summary(FIXTURE)
        for t in base["freshness"].values():
            t["status"] = "fresh"
        base["official"] = True
        cls.base = base

    def test_identical_runs_agree_fully_and_a_tie_equals_a_tie(self):
        result = report.stability(self.base, copy.deepcopy(self.base))
        self.assertTrue(result["valid"])
        self.assertEqual(result["agreement"], {"agree": 5, "of": 5, "ratio": 1.0})
        self.assertTrue(next(t for t in result["tasks"] if t["task"] == "e-unknown-document")["agree"])
        self.assertTrue(result["meetsTarget"])

    def test_a_flipped_task_lowers_agreement_and_non_fragile_is_separate(self):
        b = copy.deepcopy(self.base)
        _task(b, "q-product-prices-stock")["winner"] = "tie"   # fragile in A
        _task(b, "q-tokens-missing")["winner"] = "reference"   # not fragile
        result = report.stability(self.base, b)
        self.assertEqual(result["agreement"], {"agree": 3, "of": 5, "ratio": 0.6})
        self.assertFalse(result["meetsTarget"])
        self.assertEqual(result["agreementNonFragile"], {"agree": 2, "of": 3, "ratio": 0.6667})
        self.assertIn("q-short-of-attempts", result["onlyEvaluableInOne"])

    def test_pin_mismatch_makes_the_pair_invalid(self):
        b = copy.deepcopy(self.base)
        b["pins"]["targets"]["holded"]["catalogueSha"] = "other"
        b["pins"]["concurrency"]["local"] = 1  # reported, never a refusal
        result = report.stability(self.base, b)
        self.assertFalse(result["valid"])
        self.assertEqual([d["pin"] for d in result["pinDifferences"]], ["targets.holded.catalogueSha"])
        self.assertIn("pins differ", report.render_stability(result))

    def test_an_unofficial_run_makes_the_pair_invalid(self):
        b = copy.deepcopy(self.base)
        b["official"] = False
        result = report.stability(self.base, b)
        self.assertFalse(result["valid"])
        self.assertEqual(result["agreement"]["ratio"], 1.0, "still computed, just not valid")

    def test_self_reported_tasks_are_flagged_but_decided_and_compared_as_any_other(self):
        # Documents the S5 contract: `successBasis: selfReport` is VISIBLE
        # (summary.json + summary.md) but neither the rule (decide.py never
        # sees it) nor stability treats it differently. A self-reported task
        # flips and agrees like any other; stability does not flag it.
        cmp_dir = _copy_fixture()
        for f in cmp_dir.glob("targets/*/probes/f-process-sales-order/attempt-*.json"):
            record = json.loads(f.read_text())
            record["successBasis"] = "selfReport"
            f.write_text(json.dumps(record))
        summary = report.build_summary(cmp_dir)
        self.assertEqual(summary["selfReportedSuccess"]["count"], 1)
        self.assertEqual({(r["task"], r["target"]) for r in summary["selfReportedSuccess"]["tasks"]},
                         {("f-process-sales-order", "local"), ("f-process-sales-order", "holded")})
        md = report.render_markdown(summary)
        self.assertIn("## Success on the agent's word", md)
        self.assertIn("- **f-process-sales-order** on local", md)
        self.assertEqual(_task(summary, "f-process-sales-order")["decidedBy"],
                         _task(self.base, "f-process-sales-order")["decidedBy"])
        a = copy.deepcopy(summary)
        for t in a["freshness"].values():
            t["status"] = "fresh"
        a["official"] = True
        b = copy.deepcopy(a)
        _task(b, "f-process-sales-order")["winner"] = "subject"
        result = report.stability(a, b)
        flipped = next(t for t in result["tasks"] if t["task"] == "f-process-sales-order")
        self.assertFalse(flipped["agree"])
        self.assertNotIn("selfReport", json.dumps(result))
        # A summary without any self-reported task renders no such section.
        self.assertEqual(self.base["selfReportedSuccess"], {"count": 0, "tasks": []})
        self.assertNotIn("agent's word", report.render_markdown(self.base))

    def test_cli_stability_json_prints_the_full_result(self):
        with redirect_stdout(io.StringIO()) as out:
            code = report.main(["stability", str(FIXTURE), str(FIXTURE), "--json"])
        result = json.loads(out.getvalue())
        self.assertEqual(code, 2)
        self.assertFalse(result["valid"])
        self.assertEqual(result["refusals"], ["both runs must be official (every target fresh)"])
        self.assertEqual(result["agreement"], {"agree": 5, "of": 5, "ratio": 1.0})
        self.assertEqual(len(result["tasks"]), 5)

    def test_cli_stability_exits_two_when_not_valid(self):
        with redirect_stdout(io.StringIO()) as out:
            code = report.main(["stability", str(FIXTURE), str(FIXTURE)])
        self.assertEqual(code, 2, "the fixture is unofficial on holded")
        self.assertIn("NOT VALID", out.getvalue())


class MakeTargetsTest(unittest.TestCase):
    """The Make wrappers refuse to run without their arguments (no uv call)."""

    ROOT = Path(__file__).resolve().parents[2]

    def _make(self, *argv):
        if shutil.which("make") is None:
            self.skipTest("make is not installed")
        return subprocess.run(["make", "-s", "-C", str(self.ROOT), *argv],
                              capture_output=True, text=True, timeout=30)

    def test_mcp_report_without_run_fails_with_usage(self):
        done = self._make("mcp-report")
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("RUN is required", done.stdout)
        self.assertNotIn("runner.report", done.stdout + done.stderr)

    def test_mcp_stability_needs_both_runs(self):
        for argv in (("mcp-stability",), ("mcp-stability", "A=x"), ("mcp-stability", "B=y")):
            with self.subTest(argv=argv):
                done = self._make(*argv)
                self.assertNotEqual(done.returncode, 0)
                self.assertIn("A and B are required", done.stdout)


if __name__ == "__main__":
    unittest.main()
