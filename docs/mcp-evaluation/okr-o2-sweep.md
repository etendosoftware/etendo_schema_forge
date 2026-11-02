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
| 40 | `e-invalid-write` | ❌ creó el pedido con -3 | — | 🐞 | Catálogo F5 decía que se negaba |
| 43 | `e-closed-period` | ✅ 16 llamadas | ⛔ | ⛔ | No completó la factura y explicó el período cerrado |
| 2 | `w-customer-crud` | ✅ 25 llamadas (tope) | — | ✅ | Solo alta. Llegó al tope de 25 pasos antes de responder |
| 5 | `w-draft-order-edit-delete` | ✅ 17 llamadas | — | ✅ | Alta + cambio a 4 (sin el borrado final) |
| 8 | `f-collect-several-invoices` | ✅ 25 llamadas (tope) | ⛔ | ⛔ | Un cobro de 242 € para las dos facturas |
| 9 | `f-overpay-sales-invoice` | ✅ 13 llamadas | ⛔ | ⛔ | Dejó los 13,70 € a favor del cliente |
| 20 | `w-product-crud` | ✅ 24 llamadas | — | ✅ | Solo alta (con los dos precios) |
| 21 | `w-product-category-crud` | ✅ 10 llamadas | — | ✅ | Solo alta |
| 29 | `w-subaccount` | ✅ 21 llamadas | — | ✅ | Solo alta (62700001) |
| 37 | `w-commercial-setup` | ✅ 11 llamadas | — | ✅ | Solo la tarifa |
| 38 | `w-company-users-numbering` | ❌ 25 llamadas (tope) | — | 🐞 | 1.º intento: correo de 63 caracteres > tope 60 (🔧, dominio acortado a `@x.es`). 2.º: nunca intentó crear el usuario; gastó los 25 pasos buscando cómo dar "permisos de ventas" (roles, docs, selectores) |
| 41 | `e-ambiguous-customer` | ✅ 8 llamadas | — | ✅ | Detectó los dos clientes y no creó nada |
| 42 | `e-duplicate-payment-term` | ✅ 8 llamadas | — | ✅ | No la creó: ya existe una de 30 días |

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
