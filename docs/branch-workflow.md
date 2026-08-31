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

All feature work branches from and merges back to **`develop`**. `develop` is the
integration point (staging); `main` is production.

```
main     (production — human merge only)
  └── develop  (staging / integration — human merge only)
        ├── mergeblock/ETP-XXXX  →  PR targets develop  (the day's block)
        │     ├── feature/ETP-AAAA   merged locally into the block
        │     └── feature/ETP-BBBB   merged locally into the block
        ├── feature/ETP-YYYY  →  PR targets develop
        └── ...
```

> **The epic branch is no longer a merge target.** `epic/ETP-3504` and friends are
> not part of the branching model any more, in **any** of the three repos
> (`etendo_schema_forge`, `com.etendoerp.go`, `schema_forge_core`). Branch from
> `develop`, target `develop`. The Jira **epic** is unaffected — issues are still
> created under it; only the git branch stopped being an integration point.

### Hierarchy and merge rules

| Merge | Who | How |
|-------|-----|-----|
| `feature → mergeblock` | Agents (Blockie, local `git merge`) | Only on explicit human authorization |
| `feature → develop` | Agents open the PR | **Human merges** |
| `mergeblock → develop` | Agents open the PR | **Human merges** — one Jenkins run for the whole block |
| `develop → main` | Agents open the PR | **Human merges** — the daily production update |

### Key rules

- **Features branch FROM `develop`** (fresh `git fetch`/`pull` first) and PRs **target `develop`**.
- **Agents NEVER merge to `develop` or `main`.** They open the PR; the merge is always a manual, supervised operation.
- **NEVER target `main` directly with a `feature/*` PR.** The only PR allowed to target `main` is the daily `develop → main` promotion (see Release Cadence below).
- **NEVER use squash merge.** Always use regular merge (`--merge`) to preserve full commit history. Squash discards individual commits and breaks traceability.
- **Always assign the PR to the current user.**
- **GitHub usernames must be stored in auto-memory** (not committed). On first interaction, look up the current user's GitHub username and any known reviewers, and save them to auto-memory for future use. **CRITICAL:** Before ANY GitHub operation, read the `github-usernames.md` file from the auto-memory directory (`~/.claude/projects/.../memory/github-usernames.md` — use the absolute path, NEVER a path relative to the project root). NEVER assume, hardcode, or guess a username — if no username is stored, ask the user and save it immediately.

## Release Cadence — Daily Production Update

**Every day, before the merge block runs, `develop` is promoted to `main`.**
`main` is the **production** environment and `develop` is **staging**, so this is
a real deploy window, not just bookkeeping. Both repos (functional
`etendo_schema_forge` and runtime `com.etendoerp.go`) are promoted together.

Order of operations — the block only starts once the promotion is merged:

```
1. develop → main      PR in BOTH repos   (production update)
2. block   → develop   PR in BOTH repos   (the day's merge block)
```

> This replaces the previous twice-weekly (Monday & Thursday) cadence, where
> `epic → develop` and `develop → main` were both run before a block that
> targeted the epic. The epic branch is out of the model entirely now.

### Who does what

| | Create the PR | Approve | Merge |
|---|---|---|---|
| `develop → main` (daily) | **Clerk** (on request) | Team reviewers | **Human only** |
| `mergeblock → develop` | **Clerk** (on request) | Team reviewers | **Human only** |
| `feature → develop` | Clerk | Team reviewers | Human (usually via the block) |

Creating a promotion PR is the **only** case where an agent may open a PR targeting
`develop` or `main`, and only when the user explicitly asks for the promotion.
The user then hands the PR to the team for approval.

### Rules

- **Agents never approve and never merge a promotion PR.** They only open it —
  the merge stays human-only, exactly as in the hierarchy table above.
- **The production update comes first, the merge block second.** The block runs on
  top of a `main` that already carries yesterday's staging content.
- **PR title:** `Release YYYY-MM-DD: Promote develop to main` — plain ASCII, no
  quotes or apostrophes (Git Police closes a PR whose title carries them, see
  `.claude/agents/workflow.md` § pr_conventions).
- **An empty promotion PR means nothing to ship.** Check `git log origin/main..origin/develop`
  before opening it; if there are no commits, skip the promotion for the day.
- **The block covers all three repos, `schema_forge_core` included.** Core always
  gets its own block branch and PR, because that is where the new package version
  is published — even when it carries no feature merges of its own.
- **`main` is never a `feature/*` target.** The only PR allowed to target `main` is
  the daily promotion. `develop`, by contrast, is now the normal target for every
  `feature/*` and `mergeblock/*` PR.

### The merge-block branch

Each block day gets **one Jira task** under the current Jira epic (`Merge Block DD/MM`,
type Task) and **one branch per repo** named after it:

```
mergeblock/ETP-XXXX      in schema_forge, schema_forge_core and com.etendoerp.go
```

- **Always branch it off `develop`, after a fresh `git fetch`/`pull`.** A block cut
  from a stale `develop` re-merges work that is already there and produces noisy conflicts.
- **A merge-block branch counts as a `feature` branch for Git Police.** Its commits
  use the ordinary feature prefix — `Feature ETP-XXXX: ...` — where `ETP-XXXX` is the
  merge-block task, not `Epic` and not `Merge`. Same 80-char limit on the first line.
- Authorized `feature/*` branches are merged **into the block branch** with a plain
  `git merge` (never squash, never rebase), and the block hits `develop` **once** at
  the end, through a single PR — one Jenkins run for the whole set.
- **Never merge the authorized branches into `develop` one by one** when a block is
  being assembled, and never point a block branch's upstream at `develop`
  (`git branch --unset-upstream` if git sets it automatically) — a stray `git push`
  would then land straight on `develop`.

## New Feature Branch Policy (MANDATORY)

When the user requests a new task while on a feature branch, the coordinator MUST ask:
1. **What is the new task?**
2. **Does it depend on changes in the current feature branch?**

Based on the answer:
- **Independent task →** Create new branch from `develop` (with `git pull` first to update)
- **Dependent task →** Create new branch from the current feature branch

## Parallel Repo Workflow (Schema Forge + Etendo Go)

Schema Forge (tooling/frontend) and Etendo Go (`{etendo_root}/modules/com.etendoerp.go/`, backend/runtime) are developed in lockstep. Most features require a branch in **both repos** under the same Jira task, with parallel PRs:

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
