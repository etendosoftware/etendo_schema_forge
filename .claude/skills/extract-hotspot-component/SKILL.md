---
name: extract-hotspot-component
description: >
  Use when asked to decompose, split, break up, or reduce a contract-ui God Component
  (DetailView.jsx, DataTable.jsx) — "extract a sub-component", "this file is too big",
  "bajar la complejidad de DetailView", "SonarQube flags this component", "romper el
  monolito", "God Component", "extract LinesSection/DetailToolbar", or when a refactor
  must move code out of a shared component that every window renders. Also use when a
  test breaks because source text moved between files during such a refactor.
argument-hint: "[--file <path>]  (default: tools/app-shell/src/components/contract-ui/DetailView.jsx)"
---

# extract-hotspot-component — churn-targeted, behaviour-preserving extraction

Pick the extraction target from **measured churn**, not from which region looks biggest or
tidiest; then extract it without editing a single behavioural test.

These components are rendered by **every window** in the product. The risk is never "I broke one
window" — it is "I broke N windows". That asymmetry is why every gate below is mandatory.

**This skill picks the target and guards the invariants. It does not teach extraction mechanics.**

**REQUIRED SUB-SKILL:** Use `innocuous-check` for the extraction itself (its extraction-marker mode
M1–M5 already covers Rules-of-Hooks, JSX subtree boundaries, props inference, `.map()` row
renderers) and again for the final verdict. Do not re-derive those rules here.

---

## Prior art — read this before proposing anything

**A full decomposition of `DetailView.jsx` was already attempted as ETP-4708 and discarded on
2026-08-04.** It reached 3,371 lines (from 5,156) and then collapsed. Causes, all of which the gates
below exist to prevent:

- A **rival extraction (ETP-4730)** landed `detailViewHelpers.jsx` on the epic while ETP-4708 was
  in flight → add/add conflict on the same new file.
- **~20 source-text-pinned test assertions** broke and needed a dedicated fix pass (there are **56**
  now — see Gate 2).
- A **cross-repo core pin** chained delivery to an unmerged PR in `schema_forge_core`.
- The epic moved **34–75 commits ahead** while the branch lived.

Surviving evidence: `git show archive/ETP-4708-dismissed-20260803`, plus
`backup/ETP-4708-pre-reseal` and `backup/ETP-4708-pre-shrink`. Read the relevant diff before
proposing a region — you may be re-doing discarded work.

**The lesson: a long-lived, multi-region decomposition branch loses a race against a file that every
other ticket also touches.** One region per branch. Land in days, not weeks.

---

## Gate 0 — Pre-flight (never skip; a wrong tree wastes the whole task)

```bash
R=/Users/sebastianbarrozo/orca/workspaces/schema-forge/feature-detail-view   # or your checkout
F=tools/app-shell/src/components/contract-ui/DetailView.jsx

git -C "$R" rev-parse --short HEAD && git -C "$R" branch --show-current
wc -l "$R/$F"
git -C "$R" status --short
```

1. **Verify the tree is current.** State the HEAD sha and the line count out loud. If the line count
   is nowhere near what the task described, **STOP and report the mismatch** — do not proceed. A
   subagent in this repo once spent 17 minutes producing a green, tested, *unusable* extraction
   against a month-old snapshot because it never checked. Worktrees in particular can anchor to a
   different checkout than the one you were told about.
2. **Collision check.** Another in-flight branch editing the same file is the failure that killed
   ETP-4708:
   ```bash
   for b in $(git -C "$R" for-each-ref --format='%(refname:short)' refs/heads/ | grep -E 'feature/|epic/'); do
     c=$(git -C "$R" log --oneline "$b" ^HEAD -- "$F" 2>/dev/null | wc -l)
     [ "$c" -gt 0 ] && echo "$b has $c commits on $F not in HEAD"
   done
   ```
   Then, once Gate 1 has chosen a region, re-check **which of those branches touch lines inside it**
   — `git -C "$R" diff HEAD "$b" -- "$F"` and read the hunk headers. A branch editing an unrelated
   helper is noise; a branch editing the lines you are about to move is a merge conflict you have
   scheduled for yourself. Report either to the human, but treat the second as blocking.
