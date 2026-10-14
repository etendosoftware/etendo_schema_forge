"""`ui/runs.py` reads probe files of every run schema version (D14).

@covers mcp-tests/ui/runs.py
"""

from __future__ import annotations

import json
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
