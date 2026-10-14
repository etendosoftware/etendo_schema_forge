"""Setup/teardown steps (D41): loader, reference resolution and the step runner.

Run with `cd mcp-tests && uv run python -m unittest discover -s tests`.

@covers mcp-tests/runner/steps.py
@covers mcp-tests/runner/suite.py
"""

from __future__ import annotations

import asyncio
import tempfile
import textwrap
import unittest
from pathlib import Path

from runner.steps import StepError, parse_steps, resolve_refs, run_steps
from runner.suite import attempt_marker, interpolate, interpolate_args, load_suite


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
                  - tool: etendo_create
                    args: { spec: s, data: { description: "{{marker}}" } }
                    saveAs: invoice
                teardown:
                  - tool: etendo_delete
                    args: { spec: s, id: "{{steps.invoice.id}}" }
                  - tool: etendo_action
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

    def test_exclusive_must_be_a_boolean(self):
        for value in ('"yes"', "1", "[true]"):
            with self.subTest(exclusive=value), self.assertRaisesRegex(ValueError, "exclusive must be true or false"):
                load_suite(_suite(f"""
                    probes:
                      - id: p
                        prompt: hi
                        exclusive: {value}
                """))
        probe = load_suite(_suite("""
            probes:
              - id: p
                prompt: hi
                exclusive: true
        """)).probe("p")
        self.assertTrue(probe.exclusive)

    def test_decision_must_be_a_mapping(self):
        for value in ("1", "[ruleVersion]", '"strict"'):
            with self.subTest(decision=value), self.assertRaisesRegex(ValueError, "decision must be a mapping"):
                load_suite(_suite(f"""
                    decision: {value}
                    probes:
                      - id: p
                        prompt: hi
                """))
        suite = load_suite(_suite("""
            decision: { ruleVersion: 1, callsMargin: 0.3 }
            probes:
              - id: p
                prompt: hi
        """))
        self.assertEqual(suite.decision, {"ruleVersion": 1, "callsMargin": 0.3})
        self.assertIsNone(load_suite(_suite("probes: [{id: p, prompt: hi}]")).decision)

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


class InterpolateTest(unittest.TestCase):
    KW = {"run_id": "R", "probe_id": "p", "timestamp": "T"}

    def test_the_default_marker_is_the_pre_repeat_form(self):
        # Backward compatible: a caller that passes no marker gets `<runId>-<probeId>`.
        self.assertEqual(interpolate("{{marker}}", **self.KW), "R-p")
        self.assertEqual(interpolate_args({"a": ["{{marker}}"]}, **self.KW), {"a": ["R-p"]})

    def test_an_attempt_marker_replaces_it_everywhere(self):
        marker = attempt_marker("R", "p", 2)
        self.assertEqual(marker, "R-p-a2")
        self.assertEqual(interpolate("{{marker}} {{runId}} {{probeId}} {{timestamp}}", marker=marker, **self.KW),
                         "R-p-a2 R p T")
        self.assertEqual(interpolate_args({"a": [{"b": "x-{{marker}}"}], "n": 3}, marker=marker, **self.KW),
                         {"a": [{"b": "x-R-p-a2"}], "n": 3})


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


V2 = """
schemaVersion: 2
window: w
probes:
  - id: q
    category: query
    prompt: "¿Cuánto debe la factura {{marker}}?"
    platforms:
      etendo-go:
        setup: [{ tool: etendo_create, args: { d: "{{marker}}" }, saveAs: inv }]
        expectAnswer: [{ number: 121, tolerance: 0.01 }]
        teardown: [{ tool: etendo_delete, args: { id: "{{steps.inv.id}}" } }]
      holded:
        notPossible: { kind: setup, reason: "no invoices", missingTools: [create_invoice] }
"""


