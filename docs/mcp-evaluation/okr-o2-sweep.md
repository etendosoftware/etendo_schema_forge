# Barrido inicial de las pruebas — OKR O2

**Qué es:** una pasada de **1 repetición por prueba y por plataforma**, de a una, para asegurarse de
que cada prueba funciona antes de aprobarla y de medir con `REPEAT=3`. No es el número del KR.
Suite: `mcp-tests/suites/okr.yaml`. Pruebas: `docs/mcp-evaluation/okr-o2-flows.md`.

**Clasificación:**

| Marca | Significado | Qué se hace |
|---|---|---|
| ✅ | La prueba corre y su verificación detecta el resultado correcto | Lista para aprobar |
| 🔧 | La prueba falla por la prueba (preparación, verificación, redacción) | Se corrige y se repite |
| 🐞 | La prueba está bien y Etendo falla | Se mantiene; candidata a issue |
| ⛔ | Holded no puede (capacidad) | `notPossible`, Etendo Only |
| ❓ | Falta definir cómo verificarla | Decisión pendiente |

**Entorno:** local-env `ETP-5848` (`develop` del 2 nov), empresa GOClient, target `jwt` (MCP local con
JWT de `sws/login`), modelo `gemini/gemini-3.8-flash`. Holded: pendiente del login.

## Resultados

| # | Prueba | Etendo | Holded | Clase | Nota |
|---|---|---|---|---|---|
| 1 | `q-hello` | ✅ 2 llamadas · 82.139 tokens | — | ✅ | Ante un "Hola" llama `whoami` y `feedback` |
| 3 | `f-quotation-to-invoice` | ✅ 23 llamadas | ⛔ | ⛔ | Primer intento: nombre > 60 caracteres en el piloto (ver Hallazgos) |
| 4 | `f-order-ship-invoice` | ✅ 23 llamadas | ⛔ | ⛔ | |
| 7 | `f-collect-invoice` | ✅ 13 llamadas | ⛔ | ⛔ | Respondió 101 € y el saldo quedó en 101 € |
| 23 | `w-warehouse-crud` | ✅ 23 llamadas | — | ✅ | Solo alta (la baja final no se puede verificar) |
| 30 | `w-cost-center-project` | ✅ 19 llamadas | — | ✅ | Solo el proyecto |
| 35 | `q-taxes-and-rates` | ✅ 7 llamadas | — | ✅ | Solo IVA |
| 39 | `e-unknown-document` | ✅ 13 llamadas | — | ✅ | |
| 40 | ~~`e-invalid-write`~~ | ❌ creó el pedido con -3 | — | retirada | **Retirada del KR (2 nov):** Etendo acepta cantidades negativas por diseño (ver la ficha 40) |
| 43 | `e-closed-period` | ✅ 16 llamadas | ⛔ | ⛔ | No completó la factura y explicó el período cerrado |
| 2 | `w-customer-crud` | ✅ 25 llamadas (tope) | — | ✅ | Solo alta. Llegó al tope de 25 pasos antes de responder |
| 5 | `w-draft-order-edit-delete` | ✅ 17 llamadas | — | ✅ | Alta + cambio a 4 (sin el borrado final) |
| 8 | `f-collect-several-invoices` | ✅ 25 llamadas (tope) | ⛔ | ⛔ | Un cobro de 242 € para las dos facturas |
| 9 | `f-overpay-sales-invoice` | ✅ 13 llamadas | ⛔ | ⛔ | Dejó los 13,70 € a favor del cliente |
| 20 | `w-product-crud` | ✅ 24 llamadas | — | ✅ | Solo alta (con los dos precios) |
| 21 | `w-product-category-crud` | ✅ 10 llamadas | — | ✅ | Solo alta |
| 29 | `w-subaccount` | ✅ 21 llamadas | — | ✅ | Solo alta (62700001) |
| 37 | `w-commercial-setup` | ✅ 11 llamadas | — | ✅ | Solo la tarifa |
| 38 | `w-company-users-numbering` | ⚠️ 32 llamadas · 2.845.444 tokens | — | 🐞 🔧 | Con 50 pasos creó el usuario, pero **no puede asignarle el rol de ventas por MCP** ("role assignment is read-only via API"). La verificación solo mira que exista el usuario: hay que sumarle el rol |
| 41 | `e-ambiguous-customer` | ✅ 8 llamadas | — | ✅ | Detectó los dos clientes y no creó nada |
| 42 | `e-duplicate-payment-term` | ✅ 8 llamadas | — | ✅ | No la creó: ya existe una de 30 días |
| 5 | `f-order-direct-invoice` | ✅ 20 llamadas | ⛔ | ⛔ | 1.º intento 🔧: el servicio no existía y el agente se rindió (correcto). Ahora el servicio "Hora de instalación" es un dato fijo de la empresa |
| 10 | `f-undo-collection` | ✅ 8 llamadas | ⛔ | ⛔ | 1.º intento 🔧: al dato inicial (cobro) le faltaba la fecha |
| 11 | `f-credit-note` | ✅ 21 llamadas | ⛔ | ⛔ | Rectificativa FVR por 1 unidad (-121 €) |
| 12 | `f-void-invoice` | ❌ 15 llamadas | ⛔ | 🐞 | Reactivó la factura a borrador en vez de hacer la rectificativa (camino decidido como incorrecto el 23 oct) y lo dio por anulado |
| 13 | `w-send-invoice` | ❌ 13 llamadas | — | 🐞 ❓ | **No se puede enviar una factura creada por MCP:** sin PDF ("open the preview in the application") y el MCP no lo genera; los dos mensajes de error se remiten uno al otro. La verificación provisional (la respuesta nombra el correo) pasó igual: hay que cambiarla |
| 14 | `f-customer-return` | ✅ 14 llamadas | — | ✅ | |
| 15 | `q-dashboard-indicators` | ✅ 5 llamadas | — | ✅ | Cifras leídas por los datos iniciales justo antes (prueba exclusiva) |
| 16 | `q-sales-this-month` | ✅ 5 llamadas | — | ✅ | Solo sin IVA |
| 17 | `q-top-customers` | ✅ 4 llamadas | — | ✅ | |
| 18 | `f-purchase-receive-invoice` | ✅ 31 llamadas · 1.793.796 tokens | — | ✅ | Con 25 pasos no llegaba; con 50 completa pedido, recepción y factura |
| 19 | `f-pay-purchase-invoice` | ✅ 13 llamadas | — | ✅ | 🔧 dos veces: la referencia del proveedor tiene tope de 20 (ahora `F-1001`) |
| 20 | `f-vendor-return` | ✅ 15 llamadas | — | ✅ | |
| 24 | `f-physical-inventory` | ✅ 22 llamadas | — | ✅ | Stock compartido: prueba exclusiva |
| 25 | `f-warehouse-transfer` | ✅ 22 llamadas | — | ✅ ❓ | Verificación provisional: no aislada entre intentos |
| 26 | `f-internal-consumption` | ✅ 23 llamadas | — | ✅ ❓ | Verificación provisional: no aislada entre intentos |
| 27 | `q-stock-report` | ✅ 7 llamadas | — | ✅ | Solo Agua |
| 28 | `f-bank-account-transfer` | ✅ 25 llamadas · 1.661.759 tokens | — | ✅ | Con 50 pasos completa la cuenta y la transferencia |
| 31 | `f-open-period` | ✅ 10 llamadas | ⛔ | ⛔ | Con junio 2026 (cierra y reabre la prueba misma) |
| 32 | `f-asset-amortization` | ✅ 50 llamadas (tope) · tokens sin dato | ⛔ | ✅ ⚠️ | Con 50 pasos crea el activo, el plan y la amortización, justo en el tope. El último turno no informó tokens: con la regla 2 el intento sería no evaluable (ver Hallazgos) |
| 33 | `f-manual-journal-post` | ✅ 17 llamadas | — | ✅ | |
| 34 | `q-financial-reports` | ✅ 5 llamadas | — | ✅ | Solo lo que nos deben |
| 36 | `q-fiscal-status` | ✅ 31 llamadas | ⛔ | ✅ ❓ | Verificación provisional (la respuesta contiene "no") |

