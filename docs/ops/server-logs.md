# Server Logs (CloudWatch)

How to read the runtime logs of the deployed Etendo GO environments. Everything
here is **read-only** — no command in this document writes to AWS.

Entry point: `scripts/tail-logs.sh`, wrapped by `make logs`.

## Quick reference

```bash
make logs                                            # experimental, last 10m, filtered by "duplicate"
make logs ENV=production ARGS="--since 1h --all"     # production, last hour, unfiltered
make logs ARGS="--service jsreport --env production --all"   # another service
make logs ARGS="--since 30m --all --no-follow"       # print a window and exit
make logs-check                                      # validate the AWS CLI setup
```

`ARGS` is passed through verbatim to the script, so any flag the script accepts
works without touching the `Makefile`. Calling the script directly is
equivalent:

```bash
scripts/tail-logs.sh --env production --since 1h --all
```

## Environments and services

The log group is resolved from `--env` + `--service`. Verified against
`aws logs describe-log-groups` on 2026-09-22.

Default service is `etendo` (the Tomcat/ECS application itself):

| `--env` | Log group | Host |
|---|---|---|
| `experimental` (default) | `/ecs/etendo-experimental` | `go.experimental.etendo.cloud` |
| `production` | `/ecs/etendo-production` | `go.etendo.cloud` |
| `demo1` | `/ecs/etendo-demo1` | — |

There is **no `staging` environment** — the third environment is `demo1`.

Other services:

| `--service` | experimental | production | demo1 |
|---|---|---|---|
| `etendo` (default) | `/ecs/etendo-experimental` | `/ecs/etendo-production` | `/ecs/etendo-demo1` |
| `jsreport` | `/ecs/jsreport-experimental` | `/ecs/etendo-production/jsreport` | `/ecs/jsreport-demo1` |
| `report-server` | `/ecs/report-server-experimental` | `/ecs/report-server-production` | `/ecs/report-server-demo1` |
| `ai-bff` | `/ecs/ai-bff-experimental` | — | `/ecs/ai-bff-demo1` |
| `copilot` | `/ecs/copilot-experimental` | `/ecs/copilot-production` | `/ecs/copilot-demo1` |
| `public-api` | — | `/ecs/etendo-public-api-production` | — |
| `alb` | `/alb/etendo-experimental` | `/alb/etendo-production` | — |
| `cloudfront` | `/cloudfront/etendo-experimental` | `/cloudfront/etendo-production` | — |
| `rds` | `/aws/rds/instance/etendo-experimental/postgresql` | `/aws/rds/instance/etendo-production-enc/postgresql` | — |
| `rds-proxy` | — | `/aws/rds/proxy/etendo-production-proxy` | — |

Note the group names do **not** follow one uniform pattern — compare
`/ecs/jsreport-experimental` with `/ecs/etendo-production/jsreport`. That is why
`resolve_log_group()` in `scripts/tail-logs.sh` is an explicit lookup table and
not string interpolation. A combination that does not exist fails with a listing
of what does.

All of these live in AWS account `278186107973`, region `eu-west-3` (Paris) — the
same account and region as the ALB/CloudFront infrastructure documented in
[cloudfront-alb-routing.md](cloudfront-alb-routing.md).

Groups with no `--env`/`--service` mapping (Lambdas, WAF, RUM, the RDS proxy, the
unencrypted production replica) are reachable directly:

```bash
scripts/tail-logs.sh --log-group /aws/lambda/etendo-alerts-gchat --since 1h
```

To see everything the profile can read:

```bash
scripts/tail-logs.sh --list-groups
```

## Database logs: what is actually available

Verified 2026-09-22. Availability is uneven across environments.

| Environment | PostgreSQL instance logs | Notes |
|---|---|---|
| `experimental` | **Yes**, current | `--service rds --env experimental` |
| `production` | **Yes**, current | `/aws/rds/instance/etendo-production-enc/postgresql` |
| `demo1` | **No group at all** | Nothing is exported to CloudWatch |

