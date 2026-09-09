-- @id: R35-invoice-price-variance-99904000-correction
-- @gap: A8b
-- @risk: low
-- @type: sql
-- @description: Correct P_InvoicePriceVariance_Acct (schema-default, product-category, product) to GL account 99904000's own NATURAL combination wherever it is currently NULL or still holds R34's old P_Expense_Acct-derived value — supersedes R34's value choice without editing R34 itself

-- Background
-- ----------
-- R34 (`20260907T180000Z__R34-invoice-price-variance-backfill.sql`, ETP-5075) backfilled
-- `P_InvoicePriceVariance_Acct` at all three levels — schema default, product-category, product —
-- by copying each row's OWN `P_Expense_Acct` when the column was NULL. That closed the immediate
-- "Account could not be found" posting failure (`DocMatchInv`/`ProductInfo#getAccount`, see R34's
-- own root-cause section for the full trace), but picked a per-schema, ad-hoc source value.
--
-- ETP-5222 supersedes that value choice (does NOT edit R34 itself — see "Why a new file, not an
-- edit to R34" below): product confirmed a STANDARD Invoice Price Variance account for ALL clients,
-- not a per-schema "whatever P_Expense_Acct happens to be" choice. The account was corrected
-- mid-ticket, within this same ETP-5222 session: initially `99905000` ("Diferencia entre el precio
-- de compra y el coste estándar"), then corrected to **`99904000`** ("Diferencias entre el coste
-- del producto y el precio de la fra[ctura]" — the `C_ElementValue.name` column is genuinely
-- truncated at 61 chars in the bundled data itself, confirmed via `length(name)`, not a display
-- artifact). Both are sibling accounts one code apart in GOClient's chart.
--
-- Real production evidence exists for `99905000` specifically: matched-purchase-invoice record
-- `920B74ACD78A4F358392E91FF1B2503B` (product "Fernet") already posted successfully against it,
-- proving `DocMatchInv`/`AcctServer` accept a Memo-type account (`AccountType = 'M'`, not `'E'`
-- Expense/Gasto like `P_Expense_Acct`) on a normal posting line in practice. That evidence does
-- NOT directly cover `99904000` — verified separately (`ad_ref_list`, reference 117) that
-- `99904000` is ALSO Memo-type. Product's call (ETP-5222): GOClient's entire `999*` branch
-- (`99900000`/`99902000`/`99904000`/`99905000`/`99907000`/`99908000`/`99909000` — Etendo's own
-- generic default/suspense-account family) is uniformly Memo-type by design, and that pattern
-- alone is accepted as sufficient without a dedicated live `DocMatchInv` posting test for
-- `99904000` itself. (Investigated directly, ETP-5222: the "Fernet" row is itself a targeted
-- MANUAL set on that one product's `M_Product_Acct` row — pointed at `99905000`, not `99904000` —
-- not a prior run of this fix or of R34 with either value; it is the only `M_Product_Acct` row on
-- the environment where this was found with `P_InvoicePriceVariance_Acct` non-null, while the SAME
-- client's `C_AcctSchema_Default`/`M_Product_Category_Acct` were still NULL, which R34 would also
-- have touched if it had actually run there.)
--
-- `99904000` ships in the bundled GOClient chart (present since `feature/ETP-4247`, well before
-- R34's original authoring) and resolves to a real leaf/subaccount (`elementlevel = 'S'`) on
-- effectively every tenant's own copy of that chart — live-verified on this environment's GOClient
-- and SantoEmpresa clients; R34's own live P&L check apparently missed this whole `999*` family.
-- This fix resolves `99904000`'s OWN NATURAL `C_ValidCombination` for each row's own
-- `(ad_client_id, c_acctschema_id)` — scoped through `C_AcctSchema_Element`
-- (`elementtype = 'AC'`) so an unwired "orphan" element sharing the same account code is never
-- picked (confirmed live: GOClient itself carries a SECOND, unrelated `c_elementvalue` row for
-- `99904000` under an unwired "GOOrg Account Tree" element, distinct from the wired "Arbol de
-- cuentas GO" element — joining through `C_AcctSchema_Element` is what keeps this deterministic).
-- A tenant whose chart genuinely lacks `99904000` is simply not matched by this fix (see
-- idempotency below) — R34 itself, unedited, remains that tenant's only source (its
-- `P_Expense_Acct` fallback), which this fix deliberately leaves alone.
--
-- Natural-combination filter (ETP-5222 review fix, Alex/W1)
-- ------------------------------------------------------------
-- `C_ValidCombination` can hold non-natural, dimension-specific rows for the same
-- `(account, schema)` pair (e.g. a product- or business-partner-specific combination). The
-- account/schema join alone can therefore match more than one row, and Postgres picks one
-- ARBITRARILY on a plain join — silent nondeterminism, not an error. Every resolution below (both
-- `@check` and each `@apply` level) requires every OTHER `C_ValidCombination` dimension column
-- NULL — `m_product_id`, `c_bpartner_id`, `ad_orgtrx_id`, `c_locfrom_id`, `c_locto_id`,
-- `c_salesregion_id`, `c_project_id`, `c_campaign_id`, `c_activity_id`, `user1_id`, `user2_id` —
-- plus a defensive `ORDER BY vc.c_validcombination_id LIMIT 1`, mirroring
-- `GlItemProvisioningSupport#resolveNaturalCombination` (`modules/com.etendoerp.go/src/com/
-- etendoerp/go/schemaforge/handlers/GlItemProvisioningSupport.java:258-279`) — the DAL/Criteria
-- precedent for this exact operation elsewhere in this codebase, translated from its
-- `Restrictions.isNull(...)` list into plain `AND vc.<col> IS NULL` predicates since this is native
-- SQL, not HQL/Criteria. Live-reverified after adding this filter: the resolved combination id for
-- GOClient/SantoEmpresa is UNCHANGED (no non-natural row for 99904000 exists on this environment
-- today) — this is a forward-looking correctness fix, not a bugfix for current data.
--
-- Why a new file, not an edit to R34
-- -----------------------------------
-- R34 is a historical migration record. Editing it in place is risky for any environment whose data-
-- fix runner already applied it and tracks completion by filename/fix id
-- (`etgo_data_fix_history.fix_id = 'R34-invoice-price-variance-backfill'`) — an edited file would not
-- re-run there, silently leaving the old `P_Expense_Acct`-derived value baked in with no fix ever
-- flagged as pending for that tenant again. This matches the project's own established convention:
-- the R17 → R21 precedent superseded R17's narrower fix with a NEW file (R21), it did not edit R17
-- in place. R34 therefore stays byte-identical to how ETP-5075 shipped it; this file supersedes its
-- EFFECT (the value written), scoped by its own `@check`, chained strictly after it by timestamp.
--
-- Applied-anywhere check (ETP-5222, informs urgency, not correctness — this fix is safe either way):
-- `etgo_data_fix_history` on the only DB this session had credentials for (local dev,
-- `etendogoclean`) has ZERO rows for `R34-invoice-price-variance-backfill` — not applied there.
-- This session had no credentials for the experimental/production server and did not attempt to
-- guess or fabricate access; the "Fernet" evidence above traces to a manual single-product fix, not
-- a catalog-fix run, which is consistent with R34 not having run broadly anywhere yet. Flagged for
-- the coordinator/QA to confirm directly on the experimental server. Either way this fix behaves
-- correctly: if R34 never ran anywhere, this fix becomes the one that actually fills the column
-- (its own `IS NULL` branch); if R34 already ran somewhere, this fix corrects the `P_Expense_Acct`-
-- derived value it left behind.
--
-- `P_PurchasePriceVariance_Acct` remains out of scope, same reasoning as R34: its Classic UI field
-- is `isactive='N'` and no purchasing document class in core ever requests
-- `ProductInfo.ACCTTYPE_P_PPV`.
--
-- Idempotency
-- -----------
-- Three independent UPDATEs, one per table/level, each resolving 99904000's NATURAL combination
-- (see filter above) for the row's OWN `(ad_client_id, c_acctschema_id)` via a correlated scalar
-- subquery — a tenant whose chart lacks 99904000 entirely simply resolves to NULL, so the whole
-- statement is a no-op for that tenant (correctly leaves R34's `P_Expense_Acct` fallback, or a
-- still-NULL column, untouched). Where 99904000 DOES resolve, the row-level guard is
-- `(P_InvoicePriceVariance_Acct IS NULL OR P_InvoicePriceVariance_Acct = <own row's> P_Expense_Acct)
-- AND <resolved 99904000 combination> IS DISTINCT FROM P_InvoicePriceVariance_Acct` — matches a
-- fresh NULL (R34 never ran / found no `P_Expense_Acct` either), matches R34's
-- `P_Expense_Acct`-derived value (correction case), and explicitly SKIPS any row that already holds
-- something else — including the 99904000 combination itself (this fix's own prior run, idempotent
-- re-run) AND a genuine manual override an operator set to a different account on purpose (e.g. the
-- "Fernet" row above, which points at 99905000, not 99904000: neither NULL nor equal to its own
-- `P_Expense_Acct`, so the `IS NULL OR = P_Expense_Acct` guard already excludes it — this fix
-- deliberately does NOT reconcile 99905000-pointing rows to 99904000; that is a separate, not-yet-
-- requested cleanup). Both `@check` and each `@apply` `WHERE` carry the identical guard, so a
-- partial or concurrent apply, or a straight re-run after a first successful apply, is safe and
-- touches zero rows the second time.
--
-- Chaining with R34
-- -----------------
-- This file's timestamp (`20260909T150000Z`) is strictly after R34's (`20260907T180000Z`), so the
-- data-fix runner always applies R34 first for any tenant that has neither run yet (R34's own
-- `P_Expense_Acct`-fallback fires first if 99904000 isn't yet resolvable at that moment for some
-- transient reason, then this fix immediately corrects it on the very next fix in the chain) or runs
-- them back-to-back for a brand-new tenant. No ordering dependency beyond the filename timestamp the
-- runner already enforces for every fix in the catalog.

-- @check
-- Fires when at least one of the three levels still needs correcting to 99904000 — i.e. 99904000's
-- NATURAL combination (see filter above) resolves for this row's own schema AND the current value
-- is either NULL or R34's old P_Expense_Acct-derived value (never a genuine manual override on some
-- other account).
SELECT 1
FROM c_acctschema_default d
JOIN c_acctschema_element ae
  ON ae.c_acctschema_id = d.c_acctschema_id AND ae.ad_client_id = d.ad_client_id AND ae.elementtype = 'AC'
JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id AND ev.value = '99904000'
WHERE d.ad_client_id = :client_id
  AND (d.p_invoicepricevariance_acct IS NULL OR d.p_invoicepricevariance_acct = d.p_expense_acct)
  AND (SELECT vc.c_validcombination_id FROM c_validcombination vc
       WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = ae.c_acctschema_id
         AND vc.ad_client_id = ae.ad_client_id
         AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.ad_orgtrx_id IS NULL
         AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
         AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
         AND vc.user1_id IS NULL AND vc.user2_id IS NULL
       ORDER BY vc.c_validcombination_id LIMIT 1) IS DISTINCT FROM d.p_invoicepricevariance_acct
UNION ALL
SELECT 1
FROM m_product_category_acct pca
JOIN c_acctschema_element ae
  ON ae.c_acctschema_id = pca.c_acctschema_id AND ae.ad_client_id = pca.ad_client_id AND ae.elementtype = 'AC'
JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id AND ev.value = '99904000'
WHERE pca.ad_client_id = :client_id
  AND (pca.p_invoicepricevariance_acct IS NULL OR pca.p_invoicepricevariance_acct = pca.p_expense_acct)
  AND (SELECT vc.c_validcombination_id FROM c_validcombination vc
       WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = ae.c_acctschema_id
         AND vc.ad_client_id = ae.ad_client_id
         AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.ad_orgtrx_id IS NULL
         AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
         AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
         AND vc.user1_id IS NULL AND vc.user2_id IS NULL
       ORDER BY vc.c_validcombination_id LIMIT 1) IS DISTINCT FROM pca.p_invoicepricevariance_acct
UNION ALL
SELECT 1
FROM m_product_acct pa
JOIN c_acctschema_element ae
  ON ae.c_acctschema_id = pa.c_acctschema_id AND ae.ad_client_id = pa.ad_client_id AND ae.elementtype = 'AC'
JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id AND ev.value = '99904000'
WHERE pa.ad_client_id = :client_id
  AND (pa.p_invoicepricevariance_acct IS NULL OR pa.p_invoicepricevariance_acct = pa.p_expense_acct)
  AND (SELECT vc.c_validcombination_id FROM c_validcombination vc
       WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = ae.c_acctschema_id
         AND vc.ad_client_id = ae.ad_client_id
         AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.ad_orgtrx_id IS NULL
         AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
         AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
         AND vc.user1_id IS NULL AND vc.user2_id IS NULL
       ORDER BY vc.c_validcombination_id LIMIT 1) IS DISTINCT FROM pa.p_invoicepricevariance_acct
LIMIT 1;

-- @apply
-- Level 1 — accounting schema default. Corrects/fills the source every future onboarding read
-- copies from (see R34's own "preventive twin" note — the Java-side
-- OnboardingAccountingWiringService#backfillInvoicePriceVarianceDefault already applies this same
-- 99904000-first priority for BRAND NEW clients going forward; this fix is the existing-tenant twin).
UPDATE c_acctschema_default d
SET p_invoicepricevariance_acct = resolved.ipv_99904000_id,
    updated = now(), updatedby = '0'
FROM (
  SELECT d2.c_acctschema_default_id,
    (SELECT vc.c_validcombination_id FROM c_validcombination vc
     WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = ae.c_acctschema_id
       AND vc.ad_client_id = ae.ad_client_id
       AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.ad_orgtrx_id IS NULL
       AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
       AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
       AND vc.user1_id IS NULL AND vc.user2_id IS NULL
     ORDER BY vc.c_validcombination_id LIMIT 1) AS ipv_99904000_id
  FROM c_acctschema_default d2
  JOIN c_acctschema_element ae
    ON ae.c_acctschema_id = d2.c_acctschema_id AND ae.ad_client_id = d2.ad_client_id
       AND ae.elementtype = 'AC'
  JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id AND ev.value = '99904000'
  WHERE d2.ad_client_id = :client_id
) resolved
WHERE d.c_acctschema_default_id = resolved.c_acctschema_default_id
  AND d.ad_client_id = :client_id
  AND (d.p_invoicepricevariance_acct IS NULL OR d.p_invoicepricevariance_acct = d.p_expense_acct)
  AND resolved.ipv_99904000_id IS DISTINCT FROM d.p_invoicepricevariance_acct;

-- Level 2 — product category. Reached only when a transaction line carries no specific product
-- (never true for DocMatchInv, but a real fallback path for other document types via
-- ProductInfo#getAccountDefault's COALESCE chain).
UPDATE m_product_category_acct pca
SET p_invoicepricevariance_acct = resolved.ipv_99904000_id,
    updated = now(), updatedby = '0'
FROM (
  SELECT p2.m_product_category_acct_id,
    (SELECT vc.c_validcombination_id FROM c_validcombination vc
     WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = ae.c_acctschema_id
       AND vc.ad_client_id = ae.ad_client_id
       AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.ad_orgtrx_id IS NULL
       AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
       AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
       AND vc.user1_id IS NULL AND vc.user2_id IS NULL
     ORDER BY vc.c_validcombination_id LIMIT 1) AS ipv_99904000_id
  FROM m_product_category_acct p2
  JOIN c_acctschema_element ae
    ON ae.c_acctschema_id = p2.c_acctschema_id AND ae.ad_client_id = p2.ad_client_id
       AND ae.elementtype = 'AC'
  JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id AND ev.value = '99904000'
  WHERE p2.ad_client_id = :client_id
) resolved
WHERE pca.m_product_category_acct_id = resolved.m_product_category_acct_id
  AND pca.ad_client_id = :client_id
  AND (pca.p_invoicepricevariance_acct IS NULL OR pca.p_invoicepricevariance_acct = pca.p_expense_acct)
  AND resolved.ipv_99904000_id IS DISTINCT FROM pca.p_invoicepricevariance_acct;

-- Level 3 — product. THIS is the level `DocMatchInv`/`ProductInfo#getAccount` actually reads for any
-- line that carries a product (i.e. every real purchase-invoice-match line) — the one that matters
-- for posting. Idempotent even against a row already set to a different account by other means (see
-- the "Fernet" example in the header comment above): its P_InvoicePriceVariance_Acct is neither NULL
-- nor equal to its own P_Expense_Acct, so the guard skips it untouched.
UPDATE m_product_acct pa
SET p_invoicepricevariance_acct = resolved.ipv_99904000_id,
    updated = now(), updatedby = '0'
FROM (
  SELECT p2.m_product_acct_id,
    (SELECT vc.c_validcombination_id FROM c_validcombination vc
     WHERE vc.account_id = ev.c_elementvalue_id AND vc.c_acctschema_id = ae.c_acctschema_id
       AND vc.ad_client_id = ae.ad_client_id
       AND vc.m_product_id IS NULL AND vc.c_bpartner_id IS NULL AND vc.ad_orgtrx_id IS NULL
       AND vc.c_locfrom_id IS NULL AND vc.c_locto_id IS NULL AND vc.c_salesregion_id IS NULL
       AND vc.c_project_id IS NULL AND vc.c_campaign_id IS NULL AND vc.c_activity_id IS NULL
       AND vc.user1_id IS NULL AND vc.user2_id IS NULL
     ORDER BY vc.c_validcombination_id LIMIT 1) AS ipv_99904000_id
  FROM m_product_acct p2
  JOIN c_acctschema_element ae
    ON ae.c_acctschema_id = p2.c_acctschema_id AND ae.ad_client_id = p2.ad_client_id
       AND ae.elementtype = 'AC'
  JOIN c_elementvalue ev ON ev.c_element_id = ae.c_element_id AND ev.value = '99904000'
  WHERE p2.ad_client_id = :client_id
) resolved
WHERE pa.m_product_acct_id = resolved.m_product_acct_id
  AND pa.ad_client_id = :client_id
  AND (pa.p_invoicepricevariance_acct IS NULL OR pa.p_invoicepricevariance_acct = pa.p_expense_acct)
  AND resolved.ipv_99904000_id IS DISTINCT FROM pa.p_invoicepricevariance_acct;
