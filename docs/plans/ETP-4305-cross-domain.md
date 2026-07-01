# ETP-4305 — Cross-domain plan

This PR is intentionally **cross-domain**: it changes the shared `app-shell-core`
component and also adds tests under the platform (`tools/app-shell`). This plan
documents the domains, tests, and rollback so the domain-boundary check can
approve the combined change.

## Domains (dominios)

- **app-shell-core** — `AddLineButton` generic component
  (`packages/app-shell-core/src/components/ui/add-line-button.jsx` + its specs).
  Behavior change: the chevron/dropdown now renders only when there is at least
  one additional action; with zero actions it renders a plain rounded button
  (removes the dead "no additional actions" placeholder).
- **platform-change** — coverage-only unit tests under `tools/app-shell`
  (`copilot/ocr/kinds/entityLookup.vitest.jsx`,
  `copilot/ocr/ingest/useBatch.vitest.jsx`). No production code in this domain is
  modified; these only exercise existing copilot utilities to raise coverage.

The two domains are touched together because the coverage gate is evaluated on
the whole branch; the app-shell-core fix itself is excluded from Sonar coverage,
so the coverage delta is contributed by the platform-side tests.

## Tests

- `add-line-button.vitest.jsx` — 0 / 1 / 2+ additional-action states.
- `add-line-button-hide-chevron.test.js` — `hideChevron` collapse + no placeholder.
- `entityLookup.vitest.jsx` — `escHql`, `deriveEntityEndpoint`, `useClickOutside`,
  `useEntitySearch` (debounce, fetch, fallbacks).
- `useBatch.vitest.jsx` — `batchUrl` derivation, success/non-ok/error paths.

All suites pass locally (vitest + node test runner).

## Rollback

No data or schema changes. To roll back, `git revert` the two commits on
`feature/ETP-4305` (the `AddLineButton` change and the copilot coverage tests);
the generic component returns to its previous always-chevron behavior and the
added test files are removed. No migration or deploy step is involved.
