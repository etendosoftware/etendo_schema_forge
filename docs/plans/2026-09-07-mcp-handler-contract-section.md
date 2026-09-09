# Plan (propuesta) — Sección `handlerContract` de `MCP_CONFIG`: reconciliar el contrato que el MCP publica con el que el handler implementa

**Fecha:** 2026-09-07
**Rama de trabajo:** `feature/ETP-5184`
**Verificado contra:** código de `modules/com.etendoerp.go` en `feature/ETP-5184` y BD `etendo31ago` (mediciones de §3)
**Autor del análisis:** Claude (a pedido de Valentín)
**Estado:** **NO IMPLEMENTADO — sólo propuesta.** Ver §8 (por qué se difirió) y §9 (qué se hizo en su lugar).
**Ticket:** [ETP-5184](https://etendoproject.atlassian.net/browse/ETP-5184)
**Precedente de forma y registración:** secciones `parent` (§6 de `neo-headless.md`) y `fields` (§4.12.6)

---

## 1. Resumen ejecutivo

`neo_schema` deriva el contrato de escritura de una entidad **del diccionario AD**: recorre las
`AD_Column` de la tabla de la pestaña, decide qué es obligatorio, qué tiene selector y qué es
opcional. Para las entidades servidas por CRUD genérico ese contrato es exacto.

Para una entidad con `JAVA_QUALIFIER`, en cambio, un `NeoHandler` puede implementar **otro**
contrato, y hoy no existe ninguna forma declarativa de decirlo. El resultado es un catch-22
verificado en vivo: el schema exige un campo que el handler produce él mismo, el validador
genérico previo a la escritura rechaza el payload que lo omite, y los campos que el handler
realmente lee no aparecen en ninguna parte del schema de esa entidad.

Esta propuesta añade una sección de `MCP_CONFIG` a nivel entidad, `handlerContract`, para que el
schema pueda decir la verdad sobre esos casos sin tocar el diccionario AD ni el contrato REST/React
compartido.

---

## 2. El caso que lo motiva — `contacts` / `locationAddress`

Sesión real del 2026-09-07 contra el MCP local. Tres intentos de crear una dirección fallaron
**antes** de leer el código del handler; ninguno de los tres errores era autocorregible con la
información que el MCP publica.

### 2.1 El schema anuncia un contrato que el handler no implementa

`neo_schema(spec:"contacts", entity:"locationAddress", view:"create")` lista `locationAddress`
(columna `C_Location_ID`) como **required**, con selector de tipo Search — o sea: "buscá una
ubicación existente y mandame su id".

`ContactsLocationAddressHandler.handleCreate` hace lo contrario: crea él mismo el `C_Location`
(`OBProvider.getInstance().get(Location.class)`), le aplica los campos de dirección del body y
**descarta** cualquier id recibido. Prueba: un create pasando `C931E92B…` devolvió una ubicación
nueva, `7D6571A8…`.

### 2.2 El validador previo exige un campo que el handler produce

`McpToolRouter` (línea ~630) llama a `McpWriteRequestSupport.validateMandatoryFields(...)` **antes**
de que el handler intervenga. Ese validador recorre `adTab.getTable().getADColumnList()` y no sabe
nada de handlers, así que omitir `locationAddress` da un **422** con el campo en `missing`.

Combinado con §2.1 queda el catch-22:

| Payload | Resultado |
|---|---|
| Sin `locationAddress` | **422** del validador genérico (campo obligatorio faltante) |
| Con `locationAddress` y sin campos de dirección | **500**, violación de constraint |
| Con un id cualquiera **más** los campos de dirección | **201** — el id se descarta |

Sólo funciona la tercera fila, y nada en el contrato legible por máquina lo dice.

### 2.3 Los campos que el handler lee no están en su schema

`applyGeoLocFields` lee `addressLine1`, `addressLine2`, `cityName`, `postalCode`, `country`,
`region` y `regionName`. Todos pertenecen a `C_Location`, **otra tabla**: la entidad
`locationAddress` está montada sobre `AD_Tab` 222 (`C_BPartner_Location`), de modo que esos campos
no aparecen en su schema y un agente no tiene forma de descubrirlos. Existen, sí, en la entidad
`bp-location/bpLocation` — que es exactamente el puntero que `writableVia` ya sabe expresar, pero
en la dirección contraria a la que hace falta acá.

---

## 3. Magnitud — cuántas entidades pueden estar en esta situación

Medido contra la BD `etendo31ago`:

| Métrica | Valor |
|---|---|
| Entidades activas en `ETGO_SF_ENTITY` | **287** |
| De ellas, con `JAVA_QUALIFIER` (handler que **puede** sobreescribir el contrato) | **92** (32 %) |
| Specs con `AGENT_PROMPT` poblado | **2** |
| Entidades con `AGENT_PROMPT` poblado | **2** |
| Campos con `AGENT_PROMPT` poblado | **12** |

Las 92 no están todas rotas: un handler puede limitarse a hooks de post-proceso sin cambiar el
contrato. Pero son 92 entidades donde el contrato publicado **no está garantizado**, y hoy el único
canal para avisarlo es prosa curada — poblada en 2 de 287 entidades y 12 campos. Es decir: la
cobertura actual del mecanismo de aviso es anecdótica frente a la superficie de riesgo.

---

## 4. La sección propuesta

Nivel **entidad**, merge `REPLACE` (igual que `parent` y `fields`).

```json
{
  "handlerContract": {
    "reason": "ContactsLocationAddressHandler creates the C_Location + C_BPartner_Location pair itself.",
    "ownedFields": ["locationAddress"],
    "acceptsFrom": {"spec": "bp-location", "entity": "bpLocation"}
  }
}
```

### 4.1 `ownedFields`

Los campos que **produce el handler**, no el agente. Dos efectos, y hacen falta los dos:

1. `view:"create"` los quita de `required` (y de `optional`: no son del agente en ningún grado).
2. `McpWriteRequestSupport.validateMandatoryFields` los **saltea**.

Con sólo el primero el agente obedecería al schema, omitiría el campo y cobraría el 422 del §2.2;
con sólo el segundo el schema seguiría mintiendo. Juntos, el catch-22 desaparece: el agente manda
los campos de dirección y nada más.

### 4.2 `acceptsFrom`

Puntero a la entidad **dueña de los campos que el handler sí lee**. `view:"create"` los publica
como extras aceptados, resolviéndolos del schema de esa otra entidad.

Es el `writableVia` existente **en espejo**: `writableVia` dice "este campo es read-only acá, se
escribe allá"; `acceptsFrom` dice "esta entidad acepta, además de los suyos, los campos de allá".
Misma forma `{spec, entity}`, misma semántica de puntero, dirección opuesta.

### 4.3 `reason`

**Obligatorio y no vacío**, igual que en `parent` (modo `unparented` / `optionalFor`) y en `fields`.
El criterio es el mismo que ya rige esa columna: toda fila que afirma "el contrato derivado del
diccionario es incorrecto acá" tiene que ser auditable en la fila que lo afirma. Un cuerpo vacío es
error de validación, no un valor.

### 4.4 Registración

Una clase `McpHandlerContractSection` con su `declaration()` (`ALLOWED_KEYS`,
`McpConfigSection.Merge.REPLACE`, validador) más **una línea** en
`McpConfigSections.ensureRegistered()`. Sin cambios de modelo, sin metadata AD, sin tocar el
resolver ni la caché — exactamente el costo que `parent` y `fields` pagaron.

Vale recordar por qué la registración va ahí y no en un bloque estático: `McpEntityConfig` reporta
una sección desconocida como **error** (para que un nombre mal escrito no se lea como
"no configurado"), así que toda sección debe estar registrada antes del primer parseo, no antes de
que su feature se use.

---

## 5. Qué NO hace

- **No cambia permisos.** Igual que `fields`, reclasifica lo que se *ofrece*, no lo que se
  *permite*. El DAL y `NeoCrudHandler` siguen decidiendo si el rol puede escribir la columna.
- **No inspecciona el handler.** Es configuración declarativa: nadie va a leer bytecode para
  adivinar qué campos posee un `NeoHandler`. La afirmación la hace quien escribe la fila, y por eso
  `reason` es obligatorio.
- **No reemplaza `AGENT_PROMPT`.** El prompt sigue siendo el lugar de la prosa que ninguna clave
  estructurada captura ("mandá los campos de dirección en vez del id"). `handlerContract` es lo que
  el contrato legible por máquina puede afirmar por sí solo.

---

## 6. Riesgo principal

`ownedFields` implica un cambio en **`validateMandatoryFields`**, que es la compuerta de escritura
de *todo* el MCP: la atraviesan `neo_create` y `neo_update` de las 287 entidades. Un salteo mal
resuelto ahí no falla ruidosamente — deja pasar un payload incompleto y el error reaparece más
abajo como violación de constraint, que es exactamente la clase de error no autocorregible que esta
propuesta busca eliminar.

Esa compuerta hoy no tiene ningún consumidor de `MCP_CONFIG`. Sería el primero.

---

## 7. Alcance de implementación (cuando se tome)

1. `McpHandlerContractSection` + una línea en `McpConfigSections.ensureRegistered()`.
2. `McpSchemaCreateView.buildResponse` — excluir `ownedFields`; publicar los extras de
   `acceptsFrom`.
3. `McpWriteRequestSupport.validateMandatoryFields` — recibir el conjunto `ownedFields` y saltearlo.
4. Poblar la fila de `ETGO_SF_ENTITY.MCP_CONFIG` de `contacts/locationAddress` como primer caso.
5. Documentar la sección en la tabla de secciones registradas de §4.12.6 de `neo-headless.md`.
6. Tests (delegados a Tester por regla de proyecto): sección válida/ inválida, `reason` ausente,
   `ownedFields` fuera de `required`, `validateMandatoryFields` salteando el campo poseído,
   `acceptsFrom` resolviendo contra otra entidad, y una entidad **sin** la sección devolviendo
   byte por byte lo de antes.

---

## 8. Por qué se difirió

Por el §6: toca `validateMandatoryFields`, la compuerta de escritura de todo el MCP. Eso merece su
propio ciclo DEV → REVIEW → QA, con sus tests de no-regresión sobre entidades que no configuran la
sección, y no entra como agregado de una tarea cuyo objetivo era desbloquear la creación de
direcciones.

---

## 9. Qué se hizo en su lugar (mitigación inmediata, bajo riesgo)

Ambas cosas ya están en `feature/ETP-5184`:

1. **`ContactsLocationAddressHandler.applyGeoLocFields` guarda la provincia como texto libre**
   cuando el país no declara regiones (`C_Country.HasRegion = 'N'` y sin filas `C_Region`), en
   `C_Location.RegionName`. Antes toda provincia argentina se rechazaba con
   `500 - The region "Córdoba" does not exist in Argentina.` La ruta estricta se conserva donde
   significa algo: un país que sí define regiones sigue rechazando un nombre desconocido.
2. **`AGENT_PROMPT` de entidad ahora se emite también en `neo_schema`**, incluida
   `view:"create"` — antes sólo salía por `neo_discover`, que es el catálogo que el agente lee una
   vez al principio de la sesión. Y se pobló el `AGENT_PROMPT` del campo `locationAddress`
   explicando en prosa el contrato real del handler.

La (2) es la mitigación del mismo problema que esta propuesta resuelve estructuralmente: hoy el
aviso es prosa que el agente puede leer; con `handlerContract` sería el contrato el que ya no
mentiría.
