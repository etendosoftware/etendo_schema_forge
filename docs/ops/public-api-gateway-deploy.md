# Public API Gateway: Build and Deploy Runbook

ETP-5862, ETP-6024. Deployment of the public API gateway (`gateway/`, the ETP-5345 NestJS app) is **automatic**: every merge to `main` that touches it is deployed to production by the [Deploy Public API gateway](../../.github/workflows/deploy-public-api.yml) workflow (section 0). It is not part of the SPA pipeline. The sections below describe the manual procedure and CI setup; keep them as the fallback when GitHub Actions is unavailable.

## 0. Published gateway dependency (ETP-6150)

The gateway, deployment workflow and Public API E2E installer consume the exact
`@etendosoftware/api-gateway-core` version in `gateway/package.json` from GitHub Packages.
No Schema Forge Core checkout or tarball build is needed. Installation must leave
`gateway/package.json` unchanged; the workflow retains its `git diff --quiet` guardrail.

The gateway pins stable `0.3.120`. Authenticated registry metadata verified this
published version and its `latest` tag on 2026-11-20, after Core PR #400 merged
and the integrated changes were promoted to `main`.

For future updates, promoting integrated Core changes to `main` runs `release.yml`
(the promotion workflow dispatches it explicitly), which resolves the lockstep
release version and publishes `api-gateway-core` with `latest`. Verify the actual
published stable version before updating the gateway pin; do not infer availability
from Core's source package.json. The workflow also accepts preview pins for testing,
so choosing a stable pin before production promotion remains a release responsibility.

The existing automated smoke checks, digest deployment and rollback remain unchanged.
Image tags keep `sf-<7-character frontend SHA>-core-<7-character SHA256 of package version>`;
older rollback tags remain valid. The deployment summary records the package version.

## 1. Registry access and manual build

GitHub Actions uses `ETENDOBOT_TOKEN` with `read:packages` and access to the private
package. Jenkins/local npm needs the same registry authorization in the user's npmrc:

```ini
@etendosoftware:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

For Docker, pass an npmrc containing a resolved read token as a BuildKit secret;
never pass it as a build argument or copy it into the image. Delete the temporary
file after the build. The workflow creates and removes this temporary secret itself.

```bash
node scripts/lib/pack-gateway-core.mjs gateway --build
PACKAGE_VERSION=$(node -p 'require("./gateway/package.json").dependencies["@etendosoftware/api-gateway-core"]')
PACKAGE_ID=$(printf '%s' "$PACKAGE_VERSION" | sha256sum | cut -c1-7)
TAG="sf-$(git rev-parse --short=7 HEAD)-core-$PACKAGE_ID"
ECR="<aws-account-id>.dkr.ecr.<aws-region>.amazonaws.com/etendo/public-api-gateway"
docker build --platform linux/amd64 --secret id=npmrc,src=<resolved-token-npmrc> -f gateway/Dockerfile -t "$ECR:$TAG" .
```

The build installs development dependencies, compiles NestJS, and prunes them before
copying production `node_modules` and `dist` to the final non-root Node image.

## 2. Jenkins Public API E2E

The checked-in `scripts/public-api-e2e-ci.mjs install` no longer clones or archives
Core. Run `make public-api-e2e-ci-install` with npm registry credentials, then the
existing E2E command against NEO. Remove any external Jenkins stage cloning
`schema_forge_core` solely for this suite, and remove `PUBLIC_API_CORE_DIR` and
`PUBLIC_API_CORE_REPO`; preserve the functional checkout, NEO provisioning and
E2E account credentials. `pipelines/Jenkinsfile` in this repo is the regeneration
pipeline; the full Public API E2E job definition is administered externally.

## 3. Push to ECR and update ECS

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

## 4. Smoke check

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

## 5. Rollback

Redeploy the previous recorded revision. The previous task definition revision is in the last row of the [Deployment record](#6-deployment-record), and in the `describe-services` output you noted in section 3.

```bash
aws ecs update-service --cluster etendo-production --service etendo-public-api-service \
  --task-definition <previous-task-definition-arn-or-family:revision>
aws ecs wait services-stable --cluster etendo-production --services etendo-public-api-service
```

Repeat the [smoke check](#4-smoke-check). The previous image tag must still exist in ECR; do not delete tags that appear in the record. Add a row for the rollback too, with the note "rollback of <tag>".

## 6. Deployment record

Automated deploys are recorded in their workflow run summary (section 0). **Rule: every manual deployment (including rollbacks) adds a row in the same PR or commit window, before the deploy is considered done.** Use full SHAs. Never put credentials, account IDs or ARNs in this table.

| Date (UTC) | etendo_schema_forge SHA | schema_forge_core SHA | Image tag | ECS task definition revision | Deployed by | Notes |
|---|---|---|---|---|---|---|
| 2026-09-16 | `cfb35e0e0bd58f2b1581f355fbc9f219c3650e8a` | `45a16a8ba6a8e998008f8ff8afff7966bce505cb` (not verified) | `etp-5345-cfb35e0e0` | `etendo-public-api-production:3` | gateway author | Built before this record existed, on a developer machine. The core SHA is inferred: it is the last change to `packages/api-gateway-core` before the build (the next one is from 2026-10-05), assuming the local `.schema_forge_core` was up to date. |
| 2026-10-28 | `1d5faa58c91c94391173e1aa97b759d81f13cd8d` | `ef9824a7dd6b29917e439772998a645303b2bf56` | `sf-1d5faa5-core-ef9824a` | `etendo-public-api-production:4` | DevOps | Last manual deploy, with the runbook script. Rollback target: `etendo-public-api-production:3`. Core `ef9824a` is tag `0.3.84`, the version pinned on `main` at the time. |

## Open points

- **Future package updates require registry verification.** Keep the exact stable pin in `gateway/package.json` aligned with the release verified in section 0.
- **Rate limiting is per task.** The gateway's rate limit is kept in memory. With one task it is exact; scaling the service out multiplies the effective limit by the task count, so revisit it before raising `desiredCount`.

## Dockerfile notes

- The Dockerfile installs the exact published dependency in `gateway/package.json`; it does not clone or pack Core source.
- Registry credentials are mounted only during installation as a BuildKit secret and are absent from the final image.
- There is no `.dockerignore`, so the full repo root, including any `node_modules` and `.git`, is sent as build context.
