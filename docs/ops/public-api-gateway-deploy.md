# Public API Gateway: Build and Deploy Runbook

ETP-5862, ETP-6024. Deployment of the public API gateway (`gateway/`, the ETP-5345 NestJS app) is **automatic**: every merge to `main` that touches it is deployed to production by the [Deploy Public API gateway](../../.github/workflows/deploy-public-api.yml) workflow (section 0). It is not part of the SPA pipeline. Sections 1 to 7 are the manual procedure the workflow automates; keep them as the fallback when GitHub Actions is unavailable.

## 0. Automated deploy (default)

The workflow `.github/workflows/deploy-public-api.yml`:

- **Triggers** on push to `main` touching `gateway/**`, `public-api/**`, `package.json` (the core pin) or the workflow itself. On pull requests touching the same paths it only builds and smoke-tests the image; it never publishes or deploys.
- **Takes the core from the pin**, not from a local checkout: `schema_forge_core` is checked out at the git tag of the exact version in `package.json` (`@etendosoftware/schema-forge-core`). A core change reaches production when its bump PR (opened by `bump-core-on-release.yml`) reaches `main`.
- **Smoke-tests the image before publishing** (no configuration needed): `/healthz`, `/api` 200, `/api/openapi.json` 200, `/api/v1/products` without key 401.
- **Deploys by digest**, cloning the task definition revision the service is running (not the latest of the family), and verifies: rollout `COMPLETED`, every running task on the new revision, `HEALTHY` and with the expected digest, then the section 6 smoke checks through the public host.
- **Rolls back automatically** to the previous running revision if any step after registering the task definition fails.
- **Credentials:** AWS OIDC role `etendo-public-api-deploy` (only `main` of this repo can assume it; it can push only to `etendo/public-api-gateway` and update only this service). The core is read with the read-only deploy key secret `CORE_DEPLOY_KEY`.

**Rollback or redeploy:** Actions → "Deploy Public API gateway" → Run workflow on `main` with `redeploy_tag=<existing ECR tag>`. It goes through the same verification.

**Deployment record:** for automated deploys, each run's summary is the record (both full SHAs, core version, tag, digest, new and previous task definition revision). Manual deploys still add a row to section 8.

## 1. Purpose and when to use

Use this procedure (manual fallback) to build the gateway image from pinned sources, push it to ECR, roll the ECS service and verify it. For the routing around the service (CloudFront, ALB, target group) see [cloudfront-alb-routing.md](cloudfront-alb-routing.md), section "Public API gateway (production)".

