-- @id: R34-invoice-price-variance-backfill
-- @gap: A8
-- @risk: low
-- @type: sql
-- @description: Backfill NULL P_InvoicePriceVariance_Acct at the schema-default, product-category
--   and product levels, copying each row's OWN P_Expense_Acct (ETP-5075).
--
-- Background
-- ----------
-- Discovered while investigating an ETP-5075 review comment: a `matched-purchase-invoices`
-- (M_MatchInv) record whose invoiced price differs from its receipt cost fails to post with
-- "Account could not be found." — misleadingly enriched, by our own DocumentPostingService, with
-- the transaction's Business Partner/BP Group (see `com.etendoerp.go`'s
-- DocumentPostingService#enrichWithFailingEntity), which reads as "the contact's accounts are
-- missing" even when they are correctly configured.
--
-- Root cause: `DocMatchInv.createFact` (`org.openbravo.erpCommon.ad_forms.DocMatchInv.java:411-434`)
-- requests `ProductInfo.ACCTTYPE_P_IPV` ("Invoice Price Variance") ONLY when the invoiced amount
-- differs from the receipt's costed amount (`bdDifference.signum() != 0`) — most matches never hit
-- this, which is why the gap went unnoticed. `ProductInfo.getAccount()`
-- (`ProductInfo.java:99-162`) resolves that account EXCLUSIVELY from `M_Product_Acct` for the
-- line's own product+schema (`ProductInfo_data.xsql`'s `selectProductAcct`, a plain `WHERE
-- M_Product_ID=? AND C_AcctSchema_ID=?`) — no fallback to product-category or schema defaults
-- whatsoever once a product has its own `M_Product_Acct` row (confirmed reading the SQL: no JOIN,
-- no COALESCE). `getAccountDefault()` (which DOES read `C_ACCTSCHEMA_DEFAULT`/category, via
-- `selectDefaultAcct`'s COALESCE chain) is reached ONLY when the transaction line carries no
-- product at all — never true for `DocMatchInv`.
--
-- Consequently:
--   - Fixing ONLY `C_ACCTSCHEMA_DEFAULT` (as ETP-4245/R11 did for 6 sibling columns) is NOT enough
--     for any tenant with pre-existing products — confirmed live: setting the schema-level field
--     in Classic's own "Defaults" tab UI did not unblock posting the failing GOClient record, since
--     its product (`M_Product_Acct`) row already existed with this column NULL.
--   - This is a THREE-level gap, not a schema-only one like R11's siblings. All three levels are
--     backfilled here, each from its OWN `P_Expense_Acct` (not a single hardcoded value) — the
--     natural "same place the difference lands" choice for a chart family (Spanish PGC/GOClient's
--     "Árbol de cuentas GO") that has no dedicated price-variance account at all: verified live via
--     the "Pérdidas y Ganancias" (P&L) report for Esquema GO — the whole "Aprovisionamientos"
--     group only ever shows `600 - Compras de mercaderías` / `610 - Variación de existencias`, no
--     variance-style breakdown (contrast the F&B International Group US Dollar demo chart, an
--     Anglo-Saxon-style chart whose P&L shows a full COGS breakdown including a dedicated `5610 -
--     Invoice price variance` sibling of `5360 - Product Expense`; that account's schema had
--     `P_InvoicePriceVariance_Acct` genuinely configured — the only accounting schema, out of 205
--     in this fleet, that did). Live-verified: setting GOClient's `M_Product_Acct.
--     P_InvoicePriceVariance_Acct` to the SAME account as `P_Expense_Acct` (`60000000 - Compras de
--     mercaderías`) let the previously-failing record post, producing a balanced 3-line entry — the
--     usual 2 lines plus the variance amount landing in the very same `60000000` account as a third
--     credit line (verified live: `40090000` debit 35.86 = `60000000` credit 33.00 (existing
--     Product Expense line) + `60000000` credit 2.86 (the new variance line), same account, two
--     lines).
--   - `P_PurchasePriceVariance_Acct` (the sibling column for `ProductInfo.ACCTTYPE_P_PPV`, purchase
--     price variance) is deliberately left OUT of scope here: confirmed via `AD_Field` that its
--     Classic UI field on this same tab is `isactive='N'` (Etendo turned it off), and confirmed via
--     `grep ACCTTYPE_P_PPV` across `org.openbravo.erpCommon.ad_forms` that no purchasing document
--     class ever requests it — populating a column nothing reads and the UI does not even expose
--     would be unexplained noise for whoever reads this schema's config later.
--
-- Fleet-wide measurement (this environment, 2026-09-07): 202 of 205 `C_ACCTSCHEMA_DEFAULT` rows
-- have `P_InvoicePriceVariance_Acct` NULL (the sole exception being the F&B International Group US
-- Dollar schema noted above); 0 of 205 have `P_Expense_Acct` NULL (the column this fix copies from
-- is safe fleet-wide). Every `M_Product_Acct`/`M_Product_Category_Acct` row fleet-wide likewise has
-- `P_Expense_Acct` populated and 0 rows with `P_Expense_Acct` NULL, confirmed live.
--
-- Idempotency
-- -----------
-- Three independent UPDATEs, one per table/level. Each is guarded in both `@check` (fires when at
-- least one of the three is still open) and its own `@apply` `WHERE` clause (`IS NULL`), so a
-- partial or concurrent apply is safe to re-run — a level already backfilled is never touched
-- again, and a tenant whose chart genuinely has no `P_Expense_Acct` on some row (should not happen,
-- see the fleet-wide count above, but defensively guarded regardless) simply skips that row rather
-- than writing NULL into NULL.
--
-- Preventive twin
-- ----------------
-- `com.etendoerp.go`'s `OnboardingAccountingWiringService#provisionEntityPostingAccounts` — a new
-- step backfills `C_AcctSchema_Default.P_InvoicePriceVariance_Acct` from that same row's
-- `P_Expense_Acct` BEFORE the existing `PRODUCT_CATEGORY_ACCT_SQL`/`PRODUCT_ACCT_SQL` inserts run;
-- those two already copy `d.p_invoicepricevariance_acct` from `C_AcctSchema_Default` into every
-- new product/category at creation time (see their SQL text a few lines above in that file), so
-- fixing the schema-level source first is sufficient to cover all three levels for a BRAND NEW
-- tenant — the corrective UPDATEs on `M_Product_Acct`/`M_Product_Category_Acct` below exist only
-- because those two tables' rows, for an EXISTING tenant, were already created (with this column
-- NULL) before this fix shipped, and the onboarding INSERTs are `NOT EXISTS`-guarded so they never
-- re-run for a product/category that already has a row.

