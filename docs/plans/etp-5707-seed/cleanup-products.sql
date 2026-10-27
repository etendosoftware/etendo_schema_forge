-- ETP-5707: removes everything seed-products.sql created (tagged by search key prefix 'ETP5707-').
BEGIN;
DELETE FROM m_productprice WHERE m_product_id IN (SELECT m_product_id FROM m_product WHERE value LIKE 'ETP5707-%');
DELETE FROM m_product_trl  WHERE m_product_id IN (SELECT m_product_id FROM m_product WHERE value LIKE 'ETP5707-%');
DELETE FROM m_product WHERE value LIKE 'ETP5707-%';
SELECT count(*) AS products_left FROM m_product WHERE value LIKE 'ETP5707-%';
COMMIT;
