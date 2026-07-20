# Plan de validación: entrega agéntica, KPIs por feature y calidad no bloqueante

> Versión para validar en conjunto. Reemplaza el enfoque de
> `agentic-feature-quality-and-okrs.md`, que convertía todo en gates
> bloqueantes. Este plan mantiene el nivel de exigencia pero cambia el
> mecanismo: **visibilidad y presupuesto de error en lugar de bloqueo**,
> salvo un núcleo mínimo de condiciones realmente innegociables.
>
> Nota: el repo exige contenido versionado en inglés; este documento está en
> español a pedido explícito porque es material de discusión interna. Si se
> aprueba, la versión final se traduce.

---

## 1. Diagnóstico y objetivos

Situación actual:

1. **El sistema ya es agéntico.** Lo que falta no es el flujo, es la
   *validación* de que el flujo se siguió y de que produce calidad real.
2. **Las features no declaran cómo se mide su éxito.** Hay telemetría
   Mixpanel disponible pero no existe la disciplina de "toda funcionalidad
   tiene KPI o justificación".
3. **La calidad debe ser alta sin frenar la entrega.** Estamos en fase de
   producto: un gate que bloquea todo mata la velocidad que el flujo
   agéntico nos dio.
4. **La validación manual del ERP va a generar backlog.** Necesitamos un
   circuito explícito para absorber, priorizar y corregir ese backlog sin
   que canibalice toda la capacidad ni se pudra sin atender.

Objetivo del plan: que en un trimestre cada feature sea **trazable**
(evidencia agéntica), **medible** (KPI declarado y verificado) y **de
calidad visible** (score de calidad público, no bloqueante), y que el
backlog de validación manual tenga un circuito con SLAs.

---

## 2. Cómo lo hacen las grandes empresas (benchmark)

Antes de proponer el modelo, esto es lo que hacen Microsoft, Google, Apple y
Amazon — y el patrón común es claro: **casi nadie bloquea el merge por
calidad; bloquean (o frenan) el *release*, y usan telemetría para decidir**.

### Microsoft

- **Rings de deployment** (Windows/Office/Azure): el código mergea rápido y
  avanza por anillos — equipo → dogfood interno → insiders → producción
  gradual. La calidad no se valida en el PR: se valida con **telemetría real
  en cada anillo**, y una feature no avanza de anillo si sus métricas de
  salud (crashes, regresiones, uso) no cumplen umbrales.
- **Experimentation Platform (ExP)**: toda feature relevante sale detrás de
  un flag con un experimento controlado. La pregunta no es "¿pasó los
  tests?" sino "¿movió la métrica que dijo que iba a mover sin degradar las
  métricas guardián?".
- **Bug cap / bug bar**: en Windows los equipos tienen un tope de bugs
  activos (p.ej. no más de N por ingeniero). Si lo superás, el equipo deja
  de hacer features y paga deuda. Es un **presupuesto**, no un gate por PR.

### Google

- **Error budgets (SRE)**: la calidad no es "cero defectos", es un
  presupuesto. Mientras el servicio esté dentro del presupuesto de error, se
  entrega a velocidad máxima; cuando se agota, se congela feature work y se
  paga confiabilidad. Es exactamente "calidad alta sin ser bloqueante":
  el freno es **automático, proporcional y temporal**, no por PR.
- **Checks advisory que se endurecen con datos**: los analizadores estáticos
  y checks de código nuevos entran siempre en modo *warning*; solo se
  vuelven obligatorios cuando demostraron una tasa baja de falsos positivos.
- **Testing certified / niveles de madurez**: los equipos tienen un "nivel"
  de madurez de testing público. Nadie te bloquea por estar en nivel bajo,
  pero el nivel es visible y comparable — la presión es social y de datos.
- **Rollouts graduales con rollback automático**: canary al 1% → 10% → 50% →
  100% con reversión automática si las métricas se degradan.

### Apple

- **Dogfooding masivo + release trains**: la calidad se valida usando el
  producto internamente y en betas escalonadas (developer beta → public
  beta → GA). El criterio de calidad se aplica **al tren de release**, no a
  cada cambio individual: una feature que no está lista se baja del tren
  (se desactiva con flag), el tren sale igual.
- **"Live-on" criteria**: para que una feature quede activada en el release
  final debe cumplir criterios de estabilidad medidos durante las betas.

### Amazon

- **Operational Readiness Review (ORR)**: checklist de readiness (métricas,
  alarmas, rollback, runbook) exigido **antes de producción**, no antes del
  merge.
- **Correction of Error (COE)**: cada defecto que escapa a producción genera
  un análisis de causa raíz sin culpables, cuyo output son acciones
  preventivas — así el backlog de errores mejora el sistema, no solo apaga
  incendios.
- **Andon cord**: cualquiera puede frenar la línea ante un problema grave de
  cliente. El freno existe, pero es excepcional y para severidad real.

### El patrón común (lo que adoptamos)

| Principio | Traducción a Schema Forge |
| --- | --- |
| Gate en el **release**, no en el merge | El PR mergea con score visible; el freno real está en publicar a producción |
| **Shadow → warn → enforce** | Todo check nuevo arranca informativo y solo se endurece con datos (ya lo hacemos con `pipeline-validate.yml` en shadow mode) |
| **Error budget**, no cero defectos | Presupuesto de bugs/deuda por área; al agotarse, se paga deuda antes de seguir |
| **Telemetría decide**, no opinión | KPI declarado en el PR, señal verificada a 30 días, rollout gradual |
| **Riesgo escalona la exigencia** | Bajo/medio/alto definen profundidad de validación, nunca la existencia de evidencia |
| **Bug bar + triage** para el backlog | Severidades con SLA, tope de bugs activos, causa raíz obligatoria en los que escapan |

