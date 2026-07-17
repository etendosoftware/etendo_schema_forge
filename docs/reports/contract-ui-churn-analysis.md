# Informe: por qué `DetailView.jsx` y `DataTable.jsx` se tocan en casi todos los PR

**Fecha:** 2026-06-10
**Autor:** análisis automatizado (Forge)
**Archivos analizados:**
- `tools/app-shell/src/components/contract-ui/DetailView.jsx`
- `tools/app-shell/src/components/contract-ui/DataTable.jsx`

---

## 1. Resumen ejecutivo

Estos dos archivos son los **componentes genéricos centrales** que renderizan, respectivamente, la ventana de detalle (cabecera + líneas + tabs secundarios + acciones de documento) y cualquier tabla de datos (lista + add-row inline + edición en celda). Cada ventana del producto pasa por ellos.

El problema que observas es real y medible: **no son componentes "que deberían tocarse poco" — son los cuellos de botella arquitectónicos del frontend**. Toda nueva capacidad de ventana acaba pasando por aquí porque:

1. Son **God Components** configurados por props (DetailView recibe **~90 props**).
2. Mezclan **render + estado + lógica de negocio + llamadas de red (fetch/PATCH/DELETE)** en el mismo archivo.
3. Acumulan deuda que dispara **SonarQube** (complejidad cognitiva), lo que genera una segunda ola de commits de "extract/refactor" además de los de feature.

### Métricas de churn (historial completo, `git log --follow`)

| Métrica | DetailView.jsx | DataTable.jsx |
|---|---|---|
| Tamaño actual | **3.914 líneas** | **1.915 líneas** |
| Commits totales | **262** | **128** |
| Líneas añadidas / borradas (histórico) | **+10.814 / −6.418** | **+4.238 / −1.842** |
| Tickets ETP distintos que lo tocaron | **48** | **40** |
| Hooks de React internos (`useState`/`useEffect`/`useMemo`/`useCallback`/`useRef`) | **112** | **41** |
| Helpers exportados (para poder testear) | **69** | **3** |
| Meses con actividad | mar–abr–may–jun 2026 | mar–abr–may–jun 2026 |

> ⚠️ Las cifras "163" y "85" que viste en los PR **no son el tamaño del archivo** — son las *líneas modificadas* en un PR concreto. El archivo real tiene casi 4.000 líneas. Que un PR cambie 163 líneas de un fichero de 4.000 es exactamente el síntoma de un God Component: cada feature pellizca un poco de todo.

---

## ⚖️ Restricciones rectoras (OBLIGATORIAS para TODA corrección de este informe)

> Cualquier propuesta de las secciones 5, 8 y 9 está **subordinada a estas dos restricciones**. Una corrección que viole cualquiera de las dos es inválida, por buena que sea la idea.

### R1 — Inocuidad funcional al 100 %
Toda corrección debe ser **behavior-preserving**: la app debe comportarse exactamente igual antes y después, en **todas las ventanas**, no solo en la que motivó el cambio. Esto es especialmente crítico aquí porque `DetailView`/`DataTable` son **componentes compartidos consumidos por todas las ventanas** — el riesgo no es romper una ventana, es romper N. Los reverts históricos (`noHoverHide — broke other windows`) son la prueba de que este riesgo es real.

**Protocolo de verificación de inocuidad (obligatorio en cada PR):**
1. Usar la skill `innocuous-check` sobre el diff, hunk por hunk.
2. Los tests existentes (`DetailView.*.vitest.js`, `DataTable.*.vitest.jsx`, ~27 ficheros) deben pasar **sin modificarse**. Si un test hay que cambiarlo, el cambio **no** es inocuo → revisar.
3. Verificación visual/funcional en una muestra de ventanas que ejerciten cada layout: `classic` y `inlineEditable`, con líneas y con tabs secundarios (p. ej. sales-order, invoice, product, exchange-rate).
4. PR de refactor puro **separado** de cualquier PR de feature. Nunca mezclar.

### R2 — Sobrevivir a la regeneración (los generadores se adaptan)
`decisions.json` es la única fuente de verdad y **el frontend por-ventana se regenera** (`make regen` → `generate-frontend.js` → `artifacts/*/generated/web/<window>/`). De aquí se derivan dos reglas:

- **Los componentes compartidos (`DetailView.jsx`, `DataTable.jsx`) NO se regeneran** → editarlos sobrevive por sí solo. ✅
- **El código por-ventana que los consume SÍ se regenera** → si una corrección requiere que la ventana pase una prop nueva o una metadata de campo nueva, hay que implementarlo en **`generate-frontend.js`** (y normalmente declararlo en `decisions.json` / contrato). Si no, el siguiente `make regen` borra el cambio.

**Regla práctica:** mover lógica hardcodeada del genérico al contrato **siempre** es un cambio en dos sitios a la vez (atómico):
> `decisions.json`/contrato (declaración) **+** `generate-frontend.js` (emisión de la prop) **+** componente compartido (consumo de la prop).

Precedente que ya funciona así: `lookupDrawer`, `onSelectMappings`, `forceCalloutFields`, `lineConfig` y `customAddModal` ya recorren ese camino completo (ver `generate-frontend.js:660`, `:1311`, `:1541`, `:1622`). Las correcciones L1/L2/L3 deben replicar exactamente ese patrón.

### R3 — Decisiones dispersas: solo se declara lo que pisa el default

Toda propiedad nueva que se añada a `decisions.json` debe tener un **default sensato implícito**, y **solo se escribe en `decisions.json` cuando se quiere sobrescribir ese default**. El default nunca se materializa en el archivo. Esto vale en las tres capas:

1. **`decisions.json`** — si el valor coincide con el default, **no aparece**. El archivo solo contiene desviaciones (filosofía *convention over configuration*).
2. **Generador (`generate-frontend.js`)** — emite la prop **solo cuando el valor difiere del default** (patrón `wrapIf(...)` que ya usa el generador). Si es el default, no emite nada → el código generado queda limpio y el componente aplica su valor por defecto.
3. **Componente compartido** — define el default en la firma/lectura de props (`props.x ?? DEFAULT`).

**Ejemplos aplicados a este informe:**
- **L1 (icono):** el icono por defecto es `List` (el actual fallback). Un tab solo declara `icon: 'shield'` si quiere otro; un tab normal **no declara `icon`** y el generador **no emite** la prop.
- **L2 (`excludeFields`):** el default es `[]` (no excluir nada). Solo el tab contact declara `excludeFields: ["active"]`; el resto no lo lleva y el generador no emite nada.
- **L3 (`priceTriggerField`):** el default es `'product'` (el comportamiento actual). Solo una ventana cuyo disparador se llame distinto lo declara; las demás **no tocan nada** y siguen funcionando exactamente igual — lo que además refuerza R1 (inocuidad: las ventanas existentes no cambian su contrato).

