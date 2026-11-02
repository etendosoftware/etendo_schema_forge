# Branch & Worktree Workflow

Rules for branch management, worktree isolation, and merging in the Schema Forge pipeline.

## Worktree Isolation (MANDATORY)

Every task runs in an isolated git worktree. No exceptions.
The worktree branch is created FROM the current branch, and PRs target that same branch.

```bash
CURRENT_BRANCH=$(git branch --show-current)
git worktree add .worktrees/feat-<task-name> -b feat/<task-name>
```

All agents work ONLY in that worktree — never in the main repo.
The coordinator creates the worktree and passes the path to each agent.

**Worktree branches are LOCAL ONLY.** They are never pushed to remote.

### After All Phases Approve (Local Merge)

1. Coordinator switches to the parent branch: `git checkout feature/ETP-XXXX`
2. Merge the worktree branch: `git merge feat/<task-name>` (preserves full commit history)
3. Clean up: `git worktree remove .worktrees/feat-<task-name> && git branch -d feat/<task-name>`

On rejection: DEV fixes in the SAME worktree, cycle restarts from the rejecting phase.

## Parallelization

- Independent tasks → parallel worktrees
- Within a task → sequential pipeline

## Branch Model (MANDATORY)

**Update (ETP-5695): develop integrates continuously and main gets one cut a day.** Every
task enters `develop` through its own PR once its mini pipeline passes; the day's merge block is
no longer a batch of feature merges but a **cut of `develop`** that reaches `main` through one PR
with the full pipeline. (The epic tier was retired on 2026-08-30: an `epic/ETP-XXXX` branch is
never a base or a PR target.)

```
main     (protected — production; PRs must be up to date)
  ▲ cut: mergeblock/ETP-XXXX = develop at a chosen commit + origin/main   (once a day)
  │ hotfix/*
  │
develop  (protected — staging and integration point; PRs need NOT be up to date)
  ▲ feature/ETP-AAAA  →  PR, mini pipeline
  ▲ feature/ETP-BBBB  →  PR, mini pipeline
  ▲ main → develop    →  PR opened by an Action when main moves; merges itself when green
```

### Hierarchy and merge rules

| Merge | Gate | Who merges |
|-------|------|------------|
| `feature → develop` | PR checks: mini pipeline (schema_forge: `Mocked E2E`; com.etendoerp.go: `goTest`, the Java tests without and with a database), `Tests`, `Sonar Build`, `verify`, review, code-owner gate | **Human**, in GitHub, merge commit |
| `main → develop` | PR checks; `back-merge-main.yml` opens it when main moves | **Auto-merge** once the checks pass; its assignee when it conflicts |
| `mergeblock → main` (the cut) | Full Jenkins pipeline, integration included; every required check green; branch up to date with main | **Human only** |
| `hotfix → main` | Full pipeline | **Human only**; comes back at once through `main → develop` |

### Key rules

- **Features branch FROM `develop`** (always `git fetch`/`pull` first for freshness) and PRs **target `develop`**.
- **Each author resolves their own conflicts with `develop`.** A PR does not have to be up to date with `develop` to merge, only free of conflicts; `main` does require it, and the cut provides it by merging `origin/main` in.
- **Agents NEVER merge to `develop` or `main`.** Every merge into them is a manual, supervised operation.
- **Only the cut and hotfixes target `main`.** Feature PRs and `develop` itself never do (`.github/workflows/branch-merge-policy.yml` enforces it).
- **Branch protection applies to admins too** (`enforce_admins` on `develop` and `main`): nobody merges with a required check red or pending, and nobody pushes directly. See § Emergency bypass of branch protection.
- **NEVER use squash merge.** Always use regular merge (`--merge`) to preserve full commit history. Squash discards individual commits and breaks traceability.
- **Always assign the PR to the current user.**
- **GitHub usernames must be stored in auto-memory** (not committed). On first interaction, look up the current user's GitHub username and any known reviewers, and save them to auto-memory for future use. **CRITICAL:** Before ANY GitHub operation, read the `github-usernames.md` file from the auto-memory directory (`~/.claude/projects/.../memory/github-usernames.md` — use the absolute path, NEVER a path relative to the project root). NEVER assume, hardcode, or guess a username — if no username is stored, ask the user and save it immediately.

## Daily Cut — develop into main (ETP-5695)

`main` is **production** and `develop` is **staging**, so the cut is a real deploy window. It covers
`etendo_schema_forge` and `com.etendoerp.go` together. `schema_forge_core` is not cut: it goes by
version (§ schema_forge_core versions).

### Order of operations

```
1. main → develop        before every cut, always
2. cut                   mergeblock/ETP-XXXX from develop + origin/main, in both repos
3. mergeblock → main     PR, full pipeline; green → human merges → production
```

