-- @id: R6-org-info-location
-- @gap: F2
-- @risk: low
-- @type: sql
-- @description: Give the onboarding organization an AD_ORGINFO that points to a C_LOCATION with a country (Spain/ES) so the tax engine can resolve taxes, for tenants onboarded before this wiring existed
--
-- Hand-built, FROZEN migration. Etendo's tax engine resolves the applicable taxes
-- for an organization from the country of the location referenced by its
-- AD_ORGINFO record. The onboarding dataset import creates an AD_ORGINFO row for
-- the new org (AD_ORGINFO is in the dataset's included tables) but leaves
-- c_location_id NULL, so taxes cannot be computed. The web onboarding form gathers
-- a country/address, but earlier endpoint versions dropped it on the floor. The
-- preventive fix now wires a located C_LOCATION at onboarding time
-- (OnboardingOrgInfoService, defaulting to Spain when the form sends no country);
-- this corrective closes the same gap for tenants already onboarded.
--
-- Target org: the tenant's onboarding legal-entity org is the single non-star org
-- ('*' is the client-level summary org). A freshly onboarded tenant has exactly one
-- such org; we pick the earliest-created one deterministically.
--
-- @uuid_<KEY>@ scheme: the runner makes a temp copy and replaces every label with a
-- fresh per-tenant id (same KEY => same id, so the C_LOCATION -> AD_ORGINFO link stays
-- intact). A new tenant gets a brand-new id => ZERO cross-client references.
-- :client_id is baked per tenant; the org and country are resolved from the tenant's
-- own data / the stock country catalog rather than assumed.
--
-- Country: defaulted to Spain (c_country.countrycode = 'ES', id '106' in stock Etendo),
-- resolved by ISO code so it works regardless of the numeric id, with a fallback to any
-- active country should 'ES' be absent. This mirrors OnboardingOrgInfoService's default.
--
-- Idempotency: guarded per row. Step 2 (UPDATE) only touches an AD_ORGINFO whose
-- location is NULL; step 3 (INSERT) only fires when the org has no AD_ORGINFO at all
-- (defensive — the import normally creates one). Step 1 inserts the location only when
-- one of those two states holds, so a re-run after success is a no-op. The whole @apply
-- runs in ONE transaction (runner wraps BEGIN/COMMIT); on failure it rolls back.

-- @check
-- Needs the fix when the tenant's onboarding org has an AD_ORGINFO with no location,
-- or has no AD_ORGINFO at all.
SELECT 1
FROM ad_org o
WHERE o.ad_client_id = :client_id
  AND o.name <> '*'
  AND (
    EXISTS (SELECT 1 FROM ad_orginfo oi
              WHERE oi.ad_org_id = o.ad_org_id AND oi.c_location_id IS NULL)
    OR NOT EXISTS (SELECT 1 FROM ad_orginfo oi WHERE oi.ad_org_id = o.ad_org_id)
  );

-- @apply
-- Order (parent first; AD_ORGINFO links to the location):
--   1. C_LOCATION    (the org's physical address, country = Spain)
--   2. UPDATE AD_ORGINFO  (link the location when an org-info exists but is unlocated)
--   3. INSERT AD_ORGINFO  (create a located org-info only if none exists at all)

-- 1. C_LOCATION for the onboarding org. Country resolved by ISO 'ES' (Spain), falling
--    back to any active country. ad_org_id mirrors the onboarding legal-entity org.
INSERT INTO c_location (c_location_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, c_country_id)
SELECT '@uuid_R6LOC@', :client_id, tgt.ad_org_id, 'Y', now(), '0', now(), '0',
       COALESCE(
         (SELECT c.c_country_id FROM c_country c WHERE c.countrycode = 'ES' ORDER BY c.c_country_id LIMIT 1),
         (SELECT c.c_country_id FROM c_country c WHERE c.isactive = 'Y' ORDER BY c.c_country_id LIMIT 1))
FROM (SELECT o.ad_org_id FROM ad_org o
        WHERE o.ad_client_id = :client_id AND o.name <> '*'
        ORDER BY o.created, o.ad_org_id LIMIT 1) tgt
WHERE EXISTS (SELECT 1 FROM ad_orginfo oi
                WHERE oi.ad_org_id = tgt.ad_org_id AND oi.c_location_id IS NULL)
   OR NOT EXISTS (SELECT 1 FROM ad_orginfo oi WHERE oi.ad_org_id = tgt.ad_org_id);

-- 2. Link the fresh location to the org's EXISTING org-info (the import's unlocated row).
UPDATE ad_orginfo oi
SET c_location_id = '@uuid_R6LOC@', updated = now(), updatedby = '0'
WHERE oi.ad_client_id = :client_id
  AND oi.c_location_id IS NULL
  AND oi.ad_org_id = (SELECT o.ad_org_id FROM ad_org o
                        WHERE o.ad_client_id = :client_id AND o.name <> '*'
                        ORDER BY o.created, o.ad_org_id LIMIT 1);

-- 3. Create a located org-info only if the org has none at all. AD_ORGINFO's PK is the
--    org id (1:1 with the org). taxid is NOT NULL with no DB default; '?' matches the
--    placeholder the dataset import writes. Other NOT NULL em_* columns carry DB defaults.
INSERT INTO ad_orginfo (ad_org_id, ad_client_id, isactive, created, createdby, updated, updatedby, taxid, c_location_id)
SELECT tgt.ad_org_id, :client_id, 'Y', now(), '0', now(), '0', '?', '@uuid_R6LOC@'
FROM (SELECT o.ad_org_id FROM ad_org o
        WHERE o.ad_client_id = :client_id AND o.name <> '*'
        ORDER BY o.created, o.ad_org_id LIMIT 1) tgt
WHERE NOT EXISTS (SELECT 1 FROM ad_orginfo oi WHERE oi.ad_org_id = tgt.ad_org_id);