3. **Prior-art check.** `ls docs/reports/` and read any hotspot/churn analysis present. Do not
   re-derive an analysis that already exists (this repo has burned a duplicate Jira task that way).

---

## Gate 1 — Pick the target from measured churn (MANDATORY)

```bash
node cli/src/ast-churn-hotspot.js --file "$F" --since <~2 months ago> \
  --out-json /tmp/hotspot.json
```

Read the **marker-region** ranking, not the AST-unit ranking. Reason: in a God Component one AST
unit (the component function) holds ~99% of the heat, so the AST table proves the monolith and then
has no resolution left. The marker regions are the only sub-structure that exists inside it.

Rank candidates on **three** columns, in this order:

| Column | Why it decides |
|---|---|
| `recentCommitCount` (since the cutoff) | Where churn *is now*. Highest-value cut. |
| `heatScore` (`lines × commits`) | Total historical pull. |
| State carried out of the parent | Risk. Count the `useState`/refs the region owns. |

Then pick the best **risk-adjusted** region: high recent churn × low state. A region with more total
heat but 15+ pieces of entangled state is a worse *first* cut than a hot, near-stateless one.

**Forbidden bases for the choice** — every one of these was produced by an agent that skipped this
gate:

- "the largest contiguous self-contained JSX block"
- "the biggest region by line count"
- "it's the cleanest to pull out"
- keyword-bucketing commit subjects instead of running the script
- inheriting a stale ranking from an older report without re-measuring

Those are proxies for *convenience*, not for churn. State your chosen region with its three measured
numbers, or you have not passed this gate.

**Regions are not automatically components.** A high-heat region can be an unlabelled tail of
several unrelated things (modals, drawers, a print sheet). Say what the component *is* before
naming it.

---

## Gate 2 — Classify the test blast radius BEFORE editing code

This is where extractions on this file go wrong. The suite is a golden master of ~155 files / ~3,150
tests that runs in ~35s — cheap enough that there is no excuse for skipping it, and large enough to
be worth trusting. Capture your own numbers (Gate 3) rather than quoting these. It contains three
structurally different kinds of test; classify every test that will fail *before* you move anything.

```bash
# Class C inventory — assertions pinned to DetailView.jsx's literal source text
cd "$R/tools/app-shell/src/components/contract-ui/__tests__"
for f in $(grep -l readFileSync *.js *.jsx | xargs grep -l 'DetailView.jsx'); do
  printf '%-50s %s\n' "$f" \
    "$(grep -cE 'assert\.(match|ok|doesNotMatch)\(\s*\w*[sS]rc\b|\w*[sS]rc\.(includes|indexOf|match)' "$f")"
done
```

The pattern must stay **variable-name agnostic** (`\w*[sS]rc`, not `src`). These files do not agree on
a name: most use `src`, but `hideDeleteButton.test.js` uses `detailViewSrc` and a `src`-only pattern
silently reports it as 0.

**The count is a triage estimate, not a gate.** It is an upper bound per file — a test file that
reads several sources (`hideDeleteButton.test.js` reads `DetailView.jsx`, `RowQuickActions.jsx` and
`DataTable.jsx`) has some assertions aimed elsewhere. Use it to find *which files* to open, then
**read them** and work out which assertions your specific region actually moves. Predict the blast
radius before you extract, and reconcile that prediction against reality afterwards — a mismatch is
a signal you moved something you did not intend to.

| Class | Shape | Breaks on extraction? | Allowed response |
|---|---|---|---|
| **A — behavioural** | RTL `render`/`fireEvent`, asserts DOM or callback | Only if you changed behaviour | **Never touch it.** A failing Class A test means your extraction is wrong. Fix the code. |
| **B — import-coupled** | `import { helper } from '../DetailView.jsx'` | Yes, if you move a named export | **Zero test edits.** Re-export from the original path (house pattern below). |
| **C — source-text-pinned** | `src = readFileSync('../DetailView.jsx')` then `assert.match(src, /regex/)` | Yes, structurally — text left the file | Repoint or upgrade, **declared and counted** (below). |

### Class B — the re-export shim (use this, it is the house pattern)

`DetailView.jsx` already does exactly this for the 76 helpers that moved to
`detailViewHelpers.jsx`. Find it with `grep -n "Re-exported for the suites" "$F"`:

