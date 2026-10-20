"""The runner around setup/teardown (D41): order, records, and teardown in `finally`.

Everything outside the runner is faked — the model, auth, the MCP session and
the agent — so these tests pin down only what cli.py does with the steps, and
with the run record around them (run schema v4: `silentWrong`, `server`,
`harness`).

@covers mcp-tests/runner/cli.py
@covers mcp-tests/runner/report.py
"""

from __future__ import annotations

import asyncio
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
from runner import fixture as fixtures
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
    "catalogue": {"sha": "ab" * 32, "toolCount": 28, "bytes": 58000},
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
        self.calls_by_target: dict[str, list] = {}
        self.prompts_by_target: dict[str, list] = {}

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
        self.calls_by_target.setdefault(session, []).append((name, args))
        self.order.append(name)
        answer = self.answers[name]
        if isinstance(answer, list):
            # One scripted answer per call, in order (attempts differ).
            answer = answer.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    @asynccontextmanager
    async def session(self, target):
        # The session stands for its target, so a comparison test can tell
        # which side a call went to.
        yield target["name"]

    async def run_probe(self, *, prompt, session=None, **_):
        self.order.append("agent")
        self.prompts.append(prompt)
        self.prompts_by_target.setdefault(session, []).append(prompt)
        outcome = self.agent.pop(0) if isinstance(self.agent, list) else self.agent
        if outcome:
            raise outcome
        return dict(OUTCOME)

    def run(self, *extra: str) -> dict | None:
        async def no_model(_):
            return None

        runs = self.tmp / "runs"
        self.stdout, self.stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"MCP_TESTS_FAKE_KEY": "k", "MCP_TESTS_FAKE_TOKEN": "t"}), \
             mock.patch.object(cli, "RUNS_DIR", runs), \
             mock.patch.object(fixtures, "FIXTURES_DIR", self.tmp / "fixtures"), \
             mock.patch.object(fixtures, "SEEDS_DIR", self.tmp / ".seeds"), \
             mock.patch.object(cli, "check_model", no_model), \
             mock.patch.object(cli, "preflight", self.preflight), \
             mock.patch.object(cli, "mcp_session", self.session), \
             mock.patch.object(cli, "call_tool", self.call_tool), \
             mock.patch.object(cli, "run_probe", self.run_probe), \
             mock.patch.object(cli, "describe_server", self.describe_server), \
             redirect_stdout(self.stdout), redirect_stderr(self.stderr):
            self.exit_code = cli.main(["--target", "t", "--suite", str(self.tmp / "suite.yaml"),
                                       "--config", str(self.tmp / "config.toml"), "--no-interactive",
                                       *extra])
        if not runs.exists():
            return None
        run_dir = next(runs.iterdir())
        self.events = [json.loads(line) for line in (run_dir / "events.ndjson").read_text().splitlines()]
        self.header = json.loads((run_dir / "run.json").read_text())
        self.run_dir = run_dir
        files = sorted((run_dir / "probes" / "p").glob("attempt-*.json"),
                       key=lambda f: int(f.stem.split("-")[1]))
        self.attempts = [json.loads(f.read_text()) for f in files]
        return self.attempts[0]


class CliStepsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_setup_agent_effect_teardown_in_order(self):
        h = Harness(self.tmp, SUITE)
        probe = h.run()
        self.assertEqual(h.order, ["etendo_create", "agent", "etendo_list", "etendo_delete"])
        marker = f"{probe['runId']}-p-a1"
        self.assertEqual(probe["marker"], marker)
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
        self.assertEqual(probe["schemaVersion"], 7)
        self.assertEqual((probe["attempt"], probe["replaces"]), (1, None))
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
        # Attempt 1, then its replacement (D43): each tears down its own records.
        self.assertEqual(h.order, ["etendo_create", "agent", "etendo_delete"] * 2)
        self.assertEqual(probe["harnessError"]["kind"], "provider")
        self.assertTrue(probe["teardownClean"])

    def test_failed_setup_skips_the_agent_but_still_tears_down(self):
        h = Harness(self.tmp, SUITE, answers={
            "etendo_create": RuntimeError("no period"), "etendo_list": {}, "etendo_delete": {}})
        probe = h.run()
        # The agent never ran; teardown ran, and could not resolve the id it
        # needed, so it made NO call rather than a half-filled one.
        self.assertEqual(h.order, ["etendo_create"] * 2)  # attempt 1 + its replacement
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
        self.assertEqual(h.header["schemaVersion"], 7)
        self.assertEqual(h.header["repeat"], 1)
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

    def test_repeat_writes_one_file_per_attempt_with_its_own_marker(self):
        h = Harness(self.tmp, SUITE)
        h.run("--repeat", "3")
        self.assertEqual([a["attempt"] for a in h.attempts], [1, 2, 3])
        markers = [a["marker"] for a in h.attempts]
        run_id = h.attempts[0]["runId"]
        self.assertEqual(markers, [f"{run_id}-p-a{n}" for n in (1, 2, 3)])
        # Each attempt's setup got its own marker; each teardown ran.
        creates = [args["description"] for name, args in h.calls if name == "etendo_create"]
        self.assertEqual(creates, markers)
        self.assertEqual(h.order.count("etendo_delete"), 3)
        self.assertEqual(h.header["repeat"], 3)
        started = [e for e in h.events if e["t"] == "probe_started"]
        self.assertEqual([e["attempt"] for e in started], [1, 2, 3])
        # Every probe-scoped event says which attempt it belongs to.
        scoped = [e for e in h.events if e.get("probe")]
        self.assertTrue(all("attempt" in e for e in scoped))

    def test_a_harness_error_is_replaced_and_capped(self):
        # Every attempt fails: N attempts plus at most N replacements.
        h = Harness(self.tmp, SUITE, agent=RuntimeError("agent died"))
        h.run("--repeat", "2")
        self.assertEqual([a["attempt"] for a in h.attempts], [1, 2, 3, 4])
        self.assertEqual([a["replaces"] for a in h.attempts], [None, None, 1, 2])
        self.assertTrue(all(a["harnessError"] for a in h.attempts))

    def test_a_measured_attempt_is_not_replaced(self):
        h = Harness(self.tmp, SUITE)
        h.run("--repeat", "2")
        self.assertEqual(len(h.attempts), 2)

    def test_a_preflight_failure_is_not_rescheduled(self):
        h = Harness(self.tmp, SUITE, preflight_error=cli.AuthError("no token"))
        h.run("--repeat", "3")
        self.assertEqual(len(h.attempts), 3)
        self.assertEqual([a["replaces"] for a in h.attempts], [None] * 3)

    def test_repeat_must_be_positive(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            cli.main(["--suite", "x", "--repeat", "0"])

    def test_a_replacement_that_succeeds_counts_and_names_its_attempt(self):
        # ok, error, error, then the two replacements succeed: N measured, and
        # each replacement names the attempt it stands in for.
        h = Harness(self.tmp, SUITE, agent=[None, RuntimeError("429"), RuntimeError("502"), None, None])
        h.run("--repeat", "3")
        self.assertEqual([a["attempt"] for a in h.attempts], [1, 2, 3, 4, 5])
        self.assertEqual([a["replaces"] for a in h.attempts], [None, None, None, 2, 3])
        measured = [a for a in h.attempts if not a["harnessError"]]
        self.assertEqual([a["attempt"] for a in measured], [1, 4, 5])
        self.assertEqual(len(measured), 3)
        # The errored attempts stay on file.
        self.assertEqual([a["harnessError"]["kind"] for a in h.attempts if a["harnessError"]],
                         ["provider", "provider"])
        # A replaced transient error still makes the run exit non-zero.
        self.assertEqual(h.exit_code, 1)

    def test_a_provider_rejection_stops_the_run_without_more_attempts(self):
        class Unauthorized(RuntimeError):
            status_code = 401

        # A second probe after p: the stop must reach it too.
        h = Harness(self.tmp, SUITE + "  - id: q\n    prompt: hola\n", agent=Unauthorized("bad key"))
        h.run("--repeat", "3")
        self.assertEqual(len(h.attempts), 1, "no further attempt after a 401")
        self.assertEqual(h.order.count("agent"), 1)
        self.assertFalse((h.run_dir / "probes" / "q").exists(), "no later probe either")
        # The one attempt still tore down what its setup created.
        self.assertEqual(h.order.count("etendo_delete"), 1)
        self.assertEqual([e["t"] for e in h.events][-1], "run_finished")
        self.assertEqual(h.exit_code, 1)

    def test_teardown_runs_on_a_replacement_whose_setup_fails(self):
        suite = """
            probes:
              - id: p
                mode: write
                prompt: "hola {{marker}}"
                setup:
                  - tool: etendo_create
                    args: { description: "{{marker}}" }
                teardown:
                  - tool: etendo_delete
                    args: { description: "{{marker}}" }
        """
        h = Harness(self.tmp, suite, agent=RuntimeError("agent died"), answers={
            "etendo_create": [{"id": "A"}, RuntimeError("no period")],
            "etendo_list": {}, "etendo_delete": {}})
        h.run("--repeat", "1")
        first, replacement = h.attempts
        self.assertEqual(replacement["replaces"], 1)
        self.assertEqual(replacement["harnessError"]["kind"], "setup")
        deletes = [args["description"] for name, args in h.calls if name == "etendo_delete"]
        self.assertEqual(deletes, [first["marker"], replacement["marker"]])
        self.assertTrue(replacement["teardownClean"])
        teardown_events = [e["attempt"] for e in h.events if e["t"] == "teardown_step"]
        self.assertEqual(teardown_events, [1, 2])

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



COMPARE_CONFIG = CONFIG + """
platform = "etendo-go"
[targets.h]
url = "http://h/mcp"
auth = "bearer"
token_env = "MCP_TESTS_FAKE_TOKEN"
platform = "holded"
concurrency = 1
"""


class CompareHarness(Harness):
    """`--targets t,h`: the same fakes, two targets, one compareId (D44)."""

    def __init__(self, tmp: Path, suite: str, *, config: str = COMPARE_CONFIG, **kw):
        super().__init__(tmp, suite, **kw)
        (tmp / "config.toml").write_text(config, encoding="utf-8")

    def compare(self, *extra: str):
        async def no_model(_):
            return None

        runs = self.tmp / "runs"
        self.stdout, self.stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, {"MCP_TESTS_FAKE_KEY": "k", "MCP_TESTS_FAKE_TOKEN": "t"}), \
             mock.patch.object(cli, "RUNS_DIR", runs), \
             mock.patch.object(fixtures, "FIXTURES_DIR", self.tmp / "fixtures"), \
             mock.patch.object(fixtures, "SEEDS_DIR", self.tmp / ".seeds"), \
             mock.patch.object(cli, "check_model", no_model), \
             mock.patch.object(cli, "preflight", self.preflight), \
             mock.patch.object(cli, "mcp_session", self.session), \
             mock.patch.object(cli, "call_tool", self.call_tool), \
             mock.patch.object(cli, "run_probe", self.run_probe), \
             mock.patch.object(cli, "describe_server", self.describe_server), \
             redirect_stdout(self.stdout), redirect_stderr(self.stderr):
            self.exit_code = cli.main(["--targets", "t,h", "--suite", str(self.tmp / "suite.yaml"),
                                       "--config", str(self.tmp / "config.toml"),
                                       "--no-interactive", *extra])
        if not runs.exists() or not any(runs.iterdir()):
            return None
        self.compare_dir = next(runs.iterdir())
        return json.loads((self.compare_dir / "compare.json").read_text())

    def attempts_of(self, target: str) -> list[dict]:
        folder = self.compare_dir / "targets" / target / "probes" / "p"
        files = sorted(folder.glob("attempt-*.json"), key=lambda f: int(f.stem.split("-")[1]))
        return [json.loads(f.read_text()) for f in files]


