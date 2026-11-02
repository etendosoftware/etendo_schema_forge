# T1 — Sentar las bases para tener un número (OKR O2) — Plan

**Tarea:** ETP-5848 (T1, 20 oct – 1 nov) · GitHub `etendo-ai#34` · **Épica:** ETP-5339.
**Fecha:** 2026-10-22. **Estado:** diseño decidido por Valentin el 2026-10-22; implementación pendiente (§6).
**El texto del KR no se edita:** los resultados por prueba y los secundarios viven en el reporte
(`summary.md` del harness).
**Parte de:** `docs/mcp-evaluation/mcp-improvements-registry.md` §2.1–2.6 (MARI, ACE) y
`docs/plans/2026-10-14-mcp-tests-reproducible-comparison-plan.md` (harness `mcp-tests`, ETP-5750).

## 1. El problema

El KR necesita un **porcentaje** con meta (80 %). MARI no sirve para eso:

- MARI es un **puntaje acumulado sin tope** desde que la cuota se congeló en 126 (registry §2.2.1).
  No es un % de nada, así que "80 %" no tiene sentido sobre él.
- MARI descansaba sobre **pocas tareas** (5 congeladas, de las que 3–4 ejecutables). Una sola tarea
  (T2) movió el índice ~17 puntos el 2026-10-06. Es un número de diagnóstico, no de OKR.
- La preocupación de origen: **agregar casos baja el número**. En MARI eso pasaba por el
  denominador de Delivery (cada IMP nuevo re-basaba la cuota: 73 → 70 el 08-12 sin tocar código).

## 2. Qué cambia con el KR2.1 (% de tareas ganadas)

El KR2.1 ya es un porcentaje: `tareas ganadas por Etendo Go ÷ tareas evaluadas`.
**¿Sigue bajando al agregar tareas?** Sí puede, pero por un motivo distinto y legítimo:

| | MARI (Delivery) | KR2.1 (win rate) |
|---|---|---|
| Qué baja el número al agregar algo | Registrar un defecto, aunque no cambie el producto | Agregar una tarea que Etendo Go **pierde** |
| ¿Es castigo a la honestidad? | Sí (por eso se congeló la cuota) | No: la tarea nueva mide algo real |
| ¿Puede subir al agregar? | No | Sí, si la tarea nueva se gana |

O sea: en el KR2.1 una tarea nueva no es "deuda", es una **muestra más**. El riesgo real ya no es
la dilución sino **mover la vara a mitad de trimestre** y comparar números de suites distintas.

## 3. Propuesta

### 3.1 Un número titular y uno secundario

**Decidido (Valentin, 2026-10-22): la suite no se congela.** Siempre se van a ir agregando
pruebas, en cualquier momento del trimestre.

- **Titular del OKR:** `% de tareas ganadas por Etendo Go` sobre la suite `okr` vigente.
- **Valor secundario: cantidad de pruebas de la suite.** Siempre se informan juntos:
  "78 % sobre 34 pruebas". Que la suite crezca es progreso en sí mismo y se ve en ese número.
- **Cada corrida registra el `suite sha`** (ya lo hace el harness, plan §5.8), así se sabe
  contra qué set exacto salió cada cifra.

### 3.2 Agregar pruebas sin perder la lectura

- **Una prueba nueva no es deuda:** baja el % solo si Etendo Go la pierde, y lo sube si la gana.
- **Si el % baja después de agregar pruebas, el informe dice por qué**: cuántas de las nuevas se
  perdieron. Así "bajó porque sumamos pruebas difíciles" no se confunde con "el MCP empeoró".
- **Regla de selección escrita antes de correr** (plan §5.8, "Selection bias"): cada tarea dice por
  qué está, antes de ver quién gana. Evita armar la suite para llegar al 80 %.
- **Estabilidad (T4):** las dos corridas oficiales consecutivas sí tienen que usar el mismo set;
  es la única condición de "mismo set" que queda, y ya la exige `mcp-stability`.

