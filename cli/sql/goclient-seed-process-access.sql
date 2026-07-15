-- ETP-4509 (expansion) — Seed AD_Process_Access rows for the 4 canonical
-- Etendo Go operational roles on GOClient (document-action processes tied
-- to each role's FULL-access windows).
--
-- See docs/etendo-ad/roles-users-reference.md for the window->process
-- mapping mechanism (AD_Field button -> AD_Column.ad_process_id -> AD_Tab
-- -> AD_Window, cross-checked against GOClient Admin/GOuser's own automatic
-- grants), and the read-only-tier decision (zero process access granted --
-- every button process found on a read-only window is state-changing, none
-- are safe view-only actions).

-- NOT THE AUTHORITATIVE ARTIFACT -- same convention as the other
-- cli/sql/goclient-seed-*.sql scripts. The real, tracked deliverable is
--   {etendo_root}/modules/com.etendoerp.go/referencedata/sampledata/GOClient/AD_PROCESS_ACCESS.xml

-- AD_Process_Access has the same single isreadwrite (Y/N) flag as
-- AD_Window_Access -- existence-based access, no separate CRUD tier. Every
-- row here uses isreadwrite='Y' (matching GOClient Admin/GOuser's own
-- automatic grants for the same processes).

-- AD_ORG_ID is always '0', matching the AD_Window_Access convention.

-- Idempotent: guarded by NOT EXISTS on (ad_role_id, ad_process_id) -- there
-- is no DB-level UNIQUE constraint for this pair (same as AD_Window_Access).

BEGIN;

-- === FINANCE (127AE77FE2994067B7FE6495FC21D51E) ===
-- Add Payment From Journal
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0A150924EC42449E8B209BA187DFE7DE', '5BE14AA10165490A9ADEFB7532F7FA94', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='5BE14AA10165490A9ADEFB7532F7FA94');

-- Add Payment From Journal Line
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'FD1E3E14341A4943BABB8BB96ABF61E6', 'DE1B382FDD2540199D223586F6E216D0', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='DE1B382FDD2540199D223586F6E216D0');

-- Bank Statement Process
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '6BB68B901C154AECBF635D0D80ABBDCB', '58A9261BACEF45DDA526F29D8557272D', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='58A9261BACEF45DDA526F29D8557272D');

-- Bank Statement Process Force
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'CFFBE2A8F29945C49CB9C7A7EC520C7D', '2DDE7D3618034C38A4462B7F3456C28D', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='2DDE7D3618034C38A4462B7F3456C28D');

-- Import Statement
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'A4F969156DC040DFB72652387E0CACFB', '7AC7BE9024E448A0BB863C159DA762F9', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='7AC7BE9024E448A0BB863C159DA762F9');

-- Reconcile
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '2B72CEA16A274A088A69A0A86E7D6F5E', 'EB3D56BDD37E4229B67DBAB9F9A9B167', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='EB3D56BDD37E4229B67DBAB9F9A9B167');

-- Reconcile
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '3DEE15F3875D4C5E862A6F1B8586ED48', 'FF8080812E2F8EAE012E2F94CF470014', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='FF8080812E2F8EAE012E2F94CF470014');

-- Reconciliation Details
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '4BB3490DAE4049AF81AD9944BD6F7044', '3C4A5FB206B74C3CA9FE20116FCA0464', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='3C4A5FB206B74C3CA9FE20116FCA0464');

-- Reconciliation Process Force
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '7100203031B146B8947863C7D064818A', '6BF16EFC772843AC9A17552AE0B26AB7', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='6BF16EFC772843AC9A17552AE0B26AB7');

-- Reconciliation Summary
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'C7883183370549C798BD166DC1B71812', 'BBA11D1A061346459AF6148920FE6629', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='BBA11D1A061346459AF6148920FE6629');

-- Transaction Process
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '9AD883960F9A4A8487983C5C140F310C', 'F68F2890E96D4D85A1DEF0274D105BCE', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='F68F2890E96D4D85A1DEF0274D105BCE');

