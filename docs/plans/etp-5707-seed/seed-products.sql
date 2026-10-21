-- ETP-5707 scratch data: 1000 products in GOClient to measure the product picker at volume.
-- Every row is tagged by the product search key prefix 'ETP5707-'; cleanup-products.sql removes them.
-- Local databases only. Run: psql -h localhost -p 5434 -U tad -d etendo -v ON_ERROR_STOP=1 -f seed-products.sql
--
-- Price coverage (so the picker's price-list scoping can be told apart from "all products"):
--   ETP5707-0001..0050  priced ONLY in the purchase list
--   ETP5707-0051..0100  priced ONLY in the sale list
--   ETP5707-0101..1000  priced in both lists (the A trigger: two rows per product)
BEGIN;

DO $$
DECLARE
  c_client constant varchar := '802509E12436405C86BA1FD5B1DF508C';  -- GOClient
  c_org    constant varchar := '61849243BE89460EB70866880A545D50';  -- org that owns the existing price rows
  v_sale   constant varchar := '65277E8E582F4EDCBC9151BE51FC6318';  -- Version Lista de venta
  v_buy    constant varchar := 'A261D0992E814847889EC935562C5993';  -- Version Lista de compra
  tpl      m_product%ROWTYPE;
  n        int;
  pid      varchar;
BEGIN
  IF EXISTS (SELECT 1 FROM m_product WHERE value LIKE 'ETP5707-%') THEN
    RAISE EXCEPTION 'ETP5707 seed already present; run cleanup-products.sql first';
  END IF;
  SELECT * INTO tpl FROM m_product
   WHERE ad_client_id = c_client AND isactive = 'Y' AND value = 'SK-002';  -- "Cerveza": a plain stocked item
  IF tpl.m_product_id IS NULL THEN
    RAISE EXCEPTION 'template product SK-002 not found in GOClient';
  END IF;

  FOR n IN 1..1000 LOOP
    pid := get_uuid();
    INSERT INTO m_product (
      m_product_id, ad_client_id, ad_org_id, isactive, created, createdby, updated, updatedby,
      value, name, c_uom_id, issummary, isstocked, ispurchased, issold, isbom,
      isinvoiceprintdetails, ispicklistprintdetails, isverified, m_product_category_id,
      volume, weight, c_taxcategory_id, discontinued, processing, producttype, ispriceprinted,
      enforce_attribute, calculated, production, qtytype, isquantityvariable, isdeferredrevenue,
      isdeferredexpense, bookusingpoprice, isgeneric, createvariants, updateinvariants,
      managevariants, print_description, returnable, ispricerulebased, unique_per_document,
      relateprodcattoservice, relateprodtoservice, islinkedtoproduct, allow_deferred_sell,
      ismodifytax, relateprodcattaxtoservice, copyservicemodifytaxconfig)
    VALUES (
      pid, c_client, tpl.ad_org_id, 'Y', now(), '100', now(), '100',
      'ETP5707-' || lpad(n::text, 4, '0'), 'ETP5707 Producto ' || lpad(n::text, 4, '0'),
      tpl.c_uom_id, 'N', 'Y', 'Y', 'Y', 'N',
      'N', 'N', 'N', tpl.m_product_category_id,
      0, 0, tpl.c_taxcategory_id, 'N', 'N', 'I', 'Y',
      'N', 'N', 'N', 'N', 'N', 'N',
      'N', 'N', 'N', 'N', 'N',
      'N', 'N', 'Y', 'N', 'N',
      'N', 'N', 'N', 'N',
      'N', 'N', 'N');

    IF n > 50 THEN  -- sale list
      INSERT INTO m_productprice (m_productprice_id, m_pricelist_version_id, m_product_id, ad_client_id,
          ad_org_id, isactive, created, createdby, updated, updatedby, pricelist, pricestd, pricelimit)
      VALUES (get_uuid(), v_sale, pid, c_client, c_org, 'Y', now(), '100', now(), '100',
          10 + n % 90, 10 + n % 90, 0);
    END IF;
    IF n <= 50 OR n > 100 THEN  -- purchase list
      INSERT INTO m_productprice (m_productprice_id, m_pricelist_version_id, m_product_id, ad_client_id,
          ad_org_id, isactive, created, createdby, updated, updatedby, pricelist, pricestd, pricelimit)
      VALUES (get_uuid(), v_buy, pid, c_client, c_org, 'Y', now(), '100', now(), '100',
          5 + n % 40, 5 + n % 40, 0);
    END IF;
  END LOOP;
END $$;

SELECT count(*) AS products,
       (SELECT count(*) FROM m_productprice pp JOIN m_product p USING (m_product_id)
         WHERE p.value LIKE 'ETP5707-%') AS price_rows
  FROM m_product WHERE value LIKE 'ETP5707-%';
COMMIT;