---

## 3. Modelo propuesto: score de calidad, no gate

### 3.1 El semáforo por PR/feature

Cada PR calcula (idealmente automático, al principio manual con el template)
un **Quality Score** con tres componentes:

```
Score = Entrega agéntica (evidencia) + Medición (KPI) + Validación (checks por riesgo)
```

Y se clasifica en semáforo:

| Estado | Significado | Efecto |
| --- | --- | --- |
| 🟢 Verde | Evidencia completa para su nivel de riesgo | Mergea y publica sin fricción |
| 🟡 Amarillo | Falta evidencia no crítica (KPI pendiente de definir, E2E focalizado faltante, doc parcial) | **Mergea igual**, pero genera un ítem de deuda con dueño y fecha; consume presupuesto |
| 🔴 Rojo | Condición innegociable violada | Bloquea — es la única situación bloqueante |

### 3.2 Lo único que bloquea (lista cerrada y corta)

Solo es 🔴:

1. **Build roto** o suite de CI existente en rojo (no "faltan tests": tests
   *que existen y fallan*).
2. **Integridad de datos** en dominios críticos (contabilidad, stock,
   migraciones) sin test de integridad ni plan de rollback.
3. **Drift de generados**: outputs regenerables desactualizados respecto de
   `decisions.json` (rompe el principio pipeline-first del repo).
4. **Telemetría con datos prohibidos** (IDs de registros, texto libre,
   secretos) — esto es compliance, no calidad.

Todo lo demás — cobertura, E2E faltante, KPI sin dashboard, doc incompleta —
es 🟡: visible, con deuda registrada, nunca bloqueante.

### 3.3 El presupuesto de deuda (el freno proporcional)

Copiado del error budget de Google y el bug cap de Microsoft:

- Cada 🟡 crea un ítem de deuda (Jira, label `quality-debt`) con dueño y
  vencimiento (sugerido: 2 sprints).
- **Presupuesto por área**: máximo N ítems de deuda abiertos (propuesta
  inicial: 10 por repo, a calibrar).
- Al superar el presupuesto, **esa área** (no todo el equipo) dedica su
  siguiente ciclo a pagar deuda antes de nuevas features.
- Así la calidad se autorregula: podés ir rápido acumulando amarillos, pero
  el sistema te cobra después, de forma predecible y sin bloquear el PR de
  hoy.

### 3.4 Progresión de cada check: shadow → warn → enforce

Ningún check nuevo nace bloqueante. Ciclo de vida (ya validado en el repo
con `pipeline-validate.yml`):

1. **Shadow** (2–4 semanas): corre en CI, solo anota. Se mide ruido y tasa
   de falsos positivos.
2. **Warn** (🟡): cuenta para el score y genera deuda.
3. **Enforce** (🔴): solo si (a) es de la lista cerrada de §3.2 y (b) tuvo
   <5% de falsos positivos en shadow/warn.

---

## 4. Los tres carriles de evidencia

### 4.1 Carril 1 — Entrega agéntica (trazabilidad)

Qué se declara en el PR (sección del template, §7):

- Flujo/skill usado, contexto leído, archivos tocados, requisito cubierto.
- Comandos de test exactos y resultado.
- Estado de docs (actualizada / no aplica / deuda).
- Handoff con riesgos y pendientes.

**Cómo se valida sin bloquear** (esto es lo que faltaba): no se audita el
100% a mano. Se hace como Google con testing certified:

- **Auditoría por muestreo**: cada semana se revisan 2–3 PRs al azar contra
  la evidencia declarada. Declaración falsa = hallazgo de proceso, se trata
  en retro, no con bloqueo.
- **Automatizable después**: un check en CI puede verificar presencia de la
  sección (no su veracidad) y marcarla 🟡 si falta — nunca 🔴.

### 4.2 Carril 2 — Medición (KPI por funcionalidad)

Regla: **toda feature declara KPI o justifica por qué no aplica.** La
declaración es barata (5 líneas en el PR); la verificación es diferida.

Dos momentos, como en el modelo de rings:

1. **Al merge**: KPI ID, evento Mixpanel, propiedades (baja cardinalidad),
   acción que lo emite, y estado (`Developed` / `Mixpanel ready` /
   `Backend pending` / `Definition pending`). Faltar = 🟡, no 🔴.
2. **A los 30 días** (review mensual de señales): ¿la feature muestra señal
   real de uso? Tres salidas posibles, todas legítimas:
   - **Señal presente** → feature validada.
   - **Sin señal, con explicación** → follow-up documentado (¿no se
     comunicó? ¿no sirve? ¿instrumentación rota?).
   - **Sin señal, sin explicación** → candidata a remover (el costo de
     mantener features muertas también es deuda).

Prohibiciones de instrumentación (esto sí es 🔴 por compliance): IDs de
registros, números de documento, nombres, URLs crudas, texto libre del
usuario, secretos, payloads de proveedores.

### 4.3 Carril 3 — Validación técnica por riesgo

La profundidad depende del riesgo; la **existencia de la declaración** es
obligatoria, la completitud es score:

