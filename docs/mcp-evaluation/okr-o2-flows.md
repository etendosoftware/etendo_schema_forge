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

### 1. `w-customer-crud` — Alta, cambio y baja de un cliente
- **Ventanas:** Contactos (`/contacts`), Categoría de Contacto (`/business-partner-category`).
- **Pedido funcional:** "Dá de alta a la empresa Cliente MCPFLOW como cliente, con el correo
  compras@mcpflow.test. Después cambiale el teléfono a 600 000 000. Al final, borralo: lo cargué
  por error."
- **Verificación:** el contacto existe con ese correo y ese teléfono antes del borrado; después del
  borrado ya no aparece.
- **Datos previos:** ninguno. Obligatorios: razón social, categoría de contacto (por defecto
  «Cliente») y clave NIF del país.
- **Evidencia UI:** ✅ alta (después del arreglo de secuencia, ver Hallazgos) y alta/edición/baja
  de una categoría de contacto. 👁 edición y baja del contacto (hay botón Eliminar en la ficha).
- **Holded:** alta, cambio y baja sí; no tiene tool para listar ni leer contactos, así que la
  verificación de su lado depende de la respuesta del alta.

### 2. `f-quotation-to-invoice` — Presupuesto aceptado y facturado
- **Ventanas:** Presupuesto (`/sales-quotation`), Factura (`/sales-invoice`).
- **Pedido funcional:** "Hacele un presupuesto a Cliente MCPFLOW por 2 Fernet. Lo aceptó: facturalo
  directamente, sin pedido ni albarán."
- **Verificación:** hay un presupuesto de ese cliente con 1 línea (2 × Fernet) y una factura
  **completada** relacionada, con el mismo total.
- **Datos previos:** cliente y producto existentes.
- **Evidencia UI:** ✅ presupuesto 1000000 → "Enviar a evaluación" → Confirmar → "Facturar
  directamente" → factura FV1000001 completada (106,48 €). La otra opción es "Crear pedido de venta".
- **Holded:** presupuestos sí (crear, aceptar); facturar no (no hay alta de facturas por MCP).

### 3. `f-order-ship-invoice` — Pedido → albarán → factura
- **Ventanas:** Pedido (`/sales-order`), Albarán (`/goods-shipment`), Factura (`/sales-invoice`).
- **Pedido funcional:** "Cliente MCPFLOW nos pidió 3 Aguas. Cargá el pedido, prepará la entrega
  desde el almacén principal y facturá lo entregado."
- **Verificación:** pedido completado con 1 línea (3 × Agua); albarán completado con 3 unidades
  enlazado al pedido; factura completada por el mismo total (43,56 € con la tarifa del seed),
  "Entregado 100 %".
- **Datos previos:** cliente con dirección, producto con stock, **período contable del día abierto**
  (ver Hallazgos).
- **Evidencia UI:** ✅ pedido PV1000000 → Confirmar (con "Crear albarán") → albarán 1000000 →
  Confirmar (con "Crear factura de venta") → factura FV1000000 completada.
- **Holded:** pedido y albarán sí; factura no.

### 4. `w-draft-order-edit-delete` — Corregir y descartar un pedido en borrador
- **Ventanas:** Pedido (`/sales-order`).
- **Pedido funcional:** "Empezá un pedido para Cliente MCPFLOW con 5 Cervezas, pero no lo confirmes.
  Ahora cambiá la cantidad a 4. Al final el cliente se arrepintió: borrá ese pedido."
- **Verificación:** mientras existe, el pedido está en borrador con 4 unidades; al final no existe.
- **Datos previos:** cliente y producto.
- **Evidencia UI:** 👁 un pedido guardado sin confirmar queda en "Borrador" con botón Eliminar; un
  pedido completado no lo tiene. Obligatorios de cabecera: contacto, fecha, dirección, moneda,
  tarifa, condiciones de pago y **almacén** (no se completa solo; sin almacén no deja guardar).
