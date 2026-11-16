---
name: jenkins
description: >
  Read the two Etendo Jenkins instances (jenkins-go.etendo.cloud and jenkins2.etendo.cloud)
  through `make jenkins`: list jobs, see which repo/branch/Jenkinsfile a job builds from, its
  webhook filter and parameters, its last builds and a build's console log. Use when a question
  needs live Jenkins data: "which branch does etendo-prod deploy from", "why did the build fail",
  "what triggers this job", "last runs of the merge block". Read-only by design, and meant to
  grow: when a question cannot be answered with the current commands, add a GET-only command to
  `scripts/jenkins.mjs` and record what was learned here. Triggers on: "jenkins", "jenkins-go",
  "jenkins2", "job de jenkins", "pipeline de jenkins", "build de jenkins", "etendo-prod",
  "deploy a producción", "deploy a staging", "consola del build", "por qué falló el build",
  "qué rama despliega", "webhook del job".
---

# Jenkins (read-only)

Etendo runs two Jenkins. This skill reads both through one client, `scripts/jenkins.mjs`, exposed
as `make jenkins`. Pipeline **code** lives in the Bitbucket repo
`koodu_software/com.etendoerp.jenkins.pipelines` (checked out at
`etendo_develop/com.etendoerp.jenkins.pipelines`); this skill answers what the **servers** run.

| Instance | URL | What runs there |
|---|---|---|
| `go` | https://jenkins-go.etendo.cloud | Etendo GO deploys (`etendo-prod`, …) |
| `ci` | https://jenkins2.etendo.cloud | CI jobs, `cell-dashboard` (read by `etendo-kpis`) |

## Setup

Credentials live in the tool's own config file, **outside the repo** and shared by every
checkout and worktree: `~/.config/etendo-jenkins/config.json` (another path with
`JENKINS_CONFIG`). Nothing goes in `schema_forge/.env`; the client does not read environment
credentials. Create it once:

```bash
make jenkins ARGS="init"     # writes the template, mode 600; never overwrites
```

```json
{ "instances": {
    "go": { "url": "https://jenkins-go.etendo.cloud", "username": "…", "apiKey": "…" },
    "ci": { "url": "https://jenkins2.etendo.cloud",   "username": "…", "apiKey": "…" } } }
```

`apiKey` is a Jenkins **user API token** (profile → Configure → API Token), one per instance.
Both instances use Jenkins' own user database (login form), so `"password"` with the login
password also works instead of `apiKey`; prefer the token, which can be revoked on its own and
is not the login.
Another Jenkins is added as one more named entry with its `url`; no code change. Check with
`make jenkins ARGS="go whoami"`. If a field is missing the client names it and the file; ask
the user to fill it, never guess or reuse a token from elsewhere. The client warns when the file
is readable by others.

## Commands

`make jenkins ARGS="<go|ci> <command> [args]"` (or `node scripts/jenkins.mjs …`); `make jenkins-help`.
A `--filter` regex with `(` or `|` breaks inside `make ARGS="…"`; call
`node scripts/jenkins.mjs ci jobs --filter 'a|b'` directly for those.

| Command | Answers |
|---|---|
| `whoami` | Are the credentials valid, whose are they |
| `jobs [--filter <regex>]` | Every job (folders included) with its last result |
| `job <job>` | Where the pipeline comes from (repository, **branch**, Jenkinsfile path or inline script), webhook filter, parameters with defaults, last 5 builds |
| `config <job>` | `config.xml` with tokens, passwords and secrets replaced by `[redacted]` (anything `job` does not summarize) |
| `builds <job> [-n N]` | Last N builds: result, start, duration, cause, parameters |
| `log <job> [<build>] [--tail N]` | Console output (default `lastBuild`) |

`<job>` is the path printed by `jobs` (`folder/sub/job`), a `job/a/job/b` path, or a full job URL
(e.g. the `…/configure` URL a user pastes). URLs of the other instance are refused.

## Typical questions

- **Which branch of the pipelines repo does a job run?** `job <job>` → `branch` and `Jenkinsfile`.
  Then read that file on that branch in the pipelines repo
  (`git -C ../com.etendoerp.jenkins.pipelines show origin/<branch>:<path>`). Deploy pipelines may
  live on a long-running branch, not on `develop`.
- **What triggers a job?** `job <job>` → `webhook` (Generic Webhook Trigger filter text ~ regex).
- **Why did a build fail?** `builds <job> -n 5`, then `log <job> <number> --tail 300`.
- **What does a job pass to its pipeline?** `job <job>` → `param` lines; per build, `builds`.

## Rules

1. **GET only.** The client never triggers builds, edits config, aborts or deletes. Do not add a
   command that writes (`POST` to `build`, `buildWithParameters`, `config.xml`, `stop`, `doDelete`,
   credentials…) unless the user explicitly asks for that operation in the conversation; if they
   do, make it a separate command that states what it changes and asks for confirmation.
2. **Tokens never leave their instance** and are never printed, logged or written anywhere but
   the config file. Every command masks what it can recognize (`[redacted]`): secret elements of
   `config.xml`, credentials in URLs, `Authorization` headers, `name=value` pairs named like a
   secret, password parameters, Jenkins-encrypted values, GitHub tokens, AWS keys, private keys.
   The masking is best effort: still quote only the lines needed from a log. A new command must
   pass its output through `redactText` (or `redactConfig` for XML).
3. **Live data beats this file.** The "Known jobs" table below is a cache with dates; re-check
   with `job` before acting on it.

## Growing this skill

This skill is meant to expand. When a question cannot be answered with the commands above:

