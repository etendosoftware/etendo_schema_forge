"""The runner around setup/teardown (D41): order, records, and teardown in `finally`.

Everything outside the runner is faked — the model, auth, the MCP session and
the agent — so these tests pin down only what cli.py does with the steps, and
with the run record around them (run schema v4: `silentWrong`, `server`,
`harness`).

@covers mcp-tests/runner/cli.py
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import tempfile
import textwrap
import unittest
from contextlib import asynccontextmanager, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from runner import cli
from runner.agent import ProbeAborted
from runner.mcp_client import AuthError

SUITE = """
window: w
probes:
  - id: p
    mode: write
    prompt: "Cobrá la factura {{steps.inv.documentNo}} ({{marker}})"
    setup:
      - tool: etendo_create
        args: { description: "{{marker}}" }
        saveAs: inv
    expectEffect:
      tool: etendo_list
      args: { filters: { id: "{{steps.inv.id}}" } }
      expect: atLeastOne
    teardown:
      - tool: etendo_delete
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

SERVER = {
    "serverInfo": {"name": "etendo-go", "version": "1.0.0"},
    "protocolVersion": "2025-06-18",
    "catalogue": {"sha": "ab" * 32, "toolCount": 28},
}

OUTCOME = {
    "verdict": {"outcome": "OKAY", "summary": "done"},
    "toolCallCount": 3,
    "toolCalls": [],
}


class Harness:
    def __init__(self, tmp: Path, suite: str, *, agent=None, answers=None, server=None,
                 preflight_error=None):
        self.tmp = tmp
        (tmp / "suite.yaml").write_text(textwrap.dedent(suite), encoding="utf-8")
        (tmp / "config.toml").write_text(CONFIG, encoding="utf-8")
        self.calls: list[tuple[str, dict]] = []
        self.order: list[str] = []
        self.prompts: list[str] = []
        self.answers = answers or {
            "etendo_create": {"id": "INV1", "documentNo": "FV9"},
            "etendo_list": {"totalRows": 1},
            "etendo_delete": {},
        }
        self.agent = agent
        self.server = server if server is not None else SERVER
        self.preflight_error = preflight_error
        self.described = 0

    def preflight(self, *_a, **_k):
        if self.preflight_error:
            raise self.preflight_error

    async def describe_server(self, target):
        self.described += 1
        if isinstance(self.server, Exception):
            raise self.server
        return dict(self.server)

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

    def run(self, *extra: str) -> dict | None:
        async def no_model(_):
            return None

        runs = self.tmp / "runs"
        self.stdout = io.StringIO()
        with mock.patch.dict(os.environ, {"MCP_TESTS_FAKE_KEY": "k", "MCP_TESTS_FAKE_TOKEN": "t"}), \
             mock.patch.object(cli, "RUNS_DIR", runs), \
             mock.patch.object(cli, "check_model", no_model), \
             mock.patch.object(cli, "preflight", self.preflight), \
             mock.patch.object(cli, "mcp_session", self.session), \
             mock.patch.object(cli, "call_tool", self.call_tool), \
             mock.patch.object(cli, "run_probe", self.run_probe), \
             mock.patch.object(cli, "describe_server", self.describe_server), \
             redirect_stdout(self.stdout), redirect_stderr(io.StringIO()):
            self.exit_code = cli.main(["--target", "t", "--suite", str(self.tmp / "suite.yaml"),
                                       "--config", str(self.tmp / "config.toml"), "--no-interactive",
                                       *extra])
        if not runs.exists():
            return None
        run_dir = next(runs.iterdir())
        self.events = [json.loads(line) for line in (run_dir / "events.ndjson").read_text().splitlines()]
        self.header = json.loads((run_dir / "run.json").read_text())
        return json.loads((run_dir / "probes" / "p.json").read_text())


class CliStepsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_setup_agent_effect_teardown_in_order(self):
        h = Harness(self.tmp, SUITE)
        probe = h.run()
        self.assertEqual(h.order, ["etendo_create", "agent", "etendo_list", "etendo_delete"])
        marker = f"{probe['runId']}-p"
        self.assertEqual(h.calls[0], ("etendo_create", {"description": marker}))
        # Setup results reach the prompt, the effect check and teardown.
        self.assertEqual(h.prompts[0], f"Cobrá la factura FV9 ({marker})")
        self.assertEqual(probe["prompt"], h.prompts[0])
        self.assertEqual(h.calls[1], ("etendo_list", {"filters": {"id": "INV1"}}))
        self.assertEqual(h.calls[2], ("etendo_delete", {"id": "INV1"}))
        self.assertTrue(probe["effectVerified"])
        self.assertTrue(probe["teardownClean"])
        self.assertEqual([r["tool"] for r in probe["setup"]], ["etendo_create"])
        self.assertEqual([r["tool"] for r in probe["teardown"]], ["etendo_delete"])
        self.assertEqual(probe["schemaVersion"], 4)
        self.assertFalse(probe["silentWrong"])
        # Fixture calls are never counted as the agent's.
        self.assertEqual(probe["toolCallCount"], 3)
        types = [e["t"] for e in h.events]
        self.assertIn("setup_step", types)
        self.assertIn("teardown_step", types)
        self.assertNotIn("tool_call", types)

    def test_teardown_runs_when_the_agent_crashes(self):
        h = Harness(self.tmp, SUITE, agent=RuntimeError("agent died"))
        probe = h.run()
        self.assertEqual(h.order, ["etendo_create", "agent", "etendo_delete"])
        self.assertEqual(probe["harnessError"]["kind"], "provider")
        self.assertTrue(probe["teardownClean"])

    def test_failed_setup_skips_the_agent_but_still_tears_down(self):
        h = Harness(self.tmp, SUITE, answers={
            "etendo_create": RuntimeError("no period"), "etendo_list": {}, "etendo_delete": {}})
        probe = h.run()
        # The agent never ran; teardown ran, and could not resolve the id it
        # needed, so it made NO call rather than a half-filled one.
        self.assertEqual(h.order, ["etendo_create"])
        self.assertEqual(probe["harnessError"]["kind"], "setup")
        self.assertIn("no period", probe["harnessError"]["detail"])
        self.assertIsNone(probe["verdict"])
        self.assertFalse(probe["teardownClean"])
        self.assertIn("no earlier step", probe["teardown"][0]["error"])
        aborted = [e for e in h.events if e["t"] == "probe_aborted"]
        self.assertEqual(aborted[0]["kind"], "setup")

    def test_failed_teardown_is_recorded_not_raised(self):
        h = Harness(self.tmp, SUITE, answers={
            "etendo_create": {"id": "INV1", "documentNo": "FV9"}, "etendo_list": {"totalRows": 1},
            "etendo_delete": RuntimeError("still referenced")})
        probe = h.run()
        self.assertFalse(probe["teardownClean"])
        self.assertEqual(probe["verdict"]["outcome"], "OKAY")
        self.assertIn("still referenced", probe["teardown"][0]["error"])

    def test_okay_with_the_effect_absent_is_persisted_as_silent_wrong(self):
        h = Harness(self.tmp, SUITE, answers={
            "etendo_create": {"id": "INV1", "documentNo": "FV9"}, "etendo_list": {"totalRows": 0},
            "etendo_delete": {}})
        probe = h.run()
        self.assertFalse(probe["effectVerified"])
        self.assertTrue(probe["silentWrong"])

    def test_silent_wrong_is_null_when_nothing_was_checked(self):
        h = Harness(self.tmp, SUITE, agent=RuntimeError("agent died"))
        self.assertIsNone(h.run()["silentWrong"])
        self.assertIsNone(cli._silent_wrong({"outcome": "OKAY"}, None))
        self.assertFalse(cli._silent_wrong({"outcome": "ERROR"}, False))

    def test_run_header_pins_the_server_and_the_harness(self):
        h = Harness(self.tmp, SUITE)
        h.run()
        self.assertEqual(h.header["schemaVersion"], 4)
        self.assertEqual(h.header["server"], {**SERVER, "error": None})
        self.assertIsNone(h.header["serverBuild"])
        self.assertIn("commit", h.header["harness"])
        self.assertIn("dirty", h.header["harness"])

    def test_an_unreadable_server_identity_is_recorded_not_fatal(self):
        h = Harness(self.tmp, SUITE, server=ConnectionError("refused"))
        probe = h.run()
        self.assertIsNone(h.header["server"]["catalogue"])
        self.assertEqual(h.header["server"]["error"]["kind"], "server")
        self.assertIn("refused", h.header["server"]["error"]["detail"])
        self.assertEqual(probe["verdict"]["outcome"], "OKAY")

    def test_a_failed_preflight_records_no_server_and_never_reads_it(self):
        h = Harness(self.tmp, SUITE, preflight_error=AuthError("token expired"))
        probe = h.run()
        self.assertEqual(h.described, 0)
        self.assertIsNone(h.header["server"])
        self.assertEqual(probe["harnessError"]["kind"], "auth")
        self.assertIsNone(probe["silentWrong"])
        self.assertIsNone(probe["usage"])

    def test_login_does_not_read_the_server(self):
        h = Harness(self.tmp, SUITE)
        self.assertIsNone(h.run("--login"))
        self.assertEqual(h.exit_code, 0)
        self.assertEqual(h.described, 0)

    def test_silent_wrong_is_null_when_the_effect_check_could_not_run(self):
        h = Harness(self.tmp, SUITE, answers={
            "etendo_create": {"id": "INV1", "documentNo": "FV9"},
            "etendo_list": RuntimeError("gateway down"), "etendo_delete": {}})
        probe = h.run()
        self.assertEqual(probe["verdict"]["outcome"], "OKAY")
        self.assertIsNone(probe["effectVerified"])
        self.assertEqual(probe["harnessError"]["kind"], "verification")
        self.assertIsNone(probe["silentWrong"])

    def test_a_salvaged_abort_keeps_the_loop_usage(self):
        loop = {"turns": 1, "turnsWithUsage": 1, "inputTokens": 10, "outputTokens": 2,
                "totalTokens": 12, "cachedInputTokens": None}
        partial = {"toolCallCount": 1, "toolCalls": [], "finalAnswer": None,
                   "usage": {"loop": loop, "report": None},
                   "servedModel": {"models": ["m"], "systemFingerprints": []}}
        h = Harness(self.tmp, SUITE, agent=ProbeAborted(RuntimeError("400"), partial))
        probe = h.run()
        self.assertEqual(probe["harnessError"]["kind"], "provider")
        self.assertIsNone(probe["verdict"])
        self.assertEqual(probe["usage"], {"loop": loop, "report": None})
        self.assertEqual(probe["servedModel"]["models"], ["m"])

    def test_a_wrapped_auth_failure_is_recorded_as_auth(self):
        # The connection wraps the cause (anyio task groups, `raise ... from`);
        # the kind follows the root cause, not the wrapper.
        wrapped = ExceptionGroup("unhandled errors in a TaskGroup", [AuthError("401 from server")])
        h = Harness(self.tmp, SUITE, server=wrapped)
        h.run()
        error = h.header["server"]["error"]
        self.assertEqual(set(error), {"kind", "detail"})
        self.assertEqual(error["kind"], "auth")
        self.assertIn("401 from server", error["detail"])

    def _banner(self, server):
        h = Harness(self.tmp, SUITE, server=server)
        h.run()
        return [line for line in h.stdout.getvalue().splitlines() if line.startswith("  server ")]

    def test_the_banner_names_the_server_and_its_catalogue(self):
        self.assertEqual(self._banner(SERVER),
                         [f"  server      etendo-go 1.0.0 · 28 tools · catalogue {'ab' * 6}"])

    def test_the_banner_prints_only_the_parts_the_server_sent(self):
        only_name = {**SERVER, "serverInfo": {"name": "holded", "version": None}}
        self.assertEqual(self._banner(only_name),
                         [f"  server      holded · 28 tools · catalogue {'ab' * 6}"])

    def test_the_banner_says_when_server_info_is_empty(self):
        anonymous = {**SERVER, "serverInfo": {"name": None, "version": None}}
        self.assertEqual(self._banner(anonymous), [
            f"  server      (serverInfo without name/version) · 28 tools · catalogue {'ab' * 6}"])

    def test_no_banner_when_the_server_could_not_be_read(self):
        self.assertEqual(self._banner(ConnectionError("refused")), [])

    def test_a_probe_without_steps_is_unchanged(self):
        h = Harness(self.tmp, """
            probes:
              - id: p
                prompt: hola
        """)
        probe = h.run()
        self.assertEqual(h.order, ["agent"])
        self.assertEqual((probe["setup"], probe["teardown"], probe["teardownClean"]), ([], [], None))