```js
// Re-exported for the suites that import these from 'DetailView.jsx'.
// Only the definition site moved (R1: no test was edited).
export { /* … */ } from './detailViewHelpers.jsx';
```

Move the definition, re-export from the original path, and Class B costs **zero** test edits. This is
why ETP-4730's extraction landed and ETP-4708's did not.

### Class C — the one case where touching a test file is legitimate

The shim does **not** save Class C: those tests match the literal source text of `DetailView.jsx`, so
moving the text out breaks them no matter what you export. At the time of writing that is ~58
assertions across 10 files — **re-run the command above; do not trust that number.**

Class C is legitimate to touch, under all four conditions:

1. **Prove the move was verbatim** before touching the test —
   `diff <(git show HEAD:"$F" | sed -n 'A,Bp') <(sed -n 'C,Dp' NewComponent.jsx)` must show only
   indentation/import changes.
2. **Repoint only.** Change *which file* is read. Never loosen a regex, never delete an assertion,
   never widen a matcher to make it pass.
3. **Count and declare** every repointed assertion in your report, per file. A silent repoint is
   indistinguishable from weakening a test.
4. **Prefer upgrading.** These tests read source *because* `DetailView` was too heavy to mount —
   their own comments say so. Once the region is its own small component that reason is gone: a real
   RTL render test is strictly better coverage. Delegate writing it to the `test-generator` subagent
   (Tester) per CLAUDE.md — never write tests inline.

**If you cannot tell whether a failure is Class A or Class C, it is Class A.** Assume you broke
behaviour until the verbatim diff proves otherwise.

---

## Gate 2b — Confirm a golden master actually covers the region (STOP if not)

A green suite that never exercises your region is not a safety net. Before extracting, identify the
tests that *specifically* cover it and say which they are:

```bash
cd "$R/tools/app-shell/src/components/contract-ui/__tests__"
grep -ril 'toolbar\|action bar\|moreMenu\|<region keyword>' . | sort
```

**Verify by reading, never by filename.** `DetailView.saveButtons.vitest.jsx` may or may not touch
the toolbar; the name is a hint, not evidence. Open each candidate and confirm it asserts on the
region's behaviour.

Cross-check the coverage table in the June report §11.4 — it marks some regions `⚠️ parcial` or `❌`
and names the E2E spec to reuse per task.

**If no test covers the region: STOP.** Do not extract, and do not write the golden master yourself.
Delegate it to the `test-generator` subagent (Tester) per CLAUDE.md's mandatory delegation rule, and
require `docs/e2e-testing-guide.md` be read first for any Playwright spec (canonical reference:
`e2e/tests/flows/row-quick-actions.mocked.spec.js`). Extraction resumes only once the golden master
exists and is green.