> **Build only from a `main` SHA that was agreed for the deploy.** Since the public API merge block (ETP-5873, including #1877) the Dockerfile installs whatever `api-gateway-core` version `.schema_forge_core` packs (`etendosoftware-api-gateway-core-*.tgz`), and `gateway/package.json` asks for `^0.2.0`; a core checkout older than 0.2.0 must not be used.

## 2. Prerequisites

Tools (local machine or a build host):

- `git`, `docker` (BuildKit), `aws` CLI v2.
- The image must be `linux/amd64`: the service runs on Fargate and its task definition declares no `runtimePlatform`, so Fargate uses X86_64. Always pass `--platform linux/amd64`, especially when building on an Apple Silicon (arm64) machine.

Access (describe by role, never share credentials in this repo or in the record):

- Read access to the `etendosoftware/etendo_schema_forge` and `etendosoftware/schema_forge_core` repositories.
- An AWS profile `<aws-profile>` in account `<aws-account-id>`, region `<aws-region>`, allowed to: authenticate to and push to the ECR repository `etendo/public-api-gateway`; describe and register ECS task definitions; update the service `etendo-public-api-service` in cluster `etendo-production`; read the service's CloudWatch logs.
- Permission to pass the existing execution role when registering a new task definition revision (the task has no task role).

Today the deploy runs from a developer machine with that person's own IAM credentials (no shared deploy role or profile). Who holds ECR push and ECS update rights is tracked by DevOps, not in this repo.

## 3. Prepare sources at pinned SHAs

The Dockerfile build context is the **root of `etendo_schema_forge`**. It copies `gateway/package.json`, `gateway/tsconfig.json`, `gateway/src`, `gateway/public` and `public-api/`, plus the core package from `.schema_forge_core/packages/api-gateway-core`. The Dockerfile does not select a core branch or commit: whatever is in `.schema_forge_core` is what gets built. So the checkout must be explicit and its SHA recorded.

```bash
# Decide both SHAs first (full 40-char SHAs go in the deployment record).
SF_SHA=<etendo_schema_forge-sha>
CORE_SHA=<schema_forge_core-sha>

# 1. Clean etendo_schema_forge checkout at SF_SHA
git clone git@github.com:etendosoftware/etendo_schema_forge.git sf-build
cd sf-build
git checkout "$SF_SHA"
test -z "$(git status --porcelain)" || { echo "dirty tree, abort"; exit 1; }

# 2. schema_forge_core at CORE_SHA, exactly where the Dockerfile expects it
git clone git@github.com:etendosoftware/schema_forge_core.git .schema_forge_core
git -C .schema_forge_core checkout "$CORE_SHA"
test -z "$(git -C .schema_forge_core status --porcelain)" || { echo "dirty core, abort"; exit 1; }

# 3. Sanity check: the version the Dockerfile will pack
grep '"version"' .schema_forge_core/packages/api-gateway-core/package.json
grep 'api-gateway-core-' gateway/Dockerfile
```

Do not pack the tarball by hand. The Dockerfile build stage already runs `npm install`, `npm run build` and `npm pack` inside `packages/api-gateway-core`, then installs `/tmp/etendosoftware-api-gateway-core-<version>.tgz`. Step 3 above must show the same `<version>` in both lines; if they differ, stop (see the warning in section 1).

`.schema_forge_core` is not in the repo's `.gitignore` and there is no `.dockerignore`, so keep this checkout in a throwaway directory and never commit it.

## 4. Image tag and build

Tag convention, identifying both SHAs (7-char short SHAs):

```
sf-<etendo_schema_forge-short-sha>-core-<schema_forge_core-short-sha>
```

Example: `sf-a1b2c3d-core-e4f5a6b`. Never use `latest` for a deploy: it cannot be traced or rolled back.

```bash
TAG="sf-$(git rev-parse --short=7 HEAD)-core-$(git -C .schema_forge_core rev-parse --short=7 HEAD)"
ECR="<aws-account-id>.dkr.ecr.<aws-region>.amazonaws.com/etendo/public-api-gateway"

docker build --platform linux/amd64 -f gateway/Dockerfile -t "$ECR:$TAG" .
```

The final image runs `node dist/main.js` as user `node`, listens on port `4300` (`GATEWAY_PORT`) and serves `/app/public-api/base.v1.json` (`PUBLIC_API_SCHEMA_PATH`); `GATEWAY_PORT`, `PUBLIC_API_SCHEMA_PATH` and `NODE_ENV=production` are set in the image. The gateway reads `NEO_BASE_URL` at runtime to reach NEO through the internal ALB; it is not baked into the image and comes from the task definition environment. There are no secrets in the task definition today.

## 5. Push to ECR and update ECS

```bash
export AWS_PROFILE=<aws-profile> AWS_REGION=<aws-region>

aws ecr get-login-password | docker login --username AWS --password-stdin "<aws-account-id>.dkr.ecr.<aws-region>.amazonaws.com"
docker push "$ECR:$TAG"
```

The task definition family is `etendo-public-api-production`. Its only container is `public-api-gateway` (port 4300, no sidecars), on Fargate with 0.5 vCPU / 1 GB, logging to the CloudWatch group `/ecs/etendo-public-api-production` (stream prefix `gateway`). The service runs one task (`desiredCount` 1).

Register a new task definition revision that points the gateway container at the new tag, keeping everything else from the current revision:

```bash
aws ecs describe-services --cluster etendo-production --services etendo-public-api-service \
  --query 'services[0].taskDefinition' --output text          # note this as the PREVIOUS revision

aws ecs describe-task-definition --task-definition etendo-public-api-production \
  --query taskDefinition > td.json
# Edit td.json: set the image of container "public-api-gateway" to "$ECR:$TAG", and delete the
# read-only fields (taskDefinitionArn, revision, status, requiresAttributes, compatibilities,
# registeredAt, registeredBy) before registering.
aws ecs register-task-definition --cli-input-json file://td.json   # note the new revision number

aws ecs update-service --cluster etendo-production --service etendo-public-api-service \
  --task-definition <new-task-definition-arn-or-family:revision>
aws ecs wait services-stable --cluster etendo-production --services etendo-public-api-service
```

Confirm the rollout finished: `aws ecs describe-services` must show one deployment in `PRIMARY` state with `runningCount == desiredCount`, and the target group `etendo-public-api-production-tg` must report the new task healthy. Do not paste `td.json` anywhere: it may contain environment values.

## 6. Smoke check

The documentation entrypoints need no API key; only data operations under `/api/v1/*` do. All three checks run against the public host:

```bash
HOST=https://<public-app-host>   # the production app.etendo.ai host, see cloudfront-alb-routing.md

curl -fsS -o /dev/null -w '%{http_code}\n' "$HOST/api"                # expect 200 (docs page)
curl -fsS "$HOST/api/openapi.json" | head -c 200                      # expect OpenAPI JSON
curl -sS -o /dev/null -w '%{http_code}\n' "$HOST/api/v1/openapi.json" # expect 200
```

To prove `/api/v1/*` reaches the gateway without a key, request any data path without credentials and expect `401` with a JSON body from the gateway, not a CloudFront/ALB 404/502/503:

```bash
curl -sS -w '\n%{http_code}\n' "$HOST/api/v1/products"   # expect a JSON error body and 401
```

`/healthz` (returns `{"status":"ok"}`) is not routed to the gateway through the public host: there it returns `200` with the SPA's HTML, which proves nothing. It is checked internally instead, by the target group `etendo-public-api-production-tg` (HTTP on the traffic port, expects 200) and by the container's own ECS health check against `localhost:4300/healthz`; the new task reporting healthy in the target group covers it. Also check the new task's CloudWatch log stream for startup errors.

## 7. Rollback

Redeploy the previous recorded revision. The previous task definition revision is in the last row of the [Deployment record](#8-deployment-record), and in the `describe-services` output you noted in section 5.

```bash
aws ecs update-service --cluster etendo-production --service etendo-public-api-service \
  --task-definition <previous-task-definition-arn-or-family:revision>
aws ecs wait services-stable --cluster etendo-production --services etendo-public-api-service
```

Repeat the [smoke check](#6-smoke-check). The previous image tag must still exist in ECR; do not delete tags that appear in the record. Add a row for the rollback too, with the note "rollback of <tag>".

## 8. Deployment record

Automated deploys are recorded in their workflow run summary (section 0). **Rule: every manual deployment (including rollbacks) adds a row in the same PR or commit window, before the deploy is considered done.** Use full SHAs. Never put credentials, account IDs or ARNs in this table.

| Date (UTC) | etendo_schema_forge SHA | schema_forge_core SHA | Image tag | ECS task definition revision | Deployed by | Notes |
|---|---|---|---|---|---|---|
| 2026-09-16 | `cfb35e0e0bd58f2b1581f355fbc9f219c3650e8a` | `45a16a8ba6a8e998008f8ff8afff7966bce505cb` (not verified) | `etp-5345-cfb35e0e0` | `etendo-public-api-production:3` | gateway author | Built before this record existed, on a developer machine. The core SHA is inferred: it is the last change to `packages/api-gateway-core` before the build (the next one is from 2026-10-05), assuming the local `.schema_forge_core` was up to date. |
| 2026-10-28 | `1d5faa58c91c94391173e1aa97b759d81f13cd8d` | `ef9824a7dd6b29917e439772998a645303b2bf56` | `sf-1d5faa5-core-ef9824a` | `etendo-public-api-production:4` | DevOps | Last manual deploy, with the runbook script. Rollback target: `etendo-public-api-production:3`. Core `ef9824a` is tag `0.3.84`, the version pinned on `main` at the time. |

## Open points

- **Pin the core by version, not by a local checkout.** `api-gateway-core` is not published with the other `schema_forge_core` packages, so the image depends on whatever `.schema_forge_core` holds at build time. Publishing it in the core release would make the core version traceable from `gateway/package.json`. Infra sees no objection; the decision belongs to the core owners.
- **Rate limiting is per task.** The gateway's rate limit is kept in memory. With one task it is exact; scaling the service out multiplies the effective limit by the task count, so revisit it before raising `desiredCount`.

## Dockerfile notes

Observations from reading `gateway/Dockerfile` (not changed here):

- Before ETP-5873 the tarball name `...-0.1.0.tgz` was hardcoded and `gateway/package.json` asked for `^0.1.0`, so a 0.2.0 core broke the build. Both now follow the packed version (`*.tgz`, `^0.2.0`).
- No core branch or commit is pinned or checked by the Dockerfile; the result depends only on the contents of `.schema_forge_core` at build time. This runbook compensates with section 3 and the deployment record.
- There is no `.dockerignore`, so the full repo root, including any `node_modules` and `.git`, is sent as build context.
