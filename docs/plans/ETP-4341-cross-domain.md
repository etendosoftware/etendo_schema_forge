# ETP-4341 — Cross-domain plan: default payment methods & terms in the initial dataset

## Summary

Ship the default **payment methods** (Efectivo, Transferencia bancaria, Cheque, Tarjeta) and
**payment terms** (Inmediato/I, 30D, 60D, 90D) as part of the GO initial dataset, so they are
available from onboarding with no manual setup, and **auto-assign payment methods to financial
accounts by type** (Cash → Efectivo; Bank → Transferencia bancaria + Cheque + Tarjeta;
Card → Tarjeta). Config replicates Etendo Classic: both pay-in/pay-out allowed, Manual execution;
terms use "next business day" for all except Inmediato. There is no payment-method/term management
screen in it1.

This is delivered on two fronts that are **one feature**: the dataset (so new tenants are born
with the data and the seeded accounts get their links) and the runtime handler (so accounts the
user creates later, any time, are auto-linked). A standalone corrective SQL exists for existing
servers but is run manually and **not committed**.

## Domains touched

| Repo | Changes |
|------|---------|
| `com.etendoerp.go` (runtime) | `referencedata/sampledata/GOClient/`: `FIN_PAYMENTMETHOD.xml` (+3 methods), `C_PAYMENTTERM.xml` (+60D/90D), `C_PAYMENTTERM_TRL.xml` (+translations, parity only — table intentionally excluded from import), `FIN_FINACC_PAYMENTMETHOD.xml` (+3 links wiring the seeded "Cuenta de Banco" account to Transfer/Check/Card). `FinancialAccountHandler` gains an `afterHandle` post-hook that auto-assigns the type's payment methods on create (matched by name, first = default, idempotent, best-effort). `FinancialAccountHandlerTest` extended with the assignment + helper coverage. |
| `schema_forge` (tooling/docs) | `docs/etendo-ad/onboarding-and-datafixes-map.md`: documents dataset-only provisioning for payment methods/terms and the runtime auto-assignment, including why `C_PAYMENTTERM_TRL` is not imported. This cross-domain plan file. |

Both sides are the same feature: the dataset seeds the master data + links for onboarded
tenants, and the runtime hook covers user-created accounts; the doc records the design so a
future run does not re-add a redundant data-fix.

## Tests

- `com.etendoerp.go` JUnit: `FinancialAccountHandlerTest` — +18 tests covering `afterHandle`
  routing (foreign spec / non-POST / no-id / happy / swallowed failure), assignment by type
  (C/B/CA), idempotency (existing link skipped), missing-method skip, `extractCreatedId`
  (array/object/missing envelopes) and the `findPaymentMethodByName` / `linkExists` / `createLink`
  DAL seams. Spy + `MockedStatic` style with `clearInlineMocks()` to keep the single test JVM heap flat.
- Dataset XML well-formedness verified (4 methods, 4 terms, 8 TRL rows, 4 finacc links).
- Manual backfill SQL validated against a local DB in rollback mode (6 methods + 4 terms + 17
  links inserted; second pass inserts 0 — idempotent). Not committed.

## Rollback

Revert the `feature/ETP-4341` commits in both repos. Runtime side: dropping the
`FinancialAccountHandler.afterHandle` override restores the prior behavior (no auto-assignment);
the added sampledata rows only affect future onboarding/imports, so removing them stops seeding
the new methods/terms — already-onboarded tenants are unaffected. Existing servers patched with
the manual backfill SQL would need the inserted `fin_paymentmethod` / `c_paymentterm` /
`fin_finacc_paymentmethod` rows deleted by `ad_client_id` if a full revert is required.
