"""Baseline dataset, `{{fixture.*}}` refs and the freshness checks (plan §5.4, §5.9, D50 — S6).

@covers mcp-tests/runner/fixture.py
"""

from __future__ import annotations

import asyncio
import copy
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

from runner import fixture as fixtures
from runner.steps import Step
from runner.suite import load_suite

FIXTURE = """
schemaVersion: 1
name: base
records:
  customer:
    values: { name: "Cliente Paridad SL", taxId: "B1" }
  product:
    values: { name: "Servicio", sku: "SRV", price: 100 }
platforms:
  etendo-go:
    customer:
      create: [{ tool: etendo_create, args: { spec: bp, fields: { name: "{{fixture.customer.name}}" } }, saveAs: bp }]
      id: "{{steps.bp.data.0.id}}"
      find: { tool: etendo_list, args: { spec: bp } }
      match: { name: "{{fixture.customer.name}}" }
      expect: { taxID: "{{fixture.customer.taxId}}" }
    product:
      create: [{ tool: etendo_create, args: { spec: product, fields: { sku: "{{fixture.product.sku}}",
                 vendor: "{{fixture.customer.id}}" } }, saveAs: p }]
      id: "{{steps.p.data.0.id}}"
      find: { tool: etendo_list, args: { spec: product } }
      match: { searchKey: "{{fixture.product.sku}}" }
      expect: { price: "{{fixture.product.price}}" }
  holded:
    customer:
      create: [{ tool: create_contact, args: { name: "{{fixture.customer.name}}" }, saveAs: c }]
      id: "{{steps.c.id}}"
    product:
      create: [{ tool: create_product, args: { name: "{{fixture.product.name}}" }, saveAs: p }]
      id: "{{steps.p.id}}"
"""

CHECKLIST = """
schemaVersion: 1
platform: etendo-go
allowlistCaptured: true
documents:
  - { name: sales-order, tool: etendo_list, args: { spec: sales-order } }
masterData:
  - { name: bp, tool: etendo_list, args: { spec: bp }, key: name, baseline: [customer], allow: ["Init SA"] }
"""


class Env:
    """A fake Etendo MCP: the rows each `spec` lists, read by `etendo_list`."""

    def __init__(self, ids=("C1", "P1")):
        self.rows = {
            "bp": [{"id": ids[0], "name": "Cliente Paridad SL", "taxID": "B1"},
                   {"id": "I0", "name": "Init SA", "taxID": "X"}],
            "product": [{"id": ids[1], "searchKey": "SRV", "price": "100.00"}],
            "sales-order": [],
        }
        self.calls = []
        self.fail = set()

    async def call(self, tool, args):
        self.calls.append((tool, args))
        if tool in self.fail or args.get("spec") in self.fail:
            raise RuntimeError("boom")
        if tool == "etendo_list":
            return {"data": copy.deepcopy(self.rows[args["spec"]])}
        raise AssertionError(f"unexpected {tool}")


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "fixtures").mkdir()
        self.write("base.yaml", FIXTURE)
        self.write("fresh.etendo-go.yaml", CHECKLIST)
        patches = [mock.patch.object(fixtures, "FIXTURES_DIR", self.tmp / "fixtures"),
                   mock.patch.object(fixtures, "SEEDS_DIR", self.tmp / ".seeds")]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def write(self, name, text):
        (self.tmp / "fixtures" / name).write_text(textwrap.dedent(text), encoding="utf-8")

    def verify(self, env, manifest=None, platform="etendo-go", tools=None):
        return asyncio.run(fixtures.verify_baseline(fixtures.load_fixture("base"), platform, env.call, manifest,
                                                    tools=tools))