- **Holded:** pedidos de venta: crear, modificar y borrar sí.

### 5. `f-collect-invoice` — Cobro parcial y saldo restante
- **Ventanas:** Factura (`/sales-invoice`), Cobro (`/payment-in`).
- **Pedido funcional:** "Cliente MCPFLOW nos pagó 20 € en efectivo a cuenta de su última factura.
  Registralo y decime cuánto le queda por pagar."
- **Verificación:** la factura queda "Parcial · 20,00 € de 43,56 €", con un cobro de 20 € en estado
  "Cobro depositado" en caja; la respuesta dice 23,56 €.
- **Datos previos:** una factura completada pendiente de cobro.
- **Evidencia UI:** ✅ desde la factura: "Pendiente" → Cobros de la factura → Añadir cobro (importe,
  fecha, método, cuenta) → Confirmar. El cobro aparece en Cobro (filtro por defecto: últimos 30
  días). Un cobro procesado ofrece "Reactivar" y "Eliminar".
- **Holded:** pagos sí; el cobro contra una factura depende de poder leerla (verificar).

### 6. `f-credit-note` — Factura rectificativa
- **Ventanas:** Factura (`/sales-invoice`, pestaña Rectificaciones; filtro "Factura rectificativa").
- **Pedido funcional:** "Una de las 3 Aguas que le facturamos a Cliente MCPFLOW vino rota. Hacele la
  rectificativa por esa unidad."
- **Verificación:** existe una factura rectificativa completada, ligada a la original, por 1 unidad.
- **Datos previos:** factura completada.
- **Evidencia UI:** 👁 la factura completada tiene pestaña Rectificaciones y el menú ⋮ ofrece
  "Reactivar" y "Contabilizar". No ejecutado.
- **Holded:** no (no crea facturas ni notas de crédito por MCP; solo las lee).

### 7. `f-customer-return` — Devolución de un cliente
- **Ventanas:** Albarán (`/goods-shipment`), Albarán de devolución (`/return-material-receipt`).
- **Pedido funcional:** "Cliente MCPFLOW nos devolvió 1 de las Aguas que le entregamos. Registrá la
  devolución al almacén principal."
- **Verificación:** albarán de devolución completado, con "Albarán origen" el de la entrega y 1
  unidad; el stock del producto sube en 1.
- **Datos previos:** albarán de venta completado.
- **Evidencia UI:** 👁 el albarán completado tiene el botón "Crear Devolución"; la devolución pide
  contacto, fecha, almacén, dirección y opcionalmente el albarán de origen. No ejecutado.
- **Holded:** verificar.

### 8. `w-quick-sale` — Venta rápida de mostrador
- **Ventanas:** Venta Rápida (`/quick-sales-order`, prueba de concepto).
- **Pedido funcional:** "Vendé en mostrador 2 Aguas a un cliente anónimo, cobradas en efectivo."
- **Verificación:** queda una venta en el historial con 2 × Agua y su cobro en efectivo.
- **Datos previos:** ninguno (cliente anónimo por defecto).
- **Evidencia UI:** 👁 pantalla tipo TPV: cliente (por defecto "Cliente Anónimo"), productos por
  categoría con stock, carrito, pago efectivo/tarjeta/transferencia, "Confirmar Pago" e Historial.
- **Holded:** no hay equivalente de TPV por MCP.
- **Nota:** en Venta Rápida el Agua sale a 5,00 € y en el pedido a 12,00 € (tarifa distinta).

### 9. `f-purchase-receive-invoice` — Pedido de compra → recepción → factura
- **Ventanas:** Pedido, Albarán y Factura de Compras (`/purchase-order`, `/goods-receipt`,
  `/purchase-invoice`) y Relación albarán-factura (`/matched-purchase-invoices`, solo lectura).
- **Pedido funcional:** "Pedile 10 Cervezas a Proveedor Mayorista para el almacén principal. Ya
  llegaron: registrá la recepción y cargá su factura con el número MCPFLOW-FC-1."
