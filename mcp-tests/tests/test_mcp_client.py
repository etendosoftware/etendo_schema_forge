"""`mcp_client.describe_server` and the catalogue digest (run schema v4 pins).

@covers mcp-tests/runner/mcp_client.py
"""

from __future__ import annotations

import asyncio
import unittest
from contextlib import asynccontextmanager
from types import SimpleNamespace
from unittest import mock

from mcp.types import (
    Implementation, InitializeResult, ListToolsResult, ServerCapabilities, Tool, ToolAnnotations,
)

from runner import mcp_client


def _tool(name, description="d", schema=None, annotations=None):
    return Tool(name=name, description=description, inputSchema=schema or {"type": "object"},
                annotations=annotations)


class CatalogueDigestTest(unittest.TestCase):
    def test_order_does_not_change_the_sha(self):
        a = mcp_client.catalogue_digest([_tool("a"), _tool("b")])
        b = mcp_client.catalogue_digest([_tool("b"), _tool("a")])
        self.assertEqual(a, b)
        self.assertEqual(a["toolCount"], 2)
        self.assertEqual(set(a), {"sha", "toolCount", "bytes"})

    def test_bytes_is_the_size_of_the_canonical_catalogue(self):
        small = mcp_client.catalogue_digest([_tool("a", "x")])
        large = mcp_client.catalogue_digest([_tool("a", "x" * 101)])
        self.assertEqual(large["bytes"] - small["bytes"], 100)
        # UTF-8 bytes, not characters.
        accented = mcp_client.catalogue_digest([_tool("a", "á")])
        self.assertEqual(accented["bytes"] - small["bytes"], 1)

    def test_a_reworded_description_changes_the_sha(self):
        a = mcp_client.catalogue_digest([_tool("a", "lists orders")])
        b = mcp_client.catalogue_digest([_tool("a", "lists sales orders")])
        self.assertNotEqual(a["sha"], b["sha"])

    def test_a_changed_input_schema_changes_the_sha(self):
        a = mcp_client.catalogue_digest([_tool("a")])
        b = mcp_client.catalogue_digest([_tool("a", schema={
            "type": "object", "properties": {"limit": {"type": "integer"}}})])
        self.assertNotEqual(a["sha"], b["sha"])

    def test_a_changed_annotation_changes_the_sha(self):
        a = mcp_client.catalogue_digest([_tool("a", annotations=ToolAnnotations(readOnlyHint=True))])
        b = mcp_client.catalogue_digest([_tool("a", annotations=ToolAnnotations(readOnlyHint=False))])
        c = mcp_client.catalogue_digest([_tool("a")])
        self.assertNotEqual(a["sha"], b["sha"])
        self.assertNotEqual(a["sha"], c["sha"])

    def test_order_independence_holds_for_full_definitions(self):
        one = _tool("a", "x", {"type": "object", "required": ["id"]}, ToolAnnotations(title="A"))
        two = _tool("b", "y", annotations=ToolAnnotations(destructiveHint=True))
        three = _tool("c")
        digests = {mcp_client.catalogue_digest(order)["sha"]
                   for order in ([one, two, three], [three, one, two], [two, three, one])}
        self.assertEqual(len(digests), 1)


class DescribeServerTest(unittest.TestCase):
    def test_reads_server_info_and_every_catalogue_page(self):
        pages = [
            ListToolsResult(tools=[_tool("b")], nextCursor="next"),
            ListToolsResult(tools=[_tool("a")]),
        ]
        seen = []

        async def list_tools(params=None):
            seen.append(None if params is None else params.cursor)
            return pages.pop(0)

        initialized = InitializeResult(
            protocolVersion="2025-06-18",
            capabilities=ServerCapabilities(),
            serverInfo=Implementation(name="etendo-go", version="1.0.0"),
        )

        @asynccontextmanager
        async def fake_open(_target):
            yield SimpleNamespace(list_tools=list_tools), initialized

        with mock.patch.object(mcp_client, "_open_session", fake_open):
            out = asyncio.run(mcp_client.describe_server({"name": "t"}))

        self.assertEqual(seen, [None, "next"])
        self.assertEqual(out["serverInfo"], {"name": "etendo-go", "version": "1.0.0"})
        self.assertEqual(out["protocolVersion"], "2025-06-18")
        self.assertEqual(out["catalogue"], mcp_client.catalogue_digest([_tool("a"), _tool("b")]))

    def _describe(self, initialized, pages):
        async def list_tools(params=None):
            return pages.pop(0)

        @asynccontextmanager
        async def fake_open(_target):
            yield SimpleNamespace(list_tools=list_tools), initialized

        with mock.patch.object(mcp_client, "_open_session", fake_open):
            return asyncio.run(mcp_client.describe_server({"name": "t"}))

    def test_missing_server_info_is_null_name_and_version(self):
        initialized = SimpleNamespace(serverInfo=None, protocolVersion="2025-06-18")
        out = self._describe(initialized, [ListToolsResult(tools=[_tool("a")])])
        self.assertEqual(out["serverInfo"], {"name": None, "version": None})
        self.assertEqual(out["catalogue"]["toolCount"], 1)

    def test_follows_every_page_until_there_is_no_cursor(self):
        pages = [
            ListToolsResult(tools=[_tool("c")], nextCursor="p2"),
            ListToolsResult(tools=[_tool("a")], nextCursor="p3"),
            ListToolsResult(tools=[_tool("b")]),
        ]
        initialized = SimpleNamespace(serverInfo=Implementation(name="x", version="1"),
                                      protocolVersion="2025-06-18")
        out = self._describe(initialized, pages)
        self.assertEqual(pages, [])
        self.assertEqual(out["catalogue"],
                         mcp_client.catalogue_digest([_tool("a"), _tool("b"), _tool("c")]))



