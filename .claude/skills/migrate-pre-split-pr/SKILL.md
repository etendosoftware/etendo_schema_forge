---
name: migrate-pre-split-pr
description: >
  Migrate a branch/PR that predates the repo split into the two post-split repos
  (etendo_schema_forge = functional windows, schema_forge_core = platform tooling).
  Splits the diff by destination path instead of copying the whole branch to both
  sides. Use when a branch was created before the split landed and now needs its
  changes routed to the correct repo(s). Triggers on: "migrar PR", "llevar los
  cambios de la rama al otro repo", "esta rama es previa al split", "dividir estos
  cambios entre schema_forge_core y etendo_schema_forge", "pre-split branch".
argument-hint: "<branch-name> [--core-path <path>] [--functional-path <path>]"
---

# /migrate-pre-split-pr — Migrate a Pre-Split Branch to Both Post-Split Repos

**Arguments:** `$ARGUMENTS` — branch name (required), optional explicit repo paths.

## Context: why this exists

`etendo_schema_forge` and `schema_forge_core` used to be one repo. The split
(ETP-4346, commit `a15488355` in `schema_forge_core`: "Remove functional and
backend-adjacent content per split design spec") divided the tree:

| Path | Lives in |
|------|----------|
| `tools/app-shell/**` | **etendo_schema_forge only** (functional windows, custom components) |
| `tools/decision-panel/**`, `tools/etendo-go-ar/**`, `tools/quick-order-app/**`, `tools/report-server/**`, `tools/spike-hello-app/**`, `tools/ui-preview/**` | **schema_forge_core only** |
| `packages/**` (`app-shell-core`, `apps-sdk`, `apps-sdk-bff`, `etendo-go-core`, `schema-forge-agent-context`, `schema-forge-core`, `schema-forge-stack`) | **schema_forge_core only** |
| `cli/src/**` — generators, extractors, pipeline (`generate-*.js`, `extract-*.js`, `pipeline.js`, `push-to-neo.js`, `resolve-curated.js`, etc.) | **schema_forge_core only** |
| `cli/src/data-fixes/**`, `cli/src/db.js`, `cli/src/lib/**` | **duplicated in both** (tenant remediation needs DB access from either side) |
| `artifacts/**`, `docs/generated-custom-windows/**`, `e2e/**`, `caps/**`, `docs/decisions-*.md`, window-level docs | **etendo_schema_forge only** |
| Everything else under `docs/`, root config (`Makefile`, `package.json`, CI workflows) | **repo-specific — do NOT cross-port**, each repo has its own copy that evolved independently since the split |

**Any branch created before the split lands on top of pre-split history.** Its
diff may touch files on BOTH sides of that table. Migrating it means routing
each changed file (or hunk) to its correct destination repo — never copying the
whole branch wholesale to both repos. A naive `git cherry-pick` or "open the same
PR in both repos" WILL leak functional-window changes into `schema_forge_core`
(or vice versa), because the pre-split branch doesn't know about the boundary.

**Known precedent (remediated):** the pre-split branch `feature/ETP-4355` needed
splitting across both repos:
- `etendo_schema_forge` PR #807 — correct from the start: carries the functional
  files (`NotPostedDocumentsPage.jsx`, `not-posted-documents.css`, the three
  `*.vitest.jsx` coverage files, the window doc, the cross-domain plan doc).
- `schema_forge_core` PR #14 — was FIRST opened with the whole unsplit branch,
  leaking `NotPostedDocumentsPage.jsx` and `not-posted-documents.css` in
  alongside the two files that genuinely belong there
  (`cli/src/push-to-neo.js`, `packages/app-shell-core/src/locales/*.json`).
  Remediated with a follow-up commit ("Remove functional files that belong in
  etendo_schema_forge") per the Remediation section below, then cross-linked
  with #807. This is the reference case for what NOT to do — always classify
  the diff file-by-file (Step 3) before opening the core-side PR, so this
  cleanup commit isn't needed next time.

---

## Step 1 — Identify the two repos and confirm they're siblings

```bash
FUNCTIONAL_REPO="${FUNCTIONAL_PATH:-$(git rev-parse --show-toplevel)}"   # etendo_schema_forge — usually the repo you're already in
CORE_REPO="${CORE_PATH:-../schema_forge_core}"                          # sibling checkout — ask the user for the path if not found
```

Verify both exist and are git repos:
```bash
git -C "$FUNCTIONAL_REPO" rev-parse --is-inside-work-tree
git -C "$CORE_REPO" rev-parse --is-inside-work-tree
```

If `$CORE_REPO` isn't found at the default relative path, ASK the user for the
absolute path — never guess or search the whole filesystem.

## Step 2 — Get the full file list touched by the branch (not just the latest commit)

```bash
BRANCH=<branch-name>          # e.g. feature/ETP-4355
BASE=<merge-base-branch>      # what the branch will target once split, e.g. main or feature/ETP-4413

cd "$FUNCTIONAL_REPO"
git fetch origin --quiet
MERGE_BASE=$(git merge-base "$BASE" "origin/$BRANCH")
git diff --name-status "$MERGE_BASE" "origin/$BRANCH"
```

**Do not** default to the latest commit only (`git show --stat`) — pre-split
branches often carry multiple commits, and a partial view will miss files that
need migrating. If the branch is far behind `$BASE` (many commits), the raw
`BASE..branch` diff gets noisy with unrelated history; in that case fall back to
listing files per-commit (`git log --name-status $MERGE_BASE..origin/$BRANCH`)
and de-duplicate.

## Step 3 — Classify every changed file against the boundary table

For each file in the diff, look it up in the table in the Context section
above. Three buckets:

1. **Functional-only** → path starts with `tools/app-shell/`, `artifacts/`,
   `docs/generated-custom-windows/`, `e2e/`, `caps/`, or other repo-specific
   functional docs.
2. **Core-only** → path starts with `packages/`, `cli/src/generate-*`,
   `cli/src/extract-*`, `cli/src/pipeline.js`, `cli/src/push-to-neo.js`,
   `cli/src/resolve-curated.js`, `cli/src/migrations/`, any `tools/<name>/` other
   than `app-shell`, `templates/`, `schemas/`, `scripts/`.
3. **Shared / ambiguous** → `cli/src/data-fixes/`, `cli/src/db.js`,
   `cli/src/lib/`, root config files, CI workflows, top-level `docs/*.md` not
   covered above. **Do not auto-route these.** Read the file's current content
   in BOTH repos first — if the two repos' versions have diverged (different
   Makefile targets, different CI steps), a blind port will regress the other
   repo. Ask the user or hand-merge case by case.

If a single file doesn't cleanly resolve from the table (e.g. a new file at a
path that didn't exist before the split), ask the user which repo it belongs to
before proceeding — do not guess new-path ownership from analogy alone.

**Check for orphaned references after removing a functional file (MANDATORY).**
Removing a leaked functional file is not always a clean single-file delete: a
new custom window typically also touches a registry/index file that imports it
(e.g. `tools/app-shell/src/windows/registry.js` lazy-importing
`./custom/<window>/index.jsx`, and that `index.jsx` re-exporting the page
component). If you delete `<Window>Page.jsx` but leave `index.jsx` and the
registry entry behind, the wrong-repo build/test suite will fail later with a
resolver error (e.g. Vite's `Could not resolve "./<Window>Page"` surfacing
inside an unrelated PWA/build test) — a real, reproducible break, not a false
positive. Before committing a removal:
```bash
grep -rn "<window-name>\|<ComponentName>" tools/app-shell/src/windows/registry.js tools/app-shell/src/windows/custom/<window-name>/ 2>/dev/null
```
Remove the ENTIRE custom-window directory (`index.jsx`, `__tests__/`, page,
styles) and the matching `registry.js` entry together, in the same commit —
verify with `git show main:<path>` that the whole directory is absent from the
target repo's `main` (not just the two files that were obviously wrong), then
re-run that repo's full test/build suite (not just the file you touched) before
pushing.

Produce a short manifest before touching anything:

```
FUNCTIONAL (→ etendo_schema_forge):
  tools/app-shell/src/windows/custom/not-posted-documents/NotPostedDocumentsPage.jsx
  tools/app-shell/src/windows/custom/not-posted-documents/not-posted-documents.css

CORE (→ schema_forge_core):
  cli/src/push-to-neo.js
  packages/app-shell-core/src/locales/en_US.json
  packages/app-shell-core/src/locales/es_ES.json

SHARED/AMBIGUOUS (needs manual review):
  (none in this example)
```

Show this manifest to the user before creating any branch — it's cheap to
correct a misclassification here, expensive after two PRs are open.

## Step 4 — Build one branch per destination repo

For each bucket with files, create a dedicated branch in the corresponding repo
and apply ONLY that bucket's changes — never the full branch diff.

**Preferred method — targeted checkout from the source branch:**
```bash
cd "$CORE_REPO"
git checkout -b "$BRANCH" main   # or the repo's current integration branch — ask if unsure
git checkout "origin/$BRANCH" -- cli/src/push-to-neo.js packages/app-shell-core/src/locales/en_US.json packages/app-shell-core/src/locales/es_ES.json
# NOTE: this requires a shared object history between the two repos (they were
# one repo before the split, so this works for commits that predate the split).
# If git checkout can't resolve the ref (unrelated histories post-split), use
# the patch method below instead.
```

**Fallback method — file-scoped patch (use when histories are NOT shared,
e.g. the split already fully diverged the two repos' object databases):**
```bash
cd "$FUNCTIONAL_REPO"
git diff "$MERGE_BASE" "origin/$BRANCH" -- cli/src/push-to-neo.js packages/app-shell-core/src/locales/en_US.json packages/app-shell-core/src/locales/es_ES.json > /tmp/core-slice.patch

cd "$CORE_REPO"
git checkout -b "$BRANCH" main
git apply --check /tmp/core-slice.patch   # dry run first
git apply /tmp/core-slice.patch
```

If the file MOVED or was renamed relative to its pre-split path (e.g. it used
to be at `cli/src/push-to-neo.js` and still is, but a sibling file it depended
on moved to `packages/`), the patch may not apply cleanly — resolve hunk by
hunk, do not force with `--3way` blindly without inspecting the result.

Repeat for the functional bucket against `$FUNCTIONAL_REPO`.

## Step 5 — Verify each split branch independently

Before opening any PR:
- Run each repo's own test/lint suite against its slice (`make test`,
  `node cli/src/validate-pipeline.js`, etc. — whatever that repo's CLAUDE.md
  mandates).
- Confirm the file counts match the manifest from Step 3 exactly
  (`git diff --stat main` in each branch).
- Confirm NEITHER branch contains files from the other bucket
  (`git diff --stat main -- tools/app-shell` should be empty in the core repo;
  `git diff --stat main -- packages` should be empty in the functional repo).

**If a local `node_modules`/workspace fix is needed to even run the suite**
(e.g. a dependency declared in `package.json` but missing on disk in this
checkout), prefer `npm ci` (full clean reinstall from the lockfile) over a
targeted `npm install <pkg> --workspace=<ws> --no-save`. A targeted install can
leave the physical `node_modules` tree in a state inconsistent with the
lockfile's resolution (observed: it silently reintroduced an `ERR_REQUIRE_ESM`
failure in an unrelated transitive dependency, `@exodus/bytes` via
`html-encoding-sniffer`/jsdom, that a plain `npm ci` did not have). `npm ci` is
slower per-run but reproducible; a targeted install is faster but can leave the
sandbox in a different state than CI/the next person's checkout, causing a
failure that looks caused by your change but isn't (and a "fix" that only
half-resolves and reappears in a later step of the same test run).

