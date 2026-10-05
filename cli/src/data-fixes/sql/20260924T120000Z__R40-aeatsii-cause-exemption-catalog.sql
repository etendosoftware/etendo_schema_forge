-- @id: R40-aeatsii-cause-exemption-catalog
-- @gap: O1
-- @risk: low
-- @type: sql
-- @description: Seed the AEAT SII exemption-cause catalog (E1-E6) ONCE as SYSTEM-owned rows (ad_client_id='0') into AEATSII_CAUSE_EXEMPTION, so the "Causa de exencion" selector on the invoice SIF/SII tab is populated for every tenant via the standard client-visibility filter, without seeding a redundant per-tenant copy (ETP-5481)

-- Background
-- ----------
-- The "Causa de exencion" (exemption cause) selector on the invoice SII tab
-- (`tools/app-shell/src/windows/custom/shared/SifTab.jsx`) hits the standard FK
-- selector `header/selectors/aeatsiiCauseExemption` against `AEATSII_CAUSE_EXEMPTION`
-- -- a client/org-scoped AD table (table model owned by the classic
-- `org.openbravo.module.sii` module). Confirmed live on this DB (2026-09-24): exactly
-- one ad_client_id, 802509E12436405C86BA1FD5B1DF508C (GOClient), had any rows at all.
--
-- REDESIGN (2026-09-25) -- supersedes the original per-client approach
-- -----------------------------------------------------------------------
-- An earlier version of this fix (same ticket, same filename, never applied to any
-- tenant) seeded a PRIVATE copy of the six causes for every individual
-- `:client_id`, mirroring `R17-sii-cause-exemption` (ETP-4751). That design is
-- abandoned here in favor of SIX SHARED SYSTEM ROWS (ad_client_id='0'), based on:
--
--   1. `AEATSII_CAUSE_EXEMPTION` does NOT forbid ad_client_id='0' at the DB level --
--      only NOT NULL is enforced, and '0' (System) is a valid, ordinary value.
--   2. The selector is built through Etendo's standard DAL selector mechanism
--      (`SelectorQueryExecutor` -> `OBDal.createQuery`), which applies the
--      framework's standard client-visibility filter -- and that filter already
--      includes ad_client_id='0' rows for ANY client automatically. No selector
--      code change is needed to make System rows visible tenant-side.
--   3. Etendo GO exposes NO maintenance window for this catalog (no
--      `artifacts/*exemption*` window exists in schema_forge) -- the six causes are
--      always identical for every tenant, with no per-client customization need.
--      Sharing them is therefore safe, and avoids inserting thousands of byte-for-byte
--      identical rows (one set per tenant, forever) for data that can never diverge.
--
-- This also matches the established "System pseudo-tenant" pattern already documented
-- in `sql/README.md` (`--client 0`, worked example
-- `20260904T130000Z__R34-tax-sif-config-clear-system.sql`): the fix's anchor table row
-- really does live at ad_client_id='0', so scoping every statement to `:client_id`
-- still satisfies the framework's literal tenant-scope rule -- it is simply run once,
-- explicitly, against the System pseudo-tenant:
--
--   node cli/src/data-fixes/run.js --fix R40-aeatsii-cause-exemption-catalog --client 0
--
-- It will NEVER be picked up by the default per-tenant sweep (the runner's tenant
-- universe query excludes ad_client_id='0' -- see run.js), so an operator must name it
-- explicitly. Per the README convention for System-scoped rows, AD_ORG_ID is written
-- as the literal '0' here, never `:org_id` -- there is no tenant operative org to bind
-- to when the anchor client itself is System.
--
-- Relationship to R17-sii-cause-exemption (ETP-4751, 2026-08-03) -- read before editing
-- --------------------------------------------------------------------------------------
-- R17 seeded a PER-CLIENT copy, gated behind `EXISTS aeatsii_description` for the
-- tenant ("SII-configured" proxy). It is immutable and already shipped -- it is NOT
-- edited here. Once this fix has run, every tenant's selector resolves the six System
-- rows via the client-visibility filter regardless of whether it has its own private
-- copy from R17, so R17's own `@check` (`NOT EXISTS aeatsii_cause_exemption` for the
-- tenant) is unaffected either way -- a tenant that already has its own R17 copy simply
-- carries a harmless, redundant private copy alongside the shared System rows; the
-- selector shows the union with no duplicate-looking behavior beyond seeing the same
-- six causes it would see anyway. R17 is not retired -- it caused no harm and retiring
-- it is not necessary extra surface area for this ticket.
--
-- Catalog: unchanged from R17 -- the AEAT fixed CausaExencion list for IVA: E1 (art.
-- 20), E2 (art. 21), E3 (art. 22), E4 (arts. 23 & 24), E5 (art. 25), E6 (otra causa).
-- All six seeded non-default (isdefault='N') -- the legally correct exemption cause is
-- operation-specific and must be a conscious user choice, and GO ships no
-- cause-exemption maintenance window, so a baked-in default could not be corrected by
-- the user. taxtype 'IVA' (the column also accepts 'IGIC', out of scope here, matching
-- R17 and the GOClient sampledata).
--
-- Preventive twin
-- ---------------
-- The onboarding-side twin of this fix is NOT an addition to
-- `OnboardingDatasetDefinition.INCLUDED_TABLES` (that would seed a per-tenant copy,
-- the design this redesign abandons). Instead, the six causes ship as SYSTEM rows in
-- `modules/com.etendoerp.go/src-db/database/sourcedata/AEATSII_CAUSE_EXEMPTION.xml`,
-- loaded once by `update.database` (module system data), independent of any tenant's
-- onboarding run. A newborn tenant is therefore born correct as soon as the module
-- carrying that sourcedata file is installed/updated on its instance -- there is
-- nothing for onboarding itself to do per tenant.
--
-- Idempotency
-- -----------
-- Six independent guarded INSERTs, one per KEY (E1..E6), each guarded by NOT EXISTS on
-- (ad_client_id, key) -- the natural key AEAT defines -- so a re-run after a partial or
-- full success inserts nothing more. Because this fix runs exactly once against the
-- System pseudo-tenant, "partial" here means: the module's own sourcedata load
-- (`update.database`) may have already inserted some or all six rows before this fix
-- is ever run by an operator -- in which case `@check` (and each guarded INSERT)
-- correctly converges to SKIPPED_NOT_NEEDED / zero additional rows. Running this fix is
-- therefore always safe, whether or not the sourcedata XML has already been applied on
-- a given instance.
--
-- ONBOARDING_PROVISIONED_THROUGH is NOT bumped: this fix targets the System
-- pseudo-tenant (ad_client_id='0'), which the CUT watermark mechanism does not apply
-- to (the watermark is computed per real tenant from ETGO_DATA_FIX_HISTORY rows keyed
-- by `remediated_client_id`). No per-tenant bookkeeping is relevant here.

