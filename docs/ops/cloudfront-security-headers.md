# CloudFront security headers (ETP-4573)

Policy `etendo-go-security-headers-v1` is versioned in
`infra/cloudfront-response-headers/etendo-go-security-headers-v1.json` and applied by
`scripts/cloudfront-security-headers.mjs` through the workflow
`.github/workflows/cloudfront-security-headers.yml` (ADR-0002 D1/D4 in `com.etendoerp.go`).

Headers: HSTS `max-age=31536000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), geolocation=(), microphone=()`. **No CORS and no CSP**
(CSP is ETP-4572 / ETP-4574; never as a `<meta>` tag).

## Run it

Actions → *CloudFront security headers* → pick `environment` (production, staging or experimental)
and `action`:

1. `verify` — read-only; fails if any behavior lacks the policy.
2. `apply` with `dry_run: true` — plans and snapshots, writes nothing.
3. `apply` with `dry_run: false` — creates/updates the policy only if it differs, attaches it to the
   default and **every** cache behavior, then verifies each behavior.

Re-running `apply` on a converged distribution creates no policy and calls no `update-distribution`.
An ETag conflict (concurrent change) fails the run: re-run it, nothing is retried blindly.

## Snapshot and rollback

Every `apply` stores the pre-change `DistributionConfig` + ETag in `cf-snapshots/<id>-<ts>.json`,
uploaded as the artifact `cf-snapshot-<env>-<run_id>` (90 days).

Rollback: download that artifact, then run the workflow with `action: rollback` and
`snapshot_file` set to the file path. It refuses a snapshot from another distribution and restores
the config with the current ETag. The policy itself is left in place (detached, harmless); wait for the
distribution to reach `Deployed` and invalidate if needed.

Manual equivalent: `node scripts/cloudfront-security-headers.mjs rollback --distribution <id> --snapshot <file>`.

## Reconciliation notes

The existing out-of-band headers on production/staging are superseded by this policy (`Override: true`).
`X-Frame-Options` moves from `SAMEORIGIN` to `DENY`; run `apply` on experimental first. The backend (ALB
origin) behaviors receive the policy too; `Cache-Control` on JSON stays a backend concern (ADR-0002 D2).