| Riesgo | Ejemplos | Esperado para 🟢 | Si falta |
| --- | --- | --- | --- |
| Bajo | Docs, copy, solo tests | Lint + tests focalizados | 🟡 leve |
| Medio | Comportamiento frontend, ventanas generadas, UI compartida, generators | Unit + contract tests, build, E2E focalizado del flujo tocado | 🟡 con deuda |
| Alto | Contabilidad, stock, auth, migraciones, email, integridad de datos, deploy | CI completo, integración, smoke Playwright, plan de rollback, signoff QA | 🔴 solo por §3.2; el resto 🟡 con vencimiento corto (1 sprint) |

El freno duro se corre al **release a producción** (modelo Amazon ORR): para
publicar a un cliente se exige el readiness mínimo (CI verde, rollback
descrito, owner, smoke post-deploy). Eso no frena el desarrollo diario —
frena exactamente donde el costo del error es real.

---

## 5. Circuito de backlog de validación manual del ERP

La validación manual va a producir un volumen alto de hallazgos. Sin
circuito, pasan dos cosas malas: o se atiende todo al instante (muere la
velocidad) o se pudre en una lista (muere la confianza). El circuito:

### 5.1 Entrada única y triage

- **Entrada única**: todo hallazgo entra como issue con label
  `manual-validation` (origen: QA manual, feedback.md, cliente).
- **Triage 2 veces por semana** (30 min, timebox duro). Cada hallazgo sale
  del triage con: severidad, área de causa raíz y dueño.

### 5.2 Bug bar (severidades con SLA)

| Sev | Definición | SLA | Efecto |
| --- | --- | --- | --- |
| S1 | Pérdida/corrupción de datos, seguridad, bloquea operación del cliente | Inmediato — es el "andon cord": se frena lo que sea | Interrumpe sprint |
| S2 | Flujo principal roto con workaround, número/cálculo incorrecto visible | ≤ 1 sprint | Entra al sprint siguiente sí o sí |
| S3 | Flujo secundario, UX confusa, inconsistencia visual | ≤ 3 sprints | Cola priorizada |
| S4 | Cosmético, mejora, nice-to-have | Sin SLA | Backlog general; se cierra por lote o se descarta a los 90 días |

### 5.3 Causa raíz obligatoria (la parte que mejora el sistema)

Cada S1/S2 se clasifica por **dónde debió prevenirse** (versión liviana del
COE de Amazon):

- `config-ventana` → fix en `decisions.json` de esa ventana.
- `generator` → fix en el pipeline (aplica a TODAS las ventanas — regla del
  repo: nunca parchear generados).
- `runtime` → fix en com.etendoerp.go.
- `proceso` → faltó un check/test; alimenta la lista de checks en shadow
  (§3.4).

Métrica clave: % de hallazgos con causa `generator`/`proceso` que generaron
un fix sistémico. Es la diferencia entre corregir bugs y **hacer que esa
clase de bug no vuelva**.

### 5.4 Capacidad protegida

Durante la fase de validación manual: **split explícito de capacidad**,
propuesta inicial 60% features / 40% corrección, revisado cada sprint según
el burn-down del backlog. Cuando el backlog S1–S2 esté en cero sostenido,
se vuelve a 80/20.

---

## 6. OKRs ajustados (versión no bloqueante)

### Objetivo 1 — Toda feature es trazable y medible

- **KR1**: ≥ 90% de los PRs de feature incluyen la sección de entrega
  agéntica completa (medido por muestreo semanal + check de presencia).
- **KR2**: 100% de las features declaran KPI Mixpanel o justificación de no
  aplicabilidad al merge (la declaración, no el dashboard).
- **KR3**: ≥ 80% de las features publicadas muestran señal real en Mixpanel
  a 30 días, o tienen follow-up documentado; 0 features sin señal ni
  explicación después de la review mensual.

### Objetivo 2 — Calidad alta, visible y autorregulada (sin bloquear)

- **KR1**: Quality Score visible en el 100% de los PRs (template al inicio,
  automatizado al final del trimestre).
- **KR2**: Deuda de calidad (🟡) siempre dentro del presupuesto: ≤ 10 ítems
  abiertos por repo, 0 ítems vencidos (> 2 sprints) al cierre.
- **KR3**: 0 releases a producción sin readiness mínimo (CI verde, rollback,
  owner, smoke post-deploy) — este es el único punto de bloqueo duro.
- **KR4**: ≥ 2 checks pasan de shadow a warn con < 5% de falsos positivos.

### Objetivo 3 — El backlog de validación manual se absorbe y previene

- **KR1**: 100% de los hallazgos de validación manual triageados con
  severidad y causa raíz en ≤ 1 semana desde el reporte.
- **KR2**: SLA cumplido: S1 inmediato, S2 ≤ 1 sprint, en ≥ 90% de los casos.
- **KR3**: ≥ 30% de los S1/S2 con causa `generator`/`proceso` producen un
  fix sistémico (check nuevo en shadow, test de regresión o fix de pipeline)
  además del fix puntual.
- **KR4**: Tendencia de "escape rate" (hallazgos nuevos por semana de
  validación) decreciente en las últimas 4 semanas del trimestre.

---

## 7. Sección de PR propuesta (liviana)

```md
## Entrega agéntica
- Flujo/skill: ...
- Contexto leído: ...
- Requisito cubierto: ...
- Tests (comando + resultado): ...
- Docs: actualizada / no aplica / deuda #...

## Medición
- KPI: <id> | No aplica porque: ...
- Evento Mixpanel + propiedades: ...
- Estado: Developed / Mixpanel ready / Backend pending / Definition pending

## Calidad
- Riesgo: bajo / medio / alto
- Score: 🟢 / 🟡 (deuda: #...) 
- Rollback (solo riesgo alto): ...
```

Tres bloques, ~10 líneas. Si la sección se siente burocrática, se recorta:
el objetivo es que llenarla cueste menos de 3 minutos.

