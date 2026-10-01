"""The runner around setup/teardown (D41): order, records, and teardown in `finally`.

Everything outside the runner is faked — the model, auth, the MCP session and
the agent — so these tests pin down only what cli.py does with the steps.
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import textwrap
import unittest
from contextlib import asynccontextmanager, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from runner import cli

SUITE = """
window: w
probes:
  - id: p
    mode: write
    prompt: "Cobrá la factura {{steps.inv.documentNo}} ({{marker}})"
    setup:
      - tool: neo_create
        args: { description: "{{marker}}" }
        saveAs: inv
    expectEffect:
      tool: neo_list
      args: { filters: { id: "{{steps.inv.id}}" } }
      expect: atLeastOne
    teardown:
      - tool: neo_delete
        args: { id: "{{steps.inv.id}}" }
"""

CONFIG = """
[provider]
model = "fake"
api_key_env = "MCP_TESTS_FAKE_KEY"
[targets.t]
url = "http://x/mcp"
auth = "bearer"
token_env = "MCP_TESTS_FAKE_TOKEN"
"""

OUTCOME = {
    "verdict": {"outcome": "OKAY", "summary": "done"},
    "toolCallCount": 3,
    "toolCalls": [],
}


class Harness:
    def __init__(self, tmp: Path, suite: str, *, agent=None, answers=None):
        self.tmp = tmp
        (tmp / "suite.yaml").write_text(textwrap.dedent(suite), encoding="utf-8")
        (tmp / "config.toml").write_text(CONFIG, encoding="utf-8")
        self.calls: list[tuple[str, dict]] = []
        self.order: list[str] = []
        self.prompts: list[str] = []
        self.answers = answers or {
            "neo_create": {"id": "INV1", "documentNo": "FV9"},
            "neo_list": {"totalRows": 1},
            "neo_delete": {},
        }
        self.agent = agent

    async def call_tool(self, session, name, args):
        self.calls.append((name, args))
        self.order.append(name)
        answer = self.answers[name]
        if isinstance(answer, Exception):
            raise answer
        return answer

    @asynccontextmanager
    async def session(self, target):
        yield object()

    async def run_probe(self, *, prompt, **_):
        self.order.append("agent")
        self.prompts.append(prompt)
        if self.agent:
            raise self.agent
        return dict(OUTCOME)

    def run(self) -> dict:
        async def no_model(_):
            return None

        runs = self.tmp / "runs"
        with mock.patch.dict(os.environ, {"MCP_TESTS_FAKE_KEY": "k", "MCP_TESTS_FAKE_TOKEN": "t"}), \
             mock.patch.object(cli, "RUNS_DIR", runs), \
             mock.patch.object(cli, "check_model", no_model), \
             mock.patch.object(cli, "preflight", lambda *a, **k: None), \
             mock.patch.object(cli, "mcp_session", self.session), \
             mock.patch.object(cli, "call_tool", self.call_tool), \
             mock.patch.object(cli, "run_probe", self.run_probe), \
             redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            cli.main(["--target", "t", "--suite", str(self.tmp / "suite.yaml"),
                      "--config", str(self.tmp / "config.toml"), "--no-interactive"])
        run_dir = next(runs.iterdir())
        self.events = [json.loads(line) for line in (run_dir / "events.ndjson").read_text().splitlines()]
        return json.loads((run_dir / "probes" / "p.json").read_text())


class CliStepsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_setup_agent_effect_teardown_in_order(self):
        h = Harness(self.tmp, SUITE)
        probe = h.run()
        self.assertEqual(h.order, ["neo_create", "agent", "neo_list", "neo_delete"])
        marker = f"{probe['runId']}-p"
        self.assertEqual(h.calls[0], ("neo_create", {"description": marker}))
        # Setup results reach the prompt, the effect check and teardown.
        self.assertEqual(h.prompts[0], f"Cobrá la factura FV9 ({marker})")
        self.assertEqual(probe["prompt"], h.prompts[0])
        self.assertEqual(h.calls[1], ("neo_list", {"filters": {"id": "INV1"}}))
        self.assertEqual(h.calls[2], ("neo_delete", {"id": "INV1"}))
        self.assertTrue(probe["effectVerified"])
        self.assertTrue(probe["teardownClean"])
        self.assertEqual([r["tool"] for r in probe["setup"]], ["neo_create"])
        self.assertEqual([r["tool"] for r in probe["teardown"]], ["neo_delete"])
        self.assertEqual(probe["schemaVersion"], 3)
        # Fixture calls are never counted as the agent's.
        self.assertEqual(probe["toolCallCount"], 3)
        types = [e["t"] for e in h.events]
        self.assertIn("setup_step", types)
        self.assertIn("teardown_step", types)
        self.assertNotIn("tool_call", types)

    def test_teardown_runs_when_the_agent_crashes(self):
        h = Harness(self.tmp, SUITE, agent=RuntimeError("agent died"))
        probe = h.run()
        self.assertEqual(h.order, ["neo_create", "agent", "neo_delete"])
        self.assertEqual(probe["harnessError"]["kind"], "provider")
        self.assertTrue(probe["teardownClean"])

    def test_failed_setup_skips_the_agent_but_still_tears_down(self):
        h = Harness(self.tmp, SUITE, answers={
            "neo_create": RuntimeError("no period"), "neo_list": {}, "neo_delete": {}})
        probe = h.run()
        # The agent never ran; teardown ran, and could not resolve the id it
        # needed, so it made NO call rather than a half-filled one.
        self.assertEqual(h.order, ["neo_create"])
        self.assertEqual(probe["harnessError"]["kind"], "setup")
        self.assertIn("no period", probe["harnessError"]["detail"])
        self.assertIsNone(probe["verdict"])
        self.assertFalse(probe["teardownClean"])
        self.assertIn("no earlier step", probe["teardown"][0]["error"])
        aborted = [e for e in h.events if e["t"] == "probe_aborted"]
        self.assertEqual(aborted[0]["kind"], "setup")

    def test_failed_teardown_is_recorded_not_raised(self):
        h = Harness(self.tmp, SUITE, answers={
            "neo_create": {"id": "INV1", "documentNo": "FV9"}, "neo_list": {"totalRows": 1},
            "neo_delete": RuntimeError("still referenced")})
        probe = h.run()
        self.assertFalse(probe["teardownClean"])
        self.assertEqual(probe["verdict"]["outcome"], "OKAY")
        self.assertIn("still referenced", probe["teardown"][0]["error"])

    def test_an_optional_teardown_failure_keeps_it_clean(self):
        h = Harness(self.tmp, SUITE.replace(
            "    teardown:\n",
            "    teardown:\n      - tool: neo_unpost\n        optional: true\n"), answers={
            "neo_create": {"id": "INV1", "documentNo": "FV9"}, "neo_list": {"totalRows": 1},
            "neo_unpost": RuntimeError("not posted"), "neo_delete": {}})
        probe = h.run()
        self.assertEqual(h.order[-2:], ["neo_unpost", "neo_delete"])
        self.assertFalse(probe["teardown"][0]["ok"])
        self.assertTrue(probe["teardownClean"])

    def test_a_probe_without_steps_is_unchanged(self):
        h = Harness(self.tmp, """
            probes:
              - id: p
                prompt: hola
        """)
        probe = h.run()
        self.assertEqual(h.order, ["agent"])
        self.assertEqual((probe["setup"], probe["teardown"], probe["teardownClean"]), ([], [], None))


if __name__ == "__main__":
    unittest.main()