-- @check
-- Returns >=1 row when the SYSTEM pseudo-tenant is missing at least one of the six
-- AEAT exemption causes (E1-E6). 0 rows => all six already present (e.g. via the
-- module's own sourcedata load) => SKIPPED_NOT_NEEDED.
SELECT 1
FROM (VALUES ('E1'), ('E2'), ('E3'), ('E4'), ('E5'), ('E6')) AS k(cause_key)
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = k.cause_key
)
LIMIT 1;

-- @apply
-- One row per AEAT IVA exemption cause, owned by the System pseudo-tenant
-- (ad_client_id/ad_org_id both '0'). Each INSERT is independently guarded by
-- NOT EXISTS on (ad_client_id, key), so re-running never double-inserts and a
-- partially-seeded catalog (e.g. by the module's own sourcedata load) is completed.
-- All causes are non-default (isdefault='N') by design.
INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT '@uuid_E1@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'E1', 'Exenta por el artículo 20 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = 'E1'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT '@uuid_E2@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'E2', 'Exenta por el artículo 21 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = 'E2'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT '@uuid_E3@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'E3', 'Exenta por el artículo 22 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = 'E3'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT '@uuid_E4@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'E4', 'Exenta por los artículos 23 y 24 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = 'E4'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT '@uuid_E5@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'E5', 'Exenta por el artículo 25 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = 'E5'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT '@uuid_E6@', :client_id, '0', 'Y', now(), '0', now(), '0',
  'E6', 'Exenta por otra causa', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption ace
  WHERE ace.ad_client_id = :client_id AND ace.key = 'E6'
);
