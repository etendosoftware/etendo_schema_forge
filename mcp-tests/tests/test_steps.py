"""Setup/teardown steps (D41): loader, reference resolution and the step runner.

Run with `cd mcp-tests && uv run python -m unittest discover -s tests`.
"""

from __future__ import annotations

import asyncio
import tempfile
import textwrap
import unittest
from pathlib import Path

from runner.steps import StepError, parse_steps, resolve_refs, run_steps
from runner.suite import load_suite


def _suite(text: str) -> Path:
    handle = tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False, encoding="utf-8")
    handle.write(textwrap.dedent(text))
    handle.close()
    return Path(handle.name)


class LoaderTest(unittest.TestCase):
    def test_parses_setup_and_teardown(self):
        suite = load_suite(_suite("""
            window: w
            probes:
              - id: p
                mode: write
                prompt: hi
                setup:
                  - tool: neo_create
                    args: { spec: s, data: { description: "{{marker}}" } }
                    saveAs: invoice
                teardown:
                  - tool: neo_delete
                    args: { spec: s, id: "{{steps.invoice.id}}" }
                  - tool: neo_action
                    forEach: "{{steps.payments.items}}"
                    args: { id: "{{item.id}}" }
        """))
        probe = suite.probe("p")
        self.assertEqual(len(probe.setup), 1)
        self.assertEqual(probe.setup[0].save_as, "invoice")
        self.assertEqual(probe.teardown[1].for_each, "{{steps.payments.items}}")

    def test_a_probe_without_steps_has_empty_tuples(self):
        probe = load_suite(_suite("""
            probes:
              - id: p
                prompt: hi
        """)).probe("p")
        self.assertEqual(probe.setup, ())
        self.assertEqual(probe.teardown, ())

    def test_rejects_a_step_without_tool(self):
        with self.assertRaisesRegex(ValueError, r"setup\[0\] needs a `tool`"):
            parse_steps([{"args": {}}], probe_id="p", phase="setup")

    def test_rejects_unknown_keys(self):
        with self.assertRaisesRegex(ValueError, "unknown key"):
            parse_steps([{"tool": "t", "saveas": "x"}], probe_id="p", phase="teardown")

    def test_rejects_a_non_list(self):
        with self.assertRaisesRegex(ValueError, "must be a list"):
            parse_steps({"tool": "t"}, probe_id="p", phase="setup")

    def test_foreach_must_be_a_single_reference(self):
        with self.assertRaisesRegex(ValueError, "forEach"):
            parse_steps([{"tool": "t", "forEach": "items"}], probe_id="p", phase="teardown")


class ResolveRefsTest(unittest.TestCase):
    saved = {"inv": {"data": [{"id": "A1", "total": 121.5}], "n": 2}}

    def test_whole_reference_keeps_its_type(self):
        self.assertEqual(resolve_refs("{{steps.inv.data.0.total}}", self.saved), 121.5)
        self.assertEqual(resolve_refs("{{steps.inv.data}}", self.saved), [{"id": "A1", "total": 121.5}])

    def test_embedded_reference_is_spliced_as_text(self):
        self.assertEqual(resolve_refs("id={{steps.inv.data.0.id}} n={{steps.inv.n}}", self.saved), "id=A1 n=2")

    def test_resolves_inside_nested_args(self):
        out = resolve_refs({"a": ["{{steps.inv.data.0.id}}"], "b": 3}, self.saved)
        self.assertEqual(out, {"a": ["A1"], "b": 3})

    def test_item_reference(self):
        self.assertEqual(resolve_refs("{{item.id}}", {}, {"id": "P9"}), "P9")
        self.assertEqual(resolve_refs("{{item}}", {}, "raw"), "raw")

    def test_leaves_run_tokens_alone(self):
        self.assertEqual(resolve_refs("{{marker}}", {}), "{{marker}}")

    def test_unknown_name_path_and_item_fail(self):
        with self.assertRaisesRegex(StepError, "no earlier step"):
            resolve_refs("{{steps.nope.id}}", self.saved)
        with self.assertRaisesRegex(StepError, "no 'id'"):
            resolve_refs("{{steps.inv.id}}", self.saved)
        with self.assertRaisesRegex(StepError, "outside a forEach"):
            resolve_refs("{{item.id}}", self.saved)


