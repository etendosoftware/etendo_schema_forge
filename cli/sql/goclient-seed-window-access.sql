-- ETP-4509 — Seed AD_Window_Access rows for the 4 canonical Etendo Go
-- operational roles on GOClient (3-tier full/read-only/none model).
--
-- See docs/etendo-ad/roles-users-reference.md for:
--   - the ETGO_SF_ENTITY/ETGO_SF_SPEC -> AD_Window_ID resolution mechanism
--     and its reliability findings (the "highest-risk item" for this task)
--   - the full business-term -> AD_Window_ID resolution table, including
--     the items that could NOT be confidently resolved (skipped here, see
--     below)
--   - why AD_Process_Access is explicitly OUT OF SCOPE for this pass
--
-- NOT THE AUTHORITATIVE ARTIFACT — same convention as
-- cli/sql/goclient-seed-roles.sql (ETP-4508). The real, tracked deliverable
-- is the GOClient sampledata XML:
--   {etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/
--     AD_WINDOW_ACCESS.xml
-- This script is a LOCAL DEV-SEEDING CONVENIENCE ONLY, to reproduce the same
-- DB rows on a fresh local dev DB without a full sampledata re-import.
--
-- 3-tier model, represented via AD_Window_Access.ISREADWRITE (the ONLY
-- CRUD-ish flag this table actually has — CORRECTS the ETP-4509 task brief's
-- assumption of separate allowview/allowedit/etc. flags; those do not exist
-- on this table in this Etendo version):
--   no row            = NONE  (role cannot open the window at all)
--   ISREADWRITE = 'N' = READ-ONLY
--   ISREADWRITE = 'Y' = FULL
--
-- AD_ORG_ID is always '0' (matches the existing GOClient Admin /
-- CreateRoleStep convention — role-level access, not org-scoped).
--
-- Idempotent: every INSERT is guarded by NOT EXISTS on
-- (ad_role_id, ad_window_id) since there is no DB-level UNIQUE constraint
-- for this pair (verified via pg_constraint) — safe to re-run.
--
-- Usage:
--   PGPASSWORD=<pwd> psql -h <host> -p <port> -U <user> -d <db> \
--     -f cli/sql/goclient-seed-window-access.sql
--
-- After running: this changes business data only (AD_Window_Access is not
-- AD dictionary/metadata), so ./gradlew export.database is NOT required for
-- this script itself. It IS required after the sampledata XML files are
-- regenerated/edited for GOClient, per the module's export.sample.data /
-- prepareOnboardingSampledata pipeline.

BEGIN;

-- Fixed references
--   GOClient       = 802509E12436405C86BA1FD5B1DF508C
--   Finance role   = 127AE77FE2994067B7FE6495FC21D51E
--   Sales role     = 2A159DF4F4B944A6AA903202AD35B545
--   Purchasing role= A826430F723E4C1B9A53EBB0746A98C0
--   Inventory role = 55E05A4B43514A029D6FB6B8D94B49D4

-- Unresolved / intentionally SKIPPED (see roles-users-reference.md):
--   Finance "Contabilidad"        — no single AD_Window confidently matches
--                                   this generic label (Plan contable and
--                                   Asientos already cover the two obvious
--                                   accounting concepts separately)
--   Finance "Conciliación bancaria" — the Etendo Go "bank-reconciliation"
--                                   spec (ETGO_SF_SPEC) has NO AD_Window_ID
--                                   at all (spec_type='R', aggregate/report
--                                   view); no equivalent core AD_Window
--                                   exists either. Cannot be represented via
--                                   AD_Window_Access.

-- === FINANCE (127AE77FE2994067B7FE6495FC21D51E) ===
-- FULL: chart-of-accounts (Plan contable), simple-g-l-journal (Asientos),
--       financial-account (Bancos), payment-out (Pagos), payment-in (Cobros),
--       tax + tax-category (Impuestos — both windows granted, ambiguous
--       between the two, see roles-users-reference.md)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'A10092A354BD428D90BB56936793EE8A', '118', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='118');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '7264D0A449A04D70A5F0C466B76026C2', 'B917E8A7B0864ACEA9D941E3B7494E53', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='B917E8A7B0864ACEA9D941E3B7494E53');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '7970DB73E9BC45429FE69CE97F6A113E', '94EAA455D2644E04AB25D93BE5157B6D', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='94EAA455D2644E04AB25D93BE5157B6D');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'C78E3D1B261B44D78BE29151D6A1DF2E', '6F8F913FA60F4CBD93DC1D3AA696E76E', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='6F8F913FA60F4CBD93DC1D3AA696E76E');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'EAE55C6F5E144E1591143B2EB2EB69CB', 'E547CE89D4C04429B6340FFA44E70716', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='E547CE89D4C04429B6340FFA44E70716');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '433D0752311A4BD493BAEC411BCAAEDB', '137', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='137');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'AD7BFD7FDA214B6FB968C0AC13B4C0B7', '138', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='138');

