# DetailSidePanel extraction

## Scope

Extracted the cold, stateless `sidePanel` JSX block from `DetailView.jsx` into `DetailSidePanel.jsx` without changing the public `DetailView` props or any behavioral tests.

Measured target before extraction:

- Region: `DetailView.jsx:4247–4254`
- Size: 8 lines
- Historical churn: 5 commits, heat 40 (`8 × 5`)
- Recent churn since 2026-06-10: 0 commits
- State owned by the region: none

## Result

- `DetailView.jsx`: 4569 → 4563 lines (`-6`)
- `DetailSidePanel.jsx`: 24 lines, 1 exported component
- Inputs preserved: `sidePanel`, `sidePanelStyle`, `data`, `recordId`, `token`, `apiBaseUrl`, `api`, `isNew`
- `renderSidePanel` remains the same helper and is called with the same argument order.

## Verification

- `npx vitest run src/components/contract-ui/__tests__/DetailView.render.vitest.jsx` — 369/369 passed before and after.
- `make window-leak-budget` — 8 leaks, baseline 8.
- `git diff --check` — passed.
- Source-pinned tests were inventoried; no test files were modified.

The broader `src/components/contract-ui/__tests__` run emitted the existing `ImportLinesModal: linesEndpoint prop is required` errors and did not produce a final Vitest summary, so it is not treated as evidence for this extraction.