**Beneficio doble:** mantiene `decisions.json` y el código generado mínimos/legibles, y garantiza que migrar un hardcode a declarativo es **inocuo por construcción** (el default reproduce el comportamiento previo sin que ninguna ventana tenga que declarar nada).

### Matriz: cada propuesta contra R1 y R2

| Propuesta | ¿Toca generador? (`generate-frontend.js`) | Cómo se garantiza la inocuidad (R1) |
|---|---|---|
| **S1** lint budget | No | No cambia comportamiento (solo CI) |
| **S2** metadata vs ifs | **Sí** — emitir la metadata por campo/tab | tests existentes + muestra de ventanas |
| **S3** tests de regresión | No | Añade red de seguridad (no cambia código) |
| **S4** red→hooks | No (la firma de props no cambia) | `innocuous-check` + tests de PATCH/optimistic |
| **S5** negocio→lib | No | tests de cálculo precio/impuesto/descuento |
| **S6/Sec.9** sub-componentes | **Posible** — solo si cambia la firma que emite el generador; si la API de `DetailView` se mantiene, **no** | refactor puro + `innocuous-check` + ~27 tests sin tocar |
| **S7** slots/composición | **Sí** — el generador pasaría a emitir composición, no 90 props | el más arriesgado; hacer por capas detrás de un flag de compatibilidad |
| **L1** icono `sif` | **Sí** — emitir `tab.icon` | mapa lucide genérico; ventana SIF re-verificada |
| **L2** `contact` excludeFields | **Sí** — emitir `tab.excludeFields` (el descriptor de tab ya se emite en `:1543`) | ventana contact re-verificada |
| **L3** `field === 'product'` | **Sí** — emitir `priceTriggerField`/`isPriceTrigger` | re-test de order **e** invoice (cadena de callouts) |
| **L4** drawer import | No (registro + lazy import, interno al app-shell) | tests de DataTable + ventana internal-consumption |

> Implicación clave para la **Sección 9 (sub-componentes):** si la descomposición **mantiene la API pública de `DetailView`** (mismos props de entrada), entonces es un refactor 100 % interno al app-shell, **no toca el generador** y sobrevive a regeneración trivialmente. Esa es la estrategia recomendada: descomponer por dentro sin cambiar el contrato de props hacia el código generado. El cambio de props (S7) se deja para una fase posterior y explícita.

---

## 2. Diagnóstico: por qué se tocan tanto

### Causa raíz #1 — God Component configurado por props
`DetailView({...})` declara **~90 props** (`entity`, `detailEntity`, `Form`, `DetailTable`, `draftMode`, `sidePanel`, `linesLayout`, `lineConfig`, `lockWhenProcessed`, `toolbarPaddingX`, `secondaryTabsPaddingY`, …). Cada vez que una ventana necesita un comportamiento ligeramente distinto, **la solución por defecto del equipo ha sido añadir una prop más** y una rama `if` dentro del componente. Esto significa:
- Cualquier ventana nueva = al menos un toque al componente genérico.
- Cada prop nueva amplía la superficie de regresión para **todas** las demás ventanas.

**Evidencia de acoplamiento (commits de revert):**
```
07dc4cd3 ETP-4032: Revert unintended changes to shared contract-ui components
20d1a79c ETP-4031: Revert noHoverHide — broke other windows
0f49231a ETP-3799: Revert unintended change to Contacts window
```
El propio `noHoverHide` "rompió otras ventanas" → confirma que un cambio pensado para una ventana se propaga a todas.

### Causa raíz #2 — Lógica de negocio y de red dentro del componente de UI
Ambos archivos contienen `fetch`/`PATCH`/`DELETE` directos, cadenas de callouts, coerción de tipos para BigDecimal, derivación de precios/impuestos y reglas de negocio. Ejemplos en `DetailView.jsx`:
- `buildInlineRowUpdateHandler` (autosave inline con cadena de callouts, ~90 líneas).
- `buildSecondaryLineHandlers` (add/save/delete de líneas secundarias con `fetch`).
- `deriveTaxRateFromGross`, `prepareLineForPost` (matemática de negocio).

Cuando cambia una regla de negocio (descuentos, impuestos, exchange rate, amortización), **se edita un componente de presentación**. Eso es lo que ves en tickets como ETP-4015 (double-discount), ETP-4030 (exchange rate), ETP-4103 (amortización).

### Causa raíz #3 — Fugas de lógica específica de ventana
A pesar de ser "genéricos", quedan ramas atadas a entidades concretas:
```js
// DetailView.jsx
661:  excludeFields={props.st.key === "contact" ? ["active"] : []}
2172: if (field === 'product' && result.standardPrice != null && ...)
2177: if (field === 'product' && lineConfig.discountField) ...
```
`DataTable.jsx` ya migró parte de esto a metadata declarativa (`onSelectMappings`, `LOOKUP_DRAWERS`, `displayFromCatalog`) — **ese es exactamente el patrón correcto** y explica por qué DataTable tiene menos churn relativo que DetailView. DetailView aún no ha hecho esa migración del todo.

### Causa raíz #4 — Bucle de complejidad / SonarQube
De los **últimos 60 commits** de DetailView, **17 son refactors de Sonar/complejidad/extract** (nested ternary → IIFE, extraer helpers para bajar complejidad cognitiva, "Fix sonar"). Esto crea un patrón de doble toque:
1. Un PR de feature **engorda** el archivo y dispara el umbral de complejidad de Sonar.
2. El PR siguiente (o el mismo) **extrae helpers** para apaciguar a Sonar.

Los **69 helpers exportados** de DetailView existen casi todos para *poder testear funciones que de otro modo estarían atrapadas dentro del componente*. Es deuda visible: la extracción se hace por presión de la herramienta, no por diseño de dominio.

### Resumen de los 3 vectores de churn
| Vector | % aproximado del churn | Síntoma |
|---|---|---|
| Features de ventana que añaden props/ramas | ~50% | "Add maxDetailLines", "Add fromSibling derivation" |
| Refactors de complejidad/Sonar | ~30% | "Extract helpers to reduce complexity", "Fix sonar" |
| Fixes de regresión / reverts por acoplamiento | ~20% | "Revert noHoverHide — broke other windows" |

---

## 3. ¿Están bien estructurados?

**Parcialmente.** Hay buen trabajo y problemas claros.

### ✅ Lo que está bien
- **Helpers puros extraídos y testeados**: `detailContentPadding`, `resolveCanAddLines`, `getDocumentReadOnly`, etc. son funciones puras con tests directos. Buena base.
- **Cobertura de tests alta**: ~27 ficheros de test entre los dos componentes (incluido `DetailView.extractedHelpers.vitest.js` de 42 KB).
- **DataTable va por buen camino**: el registro `LOOKUP_DRAWERS`, `onSelectMappings` y `displayFromCatalog` son ejemplos de **extensión por metadata declarativa en vez de ramas hardcodeadas** — la dirección correcta.
- **Comentarios de dominio excelentes**: el *por qué* está documentado inline (locale-safe number parsing, optimistic update + rollback, etc.).