-- Execute Payment
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '7E573E9ACA5D4A04AA5C389C75E741C9', 'E011F492B0814A74B63CD1F3B9FF0526', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='E011F492B0814A74B63CD1F3B9FF0526');

-- Payment Process
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '918CDFAFC8DC4228939B7C9CE10B082D', '6255BE488882480599C81284B70CD9B3', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='6255BE488882480599C81284B70CD9B3');

-- Reverse Payment
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '99053C7A7EDA4208AACFA6CB3088BB54', '29D17F515727436DBCE32BC6CA28382B', '127AE77FE2994067B7FE6495FC21D51E', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='127AE77FE2994067B7FE6495FC21D51E' AND ad_process_id='29D17F515727436DBCE32BC6CA28382B');

-- === SALES (2A159DF4F4B944A6AA903202AD35B545) ===
-- Calculate Promotions
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '5ECCBE463BEA43A39D76F6A8BC2DDB16', '9EB2228A60684C0DBEC12D5CD8D85218', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='9EB2228A60684C0DBEC12D5CD8D85218');

-- Change Debt Payment
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'CBDC344354E346CD8E9A2E08E2C4B7B9', '800024', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='800024');

-- Copy Lines
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0E77D5EE423E4694807971D203C4FF7A', '211', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='211');

-- Copy Product Template
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'DB797B924F5A4E4DB34733ACB284FC71', '800022', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='800022');

-- Explode
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '238A95DAF42B4BC3B91794D3B61FA1A5', 'DFC78024B1F54CBB95DC73425BA6687F', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='DFC78024B1F54CBB95DC73425BA6687F');

-- Process Order
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0371E576BB7348C888EF45BEE0C922A2', '104', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='104');

-- APRM Process Invoice
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '3F777A28BE7841A1A2E77D0C7604BD48', 'B54318B49E984B9CB855AEFB1F474CD6', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='B54318B49E984B9CB855AEFB1F474CD6');

-- Copy Lines
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '42A043B521074C79B967BA7840C01F2C', '210', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='210');

-- Explode
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '1B9919A214E64749B2E5F91F0AE4BD66', '6E1ADD5C8B6B4ACB82237DAA8114451E', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='6E1ADD5C8B6B4ACB82237DAA8114451E');

-- Generate Receipt from Invoice
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'E20015327DEC43AAB067F69C9AA8F66E', '142', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='142');

-- Process Invoice
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'D72D9201E82B40D5B512372F4FCE39DE', '111', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='111');

-- Update Payment Plan
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '656B3B864E754573A6473FB3174B040B', 'FB740AB61B0E42B198D2C88D3A0D0CE6', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='FB740AB61B0E42B198D2C88D3A0D0CE6');

-- Create Order
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '2AA8408C73B84BCDAF035D4BBFED1A33', 'A3FE1F9892394386A49FB707AA50A0FA', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='A3FE1F9892394386A49FB707AA50A0FA');

-- Create Invoice (Volume Discount)
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0A7DE2F14BCC42B79113FA2BA3906ED4', '800068', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='800068');

-- Create Price List
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'C0A51298512741AAA509CB7058F7A0F6', '103', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='103');

-- Create Price List Version
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '1FF23426E0844CA9815618EA54FA294E', '800069', '2A159DF4F4B944A6AA903202AD35B545', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='2A159DF4F4B944A6AA903202AD35B545' AND ad_process_id='800069');

-- === PURCHASING (A826430F723E4C1B9A53EBB0746A98C0) ===
-- Change Debt Payment
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '931CC81434A34EEE83867145183AEA1A', '800024', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='800024');

-- Copy Lines
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '71E8F59FD2F045FC993546181C7DA35B', '211', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='211');

-- Explode
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '3C1401164A254E599C0786CD953267CD', 'DFC78024B1F54CBB95DC73425BA6687F', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='DFC78024B1F54CBB95DC73425BA6687F');

-- Process Order
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '0E5CB8544EFE4324AF19FD10F7DA119C', '104', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='104');

