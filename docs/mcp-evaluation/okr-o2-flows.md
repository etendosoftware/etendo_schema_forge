# Flujos de prueba — OKR O2 (iteración 1, 23 oct 2026)

**Tarea:** ETP-5848 (T1). **Plan:** `docs/plans/2026-10-22-mcp-okr-metric-base-plan.md`.
**Base de operaciones:** `docs/mcp-evaluation/okr-o2-operations-catalog.md`.

Listado de 42 flujos que cubren **todas las ventanas del menú** de Etendo Go, salvo las excluidas
abajo. Un flujo mínimo por ventana (entrar, leer, crear, editar, borrar), agrupando ventanas cuando
el flujo natural las encadena, más consultas y pruebas de error con foco en ventas. La cantidad no es
fija. Se itera; todavía **no son pruebas de la suite**.

## Cómo leer cada flujo

- **Pedido funcional:** lo que recibe el agente. Está escrito como lo pediría un usuario sin contexto:
  no nombra tools, tablas, campos técnicos ni ids. `MCPFLOW` es el marcador que identifica lo
  que crea la prueba.
- **Verificación:** lo que se lee de vuelta para dar el flujo por hecho (estado, importe, valor).
- **Datos previos:** lo que tiene que existir antes (lo crea el setup de la prueba, no el agente).
- **Evidencia UI** (recorrido del 23 oct en un local-env sobre `develop`, empresa GOClient):
  ✅ ejecutado de punta a punta · 👁 visto en la UI, no ejecutado · 📄 sacado de la guía funcional
  (`docs/generated-custom-windows/`), sin ver en la UI.
- **Holded:** según el inventario de tools de `mcp-comparison-holded-vs-etendo-go.md` §4
  (agosto 2026). **Todo se confirma contra el `tools/list` en vivo** antes de convertirlo en prueba.
  `no` = capacidad (Etendo Only si Etendo puede).
- **Origen:** todos salen de la UI de Etendo Go (§3.3 del plan). Las pruebas que salen del MCP de
  Holded (Holded Only) se agregan en otra iteración.

## Resumen