---

## 8. Roadmap de adopción (un trimestre)

| Fase | Semanas | Qué se activa |
| --- | --- | --- |
| **1. Shadow** | 1–3 | Template de PR opcional; triage de validación manual arranca (esto sí desde el día 1); checks de drift/docs corren en shadow; baseline de métricas |
| **2. Advisory** | 4–8 | Template obligatorio (falta = 🟡); score visible en cada PR; presupuesto de deuda activo; review mensual de señales Mixpanel #1 |
| **3. Enforce selectivo** | 9–13 | Solo la lista 🔴 de §3.2 bloquea; readiness de producción exigido; retro del trimestre: calibrar presupuesto, SLAs y qué checks suben de nivel |

Regla de oro del roadmap: **nada pasa a bloqueante sin haber corrido al
menos 3 semanas en modo advisory con datos de falsos positivos.**

---

## 9. Cómo aterriza en nuestros repos

Tenemos tres repos, y el plan les calza distinto porque **el nivel de riesgo
se correlaciona con el repo** y porque cada uno tiene su propio "momento de
release" (que es donde vive el único freno duro):

```
etendo_develop/
├── schema_forge/           FUNCIONAL — ventanas, decisions.json, artifacts
│                           "QUÉ se expone, por cliente"
├── schema_forge_core/      TOOLING — generators, pipeline, app-shell-core, CLI
│                           "CÓMO funciona" · llega como paquete npm publicado
└── etendo_core/modules/
    └── com.etendoerp.go/   RUNTIME — Java, NEO Headless, handlers
```

| Repo | Riesgo típico | Qué es "release" ahí (donde aplica el freno) | Deuda 🟡 vence |
| --- | --- | --- | --- |
| `schema_forge` | Bajo/medio — la config de una ventana afecta esa ventana | Deploy al cliente (contenedor UI) + `push-to-neo` | 2 sprints |
| `schema_forge_core` | **Medio/alto siempre** — un generator afecta TODAS las ventanas | **`npm publish` a GitHub Packages** — ese publish es el release del core | 1 sprint |
| `com.etendoerp.go` | Alto cuando toca transacciones, secuencias, integridad | `export.database` + deploy del módulo | 1 sprint |

Tres reglas derivadas:

1. **Un PR en el core puede mergear en 🟡 sin drama**: el momento de verdad
   es el publish del paquete, que exige regen limpio sobre ventanas reales.
   Y hay un buffer natural: el funcional pinnea la versión — un core con
   deuda no llega a nadie hasta que alguien bumpea el `package.json`.
2. **Feature multi-repo = un solo readiness.** El semáforo se calcula por
   PR, pero no se publica el paquete core ni se deploya el funcional hasta
   que todos los PRs de la feature estén al menos 🟡 sin rojos.
3. **El check de drift (🔴 #3) solo aplica en `schema_forge`** (ahí viven
   los generados); en el core su equivalente es "las fixtures de regresión
   del pipeline pasan".

---

## 10. Cómo aterriza en git

Nuestro modelo de ramas ya tiene los niveles que el plan necesita. El plan
no cambia el modelo: **le asigna un control distinto a cada nivel de merge**.
La respuesta corta a "¿se mergea o no?": *al epic se mergea casi siempre;
el "no" vive más arriba*.

```
 worktree local feat/<task>        pipeline interno DEV→REVIEW→QA→DOCS
        │  merge local                              (sin cambios)
        ▼
 feature/ETP-xxxx
        │  PR (agentes)          ◄══ SEMÁFORO 🟢🟡🔴
        ▼                            único check duro: la lista roja (§3.2)
 epic/ETP-xxxx                       🟡 mergea igual y genera deuda
        │  merge HUMANO          ◄══ TREN DE RELEASE (modelo Apple)
        ▼                            se revisa la deuda del epic;
 develop                             lo que no está listo NO se expone
        │  deploy automático         (push-to-neo = nuestro feature flag)
        ▼
   [ EXPERIMENTAL ]
        │
        │  merge HUMANO          ◄══ READINESS (modelo Amazon ORR)
        ▼                            el ÚNICO gate duro: CI verde,
 main                                rollback, owner, smoke
        │  deploy
        ▼
   [ STAGING ] ──► [ PRODUCTIVO ]    gradual: piloto → resto
```

Puntos clave:

- **PR `feature → epic`**: los únicos *required checks* en GitHub son build
  + suites existentes + un check `quality-red` que solo falla por la lista
  cerrada. Todo lo demás corre informativo: anota el PR, pone label
  `quality-yellow` y abre el issue de deuda — el botón de merge queda verde.
- **`epic → develop`** (ya es humano-only): antes de subir el epic se mira
  la deuda abierta. Y acá tenemos gratis lo que Apple hace con flags:
  **`push-to-neo` es nuestro feature flag** — una feature puede estar
  mergeada y deployada, pero si su config no se pushea a `ETGO_SF_*`, el
  cliente no la ve. La feature floja no se baja del merge: **se baja del
  tren** (no se expone).
- **`develop → main`**: el único merge que puede decir "no", con el
  readiness de §3.2. Pasa pocas veces y con costo real del otro lado.
- **El core tiene un release que no es merge**: el `npm publish`. Ahí se
  exige el regen limpio; el bump de versión en el funcional actúa como
  segundo readiness.
- **Hotfix S1** (andon cord): rama `hotfix/#N-ETP-xxxx`, merge supervisado
  directo — excepcional y humano, igual que hoy.
