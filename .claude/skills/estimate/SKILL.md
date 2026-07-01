---
name: estimate
description: >
  Plan and estimate a development task using an additive, component-based point system
  (Fibonacci base points per item type + risk factors). Produces a decomposed estimate,
  an hours range, a t-shirt size, and a list of the difficulties/risks that drive the cost.
  Also runs calibration: comparing an estimate against the real worklogs once a task is done,
  and proposing tweaks to the points table. Use when the user wants to estimate, plan, size,
  or score a task, asks "how long will this take", "cuánto va a costar", "estimemos esto",
  "puntuá esta tarea", "planificación", or wants to review why a task overran its estimate.
argument-hint: "[Jira key, e.g. ETP-4033, or a free-text task description]"
---

# /estimate — Task Planning & Estimation

**Arguments:** `$ARGUMENTS` (optional: a Jira issue key like `ETP-4033`, or a free-text description of the work)

This skill sizes a task by **decomposing it into components**, scoring each component with base
points, applying **risk factors**, and converting the total into an hours range. The goal is not
just a number — it is to surface **where the difficulty lives** before the work starts.

> **The scoring model is data, not logic.** All point values, risk factors, and the points→hours
> ratio live in **`points-table.md`** (next to this file). Always read it at runtime — never
> hardcode values from this document. To tune the model, edit that file; this skill stays stable.

---

## Step 1 — Load the task

- If `$ARGUMENTS` is a Jira key (`ETP-####`): fetch it.
  ```bash
  jira issue view <KEY> --plain
  ```
  Read the Description, Solution Design, and Casos de prueba. Note the existing original estimate
  if there is one (do not anchor on it — estimate independently, then compare).
- If `$ARGUMENTS` is free text: use it directly. Ask for acceptance criteria only if the scope is
  genuinely ambiguous (one round of questions max).
- If nothing is given: ask what to estimate.

## Step 2 — Read the model

Read **`points-table.md`** in this skill folder. It defines:
1. **Base item types** with Fibonacci point values.
2. **Risk factors** with additive percentages.
3. The **points → hours** ratio and the **t-shirt size** bands.

## Step 3 — Decompose into components

Break the task into concrete pieces of work and map each to a base item type from the table.
Be explicit — a "build a window" task is usually 5–8 separate items (list view, header form, lines
grid, modals, generation logic, handler, tests, i18n). Missing components is the #1 cause of
under-estimation (see the ETP-4033 anchor in the calibration log).

If a piece of work has no matching item type, pick the closest one and **flag it** — that is a
signal the table needs a new row. **Register it now (Step 3.6), don't just propose it.**

## Step 3.6 — Grow the model (register new item/risk types as you find them)

The table is meant to **keep growing**. Whenever this estimate surfaces something the model doesn't
yet capture, write it back so future estimates inherit it — the skill self-populates, it doesn't wait
for a post-mortem.

