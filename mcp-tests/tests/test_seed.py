"""`make mcp-seed`: baseline seeding through the MCP, idempotent, never duplicating (plan §5.4, S6).

@covers mcp-tests/runner/seed.py
"""

from __future__ import annotations

import asyncio
import io
import json
import tempfile
import textwrap
import unittest
from contextlib import asynccontextmanager, redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from runner import fixture as fixtures
from runner import seed

from tests.test_fixture import CHECKLIST, FIXTURE

TARGET = {"name": "t", "url": "http://x/mcp", "platform": "etendo-go"}


class Tenant:
    """A fake Etendo MCP holding rows per spec; creates assign ids C1, C2 …"""

    def __init__(self):
        self.rows = {"bp": [{"id": "I0", "name": "Init SA"}], "product": [], "sales-order": []}
        self.calls = []
        self.fail_create = None
        self.tools = ["etendo_create", "etendo_list"]

    async def describe_server(self, target):
        return {"tools": list(self.tools)}

    @asynccontextmanager
    async def session(self, target):
        yield "s"

    async def call_tool(self, session, tool, args):
        self.calls.append((tool, args))
        if tool == "etendo_list":
            return {"data": [dict(r) for r in self.rows[args["spec"]]]}
        if tool == "etendo_create":
            if self.fail_create == args["spec"]:
                raise RuntimeError("422 mandatory field")
            fields = args["fields"]
            row = {"id": f"C{len(self.calls)}", **fields}
            if args["spec"] == "bp":
                row["taxID"] = "B1"
            if args["spec"] == "product":
                row.update(searchKey=fields["sku"], price=100)
            self.rows[args["spec"]].append(row)
            return {"data": [{"id": row["id"]}]}
        raise AssertionError(tool)

    def creates(self):
        return [a for t, a in self.calls if t == "etendo_create"]


class SeedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        (self.tmp / "fixtures").mkdir()
        (self.tmp / "fixtures" / "base.yaml").write_text(textwrap.dedent(FIXTURE), encoding="utf-8")
        (self.tmp / "fixtures" / "fresh.etendo-go.yaml").write_text(textwrap.dedent(CHECKLIST), encoding="utf-8")
        self.tenant = Tenant()
        for p in (mock.patch.object(fixtures, "FIXTURES_DIR", self.tmp / "fixtures"),
                  mock.patch.object(fixtures, "SEEDS_DIR", self.tmp / ".seeds")):
            p.start()
            self.addCleanup(p.stop)

    def seed(self, initialized_at="2026-10-20T09:00:00Z"):
        self.out, self.err = io.StringIO(), io.StringIO()
        with mock.patch.object(seed, "mcp_session", self.tenant.session), \
             mock.patch.object(seed, "call_tool", self.tenant.call_tool), \
             mock.patch.object(seed, "describe_server", self.tenant.describe_server), \
             redirect_stdout(self.out), redirect_stderr(self.err):
            return asyncio.run(seed.seed(TARGET, "etendo-go", fixtures.load_fixture("base"),
                                         initialized_at=initialized_at))

    def manifest(self):
        return fixtures.read_manifest("t")

    def test_seeds_in_order_and_writes_a_complete_manifest(self):
        self.assertEqual(self.seed(), 0, self.err.getvalue())
        creates = self.tenant.creates()
        self.assertEqual([c["spec"] for c in creates], ["bp", "product"])
        customer_id = self.manifest()["records"]["customer"]
        self.assertEqual(creates[1]["fields"]["vendor"], customer_id)  # a later record names an earlier id
        m = self.manifest()
        self.assertTrue(m["complete"])
        self.assertEqual((m["initializedAt"], m["fixture"], m["url"]), ("2026-10-20T09:00:00Z", "base", TARGET["url"]))
        self.assertEqual(set(m["records"]), {"customer", "product"})
        self.assertTrue(m["seedId"] and m["fixtureHash"])

    def test_reseeding_a_seeded_target_is_a_no_op(self):
        self.seed()
        before = self.manifest()
        self.tenant.calls.clear()
        self.assertEqual(self.seed(), 0)
        self.assertEqual(self.tenant.creates(), [])
        self.assertEqual(self.manifest(), before)
        self.assertIn("Nothing done", self.out.getvalue())
        self.assertFalse((fixtures.SEEDS_DIR / "archive").exists(), "the same INITIALIZED_AT archives nothing")

    def _reinitialize(self):
        self.tenant.rows = Tenant().rows
        self.tenant.calls.clear()

    def test_a_new_initialization_instant_archives_the_manifest_and_reseeds(self):
        # Run B of a stability pair: the environment was re-initialized, and the
        # new INITIALIZED_AT says so. A stale manifest must not turn into a no-op.
        self.seed()
        old = self.manifest()
        self._reinitialize()
        self.assertEqual(self.seed("2026-10-21T09:00:00Z"), 0, self.err.getvalue())
        self.assertEqual([c["spec"] for c in self.tenant.creates()], ["bp", "product"])
        new = self.manifest()
        self.assertTrue(new["complete"])
        self.assertNotEqual(new["seedId"], old["seedId"])
        self.assertEqual(new["initializedAt"], "2026-10-21T09:00:00Z")
        archived = fixtures.SEEDS_DIR / "archive" / f"t-{old['seedId']}.json"
        self.assertEqual(json.loads(archived.read_text()), old)
        self.assertIn(f"Seed {old['seedId']} archived", self.out.getvalue())

    def test_a_new_initialization_instant_with_the_baseline_still_present_is_refused(self):
        # The claim is checked wherever the baseline is readable (Etendo): not re-initialized.
        self.seed()
        old = self.manifest()
        self.tenant.calls.clear()
        self.assertEqual(self.seed("2026-10-21T09:00:00Z"), 2)
        self.assertEqual(self.tenant.creates(), [])
        self.assertIn("declares it re-initialized", self.err.getvalue())
        self.assertEqual(self.manifest(), old, "a refused seed keeps the manifest in place")
        self.assertFalse((fixtures.SEEDS_DIR / "archive").exists())

    def test_a_target_holding_baseline_records_without_a_manifest_is_refused(self):
        self.seed()
        fixtures.manifest_path("t").unlink()
        self.tenant.calls.clear()
        self.assertEqual(self.seed(), 2)
        self.assertEqual(self.tenant.creates(), [])
        self.assertIn("no seed manifest", self.err.getvalue())

    def test_a_failed_create_leaves_an_incomplete_manifest_that_blocks_the_next_seed(self):
        self.tenant.fail_create = "product"
        self.assertEqual(self.seed(), 2)
        m = self.manifest()
        self.assertFalse(m["complete"])
        self.assertIn("product", m["error"])
        self.tenant.fail_create = None
        self.tenant.calls.clear()
        self.assertEqual(self.seed(), 2)
        self.assertEqual(self.tenant.creates(), [])
        self.assertIn("did not complete", self.err.getvalue())

    def test_an_environment_with_documents_is_not_freshly_initialized(self):
        self.tenant.rows["sales-order"] = [{"id": "SO1", "description": "x"}]
        self.assertEqual(self.seed(), 2)
        self.assertEqual(self.tenant.creates(), [])
        self.assertIsNone(self.manifest())

    def test_a_fixture_tool_the_target_lacks_is_refused_before_anything(self):
        self.tenant.tools = ["etendo_list"]
        self.assertEqual(self.seed(), 2)
        self.assertEqual(self.tenant.calls, [])

    def test_records_that_do_not_read_back_leave_an_incomplete_manifest(self):
        original = self.tenant.call_tool

        async def lossy(session, tool, args):
            payload = await original(session, tool, args)
            if tool == "etendo_list" and args["spec"] == "product":
                return {"data": []}
            return payload

        self.tenant.call_tool = lossy
        self.assertEqual(self.seed(), 2)
        self.assertFalse(self.manifest()["complete"])
        self.assertEqual(self.manifest()["verify"]["product"], "missing")

    def test_an_incomplete_manifest_exists_before_the_first_create(self):
        seen = []
        original = self.tenant.call_tool

        async def spy(session, tool, args):
            if tool == "etendo_create" and not seen:
                seen.append(self.manifest())
            return await original(session, tool, args)

        self.tenant.call_tool = spy
        self.assertEqual(self.seed(), 0, self.err.getvalue())
        self.assertIsNotNone(seen[0], "no manifest when the first create ran")
        self.assertFalse(seen[0]["complete"])
        self.assertTrue(seen[0]["seedId"])
        self.assertEqual(self.manifest()["seedId"], seen[0]["seedId"])  # one seed, one id
        self.assertTrue(self.manifest()["complete"])

    def _interrupted_then_reseeded(self, exc_type):
        with self.assertRaises(exc_type):
            self.seed()
        m = self.manifest()
        self.assertIsNotNone(m, "an interrupted seed left no manifest")
        self.assertFalse(m["complete"])
        self.assertIn(exc_type.__name__, m["error"])
        self.assertIn("interrupted", self.err.getvalue())
        self.tenant.calls.clear()
        self.assertEqual(self.seed(), 2)
        self.assertEqual(self.tenant.creates(), [])
        self.assertIn("did not complete", self.err.getvalue())
        return m

    def test_a_cancellation_mid_seed_leaves_an_incomplete_manifest_that_blocks_the_next_seed(self):
        original = self.tenant.call_tool

        async def cancelled_on_product(session, tool, args):
            if tool == "etendo_create" and args["spec"] == "product":
                raise asyncio.CancelledError()
            return await original(session, tool, args)

        self.tenant.call_tool = cancelled_on_product
        m = self._interrupted_then_reseeded(asyncio.CancelledError)
        self.assertEqual(set(m["records"]), {"customer"})  # what was created is written down

    def test_a_ctrl_c_mid_seed_leaves_an_incomplete_manifest(self):
        original = self.tenant.call_tool

        async def interrupted(session, tool, args):
            if tool == "etendo_create" and args["spec"] == "product":
                raise KeyboardInterrupt()
            return await original(session, tool, args)

        self.tenant.call_tool = interrupted
        self._interrupted_then_reseeded(KeyboardInterrupt)

    def test_a_session_that_fails_while_closing_leaves_an_incomplete_manifest(self):
        tenant, failures = self.tenant, [ConnectionError("stream closed")]

        @asynccontextmanager
        async def failing_teardown(target):
            yield "s"
            if failures:  # only the first session; the re-seed closes normally
                raise failures.pop()

        tenant.session = failing_teardown
        m = self._interrupted_then_reseeded(ConnectionError)
        self.assertEqual(set(m["records"]), {"customer", "product"})

    def test_what_the_checklist_cannot_verify_is_printed_and_does_not_refuse(self):
        (self.tmp / "fixtures" / "fresh.etendo-go.yaml").write_text(textwrap.dedent(CHECKLIST).replace(
            "documents:\n", "documents:\n  - { name: payments, tool: list_payments }\n"), encoding="utf-8")
        self.assertEqual(self.seed(), 0, self.err.getvalue())
        self.assertIn("cannot verify payments (list_payments): tool not offered", self.err.getvalue())

    def test_every_check_the_preflight_cannot_verify_gets_its_own_warning_line(self):
        (self.tmp / "fixtures" / "fresh.etendo-go.yaml").write_text(textwrap.dedent(CHECKLIST).replace(
            "documents:\n", "documents:\n  - { name: payments, tool: list_payments }\n"
            "  - { name: invoices, tool: etendo_list, args: { spec: invoice } }\n").replace(
            "masterData:\n", "masterData:\n  - { name: contacts, tool: list_contacts, key: name }\n"),
            encoding="utf-8")
        self.assertEqual(self.seed(), 0, self.err.getvalue())
        warnings = [line for line in self.err.getvalue().splitlines() if line.startswith("Seed preflight:")]
        self.assertEqual(len(warnings), 3, self.err.getvalue())
        self.assertIn("cannot verify payments (list_payments): tool not offered", warnings[0])
        self.assertIn("cannot verify invoices (etendo_list): KeyError", warnings[1])  # a read that failed
        self.assertIn("cannot verify contacts (list_contacts): tool not offered", warnings[2])
        self.assertTrue(all(w.endswith("Not refused; the comparison will read it as unverified.") for w in warnings))
        self.assertTrue(self.manifest()["complete"])  # warned, then seeded
        self.assertEqual([c["spec"] for c in self.tenant.creates()], ["bp", "product"])

    def test_master_data_rows_before_the_allowlist_is_captured_are_unverified_not_refused(self):
        (self.tmp / "fixtures" / "fresh.etendo-go.yaml").write_text(textwrap.dedent(CHECKLIST).replace(
            "allowlistCaptured: true", "allowlistCaptured: false"), encoding="utf-8")
        self.tenant.rows["bp"].append({"id": "X", "name": "Someone Else"})
        self.assertEqual(self.seed(), 0, self.err.getvalue())
        self.assertIn("cannot verify bp (etendo_list): allowlist not captured yet (allowlistCaptured: false)",
                      self.err.getvalue())
        self.assertNotIn("dirty", self.err.getvalue())
        self.assertTrue(self.manifest()["complete"])

    def test_without_unexplained_rows_an_uncaptured_allowlist_prints_nothing(self):
        (self.tmp / "fixtures" / "fresh.etendo-go.yaml").write_text(textwrap.dedent(CHECKLIST).replace(
            "allowlistCaptured: true", "allowlistCaptured: false"), encoding="utf-8")
        self.assertEqual(self.seed(), 0, self.err.getvalue())
        self.assertNotIn("Seed preflight", self.err.getvalue())

    def test_an_unexplained_master_data_row_still_refuses_the_seed(self):
        self.tenant.rows["bp"].append({"id": "X", "name": "Someone Else"})
        self.assertEqual(self.seed(), 2)
        self.assertIn("bp: dirty", self.err.getvalue())
        self.assertEqual(self.tenant.creates(), [])
        self.assertIsNone(self.manifest())

    def test_the_command_line_requires_an_initialization_instant(self):
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            seed.main(["--target", "t", "--fixture", "base"])
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            seed.main(["--target", "t", "--fixture", "base", "--initialized-at", "2026-10-20T09:00"])
        self.assertEqual(seed._parse_instant("2026-10-20T11:00+02:00"), "2026-10-20T09:00:00Z")