- Reglas del repo que el plan refuerza: **no squash** (la trazabilidad de
  commits es parte de la evidencia agéntica) y worktrees locales para el
  pipeline interno.

---

## 11. Cómo aterriza en los entornos

Modelo de anillos (Microsoft rings): cada entorno valida una **clase de
defecto distinta** — ninguno reemplaza a otro.

```
┌─ Ring 0 · LOCAL ─────────────────────────────────────────────────┐
│  make dev (:3100) · Etendo docker (:8080) · preview con mocks    │
│  Valida: la feature funciona. Fuente de la evidencia del PR.     │
└──────────────┬───────────────────────────────────────────────────┘
               ▼
┌─ Ring 0.5 · CI (efímero) ────────────────────────────────────────┐
│  build · unit · contract · pipeline-validate · E2E MOCKEADOS     │
│  Valida: lo determinístico. ► Acá se calcula el SEMÁFORO.        │
└──────────────┬───────────────────────────────────────────────────┘
               ▼  (develop se deploya acá automático — gap a cerrar)
┌─ Ring 1 · EXPERIMENTAL ──────────────────────────────────────────┐
│  E2E REALES (BASE_URL) · smoke · VALIDACIÓN MANUAL del ERP       │
│  Valida: lo emergente — concurrencia, datos reales, integración. │
│  ► Acá nace el backlog del bug bar (triage, severidades, SLA).   │
└──────────────┬───────────────────────────────────────────────────┘
               ▼  (main se deploya acá)
┌─ Ring 2 · STAGING ───────────────────────────────────────────────┐
│  Réplica de producción · smoke completo · signoff QA riesgo alto │
│  Valida: el release candidate como lo verá el cliente.           │
└──────────────┬───────────────────────────────────────────────────┘
               ▼  (deploy gradual: cliente piloto → resto)
┌─ Ring 3 · PRODUCTIVO ────────────────────────────────────────────┐
│  Smoke post-deploy · telemetría Mixpanel real                    │
│  Valida: uso real. ► Acá se mide la señal KPI de 30 días.        │
│  Si el piloto degrada métricas, el rollout no avanza.            │
└──────────────────────────────────────────────────────────────────┘
```

Lectura por riesgo: **bajo** muere en CI; **medio** exige pasar por
experimental con E2E real del flujo tocado; **alto** no llega a productivo
sin signoff de QA en experimental/staging + smoke post-deploy en el piloto.

Ejemplo de por qué los anillos no se reemplazan: el race de `searchKey`
(feedback.md 2026-07-08) es *invisible* en los E2E mockeados de CI — solo
reproduce contra Tomcat real con requests `/batch` concurrentes. Esa clase
de defecto pertenece al Ring 1, no a más tests en CI.

**Gaps de infraestructura a cerrar (Fase 1 del roadmap):**

1. **Deploy automático `develop → experimental`.** El tren solo funciona si
   mergear el epic implica "aparece en experimental" sin pasos manuales.
2. **Separación test/prod en Mixpanel** (proyecto separado o propiedad
   `environment` obligatoria) para no contaminar la señal de 30 días con
   datos de QA.
3. **Smoke post-deploy automatizado**: un spec Playwright mínimo (login +
   2–3 ventanas clave + un alta) corrible con `BASE_URL` apuntando al
   entorno recién deployado.

---

## 12. Casos de uso concretos (guía para explicarlo)

### 12.1 El viaje completo de una tarea (la imagen para presentar)

```
 DEVELOPER                      EQUIPO / HUMANO                 CLIENTE
─────────────────────────────  ─────────────────────────────  ──────────────
 1. branch feature/ETP-xxxx
 2. desarrolla y prueba
    en LOCAL
 3. PR al epic con la
    sección de 10 líneas ★
 4. CI → semáforo
    🟢 merge │ 🟡 merge+deuda
    🔴 corrige (lista corta)
 5. FIN de su parte ───────►   6. epic → develop (tren)
                               7. auto-deploy EXPERIMENTAL
                               8. validación manual / E2E real
                               9. hallazgos → triage → tareas
                                  nuevas con SLA (no reabren
                                  el PR)
                              10. develop → main (readiness)
                              11. STAGING: smoke + signoff ──► 12. PRODUCTIVO
                                                                   (piloto →
                                                                    resto)
                                                               13. señal KPI
                                                                   a 30 días
```

★ = lo único NUEVO para el developer. Todo lo demás ya lo hace hoy.

### 12.2 Caso A — Feature nueva (ej.: import CSV de Contacts, ETP-4447)

**Qué tiene que hacer el developer, paso a paso:**

1. **Branch** `feature/ETP-4447` desde el epic, en los repos que toque
   (acá: funcional + core). Igual que hoy.
2. **Desarrolla y prueba en LOCAL**: `make dev` contra el Etendo docker,
   corre el E2E del flujo de import. Igual que hoy.
3. **Abre los PRs al epic** con la sección de 10 líneas (§7):
   - *Entrega agéntica*: contexto leído (guía funcional de Contacts),
     comandos de test con resultado, estado de docs.
   - *Medición*: evento `import_flow_completed`, propiedades de baja
     cardinalidad (`window: contacts`, `rows_bucket: 51-100`,
     `outcome: success|partial|abandoned`), estado `Mixpanel ready`.
   - *Calidad*: riesgo **medio** (frontend + componente genérico del core).
4. **CI calcula el semáforo**:
   - Tiene unit + contract pero le falta el E2E focalizado → **🟡: mergea
     igual**, se abre issue `quality-debt` a su nombre, vence en 2 sprints
     (1 sprint el del core).
   - Solo lo frenaría un 🔴: build roto, drift de generados, o que el
     evento Mixpanel llevara nombres/emails de contactos (dato prohibido).
