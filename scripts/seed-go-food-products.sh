#!/usr/bin/env bash
set -euo pipefail

# Creates deterministic demo food products in a selected Etendo client organization.
# It resolves all database IDs from live configuration and is idempotent by search key.

script_dir=$(cd "$(dirname "$0")" && pwd)
etendo_root=${ETENDO_ROOT:-"$script_dir/../etendo_core"}
properties_file="$etendo_root/gradle.properties"
client_name="GOClient"
organization_name=""
count=100

usage() {
  echo "Usage: $0 [--client-name NAME] [--organization-name NAME] [--count NUMBER]"
}

while (($#)); do
  case "$1" in
    --client-name) client_name=${2:?"--client-name requires a value"}; shift 2 ;;
    --organization-name) organization_name=${2:?"--organization-name requires a value"}; shift 2 ;;
    --count) count=${2:?"--count requires a value"}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

if [[ ! $count =~ ^([1-9]|[1-9][0-9]|100)$ ]]; then
  echo "--count must be an integer between 1 and 100" >&2
  exit 2
fi
if [[ ! -f $properties_file ]]; then
  echo "Etendo gradle.properties not found: $properties_file" >&2
  exit 2
fi

read_property() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$properties_file"
}

db_port=$(read_property bbdd.port)
db_name=$(read_property bbdd.sid)
db_user=$(read_property bbdd.user)
db_password=$(read_property bbdd.password)

run_sql() {
  PGPASSWORD="$db_password" psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$db_port" -U "$db_user" -d "$db_name" "$@"
}

client_id=$(run_sql -At -v client_name="$client_name" <<'SQL'
SELECT ad_client_id
FROM ad_client
WHERE name = :'client_name' AND isactive = 'Y';
SQL
)
if [[ $(printf '%s\n' "$client_id" | sed '/^$/d' | wc -l | tr -d ' ') != 1 ]]; then
  echo "Expected exactly one active client named '$client_name'" >&2
  exit 2
fi

org_filter=""
if [[ -n $organization_name ]]; then
  org_filter="AND name = :'organization_name'"
fi
organization_id=$(run_sql -At -v client_id="$client_id" -v organization_name="$organization_name" <<SQL
SELECT ad_org_id
FROM ad_org
WHERE ad_client_id = :'client_id'
  AND ad_org_id <> '0'
  AND isactive = 'Y'
  $org_filter
ORDER BY name;
SQL
)
if [[ $(printf '%s\n' "$organization_id" | sed '/^$/d' | wc -l | tr -d ' ') != 1 ]]; then
  echo "Expected exactly one active non-system organization for '$client_name'. Use --organization-name when needed." >&2
  exit 2
fi

run_sql -v client_id="$client_id" -v organization_id="$organization_id" -v product_count="$count" <<'SQL'
BEGIN;

