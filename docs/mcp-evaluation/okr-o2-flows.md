# Flujos de prueba — OKR O2 (iteración 1, 23 oct 2026)

**Tarea:** ETP-5848 (T1). **Plan:** `docs/plans/2026-10-22-mcp-okr-metric-base-plan.md`.
**Base de operaciones:** `docs/mcp-evaluation/okr-o2-operations-catalog.md`.

Listado de 30 flujos que cubren **todas las ventanas de la barra lateral** de Etendo Go. Es la
primera iteración: un flujo mínimo por ventana (entrar, leer, crear, editar, borrar), agrupando
ventanas cuando el flujo natural las encadena. Se itera; todavía **no son pruebas de la suite**.

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
| 1 | `w-customer-crud` | Alta, cambio y baja de un cliente | Contactos, Categoría de Contacto | ✅ | sí (sin lectura) |
| 2 | `f-quotation-to-invoice` | Presupuesto aceptado y facturado | Presupuesto, Factura | ✅ | parcial |
| 3 | `f-order-ship-invoice` | Pedido → albarán → factura | Pedido, Albarán, Factura | ✅ | parcial |
| 4 | `w-draft-order-edit-delete` | Corregir y descartar un pedido en borrador | Pedido | 👁 | sí |
| 5 | `f-collect-invoice` | Cobro parcial y saldo restante | Factura, Cobro | ✅ | verificar |
| 6 | `f-credit-note` | Factura rectificativa | Factura (Rectificaciones) | 👁 | no |
| 7 | `f-customer-return` | Devolución de un cliente | Albarán, Albarán de devolución | 👁 | verificar |
| 8 | `w-quick-sale` | Venta rápida de mostrador | Venta Rápida | 👁 | no |
| 9 | `f-purchase-receive-invoice` | Pedido de compra → recepción → factura | Pedido, Albarán, Factura (compras), Relación albarán-factura | 👁 | parcial |
| 10 | `f-pay-purchase-invoice` | Pagar una factura de proveedor | Factura (compras), Pago | 👁 | verificar |
| 11 | `f-vendor-return` | Devolución a proveedor | Albarán (compras), Albarán de devolución (compras) | 👁 | verificar |
| 12 | `w-quick-purchase` | Compra rápida | Compra Rápida | 👁 | no |
| 13 | `w-product-crud` | Alta, cambio y baja de un producto | Producto | ✅ | sí (sin lectura) |
| 14 | `w-product-category-crud` | Alta, cambio y baja de una categoría | Categoría del producto | ✅ | verificar |
| 15 | `w-warehouse-crud` | Alta, cambio y baja de un almacén | Almacén | 👁 | verificar |
| 16 | `f-physical-inventory` | Recuento de stock | Inventario físico | 👁 | parcial |
| 17 | `f-warehouse-transfer` | Pasar stock de un almacén a otro | Movimiento entre almacenes | 👁 | verificar |
| 18 | `f-internal-consumption` | Consumo interno de stock | Consumo interno | 👁 | no |
| 19 | `q-stock-report` | Consultar el stock | Informes (inventario) | 👁 | verificar |
| 20 | `f-bank-account-transfer` | Cuenta nueva y transferencia | Cuentas | 👁 | verificar |
| 21 | `w-subaccount` | Subcuenta contable | Plan de cuentas | 👁 | verificar |
| 22 | `w-cost-center-project` | Centro de costos y proyecto | Centro de costos, Proyecto | ✅ | parcial |
| 23 | `f-open-period` | Año fiscal y apertura de período | Calendario, Esquema contable | ✅ | no |
| 24 | `f-asset-amortization` | Activo y su amortización | Categoría de activo, Activos, Amortización | ✅/👁 | no |
| 25 | `f-manual-journal-post` | Asiento manual y contabilización | Asientos Manuales, Documentos no contabilizados | 👁 | verificar |
| 26 | `q-financial-reports` | Informes financieros | Informes (finanzas) | 👁 | verificar |
| 27 | `q-taxes-and-rates` | Impuestos, categorías y tipos de cambio | Impuesto, Categoría de Impuesto, Rangos de conversión | 👁 | parcial |
| 28 | `q-fiscal-status` | Situación fiscal de la empresa | Configuración Fiscal, Monitor Fiscal, Modelos Fiscales | 👁 | no |
| 29 | `w-commercial-setup` | Tarifa y condiciones de pago | Tarifa, Condiciones de pago | ✅ | verificar |
| 30 | `w-company-users-numbering` | Usuarios, roles, datos de la empresa y numeración | Usuarios, Roles, Organización, Secuencias de documentos | ✅/👁 | parcial |

