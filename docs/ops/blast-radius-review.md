# Blast-Radius Review Rule (shared `contract-ui` components)

Review-phase gate for pull requests that touch `tools/app-shell/src/components/contract-ui/`.
Origin and full remediation plan: `docs/reports/contract-ui-churn-analysis.md` (proposal S8).

## Context

`DetailView.jsx` and `DataTable.jsx` are generic components rendered by **every** window — the
generated code under `artifacts/*/generated/web/` imports them across the whole window catalog.
A change there is never scoped to the window that motivated it: the risk is not breaking one
window, it is breaking N. The historical reverts recorded in the churn analysis
(`noHoverHide — broke other windows`) are evidence that this risk is real, not theoretical.

The failure mode is cheap and repeatable: a ticket asks for behavior in window X, the fastest fix
is one more `if (window === 'x')` inside the generic, and nobody notices the cost until another
window regresses. This rule makes that path visible and expensive at review time.

## The rule

A PR touching `contract-ui/` is **rejected** unless its description answers all three:

1. **Blast radius** — which windows the change can reach, and why it is safe for the windows the
   author never opened. "Only affects window X" is not credible for a generic component on its own;
   it needs a mechanism (guarded by an optional prop defaulting to today's behavior, a branch
   unreachable without new config, etc.).
2. **Why not `decisions.json`** — why the behavior could not be expressed as metadata/contract
   config consumed generically. A window name, entity name, or field name compared as a string
   literal inside the generic is a leak, not a solution — see the churn analysis §8.
3. **Mocked-E2E proof** — which `e2e/tests/flows/*.mocked.spec.js` specs were run, covering at
   least one window **other than** the one that motivated the change. Mocked specs need no backend.

Unit tests do not satisfy point 3. They render a component in isolation and cannot observe that a
different window broke — which is precisely the risk being reviewed.

## Refactors: the golden-master constraint

For a refactor of these files (no intended behavior change), the existing Vitest suites must pass
**unmodified**. A refactor that requires editing its own golden-master test is not
behavior-preserving; treat it as a blocker until the author re-justifies it or narrows the change.

## Automated backstop

`make window-leak-budget` ratchets the count of window-specific literals in these two files: it does
not fail for being above zero (there is inherited debt), only if the count **grows**. It catches new
leaks; it does not replace the review judgment above.

## Files involved

| File | Role |
|------|------|
| `.claude/agents/reviewer.md` | Alex's checklist — the enforcing rule |
| `docs/reports/contract-ui-churn-analysis.md` | Origin, evidence, and the T04–T34 remediation plan |
| `cli/window-leak-budget.json` | Ratchet baseline for window literals in the generics |
| `docs/e2e-testing-guide.md` | How to write and run the mocked specs point 3 requires |