### ❌ Lo que no está bien
- **DetailView es un God Component**: ~90 props, 3.914 líneas, mezcla 4 responsabilidades (layout, estado, negocio, red).
- **Responsabilidades de red dentro de un componente de presentación**: `fetch`/PATCH/DELETE deberían vivir en hooks/servicios, no en el JSX.
- **Lógica de negocio en la capa de UI**: derivación de impuestos/precios/descuentos.
- **Extracción guiada por la herramienta**: 69 helpers exportados es señal de que se extrae para callar a Sonar, no para modelar el dominio. Muchos helpers son `getXxxClassName(...)` triviales que solo existen para mover una ternaria fuera del JSX.
- **Acoplamiento entre ventanas**: no hay aislamiento; un cambio para la ventana A puede romper la B (probado por los reverts).

---

## 4. Problemas concretos (priorizados)

| # | Severidad | Problema | Evidencia |
|---|---|---|---|
| P1 | 🔴 Alta | DetailView God Component (~90 props, 3.9k líneas) — todo PR lo toca | 262 commits, 48 tickets |
| P2 | 🔴 Alta | Lógica de red (fetch/PATCH/DELETE) y de negocio dentro del componente de UI | `buildInlineRowUpdateHandler`, `buildSecondaryLineHandlers`, `deriveTaxRateFromGross` |
| P3 | 🟠 Media | Acoplamiento entre ventanas → regresiones cruzadas | 4 commits de "revert / broke other windows" |
| P4 | 🟠 Media | Fugas de lógica específica de ventana (`=== 'contact'`, `=== 'product'`) | líneas 661, 2172, 2177, 2204 |
| P5 | 🟠 Media | Bucle Sonar: feature engorda → refactor para bajar complejidad | 17/60 commits recientes son extract/sonar |
| P6 | 🟡 Baja | 69 helpers exportados solo para testabilidad/Sonar, no por diseño | `getXxxClassName` triviales |
| P7 | 🟡 Baja | Sin "presupuesto" de tamaño/complejidad que frene el crecimiento | crecimiento monótono +10.8k líneas |

---

## 5. Propuestas de solución

### Corto plazo (bajo riesgo, alto valor) — frenar la hemorragia

**S1. Poner un límite explícito (lint budget).**
Añadir una regla de tamaño/complejidad por archivo en estos dos ficheros (ESLint `max-lines`, `complexity`) que **falle el CI si crecen**. Convierte el crecimiento silencioso en una decisión consciente. Sin esto, cualquier refactor se vuelve a llenar. *Ya existe una implementación de referencia del patrón "fail-if-grows": el ratchet de conteo de métodos `cli/src/method-budget.js` (baseline congelado, falla solo si sube, `--update` para bajarlo). Reutilizar la misma filosofía aquí, vía ESLint.*

**S2. Reemplazar ramas `=== 'product' / 'contact'` por metadata declarativa.**
Replicar en DetailView el patrón que **DataTable ya usa bien** (`onSelectMappings`, `LOOKUP_DRAWERS`, `displayFromCatalog`). Las ramas de las líneas 661/2172/2177/2204 deben pasar a `decisions.json → contract` (p. ej. `field.derivePriceFromStandard: true`, `tab.excludeFields: ["active"]`). Esto es coherente con la regla del proyecto: *toda customización debe sobrevivir a la regeneración del pipeline*.

**S3. Convertir cada `revert` en un test de regresión.**
Los 4 reverts (`noHoverHide`, contact, etc.) demuestran que falta un test que pille la regresión cruzada. Añadir un test por cada uno para que el acoplamiento que sí queda esté blindado.

### Medio plazo — separar responsabilidades

**S4. Extraer la capa de red a hooks/servicios.**
Sacar `fetch`/PATCH/DELETE de DetailView y DataTable a hooks dedicados (`useLineMutations`, `useSecondaryLineMutations`) o a un cliente NEO. El componente recibe handlers, no construye URLs ni serializa bodies. Esto elimina ~30% del churn (los fixes de PATCH/optimistic/rollback dejan de tocar la UI).

**S5. Extraer la lógica de negocio (precios/impuestos/descuentos) a `lib/`.**
`deriveTaxRateFromGross`, `prepareLineForPost`, derivación de unitPrice ya están medio fuera (`lib/lineFieldChange.js`, `lib/documentTotals.js`). Completar la mudanza: que el cálculo viva en `lib/` puro y testeable, y el componente solo orqueste. Tickets como ETP-4015/4030/4103 dejarían de tocar el `.jsx`.

**S6. Descomponer DetailView en sub-componentes por región.**
El componente ya tiene fronteras naturales documentadas: `DetailToolbar`, `DetailHeader`, `LinesSection`, `SecondaryTabs`, `DetailSidePanel`. Extraer cada región a su propio fichero (no como helper exportado, sino como componente con su propio estado local). Objetivo: ningún fichero > ~600 líneas. Un feature de "tabs secundarios" tocaría `SecondaryTabs.jsx`, no el monolito.

### Largo plazo — invertir el modelo de extensión

**S7. Pasar de "props + ifs" a composición / slots.**
En vez de `DetailView` con 90 props, exponer un esqueleto con slots (`<DetailView><DetailView.Lines/><DetailView.SidePanel/></DetailView>`) o un registry de regiones por ventana (igual que `LOOKUP_DRAWERS`). Cada ventana compone lo que necesita; añadir capacidades a una ventana **deja de requerir tocar el genérico**. Este es el cambio que de verdad rompe el patrón de churn.

**S8. Métrica de "blast radius" en review.**
Regla de pipeline (Alex/REVIEW): si un PR toca `contract-ui/DetailView.jsx` o `DataTable.jsx`, exigir justificación explícita de *por qué no se pudo resolver vía `decisions.json`/metadata*. Hace visible y costoso el camino fácil de "añadir otro `if`".

---

## 6. Hoja de ruta sugerida

| Fase | Acción | Esfuerzo | Reduce churn |
|---|---|---|---|
| 1 | S1 (lint budget) + S8 (regla de review) | XS | Frena el crecimiento |
| 2 | S2 (metadata vs ifs) + S3 (tests de regresión) | S | P4, P3 |
| 3 | S4 (red→hooks) + S5 (negocio→lib) | M | P2 (~30% del churn) |
| 4 | S6 (descomponer por región) | L | P1, P5, P6 |
| 5 | S7 (slots/composición) | XL | Invierte el modelo — P1 de raíz |

**Recomendación:** empezar por Fase 1 y 2 ya (barato, frena la sangría y no requiere reescritura). Las fases 3–5 conviene meterlas como tickets ETP dedicados de deuda técnica, no colgarlas de un feature.

---

## 8. Auditoría de fugas de lógica específica de ventana (ampliación)

