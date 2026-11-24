# CloudFront security headers (ETP-4573)

Policy `etendo-go-security-headers-v1` is versioned in
`infra/cloudfront-response-headers/etendo-go-security-headers-v1.json` and applied by
`scripts/cloudfront-security-headers.mjs` through `.github/workflows/cloudfront-security-headers.yml`
(ADR-0002 D1/D4 in `com.etendoerp.go`).

Headers: HSTS `max-age=31536000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN` (the live value; `DENY` is the ADR-0002 target and stays an open question
for a later `-v2`), `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), geolocation=(), microphone=()`. **No CORS and no CSP**
(CSP is ETP-4572 / ETP-4574; never as a `<meta>` tag).

## Why the policy step is separate

A Response Headers Policy is **account-global**: changing its contents changes every distribution that
uses it at once. If the three distributions share an AWS account (not yet confirmed), editing the policy
from "experimental" would change production immediately. So:

- `policy` creates/updates the policy. It **always runs under the `production-cloudfront` GitHub
  Environment (required reviewers), whatever environment is selected**, and the script refuses to run
  unless `GITHUB_ENVIRONMENT=production-cloudfront` (fails closed when unset).
- `apply` is attach-only per distribution. It never creates or updates the policy, and fails if the
  policy is missing or its stored content differs from the JSON ("drift"): run `policy` first.
- Content changes ship as a new name (`-v2`) and are attached per environment.

## One-time repository setup

Create these GitHub Environments (Settings → Environments); this is not done by the PR:

| Environment | Reviewers | Used by |
|---|---|---|
| `production-cloudfront` | required | `policy`; production `apply` (non dry-run) and `rollback` |
| `production-cloudfront-readonly` | none | production `verify` and `apply` dry-run |
| `staging-cloudfront`, `experimental-cloudfront` | none | their `apply`, `verify`, `rollback` |

Variables read: `CF_DISTRIBUTION_PRODUCTION|STAGING|EXPERIMENTAL`, `AWS_REGION`, and
`FRONT_RELEASE_ROLE_ARN` (or the static AWS keys), as in `deploy-staging.yml`. The job fails if a
distribution variable is empty.

## Procedure

Before the first `apply` on each host, read the live headers and confirm they match the JSON:
`curl -sI https://<host>/ | grep -i -E 'permissions-policy|x-frame-options|strict-transport|referrer-policy|x-content-type'`.
In particular the live `Permissions-Policy` value was never recorded; if it differs, ship the live value
or flag it as a new header. Also check that ETP-4572 is done (ticket dependency).

1. `policy` with `dry_run: true`, then `dry_run: false` (reviewed): creates the policy, or updates it only
   if it differs. Re-running on a matching policy is a no-op.
2. `verify` per environment — read-only; exits non-zero and lists the path patterns lacking the policy.
3. `apply` with `dry_run: true` — prints the attach plan, behaviors that already use another policy id
   (`conflicts`) and behaviors with viewer-response/origin-response Function or Lambda@Edge
   (`edgeHooks`). Writes nothing.
4. `apply` with `dry_run: false` — attaches the policy to the default and **every** cache behavior and
   re-reads to verify each one. A behavior with a different policy id blocks the run unless
   `replace_existing` is set. Re-running on a converged distribution calls no `update-distribution`.

An ETag conflict (concurrent change) fails the run: re-run it; nothing is retried blindly.

## Snapshot and rollback

Every `apply` writes the pre-change `DistributionConfig`, ETag and report to
`cf-snapshots/<id>-<ts>.json`, uploaded as artifact `cf-snapshot-<env>-<run_id>` (90 days).
**The run id is the number in the apply run's URL** (`.../actions/runs/<run_id>`).

Rollback: run the workflow with `action: rollback`, the same `environment`, and `snapshot_run_id` set to
that run id. The job downloads that artifact (no other path is accepted) and restores **only
`ResponseHeadersPolicyId` per behavior**; origins, behaviors and certificates changed since are kept. It
fails if the set of behaviors differs from the snapshot, or if the snapshot is for another distribution.
The policy stays in place, detached. Wait for the distribution to reach `Deployed`, invalidate if needed.

Manual equivalent: `node scripts/cloudfront-security-headers.mjs rollback --distribution <id> --snapshot <file>`.

## Evidence for the ticket

Attach the red-then-green test run, and real `policy --dry-run`, `apply --dry-run` and `verify` output
for each environment. The fake-AWS unit tests alone do not meet the acceptance criteria.
