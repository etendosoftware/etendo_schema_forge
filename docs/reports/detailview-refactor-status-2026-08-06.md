# DetailView.jsx Refactor — Status Handoff (2026-08-06)

Written by the coordinator session directly (not by developer-1) because the coordinator
session was about to run out of tokens and developer-1 was not responding to the request
to write this file itself. Facts below are as observed via `git status`/`wc -l` at write
time, not as self-reported by any agent — treat anything under "In progress" as unverified.

Branch: `sebastianbarrozo/feature-detail-view`. **Nothing in this effort is committed,
staged, or pushed.** Everything is either untracked or modified-in-worktree.

## 1. Done

### AST + git-churn hotspot analysis
- `cli/src/ast-churn-hotspot.js` — reusable script, `--file <path>` arg, `@babel/parser`
  (jsx plugin) walk. Collects depth-0 and depth-1 named function/const-arrow/hook-wrapped
  units, plus comment-marker JSX regions as a secondary metric. Churn via
  `git log -L start,end:file --format=... -s` per range, heat = lines × commits.
- `docs/reports/detailview-ast-hotspot-analysis-2026-08-06.md` + `.json` (raw data, 121
  ranges). Ran clean on `DataTable.jsx` too (not committed, just verified generic).
- Headline finding: the `DetailView` function itself is 3,374 lines / 71.5% of file /
  91.5% of commits / 99.78% of all AST-unit heat — the AST metric alone saturates and
  can't prioritize past that. Region-level re-scoring (proper multi-range `git log -L`
  union, not naive per-region summation) is what actually drove prioritization.
- Delta vs. the prior 2026-06-10 report (`docs/reports/contract-ui-churn-analysis.md`):
  file grew 3,914→4,718 lines, 262→398 commits (`--follow`), 48→103 ETP tickets. None of
  that report's §9.2 six extraction steps had been executed as of 2026-08-06 morning.
