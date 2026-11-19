# OKR O2 — Pruebas sobre las features del Q4 (T3)

**Tarea:** ETP-5850 (T3), etendo-ai#36. **Suite:** `mcp-tests/suites/okr.yaml`. **Al:** 17 nov 2026.

El objetivo de la T3 es **dar cobertura a lo nuevo de Etendo GO**. La comparación con Holded es
secundaria: una prueba que Holded no puede hacer igual suma, como Solo Etendo.

## Resumen

| | Pruebas | Posibles en ambos | Solo Etendo |
|---|---:|---:|---:|
| Suite inicial (1-47) | 47 | 39 | 8 |
| Agregadas en la T3 (48-56) | 9 | 3 | 6 |
| **Total** | **56** | **42** | **14** |

- **KR2.1** (Etendo Win ÷ posibles en ambos): 79,5 % (31 de 39), medido sobre las 47 iniciales, no
  oficial. Las 9 nuevas todavía no entraron en una medición contra Holded.
- **Features del Q4 con prueba:** 6. **Sin prueba todavía:** 6 (ver abajo).
- Las 9 nuevas pasaron en una corrida con el agente en un local-env sobre `develop` con los flags del
  Q4 prendidos. Los bloques de Holded de 49, 50 y 52 están escritos y sin pilotear.

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

## Mejoras para poder probar lo que falta

Features que ya están en Etendo GO pero que una prueba no puede medir todavía. Cada una necesita un
cambio de nuestro lado.

| Feature | Qué falta | Dónde | Prueba que habilita |
|---|---|---|---|
| Pérdidas y Ganancias por mes o trimestre (ETP-6080, ETP-6239) | `generate_profit_loss` sin columnas por período (la UI tiene Total / Mes / Trimestre); `yearId` obligatorio y sin forma de saber cuál es el año del calendario de la organización (en GOClient hay dos 2026) | MCP de GO | "¿Cuánto vendimos cada mes de este trimestre?" |
| Factura de proveedor desde una foto: fecha | `etendo_extract_invoice_document` devuelve `invoiceDateIso` con el texto leído ("15 de enero de 2026"), no en formato ISO; el agente de la prueba usó la fecha de hoy porque el pedido lo dice | MCP de GO (bug) | Aplicar la fecha de la factura |
| Remesas: selector del tipo | `etendo_selectors` de `remittanceType` con `recordContext.financialAccount` devuelve vacío; `etendo_defaults` sí trae el tipo (el agente salió por ahí) | MCP de GO (bug) | Mejora la 48, no la habilita |

## Features a seguir hasta que terminen

Features del Q4 en curso o sin exponer en el MCP. Cuando lleguen al MCP se escribe su prueba.

| Feature | Estado | Qué falta para la prueba | Prueba posible |
|---|---|---|---|
| Bandeja de facturas (épica ETP-6046) | Partes 1-3 en control de calidad; 4 (revisión, ETP-6050) en curso; 5 (confirmar y descartar, ETP-6051) definida | El spec `invoice-inbox` es solo lectura en el MCP: falta pasar un documento a factura de compra o descartarlo | "Pasá a compras las facturas que llegaron hoy" (Holded lo hace: `upload_inbox`, `export_inbox`) |
| Movimientos de producto (ETP-5889) | En revisión, flag `product-movements-tab` | La pestaña no está en el MCP: el spec `product` no tiene esa entidad | "¿Qué movimientos tuvo el Producto X este mes?" |
| Portal del cliente (ETP-6209) | En curso, flag `bp-portal-link` | Sin acción en el MCP | "Mandale a Cliente X el link para ver sus facturas" (Holded: `get_contact_portal_link`) |
| Motivo de rectificación en la facturación automática (ETP-6179) | En curso | — | Rectificativa con motivo desde un albarán o pedido |
| Movimientos rechazados (ETP-5581, flag `bank-bounce-suggestions`) | En producción para Finanzas | `discardPair` solo acepta líneas sincronizadas por PSD2; por MCP no se pueden crear | Necesita un banco PSD2 de prueba conectado |
| Ajustes de importación PSD2 (ETP-6151) | En revisión | Necesita una cuenta con conexión bancaria | Igual que la anterior |
| Modelo 390 (ETP-6183) | En revisión, en Classic | No está en el MCP de GO | — |

## Fuera de la T3

Las de Plataforma (Mis empresas, roles y campos personalizados, trial, cuotas por plan) no son tareas
que un usuario le pida a un agente. Las rutinas del MCP (ETP-6236) se miden aparte, con su KR hijo.