**If the pre-push suite (tests + coverage + Sonar) is too slow for the pace of
a migration task, this is a legitimate thing to ask the user about** — do not
silently work around it (no `--no-verify`, no editing test files to force a
pass). If the user explicitly authorizes it, the coverage step can be disabled
per-repo in `.githooks/pre-push` (drop `--coverage --compare-coverage` from the
`run-sonar.sh` invocation — this also disables the underlying `make
test-all-coverage` call, since `run-sonar.sh` only runs it when `--coverage` is
passed) — see `schema_forge_core`'s commit "Skip coverage measurement in
pre-push (core only)" for the exact diff. Scope any such change to ONE repo
only, in its own commit, and confirm the OTHER repo's pre-push (and both repos'
CI workflows) still measure coverage as before unless explicitly told
otherwise — do not assume "skip coverage" means both repos or CI too.

## Step 6 — Delegate branch/PR creation

This skill does NOT create branches, commits, or PRs directly — that is always
delegated to the workflow agent (Clerk in this project's pipeline; see
`CLAUDE.md` → `<workflow_delegation>`). Hand Clerk:
- The target repo path
- The branch name
- The exact file list for that repo's slice (from the Step 3 manifest)
- The PR base branch
- A note that this is a **split PR from a pre-split branch** — the PR
  description should say so explicitly and link the sibling PR once both exist,
  e.g. "Split from `<original-branch>` (pre-split). Functional counterpart:
  `<other-PR-URL>`."

