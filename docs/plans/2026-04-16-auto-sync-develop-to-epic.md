# Auto-sync `develop` → `epic/ETP-3504`

## Context

The epic branch `epic/ETP-3504` is long-lived and integrates many feature PRs.
Meanwhile `develop` keeps moving (fixes from other epics, hotfixes, etc.).
Today the sync is manual: someone has to remember to merge `develop` into the epic
periodically (the latest one is commit `fcb6916b`, "Resolve merge conflicts with develop").

We want this to happen automatically on every push to `develop`, so the epic branch
never drifts more than one commit away from `develop`.

## Objective

On every push to `develop`, propagate the new commits to `epic/ETP-3504`:
- Without losing history (no squash, per project rule).
- Surfacing conflicts loudly instead of silently failing.
- Without bypassing branch protection on the epic.

## Options

### Option A — GitHub Action: direct merge `develop` → `epic`

Workflow triggered on `push` to `develop`. It checks out the epic, merges `develop`,
and pushes. If the merge has conflicts, the job fails and notifies (Slack / GH issue / PR comment).

```yaml
# .github/workflows/sync-develop-to-epic.yml
name: Sync develop → epic/ETP-3504

on:
  push:
    branches: [develop]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: epic/ETP-3504
          token: ${{ secrets.EPIC_SYNC_TOKEN }}  # PAT or GH App with write to epic

      - name: Configure git
        run: |
          git config user.name  "epic-sync-bot"
          git config user.email "epic-sync-bot@users.noreply.github.com"

      - name: Merge develop
        id: merge
        run: |
          git fetch origin develop:develop
          git merge --no-ff develop -m "Epic ETP-3504: Auto-merge develop ($(git rev-parse --short develop))"

      - name: Push
        run: git push origin epic/ETP-3504

      - name: Open issue on conflict
        if: failure() && steps.merge.outcome == 'failure'
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Auto-sync develop → epic/ETP-3504 has conflicts',
              body: 'Workflow run: ' + context.serverUrl + '/' + context.repo.owner + '/' + context.repo.repo + '/actions/runs/' + context.runId,
              labels: ['epic-sync', 'conflict'],
            });
```

**Pros**
- Simple, one workflow file, no external service.
- Push happens immediately, the epic stays at most ~minutes behind `develop`.
- Preserves history (`--no-ff` merge, no squash → respects project rule).

**Cons**
- Needs a token with write access on the epic branch (PAT, GH App, or branch protection exception for the bot).
- Conflicts → workflow fails; someone still has to resolve them manually. The auto-issue softens this but does not eliminate it.
- No CI runs against the merged result before pushing (we'd be pushing untested code into the epic).

### Option B — GitHub Action: open/update PR `develop` → `epic`

Same trigger, but instead of pushing directly, open (or update) a PR `develop → epic/ETP-3504`.
Optionally set `auto-merge` so it merges as soon as required checks pass.

```yaml
# .github/workflows/sync-develop-to-epic.yml
name: Sync develop → epic/ETP-3504

on:
  push:
    branches: [develop]
  workflow_dispatch:

permissions:
  contents: read
  pull-requests: write

jobs:
  sync-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create or update sync PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          set -e
          existing=$(gh pr list --base epic/ETP-3504 --head develop --state open --json number --jq '.[0].number')
          if [ -z "$existing" ]; then
            gh pr create \
              --base epic/ETP-3504 \
              --head develop \
              --title "Epic ETP-3504: Sync develop" \
              --body "Automatic sync of \`develop\` into \`epic/ETP-3504\`. Merge with **regular merge** (no squash) to preserve history." \
              --label epic-sync
          else
            echo "PR #$existing already open, will be updated by the new push automatically."
          fi
```

**Pros**
- All required checks (`test.yml`, `pr-architecture-alert.yml`, etc.) run against the merge before it lands, while core-file approval is enforced by the code-owner branch rule.
- No need for elevated tokens or branch-protection exceptions.
- Conflicts are visible in the PR UI, where reviewers can fix them.
- Plays nicely with the project rule "agents NEVER merge to develop/main" — this PR goes the other direction (develop → epic), still respects branch protection.

**Cons**
- Not "fully automatic": a human (or `gh pr merge --auto --merge`) has to land the PR.
- Same PR keeps growing as `develop` moves; CI re-runs each push.

### Option C — Mergify / Kodiak (external bot)

Configure a YAML rule in `.mergify.yml`:

```yaml
pull_request_rules:
  - name: Keep epic in sync with develop
    conditions:
      - base=epic/ETP-3504
      - head=develop
    actions:
      merge:
        method: merge   # never squash
```

Combined with a Mergify "queue" or scheduled action that opens the sync PR.

**Pros**
- Battle-tested, extensive rule engine (auto-rebase, conditional merging, queues).
- No GH Action maintenance.

**Cons**
- External SaaS dependency, needs install + auth on the org.
- Overkill if Option A or B already covers our needs.

### Option D — Scheduled cron (nightly sync)

Same as Option A but trigger on `schedule: '0 6 * * *'` instead of `push`.

**Pros**
- Predictable, low noise (one merge per day).

**Cons**
- Epic can drift a full day → bigger conflicts when they appear.
- Doesn't react to urgent fixes landing on `develop`.

## Recommendation

**Option B (open/update PR) as the default**, with the following tweaks:
- Auto-create the PR on every push to `develop`.
- Add `--label epic-sync` so we can filter/track these PRs separately.
- Enable GH "auto-merge" with method = merge (never squash) so it lands as soon as
  the existing required checks (`test`, etc.) pass and any required code-owner approval is present.
- On conflict, the PR stays open and waits for a human — which is the right behavior
  for a long-lived epic with multiple parallel features.

Reasons:
- Respects the project rule of preserving history (`--merge`, no squash).
- Reuses existing CI without adding new tokens or branch-protection exceptions.
- Conflicts are surfaced in the place where they're easiest to resolve (the PR).
- Keeps the epic branch always reflecting a state that has passed CI.

If we ever decide that "PR fatigue" is too high, we can graduate to Option A
(direct merge with auto-issue on conflict) — the migration is trivial.

## Open questions

- Do we want a single rolling PR that keeps getting updated, or a fresh PR per push?
  Recommendation: single rolling PR (less noise, simpler tracking).
- Who should be the assignee/reviewer of the auto-PR? `sebastianbarrozo`?
- Should we extend the same automation to the **etendo-go** sibling repo
  (per `docs/branch-workflow.md` both repos share branches)? Almost certainly yes
  — same workflow, different repo.
- Do we want a Slack/Telegram notification on conflict, on top of the PR staying open?

## Next steps

1. Confirm Option B with the user.
2. Decide on rolling PR vs per-push PR.
3. Implement `.github/workflows/sync-develop-to-epic.yml` in this repo.
4. Mirror the workflow in `com.etendoerp.go`.
5. Validate with a manual `workflow_dispatch` run before relying on the `push` trigger.

## Validation log

- **2026-04-16** — End-to-end smoke test. After landing the workflow on
  `develop`, the rerun on the merge commit (run `24525016090`, attempt 2) opened
  the rolling sync PR `#340` (`develop -> epic/ETP-3504`) with the expected
  label, assignee, and auto-merge armed (`MERGE`, no squash).