class SuiteV2Test(unittest.TestCase):
    """Suite v2 (D45, D46, D49): per-platform blocks and a vendor-neutral prompt."""

    def _load(self, text):
        return load_suite(_suite(text))

    def test_a_probe_resolves_per_platform(self):
        suite = self._load(V2)
        self.assertEqual(suite.schema_version, 2)
        probe = suite.probes[0]
        etendo = probe.for_platform("etendo-go")
        self.assertEqual([s.tool for s in etendo.setup], ["etendo_create"])
        self.assertEqual(etendo.expect_answer, [{"number": 121, "tolerance": 0.01}])
        self.assertIsNone(etendo.not_possible)
        holded = probe.for_platform("holded")
        self.assertEqual(holded.setup, ())
        self.assertEqual(holded.not_possible.to_json(),
                         {"kind": "setup", "reason": "no invoices", "missingTools": ["create_invoice"]})
        with self.assertRaises(KeyError):
            probe.for_platform("other")

    def test_the_worked_example_loads(self):
        suite = load_suite(Path(__file__).resolve().parent.parent / "suites/examples/collect-invoice.v2.yaml")
        self.assertEqual([p.id for p in suite.probes],
                         ["collect-full-sales-invoice", "example-invoice-outstanding",
                          "overpay-purchase-invoice"])
        refusal = suite.probes[2].for_platform("etendo-go")
        self.assertEqual((refusal.expect_outcome, refusal.expect_effect.expect), ("refused", "none"))
        self.assertIsNotNone(suite.probes[0].for_platform("holded").not_possible)

    def test_v1_suites_load_unchanged(self):
        root = Path(__file__).resolve().parent.parent / "suites"
        for path in sorted(root.glob("*.yaml")):
            suite = load_suite(path)
            self.assertEqual(suite.schema_version, 1, path.name)
            for probe in suite.probes:
                self.assertIsNone(probe.platforms)
                self.assertIs(probe.for_platform("etendo-go"), probe)

    def _rejects(self, fragment, message):
        with self.assertRaises(ValueError) as ctx:
            self._load(fragment)
        self.assertIn(message, str(ctx.exception))

    def test_a_prompt_naming_a_tool_is_refused(self):
        self._rejects(V2.replace("¿Cuánto debe", "Usá etendo_list: ¿cuánto debe"), "names tool")
        self._rejects(V2.replace("¿Cuánto debe", "Sin create_invoice, ¿cuánto debe"), "create_invoice")

    def test_the_tool_lint_ignores_case(self):
        self._rejects(V2.replace("¿Cuánto debe", "Usá Etendo_List: ¿cuánto debe"), "Etendo_List")
        self._rejects(V2.replace("¿Cuánto debe", "Sin CREATE_INVOICE, ¿cuánto debe"), "create_invoice")
        from runner.suite import prompt_tool_mentions
        self.assertEqual(prompt_tool_mentions("usa List_Sales_Orders", ["list_sales_orders"]),
                         ["list_sales_orders"])
        # Whole words only: a tool name inside a longer word is not a mention.
        self.assertEqual(prompt_tool_mentions("relist_sales_orders_x", ["list_sales_orders"]), [])

    def test_every_platform_block_verifies_or_is_not_possible(self):
        self._rejects(V2.replace("        expectAnswer: [{ number: 121, tolerance: 0.01 }]\n", ""),
                      "declares no verification")

    def test_block_validation(self):
        self._rejects(V2.replace("category: query", "category: chat"), "category")
        self._rejects(V2.replace("kind: setup", "kind: maybe"), "notPossible.kind")
        self._rejects(V2.replace('reason: "no invoices"', 'reason: ""'), "reason")
        self._rejects(V2.replace("      holded:", "      sap:"), "unknown platform")
        self._rejects(V2.replace("[{ number: 121, tolerance: 0.01 }]", "[{ amount: 121 }]"), "exactly one")
        self._rejects(V2.replace("    platforms:", "    expectOutcome: refused\n    platforms:"),
                      "belongs inside")
        self._rejects(V2.replace("expectAnswer: [{ number: 121, tolerance: 0.01 }]",
                                 "expectOutcome: accepted"), "refused")
        self._rejects(V2.replace("{{marker}}?", "{{fixture.customer.name}}?"), "S6")
        self._rejects(V2.replace("schemaVersion: 2", "schemaVersion: 3"), "not supported")

    def test_a_write_refusal_must_prove_no_effect(self):
        refusal = V2.replace("    category: query\n", "    category: error\n    mode: write\n").replace(
            "        expectAnswer: [{ number: 121, tolerance: 0.01 }]",
            "        expectOutcome: refused")
        self._rejects(refusal, "needs expectEffect with expect: none")
        self._rejects(refusal.replace(
            "        expectOutcome: refused",
            "        expectOutcome: refused\n        expectEffect: { tool: etendo_list, args: {}, expect: atLeastOne }"),
            "contradictory")
        ok = self._load(refusal.replace(
            "        expectOutcome: refused",
            "        expectOutcome: refused\n        expectEffect: { tool: etendo_list, args: {}, expect: none }"))
        self.assertEqual(ok.probes[0].for_platform("etendo-go").expect_outcome, "refused")

    def test_a_read_refusal_may_rest_on_the_report(self):
        read = V2.replace("    category: query\n", "    category: error\n").replace(
            "        expectAnswer: [{ number: 121, tolerance: 0.01 }]", "        expectOutcome: refused")
        self.assertEqual(self._load(read).probes[0].for_platform("etendo-go").expect_outcome, "refused")

    def test_a_small_number_needs_an_anchor(self):
        self._rejects(V2.replace("[{ number: 121, tolerance: 0.01 }]", "[{ number: 3 }]"), "near:")
        anchored = self._load(V2.replace("[{ number: 121, tolerance: 0.01 }]",
                                         '[{ number: 3, near: "unidades" }]'))
        self.assertEqual(anchored.probes[0].for_platform("etendo-go").expect_answer,
                         [{"number": 3, "near": "unidades"}])

    def test_where_is_v2_only(self):
        v1 = """
        probes:
          - id: p
            mode: write
            prompt: hola
            expectEffect: { tool: t, args: {}, where: { a: 1 } }
        """
        self._rejects(v1, "where")


if __name__ == "__main__":
    unittest.main()