1. **Add a command to `scripts/jenkins.mjs`** that answers it with GET requests to the Jenkins
   REST API (`/api/json?tree=…`, `/config.xml`, `/consoleText`, `/wfapi/…`, `/queue/api/json`,
   `/computer/api/json`, `/credentials/…/api/json` names only, never secrets). Keep the shape of
   the existing ones: a function in `commands`, arguments validated before any request, errors
   that say what to fix. Parsing logic goes in an exported function.
2. **Test it** in `scripts/__tests__/jenkins.test.js` with fixtures (no network): the parsing and
   the argument checks. Run `node --test scripts/__tests__/jenkins.test.js`.
3. **Document it here**: a row in the Commands table, and a line in "Typical questions" if it
   answers a recurring one. Update the `HELP` text in the script the same way.
4. **Record what you learned** in "Known jobs" (job → what it does, source repo/branch/file, date
   checked) and anything surprising in "Notes", so the next session starts from it.
5. Run `make sync-agents` so the `.agents/skills/` mirror stays in step.

Ideas not built yet (add them when a task needs them): pipeline stage timings (`/wfapi/runs`),
the build queue and why an item waits, agents/nodes status, a diff between two jobs' configs,
which jobs read a given Jenkinsfile path, test results of a build (`/testReport/api/json`).

## Known jobs

All sources are the Bitbucket repo `koodu_software/com.etendoerp.jenkins.pipelines` unless noted.

| Instance | Job | What it does | Branch · file | Trigger | Checked |
|---|---|---|---|---|---|
| `go` | `etendo-prod` | Deploy to production | `feature/ETP-3604` · `etendo-go-staging/JenkinsfileProduction` | Webhook, push to `main` (`REPOSITORY_NAME=com.etendoerp.go`) | 2026-11-12 |
| `go` | `etendo-go-experimental` | Deploy to experimental | `feature/ETP-3604` · `etendo-go-staging/JenkinsfileExperimental` | Webhook, push to `develop` | 2026-11-12 |
| `go` | `etendo-datafixes` | Tenant data-fixes in production, manual only | `feature/ETP-3604` · `etendo-go-staging/JenkinsfileDatafixes` | Manual | 2026-11-12 |
| `go` | `test-delta-validation` | One run, April 2026 | not read | — | 2026-11-12 |
| `ci` | `etendo-go-tests` | CI of `com.etendoerp.go` PRs | `develop` · `etendo-go/go/Jenkinsfile` | Webhook: PRs and push to `main` | 2026-11-12 |
| `ci` | `schema-forge-tests` | CI of `etendo_schema_forge` PRs | `develop` · `etendo-go/schemaforge/Jenkinsfile` | Webhook: PRs and push to `main` | 2026-11-12 |
| `ci` | `experimental-etendo-go-tests` | Full validation (`run-experimental`, merge block) for `go` | **`feature/ETP-6069`** · `etendo-go/experimental/ExperimentalJenkinsfile` | Webhook + label | 2026-11-12 |
| `ci` | `experimental-schema-forge-tests` | Same for schema_forge | **`feature/ETP-5951`** · `etendo-go/experimental/ExperimentalSchemaForgeJenkinsfile` | Webhook + label | 2026-11-12 |
| `ci` | `Auto-Mergeblock` | Automatic merge block cut | `develop` · `etendo-go/mergeblock/Jenkinsfile` | Schedule | 2026-11-12 |
| `ci` | `Manual-Mergeblock` | Manual merge block cut | `develop` · `etendo-go/mergeblock/ManualJenkinsfile` | Manual | 2026-11-12 |
| `ci` | `cell-dashboard` | `dashboard.json` per product cell (read by `etendo-kpis`) | **`feature/ETP-5872`** · `etendo-go/cell-dashboard/Jenkinsfile` | Daily 03:00 UTC | 2026-11-12 |
| `ci` | `etendo-go-regen-check` | Multibranch job of `etendo_schema_forge` | schema_forge · `pipelines/Jenkinsfile` | Per branch | 2026-11-12 |

## Notes

- 2026-11-12: the deploy pipelines (`etendo-go-staging/`) exist only on branch `feature/ETP-3604`
  of the pipelines repo, not on `develop`. On `jenkins-go` only `JenkinsfileProduction`,
  `JenkinsfileExperimental` and `JenkinsfileDatafixes` are wired to a job; `Jenkinsfile` and
  `JenkinsfileStaging` are not used by any job there (not checked on `ci` beyond the jobs above).
- 2026-11-12: `feature/ETP-3604` works as the integration branch of the deploy pipelines: PRs are
  merged straight into it (e.g. ETP-6217, ETP-5867), and the three `jenkins-go` jobs check out its
  tip on every run (no lightweight checkout, no pinned commit). A change to a deploy pipeline is a
  PR into `feature/ETP-3604`, not into `develop`. All three use the same SSH credential, concurrent
  builds disabled; `etendo-prod` and `etendo-go-experimental` are Generic Webhook Trigger jobs on
  GitHub push events (`$.ref`, `$.after`, `$.repository.name`, `$.deleted`, `$.pusher.name`).
- 2026-11-12: several jobs do **not** run the pipelines repo's `develop`: the two experimental test
  jobs (`feature/ETP-6069`, `feature/ETP-5951`) and `cell-dashboard` (`feature/ETP-5872`). A change
  merged to `develop` does not reach them until those branches take it.
- 2026-11-12: Bitbucket moves SSH to `ssh.bitbucket.org` from that day. Jobs whose repository is
  still `git@bitbucket.org:` (`etendo-go-tests`, `schema-forge-tests`, the experimental ones,
  `Auto-Mergeblock`, `cell-dashboard`) may lose access; `etendo-prod` and `Manual-Mergeblock`
  already use `ssh.bitbucket.org`.
