-- @id: R10-accounting-schema-dimensions
-- @gap: A3
-- @risk: low
-- @type: sql
-- @description: Predefine the accounting schema (Allow Negatives=Y, Centrally Maintained=Y) and enable the 3 missing accounting dimensions (Cost Center, User1, User2) on C_ACCTSCHEMA_ELEMENT, so all 6 optional dimensions (Project, Bus.Partner, Product, Cost Center, User1, User2) are active by default alongside the 2 mandatory ones (Organization, Account) — ETP-4245

-- NOTE (2026-07-06): a sibling in-flight branch (feat/bp-category-preventive, ETP-4402) already
-- shipped a fix labeled R9 (20260701T120000Z__R9-bp-category-seed.sql) that is not yet merged into
-- this branch. This fix is deliberately labeled R10 (not R9) to avoid an @id collision once both
-- branches converge. Confirmed via `git rev-list --all` across all local worktrees/branches before
-- picking this label — always check ALL branches' catalogs, not just your own, before naming a new
-- fix (see docs/etendo-ad/tenant-remediation-knowledge.md).

-- @check
-- Returns >=1 row when the tenant's accounting schema still has the old defaults (Allow
-- Negatives=N or Centrally Maintained=N) OR is missing one of the 3 dimensions (CC/U1/U2).
-- 0 rows => tenant has no schema yet (nothing to do here; R1 provisions it) or is already correct.
SELECT 1
FROM c_acctschema s
WHERE s.ad_client_id = :client_id
  AND (
    s.allownegative = 'N'
    OR s.iscentrallymaintained = 'N'
    OR EXISTS (
      SELECT 1
      FROM (VALUES ('CC'), ('U1'), ('U2')) AS dim(elementtype)
      WHERE NOT EXISTS (
        SELECT 1 FROM c_acctschema_element ae
        WHERE ae.c_acctschema_id = s.c_acctschema_id
          AND ae.elementtype = dim.elementtype
      )
    )
  )
LIMIT 1;

-- @apply

-- 1. Predefine the schema-level flags (TC-38: Allow Negatives=Yes, Centrally Maintained=Yes).
--    Guarded defensively so a partial/concurrent run never re-touches an already-correct row.
UPDATE c_acctschema
SET allownegative = 'Y',
    iscentrallymaintained = 'Y',
    updated = now(),
    updatedby = '0'
WHERE ad_client_id = :client_id
  AND (allownegative = 'N' OR iscentrallymaintained = 'N');

-- 2. Enable the 3 missing optional dimensions (TC-40: Cost Center, User1, User2) — non-mandatory,
--    unbalanced, client-level (ad_org_id='0'), mirroring the shape of the existing PJ/BP/PR rows.
--    NOT EXISTS per (schema, elementtype) is the second idempotency layer — safe to re-run even if
--    a prior partial apply already inserted one or two of the three.
INSERT INTO c_acctschema_element (
  c_acctschema_element_id, isactive, created, createdby, updated, ad_org_id, updatedby,
  c_acctschema_id, elementtype, name, seqno, c_element_id, ad_client_id, ismandatory, isbalanced,
  org_id, c_elementvalue_id, m_product_id, c_bpartner_id, c_location_id, c_salesregion_id,
  c_project_id, c_campaign_id, c_activity_id
)
SELECT get_uuid(), 'Y', now(), '0', now(), '0', '0',
       s.c_acctschema_id, dim.elementtype, dim.name, dim.seqno, null, :client_id, 'N', 'N',
       null, null, null, null, null, null, null, null, null
FROM c_acctschema s
CROSS JOIN (VALUES
  ('CC', 'Cost Center', 60),
  ('U1', 'User 1', 70),
  ('U2', 'User 2', 80)
) AS dim(elementtype, name, seqno)
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM c_acctschema_element ae
    WHERE ae.c_acctschema_id = s.c_acctschema_id
      AND ae.elementtype = dim.elementtype
  );