class LoadFixtureTest(FixtureCase):
    def test_the_shipped_baseline_and_checklists_load(self):
        with mock.patch.object(fixtures, "FIXTURES_DIR", fixtures.HARNESS_ROOT / "fixtures"):
            fx = fixtures.load_fixture("okr-baseline")
            self.assertEqual(set(fx.platforms), {"etendo-go", "holded"})
            for platform in fx.platforms:
                self.assertEqual(list(fx.platforms[platform]), list(fx.records))
                self.assertIsNotNone(fixtures.load_checklist(platform))

    def test_the_holded_checklist_names_the_tools_it_would_use(self):
        with mock.patch.object(fixtures, "FIXTURES_DIR", fixtures.HARNESS_ROOT / "fixtures"):
            checklist = fixtures.load_checklist("holded")
        would_use = {"list_contacts", "list_products", "list_sales_orders", "list_estimates",
                     "list_proformas", "list_purchase_orders", "list_waybills"}
        self.assertLessEqual(would_use, checklist.tools())
        master = {e["tool"]: e for e in checklist.master_data}
        self.assertEqual(master["list_contacts"]["baseline"], ["customer-paridad", "supplier-paridad"])
        self.assertEqual(master["list_products"]["baseline"], ["product-servicio"])

    def test_records_and_refs_are_validated(self):
        cases = {
            "missing on a platform": FIXTURE.replace("""    product:
      create: [{ tool: create_product""", """    productx:
      create: [{ tool: create_product"""),
            "a later record": FIXTURE.replace('{{fixture.customer.name}}" } }, saveAs: bp',
                                              '{{fixture.product.name}}" } }, saveAs: bp'),
            "own id": FIXTURE.replace('vendor: "{{fixture.customer.id}}"', 'vendor: "{{fixture.product.id}}"'),
            "unknown key": FIXTURE.replace("{{fixture.customer.taxId}}", "{{fixture.customer.vat}}"),
            "values with id": FIXTURE.replace('taxId: "B1" }', 'taxId: "B1", id: "x" }'),
            "find without match": FIXTURE.replace('      match: { name: "{{fixture.customer.name}}" }\n', ""),
            "id not a step ref": FIXTURE.replace('id: "{{steps.c.id}}"', 'id: "C1"'),
        }
        for why, text in cases.items():
            with self.subTest(why=why):
                self.write("bad.yaml", text)
                with self.assertRaises(ValueError):
                    fixtures.load_fixture("bad")

    def test_a_record_may_name_an_earlier_records_id(self):
        plan = fixtures.load_fixture("base").platforms["etendo-go"]["product"]
        step = fixtures.resolve(plan.create[0], {"customer": {"id": "C9", "name": "n"}, "product": {"sku": "S"}})
        self.assertEqual(step.args["fields"], {"sku": "S", "vendor": "C9"})


class SuiteRefsTest(FixtureCase):
    SUITE = """
    schemaVersion: 2
    window: w
    fixture: base
    probes:
      - id: q
        category: query
        prompt: "¿Cuánto debe {{fixture.customer.name}}?"
        platforms:
          etendo-go:
            setup: [{ tool: etendo_create, args: { bp: "{{fixture.customer.id}}", qty: 2 }, saveAs: inv }]
            expectAnswer: { all: [{ number: "{{fixture.product.price}}", tolerance: 0.01 }] }
          holded:
            notPossible: { kind: setup, reason: "no invoices", missingTools: [create_invoice] }
    """

    def load(self, text):
        path = self.tmp / "suite.yaml"
        path.write_text(textwrap.dedent(text), encoding="utf-8")
        return load_suite(path)

    def test_refs_resolve_per_target_keeping_types(self):
        suite = self.load(self.SUITE)
        self.assertEqual(suite.fixture.name, "base")
        probe = suite.probes[0].for_platform("etendo-go")
        resolved = fixtures.resolve(probe, suite.fixture.table({"customer": "C1", "product": "P1"}))
        self.assertEqual(resolved.prompt, "¿Cuánto debe Cliente Paridad SL?")
        self.assertEqual(resolved.setup[0].args, {"bp": "C1", "qty": 2})
        self.assertEqual(resolved.expect_answer["all"][0]["number"], 100)  # whole ref keeps the int
        self.assertIs(resolved.platforms, probe.platforms)  # the other platforms' blocks stay raw

    def test_an_unseeded_id_cannot_resolve(self):
        suite = self.load(self.SUITE)
        probe = suite.probes[0].for_platform("etendo-go")
        with self.assertRaises(fixtures.FixtureError):
            fixtures.resolve(probe, suite.fixture.table({}))

    def test_bad_refs_are_refused_at_load(self):
        cases = {
            "unknown record": self.SUITE.replace("{{fixture.customer.name}}?", "{{fixture.nobody.name}}?"),
            "unknown key": self.SUITE.replace("{{fixture.customer.name}}?", "{{fixture.customer.city}}?"),
            "id in the shared prompt": self.SUITE.replace("{{fixture.customer.name}}?", "{{fixture.customer.id}}?"),
            "no fixture declared": self.SUITE.replace("    fixture: base\n", ""),
            "a v1 suite": self.SUITE.replace("    schemaVersion: 2\n", ""),
        }
        for why, text in cases.items():
            with self.subTest(why=why), self.assertRaises(ValueError):
                self.load(text)