## Step 7 — Cross-link and report

Once both PRs exist, ask Clerk to add a comment on each linking to the other
("Companion PR in `<other-repo>`: `<url>`") so reviewers on either side see the
full picture. Report both PR URLs to the user together, with the manifest, so
they can confirm the split was correct before merging either side.

---

## Fixing an already-migrated PR that leaked files (remediation path)

If a PR was already opened with the full unsplit diff (like `schema_forge_core`
#14 above):

1. Run Step 2/3 against that PR's branch to get the correct manifest.
2. Remove the misplaced files from the wrong-repo PR. If the file simply
   exists on the base branch too, `git checkout <base-branch> -- <path>`
   reverts it cleanly. If it does NOT exist on the base branch (i.e. the whole
   file/directory is new and shouldn't exist in this repo at all — the common
   case for a new custom window), delete it outright and check for the
   orphaned-reference case above (registry entries, index re-exports):
   ```bash
   git rm -rf <misplaced-directory-or-file>
   # + remove any registry/index reference pointing at it (grep first, see above)
   git commit -m "Fix ETP-XXXX: Remove functional files that belong in <other-repo>"
   ```
3. Re-run the target repo's full test/build suite locally before pushing (not
   just the removed files) — an orphaned reference elsewhere in the tree will
   otherwise only surface as a failure in the pre-push hook or CI.
4. If the repo's pre-push hook has a domain-boundary/cross-domain-plan gate and
   the remaining diff still spans multiple scopes, add a scoped
   `docs/plans/<TICKET>-cross-domain.md` in THAT repo (check the validator's
   actual required path/format in that repo's source — do not assume it
   matches the sibling repo's convention) rather than bypassing with
   `--no-verify`. After pushing, add the gate's bypass label to the PR itself
   (e.g. `cross-domain-approved`) if the hook printed a reminder to do so —
   otherwise the equivalent CI check will fail even though the local push
   succeeded.
5. Open (or verify existence of) the companion PR in the correct repo carrying
   those files, per Steps 4-6.
6. Cross-link both PRs.

Never leave a platform-tooling PR carrying functional-window files (or vice
versa) merged as-is — it re-couples the two repos the split was meant to
separate, and the next person to touch that file won't know which repo is now
canonical.