> Esta sección amplía el problema **P4**. Se hizo una búsqueda exhaustiva de literales de entidad/ventana y de imports acoplados en ambos componentes "genéricos". **La respuesta es: sí, hay lógica de ventana incrustada.** Inventario completo abajo.

### 8.1 Inventario de fugas

| ID | Archivo:línea | Fuga | Gravedad | Por qué es un problema |
|---|---|---|---|---|
| L1 | `DetailView.jsx:11` | `TAB_ICONS = { 'custom:sif': Shield, 'custom:attachments': … }` | 🔴 Alta | **SIF** (Suministro Inmediato de Información, fiscalidad ES) es una feature de ventana concreta. Su icono está cableado en el mapa de iconos del componente genérico. Cada feature nueva con tab custom obliga a editar este mapa. |
| L2 | `DetailView.jsx:661` | `excludeFields={props.st.key === "contact" ? ["active"] : []}` | 🔴 Alta | Rama `if` atada a la entidad **contact**. Ninguna otra entidad puede excluir campos sin añadir otra rama aquí. |
| L3 | `DetailView.jsx:2172, 2177, 2204, 3841` | `if (field === 'product') …` (×4) | 🟠 Media | Asume que el campo disparador del callout de precio **siempre se llama `product`**. Una ventana cuyo lookup de precio se llame distinto no entra por estas ramas. Ya está medio-declarativo (usa `lineConfig.discountField` y `forceCalloutFields`), pero el literal `'product'` sigue hardcodeado. |
| L4 | `DataTable.jsx:28,39` | `import InternalConsumptionProductSearchDrawer` + `LOOKUP_DRAWERS['internal-consumption-product']` | 🟠 Media | El genérico **importa un componente de una sola ventana** (internal-consumption). El registry `LOOKUP_DRAWERS` es el patrón correcto, pero el *import estático* acopla el genérico al módulo de esa ventana y lo mete en su bundle. |

**Observación clave sobre L3/L4:** son los casos donde el equipo *ya empezó a hacerlo bien* (metadata `lineConfig`/`forceCalloutFields`, registry `LOOKUP_DRAWERS`) pero **dejó la migración a medias**. L1 y L2 ni siquiera empezaron: son `if` y mapas crudos.

### 8.2 Propuestas de solución por fuga

**L1 — Icono `custom:sif` cableado → registro de iconos por contrato.**
El mapa `TAB_ICONS` debe poblarse desde el contrato/`decisions.json` de la ventana, no desde un literal en el genérico. Opciones:
- A corto plazo: que cada tab custom declare su icono por nombre (`tab.icon: 'shield'`) y el genérico resuelva contra un mapa **genérico de lucide** (`shield`, `paperclip`, …) en vez de contra claves de feature (`custom:sif`).
- El componente deja de saber qué es "sif". Solo sabe "este tab pidió el icono `shield`".

**L2 — `excludeFields` de contact → propiedad declarativa del tab.**
Mover a la config del tab secundario: `tab.excludeFields: ["active"]` en `decisions.json → contract`. El genérico lee `props.st.excludeFields ?? []`. Esto encaja con la regla del proyecto de que toda customización debe sobrevivir a la regeneración del pipeline (hoy esta rama se perdería/recablearía en cada regen si no estuviera hardcodeada — justamente el anti-patrón).

**L3 — `field === 'product'` → marca por campo en el contrato.**
Sustituir el literal por una bandera declarada en el campo del contrato:
- `field === 'product'` (reset de descuento, fallback de precio) → `field.isPriceTrigger: true` o leer `lineConfig.priceTriggerField` (igual que ya existe `lineConfig.discountField`/`priceField`/`qtyField`).
- Así una ventana con un lookup llamado distinto (p. ej. `item`, `asset`) entra por la misma lógica sin tocar el genérico.

**L4 — Import estático del drawer de internal-consumption → registro con lazy import.**
- Mover el registro `LOOKUP_DRAWERS` **fuera** de `DataTable.jsx` a un módulo de registro propio (`lib/lookupDrawers.js`) donde cada ventana se *auto-registre*, o usar `React.lazy(() => import(...))` para que el drawer específico **no entre en el bundle del genérico**.
- El genérico solo conoce la clave `field.lookupDrawer`; el mapeo clave→componente vive fuera. Patrón idéntico al que el pipeline ya usa para componentes custom en `tools/app-shell/src/windows/custom/{window}/`.

### 8.3 Regla para evitar reincidencia

Añadir a la fase REVIEW (Alex) un **grep de guardia** en CI que falle si aparecen literales de entidad/ventana conocidos dentro de `contract-ui/DetailView.jsx` o `DataTable.jsx`:

```bash
# Falla si el genérico vuelve a cablear nombres de ventana/feature/entidad
grep -nE "(===|!==)\s*['\"](contact|product|order|invoice|sif|internalConsumption|asset|amortization)" \
  tools/app-shell/src/components/contract-ui/DetailView.jsx \
  tools/app-shell/src/components/contract-ui/DataTable.jsx \
  && echo "❌ Lógica específica de ventana en componente genérico — usar metadata/contrato" && exit 1
```

Esto convierte la fuga en un fallo de build en vez de en un descubrimiento posterior. Es la versión concreta de la propuesta **S8** (blast-radius en review) aplicada a este problema puntual.

> **Implementado como ratchet (2026-06-10).** El grep de arriba falla si hay **cualquier** match (≠0), lo que bloquearía hoy mismo (hay 8 fugas heredadas). Para poder ir bajando sin apuro, se implementó en su lugar un **ratchet** en `cli/src/window-leak-budget.js` (+ `cli/window-leak-budget.json`, baseline **8**): enumera las fugas (`--list`), **no falla por estar >0**, solo **falla si el número sube**, y se baja el baseline con `--update` a medida que se declarativizan (objetivo final: 0). Ignora comentarios; escanea literales de string/JSX. `make window-leak-budget`. Misma filosofía que el ratchet de métodos `method-budget.js`.

### 8.4 Esfuerzo y orden sugerido

| Fuga | Solución | Esfuerzo | Riesgo |
|---|---|---|---|
| L2 (`contact`) | prop declarativa `tab.excludeFields` | XS | Bajo — cambio localizado |
| L1 (`sif` icon) | `tab.icon` + mapa lucide genérico | S | Bajo |
| L3 (`product`) | `lineConfig.priceTriggerField` / `field.isPriceTrigger` | S | Medio — toca el flujo de callout, requiere re-test de order+invoice |
| L4 (drawer import) | registro externo + lazy import | S | Bajo |
| Guardia CI | grep en REVIEW | XS | Ninguno |

Recomendación: hacer **L2, L1, L4 y la guardia CI** en un mismo PR de limpieza (todas XS/S y bajo riesgo), y **L3** en su propio PR porque toca la cadena de callouts de precio y necesita re-verificar órdenes e facturas.