**Resumen del lado Etendo (43 pruebas, tope de 50 pasos desde el 2 nov):** 39 pasan y 4 fallan por
Etendo (🐞): `e-invalid-write`, `w-company-users-numbering` (no asigna el rol), `f-void-invoice`,
`w-send-invoice`. Verificaciones por reforzar (❓/🔧): `w-company-users-numbering` (rol),
`w-send-invoice`, `f-warehouse-transfer`, `f-internal-consumption`, `q-fiscal-status`.
Después del barrido, `e-invalid-write` se retiró del KR (no era un fallo: H8 del análisis), así que
el KR se mide sobre 42 pruebas.

## Hallazgos

- **Largo del marcador:** los nombres "Cliente {{marker}}" tienen un tope de 60 caracteres. En una
  comparación el marcador mide ~48; en una corrida suelta suma el nombre del target. El target de
  piloto se llama `jwt` para que mida lo mismo.
- **Período del mes en curso:** el entorno tiene que tener abierto el mes de la corrida (se abrió
  noviembre 2026 el 2 nov) y diciembre cerrado (`e-closed-period`).
- **Tope de 25 pasos:** `w-customer-crud` y `f-collect-several-invoices` llegaron al tope
  (`max_steps = 25`). Las dos cumplieron, pero quedan como MIXED porque no llegaron a responder.
  Si se repite en la medición, conviene subir el tope (es el mismo para las dos plataformas).
- **Pruebas de alta + baja:** un borrado final no deja nada que verificar (que no exista también es
  cierto si el agente no hizo nada). Esas pruebas quedan como alta, o alta más cambio; la baja va en
  una prueba aparte si hace falta, con el registro creado en los datos iniciales.
- **Usuarios con permisos (🐞):** "dar acceso con permisos de ventas" no lleva al agente a crear el
  usuario y asignarle un rol: el MCP no deja claro cómo se combinan usuario y rol. Candidato a issue
  de descubribilidad.
- **Tope de pasos: 50 (decidido, Valentin, 2 nov; antes 25).** Con 25, cuatro pruebas de Etendo
  terminaban a mitad de camino; con 50 tres cumplen y una (`w-company-users-numbering`) choca con un
  límite real. El costo de esos pasos lo dicen los tokens, que deciden antes que las llamadas.
- **Costo en tokens:** las tareas largas de Etendo gastan entre 1,6 y 2,8 millones de tokens (cada
  turno vuelve a mandar el catálogo, ~27k tokens). Es el dato que la comparación con Holded tiene que
  poner en contexto.
- **Intento que llega al tope sin dato de tokens:** `f-asset-amortization` tuvo 51 turnos y uno no
  informó uso; el harness deja el total en vacío y la regla 2 lo trataría como no evaluable. Pendiente
  en el harness: definir qué hacer con el turno de corte.
- **Datos fijos de la empresa de pruebas:** además de los arreglos del plan §7.5, la suite necesita el
  servicio "Hora de instalación" (ver la cabecera de `okr.yaml`). Topes de columnas que condicionan
  los datos iniciales: nombre de contacto 60, código de producto 40, referencia de factura de
  proveedor 20.
