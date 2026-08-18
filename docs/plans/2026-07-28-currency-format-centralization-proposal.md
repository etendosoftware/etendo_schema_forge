# Propuesta: centralizar el formato de moneda (separadores) entre navegador y jsreport

**Estado:** propuesta para discusión con el equipo de plataforma — no implementado.
**Contexto de origen:** ETP-4314 (unificación de representación de moneda en Etendo Go).

## 1. Qué pidió ETP-4314

El ticket pide un estándar **fijo** para toda la app: símbolo real de moneda (€, $, etc., nunca el
código ISO como texto), formato español (`1.250,00 €` — separador de miles con punto, decimal con
coma, símbolo al final). Es importante remarcar: el formato numérico (separadores) es fijo para toda
la instalación, independientemente de la moneda del documento — solo el símbolo cambia según la
moneda real (ver caso de prueba 5 del ticket). No es "usar la moneda/locale de la organización", es
"imponer un estándar para Etendo Go".

Durante la resolución del ticket se encontró que no existía una única función de formateo de moneda
en la app — había más de 20 implementaciones duplicadas repartidas por el frontend. El trabajo de
ETP-4314 consistió en centralizarlas.

## 2. Por qué terminamos con DOS implementaciones centralizadas (no una sola)

Etendo Go renderiza importes en dos contextos completamente distintos, con restricciones técnicas
que impiden compartir literalmente una sola función entre ambos:

### 2.1 Navegador (React / `tools/app-shell`)

Corre client-side, compilado con Vite. En producción se despliega en un contenedor dedicado,
separado del backend Java. Puede importar y ejecutar cualquier módulo JS del propio repo sin
restricciones — es el caso "normal".

**Fuente canónica centralizada acá:** `tools/app-shell/src/lib/formatCurrency.js`
(`formatCurrency()` / `getCurrencySymbol()`). Hoy usa `Intl.NumberFormat('es-ES', {..., useGrouping:
true})` para el número, y `Intl` con `currencyDisplay: 'narrowSymbol'` para resolver el símbolo real
de cada código ISO. Todo componente del navegador (ventanas, dashboard, modales de pago, etc.) fue
migrado para importar y usar esta función — cero duplicación dentro de este dominio.

### 2.2 jsreport (generación de PDF/Excel de reportes y documentos)

jsreport es un **producto de terceros que corre en su propio contenedor Docker**
(`modules/com.etendoerp.go/compose/`), con su propio Node y su propio filesystem. El código de este
repo (`tools/app-shell/vite-plugins/report-api.js`) arma un payload y se lo manda por HTTP
(`fetch(JSREPORT_URL + '/api/report', {...})`); jsreport lo recibe, compila el template y devuelve el
archivo. **No hay ningún mecanismo de import/require entre los dos procesos** — jsreport nunca puede
ejecutar código de nuestro repo directamente, solo recibe strings.

En particular, los *helpers* de Handlebars que usan los templates (`formatCurrency`, `formatNumber`,
etc.) viajan como un **string de código fuente** dentro del payload HTTP — jsreport lo evalúa con su
propio motor, aislado del nuestro. Por eso, la única forma de que jsreport tenga una función
`formatCurrency` es **serializar código JS puro, sin dependencias de Node ni del resto del repo**, y
mandarlo como texto.

**Fuente canónica centralizada acá:** `templates/reports/helpers/report-html-helpers.js`
(`createReportHelpers()` / `buildJsreportHelpersString()`). Esta función:
- No tiene ningún `import`/`require` (confirmado — debe ser 100% autocontenida para poder
  serializarse).
- Implementa su propio agrupamiento de miles **manualmente** (función `__groupEsEs`, vía `toFixed` +
  regex), sin usar `Intl.NumberFormat`, porque el contenedor de jsreport corre una versión de
  Node/ICU/CLDR desactualizada que tiene un bug confirmado: `Intl.NumberFormat('es-ES',
  {useGrouping:true})` pierde el separador de miles específicamente en el rango 1.000-9.999 (se probó
  contra 4 imágenes oficiales de Node en Docker, el bug desaparece a partir de ICU ≥78 / Node ≥20; el
  contenedor real corre Node 18.20.4 / ICU 74.2).
