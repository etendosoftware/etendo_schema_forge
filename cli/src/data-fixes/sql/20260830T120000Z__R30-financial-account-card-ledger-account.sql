-- @id: R30-financial-account-card-ledger-account
-- @gap: A6
-- @risk: medium
-- @type: sql
-- @description: Provision the new "57210 - Tarjetas de crédito, euros" ledger account (sibling of 57200, group 5721 sibling of 5720) for tenants that already have a PGC-shaped 572 chain, mirroring ETP-4872's preventive onboarding-dataset addition (see NAME/DESCRIPTION below for the correctly-accented Spanish text)

-- Background
-- ----------
-- ETP-4872 adds accounting defaults for the new Tarjeta/Card FIN_FinancialAccount type.
-- Those defaults need a NEW ledger account, 57210 ("Tarjetas de crédito, euros"), as a
-- sibling of the existing 57200 bank account under the 572 group ("Bancos e instituciones
-- de crédito c/c vista euros"). The preventive front (Task 5, ETP-4872) already shipped
-- this for NEW tenants via the GOClient onboarding sampledata
-- (com.etendoerp.go branch feat/ledger-account-57210, referencedata/sampledata/GOClient/
-- {C_ELEMENTVALUE,C_ELEMENTVALUE_TRL,C_VALIDCOMBINATION,AD_TREENODE}.xml). This is the
-- corrective twin for tenants already onboarded before that ships.
--
-- Structural facts verified live against the shared dev DB (go.experimental.etendo.cloud-
-- backed environment) on 2026-08-30, across every real tenant with a wired AC element that
-- carries a 572 family (GOClient, F&B International Group, QA Testing, SantoEmpresa; also
-- 16 lower-priority E2E/demo clients with the identical shape) -- NOT assumed from the
-- preventive-side XML or from the R8 migration file alone, since neither represents this
-- population by itself:
--
-- 1. The tree is 3 levels, not 2: 572 (group, issummary=Y, elementlevel=C) -> 5720
--    (subgroup, issummary=Y, elementlevel=D) -> 57200 leaf (issummary=N, elementlevel=S).
--    This fix therefore creates a NEW 5721 subgroup (sibling of 5720, same parent 572)
--    before the new 57210 leaf (sibling of 57200, parented under 5721) -- not a leaf
--    hung directly off 572.
--
-- 2. C_ELEMENTVALUE.VALUE width for the existing 57200 leaf is NOT uniform fleet-wide:
--    18 of 20 real tenants (incl. GOClient, SantoEmpresa) carry the R8-padded 8-digit form
--    ("57200000"); 2 (F&B International Group, QA Testing) never got R8 applied and still
--    carry the plain 5-digit PGC form ("57200"). No third width exists (verified via
--    GROUP BY length(value) across every 572% issummary='N' row on this DB: only 5 and 8).
--    This fix derives the new leaf's value from the tenant's OWN existing 57200 sibling
--    ('57210' vs '57210000') rather than assuming one convention -- hardcoding either width
--    would silently corrupt half the fleet. The new 5721 subgroup is NOT width-variable
--    (group/subgroup codes are always 3/4-digit regardless of R8; only leaf codes were
--    padded) so it is always inserted as the literal '5721'.
--
-- 3. C_VALIDCOMBINATION.ALIAS/COMBINATION do NOT track C_ELEMENTVALUE.VALUE's width even
--    on tenants where the leaf itself is 8-digit: GOClient/SantoEmpresa's OWN existing
--    57200000 leaf has ALIAS=COMBINATION='57200' (5-digit), not '57200000'. This is an
--    artifact of R8 (the 8-digit padding migration) evidently having run with the
--    C_ElementValue_trg() UPDATE branch not firing (bulk migration, likely triggers
--    disabled) -- it never widened the pre-existing combinations. The standard core
--    C_ElementValue_trg() (fires on THIS fix's own INSERT, confirmed reliable within one
--    plain-SQL transaction per the R9/ETP-4402 precedent) auto-creates ONE
--    C_VALIDCOMBINATION per C_AcctSchema wired to the element, but with
--    ALIAS=COMBINATION=new.VALUE verbatim (the FULL, possibly-8-digit value) -- so on an
--    8-digit tenant it would insert '57210000', inconsistent with the sibling 57200's own
--    '57200' shape on the very same chart. Step E below normalizes it to LEFT(value, 5) to
--    match the tenant's own established combination-naming convention (a no-op on 5-digit
--    tenants, where LEFT(value,5) already equals value).
--
-- 4. Two-C_Element hazard (GOClient-specific, documented precedent from ETP-4402): GOClient
--    carries a SECOND, orphan 572 chain under the non-load-bearing "GOOrg Account Tree"
--    element (91D04C02EF8F4975B9E4F5E07543B6EA), which is not wired to any C_AcctSchema.
--    Every statement below resolves the target element ONLY via
--    C_AcctSchema_Element.elementtype='AC' (never a bare "value='572'" match), so the
--    orphan chain is never touched -- confirmed live: GOClient's wired element is
--    BB9B64C5B6534A40A36F7C0F45C2CC0B only.
--
-- Column values (accounttype/accountsign/isdoccontrolled/postactual/postbudget/
-- postencumbrance/poststatistical/isbankaccount/isforeigncurrency/showelement/
-- showvaluecond/isalwaysshown) are hardcoded, not copied from a sibling row: verified
-- 100% uniform across all 20 sampled tenants' own 5720/57200(000) rows before hardcoding
-- (same pattern R9-bp-category-seed used for its own flag set). Name/description:
-- "Tarjetas de crédito, euros", matching the preventive XML's Spanish text (mirrored, not
-- independently invented -- see ETP-4872 plan Task 6 note on staying byte-identical to
-- Task 5's definition).
--
-- Idempotency
-- -----------
-- Each c_elementvalue INSERT is guarded by NOT EXISTS on (c_element_id, value) -- the same
-- UNIQUE constraint the table enforces -- so a re-run never re-inserts (and never re-fires
-- the element trigger). The 2 treenode reparent UPDATEs are guarded by IS DISTINCT FROM,
-- so a re-run after success is a no-op; if the new element was never created for a tenant
-- (no matching 572/5720/57200 sibling to key off) the joins find nothing and silently no-op
-- too. The combination-normalize UPDATE (Step E) is also IS DISTINCT FROM guarded. Every
-- statement is scoped to :client_id (both @check and @apply). PKs minted with
-- @uuid_<KEY>@.