class CompareTest(unittest.TestCase):
    """The comparison orchestrator end to end, with fake MCPs and a fake agent."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_one_compare_id_one_run_per_target(self):
        h = CompareHarness(self.tmp, SUITE)
        compare = h.compare("--repeat", "2", "--seed", "7")
        self.assertEqual(h.exit_code, 0)
        cid = compare["compareId"]
        self.assertRegex(cid, r"^\d{8}T\d{6}-cmp-[0-9a-f]{4}$")
        self.assertEqual(sorted(p.name for p in (h.compare_dir / "targets").iterdir()), ["h", "t"])
        for name in ("t", "h"):
            run = json.loads((h.compare_dir / "targets" / name / "run.json").read_text())
            self.assertEqual((run["compareId"], run["runId"]), (cid, f"{cid}-{name}"))
            self.assertEqual(run["schedule"], {"seed": 7, "shuffled": True})
            self.assertEqual(len(h.attempts_of(name)), 2)

    def test_compare_json_carries_what_the_report_reads(self):
        h = CompareHarness(self.tmp, "decision: { ruleVersion: 1, callsMargin: 0.3 }\n" + SUITE)
        compare = h.compare("--repeat", "2", "--seed", "7", "--concurrency", "3", "--subject", "h")
        self.assertEqual(compare["subject"], "h")
        self.assertEqual(compare["repeat"], 2)
        self.assertEqual(compare["decision"], {"ruleVersion": 1, "callsMargin": 0.3})
        self.assertEqual(compare["probes"], ["p"])
        self.assertIsNotNone(compare["startedAt"])
        self.assertIsNotNone(compare["finishedAt"])
        self.assertEqual(compare["pins"]["seed"], 7)
        self.assertEqual(compare["pins"]["model"], "fake")
        targets = {t["name"]: t for t in compare["targets"]}
        self.assertEqual((targets["t"]["platform"], targets["h"]["platform"]), ("etendo-go", "holded"))
        # A target's own concurrency caps the global one.
        self.assertEqual((targets["t"]["concurrency"], targets["h"]["concurrency"]), (3, 1))
        self.assertEqual(targets["t"]["freshness"]["status"], "unknown")

    def test_markers_and_prompts_are_identical_across_targets(self):
        h = CompareHarness(self.tmp, SUITE)
        compare = h.compare("--repeat", "2")
        cid = compare["compareId"]
        for name in ("t", "h"):
            markers = sorted(a["marker"] for a in h.attempts_of(name))
            self.assertEqual(markers, [f"{cid}-p-a1", f"{cid}-p-a2"])
        self.assertEqual(sorted(h.prompts_by_target["t"]), sorted(h.prompts_by_target["h"]))

    def test_each_attempt_records_its_real_schedule(self):
        h = CompareHarness(self.tmp, SUITE)
        h.compare("--repeat", "2", "--concurrency", "2")
        for attempt in h.attempts_of("t"):
            self.assertRegex(attempt["startedAt"], r"T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
            self.assertLessEqual(attempt["startedAt"], attempt["finishedAt"])
            self.assertIn(attempt["workerSlot"], (0, 1))
        self.assertEqual({a["workerSlot"] for a in h.attempts_of("h")}, {0})

    def test_a_preflight_failure_on_one_target_aborts_everything(self):
        h = CompareHarness(self.tmp, SUITE, preflight_error=cli.AuthError("no token"))
        self.assertIsNone(h.compare())
        self.assertEqual(h.exit_code, 2)
        self.assertNotIn("agent", h.order)
        self.assertIn("aborted", h.stderr.getvalue())

    def test_an_unreadable_catalogue_aborts_everything(self):
        h = CompareHarness(self.tmp, SUITE, server=ConnectionError("refused"))
        self.assertIsNone(h.compare())
        self.assertEqual(h.exit_code, 2)
        self.assertEqual(h.order, [])

    def test_a_target_without_platform_is_refused(self):
        h = CompareHarness(self.tmp, SUITE, config=COMPARE_CONFIG.replace('platform = "holded"\n', ""))
        self.assertIsNone(h.compare())
        self.assertEqual(h.exit_code, 2)
        self.assertIn("platform", h.stderr.getvalue())

    def test_a_subject_outside_targets_is_refused(self):
        h = CompareHarness(self.tmp, SUITE)
        self.assertIsNone(h.compare("--subject", "x"))
        self.assertEqual(h.exit_code, 2)
        self.assertIn("--subject 'x' is not one of --targets", h.stderr.getvalue())
        self.assertEqual(h.described, 0)

    def test_a_subject_without_targets_is_a_usage_error(self):
        # `_run` is stubbed so a regression here can never reach a real model.
        with mock.patch.object(cli, "_run", mock.AsyncMock(return_value=0)) as run, \
             redirect_stderr(io.StringIO()) as err, self.assertRaises(SystemExit) as ctx:
            cli.main(["--suite", "x", "--subject", "t"])
        run.assert_not_called()
        self.assertEqual(ctx.exception.code, 2)
        self.assertIn("--subject needs --targets", err.getvalue())

    def test_login_with_targets_is_refused(self):
        h = CompareHarness(self.tmp, SUITE)
        self.assertIsNone(h.compare("--login"))
        self.assertEqual(h.exit_code, 2)
        self.assertIn("--login takes one --target", h.stderr.getvalue())
        self.assertEqual((h.described, h.order), (0, []))

    def test_an_unknown_rule_version_aborts_before_anything_is_written(self):
        h = CompareHarness(self.tmp, "decision: { ruleVersion: 99 }\n" + SUITE)
        preflights = []
        h.preflight = lambda *a, **k: preflights.append(a)
        self.assertIsNone(h.compare())
        self.assertEqual(h.exit_code, 2)
        self.assertIn("ruleVersion 99", h.stderr.getvalue())
        self.assertEqual((preflights, h.described, h.order), ([], 0, []))
        self.assertFalse((self.tmp / "runs").exists())

    def test_a_failing_report_keeps_the_run_and_its_exit_code(self):
        h = CompareHarness(self.tmp, SUITE, agent=RuntimeError("agent died"))
        with mock.patch("runner.report.write_summary", side_effect=ValueError("broken")):
            compare = h.compare("--repeat", "1")
        self.assertEqual(h.exit_code, 1, "the attempts' exit code, not the report's")
        self.assertIsNotNone(compare["finishedAt"])
        self.assertFalse((h.compare_dir / "summary.json").exists())
        self.assertEqual(len(h.attempts_of("t")), 2)  # attempt + its replacement
        self.assertIn("summary not written: ValueError: broken", h.stderr.getvalue())
        self.assertIn(f"make mcp-report RUN={compare['compareId']}", h.stderr.getvalue())

    def test_a_failing_report_on_a_clean_run_still_exits_zero(self):
        h = CompareHarness(self.tmp, SUITE)
        with mock.patch("runner.report.write_summary", side_effect=ValueError("broken")):
            h.compare("--repeat", "1")
        self.assertEqual(h.exit_code, 0)

    def test_no_report_skips_the_summary(self):
        h = CompareHarness(self.tmp, SUITE)
        with mock.patch("runner.report.write_summary") as write:
            h.compare("--repeat", "1", "--no-report")
        write.assert_not_called()
        self.assertFalse((h.compare_dir / "summary.json").exists())
        self.assertEqual(h.exit_code, 0)

    def test_with_one_slot_attempts_run_in_seeded_worklist_order(self):
        from runner.suite import load_suite

        suite = """
            probes:
              - id: a
                prompt: "{{marker}}"
              - id: b
                prompt: "{{marker}}"
              - id: c
                prompt: "{{marker}}"
        """
        h = CompareHarness(self.tmp, suite)
        compare = h.compare("--repeat", "3", "--seed", "11", "--concurrency", "1")
        cid = compare["compareId"]
        probes = load_suite(self.tmp / "suite.yaml").probes
        expected = [f"{cid}-{w.probe.id}-a{w.attempt}" for w in cli.build_worklist(probes, 3, 11)]
        self.assertNotEqual(expected, sorted(expected), "the seed must actually shuffle")
        self.assertEqual(h.prompts_by_target["t"], expected)
        self.assertEqual(h.prompts_by_target["h"], expected)

    def test_a_target_override_lowers_its_own_slots_only(self):
        suite = "probes:\n" + "".join(f"  - id: q{i}\n    prompt: hola\n" for i in range(4))
        # h asks for less than the global 3 and gets it; t asks for MORE and is
        # capped at 3 — an override lowers, never raises.
        config = COMPARE_CONFIG.replace("concurrency = 1", "concurrency = 2").replace(
            "[targets.t]", "[run]\nconcurrency = 3\n[targets.t]\nconcurrency = 5")
        h = CompareHarness(self.tmp, suite, config=config)
        live, peak = {}, {}
        plain = h.run_probe

        async def slow_probe(*, session=None, **kw):
            live[session] = live.get(session, 0) + 1
            peak[session] = max(peak.get(session, 0), live[session])
            await asyncio.sleep(0.01)
            live[session] -= 1
            return await plain(session=session, **kw)

        h.run_probe = slow_probe
        compare = h.compare("--repeat", "2", "--seed", "1")
        self.assertEqual(compare["schedule"]["concurrency"], 3)
        self.assertEqual({t["name"]: t["concurrency"] for t in compare["targets"]}, {"t": 3, "h": 2})
        self.assertEqual(peak, {"t": 3, "h": 2})
        for name, k in (("t", 3), ("h", 2)):
            run = json.loads((h.compare_dir / "targets" / name / "run.json").read_text())
            self.assertEqual(run["concurrency"], k)
            slots = {json.loads(f.read_text())["workerSlot"]
                     for f in (h.compare_dir / "targets" / name / "probes").glob("*/attempt-*.json")}
            self.assertEqual(slots, set(range(k)))

    def test_the_ui_reads_a_target_dir_of_a_comparison(self):
        from ui import runs

        h = CompareHarness(self.tmp, SUITE)
        h.compare("--repeat", "2")
        target_dir = h.compare_dir / "targets" / "t"
        self.assertEqual(runs.probe_files(target_dir), ["p"])
        self.assertEqual(runs.attempt_numbers(target_dir, "p"), [1, 2])
        self.assertEqual(runs.load_probe(target_dir, "p", 2)["attempt"], 2)

    def test_the_report_reads_what_the_comparison_wrote(self):
        from runner import report

        h = CompareHarness(self.tmp, SUITE)
        h.compare("--repeat", "2", "--seed", "3")
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        self.assertEqual((summary["kr"]["subject"], summary["kr"]["reference"]), ("t", "h"))
        self.assertEqual(summary["kr"]["evaluated"], 1)
        self.assertFalse(summary["official"])  # freshness unknown until S6
        self.assertEqual(summary["pins"]["targets"]["t"]["catalogueSha"], SERVER["catalogue"]["sha"])
        # And `make mcp-report` re-derives the same summary from the files.
        (h.compare_dir / "summary.json").unlink()
        with redirect_stdout(io.StringIO()):
            self.assertEqual(report.main(["report", str(h.compare_dir)]), 0)
        self.assertEqual(json.loads((h.compare_dir / "summary.json").read_text()), summary)


def _probe(pid: str, exclusive: bool = False):
    from runner.suite import Probe

    return Probe(id=pid, mode="read", prompt="x", exclusive=exclusive)


def _ctx(repeat: int = 1, preflight_error=None):
    return cli.AttemptContext(
        target={"name": "t"}, provider={}, run_id="r", run_dir=Path("."), events=None,
        max_steps=1, max_result_chars=1, repeat=repeat, marker_prefix="r", token_run_id="r",
        preflight_error=preflight_error,
    )


class SchedulerTest(unittest.TestCase):
    """`run_target`: the per-target pool (D44), with `run_attempt` faked."""

    def _schedule(self, probes, *, repeat=1, concurrency=1, seed=None, fail=lambda pid, n: None,
                  stop_on=None):
        live, peak, log = set(), [0], []

        async def fake_attempt(ctx, probe, attempt, replaces, *, slot=None):
            key = (probe.id, attempt)
            live.add(key)
            peak[0] = max(peak[0], len(live))
            log.append(("start", key, frozenset(live), slot))
            await asyncio.sleep(0.001)
            live.discard(key)
            error = fail(probe.id, attempt)
            record = {"probeId": probe.id, "attempt": attempt, "replaces": replaces,
                      "harnessError": error, "verdict": None if error else {"outcome": "OKAY"}}
            return record, stop_on == key

        async def no_wait(_seconds):
            return None

        with mock.patch.object(cli, "run_attempt", fake_attempt), \
             mock.patch.object(cli, "_backoff_sleep", no_wait):
            outcome = asyncio.run(cli.run_target(
                _ctx(repeat), probes, concurrency=concurrency, seed=seed))
        return outcome, peak[0], log

    def test_the_order_is_fixed_by_the_seed(self):
        probes = [_probe(f"p{i}") for i in range(5)]
        a = [(w.probe.id, w.attempt) for w in cli.build_worklist(probes, 3, 42)]
        b = [(w.probe.id, w.attempt) for w in cli.build_worklist(probes, 3, 42)]
        c = [(w.probe.id, w.attempt) for w in cli.build_worklist(probes, 3, 43)]
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertEqual(sorted(a), sorted(c))
        plain = [(w.probe.id, w.attempt) for w in cli.build_worklist(probes, 2, None)]
        self.assertEqual(plain[:3], [("p0", 1), ("p0", 2), ("p1", 1)])

    def test_concurrency_is_never_exceeded(self):
        outcome, peak, _ = self._schedule([_probe(f"p{i}") for i in range(6)], repeat=2, concurrency=3)
        self.assertEqual(len(outcome.records), 12)
        self.assertEqual(peak, 3)

    def test_an_exclusive_probe_runs_alone(self):
        probes = [_probe("a"), _probe("x", exclusive=True), _probe("b"), _probe("c")]
        _, _, log = self._schedule(probes, repeat=2, concurrency=4)
        for _event, key, live, _slot in log:
            if key[0] == "x":
                self.assertEqual(live, {key})
            else:
                self.assertFalse(any(k[0] == "x" for k in live))

    def test_a_failure_does_not_cancel_siblings_and_is_replaced(self):
        fail = lambda pid, n: {"kind": "rateLimited"} if (pid, n) == ("a", 1) else None  # noqa: E731
        outcome, _, _ = self._schedule([_probe("a"), _probe("b")], repeat=2, concurrency=4, fail=fail)
        got = sorted((r["probeId"], r["attempt"], r["replaces"]) for r in outcome.records)
        self.assertEqual(got, [("a", 1, None), ("a", 2, None), ("a", 3, 1), ("b", 1, None), ("b", 2, None)])

    def test_a_stop_lets_running_attempts_finish_and_starts_nothing_new(self):
        outcome, _, _ = self._schedule([_probe(f"p{i}") for i in range(4)], concurrency=2,
                                       stop_on=("p0", 1))
        self.assertTrue(outcome.stopped)
        self.assertEqual(sorted(r["probeId"] for r in outcome.records), ["p0", "p1"])

    def test_a_rate_limit_is_its_own_harness_error_kind(self):
        class Throttled(Exception):
            status_code = 429

        h = Harness(self.tmp if hasattr(self, "tmp") else Path(tempfile.mkdtemp()), SUITE,
                    agent=Throttled("slow down"))
        delays = []

        async def no_wait(seconds):
            delays.append(seconds)

        with mock.patch.object(cli, "_backoff_sleep", no_wait):
            h.run()
        self.assertEqual(len(delays), 1)  # backoff before the replacement
        self.assertEqual([a["harnessError"]["kind"] for a in h.attempts], ["rateLimited"] * 2)
        self.assertEqual(h.attempts[1]["replaces"], 1)

    def test_a_real_mcp_429_inside_a_task_group_is_rate_limited(self):
        import httpx

        request = httpx.Request("POST", "http://h/mcp")
        throttled = httpx.HTTPStatusError(
            "Client error '429 Too Many Requests'", request=request,
            response=httpx.Response(429, request=request))
        # No setup: the session that throttles is the agent's own.
        h = Harness(Path(tempfile.mkdtemp()), "probes:\n  - id: p\n    prompt: hola\n")

        @asynccontextmanager
        async def throttled_session(target):
            # How the streamable-HTTP transport surfaces it: an anyio task group.
            raise ExceptionGroup("unhandled errors in a TaskGroup", [throttled])
            yield  # pragma: no cover

        h.session = throttled_session

        async def no_wait(_seconds):
            return None

        with mock.patch.object(cli, "_backoff_sleep", no_wait):
            h.run()
        self.assertEqual([a["harnessError"]["kind"] for a in h.attempts], ["rateLimited"] * 2)
        self.assertIn("429", h.attempts[0]["harnessError"]["detail"])
        # A 500 from the same transport is not a rate limit.
        server_error = httpx.HTTPStatusError(
            "500", request=request, response=httpx.Response(500, request=request))
        self.assertFalse(cli._is_rate_limited(ExceptionGroup("g", [server_error])))
        self.assertTrue(cli._is_rate_limited(ExceptionGroup("g", [throttled])))


class _Throttled(Exception):
    """What a 429 looks like after the MCP transport: the status on `response`."""

    def __init__(self, message):
        super().__init__(message)
        self.response = type("R", (), {"status_code": 429})()


class _Events:
    def emit(self, *_a, **_k):
        pass


class CancellationAndBackoffTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_cancelling_the_pool_still_tears_down_and_records_it(self):
        from runner.suite import load_suite

        h = Harness(self.tmp, SUITE)
        started = asyncio.Event()

        async def hang(**_):
            started.set()
            await asyncio.sleep(3600)

        probe = load_suite(self.tmp / "suite.yaml").probes[0]
        ctx = cli.AttemptContext(
            target={"name": "t"}, provider={}, run_id="r", run_dir=self.tmp / "run",
            events=_Events(), max_steps=1, max_result_chars=100, repeat=1,
            marker_prefix="r", token_run_id="r",
        )

        async def scenario():
            task = asyncio.create_task(cli.run_target(ctx, [probe], concurrency=1))
            await started.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            # Teardown finished BEFORE the cancellation reached the caller —
            # not later, when asyncio.run would sweep up orphaned tasks.
            self.assertEqual(h.order, ["etendo_create", "etendo_delete"])

        with mock.patch.object(cli, "mcp_session", h.session), \
             mock.patch.object(cli, "call_tool", h.call_tool), \
             mock.patch.object(cli, "run_probe", hang), \
             redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            asyncio.run(scenario())

        self.assertEqual(h.order, ["etendo_create", "etendo_delete"])
        record = json.loads((self.tmp / "run" / "probes" / "p" / "attempt-1.json").read_text())
        self.assertEqual(record["harnessError"]["kind"], "cancelled")
        self.assertTrue(record["teardownClean"])

    def _run_with(self, kind):
        delays = []

        async def fake_sleep(seconds):
            delays.append(seconds)

        async def fake_attempt(ctx, probe, attempt, replaces, *, slot=None):
            error = {"kind": kind} if attempt == 1 else None
            return {"probeId": probe.id, "attempt": attempt, "harnessError": error,
                    "verdict": None if error else {"outcome": "OKAY"}}, False

        with mock.patch.object(cli, "run_attempt", fake_attempt), \
             mock.patch.object(cli, "_backoff_sleep", fake_sleep), \
             mock.patch.object(cli, "_backoff_jitter", lambda: 1.0):
            outcome = asyncio.run(cli.run_target(_ctx(1), [_probe("a")]))
        return outcome, delays

    def test_a_rate_limited_attempt_is_replaced_after_a_backoff(self):
        outcome, delays = self._run_with("rateLimited")
        self.assertEqual(len(outcome.records), 2)
        self.assertEqual(delays, [cli.RATE_LIMIT_BACKOFF_BASE])

    def test_other_harness_errors_are_replaced_at_once(self):
        _, delays = self._run_with("provider")
        self.assertEqual(delays, [])

    def test_the_backoff_grows_is_capped_and_jittered(self):
        with mock.patch.object(cli, "_backoff_jitter", lambda: 1.0):
            full = [cli.rate_limit_delay(n) for n in (1, 2, 3, 10)]
        self.assertEqual(full[:3], [2.0, 4.0, 8.0])
        self.assertEqual(full[3], cli.RATE_LIMIT_BACKOFF_CAP)
        with mock.patch.object(cli, "_backoff_jitter", lambda: 0.0):
            self.assertEqual(cli.rate_limit_delay(1), 1.0)

    def _throttled_harness(self, answers):
        h = Harness(self.tmp, SUITE, answers=answers)
        delays = []

        async def no_wait(seconds):
            delays.append(seconds)

        with mock.patch.object(cli, "_backoff_sleep", no_wait):
            h.run()
        return h, delays

    def test_a_429_in_setup_is_rate_limited_and_backed_off(self):
        h, delays = self._throttled_harness({
            "etendo_create": _Throttled("slow down"), "etendo_list": {}, "etendo_delete": {}})
        first = h.attempts[0]
        self.assertEqual(first["harnessError"]["kind"], "rateLimited")
        self.assertEqual(first["harnessError"]["phase"], "setup")
        self.assertTrue(first["setup"][0]["rateLimited"])
        self.assertEqual(h.attempts[1]["replaces"], 1)
        self.assertEqual(len(delays), 1)

    def test_a_429_in_the_effect_check_is_rate_limited(self):
        h, delays = self._throttled_harness({
            "etendo_create": {"id": "INV1", "documentNo": "FV9"},
            "etendo_list": _Throttled("slow down"), "etendo_delete": {}})
        self.assertEqual(h.attempts[0]["harnessError"]["kind"], "rateLimited")
        self.assertEqual(h.attempts[0]["harnessError"]["phase"], "effectCheck")
        self.assertEqual(len(delays), 1)

    def test_an_ordinary_setup_failure_keeps_its_kind(self):
        h, delays = self._throttled_harness({
            "etendo_create": RuntimeError("no period"), "etendo_list": {}, "etendo_delete": {}})
        self.assertEqual(h.attempts[0]["harnessError"], {
            "kind": "setup", "phase": "setup", "detail": h.attempts[0]["harnessError"]["detail"]})
        self.assertNotIn("rateLimited", h.attempts[0]["setup"][0])
        self.assertEqual(delays, [])

    def test_a_single_run_ignores_run_concurrency(self):
        h = Harness(self.tmp, SUITE)
        (self.tmp / "config.toml").write_text(CONFIG.replace("[targets.t]", "[run]\nconcurrency = 8\n[targets.t]"))
        h.run("--repeat", "2")
        self.assertEqual(h.header["concurrency"], 1)
        self.assertEqual({a["workerSlot"] for a in h.attempts}, {0})


V2_SUITE = """
schemaVersion: 2
window: w
probes:
  - id: q
    category: query
    prompt: "¿Cuánto me debe la factura {{marker}}?"
    platforms:
      etendo-go:
        setup: [{ tool: etendo_create, args: { description: "{{marker}}" }, saveAs: inv }]
        expectAnswer:
          all: [{ number: "{{steps.inv.total}}", tolerance: 0.01 }]
        teardown: [{ tool: etendo_delete, args: { id: "{{steps.inv.id}}" } }]
      holded:
        notPossible: { kind: setup, reason: "no invoices", missingTools: [create_invoice] }
  - id: w
    category: write
    mode: write
    prompt: "Hacé un pedido con referencia {{marker}}"
    platforms:
      etendo-go:
        expectEffect:
          tool: etendo_list
          args: { spec: sales-order }
          where: { description: "{{marker}}" }
          expect: atLeastOne
      holded:
        expectEffect:
          tool: list_sales_orders
          args: {}
          where: { notes: "{{marker}}" }
          expect: atLeastOne
