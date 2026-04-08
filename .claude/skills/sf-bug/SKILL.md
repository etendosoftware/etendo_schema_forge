---
name: sf-bug
description: >
  Report a bug in the Schema Forge tooling. Use this skill when something is broken in the
  tool itself — CLI generators, frontend components, pipeline steps, NEO Headless integration —
  regardless of which window is being worked on. Do NOT use for window classification decisions
  (which fields to show, which rules to keep). Triggers on: "bug", "broken", "no funciona",
  "roto", "error en el pipeline", "siempre pasa en todas las ventanas".
argument-hint: "[brief description of the issue]"
---

# /sf-bug — Report a Schema Forge Tool Bug

**Arguments:** `$ARGUMENTS` (optional: brief description of the issue)

---

## Step 1: Is it a bug?

A **tool bug** is anything the pipeline gets wrong systematically — crashes, incorrect output, or AD metadata it silently ignores. It affects ALL windows, not just the one currently being worked on.

There are two kinds:

**Type A — Something is broken:** the pipeline crashes, generates invalid code, or produces output that doesn't work at runtime.

**Type B — Something is missing:** the pipeline ignores an AD field or concept that exists in Etendo, so the generated result is incomplete or incorrect for every window that has that feature (e.g. ignoring `UIPattern`, ignoring button columns without a linked process, ignoring display logic on buttons).

| Situation | Type | Action |
|-----------|------|--------|
| Pipeline crashes or generates invalid code | **Tool bug (A)** | Proceed |
| Generated UI doesn't work (wrong URL, broken state) | **Tool bug (A)** | Proceed |
| Pipeline ignores an AD field → wrong output in all windows | **Tool bug (B)** | Proceed |
| Only wrong for this specific window's fields/rules/design | **Window decision** | Use `/classify` instead |
| Etendo AD data is missing or incorrect | **Data issue** | Fix AD data, not the tool |

If unsure, ask: _"Would this also happen if we ran the pipeline on a different window?"_ If yes → tool bug.

**Before concluding it's a bug, ALWAYS verify in the code (MANDATORY):**

1. Search the relevant CLI files (`cli/src/extract-fields.js`, `cli/src/generate-contract.js`, `cli/src/generate-frontend.js`, `cli/src/pipeline.js`) for any handling of the reported concept.
2. Search the frontend components (`tools/app-shell/src/`) for any existing implementation.
3. Check `core-maps/` for any reference data that might already model the concept.

Only proceed if the code confirms the behavior is truly absent or broken. If it IS already handled somewhere, tell the user where and explain why the issue might be something else (configuration, data, window decision).

---

## Step 2: Capture the bug details

Ask the user for any missing information:

- **Title**: short imperative sentence (e.g. "Process buttons not functional in generated frontend")
- **Affected component(s)**: which file(s) or layer (CLI, frontend component, useEntity hook, etc.)
- **Failure description**: what breaks and why
- **Reproduction**: does it happen on every window? Any specific condition?
- **Proposed fix** (if known)

**Description writing rules:**
- NEVER mention a specific window in the description (e.g. "en la ventana de cobros..."). The description must speak about the tool behavior generically.
- The specific window where the bug was discovered goes ONLY in the "Steps to reproduce" section, as a concrete example.
- ✅ "The pipeline ignores button columns that have no linked AD_Process."
- ❌ "In the Payment In window, buttons don't appear."

---

## Step 3: Confirm before creating

Show a summary:

```
Title:     [title]
Component: [affected files/layer]
Assignee:  valenvivaldi
GH Repo:   etendosoftware/etendo_schema_forge
```

Wait for user confirmation.

---

## Step 4: Research the fix (MANDATORY before creating the issue)

Before writing the issue, read the affected source files to produce concrete code changes. Do NOT write vague suggestions like "fix the function" — write the exact before/after diff.

For each affected file:
1. Read the relevant section of the file
2. Identify the exact lines that need to change
3. Produce a diff block showing the change

If the fix is unknown or too complex to determine, write a detailed analysis of the root cause instead.

---

## Step 5: Create the GitHub issue

```bash
gh issue create \
  --repo etendosoftware/etendo_schema_forge \
  --title "[title]" \
  --label "bug" \
  --assignee "valenvivaldi" \
  --body "$(cat <<'EOF'
## Description

[Clear description of what fails and in what context. Mention it affects all windows, not just one.]

## Steps to reproduce

1. Run the pipeline for any window (`node cli/src/pipeline.js ...`)
2. [Specific step]
3. [Observe the failure]

## Expected behavior

[What should happen instead]

## Affected components

- `[file/component 1]` — [what is wrong]
- `[file/component 2]` — [what is wrong]

## Proposed fix

[Rules:
- Short fix (≤ 30 lines total): include the full diff inline for every file.
- Long fix (> 30 lines): include file + line reference and show only the key changed lines, summarize the rest.
- Fix unknown: include a root cause analysis instead.]

**`path/to/file.js`** (line N)
\`\`\`diff
- old code line
+ new code line
\`\`\`
EOF
)"
```

Report to user:
```
GitHub: etendosoftware/etendo_schema_forge#N — [title]
```

