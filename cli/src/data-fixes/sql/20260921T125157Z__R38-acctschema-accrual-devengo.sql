-- @id: R38-acctschema-accrual-devengo
-- @gap: ETP-5372
-- @risk: low
-- @type: sql
-- @description: Force C_AcctSchema.IsAccrual='Y' (Devengo) for every accounting schema of a client — Etendo Go doesn't support Caja (cash-basis) for taxes, and this flag must never be anything else.

-- ETP-5372 — "Criterio Contable" (accrual) is hidden in the Esquema Contable window and
-- internally fixed to Devengo. Etendo Go doesn't support Caja (cash-basis) for taxes.
--
-- CODE-SIDE HALF ALREADY SHIPPED (com.etendoerp.go + schema_forge, same epic, NOT
-- touched by this fix): `decisions.json` reclassifies `accrual` as `system`-visibility
-- (dropped from the custom "General" tab and from `contract.mcp.json`'s writable
-- fields), and `GeneralLedgerConfigurationHandler.applyGeneralChanges()` no longer
-- reads/applies a client-supplied `accrual` value at all — `buildGeneral()` still
-- reports the current persisted value (read-only), but nothing can flip it anymore
-- through this window or through a raw NEO write on this entity.
--
-- WHY A DATA-FIX IS STILL NEEDED: the code lock only stops FUTURE writes through this
-- one handler. Before this fix shipped, the field was a plain editable select with no
-- server-side validation, so any tenant that ever toggled it to "Caja" would have kept
-- `IsAccrual='N'` in the DB regardless of the code fix — the code change does nothing
-- to correct data that is already wrong.
--
-- DB-STATE INVESTIGATION (2026-09-21, experimental DB, confirmed by query before
-- writing this fix — never assumed):
--   SELECT count(*) FROM c_acctschema WHERE isaccrual = 'N';  -- 0
--   SELECT count(*) FROM c_acctschema;                         -- 104
--   Every accounting schema in THIS environment is already 'Y'. That is one snapshot
--   of one environment, not proof for the whole fleet (each environment — dev,
--   staging, production — has its own database) — hence this fix ships as the
--   correctness guard for any client on any environment that could have drifted,
--   exactly the same reasoning as R37/K2's IsActive half (shipped as a no-op guard
--   there, confirmed no-op here too, on the one environment checked so far).
--
-- NEW-TENANT (preventive) CHECK: `com.etendoerp.go/referencedata/sampledata/GOClient/
-- C_ACCTSCHEMA.xml` (imported into every new tenant via
-- `OnboardingDatasetDefinition.INCLUDED_TABLES`) already ships `ISACCRUAL=Y` — a new
-- tenant is already born correct, confirmed both by reading the XML and by the DB
-- check above (0/104). `ONBOARDING_PROVISIONED_THROUGH` is deliberately NOT bumped:
-- this fix's own `@check` already converges to 0 rows for any freshly-onboarded
-- tenant, a clean SKIPPED_NOT_NEEDED (same "no CUT bump, newborn tenant already
-- correct" precedent as A9/N4/K2).

-- @check
-- Returns >=1 row when at least one accounting schema of this client is not already
-- 'Y' (covers 'N' and, defensively, NULL). 0 rows => already fully 'Y', or the client
-- has no accounting schema at all => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_acctschema s
WHERE s.ad_client_id = :client_id
  AND s.isaccrual IS DISTINCT FROM 'Y';

-- @apply
-- Guarded by IS DISTINCT FROM (2nd idempotency layer): only rows that would actually
-- change are touched; a re-run after a partial/previous success updates nothing more.
UPDATE c_acctschema s
SET isaccrual = 'Y',
    updated = now(),
    updatedby = '0'
WHERE s.ad_client_id = :client_id
  AND s.isaccrual IS DISTINCT FROM 'Y';