"""


class V2Harness(CompareHarness):
    """Per-target catalogues and payloads, and an agent that answers."""

    def __init__(self, tmp, suite=V2_SUITE, *, holded_tools=("list_sales_orders",), answer="Debe 1.234,56 €",
                 **kw):
        super().__init__(tmp, suite, **kw)
        self.holded_tools = list(holded_tools)
        self.answer = answer
        self.answers = {
            "etendo_create": {"id": "INV1", "total": 1234.56},
            "etendo_delete": {},
            # The effect check reads every row back and the RUNNER filters (where:).
            "etendo_list": None,
            "list_sales_orders": None,
        }

    async def describe_server(self, target):
        tools = self.holded_tools if target["name"] == "h" else ["etendo_create", "etendo_list"]
        return {**SERVER, "tools": sorted(tools)}

    async def call_tool(self, session, name, args):
        if name in ("etendo_list", "list_sales_orders"):
            self.calls.append((name, args))
            markers = [p.split("referencia ")[-1] for p in self.prompts_by_target.get(session, [])]
            key = "description" if name == "etendo_list" else "notes"
            return {"data": [{key: m} for m in markers] + [{key: "someone-else"}]}
        return await super().call_tool(session, name, args)

    async def run_probe(self, *, prompt, session=None, **kw):
        await super().run_probe(prompt=prompt, session=session, **kw)
        return {**OUTCOME, "finalAnswer": self.answer}

    def attempts(self, target, probe):
        folder = self.compare_dir / "targets" / target / "probes" / probe
        return [json.loads(f.read_text()) for f in sorted(folder.glob("attempt-*.json"))]

    def not_possible(self, target, probe):
        path = self.compare_dir / "targets" / target / "probes" / probe / "not-possible.json"
        return json.loads(path.read_text()) if path.exists() else None


class SuiteV2CompareTest(unittest.TestCase):
    """Suite v2 through the comparison and into the report, with fakes (S5)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_not_possible_is_recorded_and_never_attempted(self):
        h = V2Harness(self.tmp)
        compare = h.compare("--repeat", "1", "--seed", "1")
        self.assertEqual(h.exit_code, 0)
        record = h.not_possible("h", "q")
        self.assertEqual(record["declaration"],
                         {"kind": "setup", "reason": "no invoices", "missingTools": ["create_invoice"]})
        self.assertEqual((record["check"], record["catalogueSha"]), ("ok", SERVER["catalogue"]["sha"]))
        self.assertEqual(h.attempts("h", "q"), [])
        self.assertIsNone(h.not_possible("t", "q"))
        self.assertEqual(compare["pins"]["matcherVersion"], 4)
        self.assertEqual(compare["suite"]["schemaVersion"], 2)

    def test_the_answer_decides_success_on_a_read(self):
        h = V2Harness(self.tmp)
        h.compare("--repeat", "1")
        attempt = h.attempts("t", "q")[0]
        self.assertEqual(attempt["platform"], "etendo-go")
        self.assertTrue(attempt["answerVerified"])
        self.assertTrue(attempt["success"])
        self.assertEqual(attempt["answerCheck"]["all"][0]["found"], ["1.234,56"])

    def test_a_wrong_answer_fails_and_an_okay_is_silent_wrong(self):
        h = V2Harness(self.tmp, answer="Debe 1.000 €")
        h.compare("--repeat", "1")
        attempt = h.attempts("t", "q")[0]
        self.assertEqual((attempt["answerVerified"], attempt["success"], attempt["silentWrong"]),
                         (False, False, True))

    def test_where_filters_rows_on_each_platform(self):
        h = V2Harness(self.tmp)
        h.compare("--repeat", "1")
        for target in ("t", "h"):
            attempt = h.attempts(target, "w")[0]
            self.assertTrue(attempt["effectVerified"], target)
            self.assertEqual(attempt["effectCheck"]["rows"], 1)  # someone-else's row is not counted
            self.assertTrue(attempt["success"])

    def test_a_tool_that_appeared_invalidates_the_declaration(self):
        h = V2Harness(self.tmp, holded_tools=("list_sales_orders", "create_invoice"))
        h.compare("--repeat", "1")
        record = h.not_possible("h", "q")
        self.assertEqual((record["check"], record["presentTools"]), ("invalidDeclaration", ["create_invoice"]))
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        row = next(r for r in summary["tasks"] if r["task"] == "q")
        self.assertNotEqual(row["decidedBy"], "0-capability")

    def test_a_declaration_without_missing_tools_is_unchecked(self):
        h = V2Harness(self.tmp, V2_SUITE.replace(", missingTools: [create_invoice]", ""))
        h.compare("--repeat", "1")
        self.assertEqual(h.not_possible("h", "q")["check"], "unchecked")

    def test_the_report_awards_capability_and_measures_the_rest(self):
        h = V2Harness(self.tmp)
        h.compare("--repeat", "2", "--seed", "4")
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        rows = {r["task"]: r for r in summary["tasks"]}
        self.assertEqual((rows["q"]["winner"], rows["q"]["decidedBy"]), ("subject", "0-capability"))
        self.assertEqual(rows["w"]["status"], "decided")
        self.assertEqual(summary["kr"]["evaluated"], 2)

    def test_the_summary_reports_catalogue_changes_against_the_previous_comparison(self):
        h = V2Harness(self.tmp, holded_tools=("list_sales_orders", "get_usage"))
        ids = iter(["20261014T0900-cmp-aaaa", "20261014T1000-cmp-bbbb"])
        with mock.patch.object(cli, "_new_compare_id", lambda _now: next(ids)):
            h.compare("--repeat", "1")
            self.assertEqual(h.exit_code, 0, h.stderr.getvalue())
            h.holded_tools = ["list_sales_orders", "create_invoice"]
            h.compare("--repeat", "1")
        self.assertEqual(h.exit_code, 0, h.stderr.getvalue())
        runs = self.tmp / "runs"
        first = json.loads((runs / "20261014T0900-cmp-aaaa" / "summary.json").read_text())
        self.assertEqual(first["catalogueChanges"]["h"]["status"], "noPrevious")
        changes = json.loads((runs / "20261014T1000-cmp-bbbb" / "summary.json").read_text())["catalogueChanges"]
        self.assertEqual((changes["h"]["status"], changes["h"]["previous"]), ("changed", "20261014T0900-cmp-aaaa"))
        self.assertEqual((changes["h"]["added"], changes["h"]["removed"]), (["create_invoice"], ["get_usage"]))
        self.assertEqual(changes["h"]["watched"],
                         [{"tool": "create_invoice", "change": "added", "namedBy": ["notPossible q"]}])
        self.assertEqual(changes["t"]["status"], "unchanged")
        self.assertIn("create_invoice added", (runs / "20261014T1000-cmp-bbbb" / "summary.md").read_text())

    def test_a_prompt_naming_a_live_tool_aborts(self):
        h = V2Harness(self.tmp, V2_SUITE.replace("Hacé un pedido", "Con approve_sales_order hacé un pedido"),
                      holded_tools=("list_sales_orders", "approve_sales_order"))
        self.assertIsNone(h.compare())
        self.assertEqual(h.exit_code, 2)
        self.assertIn("approve_sales_order", h.stderr.getvalue())
        self.assertNotIn("agent", h.order)

    def test_a_missing_platform_block_aborts(self):
        suite = V2_SUITE.split("  - id: w")[0] + """  - id: w
    category: error
    mode: read
    prompt: "Mostrame el pedido XYZ"
    platforms:
      etendo-go:
        expectOutcome: refused
"""
        h = V2Harness(self.tmp, suite)
        self.assertIsNone(h.compare())
        self.assertIn("platforms.holded", h.stderr.getvalue())

    def test_a_self_reported_success_is_listed_in_the_summary(self):
        suite = V2_SUITE + """  - id: e
    category: error
    prompt: "Mostrame el pedido XYZ-que-no-existe"
    platforms:
      etendo-go:
        expectOutcome: refused
      holded:
        expectOutcome: refused
"""
        h = V2Harness(self.tmp, suite)
        h.compare("--repeat", "1")
        attempt = h.attempts("t", "e")[0]
        self.assertEqual(attempt["successBasis"], "selfReport")
        self.assertEqual(h.attempts("t", "w")[0]["successBasis"], "objective")
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        self.assertEqual(summary["selfReportedSuccess"]["count"], 1)
        self.assertEqual({r["task"] for r in summary["selfReportedSuccess"]["tasks"]}, {"e"})
        self.assertIn("Success on the agent's word", (h.compare_dir / "summary.md").read_text())

    # --- S5 gaps -----------------------------------------------------------

    WHERE_SUITE = """
schemaVersion: 2
probes:
  - id: w
    category: write
    mode: write
    prompt: "Hac\u00e9 un pedido {{marker}}"
    platforms:
      etendo-go:
        setup: [{ tool: etendo_create, args: { description: "{{marker}}" }, saveAs: inv }]
        expectEffect:
          tool: etendo_list
          args: {}
          where: WHERE
          expect: EXPECT
      holded:
        notPossible: { kind: goal, reason: "no orders" }
"""

    def _where(self, where, expect="atLeastOne", rows=None):
        h = V2Harness(self.tmp, self.WHERE_SUITE.replace("WHERE", where).replace("EXPECT", expect))
        listed = rows if rows is not None else [{"id": "INV1", "status": {"code": "CO"}}, {"id": "other"}]

        async def call_tool(session, name, args):
            if name == "etendo_list":
                h.calls.append((name, args))
                return {"data": list(listed)}
            return await V2Harness.call_tool(h, session, name, args)

        h.call_tool = call_tool
        h.compare("--repeat", "1")
        return h, h.attempts("t", "w")

    def test_where_reads_a_setup_output(self):
        _h, attempts = self._where('{ id: "{{steps.inv.id}}", status.code: CO }')
        self.assertEqual(len(attempts), 1)
        self.assertTrue(attempts[0]["effectVerified"])
        self.assertEqual(attempts[0]["effectCheck"]["where"], {"id": "INV1", "status.code": "CO"})
        self.assertEqual(attempts[0]["effectCheck"]["rows"], 1)

    def test_where_with_an_unresolvable_ref_is_not_verifiable_and_replaced(self):
        _h, attempts = self._where('{ id: "{{steps.nope.id}}" }')
        self.assertEqual([a["harnessError"]["phase"] for a in attempts], ["effectCheck"] * 2)
        self.assertEqual(attempts[0]["harnessError"]["kind"], "verification")
        self.assertIsNone(attempts[0]["effectVerified"])
        self.assertEqual(attempts[1]["replaces"], 1)

    def test_where_on_a_path_no_row_has_is_not_verifiable(self):
        # A typo, or a vendor field that moved, must never read as "effect
        # absent": with expect: none that would pass a refusal in silence.
        for expect in ("atLeastOne", "none"):
            with self.subTest(expect=expect):
                _h, attempts = self._where('{ status.cod: CO }', expect=expect)
                self.assertEqual([a["harnessError"]["phase"] for a in attempts], ["effectCheck"] * 2)
                self.assertEqual(attempts[0]["harnessError"]["kind"], "verification")
                self.assertIn("status.cod", attempts[0]["harnessError"]["detail"])
                self.assertIsNone(attempts[0]["effectVerified"])

    def test_an_unresolvable_answer_ref_is_a_harness_error_and_replaced(self):
        h = V2Harness(self.tmp, V2_SUITE.replace("{{steps.inv.total}}", "{{steps.nope.total}}"))
        h.compare("--repeat", "1")
        attempts = h.attempts("t", "q")
        self.assertEqual(len(attempts), 2)
        self.assertEqual(attempts[0]["harnessError"]["phase"], "answerCheck")
        self.assertEqual(attempts[0]["harnessError"]["kind"], "verification")
        self.assertIn("nope", attempts[0]["harnessError"]["detail"])
        self.assertIsNone(attempts[0]["answerVerified"])
        self.assertIsNone(attempts[0]["success"])
        self.assertEqual(attempts[1]["replaces"], 1)
        self.assertEqual(h.exit_code, 1)

    def test_a_single_v2_run_needs_a_readable_catalogue(self):
        h = Harness(self.tmp, V2_SUITE, server=ConnectionError("refused"))
        (self.tmp / "config.toml").write_text(COMPARE_CONFIG, encoding="utf-8")
        self.assertIsNone(h.run())
        self.assertEqual(h.exit_code, 2)
        self.assertEqual(h.order, [])
        self.assertIn("A v2 suite needs the target's live catalogue: ConnectionError: refused", h.stderr.getvalue())

    def test_a_not_possible_probe_selected_alone(self):
        h = V2Harness(self.tmp)
        compare = h.compare("--repeat", "1", "--probe", "q")
        self.assertEqual(compare["probes"], ["q"])
        self.assertEqual(h.not_possible("h", "q")["check"], "ok")
        self.assertEqual(len(h.attempts("t", "q")), 1)
        self.assertFalse((h.compare_dir / "targets" / "t" / "probes" / "w").exists())
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        self.assertEqual([(r["task"], r["decidedBy"]) for r in summary["tasks"]], [("q", "0-capability")])

    def test_not_possible_on_the_etendo_side_is_a_reference_win(self):
        suite = V2_SUITE.split("  - id: w")[0].replace("""      etendo-go:
        setup: [{ tool: etendo_create, args: { description: "{{marker}}" }, saveAs: inv }]
        expectAnswer:
          all: [{ number: "{{steps.inv.total}}", tolerance: 0.01 }]
        teardown: [{ tool: etendo_delete, args: { id: "{{steps.inv.id}}" } }]
      holded:
        notPossible: { kind: setup, reason: "no invoices", missingTools: [create_invoice] }""",
            """      etendo-go:
        notPossible: { kind: goal, reason: "no such report" }
      holded:
        expectAnswer: [{ text: "Debe" }]""")
        h = V2Harness(self.tmp, suite)
        h.compare("--repeat", "1")
        self.assertEqual(h.not_possible("t", "q")["platform"], "etendo-go")
        self.assertEqual(h.not_possible("t", "q")["check"], "unchecked")
        self.assertEqual(h.attempts("t", "q"), [])
        self.assertEqual(len(h.attempts("h", "q")), 1)
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        row = summary["tasks"][0]
        self.assertEqual((row["winner"], row["decidedBy"]), ("reference", "0-capability"))
        self.assertEqual(summary["kr"]["referenceWins"]["byCapability"], 1)

    def test_not_possible_on_both_platforms_is_excluded(self):
        suite = V2_SUITE.split("  - id: w")[0].replace("""        setup: [{ tool: etendo_create, args: { description: "{{marker}}" }, saveAs: inv }]
        expectAnswer:
          all: [{ number: "{{steps.inv.total}}", tolerance: 0.01 }]
        teardown: [{ tool: etendo_delete, args: { id: "{{steps.inv.id}}" } }]
""", """        notPossible: { kind: goal, reason: "nobody does this" }
""")
        h = V2Harness(self.tmp, suite)
        h.compare("--repeat", "1")
        self.assertNotIn("agent", h.order)
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        self.assertEqual(summary["excluded"], [{"task": "q", "reason": "notPossible on both platforms (invalid task)"}])
        self.assertEqual(summary["kr"]["evaluated"], 0)
        self.assertEqual(h.exit_code, 0)

    def test_a_prompt_naming_a_live_tool_in_another_case_aborts(self):
        h = V2Harness(self.tmp, V2_SUITE.replace("Hacé un pedido", "Con APPROVE_Sales_Order hacé un pedido"),
                      holded_tools=("list_sales_orders", "approve_sales_order"))
        self.assertIsNone(h.compare())
        self.assertEqual(h.exit_code, 2)
        self.assertIn("approve_sales_order", h.stderr.getvalue())

    def test_a_v2_suite_needs_a_platform_in_a_single_run(self):
        h = Harness(self.tmp, V2_SUITE)
        self.assertIsNone(h.run())
        self.assertEqual(h.exit_code, 2)