- **Verificación:** pedido completado; albarán de compra completado con 10 unidades; factura de
  compra completada con esa referencia; en Relación albarán-factura aparece el vínculo entre la
  línea del albarán y la de la factura; el stock sube en 10.
- **Datos previos:** proveedor con dirección y producto.
- **Evidencia UI:** 👁 obligatorios del pedido: contacto, fecha, dirección, **fecha de entrega
  esperada**, almacén, condiciones de pago, moneda y tarifa. La factura de compra pide además
  tipo de documento, fecha contable y método de pago. No ejecutado.
- **Holded:** pedido de compra y recepción sí; factura de compra (purchases/bills) verificar.

### 10. `f-pay-purchase-invoice` — Pagar una factura de proveedor
- **Ventanas:** Factura de compra (`/purchase-invoice`), Pago (`/payment-out`).
- **Pedido funcional:** "Pagale por transferencia a Proveedor Mayorista la factura MCPFLOW-FC-1."
- **Verificación:** la factura queda pagada (saldo pendiente 0) y hay un pago por ese importe.
- **Datos previos:** factura de compra completada.
- **Evidencia UI:** 👁 Pago no tiene "Nuevo" en la lista: se paga desde la factura, igual que el
  cobro (flujo 5). 📄 guía `payment-out.md`.
- **Holded:** pagos sí; verificar el vínculo con la compra.

### 11. `f-vendor-return` — Devolución a proveedor
- **Ventanas:** Albarán de compra (`/goods-receipt`), Albarán de devolución de compras
  (`/return-to-vendor-shipment`).
- **Pedido funcional:** "Dos de las Cervezas que recibimos de Proveedor Mayorista vinieron
  vencidas. Devolvéselas."
- **Verificación:** albarán de devolución completado, con origen la recepción y 2 unidades; el
  stock baja en 2.
- **Datos previos:** albarán de compra completado.
- **Evidencia UI:** 👁 botón "Crear Devolución" en el albarán de compra completado.
- **Holded:** verificar.

### 12. `w-quick-purchase` — Compra rápida
- **Ventanas:** Compra Rápida (`/quick-purchase-order`, prueba de concepto).
- **Pedido funcional:** "Armá un pedido rápido de 6 Quesos Sardos y mandáselo por correo a su
  proveedor."
- **Verificación:** existe el pedido de compra con 6 × Queso Sardo para ese proveedor.
- **Evidencia UI:** 👁 filtro de proveedor, productos, carrito, "Pedidos Anteriores" y envío por
  Email, WhatsApp o PDF.
- **Holded:** no hay equivalente; el envío por correo de pedidos existe (`send`).

### 13. `w-product-crud` — Alta, cambio y baja de un producto
- **Ventanas:** Producto (`/product`).
- **Pedido funcional:** "Dá de alta el producto Producto MCPFLOW, que compramos a 4 € y vendemos a
  9 €. Después cambiale la descripción a 'caja de 6'. Al final borralo."
- **Verificación:** el producto existe con los dos precios y la descripción; después del borrado no.
- **Datos previos:** ninguno. Obligatorios: código, nombre, tipo, categoría, unidad y grupo de
  impuesto (los selectores vienen con valor por defecto).
- **Evidencia UI:** ✅ alta, edición (releída) y baja. 👁 los precios van en la pestaña Precio
  (tarifas); no se cargaron.
- **Holded:** alta, cambio y baja sí; no tiene tool para listar ni leer productos.

### 14. `w-product-category-crud` — Categoría de producto
- **Ventanas:** Categoría del producto (`/product-category`).
- **Pedido funcional:** "Creá la categoría de productos MCPFLOW Bebidas sin alcohol, ponele una
  descripción y después borrala."
