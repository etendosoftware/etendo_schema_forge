-- @id: R46-acct-rpt-definitions-redelivery
-- @gap: ETP-5013
-- @risk: low
-- @type: sql
-- @description: Re-deliver R26-acct-rpt-definitions: create the "Pérdidas y Ganancias" and "Balance de Situación" accounting-report definitions (C_Acct_Rpt + C_Acct_Rpt_Group + C_Acct_Rpt_Node) for every active accounting schema of tenants that R26 never reached because their baseline watermark was newer than R26

-- Context (ETP-5013, re-delivery of 20260828T120000Z__R26-acct-rpt-definitions)
-- --------------------------------------------------------------------------------------------
-- WHY THIS FIX EXISTS. R26-acct-rpt-definitions is correct and stays untouched (applied fixes are
-- immutable), but it never ran for a class of tenants. The runner computes a per-tenant watermark
-- (newest of the __baseline__ row and every processed fix) and silently skips any fix whose
-- timestamp is <= that watermark, without even running @check. A tenant onboarded after the
-- onboarding cut (ONBOARDING_PROVISIONED_THROUGH, OnboardingBaselineService.java) gets a BASELINE
-- row at that cut, so every fix older than it is treated as "born corrected".
--
-- R26's "preventive twin" claim (tenants provisioned from the GOClient dataset get the rows from
-- the sampledata XML) was FALSE until 2026-09-15: C_ACCT_RPT / C_ACCT_RPT_GROUP / C_ACCT_RPT_NODE
-- were only added to OnboardingDatasetDefinition.java then (f4f444382, ETP-4899). Tenants
-- onboarded between the baseline cut and that date got neither the dataset rows nor R26 (it sat
-- below their watermark), so they have no accounting-report definitions.
--
-- The logic below is R26 verbatim (same @check, same @apply). It is keyed on natural business keys
-- (report: name + schema; group: name + parent report; node: parent group), so tenants that
-- already have the reports - from R26, from the dataset, or from standard Etendo reference data -
-- are a no-op (@check returns 0 rows -> SKIPPED_NOT_NEEDED). Tenants onboarded after 2026-09-15
-- import the rows via the dataset and are likewise a no-op. See the R26 file for the full design
-- rationale (account lookup through schema -> 'AC' element -> value, per-schema scope, why
-- get_uuid() instead of @uuid_KEY@, why the NOT EXISTS guards are the only idempotency protection).

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