class WhereTest(unittest.TestCase):
    """Suite v2 `expectEffect.where`: exact-match filtering by the runner."""

    def test_counts_rows_matching_every_condition(self):
        payload = {"data": [
            {"notes": "m", "status": {"code": "CO"}},
            {"notes": "m", "status": {"code": "DR"}},
            {"notes": "other", "status": {"code": "CO"}},
        ]}
        self.assertEqual(mcp_client.count_matching(payload, {"notes": "m"}), 2)
        self.assertEqual(mcp_client.count_matching(payload, {"notes": "m", "status.code": "CO"}), 1)
        # Number-like scalars compare by value; booleans are never numbers.
        self.assertEqual(mcp_client.count_matching([{"a": 1}, {"a": 1.0}, {"a": "1"}], {"a": 1}), 3)
        self.assertEqual(mcp_client.count_matching([{"a": "1.50"}], {"a": 1.5}), 1)
        self.assertEqual(mcp_client.count_matching([{"a": True}], {"a": 1}), 0)
        self.assertEqual(mcp_client.count_matching([{"a": "x"}], {"a": "X"}), 0)
        self.assertEqual(mcp_client.count_matching([{"a": [{"b": 2}]}], {"a.0.b": 2}), 1)

    def test_a_partial_page_is_not_verifiable(self):
        payload = {"data": [{"a": 1}], "totalRows": 50}
        with self.assertRaises(mcp_client.VerificationError) as ctx:
            mcp_client.count_matching(payload, {"a": 1})
        self.assertIn("1 of 50", str(ctx.exception))
        self.assertEqual(mcp_client.count_matching({"data": [{"a": 1}], "totalRows": 1}, {"a": 1}), 1)

    def test_without_where_a_partial_page_is_counted_by_its_total(self):
        # The count path (no `where`) trusts the server's total, which is the
        # complete answer to the server-side filter: it is verifiable, unlike
        # a client-side `where` over the same page.
        page = {"data": [{"a": 1}], "totalRows": 50}
        self.assertEqual(mcp_client.count_rows(page), 50)
        self.assertEqual(mcp_client.count_rows({"data": [], "totalCount": 0}), 0)
        with self.assertRaises(mcp_client.VerificationError):
            mcp_client.extract_rows(page)

    def test_a_path_no_row_has_is_not_verifiable(self):
        # A typo or a moved vendor field must never read as "no row matches":
        # with expect: none that would pass a refusal in silence.
        rows = [{"status": {"code": "CO"}}, {"status": None}, {}]
        for where in ({"status.cod": "CO"}, {"status.code.x": "CO"}, {"status.code": "CO", "nope": 1}):
            with self.subTest(where=where), self.assertRaises(mcp_client.VerificationError) as ctx:
                mcp_client.count_matching(rows, where)
            self.assertIn("no row", str(ctx.exception))
        with self.assertRaises(mcp_client.VerificationError):
            mcp_client.count_matching([{"a": [1]}], {"a.5": 1})
        with self.assertRaises(mcp_client.VerificationError):
            mcp_client.count_matching([{}], {"a": None})

    def test_a_path_some_rows_have_is_matched_normally(self):
        rows = [{"status": {"code": "CO"}}, {"status": None}, {}]
        self.assertEqual(mcp_client.count_matching(rows, {"status.code": "CO"}), 1)
        self.assertEqual(mcp_client.count_matching(rows, {"status.code": "DR"}), 0)
        # A present null is a value; it matches an expected None.
        self.assertEqual(mcp_client.count_matching([{"a": None}], {"a": None}), 1)
        self.assertEqual(mcp_client.count_matching([{"a": None}, {}], {"a": 1}), 0)

    def test_no_rows_at_all_is_an_honest_zero(self):
        # An empty answer has no shape to check a path against; nothing was
        # found, which is what expect: none asks.
        self.assertEqual(mcp_client.count_matching({"data": []}, {"status.cod": "CO"}), 0)

    def test_an_unknown_payload_shape_is_an_error_not_zero(self):
        with self.assertRaises(mcp_client.VerificationError):
            mcp_client.count_matching({"totalRows": 3}, {"a": 1})


if __name__ == "__main__":
    unittest.main()
