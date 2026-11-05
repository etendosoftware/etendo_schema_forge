# Cobertura de la suite OKR O2 en Holded (4 nov 2026)

Clasificación de las 42 pruebas de `mcp-tests/suites/okr.yaml` según si se pueden hacer **y
comprobar** con el MCP de cada plataforma (regla del plan
[`2026-10-22-mcp-okr-metric-base-plan.md`](../plans/2026-10-22-mcp-okr-metric-base-plan.md):
*posible = hacerlo y comprobarlo con el propio MCP*; cada MCP con su catálogo completo).

**Catálogos revisados el 2026-11-04:**

- **Holded:** 367 herramientas (`Holded API 4.1.4`, catálogo `ddc5b270fc3c`), con la credencial
  reautorizada como Operator. La referencia pública lista 366. Hasta ese día el harness usaba una
  credencial recortada que veía 169; todo lo que la suite declara hoy como imposible en Holded
  (`create_invoice` faltante) se escribió contra esa credencial y queda invalidado.
- **Etendo GO:** 39 herramientas y 66 specs (`etendo_discover`), local-env ETP-5848.

**Cómo se clasificó:** sobre el catálogo (nombre, descripción y parámetros de cada herramienta),
sin crear datos en Holded. Lo marcado *a confirmar* se probó en vivo el 5 nov (sección
[Confirmación en vivo](#confirmación-en-vivo-5-nov)); la tabla ya tiene el resultado.

## Resumen

| Clasificación | Pruebas |
|---|---:|
| **Ambos** | 34 |
| **Solo Etendo** | 7 |
| **Dividida** | 1 (`w-company-users-numbering`: la parte común es la prueba nueva `q-invoice-numbering`, en Ambos; la original queda Solo Etendo) |
| **Total** | 43 (42 más `q-invoice-numbering`) |

Hoy la suite tiene 3 pruebas posibles en ambas; con esta clasificación pasan a **35** (34 más la
parte común de la dividida).

## Prueba por prueba

`Flujo` es el número de [`okr-o2-flows.md`](okr-o2-flows.md). En la columna Holded, `→` es el orden
de las herramientas y *verifica* es la lectura del resultado (`expectEffect`).

| Flujo | Prueba | Clasificación | Holded: cómo se hace y se verifica | Notas |
|---|---|---|---|---|
| 1 | `q-hello` | Ambos | Sin herramientas | Ya escrita |
| 2 | `w-customer-crud` | Ambos | `create_contact` (email, tipo cliente); verifica `search_contacts` | |
| 3 | `f-quotation-to-invoice` | Ambos | `create_estimate` → `accept_estimate` → `convert_document` (estimate → invoice); verifica `list_invoices` por `contact_id` | La declaración `notPossible` actual está mal |
| 4 | `f-order-ship-invoice` | Ambos | `create_sales_order` → `ship_sales_order` → `convert_document` (salesorder → invoice); verifica `list_invoices` y `get_sales_order_shipped_items` | La declaración `notPossible` actual está mal |
| 5 | `f-order-direct-invoice` | Ambos | setup `create_service`; `create_sales_order` → `convert_document` → invoice; verifica `list_invoices` | La declaración `notPossible` actual está mal |
| 6 | `w-draft-order-edit-delete` | Ambos | `create_sales_order` → `update_sales_order`; verifica `get_sales_order` (4 unidades) | `update_sales_order` reemplaza el documento entero: el agente tiene que leerlo antes |
| 7 | `f-collect-invoice` | Ambos | setup `create_contact` + `create_invoice` + `approve_invoice`; `create_invoice_payment` (20 €, caja); verifica `list_invoices` (`payments_pending` = 101) | La declaración `notPossible` actual está mal |
| 8 | `f-collect-several-invoices` | Ambos | setup 2 facturas; `create_invoice_payment` por factura; verifica `list_invoices` sin pendiente | Holded no tiene un cobro que cubra varias facturas: el agente registra uno por factura. La verificación (ninguna pendiente) no depende del camino |
| 9 | `f-overpay-sales-invoice` | Ambos | `create_invoice_payment` de 50 € sobre 36,30 €; verifica `get_invoice` (`status: completed`) | Confirmado en vivo: Holded acepta el cobro mayor que el pendiente |
| 10 | `f-undo-collection` | Ambos | `list_payments` (`document_id`) → `delete_payment`; verifica `list_payments` vacío y `get_invoice` otra vez `pending` | Confirmado en vivo: `delete_payment` borra el cobro, aunque su descripción habla de "formas de pago" |
| 11 | `f-credit-note` | Ambos | `create_credit_note` por 1 Agua (o `convert_document` invoice → creditnote); verifica `list_credit_notes` por `contact_id` | La declaración `notPossible` actual está mal |
| 12 | `f-void-invoice` | Ambos | `cancel_invoice` o rectificativa total; verifica `get_invoice` anulada o `list_credit_notes` | La forma nativa de anular difiere: en Etendo pasa solo la rectificativa total; en Holded tiene que aceptarse `cancel_invoice` |
| 13 | `w-send-invoice` | Solo Etendo | `send_invoice` manda el correo ("Document sent"), pero nada lo deja leer: `get_invoice` queda igual | Confirmado en vivo. Holded lo hace pero no lo puede comprobar con su MCP, así que por la regla del plan no es posible |
| 14 | `f-customer-return` | Ambos | `create_credit_note` con `warehouse_id` y la línea del producto; verifica `get_product_stock` (sube lo devuelto) | Confirmado en vivo: el stock pasó de 10 a 12. Es la forma Holded de la devolución: no hay albarán de devolución |
| 15 | `q-dashboard-indicators` | Ambos | `list_invoices`, `list_purchases` (facturado, gastado, pendiente); producto más rentable con las líneas (`product_id`, `cost_price`) y el costo del producto (`cost`, `purchase_price`) | Confirmado leyendo datos reales: las líneas y los productos traen el costo. No hace falta dividirla |
| 16 | `q-sales-this-month` | Ambos | `list_invoices` con fechas | |
| 17 | `q-top-customers` | Ambos | `list_invoices` agrupado por contacto | |
| 18 | `f-purchase-receive-invoice` | Ambos | `create_purchase_order` → `receive_purchase_order` → `create_purchase` (número F-1001) o `convert_document`; verifica `list_purchases` | |
| 19 | `f-pay-purchase-invoice` | Ambos | setup `create_purchase`; `create_purchase_payment` (banco); verifica `get_purchase` pagada | |
| 20 | `f-vendor-return` | Ambos | setup `create_purchase_shipment` (recepción) + `approve_purchase_shipment`; la devolución es otro albarán de compra con unidades negativas o `create_purchase_refund` con la línea del producto; verifica `get_product_stock` (baja 2) | Confirmado en vivo: los dos caminos descuentan el stock. Holded no enlaza la devolución con la recepción de origen: la verificación de Holded es el stock y el documento, no el origen |
| 21 | `w-product-crud` | Ambos | `create_product` (`price`, `purchase_price`); verifica `list_products` | |
| 22 | `w-product-category-crud` | Solo Etendo | Holded no tiene categorías de producto: ninguna de las 367 herramientas las crea ni las lista. El producto trae `category_id` al leerlo, pero `create_product` no lo acepta | Revisado en el catálogo completo (5 nov) |
| 23 | `w-warehouse-crud` | Ambos | `create_warehouse` (`address`); verifica `list_warehouses` | |
| 24 | `f-physical-inventory` | Ambos | `update_product_stock` en el almacén principal; verifica `get_product_stock` (280) | |
| 25 | `f-warehouse-transfer` | Ambos | `update_product_stock` −5 en el principal y +5 en el secundario; verifica `get_product_stock` por almacén | Holded no tiene documento de traspaso: la verificación de Holded es el stock por almacén, no una línea de movimiento |
| 26 | `f-internal-consumption` | Ambos | `update_product_stock` −2 con descripción; verifica `get_product_stock` | Igual que la anterior: ajuste de stock, sin documento de consumo |
| 27 | `q-stock-report` | Ambos | `get_product_stock` o `get_warehouse_stock` | |
| 28 | `f-bank-account-transfer` | Ambos | `create_banking_account` → `create_bank_movement` −500 en la caja y +500 en la cuenta nueva; verifica `list_banking_account_bank_movements` en las dos | Confirmado en vivo. Holded no tiene tipo "traspaso": son dos movimientos manuales sin vínculo, y la verificación lee los dos |
| 29 | `w-subaccount` | Ambos | `create_accounting_account` (prefijo 627); verifica `list_accounting_accounts` | |
| 30 | `w-cost-center-project` | Ambos | `create_project`; verifica `list_projects` | |
| 31 | `f-open-period` | Solo Etendo | Holded no tiene períodos contables en el MCP | |
| 32 | `f-asset-amortization` | Solo Etendo | Holded no tiene activos ni amortizaciones en el MCP | |
| 33 | `f-manual-journal-post` | Ambos | `create_ledger_entry` (líneas debe/haber); verifica `list_ledger_entries` | En Holded el asiento queda contabilizado al crearlo |
| 34 | `q-financial-reports` | Ambos | `list_invoices` (`payments_pending`) | |
| 35 | `q-taxes-and-rates` | Ambos | `list_taxes` | Ya escrita |
| 36 | `q-fiscal-status` | Solo Etendo | Ninguna herramienta lee la configuración de envío a Hacienda ni los modelos de impuestos | Confirmado en el catálogo completo. Lo que sí hay es el estado fiscal **por factura** (`get_invoice`: `sii_status`, `verifactu_status`, `ticket_bai_status`): ver pruebas nuevas |
| 37 | `w-commercial-setup` | Ambos | `create_price_list`; verifica `list_price_lists` | En Holded toda tarifa es de venta |
| 38 | `w-company-users-numbering` | Dividida | `inviteAccountUser` (email, `role_id`); verifica `listAccountUsers`. Numeración: `list_numbering_series` (`type: invoice`, formato `F[YY]%%%%`) | El rol de ventas no se puede elegir: `listAccountUsers` solo muestra `owner` y ninguna herramienta lista roles. Parte común: `q-invoice-numbering`, decidida el 5 nov: decir el prefijo de las facturas de venta (Holded: `list_numbering_series`, serie "Línea F", formato `F[YY]%%%%`). Dar acceso a un usuario tampoco es posible en Holded: `inviteAccountUser` exige un `role_id` y ninguna herramienta lista roles. La original (con el rol de ventas) queda Solo Etendo. La invitación no se probó en vivo para no mandar un correo real |
| 39 | `e-unknown-document` | Ambos | `find_invoices_by_document_number` | Ya escrita |
| 41 | `e-ambiguous-customer` | Ambos | setup dos `create_contact` con el mismo nombre; verifica `list_sales_orders` sin pedido | |
| 42 | `e-duplicate-payment-term` | Solo Etendo | `create_payment_method` (`dueDays`) existe, pero Holded no rechaza formas de pago repetidas | Confirmado en vivo: creó dos veces *MCPCONFIRM Mensual* a 30 días sin error. Prueba de error sobre una regla que Holded no tiene |
| 43 | `e-closed-period` | Solo Etendo | Holded no tiene cierre de períodos en el MCP: no se puede armar el punto de partida | |

## Confirmación en vivo (5 nov)

Corrida con la credencial completa (367 herramientas) sobre la cuenta de Holded de Valentin. Todo lo
creado lleva `MCPCONFIRM` en el nombre o la descripción: los contactos *MCPCONFIRM Cliente* y
*MCPCONFIRM Proveedor*, una factura, rectificativas de venta y de compra, dos albaranes de compra, el
producto *MCPCONFIRM Producto*, las cuentas *MCPCONFIRM Caja* y *MCPCONFIRM Banco* y dos formas de
pago *MCPCONFIRM Mensual*.

- `f-overpay-sales-invoice` — factura de 36,30 aprobada, cobro de 50: aceptado; `get_invoice` la
  muestra `completed`.
- `f-undo-collection` — `list_payments` con el id de la factura da el cobro; `delete_payment` lo
  borra; la factura vuelve a `pending`.
- `w-send-invoice` — `send_invoice` responde "Document sent"; `get_invoice` antes y después es
  idéntico. No hay registro de envío en ninguna herramienta.
- `f-customer-return` — producto con 10 unidades; rectificativa de 2 con `warehouse_id`: el stock
  queda en 12 (`get_product_stock`).
- `f-bank-account-transfer` — dos cuentas nuevas (caja y banco), −500 y +500: cada cuenta lista su
  movimiento (`origin: manual`, `status: pending`).
- `q-dashboard-indicators` — las líneas de factura traen `product_id` y `cost_price`; el producto,
  `cost` y `purchase_price`.
- `w-company-users-numbering` — `listAccountUsers` devuelve un solo usuario con `role_id: owner`;
  `list_numbering_series` devuelve la serie de facturas `I[YY]%%%%`.
- `q-fiscal-status` — sin herramientas de configuración fiscal ni de modelos en las 367.
- `f-vendor-return` — sobre el producto (12 unidades): albarán de compra de 5 aprobado → 17; albarán
  de compra con −2 aprobado → 15; rectificativa de compra de 2 con el producto → 13.
- `e-duplicate-payment-term` — dos `create_payment_method` iguales (*MCPCONFIRM Mensual*, 30 días):
  los dos se crearon; `list_payment_methods` los muestra repetidos.
- Revisadas otra vez en el catálogo completo y siguen Solo Etendo: `f-open-period` y
  `e-closed-period` (no hay herramientas para abrir ni cerrar períodos; `delete_ledger_entry`
  menciona períodos bloqueados, pero ninguna herramienta los maneja), `f-asset-amortization` (ninguna
  herramienta de activos ni amortizaciones) y `w-product-category-crud`.

**La cuenta no sirve para la medición oficial:** está configurada para Argentina (moneda ARS, país
AR) y ya tiene datos de agosto. La suite usa IVA español y euros, y el plan pide una cuenta
recién creada. Para confirmar capacidades alcanza.

## Pruebas nuevas posibles en ambas

Operaciones que los dos MCP pueden hacer y comprobar y que la suite no cubre. Varias son las partes
que los flujos originales dejaron afuera porque Holded no las podía leer con la credencial anterior.

| Propuesta | Pedido de ejemplo | Etendo GO | Holded |
|---|---|---|---|
| Cambiar los datos de un cliente (flujo 2, parte de cambio) | "A Cliente X cambiale el correo a pagos@mcpflow.test." | `contacts` | `update_contact`, verifica `get_contact` |
| Cambiar el precio de un producto (flujo 21) | "Subile el precio de venta del Producto X a 10 €." | `product` / `price` | `update_product`, verifica `get_product` |
| Borrar un pedido en borrador (flujo 6, parte de baja) | "El pedido de Cliente X ya no va, borralo." | `sales-order` | `delete_sales_order`, verifica `list_sales_orders` |
| Rechazar un presupuesto | "Cliente X rechazó el presupuesto, marcalo." | `sales-quotation` (rechazo) | `reject_estimate`, verifica `get_estimate` |
| Enviar un presupuesto por correo | "Mandale el presupuesto a Cliente X." | `etendo_send_document_email` | `send_estimate` |
| PDF de una factura | "Pasame el PDF de la última factura de Cliente X." | `etendo_get_document_pdf` | `get_invoice_pdf` |
| Adjuntar un archivo a una factura | "Adjuntale este comprobante a la factura de Cliente X." | `etendo_request_attachment_upload` | `attach_invoice_file`, verifica `list_invoice_attachments` |
| Cargar una factura de proveedor desde un PDF | "Te paso la factura del proveedor, cargala." | `etendo_extract_invoice_document` (OCR) | `upload_inbox` → `export_inbox` (escaneo a compra) |
| Cargar una factura de proveedor sin pedido | "Prov. X nos facturó 3 Cervezas, F-2001. Cargala." | `purchase-invoice` | `create_purchase`, verifica `list_purchases` |
| Rectificativa de un proveedor | "Prov. X nos hizo una rectificativa por 1 Cerveza." | `purchase-invoice` (rectificativa) | `create_purchase_refund`, verifica `list_purchase_refunds` |
| Alta de un servicio | "Agregá el servicio Mantenimiento X a 40 € la hora." | `product` (tipo servicio) | `create_service`, verifica `list_services` |
| Condición de pago nueva (sin duplicado) | "Creá la condición de pago a 60 días Bimestral X." | `payment-term` | `create_payment_method` (`dueDays`), verifica `list_payment_methods` |
| Serie de numeración (flujo 38, parte de numeración) | "Creá una numeración para rectificativas con prefijo R-." | `document-sequence` | `create_numbering_series`, verifica `list_numbering_series` |
| Facturas vencidas | "¿Qué facturas tenemos vencidas?" | `generate_aging_receivable` | `list_invoices` (`due_date_end`, pendiente) |
| Deuda de un cliente | "¿Cuánto nos debe Cliente X?" | `sales-invoice` / `generate_aging_receivable` | `list_invoices` por `contact_id` |
| Mejores proveedores | "¿A qué tres proveedores les compramos más?" | `purchase-invoice` | `list_purchases` agrupado |
| Saldo de caja y bancos | "¿Cuánto tenemos en la caja y en el banco?" | `financial-account` | `list_banking_accounts` |
| Borrar una factura en borrador | "Borrá la factura en borrador de Cliente X." | `sales-invoice` (`etendo_delete`) | `delete_invoice`, verifica `list_invoices` |
| Imagen de un producto | "Ponele esta foto al Producto X." | `etendo_upload_image` | `upload_product_image`, verifica `get_product_main_image` |
| Estado fiscal de una factura | "¿La factura F-X ya se mandó a Hacienda?" | `monitor-verifactu` / `sii-monitor` | `get_invoice` (`verifactu_status`, `sii_status`, `ticket_bai_status`) |
| Dar acceso y numeración (parte común del flujo 38) | "Dale acceso a usuario@x.com y decime con qué prefijo salen nuestras facturas de venta." | `user` / `document-sequence` | `inviteAccountUser`, verifica `listAccountUsers`; `list_numbering_series` |

## Lo que el MCP de Holded hace y el de Etendo GO no

Capacidades del catálogo de Holded sin equivalente en el MCP de Etendo GO (66 specs, 39
herramientas) al 2026-11-04. Son candidatas a **Holded Only** y, como dice el plan, input de producto.

| Área | Qué hace Holded | Herramientas |
|---|---|---|
| CRM | Leads, embudos y etapas, notas y tareas de un lead | `create_lead`, `update_lead_stage`, `create_lead_note`, `create_lead_task`, `create_funnel`, … (`crm:deals`, `crm:funnels`) |
| Agenda | Eventos de calendario y reservas con disponibilidad | `create_event`, `create_booking`, `get_booking_location_slots`, … |
| Proyectos | Tareas, horas imputadas por proyecto y resumen económico | `create_task`, `create_project_time`, `list_all_project_times`, `get_project_summary` |
| Personal | Empleados, contratos, fichaje, ausencias | `create_employee`, `update_employee_contract`, `clock_in`, `clock_out`, `pause`, `create_time_off`, … |
| Nóminas | Nóminas, pagos de nómina y registros salariales | `create_payslip`, `approve_payslip`, `create_payslip_payment`, `create_salary_record`, … |
| Facturación recurrente | Facturas que se repiten solas, con su calendario | `create_invoice_recurring`, `get_recurring_schedule`, `skip_recurring_occurrence` |
| Otros documentos de venta | Proformas y tickets de venta | `create_proforma`, `create_sales_receipt`, … |
| Conversión entre documentos | Convertir cualquier documento en otro tipo con un solo paso (presupuesto → pedido → albarán → factura) | `convert_document` |
| Seguimiento de envíos | Número de seguimiento en pedidos y albaranes | `update_sales_order_tracking`, `update_waybill_tracking` |
| Pipelines de documentos | Etapas propias por tipo de documento y aprobaciones | `set_*_pipeline`, `approve_*` |
| Producción | Órdenes de producción con materiales | `create_production_order`, … |
| Previsión de tesorería | Previsiones de cobro y plan de negocio contra lo real | `create_invoicing_forecast`, `list_business_plan_goals`, `list_business_plan_scenarios` |
| Remesas | Consultar remesas de cobro | `list_remittances`, `get_remittance` |
| Portal del cliente | Link al portal de un contacto | `get_contact_portal_link` |
| Canales de venta | Alta y gestión de canales | `create_sales_channel`, … |
| Usuarios de la cuenta | Invitar usuarios por correo y cambiarles el rol | `inviteAccountUser`, `update_account_user`, `listAccountUsers` |
| Webhooks | Alta y gestión de webhooks y sus eventos | `create_webhook`, `get_webhook_events`, … |
| Bandeja de entrada | Subir documentos, escanearlos y convertirlos en compras | `upload_inbox`, `export_inbox`, `preview_inbox_file` |

Al revés, lo que solo Etendo GO hace en esta suite: períodos contables, activos y amortizaciones,
categorías de producto, el rol de un usuario, comprobar el
envío de una factura por correo, la configuración y los monitores fiscales (SII, TicketBAI,
Verifactu) y los informes contables (balance, pérdidas y ganancias, sumas y saldos, mayor, IVA,
antigüedad de saldos).

## Próximos pasos

1. ~~Confirmar en vivo los casos *a confirmar*~~ — hecho el 5 nov (sección *Confirmación en vivo*).
2. ~~Escribir los bloques de Holded en `okr.yaml`~~ — hecho el 5 nov: las 42 pruebas tienen bloque,
   34 posibles y 8 `notPossible` con su motivo. Pilotado en la cuenta de Valentin sin agente
   (setup y lectura de verificación): las 34 corren sin errores. Las consultas con totales calculan
   la cifra esperada sumando los listados de Holded (`aggregate`, en el runner).
3. Para la medición oficial: una cuenta de Holded española y nueva, con los datos que nombran las
   pruebas (cabecera de `okr.yaml`, *DATA (holded)*).
4. Agregar las pruebas nuevas que se aprueben a `okr-o2-flows.md` y a la suite.