FRESH_FIXTURE = """
schemaVersion: 1
name: base
records:
  customer:
    values: { name: "Cliente Paridad SL" }
platforms:
  etendo-go:
    customer:
      create: [{ tool: etendo_create, args: { spec: bp }, saveAs: bp }]
      id: "{{steps.bp.id}}"
      find: { tool: etendo_list, args: { spec: bp } }
      match: { name: "{{fixture.customer.name}}" }
  holded:
    customer:
      create: [{ tool: create_contact, args: { name: "{{fixture.customer.name}}" }, saveAs: c }]
      id: "{{steps.c.id}}"
      find: { tool: list_contacts }
      match: { name: "{{fixture.customer.name}}" }
"""

FRESH_CHECKLISTS = {
    "fresh.etendo-go.yaml": """
schemaVersion: 1
platform: etendo-go
allowlistCaptured: true
documents: [{ name: sales-invoice, tool: etendo_list, args: { spec: sales-invoice } }]
masterData: [{ name: bp, tool: etendo_list, args: { spec: bp }, key: name, baseline: [customer], allow: [] }]
""",
    "fresh.holded.yaml": """
schemaVersion: 1
platform: holded
allowlistCaptured: true
documents: [{ name: invoices, tool: list_invoices }]
masterData: [{ name: contacts, tool: list_contacts, key: name, baseline: [customer], allow: [] }]
""",
}