class FakeServer:
    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    async def __call__(self, tool, args):
        self.calls.append((tool, args))
        answer = self.answers.get(tool)
        if isinstance(answer, Exception):
            raise answer
        return answer


def _run(steps, server, *, phase, saved=None):
    saved = {} if saved is None else saved
    records = asyncio.run(run_steps(
        parse_steps(steps, probe_id="p", phase=phase), server,
        phase=phase, saved=saved, stop_on_error=phase == "setup", max_result_chars=10,
    ))
    return records, saved


class RunStepsTest(unittest.TestCase):
    def test_saved_result_feeds_a_later_step(self):
        server = FakeServer({"create": {"id": "INV1"}, "complete": {"ok": True}})
        records, saved = _run([
            {"tool": "create", "args": {}, "saveAs": "inv"},
            {"tool": "complete", "args": {"id": "{{steps.inv.id}}"}},
        ], server, phase="setup")
        self.assertEqual(server.calls[1], ("complete", {"id": "INV1"}))
        self.assertEqual(saved["inv"], {"id": "INV1"})
        self.assertTrue(all(r["ok"] for r in records))
        self.assertEqual(records[0]["saveAs"], "inv")

    def test_result_is_capped(self):
        server = FakeServer({"t": {"long": "x" * 50}})
        records, _ = _run([{"tool": "t"}], server, phase="setup")
        self.assertEqual(len(records[0]["result"]), 10)
        self.assertTrue(records[0]["resultTruncated"])

    def test_setup_stops_at_the_first_failure(self):
        server = FakeServer({"a": RuntimeError("boom"), "b": {}})
        records, _ = _run([{"tool": "a"}, {"tool": "b"}], server, phase="setup")
        self.assertEqual([c[0] for c in server.calls], ["a"])
        self.assertEqual(len(records), 1)
        self.assertFalse(records[0]["ok"])
        self.assertIn("boom", records[0]["error"])

    def test_teardown_keeps_going_after_a_failure(self):
        server = FakeServer({"a": RuntimeError("boom"), "b": {}})
        records, _ = _run([{"tool": "a"}, {"tool": "b"}], server, phase="teardown")
        self.assertEqual([c[0] for c in server.calls], ["a", "b"])
        self.assertEqual([r["ok"] for r in records], [False, True])

    def test_unresolved_reference_never_calls_the_server(self):
        server = FakeServer({"del": {}})
        records, _ = _run([{"tool": "del", "args": {"id": "{{steps.inv.id}}"}}], server, phase="teardown")
        self.assertEqual(server.calls, [])
        self.assertFalse(records[0]["ok"])

    def test_foreach_runs_once_per_element(self):
        saved = {"pays": {"items": [{"id": "P1"}, {"id": "P2"}]}}
        server = FakeServer({"rm": {}})
        records, _ = _run([{"tool": "rm", "forEach": "{{steps.pays.items}}", "args": {"id": "{{item.id}}"}}],
                          server, phase="teardown", saved=saved)
        self.assertEqual(server.calls, [("rm", {"id": "P1"}), ("rm", {"id": "P2"})])
        self.assertEqual([r["forEachIndex"] for r in records], [0, 1])

    def test_foreach_over_an_empty_list_makes_no_call(self):
        server = FakeServer({"rm": {}})
        records, _ = _run([{"tool": "rm", "forEach": "{{steps.pays.items}}"}],
                          server, phase="teardown", saved={"pays": {"items": []}})
        self.assertEqual((records, server.calls), ([], []))

    def test_foreach_over_a_non_list_fails(self):
        records, _ = _run([{"tool": "rm", "forEach": "{{steps.pays}}"}],
                          FakeServer({}), phase="teardown", saved={"pays": {"items": []}})
        self.assertFalse(records[0]["ok"])
        self.assertIn("not a list", records[0]["error"])


if __name__ == "__main__":
    unittest.main()
