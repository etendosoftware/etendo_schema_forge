"""`ui/runs.py` reads probe files of every run schema version (D14).

@covers mcp-tests/ui/runs.py
"""

from __future__ import annotations

import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from ui import runs

V3 = {
    "schemaVersion": 3, "runId": "r", "probeId": "p", "mode": "read",
    "verdict": {"outcome": "OKAY", "summary": "s"}, "harnessError": None,
    "toolCallCount": 1, "toolCalls": [], "effectVerified": None,
    "setup": [], "teardown": [], "teardownClean": None,
}
LOOP = {"turns": 2, "turnsWithUsage": 2, "inputTokens": 10, "outputTokens": 2,
        "totalTokens": 12, "cachedInputTokens": None}
V4 = {**V3, "schemaVersion": 4, "finalAnswer": "listo", "silentWrong": False,
      "usage": {"loop": LOOP, "report": None},
      "servedModel": {"models": [], "systemFingerprints": []}}


class RecordVersionsTest(unittest.TestCase):
    def setUp(self):
        self.run_dir = Path(tempfile.mkdtemp())
        (self.run_dir / "probes").mkdir()

    def _write(self, probe_id, payload):
        (self.run_dir / "probes" / f"{probe_id}.json").write_text(json.dumps(payload))

    def test_a_v3_probe_file_still_loads(self):
        self._write("p", V3)
        probe = runs.load_probe(self.run_dir, "p")
        self.assertEqual(runs.outcome_badge(probe), "OKAY")
        self.assertEqual(runs.probe_files(self.run_dir), ["p"])
        # Never recorded is not the same as recorded empty.
        self.assertIsNone(runs.record_v4(probe))

    def test_a_v4_probe_file_exposes_answer_and_cost(self):
        self._write("p", V4)
        fields = runs.record_v4(runs.load_probe(self.run_dir, "p"))
        self.assertEqual(fields["finalAnswer"], "listo")
        self.assertEqual(fields["loop"], LOOP)
        self.assertIsNone(fields["report"])
        self.assertFalse(fields["silentWrong"])

    def test_a_missing_or_malformed_schema_version_is_not_read_as_v4(self):
        # Only a real integer >= 4 promises the v4 fields; anything else would
        # turn "never recorded" into "recorded as null".
        no_version = {k: v for k, v in V4.items() if k != "schemaVersion"}
        for probe in (no_version, {**V4, "schemaVersion": "4"}, {**V4, "schemaVersion": None},
                      {**V4, "schemaVersion": 4.0}, {**V4, "schemaVersion": [4]}):
            with self.subTest(schemaVersion=probe.get("schemaVersion", "<missing>")):
                self.assertIsNone(runs.record_v4(probe))

    def test_a_v4_probe_with_no_usage_has_no_loop(self):
        # The agent never ran (setup or auth failed): usage stayed null.
        fields = runs.record_v4({**V4, "usage": None, "finalAnswer": None})
        self.assertIsNone(fields["loop"])
        self.assertIsNone(fields["report"])
        self.assertIsNone(fields["finalAnswer"])



