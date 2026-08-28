# ETP-4893 — Cross-domain plan: replace the "Cheque" payment method with "Recibo"

## Summary

Retire the **`Cheque`** payment method and introduce **`Recibo`** in its place, with the
configuration signed off by functional (verified field-by-field against the manually-configured
Payment Method window), and associate `Recibo` to **every** financial account of type **Bank
(`B`)** *and* **Card (`CA`)** — retroactively on existing tenants and automatically on accounts
created from now on. `Cheque` must stop appearing in any payment-method selector.

`Recibo` is a **new** `FIN_PaymentMethod` row, not a rename of `Cheque`. A rename would relabel
every payment and invoice already issued "por cheque"; creating a new method keeps that history
intact. The price of that choice is that processed documents keep pointing at `Cheque`, which is
why `Cheque` is deleted only when nothing references it and deactivated (`isactive='N'`) otherwise.

Target configuration, per the window:

| | Pay IN | Pay OUT |
|---|---|---|
| Allowed | ✅ `payin_allow='Y'` | ✅ `payout_allow='Y'` |
| Automatic | ☐ `automatic_receipt='N'` | ☐ `automatic_payment='N'` |
| Multi-currency | ✅ `payin_ismulticurrency='Y'` | ✅ `payout_ismulticurrency='Y'` |
| Auto deposit / withdrawn | ✅ `automatic_deposit='Y'` | ✅ `automatic_withdrawn='Y'` |
| Execution type | Manual (`'M'`) | Manual (`'M'`) |
| Receipt / Payment account | (empty) | (empty) |
| Deposit / Withdrawal account | `DEP` | `WIT` |
| Reconciliation account | `CLE` | `CLE` |
| Wire Transfer | — | ☐ `em_psd2_is_bank_transfer='N'` |

`Recibo` is the only one of the four seeded methods with the reconciliation accounts set (`CLE`);
the other three keep them empty. That is deliberate and scoped to `Recibo`.

This is delivered on **three fronts that are one feature**: the onboarding dataset (new tenants
born correct), the runtime handler (accounts created later), and a corrective data-fix (the 35
existing GO tenants). Shipping any subset leaves part of the fleet broken.

## Domains touched

