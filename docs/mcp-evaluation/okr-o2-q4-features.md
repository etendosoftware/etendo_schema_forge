# OKR O2 — Pruebas sobre las features del Q4 (T3)

**Tarea:** ETP-5850 (T3), etendo-ai#36. **Suite:** `mcp-tests/suites/okr.yaml`. **Al:** 18 nov 2026.

El objetivo de la T3 es **dar cobertura a lo nuevo de Etendo.ai**. La comparación con Holded es
secundaria: una prueba que Holded no puede hacer igual suma, como Solo Etendo.

## Resumen

| | Pruebas | Posibles en ambos | Solo Etendo |
|---|---:|---:|---:|
| Suite inicial (1-47) | 47 | 39 | 8 |
| Agregadas en la T3 (48-68) | 21 | 4 | 17 |
| **Total** | **68** | **43** | **25** |

- **KR2.1** (Etendo Win ÷ posibles en ambos): 79,5 % (31 de 39), medido sobre las 47 iniciales, no
  oficial. Las 15 nuevas todavía no entraron en una medición contra Holded.
- **Features del Q4 con prueba:** 11 (roadmap #1, #3, #4, #17/#24, #18, #20, #22 y las de Finanzas
  sin issue). **No posibles:** Modelo 390 (#27) y última sincronización PSD2 (#16).
- Las 15 nuevas pasaron en una corrida con el agente en un local-env sobre `develop` con los flags del
  Q4 prendidos. Los bloques de Holded de 49, 50, 52 y 62 están escritos y sin pilotear.

## Pruebas agregadas en la T3

| # | Prueba | Feature del Q4 | Holded | Piloto con agente |
|---|---|---|---|---|
| 48 | `f-sepa-remittance` | Remesas SEPA (ETP-6148, flag `sepa-remittances`) | No: su MCP solo lee remesas y el plan no tiene el módulo | ✅ 17 llamadas |
| 49 | `f-foreign-currency-invoice` | Tipo de cambio según la fecha del documento (ETP-5840) | Sí, sin pilotear | ✅ 17 llamadas |
| 50 | `f-order-global-discount` | El descuento global del pedido pasa a la factura (ETP-5828) | Sí, sin pilotear | ✅ 7 llamadas |
| 51 | `w-customer-vendor-contact` | Contacto cliente y proveedor (ETP-5791) | No: un contacto tiene un solo tipo | ✅ 6 llamadas |
| 52 | `w-payment-term-days` | Condiciones de pago en días (ETP-5826) | Sí, sin pilotear | ✅ 4 llamadas |
| 53 | `f-invoice-from-photo` | Factura de proveedor desde una foto JPG (ETP-5735) | No: `upload_inbox` pide los bytes del archivo como argumento | ✅ 14 llamadas, ~512k tokens |
| 54 | `w-contact-category-vendor` | Categoría de contacto: el contacto hereda el tipo (ETP-5791, roadmap #1) | No: Holded no tiene categorías que definan el tipo | ✅ 5 llamadas |
| 55 | `w-contact-own-category` | Lo mismo, en una categoría propia cliente y proveedor | No | ✅ 7 llamadas |
| 56 | `e-fiscal-year-start` | Calendario contable en Primeros pasos (ETP-5577, roadmap #18): cambiar el inicio del ejercicio no se puede por MCP; el agente lo dice y manda a «Revisar calendario contable» | No: Holded no tiene calendario contable | ✅ 2 llamadas |
| 57 | `q-product-purchased-units` | Movimientos por producto (ETP-5889, roadmap #4): unidades que entraron por compras | No: Holded no tiene historial de movimientos por producto | ✅ 6 llamadas |
| 58 | `q-product-movements` | Lo mismo: qué movimientos tuvo el producto | No | ✅ 8 llamadas |
| 59 | `q-invoice-inbox` | Bandeja de facturas (ETP-6046, roadmap #3): qué hay pendiente de pasar a compras | No medible: la preparación no puede subir a su bandeja | ✅ 1 llamada |
| 60 | `q-profit-quarter` | Pérdidas y Ganancias de un trimestre (ETP-6080/6239, roadmap #20) | No: su MCP no tiene el informe | ✅ 2 llamadas |
| 61 | `q-profit-by-month` | Pérdidas y Ganancias mes a mes | No | ✅ 6 llamadas |
| 62 | `w-portal-link` | Portal del cliente (ETP-6209, roadmap #22): el link del portal de un cliente | Sí (`get_contact_portal_link`), sin pilotear | ✅ 2 llamadas |

La 57 y la 58 leen `product/transactions`, la pestaña Movimientos del producto. En el primer piloto de
la 58 el agente no la encontró (buscó en las líneas de cada tipo de documento): ETP-5850 agregó un
prompt a esa entidad y a `goods-movements` que lo manda ahí, y pasó.

La 59 necesita un documento en la bandeja de la cuenta medida, porque el MCP no puede subir a la
bandeja (se sube desde la app). Revisar, corregir, confirmar y descartar quedan, a propósito, solo
para personas (ETP-6051): la 53 ya cubre lo que un agente hace con un escaneo, cargar la factura.

La 60 y la 61 usan dos cambios de ETP-5850 en `generate_profit_loss`: el año (`yearId`) deja de ser
obligatorio si se pasan las dos fechas, y `breakdown` da columnas por mes o trimestre, como la vista
Mes / Trimestre de la app. Usan el segundo trimestre y enero a abril de 2026 porque abril tiene un
costo: el resultado no coincide con las ventas, y un total de ventas no pasa. Con "¿cuánto ganamos
cada mes?" el agente leyó el widget de ventas y gastos del tablero; la 61 nombra el informe.

La 62 usa la acción `portalLink` de Contactos, nueva en ETP-5850 (ver *Portal del cliente* abajo). El
link también viaja en el email de cada documento (flag `bp-portal-link`), pero el MCP no muestra el
cuerpo del email enviado, así que ese caso queda cubierto por `w-send-invoice`.

La 56 prueba un rechazo: el inicio del ejercicio lo elige el dueño una vez, en Primeros pasos, y el
MCP no lo puede cambiar. El prompt del `year` de `fiscal-calendar` se lo dice al agente; la prueba
pasa si no aparece un ejercicio que empiece en julio y la respuesta nombra Primeros pasos. Abrir
períodos, lo único del calendario que un agente hace seguido, ya lo cubre `f-open-period`.

La 54 y la 55 necesitan el flag `contact-category-type` prendido para la cuenta medida: apagado
(el default) la categoría no se lee y el contacto queda cliente. En producción hoy está prendido solo
para una lista de cuentas. Un `customer`/`vendor` que el agente mande explícito gana sobre la
categoría, a propósito.

La 53 usa `files:` del harness: la prueba le pasa al agente `fixtures/files/supplier-invoice-photo.jpeg`
y una tool `upload_file` para subirlo a la URL que da el MCP, como haría un cliente con acceso a
archivos. La extracción necesita el servicio de Copilot levantado. El CIF de la foto (B12345678) no
pasa el dígito de control de Etendo, así que el proveedor lo crea el setup, por nombre y sin NIF. La
foto no imprime el NIF del receptor: la extracción lo avisa (`receiver_tax_id_absent`) y no bloquea.

## Mejoras hechas en ETP-5850 para poder probar

| Feature | Qué faltaba | Cambio | Prueba |
|---|---|---|---|
| Pérdidas y Ganancias por mes o trimestre (ETP-6080, ETP-6239) | `generate_profit_loss` sin columnas por período; `yearId` obligatorio (en GOClient hay dos 2026) | `breakdown: month \| quarter` y `yearId` opcional con las dos fechas (com.etendoerp.go) | 60, 61 |
| Portal del cliente (ETP-6209) | El link solo salía dentro del email del documento | Acción `portalLink` en Contactos: el link del cliente para compartirlo (com.etendoerp.go) | 62 |
| Movimientos por producto (ETP-5889) | El agente no encontraba `product/transactions` | Prompt en `product/transactions` y en `goods-movements` | 57, 58 |
| Bandeja de facturas (ETP-6046) | El agente filtró `status: "pending"`, que no existe, y el MCP respondió 0 filas sin error | Prompt en `invoice-inbox/header` con los códigos de estado | 59 |
| Portal del cliente (ETP-6209) | El agente entregaba la `url` de la ficha del contacto, que solo abre para usuarios de la app | `urlNote` junto a cada `url` de registro y prompt en `contacts/businessPartner` | 62, 64 |
| Filtros sobre campos de lista | Un valor que no es un código (`"pending"`, `"co"`) devolvía 0 filas | 422 `validation_error` con los códigos en `available` | 59 |
| Calendario contable (ETP-5577) | Nada le decía al agente que el inicio del ejercicio no se cambia por MCP | Prompt en `fiscal-calendar/year` | 56 |
| Factura de proveedor desde una foto: fecha | `invoiceDateIso` venía con la fecha escrita | Corregido (com.etendoerp.go #1656) | 53 |
| Remesas: selector del tipo | El selector de `remittanceType` devolvía vacío | Corregido (com.etendoerp.go #1656) | 48 |

## Portal del cliente: la acción `portalLink`

`etendo_action` sobre `contacts/businessPartner`, acción `portalLink`: devuelve `url`, `expiresAt`,
`entryDocument` (el documento más reciente del cliente, donde abre el portal) y `renewalEmail`. Es el
mismo link que lleva el email de un documento, con origen `SHARED`. Reglas: flag `bp-portal-link`
de la cuenta; acceso de escritura a Contactos; el cliente no puede estar bloqueado ni inactivo;
necesita un email de contacto (un link vencido se renueva por email) y algún documento que el portal
muestre; queda registrado quién lo pidió y no cuenta como "enviado por email". Detalle en
`com.etendoerp.go/docs/customer-portal.md` §6c.

## KR2.2: tres funcionalidades del Q4 validadas por agente

KR2.2 (registro del OKR, meta 3; validadas 7): validar de extremo a extremo la operación agéntica de al menos 3
funcionalidades del ERP desarrolladas en Q4: casos exitosos, errores de negocio y restricciones de
permisos, vía agente, comparando con el recorrido por la interfaz, sin intervención manual.

| Funcionalidad | Éxito | Error de negocio | Permisos (usuario con rol Inventory) | Recorrido en la app |
|---|---|---|---|---|
| Categoría de contacto (ETP-5791) | 54, 55 | 63 `e-contact-without-type`: un contacto sin tipo se rechaza (`ETGO_BPartnerContactTypeRequired`) y no se crea | `p-contact-create-denied`: Contactos de solo lectura, 403 | Contactos > Nuevo hereda el tipo de la categoría; sin tipo no guarda; el rol Inventory ve Contactos sin "Nuevo" |
| Portal del cliente (ETP-6209) | 62 | 64 `e-portal-link-without-email`: sin email no hay link (`contact_without_email`) | `p-portal-link-denied`: `portalLink` es escritura en Contactos, 403 | El link sale en el email de cada documento; sin email no se envía; el rol Inventory no envía documentos |
| PyG por mes o trimestre (ETP-6080, ETP-6239) | 60, 61 | 65 `e-profit-by-month-long-range`: más de 24 meses se rechaza y el agente lo resuelve en dos pedidos | `p-profit-denied`: sin Informes financieros; el MCP no le ofrece el informe y los widgets de ingresos responden 403 (ETP-5850; antes respondían vacíos y en 1 de 3 el agente dio el pedido por resuelto con cifras operativas) | Informes > Pérdidas y Ganancias, vista Mes / Trimestre; el rol Inventory no tiene Informes financieros en el menú |
| Calendario contable (ETP-5577) | `f-open-period` | 56 `e-fiscal-year-start`: el inicio del ejercicio no se cambia por MCP, el agente manda a Primeros pasos | `p-open-period-denied`: sin Control de períodos, 403 | Contabilidad > Calendario > abrir el período; el inicio del ejercicio, en Primeros pasos |
| Bandeja de facturas (ETP-6046) | 59 | 66 `e-invoice-inbox-confirm`: confirmar lo hace una persona en la app; el documento no cambia | `p-invoice-inbox-denied`: sin la ventana Bandeja, 403 | Compras > Bandeja de facturas > Confirmar |
| Condiciones de pago en días (ETP-5826) | 52 | 67 `e-payment-term-out-of-range`: 400 días se rechaza (rango 0 a 365) y el contacto no se toca | `p-payment-term-denied`: Contactos de solo lectura, 403 | Contactos > Condiciones de pago; Condiciones de pago > Nuevo valida el rango |
| Remesas SEPA (ETP-6148) | 48 | 68 `e-remittance-cash-account`: la cuenta Caja no admite remesas | `p-remittance-denied`: sin Remesas ni Cuentas financieras, 403 | Finanzas > Remesas > Nueva; solo ofrece cuentas con remesas |

Las de permisos están en `mcp-tests/suites/okr-permissions.yaml` y corren con un target cuyo token es
un usuario con **solo** la plantilla Inventory (en GOClient: "Almacén MCP", creado con
`etendo_create` en `user/user` y la acción `assignRoles`; la contraseña se pone desde la invitación de
la app, el MCP no la guarda). En el dataset, el cliente "Juan Perez" tiene facturas.

Piloto (19 nov 2026, local-env sobre `develop` + `feature/ETP-5850`, una corrida por prueba): las 7
funcionalidades pasan sus tres casos. Hallazgos que corrigió ETP-5850 en el camino:

- **62 pasaba por error.** El agente devolvía el link de la ficha del contacto
  (`/contacts/<id>`), que solo abre para usuarios de la app, y la prueba aceptaba cualquier link con
  la palabra "portal". Ahora la prueba rechaza `contacts`, y el MCP agrega `urlNote` junto a cada
  `url` de registro (y en el `hint` de discover): ese link es para usuarios de la app y para un cliente
  está la acción `portalLink`. Con eso el agente usa `portalLink`.
- **48 pasaba por error.** El agente fechaba la remesa hoy, la factura vencía mañana, no aparecía
  entre las disponibles y el agente procesaba la de **otro cliente**; la prueba solo pedía "una remesa
  procesada en la cuenta". Ahora pide que la factura del cliente termine con un pago, y
  `availableDueItems` agrega `laterDues` y un `hint` cuando hay vencimientos después de la fecha de la
  remesa. Con eso el agente corre la fecha y remesa la factura correcta.
- **67:** con el rechazo de 400 días, el agente guardó 400 en otro campo del contacto
  (`consumptionDays`) como "arreglo". El rechazo ahora trae un `hint` (preguntar al usuario, no guardar
  el número en otro campo) y la prueba verifica que el contacto no cambió.
- **Un filtro con un valor que no existe devolvía 0 filas** (`status: "pending"` en la bandeja). Ahora
  el MCP responde 422 con los códigos válidos (ver *Mejoras*).

## Modelo

Corridas con gemini que respaldan el KR2.2 (19 nov, 3 intentos por prueba): casos exitosos y errores de
negocio en las comparaciones del KR2.1 `20261119T154647-cmp-cb6e`, `20261119T161648-cmp-9acc` y
`20261119T162324-cmp-c13e`, más `f-open-period` en `20261119T1658-r6236plain-890f`; permisos en
`20261119T1702-r6236inventory-9737`, y `p-profit-denied` repetido con los widgets corregidos en
`20261119T2240-r6236inventory-9860` (3/3). Con gemini, `p-portal-link-denied` nombraba el link de la ficha
al explicar que no sirve para clientes y la prueba lo leía como fuga: ahora rechaza solo `/portal/`.

Todas las mediciones del OKR (KR2.1 y KR2.2) usan **`gemini/gemini-3.8-flash`** por
`llm.etendo.software`. Los pilotos de 48-68 del 17 al 19 nov se corrieron por error con
`openai/gpt-5.2` (el valor de entonces de `config.example.toml`); la comparación del KR2.1 y las
pruebas de permisos se repitieron con gemini, y el ejemplo del harness ahora trae gemini. `gpt-5.2` no
puede correr Holded: el gateway acepta hasta 128 tools y Holded expone ~388.

## Flags para la corrida oficial

Los flags son por cuenta. En producción hoy están prendidos solo para una lista de cuentas; para
medir estas pruebas, la cuenta del harness tiene que estar en la lista de cada flag (Datadog). En un
local-env se prenden con `feature-flag <key>=true` en el `worktree.conf`.

| Flag | Pruebas | Si está apagado |
|---|---|---|
| `sepa-remittances` | 48 | No hay remesas: la prueba falla |
| `contact-category-type` | 54, 55 | La categoría no define el tipo: fallan |
| `invoice-inbox` | 59 | La bandeja responde `feature_disabled`: falla |
| `bp-portal-link` | 62 | `portalLink` responde `feature_disabled`: falla |
| `product-movements-tab` | 57, 58 | Solo la pestaña de la app; el MCP lee los movimientos igual [no probado con el flag apagado] |

## Features a seguir

| Feature | Estado | Qué falta |
|---|---|---|
| Motivo de rectificación en la facturación automática (ETP-6179) | En curso | Rectificativa con motivo desde un albarán o pedido |
| Movimientos rechazados (ETP-5581, flag `bank-bounce-suggestions`) | En producción para Finanzas | `discardPair` solo acepta líneas sincronizadas por PSD2; necesita un banco PSD2 de prueba |
| Ajustes de importación PSD2 (ETP-6151) y última sincronización (#16) | En revisión / Done | Necesita una cuenta con conexión bancaria |
| Modelo 390 (ETP-6183) | En revisión, en Classic | No está en el MCP de Etendo.ai |

## Fuera de la T3

Las de Plataforma (Mis empresas, roles y campos personalizados, trial, cuotas por plan) no son tareas
que un usuario le pida a un agente. Las rutinas del MCP (ETP-6236) se miden aparte, con su KR hijo.
