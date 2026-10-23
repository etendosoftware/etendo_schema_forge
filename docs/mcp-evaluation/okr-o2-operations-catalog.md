# Catálogo de operaciones — OKR O2 (versión base, 20 oct 2026)

**Versión base, se va a iterar.** Plan que lo usa: `docs/plans/2026-10-22-mcp-okr-metric-base-plan.md` (T1).

Catálogo de operaciones de negocio para iterar. **No son tareas todavía**: de acá salen las tareas de la suite `okr`.
Criterio de la columna "Ruta": lo que ya está verificado por evidencia propia (auditorías de `docs/mcp-evaluation/`) va marcado; lo demás es **verificar** y no se asume.

Leyenda: `E` = Etendo Go · `H` = Holded · **capacidad** = una plataforma no puede hacerlo con su MCP · **medida** = las dos pueden y se compara.

## A. Maestro de contactos
| # | Operación | Verificación objetiva | E | H |
|---|---|---|---|---|
| A1 | Crear cliente con datos fiscales (nombre, NIF, dirección) | El cliente existe con esos valores | verificar | `create_contact` (verificar) |
| A2 | Buscar cliente por NIF | Devuelve ese cliente, uno solo | verificar | verificar |
| A3 | Buscar cliente por nombre parcial | Devuelve los que coinciden | **falla**: no hay búsqueda por texto parcial (finding 2026-09-14) | verificar |
| A4 | Actualizar la dirección de un cliente | La dirección nueva se lee de vuelta | verificar | verificar |
| A5 | Listar contactos | Lista completa, sin faltantes silenciosos | verificar | `list_contacts` (evidencia: existe) |
| A6 | Cliente ambiguo: dos homónimos | **Debe preguntar**, no elegir uno | verificar | verificar |

## B. Catálogo y stock
| # | Operación | Verificación objetiva | E | H |
|---|---|---|---|---|
| B1 | Crear producto con precio de venta y de compra | Se leen los dos precios | ✅ evidencia 06-10 (10 llamadas) | 1 write, **sin lectura** |
| B2 | Cambiar el precio de venta | Precio nuevo leído de vuelta | verificar | `update_product` |
| B3 | Consultar precio de venta, compra y stock | Los tres valores | ✅ factible | ✅ `create_product`/`update_product_stock` |
| B4 | Entrada de mercadería (recepción) | El stock sube exactamente | verificar (necesita documento de inventario) | verificar |
| B5 | Ajuste de stock | El stock queda en el valor objetivo | verificar | `update_product_stock` |
| B6 | Productos bajo un mínimo | Lista correcta | verificar | verificar |
| B7 | Buscar producto por nombre parcial | Encuentra con texto parcial | **falla**: sin búsqueda parcial (finding 2026-09-14) | verificar |

## C. Venta: pedido y factura
| # | Operación | Verificación objetiva | E | H |
|---|---|---|---|---|
| C1 | Crear pedido de venta en borrador (1 línea) | Pedido con la línea y el total | verificar | verificar |
| C2 | Crear pedido con dos líneas | Total y líneas correctas | verificar | verificar |
| C3 | Consultar pedidos de un cliente | Solo los de ese cliente | `orderreference` nunca se puede leer (finding 2026-09-14) | verificar |
| C4 | Completar / aprobar un pedido | Estado final = completado | ✅ `documentAction` | ✅ `approve_sales_order` (**sin lectura de estado**: verificar de otra forma) |
| C5 | Anular pedido en borrador | Pedido anulado, sin stock comprometido | verificar | verificar |
| C6 | Consultar disponibilidad de stock para una línea | Cantidad disponible real | verificar | verificar |
| C7 | Facturar un producto y emitir (draft + issue) | Factura completada con el marcador | ✅ 12 llamadas, 1ª fallida (evidencia 06-10) | **capacidad: no puede** (no hay `create_invoice`; proforma como sustituto, ilegible) |
| C8 | Factura con varias líneas | Total = suma de líneas | verificar | **capacidad: no puede** |
| C9 | Crear factura desde un pedido | La factura referencia el pedido | verificar | **capacidad: no puede** |
| C10 | Anular una factura emitida | Factura anulada | verificar | **capacidad: no puede** |
| C11 | Rectificar con nota de crédito | Nota de crédito vinculada | verificar | **capacidad: no puede** |
| C12 | Consultar el estado de una factura | Estado correcto | verificar | **capacidad: no puede** |

## D. Cobros y tesorería
| # | Operación | Verificación objetiva | E | H |
|---|---|---|---|---|
| D1 | Facturas pendientes de un cliente | Las pendientes y sus saldos | verificar | verificar |
| D2 | Saldo pendiente total (aging) | Total correcto | ✅ 1 llamada por `generate_aging_receivable` (evidencia 06-10); ruta "pending+partial" = 2 y 1ª incompleta (IMP-50) | ✅ 1 llamada, `status:"outstanding"` |
| D3 | Cobrar factura completa | Factura saldada | ✅ (suite treasury) | verificar |
| D4 | Cobro parcial | Saldo restante correcto | verificar | verificar |
| D5 | Aplicar un pago a varias facturas | Todas saldadas, suma correcta | verificar | verificar |
| D6 | Depósito manual en cuenta | Saldo de la cuenta sube | ✅ (suite treasury) | verificar |
| D7 | Transferencia entre cuentas | Una baja, otra sube | ✅ (suite treasury) | verificar |
| D8 | Transferencia bancaria (PIS) | Movimiento registrado | ✅ (suite treasury) | verificar |
| D9 | Borrar un cobro ya procesado | **Debe negarse** y no borrar | ✅ (suite treasury) | verificar |

## E. Compras
| # | Operación | Verificación objetiva | E | H |
|---|---|---|---|---|
| E1 | Registrar factura de compra | Compra creada con importe | verificar | verificar |
| E2 | Compras pendientes de pago | Lista y saldos | verificar | verificar |
| E3 | Pago parcial de una compra | Saldo restante correcto | ✅ (suite treasury) | verificar |
| E4 | Sobrepago de una compra | Se registra y el saldo queda a favor | ✅ (suite treasury) | verificar |

## F. Consultas, reportes y errores
| # | Operación | Verificación objetiva | E | H |
|---|---|---|---|---|
| F1 | Ventas del mes | Total correcto | verificar | verificar |
| F2 | Clientes por volumen de compra | Ranking correcto | verificar | verificar |
| F3 | Descubrir qué puede hacer el MCP | Respuesta usable por un agente | ✅ (suite discoverability) | verificar |
| F4 | Pedir un documento inexistente | **Debe negarse** sin inventar | ✅ (semilla) | ✅ (evidencia: 2/3) |
| F5 | Escribir con dato inválido (cantidad negativa) | **Debe negarse**, no crear nada | ✅ (semilla) | ✅ (422 no recuperable sin `list_contacts`) |
| F6 | Documento reciente (alcance acotado) | Lista acotada, sin leer todo el tenant | ✅ con alcance por marcador | verificar |

## Cómo se usa esto
1. Se recorre la tabla y se marca cada operación como **medida**, **capacidad** o **fuera** (no es tarea de negocio real, o no es verificable).
2. Las marcadas forman el universo; de ahí se eligen las ~30 que entran a la suite, cada una con su razón escrita antes de correrla.
3. Las `capacidad` cuentan para KR2.1 separadas (victorias por capacidad) y son candidatas naturales para KR2.2.
4. Toda fila con "verificar" se confirma contra el catálogo real de tools de cada MCP antes de convertirla en tarea.