---

## Known Bug Patterns

These bugs have already been identified in the tool. Use as reference when evaluating new reports — if the user describes something matching a known pattern, link to the existing issue instead of creating a duplicate.

---

### BUG-001: Process buttons not functional — incomplete pipeline support

**Status:** Open
**Components:** `cli/src/generate-contract.js`, `cli/src/generate-frontend.js`, `tools/app-shell/src/hooks/useEntity.js`, `tools/app-shell/src/components/contract-ui/`
**Affects:** All windows with process buttons

**Failure points (4):**

1. **`generate-contract.js`** — `generateBackendContract` drops `columnName` and `params` from `processes.json`. They enter but never reach `processEndpoints` in `contract.json`.

2. **`generate-frontend.js`** — The generated `processes` array in the page component only contains `name`, `label`, `style`. Missing `columnName` (needed to build the action URL) and `params` (needed to show a parameter modal).

3. **`useEntity.js` line ~285** — `handleProcess` calls the wrong URL:
   ```js
   // Broken:
   POST ${apiBaseUrl}/process/${processName}
   // Correct (NEO action endpoint):
   POST ${apiBaseUrl}/${entity}/${id}/action/${columnName}
   ```
   The broken URL does not exist in NEO — always 404.

4. **No parameter modal** — Processes with visible parameters (e.g., Payment Process needs P/RE/V action; Reverse Payment needs a date) have no mechanism to capture those values before execution.

**Proposed solution:**
- `generate-contract.js` → pass `columnName` and `params` to `processEndpoints`
- `generate-frontend.js` → emit `columnName` and `params` in the generated array; add `reverse` to destructive style pattern
- `useEntity.js` → fix `handleProcess(process, paramValues)` to call `/{entity}/{id}/action/{columnName}`
- New `ProcessModal.jsx` → dialog that renders `list` (select) and `date` params, auto-injects hidden params
- `DetailView.jsx` → on button click: if visible params → open modal; if not → execute directly

---

### BUG-002: SearchInput blocks user input — query state overwritten on every keystroke

**Status:** Open
**Component:** `SearchInput` inside `tools/app-shell/src/components/contract-ui/EntityForm.jsx`
**Affects:** All fields with `inputMode: "search"` in any window

**Symptoms:**
1. User cannot edit the input text — each keystroke reverts to the previous value
2. No way to clear an already-selected value

**Root cause:** A `useEffect` resets `query` every time `value` or `displayValue` changes. The input's `onChange` propagates the text up to the parent, the parent updates state, which triggers the `useEffect`, which resets `query` back to the original value. The input is permanently locked.

**Proposed solutions:**

- **Option A (recommended):** Track whether the user is actively editing with a `ref`. The `useEffect` only resets `query` when the change comes from outside (initial load, programmatic change). The flag is released on `onBlur`.
- **Option B:** Fully separate visual state (`query`) from real value (`value`). The input manages its own text without syncing to `value` until the user selects an option from the dropdown or clears with blank text on blur.

---

### BUG-003: AD_Tab.UIPattern ignored — Add button shown on read-only tabs

**Status:** Open
**Components:** `cli/src/extract-fields.js`, `cli/src/generate-contract.js`, `cli/src/generate-frontend.js`
**Affects:** All windows with child tabs that are RO (Read Only) or SR (Single Record)

**Context:** `AD_Tab.UIPattern` controls tab editability in Etendo:
- `STD` — Standard, editable, allows add/delete
- `RO` — Read Only
- `SR` — Single Record, no add/delete

The pipeline ignores this field and always generates an **Add** button for every child entity. The server (OBDal) rejects the insert, but the user sees a form, fills it in, and gets an error on save. Pure UX breakage.

**Example (Payment In window):**
| Tab | UIPattern | Generator produces | Correct? |
|-----|-----------|-------------------|----------|
| Lines | RO | Add button | ❌ |
| Accounting | SR | Add button | ❌ |
| Used Credit Source | RO | Add button | ❌ |
| Execution History | RO | Add button | ❌ |
| Exchange rates | STD | Add button | ✅ |

**Proposed fix (3 files):**

`cli/src/extract-fields.js` — add `t.UIPattern AS ui_pattern` to the `AD_Tab` SELECT and map it as `uiPattern` in the tab object.

`cli/src/generate-contract.js` — propagate `uiPattern` (default `'STD'`) as a property of each entity in the contract.

`cli/src/generate-frontend.js` — read `uiPattern` from the contract; omit the `addLineFields` block and the `addLineFields={addLineFields}` prop in `DetailView` when value is `RO` or `SR`. `DetailView.jsx` needs no changes — when it does not receive `addLineFields`, the Add button is automatically hidden.

---

## Notes

- Always verify the bug is not already in the Known Bug Patterns section before creating a new issue.
- Bug titles must be in English, imperative form, max 80 chars (Git Police limit for commit messages).
- The GitHub repo for this tool is `etendosoftware/etendo_schema_forge`.
- Do NOT create issues for: wrong field classification in a specific window, user preference decisions, Etendo AD data gaps.
