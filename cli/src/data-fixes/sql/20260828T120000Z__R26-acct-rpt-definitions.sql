-- @id: R26-acct-rpt-definitions
-- @gap: ETP-5013
-- @risk: low
-- @type: sql
-- @description: Create the "Pérdidas y Ganancias" and "Balance de Situación" accounting-report definitions (C_Acct_Rpt + C_Acct_Rpt_Group + C_Acct_Rpt_Node) for every active accounting schema of tenants provisioned before those rows shipped in GOClient's sampledata

-- Context (ETP-5013)
-- --------------------------------------------------------------------------------------------
-- GOClient's reference data ships the two accounting-report definitions
-- (com.etendoerp.go/referencedata/sampledata/GOClient/C_ACCT_RPT.xml, C_ACCT_RPT_GROUP.xml and
-- C_ACCT_RPT_NODE.xml): "Pérdidas y Ganancias" (reporttype 'N') and "Balance de Situación"
-- (reporttype 'Y'), each with its groups and the node pointing at the matching summary account.
-- That XML is sampledata, though — it only runs when a tenant is first provisioned, and is never
-- replayed into an already-provisioned one. Confirmed live: of 124 clients, only GOClient (2 rows,
-- from that sampledata) and F&B International Group (4 rows, standard Etendo reference data) have
-- any C_Acct_Rpt at all; every other tenant has zero. This corrective closes the same gap for the
-- tenants that predate the dataset change.
--
-- Why the sampledata ids can't just be copied
-- ---------------------------------------------------------------------------
-- Every FK in those XMLs is client-scoped to GOClient: AD_ORG_ID, C_ACCTSCHEMA_ID and — the one
-- that actually matters here — C_ELEMENTVALUE_ID. The three accounts the nodes point at are
-- GOClient's own summary accounts:
--
--     F4722DAD8EAB4D69AB4F3F66BE5A800E  value 'PYG'  Pérdidas y ganancias
--     F115C4AA6640454DB4007DCBEC74634D  value 'A'    ACTIVO
--     52424CC6B50D47B4A10EE178357C551D  value 'P'    PATRIMONIO NETO Y PASIVO
--
-- Writing those ids into another tenant would create cross-client FKs, which Etendo's AD scoping
-- forbids. Each account is therefore resolved by its `value` inside the TARGET tenant. Verified
-- live that all 124 clients do have the three accounts.
--
-- Why `value` ALONE is not enough (the subtle one)
-- ---------------------------------------------------------------------------
-- A tenant can own more than one account tree (C_Element). GOClient owns two — "Arbol de cuentas
-- GO" (client-level, ad_org_id '0', the one its sampledata nodes actually point at) and "GOOrg
-- Account Tree" (org-level) — so it has TWO active summary accounts with value 'PYG', two with
-- 'A' and two with 'P'. A lookup by `value` alone would match both and either fail or silently
-- create a node against the wrong tree.
--
-- The disambiguator is the schema itself: C_AcctSchema_Element with elementtype = 'AC' links each
-- accounting schema to the exact account tree it posts against (for GOClient: "Esquema GO" ->
-- "Arbol de cuentas GO", precisely the tree the sampledata used). Every account lookup below
-- therefore goes schema -> its 'AC' element -> value, never value alone. Verified live that no
-- schema has more than one active 'AC' element, and that no (schema tree, value) pair is
-- ambiguous — so these joins can never fan out into duplicate rows.
--
-- Scope: one report pair per ACCOUNTING SCHEMA, not per tenant
-- ---------------------------------------------------------------------------
-- C_Acct_Rpt carries a c_acctschema_id, and a tenant can have several schemas (live: F&B and
-- "QA Testing" both have 2). F&B — standard Etendo reference data, not ours — has exactly one
-- report pair per schema, which is the natural reading of that column, so this fix creates the
-- pair for every active schema that is missing it rather than only for a "primary" one.
--
-- Idempotency — entirely on this script, because the DB will not help
-- ---------------------------------------------------------------------------
-- All three tables have ONLY a primary key on their own id: there is no unique constraint on
-- (client, name, schema) or anything equivalent (verified in pg_constraint). Nothing at the
-- database level would reject a duplicate, so the NOT EXISTS guards below are the sole
-- protection. Each of the three steps carries its own guard, keyed on the natural business key
-- (report: name + schema; group: name + parent report; node: parent group), so the fix is safe
-- to re-run AND self-heals a partially-created state — e.g. a report that exists but lost its
-- groups. @check mirrors those same three conditions so a half-applied tenant is still detected
-- as needing the fix.
--
-- Why get_uuid() and not the runner's @uuid_KEY@ placeholder
-- ---------------------------------------------------------------------------
-- @uuid_KEY@ resolves to ONE id per key per apply, which is exactly right when a fix inserts a
-- fixed number of rows. Here the row count depends on how many schemas the tenant has, so two
-- schemas would collide on the same primary key. These inserts are set-based with get_uuid()
-- instead — the same pattern R20-default-standard-costing-rule.sql and ~10 other fixes already
-- use. The child steps never need the parent id threaded through: each one re-selects its parent
-- by natural key.
--
-- Not touching already-configured tenants
-- ---------------------------------------------------------------------------
-- F&B's Spanish reports happen to have exactly the structure this fix would create (same report
-- names, same group names and lines, same PYG/A/P accounts — the GO sampledata was modeled on
-- Etendo's standard Spanish setup), so every guard below matches and the fix is a full no-op
-- there. Its English reports ("Profit & Loss", "Balance Sheet") have different names and are
-- never considered at all.
--
-- Preventive twin
-- ---------------------------------------------------------------------------
-- Tenants onboarded from the GOClient dataset going forward get these rows straight from the
-- sampledata XMLs above — this corrective only covers the ones provisioned before that.

