-- @id: R37-acctdim-bp-pr-locked-active
-- @gap: K2
-- @risk: low
-- @type: sql
-- @description: Force C_AcctSchema_Element.IsActive='Y' and IsMandatory='Y' for the BP (Contacto) and PR (Producto) accounting-dimension elements of every accounting schema of a client, matching the product decision that these two dimensions are never optional/hideable (ETP-4879).

-- ETP-4879 — new gap-label series K2 (companion to K1/ETP-4854, same K "Accounting
-- Dimension Display Configuration" family, a distinct sub-gap).
--
-- PRODUCT DECISION (Santiago, ETP-4879): Contacto (BP) and Producto (PR) are no
-- editable (y no visible) y siempre en true. Project (PJ) and Cost Center (CC)
-- stay editable, false by default — unchanged, out of scope here.
--
-- CODE-SIDE HALF ALREADY SHIPPED (com.etendoerp.go, this branch, NOT touched by this
-- fix): `GeneralLedgerConfigurationHandler.LOCKED_DIMENSION_TYPES = ["BP", "PR"]` —
-- `buildDimensions()` no longer returns BP/PR rows to the frontend at all, and
-- `applyDimensionChanges()` silently ignores any attempt to toggle their `active` flag
-- regardless of `mandatory`. That makes the "Dimensiones contables" screen consistent
-- with every consumer window (Assets, Financial Account, Amortization), which already
-- hardcode Contacto/Producto as always-visible and never read this config's flags.
--
-- WHY A DATA-FIX IS STILL NEEDED: the code lock only stops FUTURE edits through this
-- one screen. It says nothing about the stored DB state, which other/future consumers
-- (Classic core itself, or any later NEO Headless display-logic mirror) may still read.
-- "Siempre en true" is now the actual business rule, so the DB should reflect that
-- truth regardless of which windows currently look at it.
--
-- DB-STATE INVESTIGATION (2026-09-17, this DB, confirmed by query before writing this
-- fix — never assumed):
--   * IsActive: ALREADY 'Y' for every single BP/PR row that exists (98/98 BP rows,
--     98/98 PR rows, across all 96 clients that have an accounting schema at all) —
--     matches the `C_AcctSchema_Element.isactive` AD-standard default ('Y') noted in
--     R23/K1. So the IsActive half of this fix is a NO-OP on the current fleet; it is
--     shipped anyway as the correctness guard for any future client that could somehow
--     end up with 'N' (e.g. a hand-edited row, or a classic-core screen this repo does
--     not control).
--   * IsMandatory: 'N' for EVERY single BP/PR row on the fleet (196/196) — never forced
--     anywhere before. This IS the real corrective content of this fix.
--   * 2 client ids (both throwaway "E2E User 1 ..." Playwright test tenants) have ZERO
--     accounting-schema rows at all (no C_AcctSchema, no C_AcctSchema_Element of any
--     type) — they never completed accounting onboarding. Out of scope: that is the
--     pre-existing A1/A2 "chart of accounts missing" gap, not this one. This fix's
--     `@check`/`@apply` naturally return 0 rows for them (nothing to join against), so
--     they correctly report SKIPPED_NOT_NEEDED rather than erroring.
--
-- SAFETY OF FORCING IsMandatory='Y' (confirmed by reading every consumer, not assumed):
--   * `GeneralLedgerConfigurationHandler.applyDimensionChanges` checks `isMandatory()`
--     ONLY inside the `!LOCKED_DIMENSION_TYPES.contains(row.getType())` branch — for
--     BP/PR that branch is never entered at all, so the mandatory flag is provably dead
--     code for these two types in the one place that used to read it for them.
--   * Classic core: `AcctSchemaElement.getAcctSchemaElementList` (legacy
--     src/org/openbravo/erpCommon/ad_forms/AcctSchemaElement.java) reads `ismandatory`
--     only to emit a DEBUG log line ("no default value for <name>") when a mandatory
--     element has no default account configured — no exception thrown, no posting
--     behavior affected. `Fact.java`/`FactLine.java` (the actual posting/balancing
--     engine) read only `m_balanced` off this list, never `m_mandatory`.
--   * `COAUtility`/`InitialSetupUtility.insertAcctSchemaElement` (new-schema creation)
--     hardcodes BP/PR to `isMandatory=false` by DESIGN (only OO/AC are true) — that is
--     the classic multi-entity "posting requires an org and an account, not necessarily
--     a partner/product" rule, which this fix does not change or contradict: no posting
--     validation anywhere enforces AcctSchemaElement.IsMandatory for BP/PR.
--   Conclusion: forcing IsMandatory='Y' is safe, correctly encodes "siempre en true" at
--   the semantic level (mandatory, not just active), and is genuine defense-in-depth,
--   not merely cosmetic.
--
-- NEW-TENANT (preventive) CHECK: `com.etendoerp.go/referencedata/sampledata/GOClient/
-- C_ACCTSCHEMA_ELEMENT.xml` (imported into every new tenant via
-- `OnboardingDatasetDefinition.INCLUDED_TABLES`) already ships BP/PR with
-- `ISACTIVE=Y` — so a new tenant is already born correct on that half, matching the
-- fleet-wide finding above. `ISMANDATORY` in that same seed XML was 'N' for BP/PR and
-- has been corrected to 'Y' in the SAME commit as this fix (small preventive
-- companion, dataset-only, no new onboarding Java service needed — mirrors the R29/A9/
-- N4 "dataset-only fix, no CUT bump" precedent). Because a new tenant is therefore
-- ALREADY born correct on both flags, `ONBOARDING_PROVISIONED_THROUGH` is deliberately
-- NOT bumped: this fix's own `@check` already converges to 0 rows for any
-- freshly-onboarded tenant, a clean SKIPPED_NOT_NEEDED — exactly the case that
-- constant's contract excludes from a bump (same reasoning as A9/N4's "no CUT bump,
-- newborn tenant already correct").
--
-- Both columns are updated in ONE statement, in the SAME transaction as the ledger
-- write (framework guarantee) — a client is never left with only one of the two flags
-- corrected.

-- @check
-- Returns >=1 row when at least one BP/PR element for this client still needs a flag
-- corrected. 0 rows => already fully 'Y'/'Y' on both types (or the client has no
-- accounting schema at all) => SKIPPED_NOT_NEEDED, @apply never runs.
SELECT 1
FROM c_acctschema_element e
WHERE e.ad_client_id = :client_id
  AND e.elementtype IN ('BP', 'PR')
  AND (e.isactive IS DISTINCT FROM 'Y' OR e.ismandatory IS DISTINCT FROM 'Y');

-- @apply
-- Guarded by IS DISTINCT FROM (2nd idempotency layer): only rows that would actually
-- change are touched; a re-run after a partial/previous success updates nothing more.
UPDATE c_acctschema_element e
SET isactive = 'Y',
    ismandatory = 'Y',
    updated = now(),
    updatedby = '0'
WHERE e.ad_client_id = :client_id
  AND e.elementtype IN ('BP', 'PR')
  AND (e.isactive IS DISTINCT FROM 'Y' OR e.ismandatory IS DISTINCT FROM 'Y');