---

## 9. Descomposición en sub-componentes (corroboración + plan)

> Esta sección amplía la propuesta **S6**. La pregunta es: *¿se puede sacar cosas a sub-componentes para organizar mejor?* **Sí, y de forma muy clara.** El cuerpo del componente `DetailView` tiene **~2.566 líneas y 42 `useState` en una sola función**. El `return` está ya **dividido en regiones delimitadas por comentarios** — esas regiones son sub-componentes esperando a ser extraídos.

### 9.1 Evidencia

- `DetailView({...})` empieza en la línea 1259 y su cuerpo se extiende hasta ~3914 = **~2.566 líneas en una única función de componente**.
- **42 `useState`** dentro de esa función → un único componente gestiona 42 piezas de estado independientes (selección de línea, edición de línea, tab activo, líneas secundarias, barras de selección, modales custom, foco de notas, etc.).
- El JSX del `return` ya está rotulado con comentarios de región:
  `Action bar`, `Topbar right slot`, `Print document`, `Delete record`, `More actions`, `Process buttons`, `Scrollable content + sidebar`, `Primary tab bar`, `Form section`, `Collapsible secondary header fields`, `Form footer`, `Tabs: child entities + Others`, `Tab content: Lines`, `Bulk delete bar`, `Inline edit form for selected child row`, `LinesSelectionBar`…
- **Precedente que ya existe en el propio archivo:** `SecondaryFormTab`, `SecondaryPanelTab` y `SecondaryTableTab` **ya están extraídos** como componentes. El problema es que reciben **~40 props cada uno** porque el *estado* sigue viviendo en el padre. Es la lección central: **extraer el JSX sin extraer el estado no reduce la complejidad, solo la mueve a la lista de props.**

### 9.2 Mapa de extracción propuesto

| Sub-componente | Región actual (aprox.) | Estado que debería llevarse consigo | Beneficio |
|---|---|---|---|
| `DetailToolbar` | Action bar + Topbar slots + Print/Delete/More (≈ líneas 2417–2600) | — (casi sin estado; recibe handlers) | Aísla la barra de acciones; los cambios de toolbar dejan de tocar el monolito |
| `DetailProcessButtons` | bloque "Process buttons" | `flushPendingLines` callback | Concentra la lógica de procesos de documento |
| `DetailHeaderForm` | "Form section" + collapsible + form footer | `notesFocused`, foco/collapse | Separa cabecera de líneas |
| `LinesSection` | "Tab content: Lines" + tabla + add-row + bulk delete bar (≈ 488–760) | `selectedLine`, `lineEdits`, `addingLine`, `selectedChildRows`, barra de selección | **La mayor ganancia** — la mayoría del churn de features cae aquí |
| `SecondaryTabsSection` | orquestación de tabs secundarios | `selectedSecondaryLine`, `secondaryLineEdits`, `secondarySelectedRows`, `addingSecondaryLine`, `secondaryDeleting`, … | Recoge el estado que hoy infla los ~40 props de `SecondaryTableTab` |
| `DetailSidePanel` | "sidebar content column" | — | Slot independiente |
| `PrimaryTabBar` | "Primary tab bar" | `activePrimaryTab` | Trivial, bajo riesgo |

Objetivo: **ningún fichero > ~600 líneas** y **ningún componente con > ~15 props**.

### 9.3 Cómo hacerlo bien (no repetir el error de los Secondary*Tab)

1. **Mover el estado junto al JSX.** Cada sub-componente debe *poseer* su `useState` (p. ej. `LinesSection` posee `selectedLine`/`lineEdits`), no recibirlo como 20 props desde el padre. Lo que el padre necesite saber, se comunica con un callback (`onDirtyChange`, `onLinesCountChange`).
2. **Estado compartido → contexto o reducer, no prop-drilling.** Lo que de verdad cruza regiones (el `hook` de la entidad, `editing`, `data`, `token`, `apiBaseUrl`, `catalogs`) va en un `DetailViewContext` que los sub-componentes consumen. Esto elimina de golpe la mayor parte de los ~90 props.
3. **Extraer de abajo arriba y con tests primero.** Empezar por las hojas sin estado (`PrimaryTabBar`, `DetailSidePanel`, `DetailToolbar`) que son refactors inocuos verificables con la skill `innocuous-check`. Dejar `LinesSection` y `SecondaryTabsSection` para el final porque concentran el estado.
4. **Cada extracción es un PR de refactor puro** (sin cambio de comportamiento), revisado con `innocuous-check` y cubierto por los tests existentes (`DetailView.extractedHelpers.vitest.js`, etc.). Nada de mezclar extracción con feature.

### 9.4 Relación con el churn

Esta descomposición ataca directamente **P1, P5 y P6**:
- **P1 (God Component):** un feature de líneas tocaría `LinesSection.jsx` (≈600 líneas), no un monolito de 3.900.
- **P5 (bucle Sonar):** ficheros más pequeños no disparan el umbral de complejidad cognitiva → desaparece la segunda ola de commits "extract to reduce complexity".
- **P6 (69 helpers exportados):** muchos de esos helpers (`getXxxClassName`, `getSecondaryRowUpdateHandler`, …) volverían a ser funciones/JSX internos de su sub-componente; se exportan hoy solo para poder testearlos fuera del monolito. Con sub-componentes testeables, esa exportación deja de ser necesaria.

### 9.5 Esfuerzo y orden

| Paso | Sub-componente | Esfuerzo | Riesgo |
|---|---|---|---|
| 1 | `PrimaryTabBar`, `DetailSidePanel` | XS | Muy bajo (hojas sin estado) |
| 2 | `DetailToolbar` + `DetailProcessButtons` | S | Bajo |
| 3 | `DetailViewContext` (hook/data/editing/token/api) | S | Medio (toca todos los slots, pero mecánico) |
| 4 | `DetailHeaderForm` | M | Medio |
| 5 | `LinesSection` (+ su estado) | L | Alto — el corazón; re-test exhaustivo |
| 6 | `SecondaryTabsSection` (+ su estado, colapsar props de los Secondary*Tab) | L | Alto |

Recomendación: hacer pasos 1–3 ya (baratos, inocuos, y el contexto del paso 3 desbloquea todo lo demás al eliminar prop-drilling). Pasos 4–6 como tickets ETP de deuda técnica dedicados, **nunca colgados de un feature**, cada uno con su PR de refactor puro.

---

## 10. Plan de acción total