class AttemptLayoutTest(unittest.TestCase):
    """Run schema v5 writes `probes/<id>/attempt-<n>.json`; older runs one
    `probes/<id>.json`. Both are read, keyed on `run.json.schemaVersion`."""

    def setUp(self):
        self.run_dir = Path(tempfile.mkdtemp())
        (self.run_dir / "probes").mkdir()

    def _header(self, version):
        (self.run_dir / "run.json").write_text(json.dumps({"schemaVersion": version}))

    def _attempt(self, probe_id, n, payload):
        folder = self.run_dir / "probes" / probe_id
        folder.mkdir(exist_ok=True)
        (folder / f"attempt-{n}.json").write_text(json.dumps({**payload, "attempt": n}))

    def test_v5_attempts_are_listed_and_loaded(self):
        self._header(5)
        for n in (1, 2, 10):
            self._attempt("p", n, V4)
        (self.run_dir / "probes" / "p" / "notes.txt").write_text("x")
        self.assertEqual(runs.probe_files(self.run_dir), ["p"])
        self.assertEqual(runs.attempt_numbers(self.run_dir, "p"), [1, 2, 10])
        self.assertEqual(runs.load_probe(self.run_dir, "p", 10)["attempt"], 10)
        self.assertIsNone(runs.load_probe(self.run_dir, "p", 3))

    def test_a_probe_dir_without_attempt_files_is_not_a_probe(self):
        self._header(5)
        self._attempt("p", 1, V4)
        (self.run_dir / "probes" / "empty").mkdir()
        np_only = self.run_dir / "probes" / "np"
        np_only.mkdir()
        (np_only / "not-possible.json").write_text("{}")
        (np_only / "attempt-x.json").write_text("{}")
        self.assertEqual(runs.probe_files(self.run_dir), ["p"])
        self.assertEqual(runs.attempt_numbers(self.run_dir, "np"), [])

    def test_a_corrupt_attempt_file_loads_as_none(self):
        self._header(5)
        self._attempt("p", 1, V4)
        (self.run_dir / "probes" / "p" / "attempt-2.json").write_text('{"attempt": 2, "trunc')
        self.assertEqual(runs.attempt_numbers(self.run_dir, "p"), [1, 2])
        self.assertIsNone(runs.load_probe(self.run_dir, "p", 2))
        self.assertEqual(runs.load_probe(self.run_dir, "p", 1)["attempt"], 1)

    def test_a_comparison_is_read_one_target_dir_at_a_time(self):
        # runs/<compareId>/targets/<t>/ is an ordinary run directory (v6).
        compare = self.run_dir / "cmp"
        (compare / "compare.json").parent.mkdir()
        (compare / "compare.json").write_text(json.dumps({"compareId": "cmp"}))
        for name in ("t", "h"):
            target = compare / "targets" / name
            (target / "probes" / "p").mkdir(parents=True)
            (target / "run.json").write_text(json.dumps({"schemaVersion": 6}))
            for n in (1, 2):
                (target / "probes" / "p" / f"attempt-{n}.json").write_text(json.dumps({"attempt": n}))
        target = compare / "targets" / "t"
        self.assertTrue(runs.uses_attempt_layout(target))
        self.assertEqual(runs.probe_files(target), ["p"])
        self.assertEqual(runs.attempt_numbers(target, "p"), [1, 2])
        self.assertEqual(runs.load_probe(target, "p", 2), {"attempt": 2})
        # Current behaviour, documented rather than endorsed: the history view
        # lists the COMPARE ROOT as one header-less run with no probes — it
        # does not descend into targets/. Rewrite this when the UI learns
        # comparisons.
        listed = {r.run_id: r for r in runs.list_runs(self.run_dir)}
        self.assertIsNone(listed["cmp"].header)
        self.assertEqual(listed["cmp"].probe_count, 0)
        self.assertEqual(runs.probe_files(compare), [])

    def test_a_target_dir_with_only_not_possible_lists_no_probe(self):
        # A notPossible task has no attempt, so the UI helpers do not list it;
        # only report.load_target reads not-possible.json.
        self._header(7)
        folder = self.run_dir / "probes" / "q"
        folder.mkdir()
        (folder / "not-possible.json").write_text(json.dumps({"outcome": "notPossible", "probeId": "q"}))
        self.assertTrue(runs.uses_attempt_layout(self.run_dir))
        self.assertEqual(runs.probe_files(self.run_dir), [])
        self.assertEqual(runs.attempt_numbers(self.run_dir, "q"), [])
        self.assertIsNone(runs.load_probe(self.run_dir, "q", 1))
        from runner import report
        target = report.load_target(self.run_dir, "h")
        self.assertEqual(target.probes["q"].attempts, [])
        self.assertEqual(target.probes["q"].not_possible["outcome"], "notPossible")

    def test_a_v4_run_is_one_attempt_per_probe(self):
        self._header(4)
        (self.run_dir / "probes" / "p.json").write_text(json.dumps(V4))
        self.assertEqual(runs.probe_files(self.run_dir), ["p"])
        self.assertEqual(runs.attempt_numbers(self.run_dir, "p"), [1])
        self.assertEqual(runs.load_probe(self.run_dir, "p")["finalAnswer"], "listo")
        self.assertIsNone(runs.load_probe(self.run_dir, "p", 2))

    def test_without_a_header_the_disk_decides(self):
        self._attempt("p", 1, V4)
        self.assertTrue(runs.uses_attempt_layout(self.run_dir))
        self.assertEqual(runs.attempt_numbers(self.run_dir, "p"), [1])

    def test_the_header_is_read_once_per_run(self):
        self._header(5)
        reads = []
        real = Path.read_text

        def counting(path, *a, **k):
            if path.name == "run.json":
                reads.append(path)
            return real(path, *a, **k)

        with mock.patch.object(Path, "read_text", counting):
            for _ in range(3):
                self.assertTrue(runs.uses_attempt_layout(self.run_dir))
        self.assertEqual(len(reads), 1)

    def test_a_guess_from_disk_is_not_cached(self):
        # No header yet and no probe dirs: old layout, for now.
        self.assertFalse(runs.uses_attempt_layout(self.run_dir))
        self._header(5)
        self.assertTrue(runs.uses_attempt_layout(self.run_dir))

    def test_list_runs_counts_probes_not_attempts(self):
        self._header(5)
        self._attempt("p", 1, V4)
        self._attempt("p", 2, V4)
        self._attempt("q", 1, V4)
        summary = runs.list_runs(self.run_dir.parent)
        mine = next(r for r in summary if r.path == self.run_dir)
        self.assertEqual(mine.probe_count, 2)

    def test_live_state_keeps_attempts_apart(self):
        events = [
            {"t": "run_started", "probes": 1, "repeat": 2},
            {"t": "probe_started", "probe": "p", "attempt": 1},
            {"t": "probe_finished", "probe": "p", "attempt": 1, "outcome": "OKAY"},
            {"t": "probe_started", "probe": "p", "attempt": 2},
            {"t": "tool_call", "probe": "p", "attempt": 2, "tool": "x", "id": "c"},
        ]
        state = runs.live_state(events)
        self.assertEqual(state.expected_probes, 2)
        self.assertEqual(list(state.probes), ["p · a1", "p · a2"])
        self.assertEqual(state.probes["p · a1"].state, "OKAY")
        self.assertEqual(len(state.probes["p · a2"].calls), 1)
        self.assertEqual(state.current, "p · a2")

    def test_live_state_of_a_single_attempt_run_is_unchanged(self):
        state = runs.live_state([
            {"t": "run_started", "probes": 1},
            {"t": "probe_started", "probe": "p", "attempt": 1},
        ])
        self.assertEqual(list(state.probes), ["p"])


if __name__ == "__main__":
    unittest.main()
