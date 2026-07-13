# ETP-4400 Cross-Domain Plan

## Scope

This PR spans two domains that are mechanically coupled: the fiscal-models
window (303 file generation, box computation, layout fixes) and the shared
i18n locale files that supply the new keys added for the 303 file generation
modal and error messages. The locale keys cannot live in the window domain
alone — they are loaded from the shared `tools/app-shell/src/locales/` layer
that all windows consume. Splitting the PR would leave missing i18n keys for
the window changes.

Domains:

- `window:fiscal-models`: forward all required parameters (IBAN, BIC, bank
  fields, rectificativa params) to the 303 file generation endpoint; introduce
  `FileGenModal303` replacing the previous generic modal; hide box 44
  (prorrata definitiva) for non-last quarterly periods; replace the period
  free-text input in `NewDeclModal` with a typed `<select>`; sync KPI summary
  cards with manual box overrides via `liveBoxes`; fix rectificativa and
  complementaria param forwarding; fix `applyOverrides` returning a plain
  object instead of an array (causing `boxArr.find is not a function` crash);
  fix declarations list scroll (missing `height: 100%` on wrapper div);
  remove sticky table header for consistency with other windows.
- `platform-change`: `tools/app-shell/src/locales/en_US.json` and
  `es_ES.json` — new keys for the 303 generation modal (`fm.filegen.*`,
  `fm.gen303.error.*`) and file generation action labels. These are shared
  locale files, not window-scoped; the addition is purely additive and does
  not affect any other window.

## Tests

- Vitest suite (`make test`): all existing tests pass; new tests cover
  `FileGenModal303` confirmation flow, `generate303File` with full param set,
  `applyOverrides` returning an array when overrides is empty, and
  `fm303Layouts` visibility rules for `datos_bancarios` with tipos I and G.
- E2E mocked spec (`fiscal-models-303-identification.mocked.spec.js`):
  updated to use `select` for the period field in `NewDeclModal` and to
  reflect the updated `datos_bancarios` visibility rules (tipo I now shows
  Domiciliación section; tipo N hides it).
- Manual: 303 file generation confirmed working end-to-end for 2022/T1 with
  tipo C (no IBAN required); declarations list scrolls correctly with 12+
  rows; table header scrolls with content.

## Rollback

- Revert the six Schema Forge commits on `feature/ETP-4400`. No decisions,
  contract, or generated artifacts were modified — all changes are in custom
  window source files and shared locale JSON.
- No `push-to-neo` was run; no `ETGO_SF_*` table changes are included.
- No database migration or export is required; rollback is a plain git revert.
