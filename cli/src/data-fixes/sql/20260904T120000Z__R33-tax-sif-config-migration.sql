-- @id: R33-tax-sif-config-migration
-- @gap: ETP-5122
-- @risk: medium
-- @type: sql
-- @description: Backfill per-organization ETSG_Tax_SIF_Config overrides (Verifactu/TicketBAI SIF fields) from the SHARED SYSTEM C_Tax row, for every legal-entity org with active fiscal config, so the fallback table has data before the System fields are cleared by its sibling fix

-- Background
-- ----------
-- The 8 Verifactu/TicketBAI SIF fields (VAT/IGIC/IPSI regime, exemption cause,
-- cause-not-taxable, TBAI clave/nonsubject/exemption cause) live on C_Tax. In Etendo
-- GO every tenant shares the SAME System-scoped tax rates (C_Tax.ad_client_id = '0',
-- ad_org_id = '*') -- so when the FIRST tenant configured its exemption cause on a
-- shared rate, that value silently became visible to EVERY tenant using that same
-- rate. ETSG_Tax_SIF_Config (module com.etendoerp.sif.general) fixes this going
-- forward with a per-(c_tax_id, ad_org_id) override; the read-side precedence
-- (already implemented, out of scope here) is: the System C_Tax value wins if
-- non-empty, otherwise fall back to the override. That precedence means the
-- override can never take effect while the System field still holds the value the
-- first tenant set -- this fix (Phase 5 of ETP-5122) backfills the override table
-- from the current System values so its sibling fix (R34, see that file) can then
-- safely clear the System fields.
--
-- Scope: only legal-entity orgs (AD_GET_ORG_LE_BU(org_id, 'LE')) with active fiscal
-- config -- AD_OrgInfo.em_etsg_has_vfactu_config = 'Y' (5 Verifactu fields) or
-- em_etsg_has_tbai_config = 'Y' (3 TicketBAI fields) -- get an override row. An org
-- with neither flag never gets one: it has no SIF config to protect, so a row would
-- never be read and would only pollute the table. Deliberately 1:N, not 1:1 -- if N
-- different orgs (in different clients or the same client) share the same System tax
-- row, EACH one gets its OWN override row carrying the SAME migrated value (verified
-- live: this dev DB currently has exactly 1 org with active config, so the N>1 case
-- is not exercised here, but the SQL is written generically for any N).
--
-- This fix is scoped by :client_id exactly like every other fix in this catalog: it
-- only writes override rows for orgs belonging to the target tenant. It reads the
-- SYSTEM C_Tax row (ad_client_id = '0') read-only for the copy source, which is safe
-- -- System data is shared/global by construction, so a cross-client READ here does
-- not violate tenant isolation. See R34's header for the fix that is NOT a normal
-- per-:client_id fix (the destructive clear step, which must run once, globally).
--
-- Idempotency
-- -----------
-- @check fires only when the tenant has >=1 active-config legal-entity org that is
-- still missing >=1 needed override row. @apply is additionally guarded per-row by
-- NOT EXISTS on the (c_tax_id, ad_org_id) unique key, so re-running is a no-op once
-- complete, and a fix half-applied by a crash simply finishes the remaining rows on
-- the next run. Two orginfo rows that resolve to the SAME legal-entity org (e.g. a
-- non-LE org and its own LE both flagged active) are pre-aggregated via bool_or/
-- GROUP BY in the `targets` CTE before the insert, so the unique constraint is never
-- hit twice within one @apply.

-- @check
WITH targets AS (
  SELECT ad_get_org_le_bu(oi.ad_org_id, 'LE') AS le_org_id,
         bool_or(oi.em_etsg_has_vfactu_config = 'Y') AS has_vfactu,
         bool_or(oi.em_etsg_has_tbai_config = 'Y') AS has_tbai
  FROM ad_orginfo oi
  JOIN ad_org o ON o.ad_org_id = oi.ad_org_id AND o.isactive = 'Y'
  WHERE o.ad_client_id = :client_id
    AND (oi.em_etsg_has_vfactu_config = 'Y' OR oi.em_etsg_has_tbai_config = 'Y')
  GROUP BY 1
)
SELECT 1
FROM targets tg
JOIN c_tax t ON t.ad_client_id = '0'
WHERE (
    (tg.has_vfactu AND (
      COALESCE(t.em_etvfac_vat_regime, '') <> ''
      OR COALESCE(t.em_etvfac_igic_regime, '') <> ''
      OR COALESCE(t.em_etvfac_ipsi_regime, '') <> ''
      OR COALESCE(t.em_etvfac_exemption_cause, '') <> ''
      OR COALESCE(t.em_etvfac_cause_not_taxable, '') <> ''
    ))
    OR
    (tg.has_tbai AND (
      COALESCE(t.em_tbai_claveregimeniva, '') <> ''
      OR COALESCE(t.em_tbai_nonsubjectcause, '') <> ''
      OR COALESCE(t.em_tbai_exemptioncause, '') <> ''
    ))
  )
  AND NOT EXISTS (
    SELECT 1 FROM etsg_tax_sif_config cfg
    WHERE cfg.c_tax_id = t.c_tax_id AND cfg.ad_org_id = tg.le_org_id
  )