-- @check
-- Needs the fix when the tenant has a PGC-shaped 572 chain (a 57200/57200000 leaf under an
-- element actually wired to one of its accounting schemas via C_AcctSchema_Element) but no
-- 57210/57210000 sibling yet under that SAME element.
SELECT 1
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id
                             AND ae.elementtype = 'AC'
                             AND ae.isactive = 'Y'
JOIN c_elementvalue sib ON sib.c_element_id = ae.c_element_id
                        AND sib.value IN ('57200', '57200000')
                        AND sib.issummary = 'N'
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (
    SELECT 1 FROM c_elementvalue x
    WHERE x.c_element_id = ae.c_element_id
      AND x.value IN ('57210', '57210000')
  )
LIMIT 1;

-- @apply

-- Step A: insert the "5721" subgroup (sibling of 5720, same parent as 5720: "572"), under
-- ONLY the element actually wired to this tenant's accounting schema(s). Fires the standard
-- C_ElementValue_trg (translation rows for every active language; treenode row attached to
-- the tree ROOT, corrected in Step C below). elementlevel='D' -> no C_VALIDCOMBINATION is
-- auto-created for this row (only 'S' leaves get one).
INSERT INTO c_elementvalue (
  c_elementvalue_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, description, accounttype, accountsign, isdoccontrolled, c_element_id,
  issummary, postactual, postbudget, postencumbrance, poststatistical, isbankaccount,
  isforeigncurrency, showelement, showvaluecond, elementlevel, isalwaysshown
)
SELECT '@uuid_5721SUBGROUP@', :client_id, sib.ad_org_id, 'Y', now(), '0', now(), '0',
  '5721', 'Tarjetas de crédito, euros', 'Tarjetas de crédito, euros',
  'A', 'D', 'N', ae.c_element_id,
  'Y', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'D', 'N'
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id
                             AND ae.elementtype = 'AC'
                             AND ae.isactive = 'Y'
JOIN c_elementvalue sib ON sib.c_element_id = ae.c_element_id AND sib.value IN ('57200', '57200000') AND sib.issummary = 'N'
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_elementvalue x WHERE x.c_element_id = ae.c_element_id AND x.value = '5721')
ORDER BY ae.c_element_id
LIMIT 1;

