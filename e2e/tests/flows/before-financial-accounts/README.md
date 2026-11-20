# Specs that run before any financial account exists

The `integration` Playwright project runs with one worker, and Playwright runs
the files in alphabetical order of their path. This folder sorts before
`finance/`, `platform/` and `purchases/`, the first specs that create a
financial account (`financial-account-cash-close`, and every caller of
`ensureVendorSetup()` → `ensureFinancialAccountSetup()`).

So the specs here run against the tenant exactly as onboarding left it: no
financial account and no `FIN_FINACC_PAYMENTMETHOD` row. A sales document must
still be creatable then. ETP-6377 shipped because every sales spec ran after
the cash-close spec had created a "Caja" account, and on a fresh tenant the
quotation create was refused with `REFERENCE_NOT_ALLOWED` on `paymentMethod`.

Rules for this folder:

- A spec here must not create a financial account, directly or through a
  helper (`ensureVendorSetup`, `ensureFinancialAccountSetup`). Specs in
  `accounting/` and `contacts/`, which sort before this folder, must not
  create one either.
- Each spec calls `noteFinancialAccountPrecondition(page, test.info())` right
  after login. It changes nothing; when the tenant already has an account (a
  local run reusing `.auth-credentials.json`) the report carries a
  `fresh-tenant` annotation saying the case was not exercised.
- A spec here provisions its own master data and never relies on what another spec
  left behind: the tenant also has no contacts yet. It calls `ensureCustomerSetup(page)`
  (sales-helpers.js) after login for the customer, and the product helpers for the
  products. Both are API-only and never create a financial account.
- Do not rename this folder to anything that sorts after `finance/`.
