-- @id: R53-tax-intracom-2pct-rate
-- @gap: U1
-- @risk: low
-- @type: sql
-- @description: Correct the rate of the SYSTEM tax "Adquisiciones intracomunitarias 2% (+2%)" (c_tax 79F1D421039644E1B0648B98C3349284) from 10 to 2 (ETP-5902)
--
-- Background
-- ----------
-- Module com.etendoerp.go.localization.es.data ships the compound tax "Adquisiciones
-- intracomunitarias 2%" (parent 8AFF22BBB68C46F7B48F82CC57A77295, rate 0) with two children:
-- (+2%) 79F1D421039644E1B0648B98C3349284 and (-2%) 7C717AF669E1440CB089B0692F59520C. The (+2%)
-- child was shipped with rate 10, so an intra-community purchase at 2 % self-assessed 10 % VAT
-- against a -2 % deduction. Only that child's rate changes; parent and (-2%) are correct.
--
-- Preventive twin: referencedata/standard/Spanish_Fiscal_Taxes_Go.xml now ships <rate>2</rate>
-- for this record. Reference data is imported once at module install and NOT re-applied to an
-- existing install by update.database, so environments that already have the module need this
-- fix (same pattern as R50-tax-category-old-iva-normal-deactivate).
--
-- System pseudo-tenant: the row is System-owned (ad_client_id = '0') and shared by every tenant,
-- so this fix never runs in the default per-tenant sweep. Run it by name:
--   node cli/src/data-fixes/run.js --fix R53-tax-intracom-2pct-rate --client 0
--
-- Safety: C_TAX_TRG does not block an UPDATE of rate. Production had 0 invoice lines and 0 order
-- lines on the 2 % family (checked 2026-10-26), so no draft document is re-priced. Posted
-- documents keep their stored tax amounts.
--
-- Idempotency: @check returns a row only while the rate is still 10; @apply is re-guarded by
-- rate = 10, so a second run is a no-op. A rate someone already changed to anything else is left
-- alone.

-- @check
SELECT 1
FROM c_tax t
WHERE t.c_tax_id = '79F1D421039644E1B0648B98C3349284'
  AND t.ad_client_id = :client_id
  AND t.rate = 10;

-- @apply
UPDATE c_tax
SET rate = 2,
    updated = now(),
    updatedby = '0'
WHERE c_tax_id = '79F1D421039644E1B0648B98C3349284'
  AND ad_client_id = :client_id
  AND rate = 10;
