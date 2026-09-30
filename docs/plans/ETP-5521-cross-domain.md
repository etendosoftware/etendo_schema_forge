# ETP-5521 — Cross-domain plan

**Bug:** creating an OFFLINE bank (or card) account and picking a bank from the Salt Edge provider
list did not store the provider logo (cards did not even link the provider), so the account row kept the generic `<Landmark>` placeholder.

This change is approved as cross-domain because the logo has to travel end to end in one piece:
the wizard must send it, the shared account-mutation hook must forward it, and the backend
handler must persist it. Shipping any side alone leaves the bug in place (a dropped key on the
way, or a key nobody reads).

Companion change in `com.etendoerp.go` (same branch `feature/ETP-5521`):
`FinancialAccountHandler.enrichProvider` reads the transient `providerLogoUrl`, sanitizes it
(https on the Salt Edge logo CDN host, at most 255 chars, else `null`) and passes it to
`ProviderCatalogUtils.upsertProvider(code, name, null, logoUrl)` only when the provider has no
logo yet (fill-only), so it writes `PSD2_PROVIDER.LOGO_URL` without ever replacing one. Test: `FinancialAccountHandlerProviderTest`.

## Domains touched

### `platform-change` — shared account-mutation hook
`toDalBody` forwards `providerLogoUrl` only when it is non-blank.

- `tools/app-shell/src/hooks/useAccountMutations.js`
- `tools/app-shell/src/hooks/__tests__/useAccountMutations.vitest.jsx`

### `window:financial-account` — New Account wizard + window guide
`handleCreate` adds `providerLogoUrl: selectedBank.logoUrl` to the provider payload; the guide
documents the stored logo, its sanitization and the remediation for older accounts.

- `tools/app-shell/src/windows/custom/financial-account/NewAccountWizard.jsx`
- `tools/app-shell/src/windows/custom/financial-account/__tests__/NewAccountWizard.vitest.jsx`
- `docs/generated-custom-windows/financial-account.md`

### `window:financial-accounts-page` — window guide only
Stale wizard description refreshed (live provider catalog, "Con conexión" active, logo stored).

- `docs/generated-custom-windows/financial-accounts-page.md`

## Tests
- `npx vitest run src/windows/custom/financial-account/__tests__/NewAccountWizard.vitest.jsx src/hooks/__tests__/useAccountMutations.vitest.jsx` (from `tools/app-shell`).
- `FinancialAccountHandlerProviderTest` in `com.etendoerp.go`.

## Rollback
No data migration, no NEO push, no schema/contract change. Revert the commit in both repos;
logos already written to `PSD2_PROVIDER.LOGO_URL` are valid catalog data and can stay.
