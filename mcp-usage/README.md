# MCP usage dumps

Landing folder for `scripts/mcp-usage-dump.sh` (and `make mcp-usage`), which exports the
`ETGO_MCP_USAGE` telemetry table from a deployed instance as JSONL.

Everything here except this README is **gitignored on purpose**: these files are production and
experimental telemetry, not source. Keep them out of commits, and out of anywhere public.

```bash
make mcp-usage HOST=etendo-go-experimental          # newly unreviewed rows (Status IS NULL)
make mcp-usage HOST=etendo-go-production MARK_REVIEWED=1 REVIEWER="Your Name"
make mcp-usage-help                                 # every option
```

Files are named `<ssh-alias>-<timestamp>.jsonl`. Read the feedback rows with:

```bash
jq -r 'select(.row_type=="feedback") | .payload | fromjson' mcp-usage/*.jsonl
```

A row is "reviewed" when its `Status` is `'R'` (`NULL` = pending); `Reviewed_By` holds the
reviewer's name. `isactive` is not used as a review marker any more. See the full rationale in
`modules/com.etendoerp.go/docs/mcp-usage-telemetry.md`, section
"Reading the table from a deployed instance".
