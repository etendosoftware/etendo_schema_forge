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

**Update (2026-08-30): the epic branch is retired as an integration tier.** All feature
work now branches directly from, and PRs target directly, `develop`. There is no more
`epic/ETP-XXXX` integration branch sitting between `feature/*` and `develop` — a Jira
Epic (e.g. ETP-3504) is still a valid grouping for tickets in Jira, and an `epic/ETP-XXXX`
branch may still exist historically, but it is **no longer the base or the PR target for
new feature work**. This replaces the previous 3-tier model (`feature → epic → develop →
main`) with a 2-tier one (`feature → develop → main`).

```
main     (protected — manual merge only, production)
  └── develop  (protected — manual merge only, staging; ALSO the integration point)
        ├── feature/ETP-XXXX  →  PR targets develop
        ├── feature/ETP-YYYY  →  PR targets develop
        └── ...
```

### Hierarchy and merge rules

| Merge | Who | How |
|-------|-----|-----|
| `feature → develop` | Agents (via PR) | Automated — agents create PRs targeting `develop` |
| `develop → main` | **Human only** | Manual, under supervision — agents **NEVER** do this |

### Key rules

- **Features branch FROM `develop`** (always `git fetch`/`pull` first for freshness) and PRs **target `develop`**.
- **Agents NEVER merge to `develop` or `main`.** This is always a manual, supervised operation.
- **NEVER target `main` directly.** The highest allowed PR target for agents is `develop` — the sole exception is a **promotion PR** explicitly requested by the user on a release day (see Release Cadence below).
- **NEVER use squash merge.** Always use regular merge (`--merge`) to preserve full commit history. Squash discards individual commits and breaks traceability.
- **Always assign the PR to the current user.**
- **GitHub usernames must be stored in auto-memory** (not committed). On first interaction, look up the current user's GitHub username and any known reviewers, and save them to auto-memory for future use. **CRITICAL:** Before ANY GitHub operation, read the `github-usernames.md` file from the auto-memory directory (`~/.claude/projects/.../memory/github-usernames.md` — use the absolute path, NEVER a path relative to the project root). NEVER assume, hardcode, or guess a username — if no username is stored, ask the user and save it immediately.

> **Migration note:** any branch created before 2026-08-30 off a stale `epic/ETP-XXXX` should
> be re-cut from `develop` (or rebased/cherry-picked onto a fresh `develop`-based branch)
> before its PR is opened, rather than PR'd into the old epic branch. This was the exact
> problem that triggered the retirement: `epic/ETP-3504` was found 180 commits behind
> `develop` when ETP-4879 branched from it.

## Release Cadence — Monday & Thursday

Twice a week, the merge block promotes a batch of ready feature work into `develop`, then
`develop` promotes to `main`. `main` is the **production** environment and `develop` is
**staging**, so this is a real deploy window, not just bookkeeping. Both repos (functional
`etendo_schema_forge` and runtime `com.etendoerp.go`) are promoted together.

Order of operations — each step waits for the previous one to be merged:

```
1. feature → develop   the usual merge block (Blockie pre-flight + block branch)
2. develop → main      PR in BOTH repos   (promotes staging to production)
```

> **This is a simplification of the previous 3-step order** (which was `epic → develop`,
> `develop → main`, `feature → epic`, in that sequence) now that the epic tier is gone —
> there is no more "epic lands on develop first" step to wait on. Confirm the current order
> before a release day rather than assuming, same as before.

### Who does what

| | Create the PR | Approve | Merge |
|---|---|---|---|
| `feature → develop` (merge block) | Clerk | Team reviewers | Human (via the block) |
| `develop → main` | **Clerk** (on request) | Team reviewers | **Human only** |

Creating a promotion PR is the **only** case where an agent may open a PR targeting
`main`. The user then hands the PR to the team for approval.

### Rules

- **Agents never approve and never merge a promotion PR.** They only open it —
  the merge stays human-only, exactly as in the hierarchy table above.
- **The block covers all three repos, `schema_forge_core` included.** Core always
  gets its own block branch and PR, because that is where the new package version
  is published — even when it carries no feature merges of its own.
- Blockie's 🔴 flag on a PR targeting `main` still applies: that target is legal
  **only** for the `develop → main` promotion PR, never for a `feature/*` PR.
  A `feature/*` PR targeting `develop` is now the normal case, not a flag.

### The merge-block branch

Each release day gets **one Jira task** (`Merge Block DD/MM`, type Task, filed under
whatever epic the team is currently tracking release work in — this is just Jira
bookkeeping, unrelated to the retired branch-integration tier) and **one branch per repo**
named after it:

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
  the end — one Jenkins run for the whole set.
- **Never merge the block branch into `develop` branch-by-branch**, and never point a
  block branch's upstream at `develop` (`git branch --unset-upstream` if git sets it
  automatically) — a stray `git push` would then land straight on `develop`.

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