### 3.3 Resultado por prueba y cómo se arma el %

**Decidido (Valentin, 2026-10-22).** Cada prueba termina en uno de estos resultados:

| Resultado | Cuándo | Regla de decisión |
|---|---|---|
| **Etendo Only** | Solo Etendo Go puede hacerla con su MCP | paso 0 |
| **Etendo Win** | Ambos pueden y Etendo Go lo hace mejor | pasos 1–4 |
| **Holded Win** | Ambos pueden y Holded lo hace mejor | pasos 1–4 |
| **Holded Only** | Solo Holded puede hacerla con su MCP | paso 0 |
| Empate | Ambos pueden y nada los separa | paso 5 |

**Titular:** `(Etendo Win + Etendo Only) ÷ pruebas evaluadas`. Meta: 80 %.

**Empate — contemplado, pero no esperado.** La intención es que cada prueba tenga un ganador; la
regla de decisión (pasos 1–4) debería separarlos casi siempre. Si igual sale un empate, cuenta en
el denominador (baja el %) y se marca para revisar la prueba o la regla.

**"Ninguno puede" no existe por construcción.** Toda prueba sale de algo que **sí** se puede
hacer: o de la UI de Etendo Go o del MCP de Holded. La cláusula del KR ("las tareas que ninguna
plataforma puede hacer quedan fuera") se mantiene como resguardo; en la práctica no debería
aplicarse nunca, y si aparece una, se revisa la prueba.

**Secundarios, siempre al lado del titular:**

- **Cantidad de pruebas** de la suite.
- **Etendo Only** y **Etendo Win**, por separado: cuánto del % es capacidad y cuánto es calidad
  del MCP. Las features nuevas del Q4 (T3) van a sumar casi todo en Only.
- **Holded Only**: funcionalidades que Etendo Go no tiene o no expone por MCP. No es solo una
  pérdida del KR, es **input de producto** — cada una se revisa y puede generar un issue.

Ejemplo de cómo se lee: *"82 % sobre 34 pruebas — 12 Etendo Only, 16 Etendo Win, 3 Holded Win,
2 Holded Only, 1 empate"*.

**Origen de cada prueba** (registrado al proponerla, antes de correrla):

- **Desde la UI de Etendo Go** — algo que un usuario hace en Etendo; el MCP debería poder.
  Si Holded no puede, es Etendo Only.
- **Desde el MCP de Holded** — algo que su catálogo ofrece. Si Etendo Go no puede, es
  Holded Only, y alimenta el backlog de producto.

### 3.4 Orden de la regla de decisión — tokens antes que llamadas

**Decidido (Valentin, 2026-10-22).** Los dos MCP tienen diseños opuestos:

- **Holded:** ~180 tools puntuales (`create_a`, `edit_b`…). Catálogo pesado (~100k tokens por
  turno, estimado en plan §5.7), pocas llamadas por tarea.
- **Etendo Go:** ~28 tools tipo verbo con la entidad como parámetro y un `discover` para ver el
  catálogo. Catálogo liviano (~15–20k tokens), más llamadas por tarea.

Contar **llamadas** antes que **tokens** castiga el diseño de Etendo: cuenta el discovery como
costo y no ve que Holded lo pre-pagó cargando su catálogo en cada turno. Además cada prueba arranca
en frío, así que Etendo paga el discovery en todas, cuando en una sesión real lo reutiliza.

**Regla nueva (`RULE_VERSION = 2`):**

0. Capacidad → Only.
1. Éxito (más corridas exitosas de 3).
2. Errores no recuperados (menos).
3. **Tokens totales de la conversación** (mediana sobre corridas exitosas, margen 10 %).
4. Llamadas (mediana, margen 20 %).
5. Desempate (§3.5).

**Tokens = los de la conversación completa**, input + output de todo el loop, que ya incluyen el
catálogo en cada turno: una sola unidad mide catálogo y pasos a la vez. El harness ya lo suma
(`usage.loop`, plan §5.7). Ojo con el fallback a `resultBytes` cuando el gateway no devuelve usage:
ese fallback **no** incluye el catálogo, así que una corrida oficial debe exigir tokens reales.

El texto del KR enumera llamadas en 2.º lugar y no se edita; el cambio se documenta en el reporte
(cada tarea ya registra `ruleVersion` y `decidedBy`).

### 3.5 Desempate con API de decisión

La intención es que siempre gane alguien. Si los pasos 0–4 no separan, una API de decisión
(recibe texto + opciones, elige una con un modelo) recibe las métricas y los transcripts de ambos
lados y elige Etendo o Holded.

- **Solo en el paso 5**, nunca como juez general: un modelo no es determinista y el KR exige ≥90 %
  de coincidencia entre corridas.
- **Su respuesta se guarda en el reporte** y no se recalcula al re-derivar (`make mcp-report`).
- La tarea se marca **frágil** cuando la decide el desempate.

### 3.6 Tiempo — se mide, no decide

**Decidido (Valentin, 2026-10-22).** El tiempo se informa en el reporte pero **no entra en la
regla de decisión**:

- El tiempo del modelo ya queda reflejado en los tokens (§3.4).
- El tiempo de las tools no es comparable: las corridas oficiales usan Etendo **local** contra
  Holded **en la nube**, así que la red favorece a Etendo sin decir nada del MCP.
- Con concurrencia 4 el tiempo es ruidoso; como criterio rompería la estabilidad ≥90 %.

**Qué se informa:** tiempo por tarea (mediana de las 3 corridas) y tiempo de tools separado del
del modelo. Sirve para detectar tools lentas de Etendo y abrir issues de mejora.

**Estado en el harness:** ya registra el wall time por corrida y por target (`report.py`,
`wallSeconds`) y un `ms` por llamada a tool (`agent.py`), que es el tiempo observado entre la
llamada y su resultado, **no** la latencia propia del servidor. Falta sumarlo por tarea y
mostrarlo en `summary.md`.

### 3.7 Qué pasa con MARI y ACE

- **MARI se sigue actualizando en Q4** como métrica interna de diagnóstico, no de OKR
  (decidido, Valentin, 2026-10-22). Sigue sirviendo para el registro IMP (Delivery) y continúa la
  serie desde el 2026-08-05. No se reporta en el OKR. **Al cierre de Q4 se revisa si sigue siendo
  útil** o se archiva.
- **ACE** queda como está: compañera, fuera de cualquier titular. La regla de decisión ya usa
  tokens como 4.º criterio con margen del 10 %; el informe separa priming y resto (plan §5.7).
- No se crea un tercer índice. Un número para el OKR (KR2.1), uno de cobertura (KR2.2) y los
  diagnósticos al costado.

## 4. KR2.2 — el otro porcentaje

`operaciones del catálogo acordado cubiertas ÷ operaciones del catálogo`. Mismo cuidado: el
**catálogo se congela** al acordarlo (versión + fecha). Si Holded agrega tools, entran en la
versión siguiente, no en la medición en curso.

## 5. Decisiones

1. ~~¿Cuándo se congela la suite?~~ **Decidido:** no se congela; la cantidad de pruebas es el
   valor secundario (§3.1).
2. ~~¿El 80 % sobre el total o sobre las victorias medidas?~~ **Decidido:** sobre
   Etendo Win + Etendo Only, con Only / Win / Holded Only como secundarios (§3.3).
3. ~~¿MARI se sigue actualizando o se archiva?~~ **Decidido:** se sigue actualizando; se
   revisa su utilidad al cierre de Q4 (§3.7).
4. ~~¿Tope de pruebas Etendo Only?~~ **Decidido:** sin tope; el desglose Only / Win ya lo hace
   visible. Si la proporción de Only se vuelve excesiva, se revisa más adelante.
5. ~~¿Una prueba de "Hola" cuenta para el KR?~~ **Decidido (2026-10-29):** sí, como una prueba
   más (`q-hello`). Mide el costo del catálogo de tools al arrancar una conversación: alarma si se
   agregan tools de más o se infla su metadata, y mide cómo convive el MCP en un agente que tiene
   otros MCP configurados. Es la única excepción a la regla de origen (§3.3): no sale de la UI de
   Etendo ni del MCP de Holded.

**No quedan preguntas abiertas.**

## 6. Plan de implementación (T1)

Objetivo de la tarea: que la primera corrida salga ya con este formato y sea el número base.

1. ✅ **Resultado por prueba:** `report.task_result` mapea cada tarea decidida a Etendo Only /
   Etendo Win / Holded Win / Holded Only / empate (§3.3). Hecho el 2026-10-30 (report v6).
2. ✅ **Titular y secundarios en `summary.md`:** `(Etendo Win + Etendo Only) ÷ evaluadas`, meta
   80 %, con los cinco resultados al lado. Pendiente: explicar caídas por pruebas nuevas (§3.2).
3. ✅ **`RULE_VERSION = 2`** en `runner/decide.py`: éxito → errores no recuperados → tokens totales
   (10 %) → llamadas (20 %) → empate. La regla 1 queda rechazada (§3.4).
4. **Desempate con API de decisión** en el paso 5; respuesta guardada en el run y no recalculada (§3.5).
5. ✅ **Tokens reales obligatorios:** sin fallback a `resultBytes`; una tarea sin tokens es no
   evaluable (§3.4).
6. **Tiempo** por tarea y de tools separado del modelo, solo informativo (§3.6).
7. **Origen de cada prueba** (UI de Etendo / MCP de Holded) registrado en la suite (§3.3).
8. Correr la primera medición y publicar el número base como no oficial.

## 7. Contexto para quien tome la tarea

### 7.1 Alcance y fechas de T1

**Ventana:** 20 oct – 1 nov 2026. **Cierre de Q:** 15 dic, fijo.
Etapas siguientes, para ubicar T1: T2 incrementar puntaje (2–20 nov) · T3 pruebas sobre features
del Q4 (23 nov – 6 dic) · T4 corridas oficiales y cierre (7–15 dic) · revisión semanal del feedback
de producción (`make mcp-usage` / `make mcp-metrics`) todos los lunes, en paralelo.

Checklist:

- [ ] Target de Holded + login en `config.toml` (20–21 oct).
- [ ] Limpieza del catálogo de operaciones: negocio real vs descarte, y capacidad de cada
      plataforma (21–23 oct).
- [ ] Implementar §6 (formato del reporte y regla v2).
- [ ] Escribir las ~30 pruebas de la suite `okr` y pilotarlas en ambas plataformas (22 oct – 1 nov).
- [ ] Corrida preliminar `REPEAT=3` → número **no oficial** para el lunes 26 oct.
- [ ] Primera medición completa (1 nov).

**Entregable:** suite `okr` pilotada, comparación corriendo punta a punta y número base publicado
como no oficial, con el formato de §3.3.

### 7.2 Estado del harness (verificado el 2026-10-20 en `develop`)

- S1–S6 del plan del 14 oct mergeados; 348 tests unitarios OK. Comandos: `mcp-test`,
  `mcp-compare`, `mcp-seed`, `mcp-report`, `mcp-stability`.
- **S7 sin empezar:** no existen `suites/okr.yaml` ni `suites/okr.ids`. Suites actuales:
  `discoverability` (7), `sales-order` (4), `treasury` (8), `full-flows` (1).
- **S8 sin hacer:** nunca se corrió una comparación Etendo vs Holded (no hay `compare.json` en
  `runs/`; última corrida del 2 oct).
- **Bloqueante (resuelto en config el 2026-10-23):** target `holded` con `auth = "oauth"`, igual
  que Etendo Go. Verificado contra el servidor: PKCE S256, cliente público y registro dinámico en
  `https://app.holded.com`; no da refresh token. Falta el primer `make mcp-login TARGET=holded`.
- El texto del OKR está en `docs/plans/drafts/2026-10-15-propuesta-okr-o2.md` (borrador sin
  commitear).

### 7.3 Candidatas a prueba (reemplazadas)

**Reemplazadas el 23 oct** por el listado de 43 flujos de `docs/mcp-evaluation/okr-o2-flows.md` (un
archivo por flujo en `okr-o2-flows/`). La lista de abajo queda como referencia histórica.

**Base de operaciones:** `docs/mcp-evaluation/okr-o2-operations-catalog.md` (versión base, se itera):
cada operación con su verificación objetiva y su ruta en Etendo y en Holded. Las pruebas salen de ahí.

Prefijos: `w-` escritura, `q-` consulta, `f-` flujo, `e-` error/negativa. *(semilla)* = las seis del
plan del 14 oct §5.8.

- **Ventas:** `w-invoice-one-product-issued` *(semilla)*, `q-pending-invoices-outstanding`
  *(semilla)*, `f-process-sales-order` *(semilla)*, `w-create-draft-sales-order`,
  `w-invoice-multiple-lines`, `q-customer-invoices`, `w-cancel-draft-order`.
- **Compras:** `w-purchase-invoice-basic`, `q-purchase-invoices-pending`,
  `f-partial-payment-purchase-invoice`, `f-overpay-purchase-invoice`.
- **Cobros y tesorería:** `f-collect-full-sales-invoice`, `f-manual-deposit`,
  `f-transfer-between-accounts`, `f-bank-transfer-pis`, `f-collect-partial-invoice`,
  `f-undo-collection` (antes `e-delete-processed-collection`: la UI permite borrar el cobro, no se
  niega).
- **Productos y stock:** `q-product-prices-stock` *(semilla)*, `w-update-product-price`,
  `w-receive-stock`, `q-low-stock-products`.
- **Contactos:** `w-create-customer`, `q-find-customer-by-tax-id`, `w-update-customer-address`,
  `q-customer-history`.
- **Consultas:** `q-sales-this-month`, `q-top-customers`, `q-what-can-i-do`.
- **Errores y negativas:** `e-unknown-document` *(semilla)*, `e-invalid-write` *(semilla)*,
  `e-ambiguous-customer` (debe preguntar, no adivinar).

Foco en ventas. Cada prueba registra su origen (UI de Etendo / MCP de Holded, §3.3) y por qué está,
antes de correrla.

### 7.4 Riesgos

- **Sesgo de selección:** facturación y cobros favorecen a Etendo; contactos/CRM a Holded.
- **Login de Holded** por OAuth (configurado y verificado el descubrimiento; falta el primer login).
- **Plazo:** 30 pruebas pilotadas al 1 nov es ajustado; el número del 26 oct sale con lo que haya.

### 7.5 Cómo retomar (estado al 29 oct)

**Dónde está todo:** rama `feature/ETP-5848` de `etendo_schema_forge`.

| Qué | Dónde |
|---|---|
| Este plan (§3 métrica, §5 decisiones, §6 qué implementar) | `docs/plans/2026-10-22-mcp-okr-metric-base-plan.md` |
| Las 43 pruebas, con reglas de redacción y hallazgos | `docs/mcp-evaluation/okr-o2-flows.md` + `okr-o2-flows/NN-<id>.md` |
| Catálogo de operaciones | `docs/mcp-evaluation/okr-o2-operations-catalog.md` |
| Harness y su guía | `mcp-tests/`, `mcp-tests/README.md` |

**Próximo paso:** Valentin aprueba las pruebas de a una → se escriben en `mcp-tests/suites/okr.yaml`
(no existe todavía) → piloto de cada una contra el MCP local y Holded. En paralelo, §6 (no
necesita Holded: se prueba con `mcp-tests/tests/fixtures/`). Reglas de las pruebas: el pedido es
lo que escribiría una persona, sin explicar cómo; lo que se prepara va en "Datos previos"; la
verificación mide el resultado, no el camino.

**Configurar el harness:**

1. `cp mcp-tests/config.example.toml mcp-tests/config.toml` (gitignored). El ejemplo ya trae
   `local` y `holded` con `platform`, que `make mcp-compare` exige.
2. Clave del gateway de LLM: la variable que nombra `[provider] api_key_env`.
3. Holded es `auth = "oauth"`, igual que Etendo: `make mcp-login TARGET=holded` abre el navegador;
   lo hace una persona, con una **cuenta de Holded descartable** (la medición oficial pide una cuenta
   recién creada). Holded no da refresh token: cuando vence, se repite el login. **Pendiente:
   nadie lo hizo todavía.**
4. `local` necesita el SPA de un entorno levantado (el MCP local pasa por el SPA, no por Tomcat).
   El ejemplo apunta a `:3100` (checkout principal); para un entorno de local-env, cambiar la `url`
   al puerto de su SPA (ETP-5848 usó `:3104`; `local-env worktree ls` lo muestra).

**Entorno de Etendo** (skill `local-env`): `local-env worktree ETP-5848 --module
com.etendoerp.go=feature/ETP-5848 --base=origin/develop` desde `etendo_develop`, después
`local-env up` dentro del entorno (lo aprueba el usuario). La rama de `com.etendoerp.go` está vacía:
no hay cambios de GO en esta tarea. Dos arreglos de datos que la siembra de local-env **no** hace y
que las pruebas necesitan (en la base del entorno, `source <env>/build/local-env/env`, usuario
`tad`):

```sql
-- 1. Secuencias de identificador (sin ellas el alta de contactos falla con
--    "No se pudo encontrar una secuencia: EM_Etgo_Identifier"). Org = la de GOClient (GOOrg).
insert into ad_sequence (ad_sequence_id, ad_client_id, ad_org_id, isactive, createdby, updatedby,
  name, prefix, suffix, mask, isautosequence, incrementno, startno, currentnext, currentnextsys,
  istableid, ad_column_id, ad_table_id)
select get_uuid(), o.ad_client_id, o.ad_org_id, 'Y', '100', '100',
  substr(t.name,1,29)||'-'||substr(c.name,1,30), '', '', '#######', 'Y', 1, 1000000, 1000000, 1000000,
  'N', c.ad_column_id, t.ad_table_id
from ad_column c join ad_table t using (ad_table_id)
cross join ad_org o join ad_client cl on cl.ad_client_id = o.ad_client_id
where c.ad_reference_id = 'B82E1C56F57749AD97DD9924624F08D3'   -- secuencia transaccional
  and cl.name = 'GOClient' and o.name = 'GOOrg'
  and not exists (select 1 from ad_sequence s where s.ad_column_id = c.ad_column_id
                  and s.ad_org_id = o.ad_org_id);
```

2. **Período contable del mes actual abierto:** el seed abre solo enero–abril 2026 y cualquier
   documento con fecha de hoy falla con "El período contable … no está abierto". Desde la UI:
   Finanzas › Calendario › año › Períodos › "Abrir/Cerrar Periodo" → Abierto.
3. **Datos fijos de la empresa** (una vez, por la app o el MCP; los lista la cabecera de
   `mcp-tests/suites/okr.yaml`): el servicio "Hora de instalación" (INSTALACION, 50 € en la tarifa
   de venta principal) y la subcuenta 55500001 "Traspasos internos" bajo 5550, en el árbol
   "Arbol de cuentas GO" (el otro árbol del tenant, "GOOrg Account Tree", no lo usa ningún esquema:
   una cuenta creada ahí no genera concepto contable).

Los tres tienen que ir a la preparación (fixture) de la suite o arreglarse en la siembra de
local-env; hoy no están en ningún código.
