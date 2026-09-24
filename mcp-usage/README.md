# MCP usage dumps

Landing folder for `scripts/mcp-usage-dump.sh` (and `make mcp-usage`), which exports the
`ETGO_MCP_USAGE` telemetry table from a deployed instance as JSONL.

Everything here except this README is **gitignored on purpose**: these files are production and
experimental telemetry, not source. Keep them out of commits, and out of anywhere public.

```bash
make mcp-usage HOST=etendo-go-experimental          # newly unreviewed rows
make mcp-usage HOST=etendo-go-production MARK_REVIEWED=1
make mcp-usage-help                                 # every option
```

Files are named `<ssh-alias>-<timestamp>.jsonl`. Read the feedback rows with:

```bash
jq -r 'select(.row_type=="feedback") | .payload | fromjson' mcp-usage/*.jsonl
```

A row is "reviewed" when its `isactive` is `'N'` — see the full rationale in
`modules/com.etendoerp.go/docs/mcp-usage-telemetry.md`, section
"Reading the table from a deployed instance".