- **Verificación:** la categoría existe con esa descripción y después ya no.
- **Evidencia UI:** ✅ alta, edición y baja. Rechaza un identificador repetido ("Ya existe un
  registro con este identificador").
- **Holded:** verificar.

### 15. `w-warehouse-crud` — Almacén
- **Ventanas:** Almacén (`/warehouse`).
- **Pedido funcional:** "Abrimos un depósito nuevo en Calle MCPFLOW 1, Madrid. Dalo de alta como
  almacén, después corregile el nombre a Depósito MCPFLOW Norte y al final borralo."
- **Verificación:** el almacén existe con esa dirección y nombre; después ya no.
- **Datos previos:** ninguno. Obligatorios: identificador, nombre y dirección.
- **Evidencia UI:** 👁 formulario y botón Eliminar; la ficha tiene pestañas Productos,
  Transacciones y Contabilidad. No se completó la dirección.
- **Holded:** almacenes sí (verificar alta y baja).

### 16. `f-physical-inventory` — Recuento de stock
- **Ventanas:** Inventario físico (`/physical-inventory`).
- **Pedido funcional:** "Contamos el almacén principal: hay 280 Aguas. Ajustá el stock a ese número."
- **Verificación:** inventario completado en el almacén principal con una línea de Agua contada en
  280; el stock del Agua queda en 280.
- **Datos previos:** producto con stock conocido.
- **Evidencia UI:** 👁 obligatorios: fecha, nombre y almacén; un inventario del seed tiene 4 líneas
  y está contabilizado. 📄 la guía describe generar líneas de conteo y confirmar.
- **Holded:** parcial (ajuste de stock directo, sin documento de recuento).

### 17. `f-warehouse-transfer` — Pasar stock entre almacenes
- **Ventanas:** Movimiento entre almacenes (`/goods-movements`).
- **Pedido funcional:** "Pasá 5 Fernet del almacén principal al secundario."
- **Verificación:** movimiento procesado con 1 línea (5 × Fernet, de principal a secundario); el
  stock baja en uno y sube en el otro.
- **Datos previos:** dos almacenes (el seed tiene Almacen Principal y Almacén Secundario).
- **Evidencia UI:** 👁 obligatorios: nombre y fecha; hay 2 movimientos de ejemplo procesados.
- **Holded:** verificar.

### 18. `f-internal-consumption` — Consumo interno
- **Ventanas:** Consumo interno (`/internal-consumption`).
- **Pedido funcional:** "Usamos 2 Quesos Sardos para una degustación. Descontalos del stock como
  consumo interno."
- **Verificación:** consumo confirmado con 2 × Queso Sardo; el stock baja en 2.
- **Evidencia UI:** 👁 obligatorios: fecha y nombre; lista vacía en el seed. 📄 se confirma solo con
  líneas; se puede anular y contabilizar.
- **Holded:** no.

### 19. `q-stock-report` — Consultar el stock
- **Ventanas:** Informes de inventario (`/report-viewer?category=inventory`).
- **Pedido funcional:** "¿Cuántas unidades de cada producto tenemos en el almacén principal?"
- **Verificación:** la respuesta coincide producto por producto con el stock real.
- **Evidencia UI:** 👁 un informe, "Reporte de Stock", exportable a PDF, XLSX y CSV.
- **Holded:** verificar (productos sin lectura).

### 20. `f-bank-account-transfer` — Cuenta nueva y transferencia
- **Ventanas:** Cuentas (`/financial-account`).
- **Pedido funcional:** "Abrimos una cuenta en el banco MCPFLOW. Dala de alta y pasale 500 € desde la
  caja."
- **Verificación:** la cuenta existe; la caja baja 500 € y la cuenta nueva sube 500 €.
- **Evidencia UI:** 👁 3 cuentas en el seed (Caja, Cuenta de Banco, Tarjeta); "Nueva cuenta" abre un
  formulario modal; también hay "Reglas de matcheo". Transferencias y depósitos están cubiertos por
  la suite `treasury` (catálogo D6–D8).
- **Holded:** cuentas bancarias y movimientos sí (verificar transferencia).

### 21. `w-subaccount` — Subcuenta contable
- **Ventanas:** Plan de cuentas (`/chart-of-accounts`).
- **Pedido funcional:** "Necesito una cuenta contable para los gastos de MCPFLOW Publicidad, dentro de
  los gastos. Creala y después cambiale el nombre a MCPFLOW Marketing."
- **Verificación:** la subcuenta existe bajo el grupo de gastos, con el nombre final.
- **Evidencia UI:** 👁 "Nueva subcuenta" abre un modal con nombre, código y tipo de cuenta.
- **Holded:** plan de cuentas sí (verificar alta).

### 22. `w-cost-center-project` — Centro de costos y proyecto
- **Ventanas:** Centro de costos (`/cost-center`), Proyecto (`/service-project`).
- **Pedido funcional:** "Creá el centro de costos MCPFLOW Tienda y el proyecto MCPFLOW Reforma.
  Agregale una descripción a cada uno y después borralos."
- **Verificación:** los dos existen con su descripción y después ya no.
- **Evidencia UI:** ✅ alta, edición (releída) y baja de los dos. Obligatorios: identificador y nombre.
- **Holded:** proyectos sí; centros de costos no.

### 23. `f-open-period` — Año fiscal y apertura de período
- **Ventanas:** Calendario (`/calendar`), Esquema contable (`/general-ledger-configuration`).
- **Pedido funcional:** "No puedo facturar con fecha de hoy porque el mes está cerrado. Abrí el
  período contable del mes actual."
- **Verificación:** el período del mes actual figura "Todos abiertos"; después se puede completar un
  documento con fecha de hoy.
- **Evidencia UI:** ✅ Calendario → año 2026 → Períodos → "Abrir/Cerrar Periodo" → Abierto. También
  ✅ alta, edición y baja de un año fiscal (2031). 👁 Esquema contable es una pantalla de 4 pestañas
  (General, Valores por defecto, Dimensiones, Cuentas generales): queda como consulta.
- **Holded:** no.

### 24. `f-asset-amortization` — Activo y su amortización
- **Ventanas:** Categoría de activo (`/asset-group`), Activos (`/assets`), Amortización (`/amortization`).
- **Pedido funcional:** "Compramos una impresora MCPFLOW por 1.200 €. Dala de alta como activo y
  generá su amortización."
- **Verificación:** el activo existe con ese valor; hay una amortización con líneas para ese activo.
- **Datos previos:** categoría de activo (el seed trae «Genérico»).
- **Evidencia UI:** ✅ alta, edición y baja de categoría de activo y de activo. 👁 un activo del seed
  muestra "Crear amortización" y la pestaña Plan de amortización. Amortización no tiene "Nuevo": se
  genera desde el activo.
- **Holded:** no.

### 25. `f-manual-journal-post` — Asiento manual y contabilización
- **Ventanas:** Asientos Manuales (`/manual-journals`), Documentos no contabilizados (`/not-posted-documents`).
- **Pedido funcional:** "Registrá un asiento por 100 €: gasto de alquiler contra caja, descripción
  MCPFLOW Alquiler. Después contabilizalo."
- **Verificación:** asiento completado con débitos = créditos = 100 €; no aparece en Documentos no
  contabilizados.
- **Evidencia UI:** 👁 obligatorios: fecha, período y descripción; líneas aparte. 📄 no deja guardar
  si débito ≠ crédito; solo se borra en borrador. Documentos no contabilizados lista lo pendiente y
  contabiliza de a uno o en lote.
- **Holded:** asientos contables sí (verificar alta).

### 26. `q-financial-reports` — Informes financieros
- **Ventanas:** Informes de finanzas (`/report-viewer?category=finance`).
- **Pedido funcional:** "¿Cuánto nos deben los clientes y desde hace cuánto? Y pasame el balance de
  situación del año."
- **Verificación:** el total por cobrar coincide con las facturas pendientes; el balance cuadra
  (activo = pasivo + patrimonio).
- **Evidencia UI:** 👁 8 informes, todos en PDF, XLSX y CSV: Antigüedad de Pagos, Antigüedad de
  Cobros, Balance de Situación, Pérdidas y Ganancias, Libro Mayor, Diario de Asientos, Balance de
  Sumas y Saldos, Informe de Impuestos.
- **Holded:** parcial (cobros pendientes sí; balance verificar).

### 27. `q-taxes-and-rates` — Impuestos, categorías y tipos de cambio
- **Ventanas:** Impuesto (`/tax`), Categoría de Impuesto (`/tax-category`), Rangos de conversión (`/conversion-rates`).
- **Pedido funcional:** "¿Qué IVA se le aplica a una venta normal en España? ¿Y a cuánto está hoy el
  dólar contra el euro?"
- **Verificación:** la respuesta da el tipo general vigente y el tipo de cambio cargado.
- **Evidencia UI:** 👁 Impuesto (75) y Categoría (38) sin "Nuevo", solo Editar; Rangos de conversión
  (2) solo lectura, con marca Synced para los descargados automáticamente.
- **Holded:** impuestos sí (lectura); tipos de cambio verificar.

### 28. `q-fiscal-status` — Situación fiscal de la empresa
- **Ventanas:** Configuración Fiscal (`/fiscal-config`), Monitor Fiscal (`/fiscal-monitor`), Modelos Fiscales (`/fiscal-models`).
- **Pedido funcional:** "¿Tenemos configurado el envío de facturas a Hacienda? ¿Qué modelos de
  impuestos tenemos presentados este año?"
- **Verificación:** la respuesta dice que no hay sistema fiscal configurado y que no hay modelos (es
  el estado del seed).
- **Evidencia UI:** 👁 Monitor: "No hay sistema fiscal configurado para esta organización";
  Configuración Fiscal abre un asistente (SII/TBAI/Verifactu) con "Omitir" y "Continuar"; Modelos
  Fiscales: catálogo (0) con filtros de año, modelo y estado.
- **Holded:** no.
- **Nota:** se deja como consulta a propósito: configurar el envío a Hacienda no es reversible.

### 29. `w-commercial-setup` — Tarifa y condiciones de pago
- **Ventanas:** Tarifa (`/price-list`), Condiciones de pago (`/payment-term`).
- **Pedido funcional:** "Creá la tarifa de venta MCPFLOW Mayoristas y una condición de pago a 45
  días. Después cambiales la descripción y el nombre, y al final borralas."
- **Verificación:** las dos existen con los valores editados y después ya no.
- **Evidencia UI:** ✅ alta, edición (releída) y baja de las dos. Condiciones de pago **rechaza una
  segunda condición con los mismos días** ("Ya existe la condición de pago … con esos días"):
  sirve también para una prueba `e-`.
- **Holded:** tarifas sí (verificar alta); condiciones de pago verificar.

### 30. `w-company-users-numbering` — Usuarios, roles, datos de la empresa y numeración
- **Ventanas:** Usuarios (`/user`), Roles (`/roles`), Organización (`/organization`), Secuencias de documentos (`/document-sequence`).
- **Pedido funcional:** "Dá de alta a usuario.mcpflow@example.com con permisos de ventas. Después
  decime con qué prefijo salen numeradas nuestras facturas de venta."
- **Verificación:** el usuario existe con el rol de ventas; la respuesta dice "FV".
- **Evidencia UI:** ✅ alta, edición y baja de usuario (al crearlo manda la invitación por correo).
  👁 Roles es una matriz de permisos por ventana (59 filas); Organización es una ficha única
  editable (datos fiscales, IAE, representantes); Secuencias (6, sin alta ni baja) edita prefijo y
  próximo número.
- **Holded:** no hay usuarios por MCP; series de numeración sí (lectura).

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
