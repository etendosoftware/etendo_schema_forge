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


if __name__ == "__main__":
    unittest.main()
