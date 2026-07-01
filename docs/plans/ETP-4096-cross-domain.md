# ETP-4096 — Cross-domain plan

**Feature:** Account creation/edit T2 for the `financial-account` window — add the
**Card** account type (`type=CA`, reusing the value the PSD2 module contributes to
the core "Financial account type" reference) to the New Account wizard's offline
flow, show the PSD2 **masked card number** instead of an IBAN for card accounts,
and a couple of small UX fixes (currency dropdown opens downward; connection-step
copy adapts to cards).

This PR is approved as cross-domain because a single window feature unavoidably
touches the shared i18n catalog and the shared `financial-accounts` component
layer that the window consumes. The change is small and inseparable from the
window feature.

## Domains touched

### `window:financial-account` (primary)
The feature itself — the New Account wizard, the account form and the movements
summary strip:
- `windows/custom/financial-account/NewAccountWizard.jsx` — Card reuses the full
  bank flow (connection → bank → institution → form); the "coming soon"
  placeholder is removed; connection-step title/descriptions adapt to cards.
- `windows/custom/financial-account/AccountFormStep.jsx` — new `mode='card'`
  (Name + Currency only) emitting `type='CA'`; the currency `Select` opens below
  the trigger (`side="bottom"`).
- `windows/custom/financial-account/AccountSummaryStrip.jsx` — shows the masked
  card number (not an IBAN) for cards; hides the block when no PAN.
- `docs/generated-custom-windows/financial-account.md` — window guide updated.
- Matching `__tests__` for the above.

### `app-shell-core` (shared i18n)
- `packages/app-shell-core/src/locales/en_US.json`, `es_ES.json` — new
  `financeAccountsNewFormCardTitle`, `financeAccountsNewConnection*Card`,
  `financeAccountDetailCardNumber` keys (en/es parity). There is no per-window
  locale file; window i18n strings live in the shared catalog by design.

### shared `financial-accounts` components (reported as `unknown`)
Shared, app-shell-level components for the accounts list that this window's pages
consume. They carry the account-type model and the row rendering, so the Card
type lands here too:
- `tools/app-shell/src/components/financial-accounts/tokens.js` — `ACCOUNT_TYPE.CARD = 'CA'`.
- `tools/app-shell/src/components/financial-accounts/AccountsTable/AccountRow.jsx` —
  second line shows the masked card number for cards (IBAN for banks).
- Matching `__tests__` for `AccountRow`, `AccountLogoAvatar`, `AccountTypeFilter`,
  `SyncStatusInline`, and the feature `index` re-export.

## Tests

- **Frontend (Vitest):** full `financial-account` + `financial-accounts` suites
  are green (352 tests). New/updated coverage:
  - `NewAccountWizard.vitest` — Card flow (connection → bank skip → form, no
    IBAN) and create with `type=CA`.
  - `AccountFormStep.vitest` — `mode='card'` emits `type=CA`, no IBAN/BIC.
  - `AccountSummaryStrip.vitest` — card shows the masked PAN (no copy button),
    hides the block when no PAN.
  - `AccountRow.vitest` — card renders the masked PAN, falls back to "—".
  - `tokens`/`AccountTypeFilter`/`AccountLogoAvatar`/`SyncStatusInline` updated to `CA`.
- **Backend (JUnit, com.etendoerp.go):** `FinancialAccountHandlerTest.normalizeType`
  keeps `CA`; `FinancialAccountsPageHandlerTest` asserts `maskedPan` is serialised
  for a `type=CA` account.

## Rollback

Purely additive — a new type option in the wizard plus a display tweak; nothing
existing changes behaviour.

- **Frontend:** revert the schema_forge `feature/ETP-4096` commits. The wizard
  loses the Card path, `ACCOUNT_TYPE.CARD` reverts, rows/strip stop reading
  `maskedPan`, and the new i18n keys become unused (harmless).
- **Backend:** revert the `com.etendoerp.go` commit; `normalizeType` stops
  accepting `CA` (coerced to `B`) and `maskedPan` drops from the accounts payload.
  No DB schema change is involved — the `CA` ref-list value belongs to the PSD2
  module, not to Schema Forge.