class VerifyBaselineTest(FixtureCase):
    def test_ok_records_their_ids_and_a_hash_without_ids(self):
        a = self.verify(Env(ids=("C1", "P1")))
        b = self.verify(Env(ids=("C2", "P2")))  # a re-initialized environment
        self.assertEqual(a["status"], "ok")
        self.assertEqual(a["ids"], {"customer": "C1", "product": "P1"})
        self.assertEqual(a["fixtureHash"], b["fixtureHash"])
        self.assertEqual(a["fixtureHash"], self.verify(Env(ids=("C1", "P1")))["fixtureHash"])

    def test_missing_duplicated_changed_replaced(self):
        env = Env()
        env.rows["bp"] = [r for r in env.rows["bp"] if r["id"] != "C1"]
        self.assertEqual(self.verify(env)["records"]["customer"]["status"], "missing")
        env = Env()
        env.rows["bp"].append({"id": "C1b", "name": "Cliente Paridad SL", "taxID": "B1"})
        result = self.verify(env)
        self.assertEqual((result["status"], result["records"]["customer"]["status"]), ("dirty", "duplicated"))
        env = Env()
        env.rows["product"][0]["price"] = "90.00"
        result = self.verify(env)
        self.assertEqual(result["records"]["product"]["status"], "changed")
        self.assertNotEqual(result["fixtureHash"], self.verify(Env())["fixtureHash"])
        replaced = self.verify(Env(), manifest={"records": {"customer": "OLD", "product": "P1"}})
        self.assertEqual(replaced["records"]["customer"]["status"], "replaced")
        self.assertEqual(replaced["status"], "dirty")

    def test_an_unreadable_record_is_unverified_never_ok(self):
        env = Env()
        env.fail.add("product")
        result = self.verify(env)
        self.assertEqual((result["status"], result["records"]["product"]["status"]), ("unverified", "unverified"))
        # No find on the platform: unverified, the id from the manifest.
        result = self.verify(Env(), manifest={"records": {"customer": "H1", "product": "H2"}}, platform="holded")
        self.assertEqual(result["status"], "unverified")
        self.assertEqual(result["ids"], {"customer": "H1", "product": "H2"})
        self.assertEqual(self.verify(Env(), platform="holded")["ids"], {"customer": None, "product": None})

    def test_a_find_tool_the_live_catalogue_lacks_is_not_called_until_it_is_offered(self):
        env = Env()
        result = self.verify(env, manifest={"records": {"customer": "C1", "product": "P1"}}, tools={"etendo_create"})
        self.assertEqual(result["status"], "unverified")
        customer = result["records"]["customer"]
        self.assertEqual((customer["status"], customer["reason"], customer["tool"]),
                         ("unverified", fixtures.TOOL_NOT_OFFERED, "etendo_list"))
        self.assertEqual(result["ids"], {"customer": "C1", "product": "P1"})  # from the manifest
        self.assertEqual(env.calls, [])
        # The vendor adds the tool: the same fixture, unedited, reads the record for real.
        result = self.verify(env, tools={"etendo_create", "etendo_list"})
        self.assertEqual(result["status"], "ok")
        self.assertIn("etendo_list", [t for t, _a in env.calls])
        # A read that fails is unverified with no such reason: it blocks `fresh`.
        env.fail.add("product")
        self.assertNotIn("reason", self.verify(env, tools={"etendo_list"})["records"]["product"])