class FreshHarness(V2Harness):
    """A seeded pair: Etendo reads its baseline back; Holded's catalogue lacks list_contacts unless readable."""

    def __init__(self, tmp, *, seeded=("t", "h"), bp=None, holded_readable=False, **kw):
        suite = V2_SUITE.replace("window: w\n", "window: w\nfixture: base\n").replace(
            'args: { description: "{{marker}}" }, saveAs: inv',
            'args: { description: "{{marker}}", bp: "{{fixture.customer.id}}" }, saveAs: inv').replace(
            "Hacé un pedido con referencia", "Hacé un pedido para {{fixture.customer.name}} con referencia")
        super().__init__(tmp, suite, holded_tools=("list_sales_orders", "list_invoices", "create_contact"), **kw)
        fx = tmp / "fixtures"
        fx.mkdir(exist_ok=True)
        fixture_text, checklists = FRESH_FIXTURE, dict(FRESH_CHECKLISTS)
        if holded_readable:
            # A Holded whose MCP lists contacts. Neither the fixture nor the checklist is
            # edited — the live catalogue now offers list_contacts, so both checks run.
            self.holded_tools.append("list_contacts")
        (fx / "base.yaml").write_text(textwrap.dedent(fixture_text), encoding="utf-8")
        for name, text in checklists.items():
            (fx / name).write_text(textwrap.dedent(text), encoding="utf-8")
        self.bp = [{"id": "C1", "name": "Cliente Paridad SL"}] if bp is None else bp
        self.invoices = []
        with mock.patch.object(fixtures, "FIXTURES_DIR", fx), mock.patch.object(fixtures, "SEEDS_DIR", tmp / ".seeds"):
            fixture = fixtures.load_fixture("base")
            for name, url, records in (("t", "http://x/mcp", {"customer": "C1"}), ("h", "http://h/mcp", {"customer": "H1"})):
                if name not in seeded:
                    continue
                platform = "etendo-go" if name == "t" else "holded"
                manifest = {"complete": True, "url": url, "fixture": "base", "fixtureSha": fixture.sha,
                            "seedId": f"seed-{name}", "initializedAt": "2026-10-20T09:00:00Z", "records": records}
                baseline = asyncio.run(fixtures.verify_baseline(fixture, platform, self._read, manifest))
                fixtures.write_manifest(name, {**manifest, "fixtureHash": baseline["fixtureHash"]})
        self.calls.clear()  # the seed read-backs above are not the comparison's calls

    async def _read(self, tool, args):
        return await self.call_tool(None, tool, args)

    async def describe_server(self, target):
        server = await super().describe_server(target)
        if target["name"] == "t":
            server["tools"] = ["etendo_create", "etendo_list"]
        return server

    async def call_tool(self, session, name, args):
        if name == "etendo_list" and args.get("spec") == "bp":
            return {"data": [dict(r) for r in self.bp]}
        if name == "etendo_list" and args.get("spec") == "sales-invoice":
            return {"data": list(self.invoices)}
        if name == "list_invoices":
            return {"data": [], "has_more": False}
        if name == "list_contacts":
            self.calls.append((name, args))
            return {"data": [{"id": "H1", "name": "Cliente Paridad SL"}]}
        return await super().call_tool(session, name, args)