LIMIT 1;

-- @apply
CREATE TEMP TABLE IF NOT EXISTS etsg_sif_migration_audit_tmp (
  c_tax_id VARCHAR, ad_org_id VARCHAR
) ON COMMIT DROP;

WITH targets AS (
  SELECT ad_get_org_le_bu(oi.ad_org_id, 'LE') AS le_org_id,
         o.ad_client_id AS org_client_id,
         bool_or(oi.em_etsg_has_vfactu_config = 'Y') AS has_vfactu,
         bool_or(oi.em_etsg_has_tbai_config = 'Y') AS has_tbai
  FROM ad_orginfo oi
  JOIN ad_org o ON o.ad_org_id = oi.ad_org_id AND o.isactive = 'Y'
  WHERE o.ad_client_id = :client_id
    AND (oi.em_etsg_has_vfactu_config = 'Y' OR oi.em_etsg_has_tbai_config = 'Y')
  GROUP BY 1, 2
),
ins AS (
  INSERT INTO etsg_tax_sif_config (
    etsg_tax_sif_config_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
    c_tax_id, em_etvfac_vat_regime, em_etvfac_igic_regime, em_etvfac_ipsi_regime,
    em_etvfac_exemption_cause, em_etvfac_cause_not_taxable,
    em_tbai_claveregimeniva, em_tbai_nonsubjectcause, em_tbai_exemptioncause
  )
  SELECT
    get_uuid(), tg.org_client_id, tg.le_org_id, 'Y', now(), '0', now(), '0',
    t.c_tax_id,
    CASE WHEN tg.has_vfactu THEN t.em_etvfac_vat_regime ELSE NULL END,
    CASE WHEN tg.has_vfactu THEN t.em_etvfac_igic_regime ELSE NULL END,
    CASE WHEN tg.has_vfactu THEN t.em_etvfac_ipsi_regime ELSE NULL END,
    CASE WHEN tg.has_vfactu THEN t.em_etvfac_exemption_cause ELSE NULL END,
    CASE WHEN tg.has_vfactu THEN t.em_etvfac_cause_not_taxable ELSE NULL END,
    CASE WHEN tg.has_tbai THEN t.em_tbai_claveregimeniva ELSE NULL END,
    CASE WHEN tg.has_tbai THEN t.em_tbai_nonsubjectcause ELSE NULL END,
    CASE WHEN tg.has_tbai THEN t.em_tbai_exemptioncause ELSE NULL END
  FROM targets tg
  JOIN c_tax t ON t.ad_client_id = '0'
  WHERE (
      (tg.has_vfactu AND (
        COALESCE(t.em_etvfac_vat_regime, '') <> ''
        OR COALESCE(t.em_etvfac_igic_regime, '') <> ''
        OR COALESCE(t.em_etvfac_ipsi_regime, '') <> ''
        OR COALESCE(t.em_etvfac_exemption_cause, '') <> ''
        OR COALESCE(t.em_etvfac_cause_not_taxable, '') <> ''
      ))
      OR
      (tg.has_tbai AND (
        COALESCE(t.em_tbai_claveregimeniva, '') <> ''
        OR COALESCE(t.em_tbai_nonsubjectcause, '') <> ''
        OR COALESCE(t.em_tbai_exemptioncause, '') <> ''
      ))
    )
    AND NOT EXISTS (
      SELECT 1 FROM etsg_tax_sif_config cfg
      WHERE cfg.c_tax_id = t.c_tax_id AND cfg.ad_org_id = tg.le_org_id
    )
  RETURNING c_tax_id, ad_org_id
)
INSERT INTO etsg_sif_migration_audit_tmp (c_tax_id, ad_org_id)
SELECT c_tax_id, ad_org_id FROM ins;

-- @report
-- Diagnostic only: list every override row this run just created (captured via
-- @apply's RETURNING into a temp table, since @report runs after @apply and sees
-- post-apply state only).
SELECT cfg.c_tax_id, cfg.ad_org_id, t.name AS tax_name,
  cfg.em_etvfac_vat_regime, cfg.em_etvfac_igic_regime, cfg.em_etvfac_ipsi_regime,
  cfg.em_etvfac_exemption_cause, cfg.em_etvfac_cause_not_taxable,
  cfg.em_tbai_claveregimeniva, cfg.em_tbai_nonsubjectcause, cfg.em_tbai_exemptioncause
FROM etsg_tax_sif_config cfg
JOIN c_tax t ON t.c_tax_id = cfg.c_tax_id
WHERE (cfg.c_tax_id, cfg.ad_org_id) IN (SELECT c_tax_id, ad_org_id FROM etsg_sif_migration_audit_tmp);