-- @check
-- Fires when at least one of the three levels still needs its own P_Expense_Acct copied in.
SELECT 1
FROM c_acctschema_default d
WHERE d.ad_client_id = :client_id
  AND d.p_invoicepricevariance_acct IS NULL
  AND d.p_expense_acct IS NOT NULL
UNION ALL
SELECT 1
FROM m_product_category_acct pca
WHERE pca.ad_client_id = :client_id
  AND pca.p_invoicepricevariance_acct IS NULL
  AND pca.p_expense_acct IS NOT NULL
UNION ALL
SELECT 1
FROM m_product_acct pa
WHERE pa.ad_client_id = :client_id
  AND pa.p_invoicepricevariance_acct IS NULL
  AND pa.p_expense_acct IS NOT NULL
LIMIT 1;

-- @apply
-- Level 1 — accounting schema default. Seeds every product/category created from now on (see
-- preventive twin note above); does not, by itself, repair any pre-existing product/category row.
UPDATE c_acctschema_default d
SET p_invoicepricevariance_acct = d.p_expense_acct,
    updated = now(), updatedby = '0'
WHERE d.ad_client_id = :client_id
  AND d.p_invoicepricevariance_acct IS NULL
  AND d.p_expense_acct IS NOT NULL;

-- Level 2 — product category. Reached only when a transaction line carries no specific product
-- (never true for DocMatchInv, but a real fallback path for other document types via
-- ProductInfo#getAccountDefault's COALESCE chain).
UPDATE m_product_category_acct pca
SET p_invoicepricevariance_acct = pca.p_expense_acct,
    updated = now(), updatedby = '0'
WHERE pca.ad_client_id = :client_id
  AND pca.p_invoicepricevariance_acct IS NULL
  AND pca.p_expense_acct IS NOT NULL;

-- Level 3 — product. THIS is the level `DocMatchInv`/`ProductInfo#getAccount` actually reads for
-- any line that carries a product (i.e. every real purchase-invoice-match line) — the one that
-- unblocks posting for an existing tenant's existing products.
UPDATE m_product_acct pa
SET p_invoicepricevariance_acct = pa.p_expense_acct,
    updated = now(), updatedby = '0'
WHERE pa.ad_client_id = :client_id
  AND pa.p_invoicepricevariance_acct IS NULL
  AND pa.p_expense_acct IS NOT NULL;