**Fuera del listado** (no son una operación de negocio para un agente): Inicio (panel), Conectar
agente de IA (es la pantalla para conectar el MCP), Calendario unificado (prueba de concepto, solo
lectura).

## Flujos

Un archivo por flujo en [`okr-o2-flows/`](okr-o2-flows/):

1. [`w-customer-crud`](okr-o2-flows/01-w-customer-crud.md)
2. [`f-quotation-to-invoice`](okr-o2-flows/02-f-quotation-to-invoice.md)
3. [`f-order-ship-invoice`](okr-o2-flows/03-f-order-ship-invoice.md)
4. [`w-draft-order-edit-delete`](okr-o2-flows/04-w-draft-order-edit-delete.md)
5. [`f-collect-invoice`](okr-o2-flows/05-f-collect-invoice.md)
6. [`f-credit-note`](okr-o2-flows/06-f-credit-note.md)
7. [`f-customer-return`](okr-o2-flows/07-f-customer-return.md)
8. [`w-quick-sale`](okr-o2-flows/08-w-quick-sale.md)
9. [`f-purchase-receive-invoice`](okr-o2-flows/09-f-purchase-receive-invoice.md)
10. [`f-pay-purchase-invoice`](okr-o2-flows/10-f-pay-purchase-invoice.md)
11. [`f-vendor-return`](okr-o2-flows/11-f-vendor-return.md)
12. [`w-quick-purchase`](okr-o2-flows/12-w-quick-purchase.md)
13. [`w-product-crud`](okr-o2-flows/13-w-product-crud.md)
14. [`w-product-category-crud`](okr-o2-flows/14-w-product-category-crud.md)
15. [`w-warehouse-crud`](okr-o2-flows/15-w-warehouse-crud.md)
16. [`f-physical-inventory`](okr-o2-flows/16-f-physical-inventory.md)
17. [`f-warehouse-transfer`](okr-o2-flows/17-f-warehouse-transfer.md)
18. [`f-internal-consumption`](okr-o2-flows/18-f-internal-consumption.md)
19. [`q-stock-report`](okr-o2-flows/19-q-stock-report.md)
20. [`f-bank-account-transfer`](okr-o2-flows/20-f-bank-account-transfer.md)
21. [`w-subaccount`](okr-o2-flows/21-w-subaccount.md)
22. [`w-cost-center-project`](okr-o2-flows/22-w-cost-center-project.md)
23. [`f-open-period`](okr-o2-flows/23-f-open-period.md)
24. [`f-asset-amortization`](okr-o2-flows/24-f-asset-amortization.md)
25. [`f-manual-journal-post`](okr-o2-flows/25-f-manual-journal-post.md)
26. [`q-financial-reports`](okr-o2-flows/26-q-financial-reports.md)
27. [`q-taxes-and-rates`](okr-o2-flows/27-q-taxes-and-rates.md)
28. [`q-fiscal-status`](okr-o2-flows/28-q-fiscal-status.md)
29. [`w-commercial-setup`](okr-o2-flows/29-w-commercial-setup.md)
30. [`w-company-users-numbering`](okr-o2-flows/30-w-company-users-numbering.md)

## Hallazgos del recorrido (23 oct)

- **Seed de local-env sin secuencia de identificador de contacto:** el alta de contactos fallaba con
  «No se pudo encontrar una secuencia: EM_Etgo_Identifier». La siembra de GOClient no corre la
  creación de secuencias que hace el onboarding (`OnboardingSequenceGeneratorService`). Se arregló
  solo en la base del entorno, insertando las 2 secuencias transaccionales (contacto y tarea) con la
  máscara `#######`. Antes de sembrar Holded/Etendo para la suite hay que confirmar que el tenant de
  prueba sí las tiene.
- **Período contable cerrado para la fecha de hoy:** el seed abre enero–abril 2026; completar un
  documento con fecha de octubre falla con «El período contable de la fecha del documento no está
  abierto». El setup de las pruebas de documentos tiene que abrir el período (o es el flujo 23).
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