CREATE TEMP TABLE seed_catalog ON COMMIT DROP AS
WITH base_products(sequence, category, product_names) AS (
  VALUES
    (1, 'Lácteos', ARRAY['Leche entera 1L', 'Leche descremada 1L', 'Bebida de avena 1L', 'Bebida de almendras 1L', 'Leche sin lactosa 1L']),
    (2, 'Yogures', ARRAY['Yogur griego 500g', 'Yogur de vainilla 500g', 'Yogur de frutilla 500g', 'Kéfir natural 500g', 'Yogur de coco 400g']),
    (3, 'Quesos', ARRAY['Queso cheddar madurado 200g', 'Queso mozzarella 250g', 'Rulo de queso de cabra 150g', 'Cuña de parmesano 180g', 'Queso crema 300g']),
    (4, 'Panadería', ARRAY['Pan de masa madre', 'Pan integral', 'Medialunas de manteca x6', 'Rollos de canela x4', 'Bagels con semillas x5']),
    (5, 'Huevos', ARRAY['Huevos de campo x12', 'Huevos orgánicos x6', 'Huevos de codorniz x18', 'Claras pasteurizadas 500ml', 'Huevo líquido entero 1L']),
    (6, 'Aceites', ARRAY['Aceite de oliva extra virgen 750ml', 'Aceite de girasol 1L', 'Aceite de palta 500ml', 'Aceite de sésamo tostado 250ml', 'Aceite de coco 400g']),
    (7, 'Cereales y granos', ARRAY['Arroz basmati 1kg', 'Arroz integral 1kg', 'Cuscús perlado 500g', 'Quinoa tricolor 500g', 'Avena cortada 750g']),
    (8, 'Pastas', ARRAY['Pasta integral 500g', 'Tagliatelle de espinaca 400g', 'Penne sin gluten 500g', 'Ñoquis de papa 500g', 'Placas para lasaña 250g']),
    (9, 'Salsas', ARRAY['Salsa de tomate y albahaca 350g', 'Pesto genovés 190g', 'Salsa arrabbiata 350g', 'Salsa de curry de coco 300g', 'Salsa teriyaki para salteados 250ml']),
    (10, 'Legumbres', ARRAY['Porotos negros 400g', 'Garbanzos 400g', 'Lentejas rojas 500g', 'Porotos cannellini 400g', 'Arvejas partidas verdes 500g']),
    (11, 'Café', ARRAY['Café en grano arábica 250g', 'Café molido espresso 250g', 'Cápsulas de café descafeinado x10', 'Café cold brew 330ml', 'Café instantáneo de avellana 100g']),
    (12, 'Té', ARRAY['Saquitos de té verde x20', 'Saquitos de té Earl Grey x20', 'Saquitos de manzanilla x20', 'Saquitos de menta x20', 'Saquitos de rooibos x20']),
    (13, 'Jugos', ARRAY['Jugo de naranja 1L', 'Jugo de manzana 1L', 'Néctar de mango 1L', 'Jugo de pomelo rosado 1L', 'Té helado de durazno 1L']),
    (14, 'Aguas', ARRAY['Agua mineral con gas 1L', 'Agua mineral sin gas 1L', 'Agua con gas sabor limón 1L', 'Agua de coco 330ml', 'Agua con electrolitos 500ml']),
    (15, 'Chocolates', ARRAY['Chocolate amargo 70% 100g', 'Tableta de chocolate con leche 100g', 'Tableta de chocolate blanco 100g', 'Chocolate con caramelo salado 100g', 'Bocaditos de chocolate y almendras 150g']),
    (16, 'Snacks', ARRAY['Papas fritas con sal marina 150g', 'Chips de maíz sabor barbacoa 150g', 'Castañas de cajú tostadas 200g', 'Pretzels salados 200g', 'Mezcla de frutos secos y frutas 250g']),
    (17, 'Cereales', ARRAY['Granola de avena y miel 400g', 'Muesli de chocolate 400g', 'Copos de maíz 375g', 'Cereal con mantequilla de maní 350g', 'Granola con frutos rojos 400g']),
    (18, 'Conservas dulces', ARRAY['Mermelada de frutilla 320g', 'Mermelada de damasco 320g', 'Mermelada de naranja 320g', 'Miel de flores silvestres 350g', 'Jarabe de arce 250ml']),
    (19, 'Aves', ARRAY['Pechugas de pollo 500g', 'Muslos de pollo deshuesados 500g', 'Fetas de pechuga de pavo 200g', 'Salchichas de pollo 400g', 'Albóndigas de pollo 400g']),
    (20, 'Pescados y mariscos', ARRAY['Filetes de salmón atlántico 400g', 'Bifes de atún 300g', 'Langostinos cocidos 250g', 'Lomos de merluza 400g', 'Trucha ahumada 150g'])
), positions(sequence) AS (
  VALUES (1), (2), (3), (4), (5)
)
SELECT
  ((base_products.sequence - 1) * 5) + positions.sequence AS sequence,
  base_products.product_names[positions.sequence] AS name,
  format('%s product: %s.', base_products.category, base_products.product_names[positions.sequence]) AS description
FROM base_products
CROSS JOIN positions;

WITH template AS (
  SELECT c_uom_id, m_product_category_id, c_taxcategory_id, createdby
  FROM m_product
  WHERE ad_client_id = :'client_id'
    AND ad_org_id = :'organization_id'
    AND isactive = 'Y'
    AND producttype = 'I'
  ORDER BY created
  LIMIT 1
), missing AS (
  SELECT catalog.sequence, catalog.name, catalog.description
  FROM seed_catalog catalog
  WHERE catalog.sequence <= :product_count::int
    AND NOT EXISTS (
      SELECT 1
      FROM m_product
      WHERE ad_client_id = :'client_id'
        AND value = format('SF-FOOD-%s', lpad(catalog.sequence::text, 3, '0'))
    )
)
INSERT INTO m_product (
  m_product_id, ad_client_id, ad_org_id, createdby, updatedby, value, name, description,
  c_uom_id, m_product_category_id, c_taxcategory_id
)
SELECT
  get_uuid(), :'client_id', :'organization_id', template.createdby, template.createdby,
  format('SF-FOOD-%s', lpad(missing.sequence::text, 3, '0')),
  missing.name, missing.description,
  template.c_uom_id, template.m_product_category_id, template.c_taxcategory_id
FROM missing
CROSS JOIN template;

UPDATE m_product product
SET name = catalog.name,
    description = catalog.description,
    updated = now()
FROM seed_catalog catalog
WHERE product.ad_client_id = :'client_id'
  AND product.ad_org_id = :'organization_id'
  AND product.value = format('SF-FOOD-%s', lpad(catalog.sequence::text, 3, '0'))
  AND catalog.sequence <= :product_count::int
  AND (product.name IS DISTINCT FROM catalog.name OR product.description IS DISTINCT FROM catalog.description);

COMMIT;

SELECT count(*) AS seeded_products
FROM m_product
WHERE ad_client_id = :'client_id'
  AND ad_org_id = :'organization_id'
  AND value LIKE 'SF-FOOD-%';
SQL
