-- @id: R34-tax-sif-config-clear-system
-- @gap: ETP-5122
-- @risk: high
-- @type: sql
-- @description: Clear the 8 Verifactu/TicketBAI SIF fields on SYSTEM-scoped C_Tax rows once every active-config legal-entity org already has its own ETSG_Tax_SIF_Config override, so the per-org override actually takes effect instead of being permanently shadowed by the shared System value

-- Background
-- ----------
-- Sibling fix to R33 (read that file first). R33 backfills ETSG_Tax_SIF_Config
-- overrides from the shared System C_Tax row. But the read-side precedence is
-- "System field wins if non-empty, else fall back to the override" -- so the
-- override can NEVER be used while the System field it was copied from is still
-- populated. This fix performs the actual cutover: it nulls a System C_Tax SIF
-- field ONLY once every active-config legal-entity org that would need it (across
-- ALL clients/tenants, not just one) already has its own override row for that
-- exact (tax, org) pair. That "already migrated everywhere" check is what makes
-- clearing safe.
--
-- WHY THIS FIX DOES NOT FOLLOW THE NORMAL PER-:client_id PATTERN
-- ----------------------------------------------------------------
-- Every other fix in this catalog is scoped to one tenant and is safe to run for
-- tenant A independently of tenant B (see tenant-fixer.md: "tenants are
-- independent"). This fix breaks that assumption: C_Tax rows with ad_client_id='0'
-- are the SYSTEM/shared rates, used by EVERY tenant, not owned by any one tenant.
-- Nulling a field on one of those rows is a GLOBAL action -- it must not happen
-- until R33 has completed for every tenant that has an active-config org referencing
-- that tax, regardless of which tenant "runs" this fix.
--
-- Resolution: the anchor table for both @check and @apply IS `c_tax` filtered by
-- `ad_client_id = :client_id`, satisfying the framework's mandatory scope rule
-- literally -- because the row this fix's :client_id must equal is the LITERAL
-- SYSTEM ID '0' (where C_Tax's shared rows actually live). This fix is therefore
-- run explicitly and only once, targeted at the System pseudo-tenant:
--
--   node cli/src/data-fixes/run.js --fix R34-tax-sif-config-clear-system --client 0
--
-- It will NEVER be picked up by the default per-tenant sweep: the runner's default
-- tenant universe query is `... WHERE ad_client_id <> '0'` (see run.js), so client
-- '0' is only ever touched when named explicitly with --client. This is
-- intentional -- it is the deliberate gate that stops the destructive clear from
-- running before every tenant's R33 has had a chance to complete. The safety is
-- not just procedural, though: @check independently re-verifies, for the ACTUAL
-- current DB state across every client, that no active-config org is still missing
-- its override before it will report anything to clear -- so even a premature
-- --client 0 run before every tenant's R33 finished is a safe no-op, not a
-- data-loss risk.
--
-- Verifactu fields (em_etvfac_vat_regime, em_etvfac_igic_regime, em_etvfac_ipsi_regime,
-- em_etvfac_exemption_cause, em_etvfac_cause_not_taxable) and TicketBAI fields
-- (em_tbai_claveregimeniva, em_tbai_nonsubjectcause, em_tbai_exemptioncause) are
-- cleared INDEPENDENTLY per group -- a tax row can have its Verifactu fields
-- cleared while its TBAI fields stay populated (or vice-versa) if only one group's
-- migration is complete. A tax row with zero active-config orgs referencing a given
-- group is vacuously "fully migrated" for that group (there is nobody left who
-- needs the value), so its field(s) are cleared too -- that's the legacy-pollution
-- case R33/R34 exist to clean up.
--
-- Revert
-- ------
-- Two independent trails are kept:
--   1. Primary: any ETSG_Tax_SIF_Config row for the cleared (c_tax_id, *) still
--      holds the exact value that used to be in the System field (R33 copied it
--      verbatim) -- `UPDATE c_tax SET <field> = (SELECT <field> FROM
--      etsg_tax_sif_config WHERE c_tax_id = :tax AND <field> IS NOT NULL LIMIT 1)
--      WHERE c_tax_id = :tax`.
--   2. Secondary/audit: the @report section below returns every (tax, old value)
--      pair this run cleared; the runner stores it verbatim in the ledger's
--      `detail` column on the APPLIED row (ETGO_DATA_FIX_HISTORY, remediated_client_id
--      = '0' for this fix), so `SELECT detail FROM etgo_data_fix_history WHERE
--      fix_id = 'R34-tax-sif-config-clear-system'` is a full audit trail even for a
--      tax row that (legacy-pollution case) has no surviving override anywhere.
--
-- Idempotency
-- -----------
-- @check fires only when >=1 System tax row has >=1 group ready to clear. @apply's
-- UPDATE is driven by the SAME "is this group ready" computation, done in a temp
-- table populated once per run (`etsg_sif_clear_flags_tmp`) so a re-run after
-- everything is already cleared finds nothing left to update (0 rows => the next
-- run's @check returns 0 rows => SKIPPED_NOT_NEEDED).

-- @check
WITH targets AS (
  SELECT ad_get_org_le_bu(oi.ad_org_id, 'LE') AS le_org_id,
         bool_or(oi.em_etsg_has_vfactu_config = 'Y') AS has_vfactu,
         bool_or(oi.em_etsg_has_tbai_config = 'Y') AS has_tbai
  FROM ad_orginfo oi
  JOIN ad_org o ON o.ad_org_id = oi.ad_org_id AND o.isactive = 'Y'
  WHERE oi.em_etsg_has_vfactu_config = 'Y' OR oi.em_etsg_has_tbai_config = 'Y'
  GROUP BY 1
)
SELECT 1
FROM c_tax t
WHERE t.ad_client_id = :client_id
  AND (
    (
      (COALESCE(t.em_etvfac_vat_regime, '') <> '' OR COALESCE(t.em_etvfac_igic_regime, '') <> ''
       OR COALESCE(t.em_etvfac_ipsi_regime, '') <> '' OR COALESCE(t.em_etvfac_exemption_cause, '') <> ''
       OR COALESCE(t.em_etvfac_cause_not_taxable, '') <> '')
      AND NOT EXISTS (
        SELECT 1 FROM targets tg WHERE tg.has_vfactu
          AND NOT EXISTS (SELECT 1 FROM etsg_tax_sif_config cfg WHERE cfg.c_tax_id = t.c_tax_id AND cfg.ad_org_id = tg.le_org_id)
      )
    )
    OR
    (
      (COALESCE(t.em_tbai_claveregimeniva, '') <> '' OR COALESCE(t.em_tbai_nonsubjectcause, '') <> ''
       OR COALESCE(t.em_tbai_exemptioncause, '') <> '')
      AND NOT EXISTS (
        SELECT 1 FROM targets tg WHERE tg.has_tbai
          AND NOT EXISTS (SELECT 1 FROM etsg_tax_sif_config cfg WHERE cfg.c_tax_id = t.c_tax_id AND cfg.ad_org_id = tg.le_org_id)
      )
    )
  )
LIMIT 1;

-- @apply
CREATE TEMP TABLE IF NOT EXISTS etsg_sif_clear_flags_tmp (
  c_tax_id VARCHAR PRIMARY KEY, clear_vfactu BOOLEAN, clear_tbai BOOLEAN
) ON COMMIT DROP;

CREATE TEMP TABLE IF NOT EXISTS etsg_sif_clear_audit_tmp (
  c_tax_id VARCHAR, tax_name VARCHAR,
  old_em_etvfac_vat_regime VARCHAR, old_em_etvfac_igic_regime VARCHAR, old_em_etvfac_ipsi_regime VARCHAR,
  old_em_etvfac_exemption_cause VARCHAR, old_em_etvfac_cause_not_taxable VARCHAR,
  old_em_tbai_claveregimeniva VARCHAR, old_em_tbai_nonsubjectcause VARCHAR, old_em_tbai_exemptioncause VARCHAR,
  cleared_vfactu BOOLEAN, cleared_tbai BOOLEAN
) ON COMMIT DROP;

WITH targets AS (
  SELECT ad_get_org_le_bu(oi.ad_org_id, 'LE') AS le_org_id,
         bool_or(oi.em_etsg_has_vfactu_config = 'Y') AS has_vfactu,
         bool_or(oi.em_etsg_has_tbai_config = 'Y') AS has_tbai
  FROM ad_orginfo oi
  JOIN ad_org o ON o.ad_org_id = oi.ad_org_id AND o.isactive = 'Y'
  WHERE oi.em_etsg_has_vfactu_config = 'Y' OR oi.em_etsg_has_tbai_config = 'Y'
  GROUP BY 1
)
INSERT INTO etsg_sif_clear_flags_tmp (c_tax_id, clear_vfactu, clear_tbai)
SELECT
  t.c_tax_id,
  (
    (COALESCE(t.em_etvfac_vat_regime, '') <> '' OR COALESCE(t.em_etvfac_igic_regime, '') <> ''
     OR COALESCE(t.em_etvfac_ipsi_regime, '') <> '' OR COALESCE(t.em_etvfac_exemption_cause, '') <> ''
     OR COALESCE(t.em_etvfac_cause_not_taxable, '') <> '')
    AND NOT EXISTS (
      SELECT 1 FROM targets tg WHERE tg.has_vfactu
        AND NOT EXISTS (SELECT 1 FROM etsg_tax_sif_config cfg WHERE cfg.c_tax_id = t.c_tax_id AND cfg.ad_org_id = tg.le_org_id)
    )
  ) AS clear_vfactu,
  (
    (COALESCE(t.em_tbai_claveregimeniva, '') <> '' OR COALESCE(t.em_tbai_nonsubjectcause, '') <> ''
     OR COALESCE(t.em_tbai_exemptioncause, '') <> '')
    AND NOT EXISTS (
      SELECT 1 FROM targets tg WHERE tg.has_tbai
        AND NOT EXISTS (SELECT 1 FROM etsg_tax_sif_config cfg WHERE cfg.c_tax_id = t.c_tax_id AND cfg.ad_org_id = tg.le_org_id)
    )
  ) AS clear_tbai
FROM c_tax t
WHERE t.ad_client_id = :client_id;

INSERT INTO etsg_sif_clear_audit_tmp
SELECT t.c_tax_id, t.name,
  t.em_etvfac_vat_regime, t.em_etvfac_igic_regime, t.em_etvfac_ipsi_regime,
  t.em_etvfac_exemption_cause, t.em_etvfac_cause_not_taxable,
  t.em_tbai_claveregimeniva, t.em_tbai_nonsubjectcause, t.em_tbai_exemptioncause,
  f.clear_vfactu, f.clear_tbai
FROM c_tax t
JOIN etsg_sif_clear_flags_tmp f ON f.c_tax_id = t.c_tax_id
WHERE t.ad_client_id = :client_id
  AND (f.clear_vfactu OR f.clear_tbai);

UPDATE c_tax t
SET
  em_etvfac_vat_regime = CASE WHEN f.clear_vfactu THEN NULL ELSE t.em_etvfac_vat_regime END,
  em_etvfac_igic_regime = CASE WHEN f.clear_vfactu THEN NULL ELSE t.em_etvfac_igic_regime END,
  em_etvfac_ipsi_regime = CASE WHEN f.clear_vfactu THEN NULL ELSE t.em_etvfac_ipsi_regime END,
  em_etvfac_exemption_cause = CASE WHEN f.clear_vfactu THEN NULL ELSE t.em_etvfac_exemption_cause END,
  em_etvfac_cause_not_taxable = CASE WHEN f.clear_vfactu THEN NULL ELSE t.em_etvfac_cause_not_taxable END,
  em_tbai_claveregimeniva = CASE WHEN f.clear_tbai THEN NULL ELSE t.em_tbai_claveregimeniva END,
  em_tbai_nonsubjectcause = CASE WHEN f.clear_tbai THEN NULL ELSE t.em_tbai_nonsubjectcause END,
  em_tbai_exemptioncause = CASE WHEN f.clear_tbai THEN NULL ELSE t.em_tbai_exemptioncause END,
  updated = now(), updatedby = '0'
FROM etsg_sif_clear_flags_tmp f
WHERE t.c_tax_id = f.c_tax_id
  AND t.ad_client_id = :client_id
  AND (f.clear_vfactu OR f.clear_tbai);

-- @report
-- Full before/after audit of every System tax row this run cleared: old values +
-- which group (Verifactu/TBAI) was actually cleared. Stored verbatim in the
-- ledger's `detail` column -- see the Revert note above.
SELECT * FROM etsg_sif_clear_audit_tmp;
