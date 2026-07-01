-- @id: R4-default-customer-location
-- @gap: F1
-- @risk: low
-- @type: sql
-- @description: Give the onboarding default customer a currency (EUR), a billing/shipping address (C_LOCATION + C_BPARTNER_LOCATION) and a linked contact (AD_USER) for tenants onboarded before this wiring existed
--
-- Hand-built, FROZEN migration. The synthetic "Default Customer" BP
-- (c_bpartner.value = 'ONBOARDING_DEFAULT_CUSTOMER') is created by
-- OnboardingDefaultCustomerService so a demo Sales Invoice has a counterparty.
-- Early versions of that service created ONLY the bare BP: no address and no
-- contact. A BP with no C_BPARTNER_LOCATION cannot be used as bill-to/ship-to on
-- a Sales Invoice, and with no AD_USER contact it is not a fully set-up partner.
-- The preventive fix now provisions both at onboarding time
-- (ensureDefaultCustomerLocation + ensureDefaultCustomerContact); this corrective
-- closes the same gap for tenants already onboarded.
--
-- @uuid_<KEY>@ scheme: the runner makes a temp copy and replaces every label with
-- a fresh per-tenant id (same KEY => same id, so the C_LOCATION -> C_BPARTNER_LOCATION
-- link stays intact). A new tenant gets a brand-new id set => ZERO cross-client
-- references. :client_id is baked per tenant; the org and country are resolved
-- from the tenant's own data (see below) rather than assumed.
--
-- Idempotency: unlike R1/R3 this fix DOES carry per-row guards. There is no
-- pre-existing address with a colliding natural key to falsely match (the default
-- customer simply has none), so the guards are safe and make each step independently
-- re-runnable. The contact step is two-pronged because Etendo does NOT auto-create a
-- contact for this BP, but a tenant MAY have a manually-created one that is not linked
-- to any address: step 3 first LINKS any existing unlinked contact to the address,
-- then step 4 INSERTs a fresh linked contact only if the BP has none at all.
-- The whole @apply runs in ONE transaction (runner wraps BEGIN/COMMIT); on failure
-- it rolls back and the chain halts for that tenant.

-- @check
-- Needs the fix when the default customer BP exists and any of: it has no currency,
-- it has no address, it has no contact at all, or it has a contact not linked to an address.
SELECT 1
FROM c_bpartner bp
WHERE bp.ad_client_id = :client_id
  AND bp.value = 'ONBOARDING_DEFAULT_CUSTOMER'
  AND (
    bp.bp_currency_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM c_bpartner_location bpl WHERE bpl.c_bpartner_id = bp.c_bpartner_id)
    OR NOT EXISTS (SELECT 1 FROM ad_user u WHERE u.c_bpartner_id = bp.c_bpartner_id)
    OR EXISTS (SELECT 1 FROM ad_user u WHERE u.c_bpartner_id = bp.c_bpartner_id
                 AND u.c_bpartner_location_id IS NULL)
  );