-- @check
-- Needs the fix when the tenant has an active accounting schema whose own account tree carries
-- the three summary accounts, and that schema is missing either report, OR has one of them
-- without its groups, OR has a group without its node (the partially-created cases).
SELECT 1
FROM c_acctschema s
JOIN c_acctschema_element se
  ON se.c_acctschema_id = s.c_acctschema_id
 AND se.elementtype = 'AC'
 AND se.isactive = 'Y'
WHERE s.ad_client_id = :client_id
  AND s.isactive = 'Y'
  AND (
    SELECT COUNT(DISTINCT ev.value)
    FROM c_elementvalue ev
    WHERE ev.c_element_id = se.c_element_id
      AND ev.ad_client_id = :client_id
      AND ev.isactive = 'Y'
      AND ev.issummary = 'Y'
      AND ev.value IN ('PYG', 'A', 'P')
  ) = 3
  AND (
    NOT EXISTS (
      SELECT 1 FROM c_acct_rpt r
      WHERE r.ad_client_id = :client_id
        AND r.c_acctschema_id = s.c_acctschema_id
        AND r.name = 'Pérdidas y Ganancias'
    )
    OR NOT EXISTS (
      SELECT 1 FROM c_acct_rpt r
      WHERE r.ad_client_id = :client_id
        AND r.c_acctschema_id = s.c_acctschema_id
        AND r.name = 'Balance de Situación'
    )
    OR EXISTS (
      SELECT 1 FROM c_acct_rpt r
      WHERE r.ad_client_id = :client_id
        AND r.c_acctschema_id = s.c_acctschema_id
        AND r.name IN ('Pérdidas y Ganancias', 'Balance de Situación')
        AND NOT EXISTS (
          SELECT 1 FROM c_acct_rpt_group g WHERE g.c_acct_rpt_id = r.c_acct_rpt_id
        )
    )
    OR EXISTS (
      SELECT 1
      FROM c_acct_rpt r
      JOIN c_acct_rpt_group g ON g.c_acct_rpt_id = r.c_acct_rpt_id
      WHERE r.ad_client_id = :client_id
        AND r.c_acctschema_id = s.c_acctschema_id
        AND r.name IN ('Pérdidas y Ganancias', 'Balance de Situación')
        AND NOT EXISTS (
          SELECT 1 FROM c_acct_rpt_node n WHERE n.c_acct_rpt_group_id = g.c_acct_rpt_group_id
        )
    )
  )
LIMIT 1;

-- @apply
-- 1. C_ACCT_RPT. One row per (active schema, report) still missing it. The COUNT(DISTINCT ...) = 3
--    guard skips any schema whose tree lacks the three summary accounts (e.g. a non-Spanish chart
--    of accounts) entirely, so a report is never created without the accounts its nodes need.
INSERT INTO c_acct_rpt (
  c_acct_rpt_id, ad_client_id, ad_org_id, isactive, created, createdby,
  updated, updatedby, name, c_acctschema_id, isorgbalanced, reporttype
)
SELECT get_uuid(), :client_id, :org_id, 'Y', now(), '0', now(), '0',
       spec.rpt_name, s.c_acctschema_id, spec.isorgbalanced, spec.reporttype
