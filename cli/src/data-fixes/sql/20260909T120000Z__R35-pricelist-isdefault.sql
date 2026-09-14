-- @id: R35-pricelist-isdefault
-- @gap: N5
-- @risk: low
-- @type: sql
-- @description: ETP-5245 — no M_PRICELIST row carries ISDEFAULT='Y' on an already-onboarded tenant (the GOClient dataset shipped both tariffs with 'N'), so every consumer that disambiguates tariffs with `isdefault DESC` silently falls through to an arbitrary list: the ETGO_PRODUCT_SALE_PRICE / ETGO_PRODUCT_PURCHASE_PRICE computed columns, the PriceListPicker, R33's standard-cost anchor, and the new ETP-5245 default-tariff resolver; marks exactly ONE active list per trade direction (sales / purchase) per client, and NEVER overrides a direction that already has one

-- Background
-- ----------
-- referencedata/sampledata/GOClient/M_PRICELIST.xml (module com.etendoerp.go) shipped both curated
-- tariffs with ISDEFAULT='N':
--   782B468DCC3948D69BC2AE5B68C3F4A4  "Tarifa de venta principal"   ISSOPRICELIST='Y'
--   F888E6AAB93E44E88433C21A8F3C0161  "Tarifa de compra principal"  ISSOPRICELIST='N'
-- M_PRICELIST *is* in OnboardingDatasetDefinition.INCLUDED_TABLES (line 92), so that XML is what a
-- new tenant actually gets — this is a defect in the CONTENT of the onboarding dataset, not a
-- missing provisioning step, hence the N series (see onboarding-gaps.md § N4 for the series
-- definition). The preventive front is that XML, already flipped to 'Y' in the same task.
--
-- Why the flag matters — four independent consumers, all of which degrade silently:
--   1. src-db/database/model/functions/ETGO_PRODUCT_SALE_PRICE.xml and
--      ETGO_PRODUCT_PURCHASE_PRICE.xml (com.etendoerp.go), line 15 of each:
--      `ORDER BY (pl.isdefault = 'Y') DESC, ...`. With no list flagged, that first key is constant
--      and the "Precio de venta" / "Precio de compra" columns of the Products list resolve through
--      the remaining keys — i.e. an arbitrary tariff on any tenant holding more than one.
--   2. tools/app-shell/src/components/contract-ui/PriceListPicker.jsx:70 —
--      `matches.find(p => p.default) || matches[0]`: the generic fallback never finds a default and
--      always lands on the first entry the API happened to return.
--   3. 20260903T120000Z__R33-standard-cost-anchor-unified.sql:334,351 —
--      `ORDER BY pl.isdefault DESC, plv.validfrom DESC, pl.created ASC` picks which tariff a
--      standard-cost anchor is priced from. A broken flag therefore degrades another of our own
--      fixes.
--   4. ETP-5245's new Java default-tariff resolver (sales + purchase), used to auto-create the
--      zero-price lines when a product is registered: with nothing flagged it has nothing to
--      resolve.
--
-- Scope of the flag: PER CLIENT × PER DIRECTION, not per organization
-- -------------------------------------------------------------------
-- m_pricelist does carry ad_org_id (and the only UNIQUE constraint is m_pricelist_name
-- (name, ad_org_id, ad_client_id) — nothing in the model or in any trigger enforces one default),
-- but every consumer above reads the flag WITHOUT an organization filter: the two computed-column
-- functions filter only on issopricelist, and PriceListPicker filters only on
-- `active !== false && salesPriceList === isSOTrx` over whatever the session can read. A per-org
-- interpretation ("one default per org") would therefore hand those consumers SEVERAL flagged rows
-- per direction on a multi-org tenant and put them right back to arbitrary tie-breaking — the exact
-- bug being fixed. So the invariant this fix establishes is: AT MOST ONE active default per
-- (ad_client_id, issopricelist), regardless of which org owns the row. Verified on the dev DB:
-- F&B International Group owns its 8 purchase tariffs across TWO orgs and QA Testing spreads its
-- lists over org '0' plus two operative orgs, and in both cases the picker/computed columns see the
-- whole client-level set.
--
-- Deterministic pick, in order (only reached when the direction has no default at all)
-- -----------------------------------------------------------------------------------
--   1. The tariff the tenant ACTUALLY transacts with — most referencing c_order + c_invoice rows.
--      This is the one an operator would name if asked, and it is what makes the choice defensible
--      on a legacy multi-tariff tenant instead of merely deterministic. On a GO tenant this key is
--      a no-op (one candidate per direction) and on a brand-new tenant it is 0 for everyone.
--   2. Has priced products in a version that is already valid (`validfrom <= now()`, joined through
--      m_productprice) — a default that resolves to no price is useless, and this mirrors the
--      `(plv.validfrom <= now()) DESC` key the computed-column functions already use.
--   3. Oldest `created` — on a GO tenant that is the tariff the onboarding dataset created first.
--   4. `m_pricelist_id ASC` — absolute tie-break. Two lists can share a `created` to the
--      millisecond (F&B's eight purchase tariffs are all 2013-07-05T02:45:43.5xx), so without this
--      key row_number() would be free to pick either one and the fix would not be reproducible.
--      All `_ID` columns are VARCHAR, so this is a plain textual ordering.
--
-- What this fix deliberately does NOT do
-- --------------------------------------
--   * It never touches a direction that already has an active default — that is an operator (or
--     upstream sample-data) decision, and silently re-pointing it would be worse than the gap.
--     Live example: QA Testing already flags "Customer A" as its sales default, so only its
--     purchase direction is marked here.
--   * It never de-duplicates a direction that has SEVERAL defaults. Choosing which of two
--     deliberate flags to clear is not a decision this fix can make; @report surfaces it instead.
--   * It never activates an inactive list. Only `isactive='Y'` rows are candidates, and only an
--     active default counts as "this direction is already resolved" — a direction whose only
--     flagged list has been deactivated is treated as unresolved and gets an active one marked.
--
-- Trigger safety: m_pricelist_trg (core, AFTER UPDATE) raises @IsTaxIncludedFlagWithDocuments@ only
-- when `istaxincluded` changes on a list referenced by an order/invoice/requisition. This fix
-- writes `isdefault`, `updated` and `updatedby` only, so the trigger's guard is never reached and
-- no row can fail the transaction. Verified against the live trigger body.
--
-- Idempotency: the `ranked` CTE is textually identical in @check and @apply, and its
-- `NOT EXISTS (... isdefault='Y' ...)` guard is the gate for both — so a re-run after success finds
-- every direction resolved, the CTE is empty and @check returns 0 rows => SKIPPED_NOT_NEEDED. The
-- @apply carries the same predicate plus a redundant `pl.isdefault = 'N'` as the defensive second
-- layer against partial/concurrent state. (This is the R22/N1 lesson R33 records: when the @check
-- gate and the @apply guard drift apart in SHAPE, the fix never converges and re-applies forever.)
--
-- ONBOARDING_PROVISIONED_THROUGH (OnboardingBaselineService, currently 2026-09-02 / R33
-- force-test-mode-selected-backfill) is deliberately NOT bumped, for the same reason as R34
-- fin-account-cleared-payment-accounts: with the sampledata XML fixed, a newborn tenant is born with
-- both tariffs flagged, so this fix's @check returns 0 rows for it and the runner records a clean
-- SKIPPED_NOT_NEEDED. That constant's contract reserves CUT bumps for fixes whose @check WOULD still
-- match on a correctly provisioned new tenant.
--
-- Live dry-run validation (2026-09-09, shared dev DB, one rolled-back transaction per tenant)
-- -------------------------------------------------------------------------------------------
-- Ran @check -> @apply -> @report -> @check again for all 5 non-System clients that own price
-- lists. Every tenant CONVERGES (post-apply @check = 0 rows in 5/5). Picks:
--   GOClient              sales "Tarifa de venta principal" / purchase "Tarifa de compra principal"
--                         (1 candidate per direction — the two dataset rows; @report silent)
--   E2E User 1 / User 2   same two dataset rows, 1 candidate per direction; @report silent
--   F&B International     sales "General Sales" (736 docs, 2 candidates) / purchase "Other
--                         services" (506 docs, 8 candidates) — key 1 decided both; @report lists
--                         both directions for review
--   QA Testing            purchase "Purchase" (15 docs, 9 candidates); SALES UNTOUCHED — @check
--                         returned only ONE row because that direction already flags "Customer A".
--                         @report still lists both directions, since both hold several active
--                         lists.
-- Worst-case runtime 59 ms for the whole check -> apply -> report -> re-check cycle (F&B, 10
-- candidate lists against ~1 200 orders+invoices).

-- @check
-- Returns one row per trade direction that has active price lists but NO active default.
-- 0 rows => SKIPPED_NOT_NEEDED, @apply never runs (tenant already resolved, or owns no price list).
WITH ranked AS (
  SELECT pl.m_pricelist_id,
         pl.issopricelist,
         row_number() OVER (
           PARTITION BY pl.issopricelist
           ORDER BY
             -- 1. the tariff the tenant actually transacts with
               (SELECT count(*) FROM c_order   o
                 WHERE o.ad_client_id = :client_id AND o.m_pricelist_id = pl.m_pricelist_id)
             + (SELECT count(*) FROM c_invoice i
                 WHERE i.ad_client_id = :client_id AND i.m_pricelist_id = pl.m_pricelist_id) DESC,
             -- 2. has priced products in an already-valid version
             (EXISTS (SELECT 1
                        FROM m_pricelist_version plv
                        JOIN m_productprice pp
                          ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
                         AND pp.isactive = 'Y'
                       WHERE plv.m_pricelist_id = pl.m_pricelist_id
                         AND plv.ad_client_id = :client_id
                         AND plv.isactive = 'Y'
                         AND plv.validfrom <= now())) DESC,
             -- 3. oldest first (on a GO tenant: the one the dataset created first)
             pl.created ASC,
             -- 4. absolute tie-break, reproducible across runs
             pl.m_pricelist_id ASC
         ) AS rn
    FROM m_pricelist pl
   WHERE pl.ad_client_id = :client_id
     AND pl.isactive = 'Y'
     AND NOT EXISTS (SELECT 1
                       FROM m_pricelist d
                      WHERE d.ad_client_id = :client_id
                        AND d.isactive = 'Y'
                        AND d.isdefault = 'Y'
                        AND d.issopricelist = pl.issopricelist)
)
SELECT r.issopricelist, r.m_pricelist_id
  FROM ranked r
 WHERE r.rn = 1;

-- @apply
-- The `ranked` CTE below is TEXTUALLY IDENTICAL to the one in @check — same candidate set, same
-- ordering, same "direction has no active default" gate — so the two can be eyeballed against each
-- other and cannot drift into a fix that never converges. `pl.isdefault = 'N'` is the redundant
-- defensive second layer.
WITH ranked AS (
  SELECT pl.m_pricelist_id,
         pl.issopricelist,
         row_number() OVER (
           PARTITION BY pl.issopricelist
           ORDER BY
             -- 1. the tariff the tenant actually transacts with
               (SELECT count(*) FROM c_order   o
                 WHERE o.ad_client_id = :client_id AND o.m_pricelist_id = pl.m_pricelist_id)
             + (SELECT count(*) FROM c_invoice i
                 WHERE i.ad_client_id = :client_id AND i.m_pricelist_id = pl.m_pricelist_id) DESC,
             -- 2. has priced products in an already-valid version
             (EXISTS (SELECT 1
                        FROM m_pricelist_version plv
                        JOIN m_productprice pp
                          ON pp.m_pricelist_version_id = plv.m_pricelist_version_id
                         AND pp.isactive = 'Y'
                       WHERE plv.m_pricelist_id = pl.m_pricelist_id
                         AND plv.ad_client_id = :client_id
                         AND plv.isactive = 'Y'
                         AND plv.validfrom <= now())) DESC,
             -- 3. oldest first (on a GO tenant: the one the dataset created first)
             pl.created ASC,
             -- 4. absolute tie-break, reproducible across runs
             pl.m_pricelist_id ASC
         ) AS rn
    FROM m_pricelist pl
   WHERE pl.ad_client_id = :client_id
     AND pl.isactive = 'Y'
     AND NOT EXISTS (SELECT 1
                       FROM m_pricelist d
                      WHERE d.ad_client_id = :client_id
                        AND d.isactive = 'Y'
                        AND d.isdefault = 'Y'
                        AND d.issopricelist = pl.issopricelist)
)
UPDATE m_pricelist pl
   SET isdefault = 'Y',
       updated   = now(),
       updatedby = '0'
  FROM ranked r
 WHERE r.m_pricelist_id = pl.m_pricelist_id
   AND r.rn = 1
   AND pl.ad_client_id = :client_id
   AND pl.isdefault = 'N';

-- @report
-- Read-only, runs after a successful @apply in the SAME transaction, so it describes the FINAL
-- state. It lists only the directions that still need a human look; a tenant whose two directions
-- each ended with exactly one active list and exactly one default (the GO shape) produces NO rows
-- and leaves `detail` null on the APPLIED ledger row.
--
-- Three reasons a direction shows up here:
--   * no active price list at all      -> nothing could be marked; create one, then force a re-run
--                                         with --fix R35-pricelist-isdefault
--   * more than one flagged default    -> pre-existing configuration this fix deliberately left
--                                         alone; an operator must clear the extra ones, because
--                                         the consumers listed in the header will keep
--                                         tie-breaking arbitrarily between them
--   * one default among N>1 lists      -> the direction was not forced to a single answer; either
--                                         the ranking above chose it or it was already flagged.
--                                         The report cannot tell those two apart (it reads the
--                                         final state, not the diff) and deliberately does not try
--                                         — either way the operator's job is the same: confirm it
--                                         is the intended tariff
-- A `marked_default = 0` row with active lists present would mean something raced the UPDATE and is
-- worth investigating — it cannot happen through this fix's own logic.
--
-- The two-row VALUES list is a literal, not a table: every table reference below is scoped to
-- :client_id.
SELECT CASE d.issopricelist WHEN 'Y' THEN 'sales' ELSE 'purchase' END AS direction,
       coalesce(s.active_lists, 0) AS active_price_lists,
       coalesce(s.defaults, 0)     AS marked_default,
       s.default_names             AS default_price_list,
       CASE
         WHEN coalesce(s.active_lists, 0) = 0
           THEN 'no active price list in this direction - nothing could be marked'
         WHEN coalesce(s.defaults, 0) = 0
           THEN 'still no default after apply - unexpected, investigate'
         WHEN s.defaults > 1
           THEN 'several price lists flagged default - pre-existing configuration, left untouched'
         ELSE 'one default among ' || s.active_lists
              || ' active price lists - confirm it is the intended tariff'
       END AS reason
  FROM (VALUES ('Y'::character(1)), ('N'::character(1))) AS d(issopricelist)
  LEFT JOIN (
        SELECT pl.issopricelist,
               count(*)                                             AS active_lists,
               count(*) FILTER (WHERE pl.isdefault = 'Y')           AS defaults,
               string_agg(pl.name, ', ' ORDER BY pl.name)
                 FILTER (WHERE pl.isdefault = 'Y')                  AS default_names
          FROM m_pricelist pl
         WHERE pl.ad_client_id = :client_id
           AND pl.isactive = 'Y'
         GROUP BY pl.issopricelist
       ) s ON s.issopricelist = d.issopricelist
 WHERE coalesce(s.active_lists, 0) <> 1
    OR coalesce(s.defaults, 0) <> 1
 ORDER BY 1;