class CaptureAllowlistTest(unittest.TestCase):
    setUp = SeedTest.setUp

    def test_prints_the_init_rows_as_allow_lists(self):
        out = io.StringIO()
        with mock.patch.object(seed, "mcp_session", self.tenant.session), \
             mock.patch.object(seed, "describe_server", self.tenant.describe_server), \
             mock.patch.object(seed, "call_tool", self.tenant.call_tool), redirect_stdout(out):
            self.assertEqual(asyncio.run(seed.capture_allowlist(TARGET, "etendo-go")), 0)
        self.assertIn("bp:\n- Init SA", out.getvalue())
        self.assertEqual(self.tenant.creates(), [])

    def _capture(self):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(seed, "mcp_session", self.tenant.session), \
             mock.patch.object(seed, "describe_server", self.tenant.describe_server), \
             mock.patch.object(seed, "call_tool", self.tenant.call_tool), redirect_stdout(out), redirect_stderr(err):
            code = asyncio.run(seed.capture_allowlist(TARGET, "etendo-go"))
        return code, out.getvalue(), err.getvalue()

    def test_a_checklist_tool_the_target_does_not_offer_is_not_captured(self):
        # The live tools/list is read first: the absent tool is named, never called.
        self.tenant.tools = ["etendo_create"]
        code, out, err = self._capture()
        self.assertEqual(code, 2)  # nothing at all was captured
        self.assertIn("bp: 'NOT CAPTURED: tool not offered: etendo_list'", out)
        self.assertIn("Nothing was captured", err)
        self.assertNotIn("- Init SA", out)  # nothing pasteable as an allow list
        self.assertEqual(self.tenant.calls, [])

    def test_a_partial_capture_exits_zero_and_names_what_is_missing(self):
        (self.tmp / "fixtures" / "fresh.etendo-go.yaml").write_text(textwrap.dedent(CHECKLIST) + (
            "  - { name: uom, tool: list_uoms, key: name }\n"), encoding="utf-8")
        code, out, _err = self._capture()
        self.assertEqual(code, 0)
        self.assertIn("bp:\n- Init SA", out)
        self.assertIn("uom: 'NOT CAPTURED: tool not offered: list_uoms'", out)

    def test_a_read_that_fails_is_not_captured(self):
        async def broken(session, tool, args):
            raise RuntimeError("500")

        self.tenant.call_tool = broken
        code, out, _err = self._capture()
        self.assertEqual(code, 2)
        self.assertIn("NOT CAPTURED: RuntimeError: 500", out)


if __name__ == "__main__":
    unittest.main()
