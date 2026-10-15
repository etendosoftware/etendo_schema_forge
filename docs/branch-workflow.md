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
  ▲ main → develop    →  PR before every cut: hotfixes, cut fixes, cut born up to date
```

### Hierarchy and merge rules

| Merge | Gate | Who merges |
|-------|------|------------|
| `feature → develop` | PR checks: mini pipeline (unit, mocked, Java unit), `Tests`, `Sonar Build`, review, code-owner gate | **Human**, in GitHub, merge commit |
| `main → develop` | PR checks | **Human**, before every cut |
| `mergeblock → main` (the cut) | Full Jenkins pipeline, integration included; branch up to date with main | **Human only** |
| `hotfix → main` | Full pipeline | **Human only**; comes back through `main → develop` |

### Key rules

- **Features branch FROM `develop`** (always `git fetch`/`pull` first for freshness) and PRs **target `develop`**.
- **Each author resolves their own conflicts with `develop`.** A PR does not have to be up to date with `develop` to merge, only free of conflicts; `main` does require it, and the cut provides it by merging `origin/main` in.
- **Agents NEVER merge to `develop` or `main`.** Every merge into them is a manual, supervised operation.
- **Only the cut and hotfixes target `main`.** Feature PRs never do (`.github/workflows/branch-merge-policy.yml` enforces it).
- **NEVER use squash merge.** Always use regular merge (`--merge`) to preserve full commit history. Squash discards individual commits and breaks traceability.
- **Always assign the PR to the current user.**
- **GitHub usernames must be stored in auto-memory** (not committed). On first interaction, look up the current user's GitHub username and any known reviewers, and save them to auto-memory for future use. **CRITICAL:** Before ANY GitHub operation, read the `github-usernames.md` file from the auto-memory directory (`~/.claude/projects/.../memory/github-usernames.md` — use the absolute path, NEVER a path relative to the project root). NEVER assume, hardcode, or guess a username — if no username is stored, ask the user and save it immediately.

## Daily Cut — develop into main (ETP-5695)

`main` is **production** and `develop` is **staging**, so the cut is a real deploy window. It covers
all three repos (`etendo_schema_forge`, `schema_forge_core`, `com.etendoerp.go`) together;
`schema_forge_core` always takes part, since its package version is published there, even when it
carries no task of its own.

### Order of operations

```
1. main → develop        before every cut, always
2. cut                   mergeblock/ETP-XXXX from develop + origin/main, in all three repos
3. mergeblock → main     PR, full pipeline; green → human merges → production
```

1. **Bring main into develop, every time.** A `main → develop` PR, merged before cutting. There is
   always something to bring: after each cut main holds at least that cut's merge commit, plus any
   hotfix, test fix or revert made on the cut. Before step 2, `git log --oneline origin/develop..origin/main`
   (merge commits included) must print nothing. Doing it every time gives two things:
   - **Hotfixes come back.** Until they do, develop (staging) and every branch cut from it run without
     the fix, and the cut is tested without it.
   - **The cut is born up to date.** main requires its PRs to be up to date. When develop already
     contains main, so does the cut branch; otherwise GitHub asks for *Update branch*, which adds an
     untested merge commit to the cut and re-runs the full pipeline, another half hour.
2. **Cut.** Blockie (`merge-block-helper`) lists the tasks merged into develop since main and their
   checks, proposes the cut point (develop's head, or the last commit before a task that went in red)
   and, on an explicit OK, creates `mergeblock/ETP-XXXX` at that commit with `origin/main` merged in.
   After step 1 that merge does nothing; it only matters when the cut point is older than the
   `main → develop` merge (cutting one task earlier) or main moved in between.
   The human pushes the branches; Clerk opens the PRs to `main` on request.
3. **Full pipeline.** Jenkins runs everything there, integration included. Green → the human merges
   in all three repos, and production updates. Red → the failure ladder below.

### Who does what

| | Create the PR | Approve | Merge |
|---|---|---|---|
| `feature → develop` | Clerk or the author | Team reviewers | **Human** |
| `main → develop` | **Clerk** (on request) | Team reviewers | **Human only** |
| `mergeblock → main` (the cut) | **Clerk** (on request) | Team reviewers | **Human only** |

The cut and `main → develop` are the **only** PRs an agent may open towards `main` or out of it.

### Rules

- **Agents never approve and never merge** these PRs. They only open them.
- **PR title of the cut:** `Release YYYY-MM-DD: Promote develop to main` — plain ASCII, no
  quotes or apostrophes (Git Police closes a PR whose title carries them, see
  `.claude/agents/workflow.md` § pr_conventions).
- **Nothing new in develop means no cut.** If `git log origin/main..origin/develop` lists no task
  merge, skip the day.
- Blockie's 🔴 flag on a `feature/*` PR targeting `main` still applies.

### The merge-block branch

Each cut day gets **one Jira task** (`Merge Block DD/MM`, type Task, filed under whatever epic the
team tracks release work in — Jira bookkeeping only) and **one branch per repo** named after it:

```
mergeblock/ETP-XXXX      in schema_forge, schema_forge_core and com.etendoerp.go
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
   the full pipeline costs about half an hour. The fix reaches develop through the next
   `main → develop`.
3. **Revert.** Product code involved, a cause nobody understands, or rung 2 failed: revert the task's
   merge on the block branch (`git revert -m 1 <merge>`).
   - More than one task: revert in **reverse merge order**. If reverting one does not turn the cut
     green, revert the ones involved together and let their authors coordinate, rather than trying
     combinations.
   - **Revert in develop at once,** through a PR with the same revert, not at the next cut: anyone who
     branches from develop that afternoon would otherwise inherit the broken code and find it in
     their own PR.

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