FROM c_acctschema s
JOIN c_acctschema_element se
  ON se.c_acctschema_id = s.c_acctschema_id
 AND se.elementtype = 'AC'
 AND se.isactive = 'Y'
CROSS JOIN (VALUES
  ('Pérdidas y Ganancias', 'N', 'N'),
  ('Balance de Situación', 'Y', 'Y')
) AS spec(rpt_name, isorgbalanced, reporttype)
WHERE s.ad_client_id = :client_id
  AND s.isactive = 'Y'
  AND (
    SELECT COUNT(DISTINCT ev.value)
    FROM c_elementvalue ev
    WHERE ev.c_element_id = se.c_element_id
      AND ev.ad_client_id = :client_id
      AND ev.isactive = 'Y'
      AND ev.issummary = 'Y'
      AND ev.value IN ('PYG', 'A', 'P')
  ) = 3
  AND NOT EXISTS (
    SELECT 1 FROM c_acct_rpt r
    WHERE r.ad_client_id = :client_id
      AND r.c_acctschema_id = s.c_acctschema_id
      AND r.name = spec.rpt_name
  );

-- 2. C_ACCT_RPT_GROUP. Three groups, attached to whichever of the two reports owns them, for
--    every report of this client carrying one of the two names — including reports step 1 just
--    created and any that already existed but lost their groups. Guarded per (report, group
--    name), so a report that already has the group is left untouched.
INSERT INTO c_acct_rpt_group (
  c_acct_rpt_group_id, c_acct_rpt_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, name, line
)
SELECT get_uuid(), r.c_acct_rpt_id, :client_id, :org_id, 'Y', now(), '0', now(), '0',
       spec.group_name, spec.line
FROM (VALUES
  ('Pérdidas y Ganancias', 'Pérdidas y Ganancias',     10),
  ('Balance de Situación', 'Activo',                   10),
  ('Balance de Situación', 'Patrimonio Neto y Pasivo', 20)
) AS spec(rpt_name, group_name, line)
JOIN c_acct_rpt r
  ON r.ad_client_id = :client_id
 AND r.name = spec.rpt_name
WHERE NOT EXISTS (
  SELECT 1 FROM c_acct_rpt_group g
  WHERE g.c_acct_rpt_id = r.c_acct_rpt_id
    AND g.name = spec.group_name
);

-- 3. C_ACCT_RPT_NODE. One node per group, pointing at the summary account resolved through the
--    OWNING REPORT'S schema tree (see the "value alone is not enough" note above), never by value
--    alone. A report whose c_acctschema_id is null (the column is nullable) joins to no tree and
--    is skipped rather than getting a node against an arbitrary account.
INSERT INTO c_acct_rpt_node (
  c_acct_rpt_node_id, c_acct_rpt_group_id, ad_client_id, ad_org_id, isactive,
  created, createdby, updated, updatedby, name, c_elementvalue_id, line
)
SELECT get_uuid(), g.c_acct_rpt_group_id, :client_id, :org_id, 'Y', now(), '0', now(), '0',
       g.name, ev.c_elementvalue_id, 10
FROM (VALUES
  ('Pérdidas y Ganancias',     'PYG'),
  ('Activo',                   'A'),
  ('Patrimonio Neto y Pasivo', 'P')
) AS spec(group_name, acct_value)
JOIN c_acct_rpt_group g
  ON g.ad_client_id = :client_id
 AND g.name = spec.group_name
JOIN c_acct_rpt r
  ON r.c_acct_rpt_id = g.c_acct_rpt_id
 AND r.name IN ('Pérdidas y Ganancias', 'Balance de Situación')
JOIN c_acctschema_element se
  ON se.c_acctschema_id = r.c_acctschema_id
 AND se.elementtype = 'AC'
 AND se.isactive = 'Y'
JOIN c_elementvalue ev
  ON ev.c_element_id = se.c_element_id
 AND ev.ad_client_id = :client_id
 AND ev.value = spec.acct_value
 AND ev.isactive = 'Y'
 AND ev.issummary = 'Y'
WHERE NOT EXISTS (
  SELECT 1 FROM c_acct_rpt_node n
  WHERE n.c_acct_rpt_group_id = g.c_acct_rpt_group_id
);