| # | Id propuesto | Flujo | Ventanas | UI | Holded |
|---|---|---|---|---|---|
| | **Ventas** | | | | |
| 1 | `w-customer-crud` | Alta, cambio y baja de un cliente | Contactos, Categoría de Contacto | ✅ | sí (sin lectura) |
| 2 | `f-quotation-to-invoice` | Presupuesto aceptado y facturado | Presupuesto, Factura | ✅ | parcial |
| 3 | `f-order-ship-invoice` | Pedido → albarán → factura | Pedido, Albarán, Factura | ✅ | parcial |
| 4 | `f-order-direct-invoice` | Pedido facturado sin albarán | Pedido, Factura | 👁 | no |
| 5 | `w-draft-order-edit-delete` | Corregir y descartar un pedido en borrador | Pedido | 👁 | sí |
| 6 | `f-collect-invoice` | Cobro parcial y saldo restante | Factura, Cobro | ✅ | verificar |
| 7 | `f-collect-several-invoices` | Un cobro para varias facturas | Factura, Cobro | 📄 | verificar |
| 8 | `f-overpay-sales-invoice` | Cobro mayor que la factura | Factura, Cobro | 👁 | verificar |
| 9 | `f-credit-note` | Factura rectificativa | Factura (Rectificaciones) | 👁 | no |
| 10 | `f-void-invoice` | Anular una factura emitida | Factura | 👁 | no |
| 11 | `w-send-invoice` | Enviar una factura por correo | Factura | 👁 | verificar |
| 12 | `f-customer-return` | Devolución de un cliente | Albarán, Albarán de devolución | 👁 | verificar |
| | **Consultas** | | | | |
| 13 | `q-dashboard-indicators` | Indicadores del negocio | Inicio | 👁 | parcial |
| 14 | `q-sales-this-month` | Ventas del mes | Factura | 👁 | sí |
| 15 | `q-top-customers` | Mejores clientes | Factura, Inicio | 👁 | parcial |
| | **Compras** | | | | |
| 16 | `f-purchase-receive-invoice` | Pedido de compra → recepción → factura | Pedido, Albarán, Factura (compras), Relación albarán-factura | 👁 | parcial |
| 17 | `f-pay-purchase-invoice` | Pagar una factura de proveedor | Factura (compras), Pago | 👁 | verificar |
| 18 | `f-vendor-return` | Devolución a proveedor | Albarán (compras), Albarán de devolución (compras) | 👁 | verificar |
| | **Inventario** | | | | |
| 19 | `w-product-crud` | Alta, cambio y baja de un producto | Producto | ✅ | sí (sin lectura) |
| 20 | `w-product-category-crud` | Alta, cambio y baja de una categoría | Categoría del producto | ✅ | verificar |
| 21 | `w-warehouse-crud` | Alta, cambio y baja de un almacén | Almacén | 👁 | verificar |
| 22 | `f-physical-inventory` | Recuento de stock | Inventario físico | 👁 | parcial |
| 23 | `f-warehouse-transfer` | Pasar stock de un almacén a otro | Movimiento entre almacenes | 👁 | verificar |
| 24 | `f-internal-consumption` | Consumo interno de stock | Consumo interno | 👁 | no |
| 25 | `q-stock-report` | Consultar el stock | Informes (inventario) | 👁 | verificar |
| | **Finanzas** | | | | |
| 26 | `f-bank-account-transfer` | Cuenta nueva y transferencia | Cuentas | 👁 | verificar |
| 27 | `w-subaccount` | Subcuenta contable | Plan de cuentas | 👁 | verificar |
| 28 | `w-cost-center-project` | Centro de costos y proyecto | Centro de costos, Proyecto | ✅ | parcial |
| 29 | `f-open-period` | Año fiscal y apertura de período | Calendario, Esquema contable | ✅ | no |
| 30 | `f-asset-amortization` | Activo y su amortización | Categoría de activo, Activos, Amortización | ✅/👁 | no |
| 31 | `f-manual-journal-post` | Asiento manual y contabilización | Asientos Manuales, Documentos no contabilizados | 👁 | verificar |
| 32 | `q-financial-reports` | Informes financieros | Informes (finanzas) | 👁 | verificar |
| 33 | `q-taxes-and-rates` | Impuestos, categorías y tipos de cambio | Impuesto, Categoría de Impuesto, Rangos de conversión | 👁 | parcial |
| 34 | `q-fiscal-status` | Situación fiscal de la empresa | Configuración Fiscal, Monitor Fiscal, Modelos Fiscales | 👁 | no |
| | **Configuración** | | | | |
| 35 | `w-commercial-setup` | Tarifa y condiciones de pago | Tarifa, Condiciones de pago | ✅ | verificar |
| 36 | `w-company-users-numbering` | Usuarios, roles, datos de la empresa y numeración | Usuarios, Roles, Organización, Secuencias de documentos | ✅/👁 | parcial |
| | **Errores y negativas** | | | | |
| 37 | `e-unknown-document` | Documento que no existe | Factura | 📄 | sí |
| 38 | `e-invalid-write` | Cantidad negativa | Pedido | 📄 | sí |
| 39 | `e-ambiguous-customer` | Cliente ambiguo | Contactos, Pedido | 📄 | verificar |
| 40 | `e-duplicate-payment-term` | Condición de pago repetida | Condiciones de pago | ✅ | verificar |
| 41 | `e-closed-period` | Documento en período cerrado | Factura, Calendario | ✅ | no |
| 42 | `e-delete-processed-collection` | Borrar un cobro ya procesado | Cobro | 👁 | verificar |

**Fuera del listado** (decidido con Valentin, 23 oct): las pantallas de prueba de concepto (Venta Rápida,
Compra Rápida, Calendario unificado), Conectar agente de IA (es la pantalla informativa para
conectar el MCP) y cualquier ventana que no esté en el menú.

## Flujos

Un archivo por flujo en [`okr-o2-flows/`](okr-o2-flows/):