- **Corrected priority order** (data-implied, replacing §9.2's ordering):
  1. `DetailToolbar` (highest recent churn: 35 commits since 06-10, near-stateless)
  2. `DetailModals` — **not in the June report at all**, no comment marker, but highest
     heat of any region (3 near-identical delete-confirm dialogs + print drawer +
     Verifactu dialog; a dedup opportunity, not just an extraction)
  3. `DetailProcessButtons`
  4. `LinesSection` (June's #1 pick — still hot, but not uniquely so)
  5. `DetailHeaderForm`
  6. `SecondaryTabsSection` (June co-ranked this #1 with LinesSection — demoted here:
     its churn already relocated into the already-extracted `Secondary*Tab` components,
     ~40 props each; re-extracting JSX without moving state repeats that mistake)
  - Dropped from near-term plan: `PrimaryTabBar`, `DetailSidePanel` (cooled since June).
  - Killed: June's P6 ("69 exported helpers should be un-exported") — those helpers are
    churn-cold (0.22% of total heat), not a real problem.

### `extract-hotspot-component` skill
- `.claude/skills/extract-hotspot-component/SKILL.md` (320 lines). Built via a real
  RED/GREEN cycle per `superpowers:writing-skills` (2 baseline agents run *without* the
  skill first, 1 with it) — the failures observed in the baselines are what the skill's
  content addresses, not a from-scratch write-up.
- **Root-cause find during baseline testing:** `feature/ETP-4708` already attempted this
  exact decomposition and was discarded (`archive/ETP-4708-dismissed-20260803`, plus
  `backup/ETP-4708-pre-reseal` / `backup/ETP-4708-pre-shrink` tags — all verified to
  exist). Cause: an add/add conflict with a rival ticket, `feature/ETP-4730`, landing
  `detailViewHelpers.jsx` on the shared epic; ~20 source-pinned test assertions broke;
  plus a cross-repo core-pin bump and epic drift (34–75 commits). User was asked why it
  was dismissed and said they don't know / it was for another reason — so treat the
  ETP-4730-collision explanation as the best evidence found, not as confirmed by the user.
- **Load-bearing insight — three test classes**, because June's R1 ("tests must pass
  unmodified") isn't directly executable as written:
  - **Class A (behavioral)** — RTL render/fireEvent. Never touch; a failure means the
    extraction is wrong.
  - **Class B (import-coupled)** — imports a named export from `DetailView.jsx`. Fixed
    via a re-export shim, zero test edits. This is the pattern that let `ETP-4730` land
    where `ETP-4708` didn't (see `detailViewHelpers.jsx`, currently re-exported from
    `DetailView.jsx`, already on this branch, already merged — real prior art).
  - **Class C (source-text-pinned)** — `readFileSync('DetailView.jsx')` +
    `assert.match(src, /…/)`. Structurally breaks on move; shim cannot help. Must be
    repointed to the new file, counted explicitly, never silently patched around.
    Measured 58 Class C assertions across 10 files (a bug in the skill's own Gate-2 grep
    undercounted this as 56 at first — variable-name-agnostic regex fix applied).
- Skill picks `DetailToolbar` over `DetailModals` for the first real run by
  independently re-verifying the risk column (grepping actual `setXxx` state calls per
  candidate range rather than trusting the hotspot report's "near-stateless" label at
  face value).

### `feature/ETP-4767` collision — resolved, not blocking
- PR #1033, OPEN, MERGEABLE, base `epic/ETP-3504`, merge-base with current HEAD is
  exactly `29069b3a5` (this branch's tip) — a clean, direct comparison.
- Touches `DetailView.jsx` lines 3021 and 3132 — both inside the `DetailToolbar` region.
- Confirmed (coordinator pulled the diff directly): both are single-line semantic-color
  hover-state additions (`hover:text-destructive` → adds `hover:text-destructive-foreground`,
  on the delete button and the destructive kebab-menu row). NOT a structural clash like
  the one that killed ETP-4708.
- Decision: proceed with the `DetailToolbar` extraction now, but bake ETP-4767's target
  values into the new file directly as the code moves, so the eventual merge of PR #1033
  becomes a no-op on this file. Developer was instructed to do this and to flag it
  explicitly in the extraction commit/report.

## 2. In progress (unverified — observed via `git status`/`wc -l`, not self-reported)

Current uncommitted worktree diff:
- `tools/app-shell/src/components/contract-ui/DetailView.jsx`: **modified**, 4,718 → 4,569
  lines (−149 net; diffstat shows −181/+43 inside the file itself).
- `tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx`: **new,
  untracked**, 195 lines. Name suggests this is a sub-piece of the `DetailToolbar` region
  (the kebab/"more actions" dropdown specifically), not necessarily the full region in
  one shot — unconfirmed.
- Three test files modified with small, surgical diffs (consistent with Class B/C
  repointing, not rewrites):
  - `DetailView.menuAction.test.js` (+9/−? , net small)
  - `DetailView.moreMenuGating.test.js` (+20/−?)
  - `DetailView.neoAction.test.js` (+15/−?)

**Not yet known at handoff time:** whether the ETP-4767 target values were actually
baked in, whether `innocuous-check` was run, whether the full test suite (or even just
these 3 files) currently passes, whether this diff is the complete `DetailToolbar`
extraction or a partial first slice, and whether developer-1 is still actively working
or stalled. The coordinator's request to write this exact status file was sent to
developer-1 and did not produce a report before this file was written directly instead.

## 3. Not started

- **Line-count ratchet pre-commit hook for `DetailView.jsx`** (originally queued as
  Task #3). Should mirror the existing `sf-method-budget` / `sf-window-leak-budget`
  pattern (both published from `@etendosoftware/schema-forge-core`, baseline JSON,
  fail-only-if-grows, `--update` to lower). Before writing one from scratch, check
  whether `feature/ETP-4708`'s ratchet commit (`6107bdcb0`, "Wire the file-lines ratchet
  on DetailView and DataTable") is cleanly recoverable from `backup/ETP-4708-pre-reseal`
  or `archive/ETP-4708-dismissed-20260803`.
- Continuing the priority list past `DetailToolbar` (`DetailModals`, then
  `DetailProcessButtons`, `LinesSection`, `DetailHeaderForm`, `SecondaryTabsSection`).

## 4. Open decisions for whoever resumes this

1. Nothing is committed. Once the `DetailToolbar` extraction is verified (tests green,
   `innocuous-check` clean, line count confirmed dropped), decide: commit directly on
   this branch, or formalize as a Jira ticket + PR through the normal pipeline (per
   `CLAUDE.md`, PRs are otherwise mandatory — this work has been running informally
   without a ticket so far, by the user's implicit go-ahead).
2. A **separate, unrelated stray worktree** exists at
   `/Users/sebastianbarrozo/Documents/work/epic/schema-forge/.claude/worktrees/agent-a0586935132fe9256`
   (branch `worktree-agent-a0586935132fe9256`, base `fda001c06`, ~1 month stale) —
   produced by one of developer-1's own RED-baseline sub-agents, anchored to a different
   checkout than this one due to how `isolation: "worktree"` resolved its root. Contains
   a modified `DetailView.jsx`, 3 modified test files, and an untracked
   `DetailActionBar.jsx` — real but stale work, not usable against current HEAD. Left
   untouched; discarding it is the user's call, not done automatically.
3. Why `feature/ETP-4708` was actually dismissed is not confirmed by the user (they said
   "no idea, discarded for another reason") — the ETP-4730-collision explanation above
   is the best evidence found in git history, not a confirmed root cause. Worth keeping
   in mind if the same collision pattern resurfaces.

## 5. File inventory (as of this write)

```
 M tools/app-shell/src/components/contract-ui/DetailView.jsx
 M tools/app-shell/src/components/contract-ui/__tests__/DetailView.menuAction.test.js
 M tools/app-shell/src/components/contract-ui/__tests__/DetailView.moreMenuGating.test.js
 M tools/app-shell/src/components/contract-ui/__tests__/DetailView.neoAction.test.js
?? .claude/skills/extract-hotspot-component/
?? cli/src/ast-churn-hotspot.js
?? docs/reports/detailview-ast-hotspot-analysis-2026-08-06.json
?? docs/reports/detailview-ast-hotspot-analysis-2026-08-06.md
?? tools/app-shell/src/components/contract-ui/DetailMoreActionsMenu.jsx
```

(This file itself, `docs/reports/detailview-refactor-status-2026-08-06.md`, is also new/untracked.)
