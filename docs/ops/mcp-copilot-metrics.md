# MCP / Copilot usage metrics

Two read-only scripts query a deployed Etendo instance (e.g. production) for the
MCP and Copilot usage tables:

| Command | Script | What it does |
|---|---|---|
| `make mcp-metrics` | `scripts/mcp-metrics.sh` | Counts — MCP tool calls, MCP feedback, Copilot conversations, Copilot messages, average messages per conversation. Total or per day. |
| `make mcp-usage` | `scripts/mcp-usage-dump.sh` | Exports the raw `ETGO_MCP_USAGE` rows as JSONL (optionally marking them reviewed — the only write). |

## Source tables

| Metric | Table | Filter |
|---|---|---|
| `mcp_usage` | `ETGO_MCP_USAGE` | `row_type = 'tool_call'` |
| `feedback` | `ETGO_MCP_USAGE` | `row_type = 'feedback'` (the text is in `payload`) |
| `conversations` | `ETCOP_CONVERSATION` | — |
| `messages` | `ETCOP_MESSAGE` | — |
| `avg_msgs_conv` | both Copilot tables | messages of the conversations **created** in the bucket ÷ those conversations |

MCP usage and MCP feedback are one table, told apart by `row_type`. Each metric is
bucketed by its own row's `created`. `isactive` is ignored: `mcp-usage-dump.sh`
repurposes it as the "reviewed" flag.

## Connection

Both scripts share `scripts/lib/remote-etendo-psql.sh`: they SSH into the host and
run `psql` **there**, with the DB credentials of that host's own `gradle.properties`.
The hop to the RDS happens on the host, so no credential reaches this machine.

The target is a remote-connection profile, `~/.config/schema-forge/remote/<name>.env`
(the same directory `make db-tunnel` uses), read for two keys:

```
SSH_HOST='etendo-go-production'
GRADLE_PROPERTIES='/opt/EtendoERP/gradle.properties'
```

`GRADLE_PROPERTIES` defaults to `/opt/EtendoERP/gradle.properties`; the `DB_*` keys of
a profile belong to `db-tunnel.sh` and are not used here. When no profile with that
name exists, the target is taken as a bare SSH alias. `--gradle-properties <path>`
overrides the profile.

## Usage

```bash
make mcp-metrics PROFILE=production                    # all-time total
make mcp-metrics PROFILE=production DAYS=30            # last 30 days, today included
make mcp-metrics PROFILE=production DAYS=30 DAILY=1    # one row per day + total
make mcp-metrics PROFILE=production SINCE=2026-09-01 UNTIL=2026-10-01 CLIENT='Acme' CSV=1
make mcp-metrics HOST=etendo-go-production             # bare SSH alias, default path

make mcp-usage PROFILE=production COUNT=1              # how many unreviewed rows
make mcp-usage PROFILE=production MARK_REVIEWED=1      # export + mark reviewed
```

`DAILY=1` lists days with no activity as zeros, so the series has no gaps.
`scripts/mcp-metrics.sh --help` / `make mcp-usage-help` list every option.