5. **Fin de su parte.** El resto no lo bloquea:
   - El humano sube el epic a develop → aparece en **experimental** → QA
     manual importa un CSV real de 100 filas.
   - El core publica versión nueva solo con regen limpio; el funcional
     bumpea cuando la necesita.
   - En **productivo**, a los 30 días la review mensual pregunta: ¿algún
     cliente importó contactos de verdad? Sin señal y sin explicación →
     candidata a remover.
6. **Lo único que le vuelve**: pagar su deuda 🟡 (el E2E) antes del
   vencimiento, o el área entra en modo "pagar deuda" (§3.3).

### 12.3 Caso B — Bug de validación manual (ej.: race de `searchKey`)

**El circuito completo, con el bug real de hoy:**

1. **Detección en EXPERIMENTAL**: QA importa `contacts-sample-import-100.csv`
   y filas aleatorias fallan con un error engañoso ("could not extract
   ResultSet"). Invisible en CI: solo reproduce con concurrencia real.
2. **Entrada única**: issue con label `manual-validation`. (El diagnóstico
   técnico puede seguir viviendo en `feedback.md`, pero el issue es lo que
   entra al circuito.)
3. **Triage** (2×/semana, 30 min): severidad **S2** — flujo principal roto
   intermitente, sin corrupción de datos (la fila falla, no escribe mal).
   SLA: entra al sprint siguiente. Causa raíz doble: `runtime`
   (`BusinessPartnerHandler.afterHandle`) **y `proceso`** — el test de
   integración que cubría esto fue silenciado con `@Ignore` en vez de
   investigarse.
4. **El developer toma la tarea**: branch `feature/ETP-yyyy`, reproduce en
   LOCAL contra el docker, aplica el fix. Riesgo **alto** (transacciones,
   secuencias) → test de integración + plan de rollback en el PR.
5. **Fix sistémico además del puntual** (esto es lo que mide el KR3 del
   Objetivo 3): reactivar/reescribir el test `@Ignore`d para que esta clase
   de race no vuelva a entrar silenciada.
6. **Mismo viaje que cualquier feature**: PR con semáforo → epic → develop
   → verificación en experimental con el MISMO CSV que lo detectó →
   staging → productivo.
7. **Qué NO pasa**: nadie frena los PRs de la feature de import por este
   bug — es un defecto preexistente del runtime, va por su carril con su
   SLA. El plan evita el acople "apareció un bug → se frena todo".

### 12.4 Caso C — Hotfix S1 (el andon cord)

Pérdida de datos, seguridad o cliente bloqueado: rama `hotfix/#N-ETP-xxxx`,
merge supervisado directo a develop/main, deploy inmediato con smoke
post-deploy. Es la única vía que salta el tren — excepcional, humana y
auditada con COE (causa raíz sin culpables) después del incendio.

### 12.5 Qué cambia y qué no para el developer (resumen para la presentación)

| | Hoy | Con el plan |
| --- | --- | --- |
| Branch, worktree, pipeline DEV→REVIEW→QA→DOCS | ✓ | Igual |
| Tests locales antes del PR | ✓ | Igual |
| Sección de 10 líneas en el PR (evidencia + KPI + riesgo) | — | **★ Nuevo (~3 min)** |
| Esperar aprobaciones extra para mergear | — | **No** — 🟡 mergea |
| Pagar deuda 🟡 con vencimiento | informal | **★ Explícito, con dueño** |
| Ser interrumpido por bugs de validación manual | ad hoc | **Solo S1**; S2–S4 entran por triage con SLA |

---

## 13. Decisiones a validar en conjunto

Esto es lo que hay que acordar antes de ejecutar (cada punto tiene una
propuesta default para no discutir en abstracto):

1. **Lista 🔴** (§3.2): ¿estos 4 puntos y nada más? Default: sí.
2. **Presupuesto de deuda**: ¿10 ítems por repo, vencimiento 2 sprints
   (1 en el core)?
3. **Split de capacidad** durante validación manual: ¿60/40?
4. **SLAs del bug bar**: ¿S2 ≤ 1 sprint es realista con el equipo actual?
5. **Dueño de la review mensual de señales Mixpanel**: ¿quién la corre?
6. **Umbral de muestreo** de auditoría agéntica: ¿2–3 PRs/semana alcanza?
7. **¿El readiness de producción aplica ya** o recién en la fase 3?
8. **Mapeo de entornos** (§11): ¿develop→experimental y main→staging→
   productivo? ¿Quién arma el deploy automático a experimental y la
   separación test/prod de Mixpanel?

Con estas 8 respuestas, el plan pasa de propuesta a operativo.

---

## 14. Plan de acción (ejecución)

### 14.0 Lo que YA existe (no se construye, se reutiliza)

Inventario real de `.github/workflows/` — el plan mayormente **cablea y
clasifica** piezas existentes, no crea infraestructura nueva:

| Pieza existente | Rol en el plan |
| --- | --- |
| `quality-gate.yml` (corre en PRs a develop/epic, con config y baseline) | **Host del semáforo** — se extiende, no se crea |
| `deploy-staging.yml` (SPA a S3+CloudFront; ya conoce production/staging/experimental) | Base del deploy automático a entornos |
| `offline-regen-check.yml` | El check de drift — **🔴 #3 ya implementado** |
| `pipeline-validate.yml` (en shadow) | El patrón shadow→enforce ya validado en casa |
| `window-doc-freshness.yml`, `data-testid-check.yml`, `ratchet-guards.yml`, `sonar-scan.yml`, `test.yml` | Candidatos a 🟡 (advisory) — solo hay que clasificarlos |

### Semana 0 — Arranque (sin código)

| # | Acción | Dueño | Done cuando |
| --- | --- | --- | --- |
| A0.1 | Reunión (1h) para cerrar las 8 decisiones de §13 | Equipo | Acta con los defaults confirmados o ajustados |
| A0.2 | Crear epic Jira "Calidad agéntica" con las tareas de este plan | Clerk | Tareas creadas y priorizadas |
| A0.3 | **Activar el triage YA** (no depende de nada): labels `manual-validation` + severidades S1–S4, 2 slots semanales de 30 min. Migrar los hallazgos vivos de `feedback.md` a issues — empezando por el race de `searchKey` (S2) | QA + coordinador | Primer triage corrido con el backlog actual clasificado |
| A0.4 | PR template (`.github/PULL_REQUEST_TEMPLATE.md`) con las 3 secciones de §7, en ambos repos. **Opcional** en esta fase | Dev | Template mergeado |

### Fase 1 — Shadow (semanas 1–3)

| # | Acción | Dueño | Done cuando |
| --- | --- | --- | --- |
| A1.1 | Clasificar cada workflow existente (tabla §14.0) en 🔴 / 🟡 / informativo según §3.2 | Dev + equipo | Tabla acordada, anexada a este doc |
| A1.2 | Extender `quality-gate.yml`: detectar presencia de las secciones del template en el body del PR → anotación en el PR, **sin fallar** | Dev (core) | Corrió 2 semanas en PRs reales; medido % de adopción |
| A1.3 | `docs/telemetry-conventions.md`: naming de eventos, propiedades permitidas, denylist de datos prohibidos, propiedad `environment` obligatoria | Dev + dueño Mixpanel | Doc validado con 1 evento real (`import_flow_completed`) |
| A1.4 | Separación test/prod en Mixpanel (proyecto separado o propiedad `environment`) | Dueño Mixpanel | Eventos de experimental distinguibles de producción |
| A1.5 | Baseline de métricas: % PRs con evidencia, hallazgos/semana de validación manual, deuda implícita | Coordinador | Números registrados (son la línea de base de los OKRs) |
| A1.6 | Completar deploy automático `develop → experimental` (la SPA ya está en `deploy-staging.yml`; falta backend/config NEO sin pasos manuales) | Dev/infra | Mergear a develop actualiza experimental completo |

### Fase 2 — Advisory (semanas 4–8)

| # | Acción | Dueño | Done cuando |
| --- | --- | --- | --- |
| A2.1 | Template obligatorio: el check de A1.2 pasa a warn → label `quality-yellow` + **auto-issue** `quality-debt` con dueño (autor del PR) y vencimiento | Dev (core) | Primer issue de deuda creado automáticamente |
| A2.2 | Tablero de deuda con presupuesto visible (≤10 por repo, vencimientos) | Clerk | Board/query consultable por cualquiera |
| A2.3 | Smoke post-deploy: spec Playwright mínimo (login + 2–3 ventanas + un alta) con `BASE_URL`, enganchado a `deploy-staging.yml` | Tester | Smoke corre tras cada deploy a experimental/staging |
| A2.4 | Primera review mensual de señales Mixpanel | Dueño (decisión #5) | Acta: features con señal / sin señal / follow-ups |
| A2.5 | Auditoría por muestreo: 2–3 PRs/semana revisados contra su evidencia declarada (en la retro) | Equipo | 4 semanas consecutivas corridas |
| A2.6 | Medir falsos positivos de todos los checks en warn | Dev | Tabla de FP por check (insumo de la Fase 3) |

### Fase 3 — Enforce selectivo (semanas 9–13)

| # | Acción | Dueño | Done cuando |
| --- | --- | --- | --- |
| A3.1 | Branch protection: *required checks* = build/tests + `offline-regen-check` + `quality-red`; **todo lo demás queda informativo** | Admin repo | Solo la lista 🔴 puede frenar un merge |
| A3.2 | Check de datos prohibidos en telemetría (denylist de A1.3 sobre eventos nuevos) — entra directo como 🔴 por compliance | Dev (core) | Detecta un caso sembrado de prueba |
| A3.3 | Readiness de producción operativo: checklist (CI, rollback, owner) + smoke post-deploy bloqueante para promover a productivo | Coordinador + dev | Primer release con readiness completo registrado |
| A3.4 | Retro trimestral: calibrar presupuesto/SLAs, promociones shadow→warn→enforce con los datos de A2.6, revisar OKRs | Equipo | Acta + versión 2 de este documento |

### Reglas de ejecución

1. **Cada ítem = una tarea Jira** dentro del epic de A0.2, con su rama
   `feature/ETP-xxxx` — y sus PRs usan la sección de §7 desde el día uno
   (*dogfooding*: el plan se aplica a sí mismo).
2. **Nada pasa a bloqueante sin 3 semanas de datos en advisory** (regla de
   oro de §8). La única excepción es A3.2 (compliance).
3. El triage (A0.3) arranca en Semana 0 porque la validación manual **ya
   está produciendo hallazgos hoy** — es lo único que no puede esperar.
4. Si un ítem de infra se atrasa (A1.6), las fases avanzan igual: el tren
   funciona manual mientras tanto; solo se degrada la velocidad, no el
   modelo.

---

## 15. Qué es automático y qué es manual

Principio de diseño (el mismo de Microsoft/Google):

> **La máquina junta evidencia y avisa; el humano decide qué se expone y
> qué se publica.** Se automatiza lo verificable (builds, drift, presencia
> de evidencia, deploys, smoke). Nunca se automatiza el juicio (severidad,
> riesgo, exponer una feature, publicar a un cliente).

### 15.1 El viaje de la tarea, paso a paso

Siguiendo el diagrama de §12.1 — ⚙️ automático · ✋ manual (a propósito) ·
⏳ manual hoy, automático en la fase indicada:

| Paso del flujo | Quién / qué | Tipo |
| --- | --- | --- |
| Branch, worktree, pipeline DEV→REVIEW→QA→DOCS | Developer / agentes | ✋ (como hoy) |
| Llenar la sección de 10 líneas del PR (evidencia, KPI, **riesgo**) | Developer (~3 min) | ✋ — es una declaración; el juicio de riesgo no se automatiza |
| Verificar que la sección exista en el PR | `quality-gate.yml` | ⏳ auto en Fase 1 (A1.2) |
| Calcular el semáforo: correr build, tests, contract, drift (`offline-regen-check`), doc freshness, sonar | CI | ⚙️ ya existe — solo se clasifica en 🔴/🟡 (A1.1) |
| Poner label `quality-yellow` + crear issue de deuda con dueño y vencimiento | GitHub Action | ⏳ auto en Fase 2 (A2.1) |
| Bloquear merge por lista 🔴 | Branch protection | ⏳ auto en Fase 3 (A3.1) |
| **Decidir mergear el PR** (con 🟢 o 🟡) | Nadie — mergea si no hay 🔴 | ⚙️ ese es el punto: sin aprobación humana extra |
| Recordar deuda por vencer | Bot / Action | ⏳ auto en Fase 2 |
| Merge `epic → develop` (el tren) | Humano | ✋ **siempre** — por diseño |
| Deploy `develop → experimental` | `deploy-staging.yml` | ⚙️ SPA ya; completo tras A1.6 |
| **Decidir qué se expone al cliente** (`push-to-neo` sí/no) | Humano (producto) | ✋ **siempre** — es el feature flag |
| E2E reales contra experimental | CI programado / a demanda | ⏳ auto en Fase 2 |
| Validación manual del ERP | QA / equipo | ✋ **siempre** — es el propósito de esta etapa |
| Crear el issue `manual-validation` por hallazgo | Quien lo encuentra | ✋ (1 min con template de issue) |
| Triage: severidad S1–S4 + causa raíz + dueño | Humanos, 2×/semana, 30 min | ✋ **siempre** — juicio puro |
| SLA del bug bar: avisar S2 sin tomar, S3 vencidos | Bot / query | ⏳ auto en Fase 2 |
| Merge `develop → main` + readiness (CI, rollback, owner) | Humano con checklist | ✋ **siempre** — el único gate duro es humano |
| Smoke post-deploy en staging/productivo | Playwright + `deploy-staging.yml` | ⏳ auto en Fase 2 (A2.3) |
| Rollout gradual piloto → resto | Humano mirando métricas | ✋ (automatizable a futuro, fuera de alcance) |
| Emisión de eventos Mixpanel | La app | ⚙️ |
| Detectar datos prohibidos en telemetría | Check denylist | ⏳ auto en Fase 3 (A3.2) |
| **Interpretar la señal de 30 días** (¿se usa? ¿se remueve?) | Review mensual, humana | ✋ **siempre** |
| Auditoría de veracidad de la evidencia (muestreo 2–3 PRs) | Humanos en la retro | ✋ **siempre** — la máquina chequea presencia, no verdad |
| Calibración trimestral (presupuesto, SLAs, promociones de checks) | Equipo | ✋ **siempre** |

### 15.2 Resumen en una línea por rol

- **La máquina** (CI + Actions): corre checks, calcula el semáforo, etiqueta,
  abre y persigue deuda, deploya, corre smoke, avisa vencimientos. Nunca
  decide exponer ni publicar.
- **El developer**: declara (10 líneas), clasifica riesgo, paga su deuda.
  No espera aprobaciones para mergear.
- **QA / validación manual**: prueba en experimental, reporta con severidad
  sugerida. No interrumpe a nadie salvo S1.
- **El humano que opera el tren** (coordinador/lead): triage 2×/semana,
  merge epic→develop, decide qué se expone, readiness a main, review
  mensual de señales, retro trimestral. **Todas las decisiones de juicio
  están acá, y son pocas horas por semana.**

### 15.3 La progresión (por qué empieza más manual de lo que termina)

| Tarea | Fase 0–1 (shadow) | Fase 2 (advisory) | Fase 3 (enforce) |
| --- | --- | --- | --- |
| Presencia de evidencia en PR | Revisor mira | ⚙️ check + label | ⚙️ + deuda auto |
| Issue de deuda | Se abre a mano | ⚙️ auto con dueño/vencimiento | ⚙️ + presupuesto visible |
| Bloqueo por lista 🔴 | No bloquea (se anota) | No bloquea (warn) | ⚙️ branch protection |
| Deploy a experimental | Parcial (SPA auto) | ⚙️ completo | ⚙️ |
| Smoke post-deploy | No existe | ⚙️ tras cada deploy | ⚙️ bloqueante para promover |
| Denylist telemetría | Revisión a ojo | Revisión a ojo | ⚙️ check 🔴 |

La regla de oro aplica acá también: **nada se automatiza como bloqueante
sin haber corrido antes en modo aviso** — la automatización sigue el mismo
camino shadow → warn → enforce que los checks.