-- Step B: insert the "57210"/"57210000" leaf (width mirrors the tenant's own 57200 sibling,
-- see Background point 2), parented conceptually under the new "5721" (reparented in Step D
-- below). elementlevel='S' -> C_ElementValue_trg auto-creates C_VALIDCOMBINATION for every
-- C_AcctSchema wired to this element (Step E then normalizes its alias/combination width).
INSERT INTO c_elementvalue (
  c_elementvalue_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
  value, name, description, accounttype, accountsign, isdoccontrolled, c_element_id,
  issummary, postactual, postbudget, postencumbrance, poststatistical, isbankaccount,
  isforeigncurrency, showelement, showvaluecond, elementlevel, isalwaysshown
)
SELECT '@uuid_57210LEAF@', :client_id, sib.ad_org_id, 'Y', now(), '0', now(), '0',
  CASE sib.value WHEN '57200000' THEN '57210000' ELSE '57210' END,
  'Tarjetas de crédito, euros', 'Tarjetas de crédito, euros',
  'A', 'D', 'Y', ae.c_element_id,
  'N', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'S', 'N'
FROM c_acctschema s
JOIN c_acctschema_element ae ON ae.c_acctschema_id = s.c_acctschema_id
                             AND ae.elementtype = 'AC'
                             AND ae.isactive = 'Y'
JOIN c_elementvalue sib ON sib.c_element_id = ae.c_element_id AND sib.value IN ('57200', '57200000') AND sib.issummary = 'N'
WHERE s.ad_client_id = :client_id
  AND NOT EXISTS (SELECT 1 FROM c_elementvalue x WHERE x.c_element_id = ae.c_element_id AND x.value IN ('57210', '57210000'))
ORDER BY ae.c_element_id
LIMIT 1;

-- Step C: re-parent the "5721" treenode the trigger just attached to the tree ROOT onto
-- "572"'s own node (mirroring exactly where the sibling "5720" node sits). Resolved by
-- VALUE + matching c_element_id (never by remembering the @uuid_ token) so this is safe to
-- re-run even after a prior partial application.
UPDATE ad_treenode tn
SET parent_id = ev572.c_elementvalue_id, updated = now(), updatedby = '0'
FROM c_elementvalue ev5721, c_elementvalue ev572
WHERE tn.node_id = ev5721.c_elementvalue_id
  AND ev5721.ad_client_id = :client_id AND ev5721.value = '5721'
  AND ev572.ad_client_id = :client_id AND ev572.value = '572' AND ev572.c_element_id = ev5721.c_element_id
  AND tn.parent_id IS DISTINCT FROM ev572.c_elementvalue_id;

-- Step D: re-parent the new leaf's treenode onto "5721" (mirroring where "57200"/"57200000"
-- sits under "5720").
UPDATE ad_treenode tn
SET parent_id = ev5721.c_elementvalue_id, updated = now(), updatedby = '0'
FROM c_elementvalue evleaf, c_elementvalue ev5721
WHERE tn.node_id = evleaf.c_elementvalue_id
  AND evleaf.ad_client_id = :client_id AND evleaf.value IN ('57210', '57210000')
  AND ev5721.ad_client_id = :client_id AND ev5721.value = '5721' AND ev5721.c_element_id = evleaf.c_element_id
  AND tn.parent_id IS DISTINCT FROM ev5721.c_elementvalue_id;

-- Step E: normalize the width of the C_VALIDCOMBINATION the trigger auto-created for the
-- new leaf in Step B (see Background point 3) -- LEFT(value, 5) matches the tenant's own
-- established convention (a no-op on 5-digit tenants).
UPDATE c_validcombination vc
SET alias = LEFT(ev.value, 5), combination = LEFT(ev.value, 5), updated = now(), updatedby = '0'
FROM c_elementvalue ev
WHERE vc.account_id = ev.c_elementvalue_id
  AND vc.ad_client_id = :client_id
  AND ev.ad_client_id = :client_id
  AND ev.value IN ('57210', '57210000')
  AND (vc.alias IS DISTINCT FROM LEFT(ev.value, 5) OR vc.combination IS DISTINCT FROM LEFT(ev.value, 5));