1. **Bring main into develop, every time.** The `main → develop` PR, merged before cutting.
   `back-merge-main.yml` opened it when main last moved and it merges itself once green, so this step
   normally finds it done; a PR still open is red or conflicting, and waits for its assignee. Hotfixes
   and the fixes made on a cut already come back right after they enter main (§ Back to develop);
   this step brings whatever is left, at least the previous cut's merge commit. Before step 2,
   `git log --oneline origin/develop..origin/main` (merge commits included) must print nothing. Doing it every time gives two things:
   - **Hotfixes come back.** Until they do, develop (staging) and every branch cut from it run without
     the fix, and the cut is tested without it.
   - **The cut is born up to date.** main requires its PRs to be up to date. When develop already
     contains main, so does the cut branch; otherwise GitHub asks for *Update branch*, which adds an
     untested merge commit to the cut and re-runs the full pipeline, more than another hour.
2. **Cut.** Blockie (`merge-block-helper`) lists the tasks merged into develop since main and their
   checks, proposes the cut point (develop's head, or the last commit before a task that went in red)
   and, on an explicit OK, creates `mergeblock/ETP-XXXX` at that commit with `origin/main` merged in.
   After step 1 that merge does nothing; it only matters when the cut point is older than the
   `main → develop` merge (cutting one task earlier) or main moved in between.
   The human pushes the branches; Clerk opens the PRs to `main` on request. Then announce in the
   team chat which tasks the cut carries; Blockie's list from this step is the usual source.
3. **Full pipeline.** Jenkins runs everything there, integration included. Only when every required
   check is green, Jenkins included, the human merges in both repos and production updates (branch
   protection refuses an earlier merge, admins included). Red → the failure ladder below.

### Who does what

| | Create the PR | Approve | Merge |
|---|---|---|---|
| `feature → develop` | Clerk or the author | Team reviewers | **Human** |
| `main → develop` | **`back-merge-main.yml`**, when main moves | None; in com.etendoerp.go `github-actions[bot]` approves it anyway | **Auto-merge** once green; its **assignee** when it conflicts |
| `mergeblock → main` (the cut) | **Clerk** (on request) | Team reviewers | **Human only** |
| `mergeblock/auto-* → main` (the automatic cut) | **The merge block job**, as etendobot | None | **The job**, once every PR is green; it closes them at the deadline |

The cut and `main → develop` are the **only** PRs an agent may open towards `main` or out of it.

### Rules

- **Agents never approve and never merge** these PRs. They only open them.
- **PR title of the cut:** `Feature ETP-XXXX: Merge block DD-MM`, where `ETP-XXXX` is the day's
  merge-block task — plain ASCII, no quotes or apostrophes (Git Police closes a PR whose title
  carries them, see
  `.claude/agents/workflow.md` § pr_conventions).
- **Nothing new in develop means no cut.** If `git log origin/main..origin/develop` lists no task
  merge, skip the day.
- Blockie's 🔴 flag on a `feature/*` PR targeting `main` still applies.

### The merge-block branch

Each cut day gets **one Jira task** (`Merge Block DD/MM`, type Task, filed under whatever epic the
team tracks release work in — Jira bookkeeping only) and **one branch per repo** named after it:

```
mergeblock/ETP-XXXX      in etendo_schema_forge and com.etendoerp.go
```

- **Cut it from `develop` at the agreed commit, after a fresh `git fetch`,** then merge `origin/main`
  into it. Nobody merges feature branches into it any more.
- **No upstream.** Create it with `--no-track` (or run `git branch --unset-upstream`): a branch
  created from `origin/develop` would otherwise track develop, and a stray `git push` would land there.
- **It counts as a `feature` branch for Git Police.** Its commits use `Feature ETP-XXXX: ...`, where
  `ETP-XXXX` is the merge-block task, never `Epic` or `Merge`, 80 characters at most on the first line.
- **The only commits made on it** are the test fixes and reverts of the failure ladder.

### When the cut's pipeline fails

The batch does not wait for the slowest task: what cannot be fixed quickly leaves the cut and enters
the next one. Walk the rungs in order, cheapest first.

0. **Re-run the failed job.** A test in `e2e/quarantine.json`, in the flake log of
   `docs/testing/flaky-tests.md`, or one that passed on its retry is probably a flake: re-run before
   touching anything, and log it. If it fails again, it is not a flake.
1. **Cut one task earlier.** Find the merge that brought the failure: the one that added or last
   changed the failing test or the code it covers
   (`git log --first-parent origin/main..mergeblock/ETP-XXXX -- <paths>`). If it is at or near the
   tip of the cut, re-cut at its first parent, merge `origin/main` again, and update the branch with
   `git push --force-with-lease` (the block branch is the only branch ever force-pushed). The task
   enters tomorrow, untouched. When the merge sits in the middle of the day, this would drop
   everything after it: go to rung 2 or 3.
2. **Fix tests only, one attempt.** An outdated test (an assertion, a renamed label, a mock that fell
   short) is fixed on the block branch, in test files only. Product code is never fixed on the cut:
   its author never reviewed that change, made under time pressure. One attempt, since every run of
   the full pipeline costs more than an hour. The fix reaches develop through a `main → develop` PR
   right after the cut merges (§ Back to develop).
3. **Revert.** Product code involved, a cause nobody understands, or rung 2 failed: revert the task's
   merge on the block branch (`git revert -m 1 <merge>`).
   - More than one task: revert in **reverse merge order**. If reverting one does not turn the cut
     green, revert the ones involved together and let their authors coordinate, rather than trying
     combinations.
   - **Revert in develop at once,** through a PR with the same revert, not at the next cut: anyone who
     branches from develop that afternoon would otherwise inherit the broken code and find it in
     their own PR.

### The automatic afternoon cut (ETP-6040)

The cut above is made by hand in the morning, by the day's owner. A second cut a day is automatic: a
Jenkins job of `com.etendoerp.jenkins.pipelines` (`etendo-go/mergeblock/Jenkinsfile`, which runs
`etendo-go/utils/auto-cut/auto-cut.mjs`) cuts develop in the afternoon and merges the cut itself once
it is green. It runs every 15 minutes from 16:00 to 20:59 on weekdays, Buenos Aires time, and each run
does two things:

1. **Merges the open automatic cut** once every one of its PRs is clean and green:
   `com.etendoerp.go` first, then `etendo_schema_forge`, never one without the other.
   - A red PR is mailed once and labelled `auto-cut-failed`. The cut's owner walks the failure ladder
     (§ When the cut's pipeline fails) on its branch, and the job merges it as soon as it is green
     again.
   - At `AUTO_CUT_DEADLINE` (20:00) it stops merging: a cut not merged by then gets
     `auto-cut-expired`, a comment saying why, and its PRs are closed. What it carried is still in
     develop and goes in the next cut.
2. **Cuts,** from `AUTO_CUT_TIMES` (16:00): `mergeblock/auto-YYYYMMDD-HHMM` from develop in every repo
   where develop carries something main lacks, with `origin/main` merged in, and one PR per repo to
   `main`. The PRs are titled `Mergeblock DD/MM HH:MM (auto)`, labelled `auto-cut` and assigned to the
   day's owner; their body names the owner and carries the task table the team posts in the chat.
   The automatic cut has no Jira task: its branch is named by date and time.

**What holds the cut.** When develop carries tasks to cut, it is not cut while:

- a merge into `main` is in progress: a `mergeblock/*` PR (the morning cut, or an earlier automatic
  one) or a `hotfix/*` PR into `main` that is open and not a draft. Main is about to move, and a cut
  made now would be born behind it. When an open merge block already has every task develop
  carries, there is nothing to cut;
- develop lacks main's commits, because the `main → develop` PR (§ Back to develop) has not merged
  yet: the same reason, after the merge into main;
- develop's head has failing checks.

The run in the first 15 minutes after the cut time tries the cut. While something holds it, every next
run tries again, until the next cut time or the deadline, also when the merge in progress ends with
red checks. The first try mails what holds it (each merge in progress with whether its checks are
green, running or red), the last one mails that the cut was skipped, and the runs between stay quiet.
A cut made late in that window may not get through the full pipeline, about two hours, by the
deadline, and is then closed.

**The day's owner.** Every cut of a day goes to the owner of that day's first cut: the morning cut's
author, who is the person on the schedule. A day without a cut yet goes to the person after the
previous day's owner in `AUTO_CUT_OWNERS`. Mails go to the team (`email_builds`) and to the owner.

**The configuration lives in the Jenkins job,** not in a repo, so changing it needs no commit. Jenkins
passes the job's parameters to the script; one left out of the job takes its default.

| Parameter | Type | What |
|---|---|---|
| `AUTO_CUT_OWNERS` | Multi-line String | The merge block owners in schedule order, one `Name, GitHub login, email` per line |
| `AUTO_CUT_TIMES` | String | `HH:MM` of each cut, comma-separated (default `16:00`) |
| `AUTO_CUT_DEADLINE` | String | `HH:MM` from which it no longer merges (default `20:00`) |
| `DRY_RUN` | Boolean | Anything but `false` reads and mails, but writes nothing to GitHub |
| `AUTO_CUT_MAIL_TO` | String | Recipients instead of the team and the owner, for trying the job out |

A run started by hand tries the cut at once, whatever the time.

### Back to develop

Whatever enters `main` comes back to `develop` at once, through a `main → develop` PR: a hotfix, or a
test fix or revert made on the cut. Developers and new branches get the fix within minutes instead of
at the next cut, and their PRs stop failing on it. A clean cut, with no commits of its own, only
brings its merge commit: merge that PR any time before the next cut, it is step 1.

Nobody opens that PR by hand. `.github/workflows/back-merge-main.yml`, in both repos, runs
`scripts/back-merge-main.sh` on every push to `main`:

- When `develop` lacks any of main's commits and no `main → develop` PR is open, it opens one titled
  "Merge main into develop". An open one follows `main` by itself, so there is never a second.
- The body lists main's own commits (hotfixes, fixes made on the cut), or says it only carries merge
  commits, and lists the conflicting files when there are any.
- It assigns the PR to the GitHub user of main's last commit: after a cut or a hotfix, its merge
  commit, so whoever merged it (falling back to `merged_by` of that commit's PR). When etendobot
  merged it, as the merge block job does with an automatic cut, it takes that PR's assignee, the
  cut's owner. Never etendobot.
- Without conflicts it turns on auto-merge (merge commit), so GitHub merges it once the required
  checks pass: that code was already reviewed and passed the full pipeline on its way into `main`.
  In com.etendoerp.go the workflow also approves it with `GITHUB_TOKEN`, as `github-actions[bot]`,
  for when develop requires an approval: GitHub never lets the PR's author approve it.
- With conflicts it does neither: the PR waits for its assignee.
- An open PR gets whatever of that it lacks on the next run.
- It uses `ETENDOBOT_TOKEN`: a PR opened with `GITHUB_TOKEN` triggers no workflow, so its required
  checks would never report.

If the PR did not appear, run the workflow by hand: Actions → *Back-merge main into develop* → *Run
workflow*.

If that PR has conflicts, its assignee resolves them on a branch created from `develop` with
`origin/main` merged in, and opens that branch's PR to `develop`: `main` is protected and cannot take
the resolution.

### schema_forge_core versions

`schema_forge_core` is not cut. Every merge into its `main` publishes a release (`release.yml`, a
patch bump of the last tag) and opens `chore/bump-core-0.3.X` against `develop` here
(`.github/workflows/bump-core-on-release.yml`).

- A task that needs a core change pins that version on its own branch; everyone else gets it when
  that PR enters `develop`.
- Two tasks pinning different versions: keep the highest. Releases are published in order from
  `main`, so it includes the earlier ones.
- Regenerate the lock with `make bump-core-version VERSION=<version>` instead of merging it by hand.

### Emergency bypass of branch protection

Branch protection on `develop` and `main` applies to admins too (*Do not allow bypassing the above
settings*). Bypass it only when a fix cannot wait for the pipeline (production affected) or a check
cannot report (Jenkins down, or a lost webhook already re-triggered without success):

1. Announce in the team chat which PR is merged, why, and who does it.
2. An admin unticks the setting (Settings → Branches → the branch rule), merges the PR and ticks it
   again right away.
3. Re-run what was skipped and leave the reason as a comment on the PR.

## New Feature Branch Policy (MANDATORY)

When the user requests a new task while on a feature branch, the coordinator MUST ask:
1. **What is the new task?**
2. **Does it depend on changes in the current feature branch?**

Based on the answer:
- **Independent task →** Create new branch from `develop` (with `git pull` first to update)
- **Dependent task →** Create new branch from the current feature branch

## Parallel Repo Workflow (Schema Forge + Etendo Go)

Schema Forge (tooling/frontend) and Etendo Go (`{etendo_root}/modules/com.etendoerp.go/`, backend/runtime) are developed in lockstep. Most features require a branch in **both repos**, with parallel PRs:

```
Schema Forge:  feature/ETP-XXXX  →  PR to develop
Etendo Go:     feature/ETP-XXXX  →  PR to develop
```

When working on a feature, always check if there's a corresponding branch/PR in the other repo.

## Branch Safety (MANDATORY)

Both repos **MUST** be on the same branch. This prevents accidental commits to `main` or `develop` in the module. Always verify both repos are on matching branches before generating or committing code.

## Core File Approval Rule

Core-file merge blocking is handled by GitHub code-owner review rules, not by a failing CI check.

- `.github/CODEOWNERS` assigns `@sebastianbarrozo` and `@valenvivaldi` as owners for repository files outside `artifacts/`.
- `.github/CODEOWNERS` leaves `/artifacts/` ownerless so artifact-only PRs do not trigger the core owner gate by themselves.
- Protected branches or rulesets that accept Schema Forge PRs must enable **Require review from Code Owners**.
- Keep `.github/workflows/core-approval.yml` informational only. It may summarize core changes, but it must not fail just because required approvals are still pending.

With this setup, a PR that changes core files stays unmergeable until the branch rule has the required approval state. The PR should show a pending review requirement instead of a red `core-approval` check.