class FreshnessTest(FixtureCase):
    TARGET = {"name": "t", "url": "http://x/mcp"}
    TOOLS = {"etendo_list", "etendo_create"}

    def manifest(self, env, **over):
        fx = fixtures.load_fixture("base")
        baseline = self.verify(env)
        return {"complete": True, "url": self.TARGET["url"], "fixture": fx.name, "fixtureSha": fx.sha,
                "fixtureHash": baseline["fixtureHash"], "seedId": "s1", "initializedAt": "2026-10-20T09:00:00Z",
                "records": baseline["ids"], **over}

    def assess(self, env, manifest="default", checklist="etendo-go", tools=None, with_fixture=True,
               baseline_tools=None):
        fx = fixtures.load_fixture("base") if with_fixture else None
        manifest = self.manifest(Env()) if manifest == "default" else manifest
        baseline = asyncio.run(fixtures.verify_baseline(fx, "etendo-go", env.call, manifest,
                                                        tools=baseline_tools)) if fx else None
        return asyncio.run(fixtures.assess_freshness(
            fixtures.load_checklist(checklist) if checklist else None, call=env.call,
            tools=self.TOOLS if tools is None else tools, target=self.TARGET, fixture=fx, baseline=baseline,
            manifest=manifest, now="2026-10-20T10:00:00.000Z"))

    def test_fresh(self):
        result = self.assess(Env())
        self.assertEqual(result["status"], "fresh", result["details"])
        self.assertEqual(result["unverifiable"], [])
        self.assertEqual((result["seedId"], result["initializedAt"]), ("s1", "2026-10-20T09:00:00Z"))
        self.assertEqual(result["checkedAt"], "2026-10-20T10:00:00.000Z")

    def test_an_unexplained_document_or_master_row_is_dirty(self):
        env = Env()
        env.rows["sales-order"] = [{"id": "SO1", "description": "a customer's order"}]
        self.assertEqual(self.assess(env)["status"], "dirty")
        env = Env()
        env.rows["bp"].append({"id": "X", "name": "Someone Else"})
        result = self.assess(env)
        self.assertEqual(result["status"], "dirty")
        self.assertEqual(result["details"]["masterData"][0]["extra"], ["Someone Else"])

    def test_only_marker_rows_is_clean_never_fresh(self):
        env = Env()
        env.rows["sales-order"] = [{"id": "SO1", "description": "20261020T0900-cmp-a1b2-q-a1"}]
        env.rows["bp"].append({"id": "X", "name": "x", "description": "20261020T0900-cmp-a1b2-w-a3"})
        result = self.assess(env)
        self.assertEqual(result["status"], "clean")
        self.assertEqual(result["details"]["markerCount"], 2)

    def test_what_cannot_be_read_is_unverified_never_clean(self):
        cases = {
            "tool not in the catalogue": dict(tools={"etendo_create"}),
            "no manifest": dict(manifest=None),
        }
        for why, kw in cases.items():
            with self.subTest(why=why):
                self.assertEqual(self.assess(Env(), **kw)["status"], "unverified")
        # A suite without a fixture proves no seeded baseline; an unseeded,
        # untouched environment is still only unverified.
        unseeded = Env()
        unseeded.rows["bp"] = [r for r in unseeded.rows["bp"] if r["name"] == "Init SA"]
        self.assertEqual(self.assess(unseeded, with_fixture=False)["status"], "unverified")
        env = Env()
        env.fail.add("sales-order")
        self.assertEqual(self.assess(env)["status"], "unverified")

    def with_payments(self):
        """`payments` declares list_payments, which TOOLS does not offer; `env.call` would answer it."""
        self.write("fresh.etendo-go.yaml",
                   CHECKLIST.replace("documents:\n", "documents:\n  - { name: payments, tool: list_payments }\n"))
        env = Env()
        original = env.call

        async def call(tool, args):
            if tool == "list_payments":
                env.calls.append((tool, args))
                return {"data": env.rows.get("payments", [])}
            return await original(tool, args)

        env.call = call
        return env

    def test_only_tool_not_offered_is_fresh_and_lists_the_entity_until_the_catalogue_has_it(self):
        # Plan §9 q14 (decided 2026-10-15): "tool not offered" alone does not block `fresh`.
        env = self.with_payments()
        result = self.assess(env)
        self.assertEqual(result["status"], "fresh", result["details"])
        self.assertEqual(result["unverifiable"], [{"check": "documents", "entity": "payments",
                                                   "tool": "list_payments", "reason": fixtures.TOOL_NOT_OFFERED}])
        payments = result["details"]["documents"][0]
        self.assertEqual((payments["name"], payments["status"], payments["reason"]),
                         ("payments", "unverified", fixtures.TOOL_NOT_OFFERED))
        self.assertNotIn("list_payments", [t for t, _a in env.calls])
        # The vendor adds the tool: the same checklist, unedited, now reads it for real.
        result = self.assess(env, tools=self.TOOLS | {"list_payments"})
        self.assertEqual((result["status"], result["unverifiable"]), ("fresh", []))
        self.assertIn("list_payments", [t for t, _a in env.calls])
        # ... and what it reads counts: a payment nobody explains is dirty.
        env.rows["payments"] = [{"id": "PAY1"}]
        self.assertEqual(self.assess(env, tools=self.TOOLS | {"list_payments"})["status"], "dirty")

    def test_a_baseline_read_tool_not_offered_is_fresh_when_the_manifest_holds(self):
        result = self.assess(Env(), baseline_tools={"etendo_create"})
        self.assertEqual(result["status"], "fresh", result["details"])
        self.assertEqual([(u["check"], u["entity"], u["tool"]) for u in result["unverifiable"]],
                         [("baseline", "customer", "etendo_list"), ("baseline", "product", "etendo_list")])
        self.assertEqual(result["details"]["baseline"]["reason"], fixtures.TOOL_NOT_OFFERED)
        # The manifest is still required, complete and matching.
        no_manifest = self.assess(Env(), manifest=None, baseline_tools={"etendo_create"})
        self.assertNotEqual(no_manifest["status"], "fresh")
        self.assertEqual(no_manifest["details"]["baseline"]["status"], "unverified")
        self.assertNotIn("reason", no_manifest["details"]["baseline"])
        self.assertEqual(self.assess(Env(), manifest=self.manifest(Env(), complete=False),
                                     baseline_tools={"etendo_create"})["status"], "dirty")
        self.assertEqual(self.assess(Env(), manifest=self.manifest(Env(), url="http://other/mcp"),
                                     baseline_tools={"etendo_create"})["status"], "dirty")

    def test_tool_not_offered_plus_any_other_unverified_cause_is_unverified(self):
        def failed_read(env):
            env.fail.add("sales-order")

        def unknown_shape(env):
            original = env.call

            async def call(tool, args):
                if args.get("spec") == "sales-order":
                    return {"weird": 1}
                return await original(tool, args)
            env.call = call

        def partial_page(env):
            original = env.call

            async def call(tool, args):
                payload = await original(tool, args)
                if args.get("spec") == "bp":
                    payload["has_more"] = True
                return payload
            env.call = call

        cases = {"call error": (failed_read, {}), "unknown shape": (unknown_shape, {}),
                 "partial page": (partial_page, {}), "no manifest": (None, {"manifest": None})}
        for why, (spoil, kw) in cases.items():
            with self.subTest(why=why):
                env = self.with_payments()
                if spoil:
                    spoil(env)
                result = self.assess(env, **kw)
                self.assertEqual(result["status"], "unverified", result["details"])
                self.assertEqual([u["entity"] for u in result["unverifiable"]], ["payments"])
        with self.subTest(why="uncaptured allowlist"):
            env = self.with_payments()
            self.write("fresh.etendo-go.yaml", (self.tmp / "fixtures" / "fresh.etendo-go.yaml").read_text()
                       .replace("allowlistCaptured: true", "allowlistCaptured: false"))
            env.rows["bp"].append({"id": "X", "name": "Who"})
            self.assertEqual(self.assess(env)["status"], "unverified")
        with self.subTest(why="a baseline record whose read failed"):
            env = self.with_payments()
            env.fail.add("product")
            self.assertEqual(self.assess(env)["status"], "unverified")

    def test_tool_not_offered_never_hides_dirty_or_leftover(self):
        env = self.with_payments()
        env.rows["bp"].append({"id": "X", "name": "Someone Else"})
        self.assertEqual(self.assess(env)["status"], "dirty")
        env = self.with_payments()
        env.rows["sales-order"] = [{"id": "SO1", "description": "20261020T0900-cmp-a1b2-q-a1"}]
        self.assertEqual(self.assess(env)["status"], "clean")

    def test_when_no_checklist_tool_is_offered_nothing_proves_fresh(self):
        # Every document / master-data check is "tool not offered" and the baseline reads back fine:
        # the exception does not stretch to a checklist that read nothing.
        result = self.assess(Env(), tools={"etendo_create"})
        self.assertEqual(result["status"], "unverified")
        self.assertEqual({u["entity"] for u in result["unverifiable"]}, {"sales-order", "bp"})

    def test_the_old_declared_unverified_list_is_refused(self):
        self.write("fresh.etendo-go.yaml", CHECKLIST + "unverified:\n  - { name: payments, reason: no list }\n")
        with self.assertRaisesRegex(ValueError, "tool it WOULD use"):
            fixtures.load_checklist("etendo-go")

    def test_baseline_rows_with_no_baseline_to_judge_them_are_unverified_not_dirty(self):
        # No fixture: the customer row may well be the baseline record, nobody can tell.
        result = self.assess(Env(), with_fixture=False)
        bp = result["details"]["masterData"][0]
        self.assertEqual(bp["status"], "unverified", bp)
        self.assertIn("no baseline", bp["detail"])
        self.assertEqual(result["status"], "unverified")
        # A row that is no baseline record and carries no marker is still unexplained: unverified,
        # because it cannot be told from a baseline one, but a document is still dirty.
        env = Env()
        env.rows["sales-order"] = [{"id": "SO1", "description": "x"}]
        self.assertEqual(self.assess(env, with_fixture=False)["status"], "dirty")

    def test_a_partial_page_is_unverified(self):
        env = Env()
        env.rows["bp"] = env.rows["bp"]  # rows fine, but the payload says more follow
        original = env.call

        async def paged(tool, args):
            payload = await original(tool, args)
            if args.get("spec") == "bp":
                payload["has_more"] = True
            return payload

        env.call = paged
        self.assertEqual(self.assess(env)["status"], "unverified")

    def test_an_uncaptured_allowlist_cannot_judge_an_extra_row(self):
        self.write("fresh.etendo-go.yaml", CHECKLIST.replace("allowlistCaptured: true", "allowlistCaptured: false"))
        self.assertEqual(self.assess(Env())["status"], "fresh")  # nothing unexplained
        env = Env()
        env.rows["bp"].append({"id": "X", "name": "Who"})
        self.assertEqual(self.assess(env)["status"], "unverified")

    def test_dirty_beats_unverified_beats_clean(self):
        env = Env()
        env.rows["sales-order"] = [{"id": "SO1", "description": "20261020T0900-cmp-a1b2-q-a1"}]
        self.assertEqual(self.assess(env, manifest=None)["status"], "unverified")
        env.rows["bp"].append({"id": "X", "name": "Someone Else"})
        self.assertEqual(self.assess(env, manifest=None)["status"], "dirty")

    def test_a_manifest_that_does_not_hold_is_dirty(self):
        cases = {
            "incomplete": {"complete": False},
            "another url": {"url": "http://other/mcp"},
            "another fixture version": {"fixtureSha": "000000000000"},
            "another hash": {"fixtureHash": "ffff"},
        }
        for why, over in cases.items():
            with self.subTest(why=why):
                result = self.assess(Env(), manifest=self.manifest(Env(), **over))
                self.assertEqual(result["status"], "dirty")
                self.assertEqual(result["details"]["baseline"]["status"], "dirty")

    def test_no_checklist_is_unknown(self):
        result = self.assess(Env(), checklist="holded")
        self.assertEqual(result["status"], "unknown")

    def test_checklist_validation(self):
        for bad in (CHECKLIST.replace("allowlistCaptured: true", "allowlistCaptured: maybe"),
                    CHECKLIST.replace("platform: etendo-go", "platform: holded"),
                    CHECKLIST.replace("key: name, ", ""),
                    CHECKLIST + "  - { name: bp, tool: etendo_list, key: name }\n",
                    # S1: a checklist that checks nothing would read as fresh.
                    "schemaVersion: 1\nplatform: etendo-go\nallowlistCaptured: true\n",
                    "schemaVersion: 1\nplatform: etendo-go\nallowlistCaptured: true\ndocuments: []\nmasterData: []\n"):
            with self.subTest(bad=bad[-60:]):
                self.write("fresh.etendo-go.yaml", bad)
                with self.assertRaises(ValueError):
                    fixtures.load_checklist("etendo-go")


class MarkerTest(unittest.TestCase):
    def test_marker_shapes(self):
        self.assertTrue(fixtures.MARKER_RE.search("ref 20261014T1402-cmp-a3f1-collect-a2"))
        self.assertTrue(fixtures.MARKER_RE.search("20261014T1402-local-a3f1-q-a12"))
        self.assertTrue(fixtures.MARKER_RE.search("ref 20261014T140233-cmp-a3f1-collect-a2"))  # with seconds
        self.assertFalse(fixtures.MARKER_RE.search("Cliente Paridad SL"))
        self.assertFalse(fixtures.MARKER_RE.search("FV/2026/0010 del 14/10/2026"))


if __name__ == "__main__":
    unittest.main()