-- Finance READ-ONLY: sales-invoice (Facturas de venta), purchase-invoice (Facturas de compra)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '09DD0E7C9901487DA3C9F60E72D2EB37', '167', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='167');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0D06A7A2CCF145338F89CA6F4C17D6C0', '183', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_window_id='183');

-- === SALES (2A159DF4F4B944A6AA903202AD35B545) ===
-- FULL: sales-order (Pedidos de venta), sales-invoice (Facturas de venta),
--       sales-quotation (Presupuestos), contacts (Clientes + Contactos —
--       same underlying Business Partner window, see roles-users-reference.md),
--       price-list (Tarifas)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'FF3FC9D96F7E47F396C292C454305D32', '143', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_window_id='143');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '16CDD7B7D8364A3B9680E1FBBCE198DD', '167', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_window_id='167');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'D3C99AC68EAD4AC4BDBA9A7D25A500F1', '6CB5B67ED33F47DFA334079D3EA2340E', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_window_id='6CB5B67ED33F47DFA334079D3EA2340E');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '8FACAD0EDC6E47FDAD432D10D5EE1BAF', '123', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_window_id='123');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '57759D6E642C4D6FBD3437F86E2753C3', '146', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_window_id='146');

-- Sales READ-ONLY: product (Productos)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '428FDB982FC843E99A3B23E1A29C63EE', '140', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_window_id='140');

-- === PURCHASING (A826430F723E4C1B9A53EBB0746A98C0) ===
-- FULL: purchase-order (Pedidos de compra), purchase-invoice (Facturas de compra),
--       contacts (Proveedores — same window as Sales' Clientes/Contactos),
--       product (Productos)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '7ECA0E681AE44B3C91871200A94DC64B', '181', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_window_id='181');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'A47F128EB3644FC0AB63C258819BCED6', '183', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_window_id='183');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '66EB496FFBE2430E9AAD8071A22A3FC2', '123', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_window_id='123');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '74DB944FE7C64DF4BB3A62F2CDD4CBA2', '140', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_window_id='140');

-- Purchasing READ-ONLY: physical-inventory (Inventario)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '22075878CBF344EDA58F22014E5412F2', '168', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'N'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_window_id='168');

-- === INVENTORY (55E05A4B43514A029D6FB6B8D94B49D4) ===
-- FULL: product (Productos), warehouse (Almacenes), goods-movements
--       (Movimientos de inventario), physical-inventory (Stock — same window
--       as Purchasing's Inventario, see roles-users-reference.md),
--       goods-receipt (Entradas de mercancía), goods-shipment (Salidas de mercancía)
INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'E17ADC1467F84095B1454CCD1DCD031A', '140', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_window_id='140');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '878F59319DDC49C0ADBE428DAEE0CABD', '139', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_window_id='139');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '92E43F1ED2694802A55B78995FF2D855', '170', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_window_id='170');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '424864411F2F4CBE8F3BBEF6AD14F4BD', '168', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_window_id='168');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0030E47161C44749AA9094204AC85369', '184', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_window_id='184');

INSERT INTO ad_window_access (ad_window_access_id, ad_window_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'FEB53303178A438C80C5992FCB4690FA', '169', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_window_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_window_id='169');

COMMIT;