1. [`w-customer-crud`](okr-o2-flows/01-w-customer-crud.md)
2. [`f-quotation-to-invoice`](okr-o2-flows/02-f-quotation-to-invoice.md)
3. [`f-order-ship-invoice`](okr-o2-flows/03-f-order-ship-invoice.md)
4. [`f-order-direct-invoice`](okr-o2-flows/04-f-order-direct-invoice.md)
5. [`w-draft-order-edit-delete`](okr-o2-flows/05-w-draft-order-edit-delete.md)
6. [`f-collect-invoice`](okr-o2-flows/06-f-collect-invoice.md)
7. [`f-collect-several-invoices`](okr-o2-flows/07-f-collect-several-invoices.md)
8. [`f-overpay-sales-invoice`](okr-o2-flows/08-f-overpay-sales-invoice.md)
9. [`f-credit-note`](okr-o2-flows/09-f-credit-note.md)
10. [`f-void-invoice`](okr-o2-flows/10-f-void-invoice.md)
11. [`w-send-invoice`](okr-o2-flows/11-w-send-invoice.md)
12. [`f-customer-return`](okr-o2-flows/12-f-customer-return.md)
13. [`q-dashboard-indicators`](okr-o2-flows/13-q-dashboard-indicators.md)
14. [`q-sales-this-month`](okr-o2-flows/14-q-sales-this-month.md)
15. [`q-top-customers`](okr-o2-flows/15-q-top-customers.md)
16. [`f-purchase-receive-invoice`](okr-o2-flows/16-f-purchase-receive-invoice.md)
17. [`f-pay-purchase-invoice`](okr-o2-flows/17-f-pay-purchase-invoice.md)
18. [`f-vendor-return`](okr-o2-flows/18-f-vendor-return.md)
19. [`w-product-crud`](okr-o2-flows/19-w-product-crud.md)
20. [`w-product-category-crud`](okr-o2-flows/20-w-product-category-crud.md)
21. [`w-warehouse-crud`](okr-o2-flows/21-w-warehouse-crud.md)
22. [`f-physical-inventory`](okr-o2-flows/22-f-physical-inventory.md)
23. [`f-warehouse-transfer`](okr-o2-flows/23-f-warehouse-transfer.md)
24. [`f-internal-consumption`](okr-o2-flows/24-f-internal-consumption.md)
25. [`q-stock-report`](okr-o2-flows/25-q-stock-report.md)
26. [`f-bank-account-transfer`](okr-o2-flows/26-f-bank-account-transfer.md)
27. [`w-subaccount`](okr-o2-flows/27-w-subaccount.md)
28. [`w-cost-center-project`](okr-o2-flows/28-w-cost-center-project.md)
29. [`f-open-period`](okr-o2-flows/29-f-open-period.md)
30. [`f-asset-amortization`](okr-o2-flows/30-f-asset-amortization.md)
31. [`f-manual-journal-post`](okr-o2-flows/31-f-manual-journal-post.md)
32. [`q-financial-reports`](okr-o2-flows/32-q-financial-reports.md)
33. [`q-taxes-and-rates`](okr-o2-flows/33-q-taxes-and-rates.md)
34. [`q-fiscal-status`](okr-o2-flows/34-q-fiscal-status.md)
35. [`w-commercial-setup`](okr-o2-flows/35-w-commercial-setup.md)
36. [`w-company-users-numbering`](okr-o2-flows/36-w-company-users-numbering.md)
37. [`e-unknown-document`](okr-o2-flows/37-e-unknown-document.md)
38. [`e-invalid-write`](okr-o2-flows/38-e-invalid-write.md)
39. [`e-ambiguous-customer`](okr-o2-flows/39-e-ambiguous-customer.md)
40. [`e-duplicate-payment-term`](okr-o2-flows/40-e-duplicate-payment-term.md)
41. [`e-closed-period`](okr-o2-flows/41-e-closed-period.md)
42. [`e-delete-processed-collection`](okr-o2-flows/42-e-delete-processed-collection.md)

## Hallazgos del recorrido (23 oct)

- **Seed de local-env sin secuencia de identificador de contacto:** el alta de contactos fallaba con
  «No se pudo encontrar una secuencia: EM_Etgo_Identifier». La siembra de GOClient no corre la
  creación de secuencias que hace el onboarding (`OnboardingSequenceGeneratorService`). Se arregló
  solo en la base del entorno, insertando las 2 secuencias transaccionales (contacto y tarea) con la
  máscara `#######`. Antes de sembrar Holded/Etendo para la suite hay que confirmar que el tenant de
  prueba sí las tiene.
- **Período contable cerrado para la fecha de hoy:** el seed abre enero–abril 2026; completar un
  documento con fecha de octubre falla con «El período contable de la fecha del documento no está
  abierto». El setup de las pruebas de documentos tiene que abrir el período (o es `f-open-period`).
- **Aviso de crédito:** Juan Perez muestra "Crédito límite superado 355,20 €" al presupuestar.
  Conviene que las pruebas usen un cliente propio (`Cliente MCPFLOW`) para no depender de eso.
- **Las listas de Cobro y Pago filtran por defecto los últimos 30 días;** un agente que lista sin
  filtro de fecha puede no ver cobros más viejos.

## Registros que quedaron en el entorno ETP-5848

Contacto `Cliente MCPFLOW Ventas`; pedido PV1000000 → albarán 1000000 → factura FV1000000 (cobro
parcial de 20 €); presupuesto 1000000 → factura FV1000001; período octubre 2026 abierto. Lo creado
por los recorridos con agentes (categoría `MCPFLOW-CAT`, condición de pago «MCPFLOW Condición 17
días», tarifa «MCPFLOW Tarifa») sigue ahí.

## Próxima iteración

1. Revisar con Valentin el listado: qué se fusiona, qué se separa, qué falta.
2. Convertir 👁/📄 en ✅ corriendo cada flujo en la UI.
3. Confirmar la columna Holded contra el `tools/list` en vivo (requiere el login OAuth).
4. Agregar las pruebas que salen del MCP de Holded (Holded Only) y las de error (`e-`).