-- @apply
-- Order (parents first; the contact step runs after the address exists):
--   1. UPDATE C_BPARTNER     (default the BP's currency to EUR when missing)
--   2. C_LOCATION            (the physical address)
--   3. C_BPARTNER_LOCATION   (links the address to the BP; bill-to/ship-to)
--   4. UPDATE AD_USER        (link any existing unlinked contact to the address)
--   5. INSERT AD_USER        (create a linked contact only if the BP has none)

-- 1. C_BPARTNER currency. Default to EUR when the BP carries no currency. EUR is the
--    system-level currency record (c_currency.iso_code = 'EUR', id '102' in stock Etendo),
--    shared across clients; resolved by ISO code so it works regardless of the numeric id.
UPDATE c_bpartner bp
SET bp_currency_id = (SELECT cc.c_currency_id FROM c_currency cc
                        WHERE cc.iso_code = 'EUR' ORDER BY cc.c_currency_id LIMIT 1),
    updated = now(), updatedby = '0'
WHERE bp.ad_client_id = :client_id
  AND bp.value = 'ONBOARDING_DEFAULT_CUSTOMER'
  AND bp.bp_currency_id IS NULL
  AND EXISTS (SELECT 1 FROM c_currency cc WHERE cc.iso_code = 'EUR');

-- 2. C_LOCATION. Country is reused from any existing tenant C_LOCATION (the BP was
--    onboarded for a real org, so at least one address with a country exists),
--    falling back to any active country. ad_org_id mirrors the BP's own org.
INSERT INTO c_location (c_location_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, c_country_id)
SELECT '@uuid_R4LOC@', :client_id, bp.ad_org_id, 'Y', now(), '0', now(), '0',
       COALESCE(
         (SELECT cl.c_country_id FROM c_location cl
            WHERE cl.ad_client_id = :client_id AND cl.c_country_id IS NOT NULL
            ORDER BY cl.c_location_id LIMIT 1),
         (SELECT c.c_country_id FROM c_country c
            WHERE c.isactive = 'Y' ORDER BY c.c_country_id LIMIT 1))
FROM c_bpartner bp
WHERE bp.ad_client_id = :client_id
  AND bp.value = 'ONBOARDING_DEFAULT_CUSTOMER'
  AND NOT EXISTS (SELECT 1 FROM c_bpartner_location bpl WHERE bpl.c_bpartner_id = bp.c_bpartner_id);

-- 3. C_BPARTNER_LOCATION. Links the fresh C_LOCATION to the BP. isbillto/isshipto/
--    ispayfrom/isremitto default 'Y' and istaxlocation 'N' (matches the entity
--    constructor defaults used by the preventive front), written explicitly here.
INSERT INTO c_bpartner_location (c_bpartner_location_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, c_bpartner_id, c_location_id, isbillto, isshipto, ispayfrom, isremitto, istaxlocation)
SELECT '@uuid_R4BPL@', :client_id, bp.ad_org_id, 'Y', now(), '0', now(), '0',
       'Default Customer Address', bp.c_bpartner_id, '@uuid_R4LOC@', 'Y', 'Y', 'Y', 'Y', 'N'
FROM c_bpartner bp
WHERE bp.ad_client_id = :client_id
  AND bp.value = 'ONBOARDING_DEFAULT_CUSTOMER'
  AND NOT EXISTS (SELECT 1 FROM c_bpartner_location bpl WHERE bpl.c_bpartner_id = bp.c_bpartner_id);

-- 4. Link any EXISTING contact that has no address (e.g. one created manually in the
--    UI) to the BP's address. Resolves the address by subquery so it works whether the
--    address was just inserted above or already existed.
UPDATE ad_user u
SET c_bpartner_location_id = (
      SELECT bpl.c_bpartner_location_id FROM c_bpartner_location bpl
        WHERE bpl.c_bpartner_id = u.c_bpartner_id
        ORDER BY bpl.c_bpartner_location_id LIMIT 1),
    updated = now(), updatedby = '0'
WHERE u.c_bpartner_location_id IS NULL
  AND u.c_bpartner_id IN (
        SELECT bp.c_bpartner_id FROM c_bpartner bp
        WHERE bp.ad_client_id = :client_id AND bp.value = 'ONBOARDING_DEFAULT_CUSTOMER')
  AND EXISTS (SELECT 1 FROM c_bpartner_location bpl WHERE bpl.c_bpartner_id = u.c_bpartner_id);

-- 5. Create the contact only if the BP has none at all. Linked to the BP and its
--    address (resolved by subquery, not the @uuid_R4BPL@ label, so it works in every
--    state). lastpasswordupdate is NOT NULL with a DB default of now(), written
--    explicitly for clarity.
INSERT INTO ad_user (ad_user_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, name, c_bpartner_id, c_bpartner_location_id, lastpasswordupdate)
SELECT '@uuid_R4USR@', :client_id, bp.ad_org_id, 'Y', now(), '0', now(), '0',
       'Default Customer Contact', bp.c_bpartner_id,
       (SELECT bpl.c_bpartner_location_id FROM c_bpartner_location bpl
          WHERE bpl.c_bpartner_id = bp.c_bpartner_id
          ORDER BY bpl.c_bpartner_location_id LIMIT 1),
       now()
FROM c_bpartner bp
WHERE bp.ad_client_id = :client_id
  AND bp.value = 'ONBOARDING_DEFAULT_CUSTOMER'
  AND NOT EXISTS (SELECT 1 FROM ad_user u WHERE u.c_bpartner_id = bp.c_bpartner_id);