**E2E results need their server verified.** Playwright here has no `webServer` block and inherits
whatever owns :3100 — a stale dev server from another checkout will happily make E2E pass against the
wrong tree. Confirm what is serving (`lsof -ti:3100`, then check the process's cwd) before treating
any E2E run as evidence.

---

## Gate 3 — Capture the green baseline, then extract

```bash
cd "$R/tools/app-shell" && npx vitest run src/components/contract-ui/ 2>&1 | tail -5
```

Record the **before** numbers (files/tests passed). Without a before-run you cannot tell "I broke
it" from "it was already red" — an agent that only ran tests afterwards could not make that call.
If the baseline is not green, stop and report that first.

Then extract, using `innocuous-check` extraction-marker mode for the mechanics. Constraints specific
to this file:

- **One region per branch.** Do not opportunistically extract a second region, declarativize a
  nearby window-specific literal, or tidy imports beyond what the move requires.
- **New file next to the original**, in `tools/app-shell/src/components/contract-ui/`.
- **Move the JSX, not the cold helpers.** Pure non-JSX top-level helpers the region calls
  (`resolveHideMoreMenu`, `isDeleteButtonVisible`, …) are churn-cold and are pinned by Class C tests.
  Leave them defined where they are and import them into the new component. Moving them buys nothing
  and breaks tests that had no reason to break.
- **Move the state with the JSX.** A region's own `useState`/refs go into the new component. Passing
  them back as 20 props relocates the complexity into the props list instead of removing it — the
  already-extracted `SecondaryFormTab`/`SecondaryTableTab` take ~40 props each and are still the
  hottest non-`DetailView` units in the file. That is the measured cost of getting this wrong.
- **Rules of Hooks are inviolable** — see `innocuous-check` M4.

---

## Gate 4 — R1 and R2 as they bind *here*

These are the "Restricciones rectoras" from `docs/reports/contract-ui-churn-analysis.md`, quoted
verbatim so this skill is self-contained. *"Una corrección que viole cualquiera de las dos es
inválida, por buena que sea la idea."*

> ### R1 — Inocuidad funcional al 100 %
> Toda corrección debe ser **behavior-preserving**: la app debe comportarse exactamente igual antes y
> después, en **todas las ventanas**, no solo en la que motivó el cambio. Esto es especialmente crítico
> aquí porque `DetailView`/`DataTable` son **componentes compartidos consumidos por todas las
> ventanas** — el riesgo no es romper una ventana, es romper N. Los reverts históricos
> (`noHoverHide — broke other windows`) son la prueba de que este riesgo es real.
>
> **Protocolo de verificación de inocuidad (obligatorio en cada PR):**
> 1. Usar la skill `innocuous-check` sobre el diff, hunk por hunk.
> 2. Los tests existentes (`DetailView.*.vitest.js`, `DataTable.*.vitest.jsx`, ~27 ficheros) deben
>    pasar **sin modificarse**. Si un test hay que cambiarlo, el cambio **no** es inocuo → revisar.
> 3. Verificación visual/funcional en una muestra de ventanas que ejerciten cada layout: `classic` y
>    `inlineEditable`, con líneas y con tabs secundarios (p. ej. sales-order, invoice, product,
>    exchange-rate).
> 4. PR de refactor puro **separado** de cualquier PR de feature. Nunca mezclar.
>
> ### R2 — Sobrevivir a la regeneración (los generadores se adaptan)
> - **Los componentes compartidos (`DetailView.jsx`, `DataTable.jsx`) NO se regeneran** → editarlos
>   sobrevive por sí solo. ✅
> - **El código por-ventana que los consume SÍ se regenera** → si una corrección requiere que la
>   ventana pase una prop nueva o una metadata de campo nueva, hay que implementarlo en
>   **`generate-frontend.js`** (y normalmente declararlo en `decisions.json` / contrato). Si no, el
>   siguiente `make regen` borra el cambio.

**One correction to R1 clause 2, forced by measurement:** it says ~27 test files and treats "a test
had to change" as a single condition. There are now ~155 files, and the condition splits three ways —
see Gate 2. Class A unmodified is the hard gate; a counted, verbatim-proven Class C repoint is not a
violation, because those tests pin *source text*, not behaviour.

### R1 in practice here

Not a style goal. Reverts in this file's history (`noHoverHide — broke other windows`) are what it
is protecting against.

```bash
cd "$R/tools/app-shell" && npx vitest run src/components/contract-ui/   # must match the before-run
cd "$R" && make test                                                   # full gate
make window-leak-budget                                                # must not silently improve
```

- Class A tests pass **unmodified**. Every Class C repoint counted and declared.
- Run `innocuous-check` on the diff and report its verdict verbatim.
- `make window-leak-budget` reporting *fewer* leaks is a red flag, not a win — it usually means a
  literal moved to a file the ratchet does not scan.
- Every extracted function/component is **exercised** by a test, not merely present in a green run
  (`innocuous-check` Step 5.4).

### R2 — survive regeneration, and stay in one repo

72 generated window pages import `{ DetailView } from '@/components/contract-ui/DetailView.jsx'` —
a **named export at a fixed path**. Keep that export and that path and the generated code never
notices your extraction.

```bash
grep -rh "import.*DetailView" artifacts/*/generated/web/*/*.jsx | sort -u
```

**`generate-frontend.js` does not live in this repo** (it moved to `schema_forge_core` in the split).
So a change to `DetailView`'s prop signature is not a local edit — it is a cross-repo PR, a package
publish, and a version bump. That pin-chain is one of the things that sank ETP-4708.

**Therefore: an internal decomposition must not change `DetailView`'s props.** If your extraction
seems to need a new prop, you have chosen the wrong boundary. Re-cut it, or stop and escalate.

Never edit generated files or `decisions.json` for this work — this is hand-written app-shell
runtime code, not pipeline output.

---

## Gate 5 — Re-measure

An extraction that does not shrink the parent did not happen. Prove it, and leave the next run a
baseline:

```bash
wc -l "$F" NewComponent.jsx                     # parent must have dropped by ~the moved lines
node cli/src/ast-churn-hotspot.js --file "$F" --since <cutoff> --out-json /tmp/hotspot-after.json
node cli/src/ast-churn-hotspot.js --file tools/app-shell/src/components/contract-ui/NewComponent.jsx --no-churn
```

Record three numbers: the parent's before/after line count, the region's heat as it *was*, and the
new file's own line count and unit count as its starting baseline. The new file has no churn history
yet — that is expected and is exactly why capturing it now makes the next run's comparison meaningful.

**Sanity-check the arithmetic.** `parent_before − parent_after` should be close to the lines moved. A
large gap means either code was duplicated rather than moved, or something outside the declared
region also moved.

---

## Gate 6 — Docs and report

Code change + doc update is **one atomic unit** (CLAUDE.md). A comment elsewhere that still says
"`DetailView` does X" when X moved is now wrong; fix it in this change. "Out of scope for a quick
win" is not available — that phrasing came from a baseline agent that left stale comments behind.

Report: region chosen + its three measured numbers; lines moved; files created/modified; Class C
repoints per file with counts; before/after test numbers; `innocuous-check` verdict; and anything
left rough.

---

## Rationalization table

Every excuse in this table was produced by a real agent attempting this task on this file.

| Excuse | Reality |
|---|---|
| "I only changed *which file* the test reads — no assertion was weakened" | That is a legitimate Class C repoint **only** after a verbatim-move diff, and only if you count and declare it. Undeclared, it is indistinguishable from weakening. Never valid for Class A. |
| "It's the largest contiguous self-contained JSX block, so it's the biggest win" | Size and syntactic tidiness are proxies for *convenience*. Gate 1 exists because they are not churn. |
| "The June report already ranked these, I'll use that order" | That ranking was drawn from comment markers by hand, and the file has since grown 20% and taken 209 commits. Re-measure. |
| "Tests are green, so the refactor is safe" | A green suite that never mounts the extracted component proves nothing. `innocuous-check` Step 5.4. |
| "It's a quick win, don't over-engineer it" | "Quick win" is how ETP-4708 started. The gates are ~5 minutes; the discarded branch cost weeks. |
| "Updating that stale comment is out of scope" | Docs freshness is part of the same atomic change. |
| "I'll extract two regions while I'm in here" | Scope creep is what lost the race against the epic. One region per branch. |
| "I'll add one prop to make the boundary work" | A prop change is a cross-repo publish (R2). Wrong boundary — re-cut it. |
| "The test was just brittle" | Only true for Class C, and only with the verbatim diff. Otherwise you are relabelling a regression. |

## Red flags — STOP

- About to edit a `.vitest.jsx` file (those are Class A behavioural tests)
- About to change a regex, matcher, or assertion body in any test
- Cannot state your region's `recentCommitCount` and `heatScore`
- Never ran `ast-churn-hotspot.js`
- No before-run of the suite
- Line count of the target file does not match what the task said
- Adding a prop to `DetailView`
- Editing anything under `artifacts/*/generated/`
- `make window-leak-budget` now reports fewer leaks
- Extracting a second region "while I'm here"

## Quick reference

```bash
R=/Users/sebastianbarrozo/orca/workspaces/schema-forge/feature-detail-view
F=tools/app-shell/src/components/contract-ui/DetailView.jsx

node cli/src/ast-churn-hotspot.js --file "$F" --since 2026-06-10   # Gate 1: pick target
cd "$R/tools/app-shell" && npx vitest run src/components/contract-ui/   # Gate 3/4: golden master (~32s)
cd "$R" && make test                                              # full gate
make window-leak-budget                                           # ratchet
grep -n "Re-exported for the suites" "$F"                          # Class B shim site
```

Applies to `DataTable.jsx` too — same script, same gates, `--file` points elsewhere.