Production additionally exposes the **RDS Proxy**, which logs connection
lifecycle and pinning events (not queries) — the place to look for
connection-pool problems:

```bash
scripts/tail-logs.sh --service rds-proxy --env production --since 1h --all
```

> **The production group was renamed on 2026-09-22.** Production moved to an
> encrypted instance: `/aws/rds/instance/etendo-production/postgresql` and its
> `-unencrypted` sibling no longer exist, replaced by `etendo-production-enc`.
> A rename like this breaks the lookup table **silently in one direction only** —
> a stale entry fails loudly with `ResourceNotFoundException`, but a group that
> exists and is simply empty (as the orphaned one was for 122 days) returns
> nothing and looks like a quiet database. When infra renames an instance,
> update `resolve_log_group()` in `scripts/tail-logs.sh` and the tables above;
> `--list-groups` shows the current truth.

## Options

| Flag | Meaning |
|---|---|
| `--env VALUE` | `experimental`, `production` or `demo1` (default: `experimental`) |
| `--service VALUE` | `etendo` (default), `jsreport`, `report-server`, `ai-bff`, `copilot`, `public-api`, `alb`, `cloudfront`, `rds`, `rds-proxy` |
| `--log-group VALUE` | Explicit log group; overrides `--env`/`--service` |
| `--since VALUE` | CloudWatch duration: `10m`, `1h`, `1d` (default: `10m`) |
| `--pattern VALUE` | CloudWatch filter pattern (default: `duplicate`) |
| `--all` | No filter — show every message |
| `--no-follow` | Print the window and exit instead of tailing |
| `--list-groups` | List the log groups visible to the profile, then exit |
| `--check` | Verify the AWS CLI setup and exit without reading logs |

Environment variables: `AWS_PROFILE` (default `go`), `AWS_REGION` (default
`eu-west-3`), `ETENDO_ENV`, `ETENDO_SERVICE`, `ETENDO_LOG_GROUP`.

## AWS CLI setup

`make logs-check` (or `scripts/tail-logs.sh --check`) validates the whole chain
and tells you exactly what is missing. Run it first if anything fails.

### 1. Install the CLI

```bash
brew install awscli          # macOS
aws --version                # expect aws-cli/2.x
```

Other platforms: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>

### 2. Configure the `go` profile

Pick whichever matches how your account is issued.

**SSO / IAM Identity Center (preferred):**

```bash
aws configure sso --profile go
# SSO region / start URL: as provided by the infra owner
# CLI default client Region [None]: eu-west-3
# CLI default output format [None]: json
```

Re-authenticate when the session expires (the script says so explicitly):

```bash
aws sso login --profile go
```

**Static access keys:**

```bash
aws configure --profile go
# AWS Access Key ID / Secret Access Key: as provided
# Default region name: eu-west-3
# Default output format: json
```

This writes `~/.aws/config` and `~/.aws/credentials`. A minimal `~/.aws/config`
entry looks like:

```ini
[profile go]
region = eu-west-3
output = json
```

### 3. Required permissions

The profile only needs read access to CloudWatch Logs:

- `logs:FilterLogEvents` — what `aws logs tail` uses
- `logs:DescribeLogGroups` — for `--list-groups`
- `logs:DescribeLogStreams`
- `sts:GetCallerIdentity` — used by the preflight check

No write permission is needed or used.

### 4. Verify

```bash
make logs-check
```

Expected output:

```
OK: aws CLI found, profile=go region=eu-west-3
OK: authenticated as arn:aws:sts::278186107973:assumed-role/...
Target log group: /ecs/etendo-experimental
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `aws CLI is not installed or not on PATH` | CLI missing | Step 1 above |
| `has no usable credentials` | Profile missing or SSO session expired | `aws sso login --profile go`, or step 2 |
| `ResourceNotFoundException` on the log group | The group name does not exist in this account/region | `scripts/tail-logs.sh --list-groups` and pass `--log-group` |
| `AccessDeniedException` | The role lacks CloudWatch Logs read | Step 3 above |
| No output at all | The default `--pattern duplicate` filtered everything out | Add `--all` |