| Repo | Changes |
|------|---------|
| `com.etendoerp.go` (runtime) | `referencedata/sampledata/GOClient/FIN_PAYMENTMETHOD.xml`: the `Cheque` block is removed and replaced by `Recibo` (`FBC13FFB5535450781A9B06DC57D1C99`), which is the first block in this file to carry `INUPONCLEARINGUSE`/`OUTUPONCLEARINGUSE='CLE'`. `FIN_FINACC_PAYMENTMETHOD.xml`: the former Cheque link (`5DCF1BEE…`) is repointed to `Recibo` on **Cuenta de Banco** (`ISDEFAULT=N`, so Transferencia bancaria keeps the default) and a new link (`29191D7B319B4FECBFD9625C910A8246`) wires `Recibo` to the **Tarjeta** (`type='CA'`) account. `FinancialAccountSupport`: `METHOD_CHECK` → `METHOD_RECEIPT = "Recibo"`; `PAYMENT_METHODS_BY_TYPE` becomes `B: [Transferencia, Recibo, Tarjeta]` and `CA: [Tarjeta, Recibo]` (`Recibo` never first, so it never becomes an account's default); `createLink` now also copies `INUponClearingUse`/`OUTUponClearingUse` from the method template — previously omitted, so a runtime-created link silently diverged from its own method. Java tests updated for the new literals plus coverage for the two-method `CA` case and the clearing-use copy. |
| `schema_forge` (tooling/docs) | New corrective data-fix `cli/src/data-fixes/sql/20260821T120000Z__R24-payment-method-cheque-to-recibo.sql` (gap **G3**) + its static test `cli/test/data-fixes-r24-payment-method-cheque-to-recibo.test.js`; `cli/test/data-fixes-report-regression.test.js` updated (R24 is the second fix in the catalog with an `@report` section). `docs/etendo-ad/onboarding-and-datafixes-map.md`: new **G3** row in the per-gap two-front table, and the "dataset-only provisioning" note corrected — it claimed a dataset change never needs a corrective `.sql`, which holds for *adding* master data but not for *replacing* it, since the dataset cannot retract rows a tenant already has. `docs/etendo-ad/tenant-remediation-knowledge.md`: dated findings section. `PaymentForm.vitest.jsx` fixture renamed. This cross-domain plan file. |

No `contract.json` and no generated window code change: the `payment-method` window is out of scope
(`tools/app-shell/src/windows/registry.js`, ETP-4191) and the `paymentMethod` tab of
`financial-account` is excluded (`artifacts/financial-account/decisions.json`). No `make regen`.

## Scope calls

- **`ONBOARDING_PROVISIONED_THROUGH` is NOT bumped.** New tenants are born correct via the
  sampledata; the `.sql` only repairs legacy tenants. Same call as gaps G1 and G2.
- **No `EntityPersistenceEventObserver` on `FIN_FinancialAccount`** (explicitly confirmed with the
  product owner). The automatic linking fires only from the two Etendo GO paths —
  `FinancialAccountHandler#afterHandle` and
  `FinancialAccountBankConnectionHandler#handleCreateAndLink`. An account created straight from the
  Etendo Classic window gets no automatic link.
- **The data-fix is operator-run** (`make data-fixes`), not deploy-triggered. The ticket floated "a
  migration script that runs on deploy"; the only auto-running vehicle in this codebase is a
  `ModuleScript`, which was not chosen — the per-tenant data-fix framework is the established route
  for this exact table (R14, R15).
- **Tenant gate is `name='Transferencia bancaria'`, not `name='Cheque'`.** `F&B International
  Group` ships an unrelated Openbravo demo method literally named `Cheque`; gating on `Cheque`
  would have hit 36 tenants instead of the correct 35 and corrupted F&B. The gate is repeated on
  **every one of the 18 `@apply` statements**, not only on `@check`. The runner always evaluates
  `@check` first, so `@check` alone suffices in normal operation — but a hand-run of `@apply`
  (verified: replaying the pre-hardening version straight onto F&B deleted its `Cheque` method and
  its account link) or any future runner that skips `@check` would otherwise let Effects 2b/5/6/7
  loose on a demo client. Every statement that assigns *from* the Recibo scalar subquery also
  requires that row to exist, because a NULL subquery result would **blank** the column instead of
  repointing it.
- **Processed documents keep `Cheque`.** Only forward-looking configuration references
  (`c_bpartner`×2, `c_paymenttermline`, `c_project`, `c_projectproposal`, `fin_payment_proposal`)
  and *unprocessed* documents are repointed. Without the `c_bpartner` repoint, 34 business partners
  would have been left defaulting to an inactive method.

## Tests

- `schema_forge` Node: `cli/test/data-fixes-r24-payment-method-cheque-to-recibo.test.js` — static,
  DB-free, modelled on the R23 test: header metadata + timestamp newer than the previous catalog
  entry, tenant isolation (`:client_id` in every statement, `inlineParams` throws on
  `'1; DROP TABLE ad_client'`), the full 21-value target configuration on both inserts, two-layer
  idempotency, statement ordering inside `@apply`, `isdefault` never written in a `SET`, and a
  regression test pinning `IS NOT DISTINCT FROM` on the six nullable `*use` columns.
- `com.etendoerp.go` JUnit: `FinancialAccountSupportTest` updated to the `Recibo` literal, plus
  coverage that a `type='CA'` account now receives two links with `Tarjeta` as the default, and
  that `createLink` copies the clearing uses.
- **Live validation of the data-fix** against the local DB, all 44 tenants inside a single
  `BEGIN … ROLLBACK`: `@check` fired on the 35 GO tenants and returned 0 rows on the re-run for
  every one of them (provable convergence); 17 tenants had `Cheque` deleted outright, 18 had it
  deactivated with `@report` listing the surviving invoices/orders/payments; `F&B International
  Group` was left completely untouched; 0 Bank/Card accounts were left without a `Recibo` link;
  0 business partners were left pointing at an inactive method.
  This trial is what caught the three-valued-logic bug described in the knowledge base — the first
  version of the fix left the migrated Bank links without `CLE` while `@check` reported the tenant
  as already fixed.
- **Non-GO tenant containment**, verified the same way: running `@apply` *directly, skipping
  `@check`* against `F&B International Group` produces zero changes (methods, links, business-partner
  defaults and invoice references all identical). The same run against the pre-hardening SQL deleted
  its `Cheque` method and one account link — so the per-statement gate is a load-bearing guard, not
  decoration.

## Rollback

Revert the `feature/ETP-4893` commits in both repos. The sampledata rows only affect future
onboarding/imports, so reverting them stops seeding `Recibo` (and restores `Cheque`) for new
tenants without touching existing ones; dropping the `FinancialAccountSupport` change restores the
previous per-type method lists.

Tenants already swept by R24 need manual attention, because the fix is not symmetric:
`Recibo` rows and links would have to be deleted by `ad_client_id`, `Cheque` reactivated
(`isactive='Y'`) where it survived, and the repointed `c_bpartner` / `c_paymenttermline` /
`c_project` / `c_projectproposal` / `fin_payment_proposal` / unprocessed-document references sent
back to `Cheque`. Where `Cheque` was **deleted** (17 tenants on the authoring DB, i.e. tenants with
no history at all) it cannot be restored from the DB — those tenants would have to be re-seeded
from the dataset. Removing the `.sql` from the catalog does **not** undo an applied run; the
`ETGO_DATA_FIX_HISTORY` row would also need deleting for the fix to be re-attempted.
