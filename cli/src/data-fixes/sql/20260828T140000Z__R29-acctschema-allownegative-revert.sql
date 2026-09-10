-- @id: R29-acctschema-allownegative-revert
-- @gap: A3
-- @risk: low
-- @type: sql
-- @description: Revert C_ACCTSCHEMA.AllowNegative back to N (unchecked) — ETP-4947 supersedes the Y default that R10/ETP-4245 introduced. IsCentrallyMaintained is explicitly OUT of scope and is left untouched by this fix.

-- NOTE (2026-08-28): this reverses ONLY the AllowNegative portion of gap A3
-- (20260706T120000Z__R10-accounting-schema-dimensions.sql). R10 itself is NOT
-- retired — its other two effects (IsCentrallyMaintained=Y and the CC/U1/U2
-- accounting-dimension rows) remain correct and in force. The AllowNegative=Y
-- default was justified at the time by Confluence Test Plan case TC-38; TC-38
-- is being retired/superseded directly by the ticket owner (Santiago Gremiger)
-- in Confluence as part of ETP-4947, which is now the accepted requirement:
-- AllowNegative must default to N (unchecked), remaining user-editable.
--
-- Scope: ALL tenants unconditionally, no "was this manually set" guard. R10
-- itself force-set every tenant to 'Y' only ~7 weeks before this fix
-- (2026-07-06), so there is no population of tenants who could have
-- genuinely opted into 'Y' independent of that fix — reverting fully simply
-- undoes an unwanted onboarding default. See
-- docs/etendo-ad/tenant-remediation-knowledge.md (ETP-4947 section) for the
-- full investigation trail.
--
-- Labeled R29 (not R28): two sibling in-flight branches (feature/ETP-4706,
-- feature/ETP-5019) already claim R28 with different timestamps
-- (20260828T120000Z and 20260827T120000Z respectively), neither merged yet.
-- Confirmed via `git ls-tree` across all local branches/worktrees before
-- picking this label. This fix's timestamp (20260828T140000Z) is strictly
-- after BOTH of theirs, so no collision occurs regardless of merge order.

-- @check
-- Returns >=1 row when the tenant still has the unwanted AllowNegative=Y
-- default. 0 rows => tenant has no schema yet (nothing to do here) or is
-- already N (never got R10, or already reverted).
SELECT 1
FROM c_acctschema s
WHERE s.ad_client_id = :client_id
  AND s.allownegative = 'Y'
LIMIT 1;

-- @apply
-- Guarded by the WHERE clause itself (second idempotency layer): re-running
-- after a successful apply matches zero rows since none remain 'Y'.
UPDATE c_acctschema
SET allownegative = 'N',
    updated = now(),
    updatedby = '0'
WHERE ad_client_id = :client_id
  AND allownegative = 'Y';
