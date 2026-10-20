-- @id: R49-bpartner-currency-from-org
-- @gap: ETP-5768
-- @risk: low
-- @type: sql
-- @description: Give every business partner with no currency its organization's currency, so its invoices, orders, shipments and payments can be completed.

-- ETP-5768 — the demo-to-production transfer (DemoDataTransferEntityCopier.copyContacts) copied
-- contacts through DAL as System, so the NEO create hook that defaults a new contact's currency
-- (BusinessPartnerHandler.injectOrgCurrency, ETP-5284) never ran and every migrated contact landed
-- with BP_Currency_ID = NULL. Core then refuses to complete any document for that contact with
-- AD_Message InitBPCurrencyLnk ("Por favor inicialice la moneda del tercero ..."): the same check
-- lives in ProcessInvoiceUtil, ProcessOrderUtil, ProcessShipmentUtil, FIN_PaymentProcess and
-- AddPaymentOnProcessActionHandler.
--
-- CODE-SIDE HALF (com.etendoerp.go, same ticket, NOT touched by this fix): the copier now sets the
-- source contact's currency, falling back to the target organization's. This fix repairs the
-- contacts already migrated.
--
-- TARGET: EVERY business partner of the tenant with BP_Currency_ID NULL, not only the migrated
-- ones. A migrated contact carries no marker, and a contact created by any other path before
-- ETP-5284 (or inactive and later reactivated) fails exactly the same way. A currency already set
-- is never touched.
--
-- CURRENCY: the same chain the hook uses (OBCurrencyUtils.getOrgCurrency) — the contact's own
-- organization currency, else its legal entity's, else the client base currency
-- (AD_Client.C_Currency_ID, which onboarding always sets, so the chain never ends empty).
--
-- DB-STATE INVESTIGATION (2026-10-15, local dev DB): 17 partners without currency over 4 tenants;
-- keepDataProd2 (a transfer of keepDataDemo) has its 3 migrated contacts without currency while
-- the 3 source contacts carry EUR. Three of the 17 sit in organization '0', where the client base
-- currency is the only source.
--
-- IDEMPOTENT: once set, BP_Currency_ID is not NULL, so a second run finds 0 rows (@check) and
-- @apply re-applies the same guard.

-- @check
SELECT 1
FROM c_bpartner bp
WHERE bp.ad_client_id = :client_id
  AND bp.bp_currency_id IS NULL;

-- @apply
UPDATE c_bpartner bp
SET bp_currency_id = coalesce(o.c_currency_id, le.c_currency_id, c.c_currency_id),
    updated = now(),
    updatedby = '0'
FROM ad_client c,
     ad_org o
     LEFT JOIN ad_org le ON le.ad_org_id = ad_get_org_le_bu(o.ad_org_id, 'LE')
WHERE bp.ad_client_id = :client_id
  AND c.ad_client_id = bp.ad_client_id
  AND o.ad_org_id = bp.ad_org_id
  AND bp.bp_currency_id IS NULL
  AND coalesce(o.c_currency_id, le.c_currency_id, c.c_currency_id) IS NOT NULL;

-- @report
-- Partners the chain could not resolve (a client with no base currency): they need a manual fix.
SELECT bp.value AS search_key, bp.name, bp.ad_org_id
FROM c_bpartner bp
WHERE bp.ad_client_id = :client_id
  AND bp.bp_currency_id IS NULL;