Trigger this step when, during decomposition, you hit any of:
- **A new item type** — a recurring unit of work with no close-enough row (e.g. a kind of modal,
  generator, layout, or backend hook the table doesn't list).
- **A new risk or discount factor** — a cost/saving driver not in §2 / §2b (e.g. a new quality gate,
  a new reuse mechanism the platform provides).
- **A new whole-task archetype** — a recognizable *shape* of task (e.g. "adapt-existing-window",
  "first-of-a-family", "loose-issues-bundle") worth naming for future calibration.

What to do:
1. **Add the row to `points-table.md`** in the right section. For a new item type, assign a Fibonacci
   value by analogy to its nearest neighbours (state the analogy). For a factor, give a % range. Keep
   the row **generic** — describe the casuistry, never the specific ticket.
2. **Log a one-line note in `calibration-log.md`** under a "Model growth" running list: what was added,
   why, and that the value is **provisional (no actual yet)** so a later calibration can confirm it.
3. **Tell the user** what you added, inline in the estimate output ("added `<row>` = N pts — new").

Discipline: only register things that are **reusable across tasks**. A one-off quirk of this ticket
is not a new row — fold it into the closest existing item and mention it. New values start
**provisional** and get confirmed/adjusted by real worklogs in Step 6. Don't silently overwrite an
existing row's number during an estimate — that's a calibration decision (Step 6), which needs the
user's OK.

## Step 3.5 — Reuse audit (run BEFORE you lock the points)

The biggest estimation errors here are not arithmetic — they are **mis-classifying what already
exists as new work**. For every component, ask these questions and downgrade/exclude accordingly.
This is what keeps a "mejorar una ventana" task from being scored like "build a window".

1. **Does the field/column already exist?** A field the ticket says to "add" is often already in the
   AD schema (a child tab, a standard column). Check `schema-raw.json` / the artifact. If it exists,
   it's `surface-existing-field` (1), **not** a new column or `alter-db`.
2. **Does a native process already do this behaviour?** Posting/Complete already gives accounting
   inversion, payment-schedule, VAT, and balance/paid-state effects for free (NEO reuses the classic
   chain). Callouts, display-logic, and combo validation rules are reused too. If so → reuse (0 pts /
   `wire-native-process-button`), **not** a `java-handler`. (See the reuse warning in `points-table.md`.)
3. **Is this the 2nd+ implementation of a pattern a sibling task built?** If a prior/sibling ticket
   already built the framework (same feature on another window), this is copy-with-deltas → apply the
   `second-mover-reuse` discount. The *first* such task carries the framework cost; the rest don't.
4. **Does another ticket own this piece?** A cross-window dependency can *remove* scope: if the
   generating action/popup/handler lives in a sibling ticket, score it **0 here** and say so. (The
   `cross-window-dependency` risk and a scope exclusion are different things — apply whichever is true.)
5. **Is it a display convention, not a backend change?** "Show the total negative", "hide the
   indicator" are `list-display-rule` (1) tweaks, not backend sign logic.
6. **Is it "suppress/extend something that exists" vs "build new"?** Conditioning an existing popup or
   branching an existing component is `suppress-existing-behavior` / `extend-shared-component`, far
   below the from-scratch row.
7. **Where did each item come from?** Tag each as **ticket description** vs **functional/design doc**
   vs **pure technical analysis**. Analysis-only items are usually prerequisites to *verify* (do the
   doc types exist?) — don't pad the estimate with speculative build work, and don't silently drop a
   requirement that only the design doc states.

Adapting an existing window is **strictly less** than building a new one — the platform compresses
everything toward config (`decisions.json`), but the relative ordering still holds. If your numbers
say otherwise, re-run this audit.

## Step 4 — Identify risk factors and reuse discounts

Go through the risk factors (§2) AND the reuse/discount factors (§2b) in the table and mark every one
that applies, with a one-line justification. Both are **additive percentages** applied once to the
base sum (they do not compound); discounts are negative and the net factor is floored (see §3). Be
honest in both directions:
- The factors that historically **blow up** estimates: shared-component refactors (SonarQube/
  architecture checks), cross-window dependencies, late-discovered functional bugs, CI quality gates.
- The factors that historically make estimators **over-shoot**: scoring native-process reuse as new
  backend, and ignoring the second-mover discount on the 2nd+ implementation of a pattern.

## Step 5 — Compute and present

```
base_points  = Σ (item base points)
risk_uplift  = Σ (applicable risk percentages)        # e.g. +30% + +20% = +50%
total_points = base_points × (1 + risk_uplift)
hours        = total_points × HOURS_PER_POINT          # from points-table.md
```

Present the estimate as:

1. **Component breakdown** — a table: item | base points | note.
2. **Risk factors** — a table: factor | +% | why it applies.
3. **Total** — base points, risk uplift, total points, hours range, **t-shirt size**.
4. **Top difficulties** — 2–4 bullets naming what will likely be hard or slow, derived from the
   heaviest components and the active risk factors. This is the most valuable output.
5. **Comparison** — if the task had an existing estimate, state the delta and why they differ.
6. **Model changes** — if Step 3.6 registered any new item/risk/archetype, list them here ("added
   `<row>` = N pts, provisional") so the user sees the model grew this run.

Keep numbers honest. If the scope is fuzzy, give a range (e.g. "18–26 pts") rather than false
precision, and say what would tighten it.

## Step 6 — Calibration (when a task is DONE)

When the user asks to review a finished task (or "why did X overrun"), do the **reverse**:

1. Fetch the real worklogs and the original estimate:
   ```bash
   # worklogs (RTK filters curl JSON — bypass it with `rtk proxy`)
   rtk proxy curl -s -u "$JIRA_LOGIN:$JIRA_API_TOKEN" \
     "https://etendoproject.atlassian.net/rest/api/3/issue/<KEY>/worklog" -H "Accept: application/json"
   # estimate + status changelog
   rtk proxy curl -s -u "$JIRA_LOGIN:$JIRA_API_TOKEN" \
     "https://etendoproject.atlassian.net/rest/api/3/issue/<KEY>?fields=timeoriginalestimate,timespent&expand=changelog" -H "Accept: application/json"
   ```
   (`$JIRA_LOGIN` = the `login` in `~/.config/.jira/.config.yml`; `$JIRA_API_TOKEN` from env.)
2. Read each worklog comment and classify where the time went (new feature vs. rework vs. CI/quality
   gates vs. analysis).
3. Identify the **real difficulties** — under-counted components, risk factors that materialized,
   and any new failure mode not yet in the table.
4. **Append a calibration entry** to `calibration-log.md` (estimate vs. actual, what was missed).
5. **Propose concrete table tweaks** to `points-table.md` (e.g. "raise `invoice-generation` from 5 to
   8", "add a `ci-quality-gates` risk factor"). Apply them only with the user's OK — the table is
   shared and committed.
6. **Confirm provisional rows.** Check the "Model growth" list in `calibration-log.md` for rows added
   during estimation (Step 3.6) that this finished task exercised. Now that you have a real actual,
   mark each as confirmed (keep / adjust the value) and move the note from provisional to a real
   calibration finding.

---

## Output discipline

- Versioned content is English (repo policy); conversation with the user may be Spanish.
- Never invent point values — read them from `points-table.md`.
- The estimate is a tool for conversation, not a contract. Always pair the number with the
  *difficulties* that justify it.