> Todas las acciones para dejar `DetailView.jsx` y `DataTable.jsx` óptimos, **descompuestas al máximo nivel atómico** para poder iterar tarea a tarea. Ordenadas por **olas** (de menor a mayor complejidad/riesgo y de mayor a menor relación impacto/coste). Cada tarea indica qué hay que tocar del pipeline.
>
> **Leyenda — Pipeline:** `CI` = config de CI/lint · `app-shell` = solo componente compartido (no se regenera, sobrevive solo) · `gen` = `cli/src/generate-frontend.js` · `dec` = nueva propiedad en `decisions.json`/contrato (+ `docs/decisions-reference.md`) · `proc` = proceso de equipo.
> **Test (doble candado):** cada tarea lleva su propio *step de test* — **`V`** = Vitest (unitario/componente) · **`E`** = Playwright E2E (mocked). Salvo guardarraíles puros de CI, **toda tarea exige ambas capas**: el step `V` valida la lógica/render aislado, el step `E` valida que **ninguna otra ventana se rompe** (riesgo de acoplamiento). Protocolo antes/después: el test debe existir y pasar **antes**, y volver a pasar **sin modificarse después** (ver 11.3).
> **Complejidad:** XS < S < M < L < XL. **Impacto:** 🔴 alto / 🟠 medio / 🟡 bajo.
> Marca `[x]` en "Hecho" al cerrar cada tarea **solo cuando sus steps `V` y `E` estén verdes**. Estado intermedio `[~]` = **pseudo-hecho**: el mecanismo existe y está probado, pero falta aplicarlo al destino del informe (componentes JSX) y/o engancharlo en CI.

> **Estado de ejecución (2026-06-10).** Primer paso entregado: se implementó el patrón **S1 "fail-if-grows"** como guardarraíl reutilizable y probado (`cli/src/method-budget.js` + `cli/method-budget.json` + 20 tests + `make method-budget`), aplicado al primer caso real — la clase Java `NeoDefaultsService` (Sonar S1448: 38 > 35 métodos). El ratchet **no rompe por estar sobre el umbral; solo falla si el conteo sube**, y baja el baseline con `--update` a medida que se paga deuda. Enforce **solo local por ahora** (sin CI, por decisión del usuario; el script ya soporta `--module-root` / `ETENDO_GO_ROOT` / `--skip-missing` para engancharlo cuando se quiera). Esto **valida el mecanismo de T01** para los componentes JSX (queda replicarlo vía ESLint `max-lines`/`complexity`).

### Ola 0 — Guardarraíles (frenar la sangría; cero cambio de comportamiento) — 🟡 *parcialmente iniciada*

| ✅ | # | Tarea atómica | Compl. | Impacto | Pipeline | Step de test (V / E) | Dep. |
|----|----|----|----|----|----|----|----|
| [~] | T01 | Añadir regla ESLint `max-lines`/`complexity` a `DetailView.jsx` y `DataTable.jsx` que **falle el CI si crecen** (S1). *Pseudo-hecho: patrón "fail-if-grows" implementado y probado en `cli/src/method-budget.js` (20 tests, `make method-budget`), validado sobre Java `NeoDefaultsService`. **Falta:** regla ESLint sobre los JSX + enganche en CI.* | XS | 🔴 | CI | **V:** ✅ test del ratchet (sube⇒falla, baja⇒`--update`) · falta el equivalente ESLint · **E:** n/a | — |
| [~] | T02 | Añadir grep de guardia en CI que falle ante literales de ventana (`=== 'contact'/'product'/'sif'…`) en `contract-ui/` (8.3). *Pseudo-hecho: implementado como **ratchet** (no falla por ≠0, falla si **sube** sobre baseline), `cli/src/window-leak-budget.js` + `cli/window-leak-budget.json` (baseline **8** = L1×2 + L2×1 + L3×4 + L4×1) + 10 tests + `make window-leak-budget` (`--list` enumera, `--update` baja). **Falta:** enganche en CI.* | XS | 🟠 | CI | **V:** ✅ tests del detector (positivo/negativo, comentarios ignorados, monotonía) · **E:** n/a | — |
| [ ] | T03 | Documentar en la fase REVIEW la regla "blast-radius" (S8) | XS | 🟡 | proc | n/a (cambio de proceso) | — |

### Ola 1 — Eliminar fugas de ventana (declarativizar; bajo riesgo)

| ✅ | # | Tarea atómica | Compl. | Impacto | Pipeline | Step de test (V / E) | Dep. |
|----|----|----|----|----|----|----|----|
| [ ] | T04 | **L4** — Mover registro `LOOKUP_DRAWERS` fuera de `DataTable.jsx` a `lib/lookupDrawers.js` | XS | 🟠 | app-shell | **V:** test del registro (default + clave concreta) · **E:** `internal-consumption-line-entry` pasa igual | — |
| [ ] | T05 | **L4** — Convertir el import del drawer a `React.lazy` | S | 🟠 | app-shell | **V:** render lazy con Suspense · **E:** `internal-consumption-line-entry` (abre drawer) | T04 |
| [ ] | T06 | **L2** — Declarar `excludeFields` (default `[]`, R3: solo se escribe si difiere) en esquema de tab + reference | XS | 🟠 | dec | **V:** validador acepta `excludeFields`; ausente ⇒ `[]` · **E:** n/a | — |
| [ ] | T07 | **L2** — Emitir `excludeFields` en el generador **solo si ≠ default** (`wrapIf`, `generate-frontend.js:~1543`) | S | 🟠 | gen | **V:** snapshot emite la prop solo cuando hay exclusión; nada si `[]` · **E:** n/a | T06 |
| [ ] | T08 | **L2** — Consumir `props.st.excludeFields ?? []` y **borrar** rama `st.key === "contact"` (L661) | XS | 🟠 | app-shell | **V:** `SecondaryTableTab` excluye campos por prop · **E:** `contacts-bank-account-add-row` | T07 |
| [ ] | T09 | **L2** — Regenerar contact (`make regen`) y validar R2 sobre código regenerado | XS | 🔴 | test | **V:** n/a · **E:** `contacts-bank-account-add-row` tras regen | T08 |
| [ ] | T10 | **L1** — Declarar `tab.icon` (default `List`, R3: solo se escribe si se quiere otro) en `decisions.json` + reference | XS | 🟡 | dec | **V:** validador acepta `tab.icon`; ausente ⇒ `List` · **E:** n/a | — |
| [ ] | T11 | **L1** — Emitir `tab.icon` en el generador **solo si ≠ default** (`wrapIf`) | S | 🟡 | gen | **V:** snapshot emite `icon` solo cuando se sobrescribe; nada si default · **E:** n/a | T10 |
| [ ] | T12 | **L1** — Sustituir `TAB_ICONS['custom:sif']` por mapa lucide resuelto desde `tab.icon` (L11) | XS | 🟡 | app-shell | **V:** resuelve icono por nombre + fallback · **E:** spec SIF (icono visible) | T11 |
| [ ] | T13 | **L1** — Regenerar SIF/attachments y validar R2 | XS | 🟠 | test | **V:** n/a · **E:** spec SIF + `attachments` tras regen | T12 |
| [ ] | T14 | **L3** — Declarar `priceTriggerField` (default `'product'`, R3: solo se escribe si difiere) en `decisions.json` + reference | S | 🟠 | dec | **V:** validador acepta el campo; ausente ⇒ `'product'` · **E:** n/a | — |
| [ ] | T15 | **L3** — Emitir el campo en el generador **solo si ≠ `'product'`** (`wrapIf`) | S | 🟠 | gen | **V:** snapshot emite solo cuando se sobrescribe; nada si default · **E:** n/a | T14 |
| [ ] | T16 | **L3** — Reemplazar los 4 `field === 'product'` (L2172/2177/2204/3841) por la metadata | M | 🟠 | app-shell | **V:** helpers de callout usan el campo declarado (no literal) · **E:** `product-pricing` | T15 |
| [ ] | T17 | **L3** — Regenerar order+invoice y validar cadena de callouts (R1, máximo riesgo) | S | 🔴 | test | **V:** n/a · **E:** `order-to-invoice-discount` + `product-pricing` tras regen | T16 |