- Es usada tanto por el path de reportes (`report-api.js`, los ~16 reportes de Categoría D) como por
  los PDFs de documentos individuales (`documentPdf.js`, `use349Pdf.js`, `ReportDrawer.jsx`) — dentro
  de este dominio también quedó centralizado, cero duplicación.

### 2.3 Resumen del porqué

| | Navegador | jsreport |
|---|---|---|
| Proceso | El mismo que sirve la SPA | Contenedor Docker aparte, producto de terceros |
| Puede importar módulos del repo | Sí | No — solo recibe strings por HTTP |
| Mecanismo de formateo | `Intl.NumberFormat` (funciona bien en este entorno) | Algoritmo manual sin `Intl` (workaround al bug de ICU del contenedor) |
| Fuente canónica | `formatCurrency.js` | `report-html-helpers.js` |

No es una decisión de diseño arbitraria — es la consecuencia directa de que un lado puede ejecutar
módulos del repo y el otro solo puede recibir y evaluar un string de código aislado, sumado a un bug
de infraestructura (ICU desactualizado) que obligó a abandonar `Intl` en ese segundo dominio.

## 3. El problema que queda

Con la solución actual, **ambos dominios están internamente centralizados** (una sola función por
dominio, sin duplicación), pero el estándar en sí (separador de miles `.`, decimal `,`, locale
es-ES) está **hardcodeado por separado en cada uno de los dos archivos fuente**. Si mañana se decide
cambiar el estándar (por ejemplo, para una instalación de Etendo Go orientada a otro mercado), hay que
tocar y sincronizar **dos lugares distintos** — exactamente el tipo de inconsistencia que ETP-4314
buscó eliminar, solo que un nivel más arriba (a nivel de "cuál es el estándar", no de "cada componente
lo implementa distinto").

## 4. Propuesta

Que el estándar (separadores de miles/decimales) viva en **un solo lugar de verdad, a nivel de
instancia de Etendo Go** (no por organización, no por moneda), y que ambos dominios lo consuman en
runtime en vez de tenerlo hardcodeado.

### 4.1 Por qué NO usar los mecanismos existentes de Etendo Classic

- **Configuración de moneda / `AD_Currency` / número-formato por cliente de Etendo Classic**
  (`LoginUtils.readNumberFormat()`, ya resuelto y cacheado hoy por `NeoSessionVarsCache` para
  callouts): se descartó porque ese mecanismo resuelve el formato **por cliente/organización**, y el
  ticket pide exactamente lo contrario — un estándar fijo, no dependiente de la organización o
  moneda del documento.
- **`AD_Preference`**: es el mecanismo estándar de Etendo para configuración, pero está diseñado para
  poder overridearse por cliente/organización/usuario. Usarlo acá reabriría la puerta a que alguien
  configure el estándar distinto para un cliente puntual sin darse cuenta de que rompe la consistencia
  global que el ticket buscó. Tampoco hay precedente de uso a nivel Sistema/Cliente-0 en
  `com.etendoerp.go` hoy (se revisó el código — los 3 usos existentes son todos por cliente/usuario
  específico).

### 4.2 Mecanismo propuesto: variable de entorno / `Openbravo.properties`

Es el patrón que Etendo Go **ya usa activamente** para este tipo de configuración a nivel de
instancia — no es una idea nueva, hay 7+ precedentes reales en el código
(`PublicUrlResolver.java`, `CorsUtils.java`, `JiraConfig.java`, `MixpanelNeoTelemetryConfig.java`,
`EmailProviderConfig.java`, `AppsServlet.java`, `OAuth2Servlet.java`), todos con el mismo fallback:
`System.getProperty(...)` → `OBPropertiesProvider.getOpenbravoProperties()` → `System.getenv(...)`.

El valor se define en `gradle.properties` (el archivo que ya edita el equipo de infra/ops para
configurar cualquier instancia), se propaga a `config/Openbravo.properties` vía la tarea `setup` del
plugin de Gradle de Etendo (mismo mecanismo que ya usan `bbdd.*`, `context.name`, etc. — confirmado
comparando ambos archivos en este checkout), y NEO Headless lo lee con el mismo patrón que los 7
ejemplos de arriba.

### 4.3 Cómo llega el valor a los dos dominios

Ni el navegador ni jsreport pueden leer `Openbravo.properties` directamente (no comparten proceso ni
filesystem con el backend Java), así que hace falta un endpoint nuevo en NEO Headless que exponga el
valor ya resuelto:

```
GET /sws/neo/config  →  { "thousandsSeparator": ".", "decimalSeparator": "," }
```

(No existe hoy ningún endpoint de "bootstrap"/config general — se revisó el código, todos los
servlets actuales son CRUD de entidades o de features puntuales. Sería el primero de este tipo.)

**Navegador:** hoy no hay ningún fetch al backend después del login (se revisó `AuthContext.jsx` —
solo persiste la sesión en `localStorage`). Se agregaría un fetch a este endpoint justo después de
loguear, cacheado en memoria para el resto de la sesión, con fallback a los valores actuales
(`.`/`,`) si el fetch falla — nunca debe bloquear el render de la app. `formatCurrency.js` dejaría de
usar `Intl.NumberFormat` para el agrupamiento/decimal (pasaría a un algoritmo manual parametrizado,
similar al `__groupEsEs` que ya existe del lado jsreport) alimentado por este valor. La resolución del
símbolo de moneda (`getCurrencySymbol`, vía `Intl` + código ISO) no cambia — es un problema aparte de
los separadores.

**jsreport (`report-api.js`):** ya existe el precedente exacto — este archivo ya hace
`fetch(neoUrl, {headers: {Authorization: 'Bearer '+token}, ...})` contra NEO Headless para otros
propósitos. Se agregaría una llamada más a este mismo endpoint antes de armar el payload de cada
render, y el resultado se pasaría a `buildJsreportHelpersString(helpersCode, numberFormatOverride)`
(que ya tiene un parámetro pensado para overrides) para parametrizar `__groupEsEs` en vez de tener
`.`/`,` hardcodeados ahí.

### 4.4 Resiliencia

Si el endpoint no responde (caído, timeout, etc.), ambos lados caen al estándar actual (es-ES,
`.`/`,`) por default — un fallo de este config nunca debe romper el render de un importe.

## 5. Diagrama de flujo

```
gradle.properties
      │  (tarea setup del plugin Gradle)
      ▼
Openbravo.properties
      │  (OBPropertiesProvider, mismo patrón que Mixpanel/Email/Jira/CORS)
      ▼
NEO Headless (Java) ── nuevo endpoint GET /sws/neo/config ──┐
                                                              │
        ┌─────────────────────────────────────────────────────┤
        ▼                                                      ▼
  Navegador (fetch post-login,                      report-api.js (fetch server-side,
  cacheado, fallback a es-ES)                        antes de armar el payload jsreport)
        │                                                      │
        ▼                                                      ▼
  formatCurrency.js                              buildJsreportHelpersString()
  (agrupamiento manual                            (__groupEsEs parametrizado
   parametrizado por config)                       por config, en vez de hardcode)
```

## 5.bis Alternativa considerada: actualizar la imagen Docker de jsreport

Vale aclarar un matiz importante, porque a primera vista parecería que actualizando la imagen de
jsreport se podría haber unificado todo en una sola función (`formatCurrency()`) — **no es así**, y
vale la pena dejarlo explícito para esta charla con plataforma.

**Lo que SÍ se confirmó:** el algoritmo manual `__groupEsEs` (sin `Intl`) que usa
`report-html-helpers.js` existe específicamente como workaround de un bug real y confirmado en la
imagen Docker actual de jsreport (`jsreport/jsreport:4.7.0`, que trae **Node 18.20.4 / ICU 74.2 /
CLDR 44.1**). Se probó `Intl.NumberFormat('es-ES', {useGrouping:true}).format(1232)` en 4 imágenes
oficiales de Node en Docker:

| Imagen | Node | ICU | CLDR | Resultado |
|---|---|---|---|---|
| `node:18.20.4-alpine` (idéntica a la del contenedor jsreport real) | 18.20.4 | 74.2 | 44.1 | `1232,00` ❌ (sin separador) |
| `node:18-alpine` | 18.20.8 | 74.2 | 44.1 | `1232,00` ❌ |
| `node:20-alpine` | 20.20.2 | 78.2 | 48.0 | `1.232,00` ✅ |
| `node:22-alpine` | 22.23.1 | 78.2 | 48.0 | `1.232,00` ✅ |

El corte está exacto entre ICU 74.2/CLDR 44.1 (falla) e ICU 78.2/CLDR 48.0 (funciona). Si se
actualizara la imagen de jsreport a una variante con Node ≥20, `Intl.NumberFormat('es-ES',
{useGrouping:true})` volvería a funcionar correctamente ahí también, y `report-html-helpers.js`
podría dejar de necesitar el algoritmo manual — usaría `Intl` igual que `formatCurrency.js`.

**Lo que NO cambiaría ni con la imagen actualizada:** jsreport seguiría siendo un producto de
terceros corriendo en su propio contenedor Docker, aislado por HTTP, sin ningún mecanismo de
`import`/`require` hacia este repo (ver sección 2.2). Aunque ambos lados usaran `Intl.NumberFormat`
de la misma forma, **seguirían siendo dos implementaciones separadas** (una importada directo, otra
emitida como source text hardcodeado vía `JSREPORT_HELPER_SOURCES`) — no se llegaría a "una sola
función `formatCurrency()` para toda la app". Nota: `fn.toString()` está prohibido para esta
serialización — los identificadores de función/closure son locales al bundle y un build de
producción minificado los renombra, rompiendo el helper emitido en runtime (ver el fix de
minification-safety en `report-html-helpers.js`). La actualización de imagen resolvería el bug de
agrupamiento y permitiría que
ambos lados usen el mismo *método* (`Intl`), pero no elimina la necesidad de mantener dos fuentes
canónicas — el problema de fondo que motiva esta propuesta (el *estándar* hardcodeado en dos lugares)
seguiría existiendo igual.

**Por qué no se persiguió como fix principal en ETP-4314:** actualizar la imagen Docker de jsreport
es un cambio de infraestructura en el OTRO repo (`com.etendoerp.go`), con riesgo de romper el propio
jsreport o su Chromium embebido para PDF, y afecta el path de render de TODOS los reportes ya
existentes, no solo los de moneda. El algoritmo manual, en cambio, es autocontenido en este repo y
queda inmune a cualquier versión de Node/ICU que corra la imagen de jsreport en el futuro (para bien
o para mal). Queda como una posible mejora de infraestructura a evaluar aparte con plataforma, pero
no resuelve por sí sola el problema que esta propuesta busca resolver.

## 6. Preguntas abiertas para plataforma

1. ¿El endpoint `GET /sws/neo/config` debería requerir autenticación (bearer token, como el resto de
   `/sws/neo/*`) o puede ser público dado que no expone datos sensibles, solo formato de UI?
2. ¿Vale la pena que este mismo endpoint sea el punto de partida de un "bootstrap config" más general
   a futuro (locale, feature flags, etc.), o conviene mantenerlo estrictamente acotado a este caso por
   ahora?
3. ¿Hay algún plan de multi-tenancy para Etendo Go donde distintas instalaciones ya necesiten valores
   de instancia distintos hoy, que debamos tener en cuenta para el diseño del endpoint (¿un solo valor
   global del deployment, o ya se previó algo más granular)?
4. ¿Este cambio requiere coordinar un release conjunto entre `com.etendoerp.go` y
   `etendo_schema_forge`, o el frontend puede tolerar el endpoint ausente (fallback) durante un
   período de transición?