class FreshnessCompareTest(unittest.TestCase):
    """S6: baseline verify + freshness at compare preflight, with fake MCPs (plan §5.4, §5.9)."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_freshness_is_recorded_and_fixture_refs_bind_per_target(self):
        h = FreshHarness(self.tmp)
        compare = h.compare("--repeat", "1")
        self.assertEqual(h.exit_code, 0, h.stderr.getvalue())
        fresh = {t["name"]: t["freshness"] for t in compare["targets"]}
        self.assertEqual(fresh["t"]["status"], "fresh", fresh["t"]["details"])
        # Plan §9 q14: Holded lacks list_contacts, nothing else is wrong — fresh, and it says so.
        self.assertEqual(fresh["h"]["status"], "fresh", fresh["h"]["details"])
        self.assertEqual(fresh["h"]["unverifiable"], [
            {"check": "masterData", "entity": "contacts", "tool": "list_contacts", "reason": "tool not offered"},
            {"check": "baseline", "entity": "customer", "tool": "list_contacts", "reason": "tool not offered"}])
        self.assertEqual(fresh["t"]["unverifiable"], [])
        self.assertNotIn("list_contacts", [n for n, _a in h.calls])
        self.assertEqual((fresh["t"]["seedId"], fresh["t"]["initializedAt"]), ("seed-t", "2026-10-20T09:00:00Z"))
        self.assertEqual(compare["compareSchemaVersion"], 3)
        self.assertEqual(set(compare["pins"]["fixtureHashes"]), {"t", "h"})
        self.assertEqual(compare["pins"]["fixture"]["name"], "base")
        # The id is the target's own; the shared prompt names the neutral value only.
        create = next(a for n, a in h.calls if n == "etendo_create")
        self.assertEqual(create["bp"], "C1")
        self.assertIn("Cliente Paridad SL", h.attempts("t", "w")[0]["prompt"])
        self.assertEqual(h.attempts("t", "w")[0]["prompt"], h.attempts("h", "w")[0]["prompt"])
        summary = json.loads((h.compare_dir / "summary.json").read_text())
        self.assertTrue(summary["official"])
        self.assertEqual(summary["freshness"]["h"]["reasons"], [])
        headline = (h.compare_dir / "summary.md").read_text().splitlines()[0]
        self.assertTrue(headline.endswith("OFFICIAL — 2 entities not verifiable on h (tools not offered)"), headline)

    def test_tool_not_offered_plus_a_failed_read_is_unofficial(self):
        h = FreshHarness(self.tmp)
        original = h.call_tool

        async def failing(session, name, args):
            if name == "list_invoices":
                raise RuntimeError("503 upstream")
            return await original(session, name, args)

        h.call_tool = failing
        compare = h.compare("--repeat", "1")
        self.assertEqual(h.exit_code, 0, h.stderr.getvalue())
        self.assertEqual(compare["targets"][1]["freshness"]["status"], "unverified")
        self.assertFalse(json.loads((h.compare_dir / "summary.json").read_text())["official"])

    def test_official_only_when_both_targets_are_fresh(self):
        h = FreshHarness(self.tmp, holded_readable=True)
        compare = h.compare("--repeat", "1")
        self.assertEqual([t["freshness"]["status"] for t in compare["targets"]], ["fresh", "fresh"])
        self.assertTrue(json.loads((h.compare_dir / "summary.json").read_text())["official"])
        # Once the tool appears both checks run for real and nothing is left unverifiable.
        self.assertEqual(compare["targets"][1]["freshness"]["unverifiable"], [])
        self.assertIn("list_contacts", [n for n, _a in h.calls])
        self.assertTrue((h.compare_dir / "summary.md").read_text().splitlines()[0].endswith(" — OFFICIAL"))

    def test_a_missing_baseline_record_stops_the_comparison(self):
        h = FreshHarness(self.tmp)
        h.bp = []
        self.assertIsNone(h.compare("--repeat", "1"))
        self.assertEqual(h.exit_code, 2)
        self.assertIn("customer missing", h.stderr.getvalue())

    def test_an_unseeded_target_cannot_bind_its_ids(self):
        h = FreshHarness(self.tmp, seeded=("t",))
        # Holded runs probe w, whose prompt names a value only: fine. Make it
        # name the id in its own block and the unseeded side must refuse.
        h_suite = (self.tmp / "suite.yaml").read_text().replace(
            "where: { notes: \"{{marker}}\" }", "where: { notes: \"{{marker}}\", contact: \"{{fixture.customer.id}}\" }")
        (self.tmp / "suite.yaml").write_text(h_suite, encoding="utf-8")
        self.assertIsNone(h.compare("--repeat", "1"))
        self.assertEqual(h.exit_code, 2)
        self.assertIn("make mcp-seed", h.stderr.getvalue())

    def test_a_leftover_document_is_dirty_and_the_run_still_happens(self):
        h = FreshHarness(self.tmp)
        h.invoices = [{"id": "I9", "description": "a real customer invoice"}]
        compare = h.compare("--repeat", "1")
        self.assertEqual(h.exit_code, 0)
        self.assertEqual(compare["targets"][0]["freshness"]["status"], "dirty")


class AttemptSuccessTest(unittest.TestCase):
    """`cli.attempt_success`: item 1, objective, incl. the refusal rule (plan §5.5)."""

    def _probe(self, **kw):
        from runner.suite import ExpectEffect, Probe

        effect = ExpectEffect("t", {}, "none") if kw.pop("effect", False) else None
        return Probe(id="p", mode="write", prompt="x", expect_effect=effect, **kw)

    def test_every_declared_check_must_hold(self):
        probe = self._probe(effect=True, expect_answer=[{"text": "x"}])
        ok = {"outcome": "OKAY"}
        self.assertTrue(cli.attempt_success(probe, ok, True, True))
        self.assertFalse(cli.attempt_success(probe, ok, True, False))
        self.assertIsNone(cli.attempt_success(probe, ok, None, True))

    def test_a_refusal_succeeds_only_without_effect_and_without_okay(self):
        probe = self._probe(effect=True, expect_outcome="refused")
        self.assertTrue(cli.attempt_success(probe, {"outcome": "ERROR"}, True, None))
        self.assertFalse(cli.attempt_success(probe, {"outcome": "OKAY"}, True, None))
        self.assertFalse(cli.attempt_success(probe, {"outcome": "MIXED"}, False, None))
        bare = self._probe(expect_outcome="refused")
        self.assertTrue(cli.attempt_success(bare, {"outcome": "MIXED"}, None, None))

    def test_success_basis(self):
        self.assertEqual(cli.success_basis(self._probe(expect_outcome="refused"), True), "selfReport")
        self.assertEqual(cli.success_basis(self._probe(effect=True, expect_outcome="refused"), True),
                         "objective")
        self.assertEqual(cli.success_basis(
            self._probe(expect_outcome="refused", expect_answer={"none": [{"text": "aquí está"}]}),
            False), "objective")
        self.assertIsNone(cli.success_basis(self._probe(effect=True), None))

    def test_nothing_declared_is_not_verifiable(self):
        self.assertIsNone(cli.attempt_success(self._probe(), {"outcome": "OKAY"}, None, None))


if __name__ == "__main__":
    unittest.main()