### Ola 2 — Sacar red y negocio del componente (interno; no toca generador)

| ✅ | # | Tarea atómica | Compl. | Impacto | Pipeline | Step de test (V / E) | Dep. |
|----|----|----|----|----|----|----|----|
| [ ] | T18 | **S5** — Mover matemática de negocio (`deriveTaxRateFromGross`, derivación unitPrice) a `lib/` puro | S | 🟠 | app-shell | **V:** tests unitarios del nuevo módulo `lib/` (≥3 edge cases) · **E:** `product-pricing` | — |
| [ ] | T19 | **S4** — Extraer mutaciones de línea (PATCH/DELETE + optimistic/rollback) a `useLineMutations` | M | 🔴 | app-shell | **V:** test del hook (éxito, error→rollback, red caída) · **E:** `inline-lines-behavior` | — |
| [ ] | T20 | **S4** — Extraer mutaciones de líneas secundarias a `useSecondaryLineMutations` | M | 🔴 | app-shell | **V:** test del hook (add/save/delete + rollback) · **E:** `contacts-bank-account-add-row` | T19 |
| [ ] | T21 | **S3** — Convertir cada revert histórico (`noHoverHide`, contact, i18n) en test de regresión | S | 🟠 | test | **V:** test por cada caso revertido · **E:** spec multi-ventana que cubra el acoplamiento | — |

### Ola 3 — Descomponer en sub-componentes **manteniendo la API de props** (interno; no toca generador)

| ✅ | # | Tarea atómica | Compl. | Impacto | Pipeline | Step de test (V / E) | Dep. |
|----|----|----|----|----|----|----|----|
| [ ] | T22 | Extraer `PrimaryTabBar` (hoja, estado `activePrimaryTab`) | XS | 🟡 | app-shell | **V:** render + cambio de tab · **E:** spec con primaryTabs (p. ej. product) | — |
| [ ] | T23 | Extraer `DetailSidePanel` (hoja, sin estado) | XS | 🟡 | app-shell | **V:** render del slot · **E:** ventana con sidePanel | — |
| [ ] | T24 | Extraer `DetailToolbar` (action bar + topbar slots + print/delete/more) | S | 🟠 | app-shell | **V:** render acciones + visibilidad delete · **E:** `row-quick-actions` + flujo save/cancel | — |
| [ ] | T25 | Extraer `DetailProcessButtons` (procesos de documento) | S | 🟠 | app-shell | **V:** filtro/visibilidad de procesos · **E:** `goods-shipment-confirm-and-invoice` | T24 |
| [ ] | T26 | Crear `DetailViewContext` (hook/data/editing/token/api/catalogs) | S | 🔴 | app-shell | **V:** test del provider/consumer · **E:** smoke amplio (1 ventana por layout) | — |
| [ ] | T27 | Migrar slots extraídos a consumir el contexto (reduce props) | S | 🔴 | app-shell | **V:** slots leen del contexto · **E:** re-run de T22–T25 sin regresión | T26 |
| [ ] | T28 | Extraer `DetailHeaderForm` (form card + collapsible + footer) | M | 🟠 | app-shell | **V:** render cabecera + notas · **E:** `notes-save-on-blur` | T26 |
| [ ] | T29 | Extraer `LinesSection` **llevándose su estado** | L | 🔴 | app-shell | **V:** suite del nuevo componente (selección, edición, add) · **E:** `inline-lines-behavior` + `inline-lines-min-value` | T26, T19 |
| [ ] | T30 | Extraer `SecondaryTabsSection` **llevándose su estado** (colapsa props de `Secondary*Tab`) | L | 🔴 | app-shell | **V:** suite del nuevo componente · **E:** `contacts-bank-account-add-row` + spec sales-order tabs | T26, T20 |
| [ ] | T31 | Eliminar helpers exportados ya innecesarios (P6) | S | 🟡 | app-shell | **V:** los tests de helpers migran a tests del componente · **E:** n/a | T29, T30 |

### Ola 4 — Invertir el modelo de extensión (mayor impacto, mayor riesgo)

| ✅ | # | Tarea atómica | Compl. | Impacto | Pipeline | Step de test (V / E) | Dep. |
|----|----|----|----|----|----|----|----|
| [ ] | T32 | **S7** — Diseñar API de slots/composición + flag de compatibilidad (RFC) | M | 🔴 | proc | **V/E:** definir la **suite de paridad** que congelará el comportamiento actual | T22–T31 |
| [ ] | T33 | **S7** — Adaptar el generador a composición (`generate-frontend.js:1839`) | XL | 🔴 | gen + dec | **V:** snapshots del generador (legacy vs nuevo) · **E:** suite de paridad completa | T32 |
| [ ] | T34 | **S7** — Migrar ventanas por lotes detrás del flag, retirar props legacy al final | L | 🔴 | gen + test | **V:** por lote · **E:** suite de paridad por cada ventana migrada | T33 |

### Notas de ejecución

- **Doble candado de test (obligatorio):** ninguna tarea se marca `[x]` si su step `V` (Vitest) **o** su step `E` (Playwright) no está verde. `V` protege la lógica; `E` protege contra el riesgo real de estos componentes: **romper otra ventana**. Para componentes tan sensibles, una sola capa no basta.
- **Antes/después por tarea (R1):** cada step de test debe **existir y pasar ANTES** del cambio (golden master). Si no existe, la primera acción de la tarea es **crearlo** (delegado a `test-generator`). Tras el cambio, debe pasar **sin modificarse** + `innocuous-check` sobre el diff. Si un test hay que tocarlo, el cambio **no es inocuo**.
- **Validación de regeneración (R2):** en tareas con `gen`/`dec` (L1/L2/L3, Ola 4), el step `E` se corre **sobre el código regenerado** (`make regen ONLY=<window>`), no solo sobre el actual.
- **Atomicidad:** las tareas que cruzan `dec → gen → app-shell` (L1/L2/L3) están partidas para testear cada capa, pero deben **mergear juntas** (un cambio sin las otras deja la app inconsistente o se pierde en la regen — R2).
- **Orden recomendado:** Ola 0 ya (desbloquea y frena). Ola 1 en PR de limpieza (T04–T13 juntas; T14–T17 en PR propio por el riesgo de callouts). Olas 2–3 como tickets ETP de deuda técnica. Ola 4 solo tras completar la 3.
- **No tocar el generador salvo donde se indica** (`gen`): toda la Ola 3 mantiene la API de props, es invisible para `generate-frontend.js` y sobrevive a regeneración trivialmente.
- **Delegación:** la escritura de todo step `V`/`E` se delega al agente `test-generator` (Tester) por regla de `CLAUDE.md`; specs E2E siempre `.mocked` salvo smoke.

