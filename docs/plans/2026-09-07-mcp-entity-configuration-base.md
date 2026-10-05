# Plan — Base de configuración para el MCP (`MCP_CONFIG`)

**Fecha:** 2026-09-07
**Estado:** **IMPLEMENTADO** (2026-09-07) en `feature/ETP-5184`. 21/21 tests pasando.
**Ticket:** **fase 0 de [ETP-5184](https://etendoproject.atlassian.net/browse/ETP-5184)** — no
lleva ticket propio (decisión del 2026-09-07). Este documento es la infraestructura; el gate
padre-hijo es su primer consumidor y vive en
`2026-09-04-mcp-child-entities-require-parent-key.md`.
**Decisión de Valentín (2026-09-07):** primero la base genérica, después los casos puntuales.

---

## 0. Qué se crea y qué no (para que no haya dudas)

**Se crea una (1) columna nueva, `MCP_CONFIG`, definida en las tres tablas de SchemaForge:**

| Tabla | Columna | Tipo |
|---|---|---|
| `ETGO_SF_SPEC` | `MCP_CONFIG` | texto (contiene JSON) |
| `ETGO_SF_ENTITY` | `MCP_CONFIG` | texto (contiene JSON) |
| `ETGO_SF_FIELD` | `MCP_CONFIG` | texto (contiene JSON) |

Es **un solo concepto** con tres definiciones, una por nivel. Eso es todo el cambio de modelo.

Decisión del 2026-09-07: se definen las tres de una vez, aunque el gate sólo use el nivel entidad,
para no pagar un segundo `update.database` cuando aparezca el primer consumidor a nivel spec o
field — que va a aparecer, porque `AGENT_PROMPT`, `VISIBILITY` e `ISBUSINESSCRITICAL` ya viven en
esos niveles.

- **No se crea ninguna otra columna.** Las opciones que necesita el gate
  (`field`, `entity`, `optionalFor`, `reason`, `mode`) **no son columnas**: son claves dentro del
  JSON. Ese es el punto del diseño.
- **No se toca ninguna columna existente.** Las siete de §1 son las que **ya están** hoy: son el
  argumento a favor de este diseño, no una lista de cosas a crear ni a migrar.

---

## 1. El problema: siete columnas que ya existen

Cada opción de comportamiento específica del MCP se resuelve hoy agregando **una columna nueva** a
una de las tablas de SchemaForge, con su `AD_Column`, su `AD_Field`, su `AD_Element` y su entrada
en el `.xml` del modelo. Así se llegó a siete:

| Tabla | Columna | Leída sólo desde `mcp/` |
|---|---|---|
| `ETGO_SF_SPEC` | `AGENT_PROMPT` | sí |
| `ETGO_SF_SPEC` | `SHOWINMCP` | sí, por definición |
| `ETGO_SF_ENTITY` | `AGENT_PROMPT` | sí — 3 archivos en `mcp/`, 0 en `schemaforge/` |
| `ETGO_SF_ENTITY` | `NAMED_FILTERS` | sí — 2 / 0 |
| `ETGO_SF_FIELD` | `AGENT_PROMPT` | sí |
| `ETGO_SF_FIELD` | `VISIBILITY` | sí — 1 / 0 |
| `ETGO_SF_FIELD` | `ISBUSINESSCRITICAL` | sí — 2 / 0 |

(`JAVA_QUALIFIER`, `SPEC_TYPE` e `ISREADONLY` **no** entran: las lee también `schemaforge/`, son
configuración de la API, no del MCP.)

Dos cosas que se leen de esa tabla:

1. **El costo marginal de cada opción nueva es alto** y es todo metadata: cambio de modelo,
   `AD_COLUMN.xml`, `AD_FIELD.xml`, `AD_ELEMENT.xml`, a veces `AD_REF_LIST.xml`, más el
   `update.database`. Para un flag que sólo lee el MCP.
2. **`AGENT_PROMPT` existe en las tres tablas.** Ya hay una noción de configuración MCP con
   granularidad spec → entity → field, resuelta a mano en cada consumidor
   (`McpSupportInternals`: *"Entity-level agent guidance, additive to the spec-level and per-field
   prompts"*). Esa resolución no está centralizada en ninguna parte.

El gate de ETP-5184 necesitaba tres opciones más. **Antes de agregar la octava, novena y décima
columna**, conviene tener el lugar donde vivan. Eso es todo lo que es esta base.

---

## 2. Propuesta

Una columna `MCP_CONFIG` de tipo texto, con JSON, en las tres tablas de SchemaForge:
`ETGO_SF_SPEC`, `ETGO_SF_ENTITY` y `ETGO_SF_FIELD`.

El nivel entidad es el único que el gate usa. Los otros dos quedan definidos y funcionando desde
el principio: el resolver aplica la precedencia `field` > `entity` > `spec` (§2.2) sin importar
cuántos niveles traigan contenido, así que una futura opción a nivel spec o field es sólo una
sección nueva — sin cambio de modelo.

**El patrón ya existe y funciona.** `NAMED_FILTERS` es una columna texto con JSON en
`ETGO_SF_ENTITY`, parseada únicamente por `McpNamedFilters`. `MCP_CONFIG` **no la reutiliza** — son
cosas distintas — pero prueba que el patrón está aceptado en este módulo.

**La API REST/headless no lee `MCP_CONFIG`.** Es la propiedad central de este diseño: cualquier
cosa que se configure acá afecta al MCP y a nada más.

### 2.1 Forma del JSON: secciones con nombre

```json
{
  "parent":     { "...": "..." },
  "pagination": { "...": "..." },
  "hints":      { "...": "..." }
}
```

El objeto raíz es un mapa de **secciones**. Cada consumidor del MCP es dueño de una sección y de
su esquema interno. Nadie lee claves de la sección de otro.

Eso es lo que hace que la base sirva: una opción nueva es una clave nueva dentro de una sección
existente, o una sección nueva. **Cero cambios de modelo, cero metadata AD.**

### 2.2 `McpEntityConfig`: el resolver

Clase nueva en `com/etendoerp/go/mcp/`. Responsabilidades:

| | |
|---|---|
| **Parsear** | el texto de la columna a `JSONObject`, una vez, con caché por id de registro (§2.3) |
| **Resolver con precedencia** | `field` > `entity` > `spec`. Una sección definida en el field gana sobre la del entity, que gana sobre la del spec |
| **Validar** | contra el validador que registró el dueño de cada sección (§2.5) |
| **Reportar** | secciones desconocidas y claves desconocidas dentro de una sección conocida |

La precedencia formaliza lo que `AGENT_PROMPT` ya hace a mano en tres consumidores distintos.

**Semántica de la precedencia — DECIDIDO (2026-09-07): reemplazo, con opt-in aditivo.**

Por defecto **el nivel más específico gana** y reemplaza al de arriba, que es lo que necesita
`parent`: una entidad declara su padre y no hay nada que acumular desde el spec.

Una sección que necesite **acumular** los tres niveles lo declara en su registro (§2.5). El caso
real ya existe: `AGENT_PROMPT` concatena spec + entity + field en lugar de reemplazar. Si alguna
vez se migra a una sección de `MCP_CONFIG`, la declarará aditiva y no habrá que reabrir el
mecanismo.

No se fuerza una sola regla para todas las secciones, precisamente porque ya se conocen los dos
comportamientos en uso.

### 2.3 Caché: dos niveles, con TTL de inactividad

**Guava ya está disponible y el módulo ya lo usa.** `NeoSessionVarsCache` y
`FinancialAccountCountrySupport` construyen `com.google.common.cache.Cache` con `CacheBuilder`. No
hay que traer dependencia nueva.

Pero los dos existentes usan `expireAfterWrite`, y para esto **hace falta `expireAfterAccess`**:

| | Qué hace | Sirve para "limpiarse en bajo uso" |
|---|---|---|
| `expireAfterWrite(N)` | expira N después de cargarse, **aunque se esté usando** | no — recarga periódica sí o sí |
| `expireAfterAccess(N)` | expira N después del **último acceso** | **sí** — si no se usa, se libera; si se usa, se queda |

#### 2.3.1 Dos cachés, porque tienen ciclos de vida distintos

**(a) `MCP_CONFIG` parseado** — clave: id del registro (`ETGO_SF_ENTITY_ID`, etc.).
Costo evitado: parsear el JSON. Barato por llamada pero muy frecuente.
Cambia cuando **un usuario edita la configuración**, o sea en cualquier momento.

```java
CacheBuilder.newBuilder()
    .maximumSize(500)                              // 160 entidades expuestas hoy; holgado para 3 niveles
    .expireAfterAccess(30, TimeUnit.MINUTES)       // se limpia en bajo uso
    .expireAfterWrite(2, TimeUnit.HOURS)           // techo de frescura, ver 2.3.2
    .recordStats()
    .build();
```

**(b) Jerarquía resuelta** — clave: `AD_Tab.id`. Es la que consume `McpParentScope`.
Costo evitado: `KernelUtils.getParentTab()`, que ejecuta **una query SQL** vía `KernelUtilsData`,
más la resolución de propiedades DAL y la elección de la FK. **Esta es la caché que importa.**
Cambia sólo con el diccionario de aplicación, o sea con un `update.database` — que reinicia Tomcat.

```java
CacheBuilder.newBuilder()
    .maximumSize(500)
    .expireAfterAccess(2, TimeUnit.HOURS)          // TTL largo: el AD no cambia en caliente
    .recordStats()
    .build();
```

Separarlas es lo que permite darle a la del AD un TTL largo sin arriesgar servir configuración
vieja: lo que un usuario edita es (a), no (b). Etendo ya hace esta distinción con
`ApplicationDictionaryCachedStructures`, que cachea los `Tab` por la misma razón.

#### 2.3.2 Corrección al editar la configuración

Con `expireAfterAccess` solo, una entrada consultada seguido **nunca se renueva**: si alguien edita
`MCP_CONFIG` en la ventana, el cambio no se ve hasta que la entidad deje de usarse 30 minutos. Para
una config que puede estar habilitando o deshabilitando una restricción, eso no alcanza.

Dos mecanismos, y hacen falta los dos:

1. **Invalidación por evento.** Un `EntityPersistenceEventObserver` sobre `SFSpec`, `SFEntity` y
   `SFField` que invalide la entrada de ese id en `on(Update|Save|Delete)`. Es el mecanismo
   correcto en Etendo y da corrección inmediata: se edita, se guarda, la próxima llamada lee lo
   nuevo.
2. **`expireAfterWrite` como red.** El observer sólo dispara si el cambio pasa por el DAL. Un
   import de dataset, un modulescript o un `UPDATE` directo lo saltean. El techo de 2 horas acota
   cuánto puede quedar vieja una entrada en ese caso.

El observer es la corrección; el `expireAfterWrite` es el seguro.

#### 2.3.3 Nada que dependa de `OBContext` entra en la caché

Es el error clásico de una caché estática en Etendo, y acá hay que ser explícito porque una fuga
cross-tenant sería grave: **la clave es siempre un id de registro o de `AD_Tab`**, nunca un nombre,
y **el valor no puede depender del rol, del cliente ni de la organización de la sesión**.

Las dos cachés cumplen: el `MCP_CONFIG` de un registro es el mismo para cualquiera que pueda
leerlo, y la jerarquía de un `AD_Tab` es dato del diccionario, igual para todos. Si alguna sección
futura necesitara resolver algo dependiente del rol, **no va acá** — o la clave incluye el rol.

`develop` acaba de incorporar `TenantOwnership` / `TenantIsolationPolicy`; conviene que quien
implemente esto lea esas clases antes de tocar la caché.

#### 2.3.4 Observabilidad

`recordStats()` en las dos, y un log de debug con hit rate y tamaño. Sin eso no hay forma de saber
si el TTL elegido es razonable, y los números de arriba son estimaciones, no mediciones. → duda
**Q5**.

### 2.4 Fallo ruidoso: el requisito no negociable

`McpNamedFilters` dice en su javadoc: *"A blank/malformed payload yields an empty map (never null)
so callers degrade gracefully."* Degradar en silencio está bien cuando lo que se pierde es una
comodidad.

**`MCP_CONFIG` tiene que hacer lo contrario.** Acá la configuración puede estar controlando una
restricción de seguridad o de integridad: si un JSON malformado se lee como "sin configuración",
el efecto es **desactivar** esa restricción sin que nadie se entere. Es la misma forma que el bug
del filtro silencioso de `McpQuerySupport` (`log.warn` + `return`), que ya produjo una respuesta
incorrecta en producción.

Contrato:

| Situación | Resultado |
|---|---|
| JSON no parseable | **la entidad no se publica**; `neo_discover` la reporta con el error |
| Sección desconocida | **error**, no se ignora |
| Clave desconocida dentro de una sección conocida | **error** — es lo que evita que un `"parentField"` en lugar de `"field"` pase por configuración vacía |
| El validador de la sección falla | **la entidad no se publica**, con el mensaje del validador |
| Columna vacía o `null` | válido: significa "sin configuración", y cada consumidor define su default |

Sin esquema tipado, una clave mal escrita es indistinguible de una ausente. Reportar lo
desconocido es lo único que separa un typo de una decisión.

### 2.5 Contrato de extensión

Un consumidor registra su sección declarando tres cosas:

```java
McpEntityConfig.register(
    "parent",                       // nombre de la sección
    Set.of("field","entity","optionalFor","reason","mode"),  // claves admitidas
    Merge.REPLACE,                  // REPLACE (default) | ADDITIVE — ver §2.2
    ParentSection::validate);       // validador: devuelve los errores, vacío si está bien
```

El registro central es lo que permite validar y reportar sin que `McpEntityConfig` conozca la
semántica de ninguna sección.

### 2.6 Señal de configuración inválida

La idea original era un **modulescript** que recorriera todos los `MCP_CONFIG` al desplegar. **No
es viable**, y la razón es estructural: las secciones se registran **en runtime**, cuando arranca
el MCP. En el momento en que corre un modulescript (`update.database`) no hay ninguna sección
registrada, así que no habría contra qué validar un payload. Tampoco sirve un `init()` del
servlet: ahí no hay `OBContext` ni sesión DAL para leer las entidades.

Los dos canales que sí funcionan, ambos implementados:

1. **Log de warning en la primera lectura.** `McpEntityConfig.resolve` loguea
   `Unusable MCP_CONFIG: <problemas>` en cuanto detecta uno. Es el primer momento en que la
   respuesta es *conocible*, y el log del servidor es donde alguien mira después de desplegar.
2. **`neo_discover` por entidad.** La entidad se reporta con `configError: "<problemas>"` en lugar
   de servirse con su configuración ignorada. Un agente que consulta el catálogo ve exactamente
   qué está mal y en qué nivel.

### 2.7 Lo que esta base NO hace

**No migra las siete columnas existentes.** Sería otro breaking change y no aporta nada hoy. La
base y las columnas conviven. Si más adelante se quiere migrar, el camino es: leer la sección de
`MCP_CONFIG` y, si no está, caer a la columna — y recién ahí deprecar. Fuera de alcance.

**No define ninguna sección.** La base es el mecanismo. `parent` es el primer consumidor y llega
con ETP-5184.

---

## 3. Alcance y fases

| Fase | Contenido | Riesgo |
|---|---|---|
| **B1** | Columna `MCP_CONFIG` en las tres tablas + metadata AD | Bajo — aditivo, nadie la lee |
| **B2** | `McpEntityConfig`: parseo, precedencia, registro de secciones, validación ruidosa + tests | Bajo — sin consumidores, sin cambio observable |
| **B2b** | Las dos cachés de §2.3 + el `EntityPersistenceEventObserver` de invalidación + tests de expiración e invalidación | Bajo |
| **B3** | Validador de despliegue (§2.6) | Bajo |
| **B4** | Exponer en `neo_discover` los errores de configuración de una entidad no publicada | Bajo |

Las cuatro son aditivas y mergeables sin coordinación: **con cero secciones registradas, el
comportamiento del MCP es byte-por-byte el actual.**

Después, sobre esta base, ETP-5184 agrega la sección `parent` y sus ~20 filas de configuración.

---

## 4. Archivos

```
modules/com.etendoerp.go/src/com/etendoerp/go/mcp/
  McpEntityConfig.java          (NUEVO — B2: parseo, precedencia, registro, validación)
  McpConfigSection.java         (NUEVO — B2: el contrato que registra un consumidor)
  McpConfigCache.java           (NUEVO — B2b: las dos caches de §2.3, Guava CacheBuilder)
  McpConfigInvalidationObserver.java  (NUEVO — B2b: EntityPersistenceEventObserver sobre
                                       SFSpec/SFEntity/SFField)
  McpSupportInternals.java      B4: reportar el error de config en neo_discover

modules/com.etendoerp.go/src-db/database/
  model/tables/ETGO_SF_SPEC.xml     + MCP_CONFIG (text)   (B1)
  model/tables/ETGO_SF_ENTITY.xml   + MCP_CONFIG (text)   (B1)
  model/tables/ETGO_SF_FIELD.xml    + MCP_CONFIG (text)   (B1)
  sourcedata/AD_COLUMN.xml          + AD_FIELD.xml, AD_ELEMENT.xml  (B1)

modules/com.etendoerp.go/src-util/modulescript/  (o equivalente)
  ValidateMcpConfig.java        (NUEVO — B3)

modules/com.etendoerp.go/src-test/src/com/etendoerp/go/mcp/
  McpEntityConfigTest.java      (NUEVO — B2)
  McpConfigCacheTest.java       (NUEVO — B2b: expiracion, invalidacion por evento, aislamiento)
```

---

## 5. Dudas

~~**Q1 — ¿Qué tablas?**~~ **RESUELTO: las tres** (`ETGO_SF_SPEC`, `ETGO_SF_ENTITY`,
`ETGO_SF_FIELD`), definidas de una vez para no repetir el `update.database` más adelante.

~~**Q2 — ¿Ticket propio o fase 0 de ETP-5184?**~~ **RESUELTO: fase 0 de ETP-5184**, sin ticket
propio.

~~**Q3 — Semántica de la precedencia.**~~ **RESUELTO: reemplazo por defecto, con opt-in aditivo
declarado por la sección.**

~~**Q4 — ¿Nombre `MCP_CONFIG`?**~~ **RESUELTO: queda `MCP_CONFIG`.**

**Q5 — Los TTL de §2.3 son estimaciones.** 30 min de inactividad y 2 h de techo para la config;
2 h de inactividad para la jerarquía del AD. Están elegidos por criterio, no medidos. Con
`recordStats()` se pueden ajustar después de ver el hit rate real en una instancia con tráfico de
agentes. Si preferís arrancar más conservador (menos TTL, más recargas), es un cambio de una línea.


---

## 6. Estado de implementación (2026-09-07)

Implementado en `feature/ETP-5184`, dentro del módulo `com.etendoerp.go`.

### Código

| Archivo | Líneas | Qué es |
|---|---|---|
| `mcp/McpConfigSection.java` | 136 | El contrato que registra un consumidor: nombre, claves admitidas, modo de merge (`REPLACE`/`ADDITIVE`) y validador. Un validador que lanza excepción se reporta, no propaga |
| `mcp/McpConfigCache.java` | 205 | Las dos cachés Guava de §2.3, con `expireAfterAccess` + `invalidateConfig` / `invalidateAll` / `logStats` |
| `mcp/McpEntityConfig.java` | ~390 | El resolver: parseo cacheado, precedencia spec→entity→field, validación ruidosa, reporte de secciones y claves desconocidas |
| `mcp/McpConfigInvalidationObserver.java` | 131 | `EntityPersistenceEventObserver` sobre las 3 tablas SF; invalida al guardar |
| `mcp/McpSupportInternals.java` | +6 | `neo_discover` emite `configError` cuando la config de una entidad no es usable |

### Modelo

| Archivo | Cambio |
|---|---|
| `model/tables/ETGO_SF_SPEC.xml` | `+ MCP_CONFIG` (CLOB 4000) |
| `model/tables/ETGO_SF_ENTITY.xml` | `+ MCP_CONFIG` (CLOB 4000) |
| `model/tables/ETGO_SF_FIELD.xml` | `+ MCP_CONFIG` (CLOB 4000) |
| `sourcedata/AD_ELEMENT.xml` | `+ MCP Config` — `4ED3BE8DA1CB41E8B2F30504861C1E48`, compartido por las 3 columnas (igual que `Agent_Prompt`) |
| `sourcedata/AD_COLUMN.xml` | `+ 3` filas: spec `9AFDABC118C54C91A2394E8DF3C5F36B`, entity `ED4337ABDE5A452CB5D0A71D82857817`, field `2E6674721A3D4E0EAB887F9A2304530B` |

Reference 14 (Text), `FIELDLENGTH` 4000, no obligatoria, `DEVELOPMENTSTATUS` RE — el mismo perfil
que `NAMED_FILTERS`. `SEQNO`/`POSITION` tomados del siguiente libre de cada tabla, leídos de la BD.

### Tests

`McpEntityConfigTest` (11) + `McpConfigCacheTest` (10) = **21/21 verdes**.

Cubren: registro de secciones (nombre en blanco, argumentos nulos, idempotencia, nombre duplicado,
inmutabilidad de las claves), validación (aceptación, problemas verbatim, validador que lanza,
validador que devuelve `null`), memoización (una carga por clave, cachés independientes, claves
aisladas, clave nula sin compartir slot), invalidación (recarga, precisión, `invalidateAll`, id
inexistente) y fallo del loader (runtime sin envolver, fallo no cacheado, checked envuelto).

**No cubierto a propósito:** la expiración por tiempo. Los TTL de Guava leen el reloj real, así que
testearlos exigiría dormir minutos o inyectar un `Ticker` que sólo existe para el test. El TTL es
configuración; lo que importa para la corrección —que una edición se vea al instante— lo da la
invalidación, y eso sí está cubierto.

### Una desviación del diseño, y por qué

`McpEntityConfig` lee la columna con `record.get("mcpConfig")` en lugar del getter generado
`getMcpConfig()`. La columna y este código entran en la misma fase, y `src-gen` sólo crea el getter
después de un ciclo `update.database`/`export.database` — compilar contra él dejaría el árbol sin
buildear hasta que eso corra, en cada workspace y en CI. Leer la propiedad por nombre compila igual
y se comporta idéntico una vez que la columna existe. Con la columna ausente responde
"sin configuración", que es la lectura correcta y no una degradación silenciosa: sin columna no hay
dónde configurar nada, así que no hay configuración que perder. Cuando la columna esté en todos los
entornos, se puede colapsar al getter sin cambio de comportamiento.

### Pendiente antes de usarlo

1. **`update.database` + `export.database`** para materializar la columna y regenerar `src-gen`.
2. **Registrar la primera sección.** Con cero secciones registradas el comportamiento del MCP es
   byte-por-byte el actual — y **cualquier** `MCP_CONFIG` con contenido daría "sección desconocida",
   que es lo correcto: nadie debería escribir en la columna antes de que exista una sección que la
   lea. La primera es `parent`, en F1.
