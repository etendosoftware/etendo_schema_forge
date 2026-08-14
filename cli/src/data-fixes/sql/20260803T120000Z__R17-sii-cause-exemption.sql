-- @id: R17-sii-cause-exemption
-- @gap: ETP-4751
-- @risk: low
-- @type: sql
-- @description: Seed the AEAT SII "Causa de Exención" master catalog (AEATSII_CAUSE_EXEMPTION, keys E1-E6, taxtype IVA) for SII-configured tenants that have none, so the invoice SIF "Causa de Exención" selector is populated

-- Background
-- ----------
-- The SII "Causa de Exención" (CausaExencion in the AEAT SOAP) selector on the invoice
-- SIF tab reads from the client-scoped master table AEATSII_CAUSE_EXEMPTION. The SII
-- module (org.openbravo.module.sii) ships ONLY the empty table definition + a config
-- window + event handlers -- it ships NO seed record data anywhere (verified: no
-- AD_DATASET / AD_DATASET_TABLE / sourcedata / referencedata dump of this table; the
-- Spanish localization user guide explicitly states these values "no se asignan
-- automáticamente desde el dataset y deben configurarse manualmente en cada caso").
-- Historically an operator applied the AEAT catalog by hand via Enterprise Module
-- Management. On GOClient the step was never done, so the selector renders empty.
--
-- This is a provisioning gap, not a code bug. The preventive twin seeds the same catalog
-- at onboarding: referencedata/sampledata/GOClient/AEATSII_CAUSE_EXEMPTION.xml (mirroring
-- the sibling AEATSII_DESCRIPTION.xml that already ships in that same directory). This
-- corrective fix repairs already-provisioned tenants.
--
-- Catalog: the AEAT fixed CausaExencion list for IVA -- E1 (art. 20), E2 (art. 21),
-- E3 (art. 22), E4 (arts. 23 & 24), E5 (art. 25), E6 (otra causa). ALL causes are seeded
-- non-default (isdefault='N'): the legally correct exemption cause is operation-specific
-- and must be a conscious user choice, and Go ships NO cause-exemption maintenance window
-- so a baked-in default could not be corrected by the user and would risk silently
-- submitting a wrong CausaExencion to AEAT. With no default the invoice shows a "should
-- indicate an exemption cause" warning that guides the user to pick the right one.
-- taxtype 'IVA' (the column also accepts 'IGIC' but the IVA set is what the SIF selector
-- needs here). Names/keys match the module's own SOAP mapping and the localization user
-- guide.
--
-- Scope guard: only SII-configured tenants get the catalog. We proxy "SII-configured" by
-- the presence of >=1 AEATSII_DESCRIPTION row (the sibling SII localization master table
-- seeded for GOClient at onboarding) rather than seeding it blindly for every tenant --
-- a non-Spain tenant has no SII setup and should not receive Spanish exemption causes.
--
-- Idempotency
-- -----------
-- @check fires only when the tenant is SII-configured AND has zero AEATSII_CAUSE_EXEMPTION
-- rows. @apply is additionally guarded per row by NOT EXISTS on (ad_client_id, key) -- the
-- natural key -- so a partial/concurrent state (some keys already present) is completed
-- without duplicates and a re-run is a no-op. Every statement is scoped to :client_id in
-- both @check and @apply. PKs are minted per row with get_uuid(). ad_org_id uses :org_id
-- (the tenant's operative org), matching how the preventive sampledata scopes the rows to
-- the operative org rather than '*'. The @apply runs in ONE transaction (the runner wraps
-- BEGIN/COMMIT); on failure it rolls back.

-- @check
-- Needs the fix when the tenant is SII-configured (has at least one AEATSII_DESCRIPTION
-- row) but has no AEATSII_CAUSE_EXEMPTION rows at all.
SELECT 1
FROM ad_client c
WHERE c.ad_client_id = :client_id
  AND EXISTS (
    SELECT 1 FROM aeatsii_description d WHERE d.ad_client_id = :client_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM aeatsii_cause_exemption e WHERE e.ad_client_id = :client_id
  )
LIMIT 1;

-- @apply
-- One row per AEAT IVA exemption cause (E1-E6). Each INSERT is independently guarded by
-- NOT EXISTS on (ad_client_id, key), so re-running never double-inserts and a partial
-- catalog is completed. All causes are non-default (isdefault='N') by design -- see the
-- Background note above.
INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'E1', 'Exenta por el artículo 20 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption e
  WHERE e.ad_client_id = :client_id AND e.key = 'E1'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'E2', 'Exenta por el artículo 21 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption e
  WHERE e.ad_client_id = :client_id AND e.key = 'E2'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'E3', 'Exenta por el artículo 22 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption e
  WHERE e.ad_client_id = :client_id AND e.key = 'E3'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'E4', 'Exenta por los artículos 23 y 24 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption e
  WHERE e.ad_client_id = :client_id AND e.key = 'E4'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'E5', 'Exenta por el artículo 25 de la Ley del IVA', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption e
  WHERE e.ad_client_id = :client_id AND e.key = 'E5'
);

INSERT INTO aeatsii_cause_exemption (
  aeatsii_cause_exemption_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, key, name, isdefault, taxtype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
  'E6', 'Exenta por otra causa', 'N', 'IVA'
WHERE NOT EXISTS (
  SELECT 1 FROM aeatsii_cause_exemption e
  WHERE e.ad_client_id = :client_id AND e.key = 'E6'
);