class HarnessRevisionTest(unittest.TestCase):
    def test_unknown_when_git_is_missing(self):
        with mock.patch.object(cli.subprocess, "run", side_effect=FileNotFoundError("git")):
            self.assertEqual(cli._harness_revision(), {"commit": None, "dirty": None})

    def test_unknown_when_git_fails(self):
        failed = subprocess.CompletedProcess(["git"], 128, stdout="", stderr="not a repo")
        with mock.patch.object(cli.subprocess, "run", return_value=failed):
            self.assertEqual(cli._harness_revision(), {"commit": None, "dirty": None})

    def _repo(self) -> Path:
        root = Path(tempfile.mkdtemp())
        git = lambda *a: subprocess.run(["git", *a], cwd=root, check=True, capture_output=True)  # noqa: E731
        git("init", "-q")
        git("config", "user.email", "t@t")
        git("config", "user.name", "t")
        harness = root / "mcp-tests"
        harness.mkdir()
        (harness / "a.py").write_text("x = 1\n")
        (root / "other.txt").write_text("o\n")
        git("add", ".")
        git("commit", "-q", "-m", "init")
        return root

    def test_clean_then_dirty_with_uncommitted_harness_changes(self):
        root = self._repo()
        harness = root / "mcp-tests"
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True,
                              text=True, check=True).stdout.strip()
        with mock.patch.object(cli, "HARNESS_ROOT", harness):
            self.assertEqual(cli._harness_revision(), {"commit": head, "dirty": False})
            # A change OUTSIDE mcp-tests/ does not make the harness dirty.
            (root / "other.txt").write_text("changed\n")
            self.assertFalse(cli._harness_revision()["dirty"])
            (harness / "a.py").write_text("x = 2\n")
            self.assertEqual(cli._harness_revision(), {"commit": head, "dirty": True})


if __name__ == "__main__":
    unittest.main()
