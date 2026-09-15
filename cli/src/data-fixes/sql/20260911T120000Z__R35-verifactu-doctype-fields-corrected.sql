-- @id: R35-verifactu-doctype-fields-corrected
-- @gap: F1
-- @risk: low
-- @type: sql
-- @description: Supersede R23 with the correct rectificative invoice type (R4, not R1) and retroactively correct DocTypes R23 already mis-populated

-- ETP-5229: R23-verifactu-doctype-fields (20260813T120000Z) hardcoded the
-- rectificative sales invoice's em_etvfac_inv_type to 'R1'. That is wrong:
-- per the field's own AD_Ref_List, 'R1' means a specific rectification cause
-- ("Error fundado en derecho..."), while the value that means the generic
-- catch-all rectification reason ("Factura rectificativa: Resto.") is 'R4'.
-- SII already defaults rectificative sales invoices to R4-equivalent logic
-- and TicketBAI was fixed the same day (callout bug) to also write R4 — this
-- fix brings Verifactu's C_DocType seeding in line with both siblings.
--
-- R23 is NOT edited (immutable, may already be APPLIED against real tenants)
-- -- it is retired via ../retired.json and fully superseded by this fix, which
-- reproduces both of R23's branches (standard invoice -> F1 is untouched and
-- still correct) plus the corrected rectificative branch, AND retroactively
-- repairs any DocType R23 already stamped with the wrong 'R1'.
--
-- Discriminator (identical to R23; no hardcoded IDs):
--   Non-rectificative standard sales invoice:
--     docbasetype='ARI', issotrx='Y', isreversal='N', isreturn='N',
--     em_etsg_isrectificative='N'  ->  inv_type=F1, desc='Ventas'
--   Rectificative sales invoice:
--     docbasetype='ARI', issotrx='Y', isreversal='N', isreturn='N',
--     em_etsg_isrectificative='Y'  ->  inv_type=R4, desc='Rectificaciones de Ventas',
--                                      reverseinvtype='I' (unchanged, not flagged wrong)
-- isreturn='N' excludes "Reversed Sales Invoice" (system-generated reversal),
-- not a Verifactu-reportable invoice.
--
-- Idempotency: two-layer.
--   Branch 1 (standard) guards on em_etvfac_inv_type IS NULL, same as R23.
--   Branch 2 (rectificative) guards on (em_etvfac_inv_type IS NULL OR = 'R1')
--   so it both seeds untouched DocTypes correctly AND corrects rows R23 already
--   wrote. Once a row reads 'R4' neither guard matches it again.
--
-- Live-DB state (2026-09-11): local dev DB had 3 clients whose rectificative
-- DocType read 'R1' (corrected by hand ahead of this fix landing, then
-- verified idempotent via --dry-run against this file). Confirmed via query
-- that no other client/DocType combination in this environment currently
-- matches the discriminator with a wrong value.

-- @check
-- Returns rows when ANY matching DocType still needs seeding (IS NULL) or
-- still carries the old wrong rectificative value ('R1').
SELECT 1
FROM c_doctype d
WHERE d.ad_client_id = :client_id
  AND d.docbasetype = 'ARI'
  AND d.issotrx = 'Y'
  AND d.isreversal = 'N'
  AND d.isreturn = 'N'
  AND (
    d.em_etvfac_inv_type IS NULL
    OR (d.em_etsg_isrectificative = 'Y' AND d.em_etvfac_inv_type = 'R1')
  );

-- @apply

-- 1. Standard (non-rectificative) sales invoice -> F1 / Ventas. Same as R23.
UPDATE c_doctype
SET em_etvfac_inv_type     = 'F1',
    em_etvfac_verifac_desc = 'Ventas',
    updated                = now(),
    updatedby              = '0'
WHERE ad_client_id              = :client_id
  AND docbasetype               = 'ARI'
  AND issotrx                   = 'Y'
  AND isreversal                = 'N'
  AND isreturn                  = 'N'
  AND em_etsg_isrectificative   = 'N'
  AND em_etvfac_inv_type IS NULL;

-- 2. Rectificative sales invoice -> R4 / Rectificaciones de Ventas / I.
--    Seeds untouched DocTypes AND corrects any already wrongly seeded as R1.
UPDATE c_doctype
SET em_etvfac_inv_type       = 'R4',
    em_etvfac_verifac_desc   = 'Rectificaciones de Ventas',
    em_etvfac_reverseinvtype = 'I',
    updated                  = now(),
    updatedby                = '0'
WHERE ad_client_id              = :client_id
  AND docbasetype               = 'ARI'
  AND issotrx                   = 'Y'
  AND isreversal                = 'N'
  AND isreturn                  = 'N'
  AND em_etsg_isrectificative   = 'Y'
  AND (em_etvfac_inv_type IS NULL OR em_etvfac_inv_type = 'R1');
