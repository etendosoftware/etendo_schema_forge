# Plan — El MCP debe exigir la clave del padre en entidades hijas

**Fecha:** 2026-09-04
**Rama de trabajo:** `feature/ETP-5184` (sacada de `develop` en `modules/com.etendoerp.go`)
**Verificado contra:** `develop` @ `257a8cbc` (código) y BD `etendo31ago` (datos) — ver §11, §12 y §13
**Autor del análisis:** Claude (a pedido de Valentín)
**Estado:** **F0 y F1 implementados** (2026-09-07) en `feature/ETP-5184`. 41/41 tests verdes.
F2–F6 pendientes.
**Ticket:** [ETP-5184](https://etendoproject.atlassian.net/browse/ETP-5184) (Bug, epic ETP-4418 `[Y26Q3] Etendo Product Maintenance`) — **un solo ticket para todo el alcance**
**Reportado por:** Valeria — pidió la dirección de un contacto y el MCP devolvió *todas* las direcciones del sistema.

---

## 1. Resumen ejecutivo

El MCP de Java (`modules/com.etendoerp.go/src/com/etendoerp/go/mcp`) expone las entidades de cada
spec de SchemaForge de forma **plana**: cualquier entidad, sea pestaña cabecera o pestaña hija,
se lee y se escribe igual, sólo con `spec` + `entity` (+ `id` para get/update/delete).

Eso rompe la equivalencia con la UI de Etendo. En la UI, una pestaña hija (`AD_Tab.TABLEVEL > 0`)
**sólo es navegable dentro de un registro de la pestaña padre**: no existe una vista "todas las
direcciones", "todas las líneas de pedido" ni "todos los contactos de todos los terceros".
En el MCP sí existe, y además sin ninguna advertencia.

**Magnitud del problema.** Medida **contra la BD** (`etendo31ago`), contando sólo lo que el MCP
realmente publica: spec activo con `SHOWINMCP = 'Y'`, entidad activa con `ISINCLUDED = 'Y'`.

| | Entidades |
|---|---|
| Entidades de specs `W` expuestas en MCP | **160** |
| Con `AD_Tab` | 147 |
| Cabeceras (`TABLEVEL = 0`) | 45 |
| **Hijas (`TABLEVEL > 0`)** | **102** — nivel 1: 78 · nivel 2: 23 · nivel 3: 1 |
| Handler-backed (sin `AD_Tab`) | 13 |
| De las hijas, con algún método de escritura habilitado | **75** |

Es decir: **~2 de cada 3 entidades con pestaña que el MCP publica son registros hijos
consultables sin padre**, y 75 de ellas además escribibles.

> **Corrección respecto de la primera versión de este plan.** La primera medición se hizo sobre
> `ETGO_SF_ENTITY.xml` y daba 207/276. Estaba mal: el XML de sourcedata **omite `ISINCLUDED`** en
> muchas filas y el script asumió `'Y'` por defecto, contando como expuestas entidades que en la
> BD están en `'N'`. Los números de arriba, de la BD, son los correctos. La conclusión no cambia
> de signo — cambia la escala.

El caso concreto de Valeria: spec `contacts`, entidad `locationAddress` → `AD_Tab` 222
("Location/Address", `TABLEVEL = 1`, tabla `C_BPartner_Location`, ventana 123 "Business Partner").
`neo_list(spec:"contacts", entity:"locationAddress")` sin filtros devuelve las direcciones de
todos los terceros del cliente, paginadas de a 100.

---

## 2. Evidencia en el código

### 2.1 `neo_list` — no exige padre y no lo menciona

`ToolRegistry.buildListTool()` (líneas ~434-466):

```java
buildObjectSchema(props, List.of("spec", McpConstants.PARAM_ENTITY))
```

`required` = `["spec", "entity"]`. `filters` es **opcional** y su descripción no menciona en
ningún punto la relación padre-hijo.

`McpToolRouter.handleList()` (líneas 347-414) resuelve `SFEntity` → `AD_Tab`, arma los params y
llama a `DefaultJsonDataService.fetch(params)`. Los únicos recortes que aplica son:

- el `where` construido desde `filters` (si el agente pasó alguno),
- `adTab.getHqlwhereclause()` (el where de la pestaña, que normalmente **no** contiene el filtro
  por padre — ese lo pone la UI en runtime a partir del registro seleccionado),
- el filtrado de campos de `NeoFieldFilter`,
- el aislamiento client/org que aplica el DAL vía `OBContext`.

**No hay ninguna restricción por registro padre.**

### 2.2 `neo_get` / `neo_update` / `neo_delete` — sólo `id`

- `handleGet` (422): `required = ["spec","entity","id"]`.
- `handleUpdate` (619): `required = ["spec","entity","id","fields","updated"]`.
- `handleDelete` (724): `required = ["spec","entity","id"]`.

Ninguno pide ni verifica el padre. Un `id` de línea suelto basta para leer, modificar o borrar
una línea de cualquier documento — sin que el agente haya pasado nunca por la cabecera.

Nota adicional: `handleGet` **no** aplica `adTab.getHqlwhereclause()`, mientras que `handleList`
sí. Es una inconsistencia independiente de este bug, pero la toco en la misma zona (ver §7, D-3).

### 2.3 `neo_create` — `parentId` existe pero es opcional y va escondido

`handleCreate` (472-...):

```java
String parentIdValue = null;
if (filteredBody.has(McpConstants.PARAM_PARENT_ID)) {
  parentIdValue = filteredBody.getString(McpConstants.PARAM_PARENT_ID);
  filteredBody.remove(McpConstants.PARAM_PARENT_ID);
  McpWriteRequestSupport.resolveParentFK(adTab, filteredBody, parentIdValue, log);
}
```

Puntos a notar:

1. `parentId` **no es un parámetro de primer nivel** de `neo_create`: viaja dentro de `fields`, y
   sobrevive porque `mapFieldsToDalProperties` hace *pass-through* de claves desconocidas
   (`McpWriteRequestSupport:114` — "Pass through unknown keys (parentId, etc.)").
2. `resolveParentFK` ya implementa exactamente la lógica correcta: si `TABLEVEL > 0`, busca la
   columna con `isLinkToParentColumn()` y le asigna el `parentId`. **La infraestructura existe.**
3. Pero si el agente no manda `parentId`, no pasa nada: se intenta el insert. Si la FK al padre es
   obligatoria, falla con un error del DAL; si es nullable o tiene default, se crea un registro
   huérfano o mal enganchado.
4. La única guía sobre esto es texto libre en `McpSchemaCreateView.CHILD_ENTITY_HINT_SUFFIX`, que
   sólo aparece si el agente pide `neo_schema` con `view:"create"`.

### 2.4 `neo_defaults` — dice "REQUIRED" en la prosa, pero no lo es en el schema

`ToolRegistry.buildDefaultsTool()`:

```java
props.put(McpConstants.PARAM_PARENT_ID, stringProp(
    "Parent record ID — REQUIRED for a child/line entity ..."));
...
buildObjectSchema(props, List.of("spec", McpConstants.PARAM_ENTITY))
```

La descripción dice REQUIRED en mayúsculas; el `required` del JSON Schema no lo incluye. Y el
propio texto reconoce el modo de fallo: *"they are silently left out of the result rather than
erroring"*.

### 2.5 `neo_batch` — es el único que modela bien la relación

`buildBatchTool()` tiene `parentRef` ("Optional id of an earlier op whose recordId becomes this
op's parent FK") y `$ref:<opId>`. También opcional, pero al menos el concepto está.

### 2.6 `neo_discover` / `neo_schema` — no publican la jerarquía

`McpSupportInternals.buildDiscoverEntity()` emite por entidad: `name`, `methods`, `readOnly`,
`agentPrompt`. **No emite `tabLevel`, ni `parentEntity`, ni el nombre de la FK al padre.**

`McpToolRouterSupport.resolvePrimaryEntityName()` sí sabe leer `TABLEVEL == 0` para identificar la
cabecera del spec, pero eso es sólo un dato agregado del spec, no un mapa de la jerarquía.

`neo_schema` calcula `isChildEntity` (`McpToolRouter:951`) **únicamente** para decidir si concatena
`CHILD_ENTITY_HINT_SUFFIX` en `view:"create"`. En la respuesta normal de `neo_schema` el dato no
aparece.

### 2.7 Bug colateral: filtro no resoluble = filtro silenciosamente ignorado

`McpQuerySupport.appendEqualityCondition()`:

```java
Property prop = resolveFilterProperty(dalEntity, key, log);
if (prop == null) {
  log.warn("Filter key '{}' could not be resolved to a DAL property, ignoring", key);
  return;   // <-- se descarta el filtro y la consulta sigue
}
```

Consecuencia: si el agente **intenta** hacer lo correcto —
`neo_list(entity:"locationAddress", filters:{"cBpartnerId":"<id>"})` — y falla el nombre de la
propiedad, el MCP devuelve **el listado completo sin filtrar**, con status OK y sin ninguna señal
de que el filtro se descartó. El agente cree que esas son las direcciones de *ese* tercero.

Esto puede ser tanto o más grave que el bug principal, porque produce respuestas **incorrectas**,
no sólo excesivas.

### 2.8 Infraestructura ya disponible para resolver el padre

- `KernelUtils.getInstance().getParentTab(tab)` → la pestaña padre.
- `Column.isLinkToParentColumn()` → la columna FK al padre.
- `McpWriteRequestSupport.resolveParentFK(adTab, body, parentId, log)` → ya lo hace para create.
- `NeoParentTabFilterResolver` (en `schemaforge/`) → ya resuelve tokens `@ParentColumn@` contra el
  registro padre; contiene el patrón completo tab padre → entidad DAL → registro.
- `NeoDefaultsService.isColumnReferencingParentTab()` → mismo patrón.

**No hay que inventar la resolución de la jerarquía; hay que centralizarla y usarla en el gate.**

**La regla de core, verificada.** `KernelUtils.getParentTab` delega en
`KernelUtils_data.xsql → getParentTab`, cuyo SQL es:

```sql
select t.ad_tab_id from ad_tab t
where t.ad_window_id = ?
  and t.seqno = (select max(seqno) from ad_tab
                 where ad_window_id = t.ad_window_id
                   and tabLevel = (TO_NUMBER(?)-1)
                   and seqno < TO_NUMBER(?))
```

O sea: el padre es **el último tab previo por `SEQNO` con nivel N-1**, dentro de la misma ventana.
Es exactamente la regla que usa la UI, y es la que hay que respetar. Pero **no coincide siempre con
la FK real** — ver §12, que es el hallazgo que más cambia el diseño.

---

## 3. Matiz importante: hijo es la *entidad*, no la *tabla*

La misma tabla puede estar expuesta como cabecera en una ventana y como hija en otra. Ejemplo real
y verificado:

| Spec | Entidad | AD_Tab | TABLEVEL | Ventana |
|---|---|---|---|---|
| `user` | `user` | 118 | 0 | User (cabecera) |
| `contacts` | `contact` | 496 | 1 | Business Partner (hija) |

Ambas apuntan a `AD_User`. Listar todos los usuarios desde el spec `user` **es legítimo** (existe la
ventana). Listar todos los contactos desde `contacts/contact` **no lo es**.

→ **La regla debe evaluarse por `SFEntity`/`AD_Tab`, nunca por tabla ni por entidad DAL.**
Esto además da la salida natural cuando un cliente sí necesita el listado global: se configura un
spec de ventana propia (como ya existe `bp-location` con el tab 154, `TABLEVEL = 0`) en lugar de
relajar el gate.

---

## 4. Propuesta

### Principio rector

> El MCP debe representar lo que la UI permite. Si en la UI hay que estar parado en un registro
> padre para ver/crear/editar un hijo, el MCP debe exigir la clave de ese padre.

### 4.1 Un resolver único de jerarquía (`McpParentScope`, nuevo)

Clase nueva en `com/etendoerp/go/mcp/`. Responsabilidades:

| Método | Devuelve |
|---|---|
| `isChild(Tab)` | `TABLEVEL != null && TABLEVEL > 0` |
| `parentTab(Tab)` | `KernelUtils.getParentTab(tab)` |
| `parentLinkProperty(Tab)` | la `Property` DAL de la columna con `isLinkToParentColumn()` |
| `parentEntityName(SFSpec, Tab)` | el nombre de `SFEntity` del spec cuyo `AD_Tab` es el padre |
| `describe(Tab)` | `{isChild, parentEntity, parentField, tabLevel}` para exponer en discover/schema |

Con caché por `AD_Tab.id` (el modelo AD no cambia en runtime salvo rebuild). Los call sites
existentes (`resolveParentFK`, `NeoParentTabFilterResolver`, `NeoDefaultsService`) se refactorizan
para consumirla — reduce la duplicación actual de tres implementaciones del mismo recorrido.

**Casos borde a cubrir en el resolver (y a testear):**

- Entidad sin `AD_Tab` (handler-backed: dashboard, `bp-trend`, `not-posted-documents/header`,
  `warehouse/location`) → **no** es hija, el gate no aplica. Son 13 entidades.
- Nietos (`TABLEVEL = 2` y `3`): p. ej. `product/transactionAdjustments` está en nivel 3. El padre
  directo es el que corresponde exigir; no hay que pedir la cadena completa hasta la raíz.
- Pestaña hija cuyo padre **no está incluido** en el mismo spec. **Verificado contra BD: 6 casos reales** — ver §11. La salida "apuntar al spec alternativo" **no sirve**, porque en los 13 el
  padre no está expuesto en ningún otro spec. Analizados uno por uno en §11.
- Tab con más de una columna `isLinkToParentColumn` activa. `resolveParentFK` hoy toma la primera
  (`break`) — hay que decidir si eso es aceptable o si hay que desambiguar contra `parentTab`.

### 4.2 `neo_list` — `parentId` obligatorio en entidades hijas

Cambio en `handleList`:

```
si McpParentScope.isChild(adTab):
    si args no trae parentId (ni un filtro equivalente sobre la FK del padre):
        → error 422 auto-explicativo
    si no:
        → añadir al where: e.<parentLinkProperty>.id = '<parentId>'
```

Y en `buildListTool`: añadir `parentId` a `properties`. **No** se puede poner en el `required` del
JSON Schema, porque `neo_list` es una única tool compartida por todos los specs y para las
cabeceras `parentId` no aplica → la validación tiene que ser **en runtime**, en el router.

Forma del error (siguiendo el patrón IMP-5 ya usado en `buildNotFoundError` /
`resolveIncludedEntityOrExplain`, que son errores auto-correctores):

```json
{
  "status": 422,
  "error": "parent_required",
  "detail": "'locationAddress' is a child entity of 'contacts'. In Etendo you browse its records inside one parent record — there is no global list. Pass parentId with the id of the parent 'businessPartner' record.",
  "parentEntity": "businessPartner",
  "parentField": "businessPartner",
  "hint": "Call neo_list(spec:'contacts', entity:'businessPartner', filters:{...}) to find the parent first, then neo_list(spec:'contacts', entity:'locationAddress', parentId:'<thatId>')."
}
```

El error tiene que **nombrar la entidad padre concreta**, no decir genéricamente "falta parentId":
es lo que le permite al agente recuperarse en el primer reintento en lugar de adivinar.

**Multi-padre — DECIDIDO:** `parentId` acepta un string **o** un array de strings
(`e.<fk>.id in (...)`), con **tope de 20 ids**. Un array de más de 20 se rechaza con error
explícito, para no reintroducir el listado global por la puerta de atrás.

### 4.3 `neo_get` — estricto: `parentId` obligatorio (DECIDIDO)

Simetría total con el resto del gate: **el hijo siempre lleva la clave del padre**, también para
leer de a uno.

- `parentId` **obligatorio** cuando `isChild(adTab)`. Falta → mismo error `parent_required` de §4.2.
- Si el registro **no** pertenece a ese padre → error `parent_mismatch` (422), **no** un 404
  genérico: el agente tiene que poder distinguir "no existe" de "existe pero no es de ese padre".
- La respuesta de un hijo incluye siempre `parentEntity` + el id del padre.

Cuesta una llamada más (hay que conocer el padre aunque ya se tenga el id exacto del hijo), y es
el precio de que el MCP no ofrezca ninguna puerta lateral al listado plano.

### 4.4 `neo_create` — `parentId` como parámetro de primer nivel y obligatorio en hijas

1. Subir `parentId` de dentro de `fields` a **parámetro de primer nivel** de `neo_create`
   (manteniendo compatibilidad: si viene dentro de `fields`, se sigue aceptando y se loguea como
   deprecado).
2. Si `isChild(adTab)` y no hay `parentId` **ni** viene ya seteada la FK al padre dentro de
   `fields` → rechazar con el mismo error auto-explicativo de §4.2, **antes** de tocar el DAL.
   Hoy el fallo llega como un error de constraint del DAL, ilegible para el agente.
3. Si `fields` trae la FK al padre **y** `parentId` con valores distintos → error de conflicto
   explícito, no "gana el último".

### 4.5 `neo_update` / `neo_delete` — verificación de pertenencia

- `parentId` opcional; si se pasa, se valida pertenencia (`parent_mismatch` si no coincide).
- **Bloquear el cambio de la FK al padre vía `neo_update` (DECIDIDO)**: reparentar una línea a
  otra cabecera no es una operación que la UI ofrezca. Si `fields` trae la FK al padre con un valor
  distinto al actual → error explícito.

### 4.6 `neo_defaults` — alinear prosa y comportamiento

Si `isChild(adTab)` y falta `parentId` → error 422 en vez de devolver un resultado silenciosamente
incompleto. Es la corrección más barata del lote y elimina una fuente conocida de creates mal
formados aguas abajo.

### 4.7 `neo_batch` — cerrar el hueco

`BatchService#createRecord` debe aplicar el mismo gate: op sobre entidad hija sin `parentRef` y sin
FK al padre en `body` → la operación falla (y con ella el batch, que ya es atómico). Si no, `neo_batch`
queda como bypass del gate.

### 4.8 Descubribilidad: publicar la jerarquía

Sin esto, el gate sólo produce fricción; con esto, el agente hace la llamada correcta a la primera.

- **`neo_discover`** — por entidad, añadir:
  ```json
  {"name": "locationAddress", "methods": ["GET"], "readOnly": true,
   "isChild": true, "parentEntity": "businessPartner", "parentField": "businessPartner"}
  ```
- **`neo_schema`** — añadir el mismo bloque al `entitySchema` (no sólo en `view:"create"`), y
  listar la FK al padre entre los campos requeridos de `view:"create"` en lugar de describirla en
  prosa al final del hint.
- **`docs`** (`Context7DocsClient` / recetas `seeAlso`) — añadir una receta
  "reading child records" que enseñe el patrón cabecera → hijo.

### 4.9 Bug del filtro silencioso (§2.7) — corregir en el mismo lote

Un filtro cuya clave no resuelve a ninguna propiedad DAL **no puede** descartarse en silencio.
**DECIDIDO (confirmado 2026-09-04):** acumular las claves no resueltas y devolver **422
`unknown_filter_field`** con la lista de campos filtrables válidos. Misma línea que el gate: el
agente no puede ignorarlo. Se descarta la alternativa `ignoredFilters` en la respuesta, porque el
agente puede no mirarla y el modo de fallo actual ya produjo respuestas incorrectas.

---

### 4.10 `MCP_CONFIG`: la sección `parent` (DECIDIDO)

> **La infraestructura se separa de este ticket.** Decisión del 2026-09-07: primero la base
> genérica de configuración del MCP, después las secciones concretas. La columna `MCP_CONFIG`, el
> parser, la precedencia spec→entity→field, el registro de secciones y la validación ruidosa viven
> en su propio plan: **`2026-09-07-mcp-entity-configuration-base.md`**.
>
> Lo que queda acá es la **sección `parent`**, que es el primer consumidor de esa base. Lo de abajo
> describe su esquema y su semántica; los mecanismos comunes (parseo, caché, fallo ruidoso, claves
> desconocidas) son de la base y no se repiten en este ticket.

Propuesta de Valentín, en dos pasos: declarar la jerarquía en configuración (no en código), y
hacerlo en **una sola columna text que contiene JSON**, en lugar de tres columnas tipadas.

**Columna nueva, no se reutiliza ninguna.** `NAMED_FILTERS` es otra cosa — filtros de negocio con
nombre — y no es el lugar de esto. Se cita sólo como **precedente del patrón**: demuestra que
"columna text con JSON leída únicamente desde `mcp/`" ya existe y funciona en esta misma tabla
(`McpNamedFilters` la parsea; `AGENT_PROMPT` y `PRECONDITIONS` siguen la misma idea).
**La API REST/headless no lee `MCP_CONFIG` y su comportamiento no cambia.**

Y `ETGO_SF_ENTITY` es tabla propia del módulo, así que la columna va sin prefijo `EM_`.

#### Esquema del JSON

```json
{
  "parent": {
    "field":       "<nombre de propiedad, el mismo que usa el payload del MCP>",
    "entity":      "<nombre de la SFEntity padre, para el mensaje de error>",
    "optionalFor": ["list", "get"],
    "reason":      "<por qué se permite leer sin padre — obligatoria si hay optionalFor>",
    "mode":        "sameRecord"
  }
}
```

Todo opcional. Un objeto raíz con la sección `parent` deja espacio para futuras opciones del MCP
sin volver a tocar el modelo — que es la ventaja principal de la columna única.

#### El caso común no necesita configuración

El objetivo es poder decir fácil "sales-order/lines necesita sales-order". Y para ese caso
concreto la respuesta es mejor que fácil: **no hay que escribir nada**.

`C_OrderLine` tiene exactamente una columna `isparent` activa —`C_Order_ID`— que apunta a
`C_Order`, que es el padre-SEQNO. AUTO la resuelve y exige el padre en los cinco verbos. La
propiedad es `OrderLine.PROPERTY_SALESORDER = "salesOrder"`, así que el error que ve el agente
dice literalmente *"pass parentId — the parent is `header`, filtered by `salesOrder`"*.

Eso vale para las ~82 entidades de categoría 1 y 2: cero configuración. `MCP_CONFIG` se escribe
sólo donde AUTO no acierta (~20 filas), y ahí la forma mínima es de una clave:

```json
{"parent": {"field": "salesOrder"}}
```

#### `field` va en formato propiedad, no `DBColumnName` El resto del MCP habla en propiedades: los
`filters` de `neo_list` son `{"businessPartner": "..."}`, los `fields` de `neo_create` también, y
los descriptores de `neo_schema` se nombran igual. Si la configuración usara `C_BPartner_ID` sería
el único lugar del MCP que habla en nombres físicos, y el mensaje de error tendría que traducir
entre los dos vocabularios. Con formato propiedad, el error cita **el mismo nombre que el agente
tiene que escribir**.

**Se toleran los dos formatos**, resueltos por el helper que ya existe y que ya acepta ambos —
`dalEntity.getProperty(x, false)` con fallback a `getPropertyByColumnName(x, false)`, exactamente lo
que hacen hoy `mapFieldsToDalProperties` y `McpQuerySupport.resolveFilterProperty`. El formato
propiedad es el recomendado y el que se documenta; el `DBColumnName` funciona pero no se promueve.

**Ejemplos reales, verificados contra `src-gen`** (los nombres de propiedad son los generados):

| Entidad | Tabla | `MCP_CONFIG` |
|---|---|---|
| `product/stock` | `M_Storage_Detail` | `{"parent":{"field":"product","entity":"product"}}` |
| `warehouse/binContents` | `M_Storage_Detail` | `{"parent":{"field":"storageBin","entity":"storageBin"}}` |
| `warehouse/productTransactions` | `M_Transaction` | `{"parent":{"field":"storageBin","entity":"storageBin"}}` |
| `contacts/customer` | `C_BPartner` | `{"parent":{"mode":"sameRecord"}}` |
| `contacts/employee` | `C_BPartner` | `{"parent":{"mode":"sameRecord"}}` |
| `contacts/vendorCreditor` | `C_BPartner` | `{"parent":{"mode":"sameRecord"}}` |
| las 5 de `sii-monitor` | `C_Invoice` etc. | `{"parent":{"optionalFor":["list","get"],"reason":"padre singleton de configuración"}}` |
| `sales-order/lines` | `C_OrderLine` | **vacío** — AUTO resuelve `salesOrder` y exige en los 5 verbos |

Verificado en `src-gen`: `StorageDetail.PROPERTY_PRODUCT = "product"`,
`PROPERTY_STORAGEBIN = "storageBin"`, `PROPERTY_REFERENCEDINVENTORY = "referencedInventory"`,
`MaterialTransaction.PROPERTY_STORAGEBIN = "storageBin"`. Y el caso de Valeria, que AUTO resuelve
sin configuración, filtraría por `Location.PROPERTY_BUSINESSPARTNER = "businessPartner"` — el mismo
nombre que el agente ya usa en `filters`.

> Nota sobre `product/stock`: la propiedad correcta es `product`, y la que `resolveParentFK` elige
> hoy es `referencedInventory`. Los dos nombres existen en la misma entidad, lo que explica por qué
> el defecto de §12.1 pasa desapercibido: no falla, escribe en el campo de al lado.

#### 4.10.1 Orden de resolución en `McpParentScope`

```
1. MCP_CONFIG malformado, o declara algo que no existe  -> la entidad NO SE PUBLICA (ver 4.10.2)
2. parent.mode = sameRecord                             -> no es hija a efectos del gate, pasa
3. parent.optionalFor contiene el verbo en curso        -> el gate no aplica a ESTE verbo (ver 4.10.3)
4. parent.field presente                                -> filtra y escribe por esa propiedad. Fin.
5. AUTO: padre = getParentTab (SEQNO), y entre las columnas isparent se elige
   la que apunta a la TABLA de ese padre                -> resuelve 82 de 102 sin config
6. AUTO no resolvió una FK inequívoca                   -> la entidad NO SE PUBLICA
```

Los pasos 1 y 6 son los que mantienen la decisión de §6 intacta: el default de una entidad que no
se puede resolver **no es "publicarla plana"**, es no publicarla, y que `neo_discover` la reporte
como no configurada — igual que ya se hace con los report specs sin contract
(`NeoReportCallability.resolveReportContract` → `ifPresent`).

Ningún valor de `MCP_CONFIG` permite listar una hija sin padre. `sameRecord` y `singletonParent`
no apagan el gate: declaran que esa entidad **no es un hijo N:1**, y ambas afirmaciones son
verificables contra el modelo (misma tabla / padre de cardinalidad 1).

#### 4.10.2 El trade-off de la columna única, y la mitigación obligatoria

Lo que se pierde frente a tres columnas tipadas:

- **integridad referencial.** `MCP_PARENT_COLUMN_ID` como FK a `AD_Column` garantizaba que la
  columna existe y que borrarla no deja la config colgada. En JSON es un string libre.
- **el desplegable en la UI.** Con FK, el usuario elige la columna de una lista; con JSON la
  escribe a mano, y un typo no se detecta al guardar.

**Mitigación, y es un requisito, no un nice-to-have:** `MCP_CONFIG` se valida y **falla visible**.
JSON malformado, `field` que no resuelve a ninguna propiedad ni columna de la entidad, `field` que
resuelve pero **no es una FK** (es un primitivo), `entity` que no es una `SFEntity` incluida del
mismo spec → la entidad **no se publica** y `neo_discover` la reporta con el error concreto.

Chequeos concretos del validador, todos baratos y sobre el modelo en memoria:

| Chequeo | Falla si |
|---|---|
| JSON parseable | `new JSONObject(cfg)` lanza |
| `field` resuelve | ni `getProperty(field, false)` ni `getPropertyByColumnName(field, false)` devuelven algo |
| `field` es FK | la `Property` resuelta es primitiva (`isPrimitive()`) — filtrar por padre exige una referencia |
| `field` apunta al padre | la `targetEntity` de la propiedad no es la entidad de la tabla del padre-SEQNO (**warning**, no error: los 13 mismatch de §12.1 son justamente casos donde la declaración corrige a la heurística, así que aquí el warning es informativo) |
| `entity` existe | no hay `SFEntity` con ese nombre, activa e incluida, en el mismo spec |
| `mode` conocido | valor distinto de `sameRecord` |
| `optionalFor` sólo lectura | contiene `create`, `update` o `delete` |
| `optionalFor` verbos válidos | contiene algo que no es `list` ni `get` |
| `reason` presente | hay `optionalFor` y falta `reason` |
| `mode: sameRecord` es cierto | la tabla de la entidad **no** es la misma que la del padre-SEQNO |
| claves desconocidas | se reportan, para que un `"parentField"` en lugar de `"field"` no pase por config vacía |

El último es importante y es la contracara de la columna JSON: sin esquema tipado, una clave mal
escrita es indistinguible de una ausente. Reportar las claves no reconocidas es lo que evita que un
typo se lea como "sin configuración" — que aquí significa abrir el gate.

> **Y aquí hay que invertir el patrón de `NAMED_FILTERS`.** Su javadoc dice literalmente: *"A
> blank/malformed payload yields an empty map (never null) so callers degrade gracefully."* Para
> los filtros con nombre, degradar en silencio es razonable — se pierde una comodidad. Para
> `MCP_CONFIG` sería **peligroso**: un JSON malformado apagaría el gate y devolvería el listado
> plano con status OK. Es exactamente la forma del bug §2.7, que ya nos costó una respuesta
> incorrecta. Acá el silencio abre el gate, así que el fallo tiene que ser ruidoso.

Vale además un validador de arranque (o un modulescript) que recorra los `MCP_CONFIG` y liste los
que no resuelven, para que un typo se descubra al desplegar y no cuando un agente llama.

#### 4.10.3 `optionalFor`: relajar el gate por verbo, no por entidad

El gate no es igual de defendible en los cinco verbos. En escritura, un hijo sin padre es un
huérfano: no hay lectura razonable de "creá una línea de pedido sin pedido". En lectura, en cambio,
**sí hay casos donde el listado global es legítimo** — cuando el padre es un singleton de
configuración, o cuando la entidad se consulta naturalmente de forma transversal y el recorte lo
da un filtro, no el padre.

Por eso `optionalFor` va **por verbo**, y no existe un interruptor por entidad:

```json
{"parent": {"optionalFor": ["list", "get"], "reason": "el padre es un singleton de configuración"}}
```

**Reglas:**

| | |
|---|---|
| Default sin `optionalFor` | el padre es **obligatorio en los cinco verbos**: `list`, `get`, `create`, `update`, `delete` |
| `optionalFor` acepta | **sólo** `list` y `get` |
| `optionalFor` con `create`, `update` o `delete` | **error de validación** — la entidad no se publica. Un write sin padre no se relaja nunca |
| `reason` | **obligatoria** cuando hay `optionalFor`. Sin razón, la config no valida |

Los tres puntos importantes de este diseño:

1. **El default es el seguro.** Una entidad sin `MCP_CONFIG`, o con `MCP_CONFIG` sin `optionalFor`,
   exige padre en todo. Relajar requiere escribirlo.
2. **La escritura no se puede relajar.** Es la mitad del gate que protege la integridad de los
   datos, y no tiene ningún caso de uso "global" que la justifique. El validador lo rechaza.
3. **Queda firmado.** `reason` obligatoria significa que cada excepción de lectura tiene un motivo
   escrito y auditable en la configuración, y `neo_discover` puede exponerlo.

Esto reemplaza el `mode: "singletonParent"` que había propuesto antes: era un caso particular de
lo mismo, expresado peor. Las 9 entidades de `sii-monitor` y `monitor-verifactu` pasan a
`{"parent":{"optionalFor":["list","get"],"reason":"padre singleton de configuración (aeatsii_config)"}}`.

**Y sigue pendiente verificarlo:** en esta instancia `aeatsii_config` y `etvfac_verifactu_config`
tienen **0 filas** (módulos no configurados aquí), así que no pude confirmar que sean singletons
por cliente. Hay que revisarlo antes de escribir esa `reason`. → duda **Q13**.

`mode: "sameRecord"` se mantiene, porque afirma algo estructuralmente distinto: que no hay padre
ajeno del que colgar (misma tabla, 1:1), no que el gate se relaje.

#### 4.10.3.1 Cómo lo ve el agente

`optionalFor` tiene que llegar al agente, o no sirve de nada: si el `parentId` es opcional para
`list` y el agente no lo sabe, igual va a pedirlo o va a fallar y reintentar.

- **`neo_discover`** y **`neo_schema`** emiten, por entidad hija:
  `{"isChild": true, "parentEntity": "header", "parentField": "salesOrder", "parentRequiredFor": ["list","get","create","update","delete"]}`
- La descripción de `parentId` en `neo_list` / `neo_get` deja de ser absoluta: "obligatorio para
  entidades hijas, salvo las que `neo_discover` marque con `parentRequiredFor` sin este verbo".

#### 4.10.4 Cuánta configuración manual hace falta

| Categoría (§12.4) | Entidades | `MCP_CONFIG` |
|---|---|---|
| 1 — FK única al padre-SEQNO | ~52 | **vacío** (AUTO) |
| 2 — varias `isparent`, una apunta al padre | 30 | **vacío** (AUTO desambigua por la tabla del padre) |
| 3 — pestaña del mismo registro | 3 | `{"parent":{"mode":"sameRecord"}}` |
| 4 — sin FK resoluble | 17 | `field` explícito, o `optionalFor: ["list","get"]` + `reason` donde corresponda |

**~20 filas de configuración**, 82 entidades sin tocar. Y una sola columna nueva en el modelo en
lugar de tres, sin `AD_REF_LIST` para la lista de modos.

#### 4.10.5 Beneficio colateral: arregla el defecto de §12.1

La propiedad que resuelve `McpParentScope` —declarada en `MCP_CONFIG` o desambiguada por la tabla
del padre— es la misma que usa `resolveParentFK` en el create. Los 13 casos donde hoy el `parentId` se
escribe en la FK equivocada (`product/stock` → `M_RefInventory_ID`, etc.) se corrigen por
construcción, no con un parche aparte.

#### 4.10.6 Lo que esta propuesta no resuelve

Los 6 huérfanos de §11. Ahí el problema no es *por qué columna* filtrar, sino que el agente **no
puede obtener el `parentId`** porque el padre no está publicado en ningún spec. Para esos seis
sigue haciendo falta la decisión de §11: incluir el padre (3 casos) o bajar la hija (3 casos).

---

## 5. Fases

Todo bajo **ETP-5184**, un solo ticket (decisión del 2026-09-07). Las fases son orden de trabajo
interno, no tickets separados.

| Fase | Contenido | Riesgo | Rompe agentes |
|---|---|---|---|
| **F0** ✅ | **La base de configuración**: columna `MCP_CONFIG` en las tres tablas SF + `McpEntityConfig` (parseo, caché, registro de secciones, fallo ruidoso) + validador de despliegue. Detalle en `2026-09-07-mcp-entity-configuration-base.md`. Con cero secciones registradas el MCP se comporta byte-por-byte como hoy | Bajo | No |
| **F1** ✅ | `McpParentScope` + la sección `parent` (§4.10) + tests. `resolveParentFK` refactorizado para consumirlo — **y con eso corregido el defecto de §12.1**. `NeoParentTabFilterResolver` / `NeoDefaultsService` quedan pendientes (§14) | Bajo | No |
| **F2** | Descubribilidad (§4.8): `isChild` / `parentEntity` / `parentField` / `parentRequiredFor` en `neo_discover` y `neo_schema`. Aditivo | Bajo | No |
| **F3** | Filtro silencioso (§4.9) + `neo_defaults` estricto (§4.6) | Bajo | Marginal |
| **F4** | **El gate**: `neo_list` (§4.2) + `neo_create` (§4.4) + `neo_batch` (§4.7) | Medio | **Sí** — ver §6 |
| **F5** | `neo_get` estricto + pertenencia en `update`/`delete` (§4.3, §4.5) | Medio | **Sí** |
| **F6** | **Datos**: las ~20 filas de `MCP_CONFIG` (3 `sameRecord` + 17 `field`/`optionalFor`) y las altas/bajas de §11. Recetas de `docs` + prompts de entidad | Bajo | No |
| **F7** | **Precedencia del contexto del padre en callouts** (D-7, §14): orden de `buildRequestParams` + regla `body > padre > default del hijo > sesión` | Bajo | No |

**F7 no tiene dependencias** — no toca la capa MCP ni `MCP_CONFIG`, así que puede entrar antes que
F0. Está en este ticket porque es el mismo defecto de fondo (el hijo no hereda del padre) y se
encontró reproduciendo un alta de pedido por MCP.

**F0 → F1 es la única dependencia técnica dura hacia atrás**: la sección `parent` no existe sin la
base.

**F6 tiene que entrar en la misma release que F4-F5, o antes.** El gate sin los datos de
configuración deja 17 entidades sin publicar y rompe las 3 pestañas del mismo registro. Es la
dependencia que más fácil se pasa por alto.

F0-F3 son de bajo riesgo y se pueden ir mergeando primero. El ticket no se cierra hasta que el
gate (F4-F5) y sus datos (F6) estén dentro.

## 6. Compatibilidad — es un breaking change y entra igual (DECIDIDO)

El gate rompe cualquier flujo que hoy liste una entidad hija sin padre — potencialmente 207
entidades.

**Decisión: corte directo.** El cambio entra en la próxima versión, comunicado en release notes.
**Sin flag de preferencia y sin columna de opt-out por entidad.**

Razón, en palabras de Valentín: *"tiene que ser ahora que tome el cambio, no debería saltearse"*.
Un gate que se puede desactivar no es un gate — deja el bug vivo en cualquier instalación que no
invierta el flag, y garantiza que nadie migre sus flujos.

Se descartan explícitamente:

- ~~flag `mcp.requireParentOnChildEntities`~~
- ~~columna `REQUIRE_PARENT` en `ETGO_SF_ENTITY`~~
- ~~modo warning durante N versiones~~

**Consecuencia a asumir:** hay que comunicarlo bien en release notes y revisar los agentes de
Copilot y los flujos internos que consuman entidades hijas antes de liberar.

**La única vía legítima para un listado plano** sigue siendo la de §3: configurar un spec sobre su
propia ventana con `TABLEVEL = 0` — como ya existe `bp-location`. Es configuración de producto,
no una excepción al gate.

## 7. Hallazgos secundarios detectados en el mismo recorrido

- **D-1 — Filtro silencioso.** Ya cubierto en §2.7 / §4.9. Es, a mi juicio, el más urgente de todos
  los hallazgos: produce respuestas *falsas*, no sólo demasiado amplias.
- **D-2 — `neo_defaults`: prosa vs. schema.** §2.4.
- **D-3 — `handleGet` no aplica `adTab.getHqlwhereclause()`** mientras `handleList` sí.
  Un registro que la pestaña filtra fuera es igualmente recuperable por id. Independiente de este
  bug, pero está en las mismas ~80 líneas.
- **D-4 — `neo_update` puede reparentar** un registro hijo cambiando su FK al padre. §4.5.
- **D-5 — `resolveParentFK` toma la primera columna `isLinkToParentColumn` y hace `break`** sin
  desambiguar contra la pestaña padre real. §4.1.
- **D-6 — 6 entidades con `AD_TAB_ID` que no resuelve en los XML locales**
  (`organization/actividadesDelIae`, `organization/representanteLegal`,
  `purchase-invoice/cashVat`, `sales-invoice/cashVat`, `user/rxServicesAccess`, `user/token`).
  Probablemente vienen de módulos no presentes en este workspace, pero conviene confirmarlo contra
  la BD antes de dar por cerrado el censo. → duda **Q7**.
- **D-7 — El contexto de la cabecera no llega al puente de callouts al crear un hijo.**
  Mismo principio rector que el resto del plan (un hijo sólo tiene sentido dentro de su padre),
  pero en `schemaforge/CalloutRequestBuilder.java`, no en la capa MCP. → §14.

---

## 8. Decisiones tomadas y dudas abiertas

### Resueltas (2026-09-04)

| # | Tema | Decisión |
|---|---|---|
| Q1 | Multi-padre en `neo_list` | `parentId` acepta string o **array de hasta 20 ids** |
| Q2 | `neo_get` | **Estricto**: `parentId` obligatorio también para leer de a uno |
| Q3 | Reparenting vía `neo_update` | **Prohibido** |
| Q5 | Rollout | **Corte directo**, sin flag ni opt-out por entidad |
| Q8 | Ticket | **Un solo ticket**: ETP-5184, todo el alcance junto — la base de configuración entra como fase F0, sin ticket propio |
| — | Columna de config | `MCP_CONFIG` (text/JSON), definida en las **tres** tablas SF: spec, entity y field |
| — | Precedencia de secciones | reemplazo por defecto, aditivo por opt-in de la sección |

### Verificadas con datos

**Q4 — Hija cuyo padre no está incluido en el spec.** Verificado contra BD: **6 casos reales**
(no 13). Analizados uno por uno en §11, con recomendación para cada uno: 3 altas de configuración
y 3 bajas, **sin código**.

### Asumidas por defecto — confirmar

| # | Tema | Asunción |
|---|---|---|
| Q6 | Filtro no resoluble | **422 `unknown_filter_field`** (confirmado 2026-09-04) |

### Abiertas

**Q10 — Los 6 huérfanos de §11.** Hay recomendación caso por caso (A/A/A/B/B/B). Falta tu OK, y
en el caso 3 (`end-year-close`) confirmar con quien mantiene el módulo de cierre.

~~**Q11 — Las 17 entidades de categoría 4.**~~ **RESUELTO** por la configuración declarativa de
§4.10: se declara `MCP_PARENT_COLUMN_ID`, y si nadie la declara la entidad no se publica.

~~**Q12 — El defecto de `resolveParentFK`.**~~ **RESUELTO por construcción**: la columna que
resuelve `McpParentScope` (declarada o desambiguada por la tabla del padre) es la misma que usa el
create, así que los 13 mismatch se corrigen con el propio gate. Queda sólo **verificarlo en
runtime** para confirmar que hoy efectivamente escribe mal, y decidir si eso merece mención
aparte en las release notes por ser corrupción silenciosa de datos.

**Q13 — Cardinalidad de los padres de configuración (§4.10.3).** `aeatsii_config` y
`etvfac_verifactu_config` tienen 0 filas en esta instancia, así que no pude confirmar que sean
singletons por cliente. Hay que verificarlo en una instancia con SII/Verifactu configurado antes
de usar `singletonParent` en esas 9 entidades.

**Q7 — Las 6 entidades con tab no resuelto (D-6).**
El censo de este plan sale de los XML del repo. Con una instancia con BD levantada se puede
verificar el `TABLEVEL` real contra `AD_TAB` y cerrar el conteo definitivo.

~~**Q9 — Bundle de GitHub.**~~ **RESUELTO:** se trata como una feature más, sin issue de GitHub.
Rama `feature/ETP-5184` sacada de `develop` en `modules/com.etendoerp.go`, ya creada.
Commits con formato `Feature ETP-5184: ...`.

## 9. Archivos que tocaría cada fase

```
modules/com.etendoerp.go/src/com/etendoerp/go/mcp/
  McpParentScope.java            (NUEVO — F0)
  McpToolRouter.java             handleList/handleGet/handleCreate/handleUpdate/handleDelete/handleSchema  (F3, F4)
  ToolRegistry.java              buildListTool/buildGetTool/buildCreateTool/buildDefaultsTool/buildBatchTool  (F1, F3)
  McpWriteRequestSupport.java    resolveParentFK → delega en McpParentScope  (F0)
  McpQuerySupport.java           appendEqualityCondition / appendOperatorConditions — filtro silencioso  (F2)
  McpSupportInternals.java       buildDiscoverEntity — isChild/parentEntity/parentField  (F1)
  McpSchemaCreateView.java       la FK al padre pasa a `required` en view:"create"  (F1)
  McpConstants.java              nuevas claves de error  (F2, F3)

modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/
  NeoParentTabFilterResolver.java   → consume McpParentScope  (F0)
  NeoDefaultsService.java           isColumnReferencingParentTab → idem  (F0)
  BatchService (createRecord)       gate de padre  (F3)
  CalloutRequestBuilder.java        buildRequestParams: orden padre/defaults + comentarios  (F7)

modules/com.etendoerp.go/src-test/src/com/etendoerp/go/mcp/
  tests nuevos en cada fase

modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/
  CalloutRequestBuilderTest.java    tests de precedencia (hoy no existen)  (F7)

modules/com.etendoerp.go/docs/
  neo-headless.md                   documentar la regla de precedencia  (F7)
```

---

## 10. Cómo reproducir el bug reportado

```
neo_list(spec: "contacts", entity: "locationAddress")
```

Devuelve hasta 100 direcciones de *todos* los terceros del cliente, sin ninguna indicación de que
en la UI ese listado no existe. El equivalente en la UI sería abrir la ventana Business Partner,
posicionarse en un tercero y entrar a la pestaña "Location/Address".

Otros casos igual de ilustrativos:

```
neo_list(spec: "sales-order",  entity: "lines")     → todas las líneas de todos los pedidos
neo_list(spec: "contacts",     entity: "contact")   → todos los contactos de todos los terceros
neo_list(spec: "product",      entity: "price")     → todos los precios de todos los productos
```

---

## 11. Análisis caso por caso de los huérfanos (hija visible, padre invisible)

Contra la BD real son **6**, no 13. Los otros 7 que aparecían en la medición por XML tienen la
**hija también excluida** (`ISINCLUDED = 'N'`): padre e hijo ambos fuera del MCP, no hay
incoherencia. Eran falsos positivos del mismo error de default descrito en §1.

Los 6 reales, todos con el padre `ISACTIVE = 'Y'` pero `ISINCLUDED = 'N'`:

### Caso 1 — `chart-of-accounts/elementValue` → padre `element`

| | |
|---|---|
| Hija | `C_ElementValue` (tabla), nivel 1, **68.434 filas** |
| Padre | `element` → `C_Element` (tabla), nivel 0, **40 filas** |
| FK al padre | `C_Element_ID` — **coincide** con el padre-SEQNO |

Son las cuentas contables del plan de cuentas. Hoy se listan las 68.434 planas. El padre son 40
registros de configuración: exponerlo es barato y no revela nada sensible.

**→ Opción A: incluir `element`.** Es el caso más claro de los seis.

### Caso 2 — `fiscal-calendar/year` → padre `calendar`

| | |
|---|---|
| Hija | `C_Year` (tabla), nivel 1, **103 filas** |
| Padre | `calendar` → `C_Calendar` (tabla), nivel 0, **39 filas** |
| FK al padre | `C_Calendar_ID` — **coincide** |

Ejercicios fiscales por calendario. Volumen chico en ambos lados, FK limpia.

**→ Opción A: incluir `calendar`.** Trivial.

### Caso 3 — `end-year-close/accounting` → padre `endYearClose`

| | |
|---|---|
| Hija | `FinancialMgmtAccountingFactEndYearHQL`, nivel 1 |
| Padre | `endYearClose` → `c_year_close_v` — **es una VISTA**, nivel 0 |
| FK al padre | coincide con el padre-SEQNO |

Ventana de cierre de ejercicio. El padre es una vista, así que sólo admite lectura — pero el gate
sólo necesita poder leerlo para que el agente obtenga el `parentId`.

**→ Opción A: incluir `endYearClose` como GET-only.** Conviene confirmar con quien mantiene el
módulo de cierre que exponerla en lectura no molesta.

### Caso 4 — `product/categoryPriceRuleVersion` → padre `productCategories`

| | |
|---|---|
| Hija | `M_ServicePriceRule_Version`, nivel 2, **3 filas** |
| Padre | `productCategories` → `M_Product_Category_Service`, nivel 1 |
| FK al padre | `M_Product_ID`, `M_Relatedproduct_ID`, `M_Relatedproductcategory_ID`, `M_Servicepricerule_ID` — **ninguna apunta al padre-SEQNO** |

Doble problema: el padre está excluido **y** la hija no tiene ninguna FK al padre-SEQNO. Incluir el
padre no alcanzaría: el gate no sabría por qué columna filtrar. Y son 3 filas.

**→ Opción B: excluir la hija.** El costo de sacarla es mínimo y evita cablear una excepción para
una entidad de 3 registros.

### Caso 5 — `product/transactionAdjustments` → padre `averageCostTransactions`

| | |
|---|---|
| Hija | `M_Transaction_Cost`, **nivel 3**, **9.238 filas** |
| Padre | `averageCostTransactions` → `M_Costing_Transactions_HQL` (vista), nivel 2 |
| FK al padre | `M_Transaction_ID` — **no apunta al padre-SEQNO** |

Es el único nivel 3 del catálogo, y el peor caso de todos. La cadena de ancestros por `SEQNO` da:
`Transaction Adjustments` (3) → `Average Cost Transactions` (2) → **`Substitute` (1)** →
`Product` (0). Ese `Substitute` (`M_Substitute`) no tiene ninguna relación semántica con los ajustes
de coste: es un artefacto de la regla `max(seqno)` cuando la ventana tiene muchos tabs hermanos.

El padre semántico real es la transacción de inventario (`M_Transaction_ID`), que no es el
padre-SEQNO.

**→ Opción B: excluir la hija**, o mantenerla filtrando por `M_Transaction_ID` como excepción
documentada. Recomiendo excluirla: 9.238 filas de ajustes de coste no son un caso de uso de agente.

### Caso 6 — `purchase-order/paymentDetails` → padre `paymentPlan`

| | |
|---|---|
| Hija | `FIN_Payment_Detail_V` (**vista**), nivel 2 |
| Padre | `paymentPlan` → `FIN_Payment_Sched_Ord_V` (**vista**), nivel 1 |
| FK al padre | `FIN_Payment_Detail_ID`, `FIN_Payment_Schedule_Invoice` — **ninguna apunta al padre-SEQNO** |

Y lo más revelador: **en `sales-order` la misma pareja está configurada al revés**. Ahí
`paymentDetails` y `paymentPlan` están **ambos** excluidos, coherentemente. En `purchase-order`
quedó la hija dentro y el padre fuera.

Esa asimetría entre dos specs gemelos no parece una decisión, parece un descuido de configuración.

**→ Opción B: excluir `purchase-order/paymentDetails`**, igualando a `sales-order`. Corrige la
asimetría y no requiere código.

### Resumen de recomendaciones

| Caso | Recomendación | Motivo |
|---|---|---|
| `chart-of-accounts/elementValue` | **A** — incluir `element` | 40 filas, FK limpia, 68k hijas hoy planas |
| `fiscal-calendar/year` | **A** — incluir `calendar` | 39 filas, FK limpia |
| `end-year-close/accounting` | **A** — incluir `endYearClose` GET-only | padre es vista; confirmar con el módulo |
| `product/categoryPriceRuleVersion` | **B** — excluir la hija | 3 filas y sin FK al padre |
| `product/transactionAdjustments` | **B** — excluir la hija | nivel 3, jerarquía SEQNO poco fiable, sin FK al padre |
| `purchase-order/paymentDetails` | **B** — excluir la hija | corrige asimetría con `sales-order` |

Tres altas de configuración y tres bajas. **Cero código.** Y las tres bajas caen justo donde la FK
al padre no existe, que es donde el gate no podría funcionar de todos modos.

---

## 12. Hallazgo estructural: el padre-SEQNO no siempre es el padre-FK

Este es el hallazgo que más cambia el diseño de §4.1, y salió de cruzar, para las 102 hijas
expuestas, el padre que devuelve la regla de core (`SEQNO`) contra las columnas
`AD_Column.isparent` de la tabla hija:

| | Hijas | |
|---|---|---|
| La FK `isparent` **apunta** al padre-SEQNO | **82** | 80 % — el gate funciona directo |
| **No coincide**: ninguna FK `isparent` apunta al padre-SEQNO | **13** | 13 % |
| **Sin ninguna** columna `isparent` activa | **7** | 7 % |
| Con **más de una** columna `isparent` activa | **30** | 29 % (se solapa con las anteriores) |

### 11.1 Las 13 que no coinciden — `resolveParentFK` ya escribe mal hoy

`resolveParentFK` recorre las columnas de la tabla, toma **la primera** con `isLinkToParentColumn()`
y le asigna el `parentId`, **sin verificar que apunte al padre real**. En estas 13, esa primera
columna no es la FK al padre-SEQNO:

| Entidad | Padre-SEQNO | La FK donde se escribiría el `parentId` |
|---|---|---|
| `product/stock` | `M_Product` | `M_RefInventory_ID` |
| `warehouse/binContents` | `M_Locator` | `M_RefInventory_ID` |
| `warehouse/productTransactions` | `M_Locator` | `M_Product_ID` |
| `product/transactionAdjustments` | `M_Costing_Transactions_HQL` | `M_Transaction_ID` |
| `product/categoryPriceRuleVersion` | `M_Product_Category_Service` | `M_Product_ID` (+3 más) |
| `payment-in/finPaymentScheduleDetail` | `FIN_Payment` | `FIN_Payment_Detail_ID` (+1) |
| `payment-out/lines` | `FIN_Payment` | `FIN_Payment_Detail_ID` (+1) |
| `purchase-invoice/paymentDetails` | `FIN_Payment_Schedule` | `FIN_Payment_Detail_ID` (+1) |
| `purchase-order/paymentDetails` | `FIN_Payment_Sched_Ord_V` | `FIN_Payment_Detail_ID` (+1) |
| `sii-monitor/issuedInvoices` | `aeatsii_config` | `C_BPartner_ID` |
| `sii-monitor/issuedInvoices(previousPeriod)` | `aeatsii_config` | `C_BPartner_ID` |
| `sii-monitor/receivedInvoices` | `aeatsii_config` | `C_BPartner_ID` |
| `sii-monitor/receivedInvoices(previousPeriod)` | `aeatsii_config` | `C_BPartner_ID` |
| `sii-monitor/paymentsSiiData` | `aeatsii_payment_cashvat_v` | `FIN_Payment_ID` |

**Esto ya es un defecto en producción, independiente del gate.** Un `neo_create` sobre
`product/stock` pasando `parentId` = id de producto escribe ese id en `M_RefInventory_ID` — la FK
de "inventario referenciado". No falla: escribe un dato incorrecto. Vale la pena verificarlo en
runtime y, si se confirma, es el hallazgo más urgente de todo el análisis.

### 11.2 Las 7 sin `isparent` — y 3 de ellas no son hijas de verdad

De las 7 sin ninguna columna `isparent`, **3 tienen la misma tabla que su padre**:

| Entidad | Tabla propia | Tabla del padre | |
|---|---|---|---|
| `contacts/customer` | `C_BPartner` | `C_BPartner` | **misma tabla** |
| `contacts/employee` | `C_BPartner` | `C_BPartner` | **misma tabla** |
| `contacts/vendorCreditor` | `C_BPartner` | `C_BPartner` | **misma tabla** |

No son registros hijos: son **pestañas de detalle del mismo registro** (en la UI, las solapas
"Customer" / "Employee" / "Vendor" del tercero editan campos de la propia fila de `C_BPartner`).
`TABLEVEL > 0` pero cardinalidad 1:1 con el padre.

Para éstas el gate **no debe pedir un `parentId` ajeno** — el "padre" es el propio registro. Si se
les aplica el gate tal cual, se les exige una clave que no tiene sentido y quedan inutilizables.

Las 4 restantes sí son tablas distintas pero sin FK declarada al padre:
`purchase-invoice/accounting`, `purchase-invoice/batuz`, `sii-config/logHash`,
`sii-monitor/cashCriterionPayments` (vista).

### 11.3 Las 30 con más de una `isparent` — el `break` es no determinista

29 % de las hijas tienen dos o más columnas `isparent` activas. `resolveParentFK` toma la primera
que devuelve `getADColumnList()` y corta. El orden de esa lista no está garantizado, así que en
esas 30 la columna elegida puede variar. `purchase-invoice/exchangeRates` tiene **cinco**.

### 11.4 Consecuencia para el diseño de `McpParentScope`

`isChild(tab) = TABLEVEL > 0` **no alcanza**. El resolver tiene que clasificar en cuatro
categorías, y cada una se comporta distinto frente al gate:

| Categoría | Cuántas | Comportamiento del gate |
|---|---|---|
| **1. Hija con FK única al padre-SEQNO** | ~52 | `parentId` obligatorio, filtra por esa FK |
| **2. Hija con varias `isparent`** | 30 | igual, pero **desambiguando** por la tabla del padre-SEQNO — nunca la primera de la lista |
| **3. Pestaña del mismo registro** (misma tabla que el padre) | 3 | **el gate no aplica**: cardinalidad 1:1, el padre es el propio registro |
| **4. Sin FK resoluble al padre-SEQNO** | 17 (13 mismatch + 4 sin `isparent`) | el gate no puede filtrar por heurística → se declara `MCP_PARENT_COLUMN_ID` (§4.10), y si no se declara, **la entidad no se publica** |

La categoría 4 era la que parecía necesitar una excepción al gate: 17 entidades donde no hay
columna por la que filtrar. **Resuelta por §4.10**: se declara la columna a mano, y si nadie la
declara la entidad no se publica. No hay excepción al gate — hay configuración explícita.

---

## 13. Verificación contra `develop` actual (2026-09-04)

El análisis inicial se hizo sobre `feature/ETP-5115`. Al sacar la rama, `develop` traía 26 commits
nuevos. Reverificado sobre `develop` @ `257a8cbc`:

| Punto | Estado |
|---|---|
| `neo_list` → `required = ["spec","entity"]` | Sin cambios — el bug sigue |
| `neo_get` → `required = ["spec","entity","id"]` | Sin cambios — el bug sigue |
| `parentId` sólo en `handleCreate` y `handleDefaults` (opcional) | Sin cambios |
| Filtro silencioso en `McpQuerySupport` | Sin cambios, y está en **dos** lugares: `appendEqualityCondition` (lín. 109-112) y `appendOperatorConditions` (lín. 127-130) |

Novedades de `develop` a tener en cuenta al implementar:

- **`TenantOwnership` / `TenantIsolationPolicy`** (nuevos en `schemaforge/`): aislamiento por
  **client/org**. Es **ortogonal** a este ticket — confirma que el único aislamiento existente es
  el de tenant, y que la relación padre-hijo no está cubierta por nada.
- **`buildDiscoverEntity` ahora filtra los métodos por `AD_Window_Access`** del rol. El punto §4.8
  (emitir `isChild` / `parentEntity` / `parentField`) se suma a ese mismo método, ya modificado.
- **`buildVectorSearchTool`** es una tool nueva. Revisar si también consulta entidades hijas y si
  le corresponde el mismo gate.

---

## 14. D-7 — El contexto de la cabecera no llega al puente de callouts al crear un hijo

**Detectado:** 2026-09-07, reproduciendo un alta de pedido de venta por MCP contra
`etendo-go-experimental`. **Verificado contra el entorno, no inferido del código.**

### 14.1 Síntoma

Alta de línea de pedido vía `neo_create(spec:"sales-order", entity:"lines")` pasando sólo
`salesOrder`, `product`, `orderedQuantity`, `orderDate`. La línea se crea con:

| Campo | Valor obtenido | Valor correcto (el que da la UI) |
|---|---|---|
| `tax` | Arrendamientos 21% -19%R (cobros) | **Entregas IVA 21%** |
| `warehouse` | Almacén Principal (el de sesión) | Almacén Secundario (el de la cabecera) |
| `businessPartner` | `null` | el tercero del pedido |
| `partnerAddress` | `null` | la dirección del pedido |
| `unitPrice` / `listPrice` | `0` | `2` |

El impuesto es el hallazgo grave: no falla, **deriva mal en silencio**.

### 14.2 Experimento que aísla la causa

Dos líneas idénticas en el pedido 1000283, cambiando un solo campo del body:

| Payload | Impuesto resultante |
|---|---|
| `product` + `orderedQuantity` + `orderDate` | ❌ Arrendamientos 21% -19%R (cobros) |
| ...+ `partnerAddress` (= la del pedido) | ✅ Entregas IVA 21% |

El callout **sí corre**. Lo que le llega mal son los parámetros.

### 14.3 Cadena causal

`SL_Order_Product` llama `Tax.get(...)` → `C_GetTax(...)` pasando `inpcBpartnerLocationId` como
`p_shipBPartnerLoc_ID`. Si llega vacío, en `C_GETTAX.xml` queda `v_shipTo = NULL`, el SELECT
principal (que hace `lt.C_Location_ID = v_shipTo`) no matchea nada, y la función cae al último
fallback — *cualquier* tax con `IsDefault = 'Y'`, ordenado por categoría de impuesto del tercero.

Llega vacío por un **orden de ejecución** en `CalloutRequestBuilder.buildRequestParams`:

```
:126  fillMissingColumnDefaults(...)   → params.put(inpName, resolved) para TODA columna del hijo,
                                         incluido "" cuando el default no resuelve
:131  injectParentTabParams(...)       → :526  if (!params.containsKey(inpName)) { ...inyecta padre }
```

`fillMissingColumnDefaults` corre **antes** que la inyección del padre, cuya guarda es
`!params.containsKey(inpName)`. Toda columna que existe en la línea *y* en la cabecera queda
congelada en el valor vacío o de sesión del hijo, y el valor real del padre nunca se inyecta —
aunque el servidor **ya tiene el registro padre cargado** en `injectParentRecordFields`.

### 14.4 Por qué los defaults del hijo no resuelven

Los `AD_COLUMN` relevantes de `C_OrderLine` (tabla 260):

| Columna | Obligatoria | Default en AD |
|---|---|---|
| `DateOrdered` | Y | `@DateOrdered@` |
| `M_Warehouse_ID` | Y | `@M_Warehouse_ID@` |
| `C_BPartner_ID` | N | `@SQL=... WHERE C_Order_ID=@C_Order_ID@` |
| `C_BPartner_Location_ID` | N | `@C_BPartner_Location_ID@` |

Todos son referencias al **contexto de ventana**. En Classic resuelven porque la ventana pobló el
contexto desde el registro de cabecera. En NEO el `VariablesSecureApp` se arma sólo desde el
`OBContext` (usuario/rol/org/almacén), no hay contexto de ventana → resuelven a vacío.

De ahí la asimetría que hace invisible el bug:

- **Obligatoria** + default que no resuelve → `422` explícito (es lo que pasa hoy con `orderDate`,
  que el cliente se ve obligado a mandar a mano).
- **No obligatoria** + default que no resuelve → **silencio**: se guarda `null` y de paso el
  callout deriva mal.

### 14.5 Arreglo

**APLICADO** — commit `4389f0f8` en `feature/ETP-5184`, sin pushear.

Regla de precedencia explícita: **`body del cliente > registro padre > default AD del hijo > sesión`**.

`injectParentTabParams` ahora corre antes de `fillMissingColumnDefaults`, así que el default
genérico sólo rellena lo que ni el body ni el padre proveyeron. Verificado que el reorden no rompe
la resolución del id del padre: `injectParentId` toma el valor del body si viene no vacío y si no
cae a `formState.id`, sin depender de que el fill haya sembrado la clave antes.

**Descartada la variante conservadora** ("que `fillMissingColumnDefaults` no escriba la clave
cuando el default resuelve vacío"): arregla `C_BPartner_Location_ID`, `C_BPartner_ID` y
`DateOrdered` (los tres resuelven a `""`), pero **no el almacén**, porque `@M_Warehouse_ID@`
resuelve al de sesión, que es no-vacío y le sigue ganando a la cabecera. La línea seguiría
creándose contra el almacén equivocado, lo que afecta reserva de stock y el país de origen del
cálculo de impuesto.

**Descartado también un `_context` en el body**: el servidor ya recibe `salesOrder` y ya carga el
padre; pedirle al cliente que reenvíe esos datos tapa el bug y, peor, le exige saber *qué* campos
importan — conocimiento de `C_GetTax` que vive del lado del servidor. `recordContext` /
`parentContext` (`McpConstants:39-41`) sí tienen sentido para el caso **sin padre persistido**
(p. ej. el `addRow` del front, calcular una línea antes de guardar la cabecera); si algún día hace
falta en create, se extienden esos nombres.

### 14.6 Comentarios corregidos en el mismo cambio (efecto: solo params del callout — ver §14.7)

`CalloutRequestBuilder.java:113-115` y `:128-130` afirmaban que el almacén del padre tiene
precedencia sobre el de sesión. No la tenía. Ambos actualizados en `4389f0f8`, y el primero ahora
señala explícitamente que el orden de las dos llamadas es load-bearing, para que nadie lo vuelva a
invertir.

### 14.7 Verificación en vivo (2026-09-07, entorno local)

| Item | Commit | Resultado |
|---|---|---|
| §14.9 — NPE de `neo_batch` | `8e0c5132` | ✅ **confirmado**: `committed:true`, cabecera + línea creadas |
| §14.8 — precio de línea (MCP) | `69ddc1be` | ✅ **confirmado**: `unitPrice`/`listPrice` = 23 (antes 0), `lineNetAmount` = 46 derivado solo |
| D-7 / F7 — params del callout | `4389f0f8` | ✅ **confirmado** con diferencial directo sobre `C_GetTax` — ver §14.7.1 |

**Corrección de alcance — F7 arregla menos de lo que decía §14.5.** La prueba mostró que en una
línea creada con `salesOrder` en el body siguen mal `businessPartner` (null), `partnerAddress`
(null), `warehouse` (el de sesión, no el de la cabecera) y `orderDate` (sigue siendo obligatorio
pasarlo).

La causa raíz de D-7 tiene **dos mitades** y `4389f0f8` cubre una sola:

1. **Params del callout** (`CalloutRequestBuilder`) — arreglado. Su único efecto observable son los
   valores que *deriva el callout*, o sea el impuesto.
2. **Defaults del body** (`NeoMandatoryDefaultsService`) — sin arreglar. De ahí salen
   `businessPartner`, `partnerAddress`, `warehouse` y `orderDate`, que son los que se persisten.

Mecanismo de la segunda mitad: `injectMandatoryDefaults` carga los valores del padre con
`NeoParentValuesLoader.load(adTab, parentIdValue)`, y **`parentIdValue` sale únicamente de
`fields.parentId`**. Si el agente nombra al padre por su FK (`salesOrder`), queda null y no se carga
nada del padre.

**Decisión (2026-09-07): la segunda mitad la cierra F4, no un fix aparte.** §4.4 ya decidió que
`parentId` es obligatorio en hijas, así que la forma `salesOrder` pasa a ser un error
auto-corregible en lugar de una forma soportada. Se descartó deliberadamente un helper que derivara
`parentIdValue` del FK del body: habría aceptado justo la forma que el gate quiere rechazar, y
habría dejado dos fuentes de verdad para el padre — el mismo problema que D-5.

**Consecuencia temporal, asumida:** entre ahora y F4, la forma `salesOrder` sigue guardando datos
malos en silencio. Mitigado por el arreglo de recetas de §14.10.

#### 14.7.1 F7 demostrado con un diferencial directo

Una primera lectura dijo que el beneficio de F7 "no era observable en este tenant" porque el
impuesto salía bien y podía ser suerte. **Era una conclusión apurada:** el síntoma sí se reproduce en
local, y se puede aislar llamando a `C_GetTax` con y sin la dirección de envío — el único input que
cambia el fix.

```sql
SELECT C_GetTax('<Cerveza>', DATE '2026-09-07', '<org>', '<almacén>',
                '<billTo>', <shipTo>, NULL, 'Y', NULL);
```

| `shipTo` | Impuesto resuelto |
|---|---|
| la dirección del pedido | **Entregas IVA 21%** |
| `NULL` | **Arrendamientos 21% -19%R (cobros)** |

Es el mismo valor equivocado que devolvía experimental antes del fix, con el mismo producto y el
mismo cliente de la línea creada en vivo. Y esa línea — creada con la forma `salesOrder`, sin pasar
`partnerAddress` — salió con **Entregas IVA 21%**.

Por lo tanto el callout recibió la dirección del padre. Sin F7, `fillMissingColumnDefaults` escribía
`inpcBpartnerLocationId = ""` y bloqueaba la inyección del padre: exactamente la segunda fila de la
tabla. La atribución es directa.

**Sigue no verificado:** que invertir el orden no rompa otro callout que legítimamente dependa de que
gane el default del hijo. Eso lo dice la suite, que no se corrió. Es el único punto real del cambio. Chequear con la suite de callouts
completa (`CalloutRequestBuilderTest`, `NeoCalloutServiceTest`, `NeoDefaultsCascadeHelperTest`) más
los flujos E2E de pedido y factura. Hay ~15 tests de `buildRequestParams`; si alguno codifica el
orden actual, reescribirlo para cubrir el nuevo, no borrarlo.

### 14.8 Hallazgos vecinos, fuera del alcance de D-7

- **Precio 0.** Causa distinta: `NeoDefaultsCascadeHelper.buildCalloutRequest` llama
  `resolveSelectorAuxValues(adTab, fieldName, value)` con sólo columna e id, sin el padre. El
  selector de producto es OBUISEL con HQL propio que necesita la versión de tarifa, así que los aux
  (`inpmProductId_PLIST` / `_PSTD`) vienen vacíos y `SL_Order_Product` no puede fijar el precio.
  Estos aux **no son columnas de ninguna tabla**: son la tarifa que el selector ya consultó,
  viajando junto al id. Toca `NeoSelectorService.resolveSelectorAuxForId` y probablemente
  `SelectorAuxResolver` — cambia una firma con más de un llamador, así que necesita medir impacto
  antes de comprometer alcance. **Ticket aparte.**
- **`neo_batch` rompe con `Cannot invoke "NeoServlet.lookupHandler(String)" because "this.servlet"
  is null`** al crear cabecera + línea en un solo lote (rollback completo, nada persistido).
  **Diagnosticado — es una regresión, ver §14.9.** Relevante para §4.7 (F4 toca `neo_batch`): el
  gate se estaría montando sobre un camino que hoy no funciona para ninguna entidad con
  `Java_Qualifier`. **Ticket aparte.**

### 14.9 `neo_batch` roto: regresión del 2026-08-20

`McpToolRouter:1205` obtiene el servicio con `BatchService.forBatchOnly()`, que construye
`new NeoCrudHandler(null)` (`BatchService:199`). Su javadoc declara el contrato del que depende:

> *"The batch endpoint dispatches **exclusively** through `NeoCrudHandler#handleDefault(NeoContext)`,
> which does not touch the owning servlet — **only `handleWithHooks` does**. […] so future changes
> that need the servlet in the default path **fail at construction rather than at runtime**."*

Ese contrato **ya no se cumple**. `NeoCrudHandler:812`, dentro del camino de create que sale de
`handleDefault`, hace:

```java
if (StringUtils.isNotBlank(javaQualifier)) {
  NeoHandler handler = servlet.lookupHandler(javaQualifier);   // ← sin guarda de null
```

Cualquier entidad con `Java_Qualifier` (`sales-order/header` lo tiene) revienta. Por `neo_create`
normal funciona porque ahí el `crudHandler` es el del servlet, con la referencia viva.

Cronología, por `git log -S`:

| Fecha | Commit | Qué |
|---|---|---|
| 2026-05-18 | `5b752e61` ETP-3590 | Se agrega `forBatchOnly()` con el contrato "el default path no toca el servlet" |
| 2026-08-20 | `10b1776e` ETP-4957 | Se agrega el `servlet.lookupHandler` sin guarda **en el default path** |

El commit de agosto invalidó el contrato de mayo en silencio. La red de seguridad que el javadoc
prometía ("fallar en construcción, no en runtime") no existe: nada la hace cumplir.

Por qué no se detectó: IMP-23 verificó el batch en vivo el 2026-08-10/11 y el audit del 08-13 le
puso 5/5 — todo **anterior** al 08-20. Y los audits posteriores registran `neo_batch` como *not
probed* (`2026-08-19:254`, `2026-08-13-job-a:148`). El agujero de cobertura y la regresión se
cruzaron.

**ARREGLADO** — commit `8e0c5132` en `feature/ETP-5184`, sin pushear.

`NeoServlet.lookupHandler` (`:230-231`) es una delegación de una línea al **estático**
`NeoServletSupport.lookupHandler`: el call site nunca necesitó la instancia del servlet. Ahora
llama al estático directo, con comportamiento idéntico en los dos caminos y sin divergencia entre
`neo_create` y `neo_batch`. Mismo precedente que `NeoActionSurface:80`.

**Descartada la guarda de null** (`if (servlet != null)`): saltearía
`protectedCreateCalloutFields` en el camino batch, así que lote y create protegerían conjuntos de
campos distintos para la misma entidad — cambiar un NPE ruidoso por una divergencia silenciosa
entre los dos caminos de escritura.

`:812` era la única violación: los otros ocho usos de `servlet.` en `NeoCrudHandler` están entre
`:150` y `:251`, en el wrapper HTTP, inalcanzables desde `executeBatch` → `handleDefault`.

**Queda pendiente:** no hay test que ejecute un batch sobre una entidad **con** `Java_Qualifier`, que
es lo que dejó pasar la regresión. `protectedCreateCalloutFields` tiene un solo implementor
(`ContactHandler`, del mismo ETP-4957) y su único test verifica el método del handler aislado
(`ContactHandlerTest:277`); el cableado en el call site no está cubierto. Opciones: test de
integración (OBBaseTest, BD real) sobre `sales-order` cabecera + líneas, o extraer la resolución del
qualifier del `executePostCreate` privado para que un unit test la alcance con servlet null.
Tampoco está **verificado en vivo**: falta deployar y re-probar el batch contra experimental.


---

## 15. Estado de implementación: F0–F3 y las configs (2026-09-07)

### Archivos nuevos

| Archivo | Líneas | Qué es |
|---|---|---|
| `mcp/McpParentSection.java` | 250 | La sección `parent`: claves, validador, accesores. `optionalFor` acepta **sólo** `list`/`get`; un verbo de escritura es error de validación, y `reason` es obligatoria |
| `mcp/McpParentScope.java` | 505 | El resolver de las 4 categorías, con el orden de resolución de §4.10.1 y `buildParentRequiredError` |
| `mcp/McpConfigSections.java` | 62 | Bootstrap del registro de secciones — ver más abajo |
| `src-test/…/McpParentSectionTest.java` | 235 | 20 tests del contrato de la sección |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `mcp/McpWriteRequestSupport.java` | `resolveParentFK` delega en `McpParentScope`; toma un `SFEntity` más para poder leer su `MCP_CONFIG` |
| `mcp/McpToolRouter.java` | el único call site, actualizado |
| `mcp/McpEntityConfig.java` | `resolve()` llama a `McpConfigSections.ensureRegistered()` antes de parsear |

### El defecto de §12.1 queda corregido

`resolveParentFK` ya no recorre `getADColumnList()` tomando la primera columna
`isLinkToParentColumn()`. Ahora usa la propiedad que resuelve `McpParentScope`, que es la que
apunta **a la tabla del tab padre** (o la declarada en `MCP_CONFIG`). Con eso, las 17 entidades
donde la primera columna no era el enlace al padre dejan de escribir el `parentId` en la FK
equivocada — `product/stock` incluido, que hoy lo guarda en `M_RefInventory_ID`.

Y cuando el scope no puede identificar el padre, **no escribe nada** y loguea el motivo. Adivinar
una columna en silencio es lo que causó el defecto; el gate del llamador es lo que debe rechazar
esa entidad.

### Una decisión de diseño que apareció al implementar: `McpConfigSections`

`McpEntityConfig` reporta una sección desconocida como error — es lo que evita que una clave mal
escrita se lea como "sin configuración". Pero eso implica que **toda** sección tiene que estar
registrada antes de la primera lectura, no antes de que corra su propia feature.

Un bloque `static` dentro de `McpParentSection` no alcanza: sólo se dispara cuando algo toca esa
clase, así que un `neo_discover` que llegue primero reportaría una sección `parent` perfectamente
válida como desconocida. `McpConfigSections` centraliza el registro y `McpEntityConfig.resolve()`
lo invoca antes de parsear. Idempotente, y después de la primera llamada es una lectura volátil.

La base sigue sin conocer la semántica de ninguna sección: conoce esta clase y que llamarla deja el
registro completo. Agregar una sección es una línea acá más su propia clase.

### Tests: 67/67 verdes

21 de F0 + 20 nuevos. Los de F1 cubren la declaración de la sección, los payloads válidos, y sobre
todo **que `optionalFor` no pueda relajar escrituras**: `create`/`update`/`delete` rechazados, un
verbo de escritura colado junto a uno de lectura también rechazado, y el accesor `optionalVerbs`
filtrando escrituras incluso desde un payload ya rechazado. Una regresión que aceptara
`optionalFor:["create"]` desactivaría la mitad del gate sin que nadie lo note — de ahí el
cinturón y los tirantes.

### `MCP_CONFIG` se lee en un solo lugar (decisión del 2026-09-07)

Al implementar B4 había quedado una lectura de más: `buildDiscoverEntity` llamaba a
`McpEntityConfig.forEntity()` para reportar `configError`, y `McpParentScope.forEntity()` la leía
otra vez para resolver el padre. Dos lecturas del mismo dato (cacheadas, pero dos), y dos
respuestas que alguien tenía que reconciliar.

Unificado: **`McpParentScope` es el único consumidor de la columna en este camino**, y es también
lo que reporta un payload roto — de **cualquier** sección, no sólo de `parent`. Los llamadores
hacen una sola pregunta en lugar de dos:

```java
McpParentScope.Scope scope = McpParentScope.forEntity(entity);
if (!scope.isPublishable()) { /* no servir; scope.getProblem() dice por qué */ }
scope.describe();               // cómo debe direccionarla el agente
```

`isPublishable()` cubre los dos casos —"la configuración no es usable" y "el padre no se puede
identificar"— porque desde el punto de vista del llamador son la misma respuesta: no sirvas esta
entidad, y este es el motivo.

Nota de diseño: que un error en *otra* sección también retenga la entidad es deliberado. Una
entidad cuya configuración no se puede confiar no debe servirse por la parte que casualmente
parseó bien.

### Adelanto parcial de F2

Como `Scope.describe()` ya estaba escrito, `neo_discover` emite el descriptor por entidad hija:

```json
{"name": "lines", "methods": ["GET","POST"], "readOnly": false,
 "isChild": true, "parentEntity": "header", "parentField": "salesOrder",
 "parentRequiredFor": ["list","get","create","update","delete"]}
```

Es aditivo y es lo que evita que el gate sea pura fricción: un agente que lee `parentField` y
`parentRequiredFor` acierta la llamada a la primera en vez de fallar y reintentar. Falta de F2 el
mismo bloque en `neo_schema`.

### Pendiente de F1

- `NeoParentTabFilterResolver` y `NeoDefaultsService.isColumnReferencingParentTab` **todavía no**
  consumen `McpParentScope`. Son las otras dos implementaciones del mismo recorrido (§2.8) y su
  unificación era parte de F1; quedó fuera porque están en `schemaforge/` y las lee la API REST,
  así que tocarlas cambia comportamiento fuera del MCP — merece su propio paso con tests propios.
- Tests de `McpParentScope` contra un `AD_Tab` real: la clasificación en 4 categorías necesita DAL
  y `KernelUtils`, así que va como test de integración, no unitario.


### Lo que quedó commiteado

`1047cc55` — *Feature ETP-5184: Require the parent key on MCP child entities*, 24 archivos,
+3455 −54. Cubre F0, F1, F2, F3 y las 16 configs. **F4 y F5 no están ahí.**

HEAD verificado compilando desde `git archive HEAD src/com/etendoerp/go/mcp` a un
directorio limpio (39 archivos, nada del working tree), javac 17. La rama tenía **dos**
breaks antes de este commit, los dos introducidos por `69ddc1be`, que commiteó código de
esta sesión sin sus dependencias: `McpParentScope` sin trackear, y el call site de 5
argumentos de `resolveParentFK` sin su callee. Los dos los cierra `1047cc55`.

Los tests (`src-test/`) no los compila `smartbuild` — sólo `src`. Los cubre
`.githooks/pre-push:412`, que corre `./gradlew test --tests "com.etendoerp.go.*"` con el
classpath real y agrega los conteos desde `build/test-results/test`. Está gateado por
relevancia (`RELEVANCE_RE_JUNIT` incluye `^src/`, `^src-test/` y `^src-db/`), no por
cambio de archivo, así que un push que toque sólo el sourcedata de `MCP_CONFIG` igual
corre el suite. El 67/67 local es evidencia de consistencia interna con classpath armado
a mano, **no** de que compile bajo el real; eso lo dice el push.

### Corrección al censo de §12

El `replace(columnname,'_ID','')` de las consultas de §12 era **case-sensitive**, y varias
FK terminan en `_Id`. Eso reportó como "sin FK al padre" a tres entidades que sí la
tienen y resuelven solas: `purchase-order/paymentDetails`,
`return-from-customer/paymentInDetails`, `return-to-vendor/paymentOutDetails`. El número
real es **8**, no 11. Usar `regexp_replace(columnname,'_ID$','','i')`.

### `parent.path` se descartó; entró `mode: "unparented"`

Se evaluó un `parent.path` (cadena de FKs de dos saltos) para las hijas GET-only sin
vínculo. **No servía para ninguna.** En `sii-monitor` la cabecera es `aeatsii_config`
—config de SII por organización— y las hijas son `C_Invoice`: no hay FK en ninguna
dirección, no hay path de dos saltos, y las pestañas no tienen `whereclause` ni
`linkcolumn`, así que el scoping lo hace la UI fuera del diccionario. `Fact_Acct` apunta a
su documento con `Record_ID` + `AD_Table_ID`, un puntero polimórfico en texto.

Entró `mode: "unparented"`: declara que no hay vínculo y que las lecturas son globales,
con `reason` obligatoria. Sólo por declaración —inferirlo destruiría el gate, porque *"no
encontré el vínculo"* tiene que retener la entidad— y **rechaza la entidad si anuncia
escritura**, porque un registro que no puede nombrar a su padre no se puede crear sin
generar un huérfano. Ese chequeo se auto-repara: los flags viven en `ETGO_SF_ENTITY`, cuyo
cambio invalida el scope cacheado.

### El nombre de la propiedad DAL no es `mcpConfig`

El generador pone en mayúsculas el acrónimo inicial: `MCP_Config` → **`mCPConfig`**.
Leerlo mal es el único fallo que este código no puede reportar, porque una propiedad
inexistente es indistinguible de un registro sin configurar: todos los payloads se
ignoraban en silencio. La constante sale de `SFEntity.PROPERTY_MCPCONFIG`, así que un
rename futuro rompe el build en vez de vaciar la configuración.

### Restricciones para F4, medidas y no argumentadas

1. **`neo_batch` necesita respuesta propia.** El FK todavía es `$ref:<opId>` durante el
   pre-pass y `BatchService` despacha cada op al camino de create compartido sin pasar por
   `handleCreate`. Un gate escrito sólo ahí o se saltea batch entero, o rechaza todos los
   hijos batcheados legítimos. Va donde se resuelve el ref, no en el borde del tool.
   *(ETP-5184-sales-order-issues)*

2. **El rechazo tiene que ser un envelope explícito, nunca un 200 sin `url`.** ETP-5200
   devuelve el link del registro al final de `handleCreate`; un gate que rechaza antes del
   insert no llega ahí, lo cual es correcto —no se creó nada— pero un agente que recibe un
   éxito sin `url` concluye que el deployment no tiene app base URL configurada y **deja de
   pedir links**. `ERROR_PARENT_REQUIRED` ya lo cubre; queda anotado para que siga siendo
   deliberado. *(ETP-5184-images)*

3. **Las dos mitades de D-7 fallan por separado y ahora son medibles.** Diferencial de
   `C_GetTax`, mismo tenant, producto, cliente y fecha:

   | `shipTo` | resultado |
   |---|---|
   | dirección | `Entregas IVA 21%` |
   | `NULL` | `Arrendamientos 21% -19%R` |

   La mitad de los callouts cerró con `4389f0f8`. La de los defaults persistidos
   —`businessPartner`, `partnerAddress`, `warehouse`, `orderDate`— es de F4, y se verifica
   contra este diferencial en vez de contra un argumento general.
   *(ETP-5184-sales-order-issues)*

4. **Conflicto cross-ticket en `docs`, y F4 no puede salir sin resolverlo.** `ddf2994`
   (ETP-4918, ya commiteado) documenta que en `neo_create` hay que mandar **el FK del
   padre**, no `parentId`. Eso es correcto hoy y **queda mal el día que entre F4**. El
   arreglo es quirúrgico, no una revisión de la sección entera: la otra mitad de `ddf2994`
   —que `neo_defaults` necesita `parentId`— no sólo sigue siendo verdad, ahora está
   **obligada por código** (el gate de `handleDefaults`). O sea que hay que cambiar la
   guidance de `neo_create` y dejar la de `neo_defaults` intacta.

### Las 4 entidades de escritura sin FK al padre

`payment-in/finPaymentScheduleDetail`, `payment-out/lines`,
`product/transactionAdjustments`, `return-from-customer/relatedServices`. Decisión del
usuario: dejarlas como están. Consecuencia asumida: **F4 las retiene**, resuelven a
`UNRESOLVABLE`, y `neo_discover` las lista con `configError` diciendo por qué, en vez de
seguir ofreciendo un `create` que produce huérfanos. La decisión se toma cuando el gate
las saque a la luz, con el motivo escrito.


---

## 14.10 Las recetas de `docs` enseñaban la forma rota

Hallazgo del 2026-09-07, independiente del código y con valor propio.

`docs(topic:"create sales order")` devolvía, en `agentic/mcp/index.md:460` y
`agentic/agent-manual.md:219`:

```json
"fields": { "salesOrder": "<order-header-id>", "product": "<product-id>",
            "orderedQuantity": 5, "unitPrice": 12.50, "tax": "<tax-id>" }
```

Tres problemas en cinco líneas:

1. Usa `salesOrder`, la forma que **no** hace que el servidor lea la cabecera.
2. Pasa `unitPrice` a mano — lo que **tapaba** el bug del precio (§14.8).
3. Pasa `tax` a mano — lo que **tapaba** el bug del impuesto (§14.3).

Es la explicación de por qué ninguno de los dos bugs se detectó antes: si seguís la receta al pie de
la letra, entregás vos el precio y el impuesto, y el agente nunca ejercita el camino de derivación.

**Arreglado** en las dos recetas: `parentId` en lugar de `salesOrder`, sin `unitPrice` ni `tax`, más
un párrafo explicando qué hereda la línea del padre y cuándo sí hace falta pasar un precio (lista
con impuesto incluido, u override deliberado).

⚠️ El repo `etendo-go-docs` estaba en la rama `feature/ETP-4918`. Los cambios quedaron **sin
commitear** para no mezclar tickets; hay que moverlos a una rama `feature/ETP-5184` propia.