---

## 11. Estrategia de testing antes/después

> Respuesta a la pregunta: *¿conviene Playwright?* **Sí, pero no para todo.** Hacer todo en Playwright sería lento y frágil. Lo correcto es una **pirámide de tests** y, sobre todo, aprovechar que **ya existe la red de seguridad**.

### 11.1 Punto de partida: la red de seguridad ya existe (no partir de cero)

- **~27 tests unitarios/componente (Vitest)** sobre `DetailView.*`/`DataTable.*`.
- **66 specs E2E (46 mocked)** que ejercitan **justo las ventanas y flujos en riesgo**:
  - `inline-lines-behavior.mocked.spec.js`, `inline-lines-min-value`, `inline-lines-quotation` → líneas inline (T19, T29).
  - `order-to-invoice-discount.mocked.spec.js`, `product-pricing.mocked.spec.js` → cadena de callouts y precio/descuento (T14–T17, L3).
  - `internal-consumption-line-entry.mocked.spec.js` → drawer específico (T04–T05, L4).
  - `contacts-bank-account-add-row.mocked.spec.js` → tab secundario contact (T06–T09, L2).
  - `notes-save-on-blur.mocked.spec.js`, `callout-message-display`, `attachments` → cabecera/notas/tabs (T28, L1).

**Implicación clave:** el "antes-después" no es escribir N tests nuevos, es **usar la suite actual como *golden master***. La regla de inocuidad (R1) ya lo dice: estos tests deben **pasar sin modificarse** tras cada refactor. Si hay que tocarlos, el cambio no es inocuo.

### 11.2 Qué herramienta para qué tarea (pirámide)

| Capa | Herramienta | Para qué tareas | Por qué |
|---|---|---|---|
| Unitario / componente | **Vitest** | Olas 2 y 3 (refactors internos: hooks, `lib/`, sub-componentes) | Rápido; verifica lógica y render aislado. Es el grueso del "antes-después" de un refactor puro |
| E2E de flujo | **Playwright (mocked)** | Fugas L1/L2/L3 y tareas de alto riesgo (T17, T29, T30) | Verifica comportamiento real en navegador **a través del límite componente↔red↔callout** y **en varias ventanas** — exactamente donde está el riesgo de "romper N ventanas" |
| E2E real (backend) | Playwright (no-mocked) | Solo smoke puntual | Caro/lento; reservar |

**Por qué Playwright es el adecuado aquí (y no solo Vitest):** el riesgo central de este informe es **acoplamiento entre ventanas** (los reverts `broke other windows`). Un test de componente aislado no detecta que un cambio en el genérico rompió otra ventana; un E2E mocked que recorre la ventana real **sí**. Por eso L1/L2/L3 y la extracción de `LinesSection`/`SecondaryTabsSection` deben blindarse con E2E.

### 11.3 Protocolo "antes-después" por tarea

Para cada tarea del plan (Sección 10):
1. **ANTES** — Confirmar que existe un test (Vitest o E2E) que captura el comportamiento actual de la zona afectada. Si **no** existe → crearlo **primero**, contra el código actual, y verlo pasar (golden master). Esto es trabajo de la skill/agente de tests.
2. **CAMBIO** — Aplicar la tarea.
3. **DESPUÉS** — El mismo test debe pasar **sin modificarse**. Más `innocuous-check` sobre el diff.
4. Para fugas L1/L2/L3 (cruzan generador): regenerar la ventana (`make regen ONLY=<window>`) y volver a correr el E2E **sobre el código regenerado** — así se valida R2 (sobrevive a regeneración).

### 11.4 Cobertura: qué ya está y qué falta crear

| Tarea(s) | ¿Golden master existente? | Acción de test |
|---|---|---|
| T04–T05 (L4 drawer) | ✅ `internal-consumption-line-entry` | Reusar; correr antes/después |
| T06–T09 (L2 contact) | ✅ `contacts-bank-account-add-row` | Reusar; añadir aserción de campos excluidos |
| T10–T13 (L1 sif icon) | ⚠️ parcial (`attachments`) | **Crear** spec mocked para tab SIF (icono visible) |
| T14–T17 (L3 product) | ✅ `order-to-invoice-discount`, `product-pricing` | Reusar (cubren la cadena de callouts) |
| T18 (negocio→lib) | ✅ Vitest de helpers | Reusar/ampliar Vitest |
| T19–T20 (red→hooks) | ✅ `inline-lines-behavior` + Vitest | Reusar; ampliar Vitest del hook |
| T22–T28 (sub-comp. hoja) | ✅ Vitest de `DetailView` | Reusar (refactor puro) |
| T29 (`LinesSection`) | ✅ `inline-lines-*` | Reusar E2E + Vitest del nuevo componente |
| T30 (`SecondaryTabsSection`) | ⚠️ parcial | **Crear/ampliar** E2E de tabs secundarios (sales-order + contact) |
| T32–T34 (S7 slots) | ❌ | **Crear** suite de paridad por ventana antes de migrar |

### 11.5 Reglas del proyecto (obligatorias al escribir tests)

- **Delegar** toda escritura/ampliación de tests al agente `test-generator` (Tester) — regla de `CLAUDE.md`.
- Antes de escribir Playwright, leer `docs/e2e-testing-guide.md`; referencia canónica: `e2e/tests/flows/row-quick-actions.mocked.spec.js`.
- **Preferir specs `.mocked`** (46/66 ya lo son): deterministas, rápidos, sin backend.
- Convención `data-testid` para selección estable (ver guía).
- Cada proceso/flujo nuevo: **≥3 edge cases**.

---

## 7. Conclusión

No es que estos componentes "se toquen por casualidad": **son el punto único por donde pasa toda la funcionalidad de ventana**, y el modelo de extensión actual (props + ramas `if`) obliga a editarlos en cada feature. DataTable ya muestra el camino correcto (metadata declarativa) y por eso tiene menos churn proporcional. La cura no es "tocarlos menos a fuerza de voluntad", sino **cambiar el mecanismo de extensión** para que añadir capacidades a una ventana ya no requiera editar el genérico — y, mientras tanto, **sacar de ellos la red y el negocio** y **poner un techo de tamaño** que el CI haga cumplir.