-- APRM Process Invoice
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '8AE6B6870EE7415FB7973002AE0EDC59', 'B54318B49E984B9CB855AEFB1F474CD6', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='B54318B49E984B9CB855AEFB1F474CD6');

-- Copy Lines
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '3377BCA3426C43278198472B5427AC4F', '210', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='210');

-- Explode
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '452219FCBDD441F0A7A3DCF6A463BB8B', '6E1ADD5C8B6B4ACB82237DAA8114451E', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='6E1ADD5C8B6B4ACB82237DAA8114451E');

-- Generate Receipt from Invoice
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'F54C14AED63349E8937D2CC44CAF816E', '142', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='142');

-- Process Invoice
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '9FF2878C0D034A4F96A3F15EC9F5A0C5', '111', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='111');

-- Update Payment Plan
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'E9233459AB42471CB07CCA115A2B9F51', 'FB740AB61B0E42B198D2C88D3A0D0CE6', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='FB740AB61B0E42B198D2C88D3A0D0CE6');

-- Create Invoice (Volume Discount)
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '7C1411A0B7AE4E1A9B510674A510A685', '800068', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='800068');

-- Create Variants
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '649E530DBBCD4E4AAB2382825B51F4A5', '3C386BC12832466790E50F2F8C5EBD85', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='3C386BC12832466790E50F2F8C5EBD85');

-- Verify BOM
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'DF93480D4EC14CCC9681182B4A20A080', '136', 'A826430F723E4C1B9A53EBB0746A98C0', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='A826430F723E4C1B9A53EBB0746A98C0' AND ad_process_id='136');

-- === INVENTORY (55E05A4B43514A029D6FB6B8D94B49D4) ===
-- Create Variants
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '24EB553E677C43508E11A8E21B7A3524', '3C386BC12832466790E50F2F8C5EBD85', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='3C386BC12832466790E50F2F8C5EBD85');

-- Verify BOM
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '9746F59698AE4B5F8D26C1902B4FB247', '136', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='136');

-- Move a Storage Bin
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '62FD0B1FE3FB40ACB9707154769A5610', '800048', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='800048');

-- Process Movements
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '079640F54D8745D4BDB36F7C4D7F81FF', '122', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='122');

-- Create Inventory Count List
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '2BEAE471BB03441DB715C34EE18F74CF', '105', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='105');

-- Process Inventory Count
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'C003490CB40C495E9ED8B6A9B00CF981', '107', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='107');

-- Update Quantity
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'CEDAA9429943470A87D8F3D5590F6B45', '106', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='106');

-- Calculate Freight Amount
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'B4D90A286BC44A69A9A80BB0CBD52EAB', '800141', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='800141');

-- Explode
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '581784B65A4E4BA38C4645F2F24F8849', 'DAE719940FE9463F8A3E3C401BBAFC53', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='DAE719940FE9463F8A3E3C401BBAFC53');

-- Generate Invoice from Receipt
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT 'E59351B0025F478D913A4F07E85C6C15', '154', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='154');

-- Process Shipment
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '62C55F050F684B2580E4CAE137D34C06', '109', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='109');

-- Process Shipment Java
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '3F592858594C44938CD9F970F8FB7A3F', '49DEE812BF0545269781FCEBF2235924', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='49DEE812BF0545269781FCEBF2235924');

-- Update Attributes from Shipment
INSERT INTO ad_process_access (ad_process_access_id, ad_process_id, ad_role_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby, isreadwrite)
SELECT '8A895BF10FFE425AAB207FDA2D57B10A', '800010', '55E05A4B43514A029D6FB6B8D94B49D4', '802509E12436405C86BA1FD5B1DF508C', '0', 'Y', now(), '100', now(), '100', 'Y'
WHERE NOT EXISTS (SELECT 1 FROM ad_process_access WHERE ad_role_id='55E05A4B43514A029D6FB6B8D94B49D4' AND ad_process_id='800010');

COMMIT;
