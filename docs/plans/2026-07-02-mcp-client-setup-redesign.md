# Propuesta: Remodelación de `mcp-client-setup.md`

> **Estado:** borrador en iteración — este documento se va construyendo a medida que el usuario
> aporta feedback. No implementar nada todavía; es la fase de diseño de la propuesta.

## Problema

El documento actual (`docs/agentic-validation/mcp-client-setup.md`) está escrito **solo para la
CLI de Claude Code** (`claude mcp add`, `/mcp`, `claude mcp list`). Está organizado por
**ambiente** (LOCAL vs EXPERIMENTAL), pero no por **cliente MCP** (el programa que se conecta:
Claude Desktop, Claude Code, Cursor, Windsurf, VS Code + extensión MCP, un cliente HTTP genérico,
etc.).

Consecuencia: cualquier persona que use un cliente distinto a la CLI de Claude Code no tiene
instrucciones aplicables — tiene que traducir mentalmente `claude mcp add --transport http ...`
a lo que su cliente realmente necesita (JSON de config, UI de ajustes, etc.).

## Objetivo

Rediseñar la página/documento de instalación para que esté **orientada al cliente MCP**, no solo
al ambiente. Cada cliente soportado debe tener sus propias instrucciones concretas y copiables
(comando o snippet JSON), manteniendo la información de ambiente (LOCAL/EXPERIMENTAL) como un eje
ortogonal (ej. un selector/parámetro dentro de cada instrucción de cliente).

## Estado actual (referencia)

- Archivo: `docs/agentic-validation/mcp-client-setup.md`
- Estructura: LOCAL (con explicación profunda del problema de OAuth discovery URL-shape) →
  EXPERIMENTAL (casi sin fricción) → "¿a cuál estoy conectado?"
- Todo el contenido operativo asume la CLI de Claude Code.
- No existe una página UI (React) equivalente — es puramente un doc markdown.
- Doc relacionado de arquitectura: `docs/ops/cloudfront-alb-routing.md` (edge de producción/experimental).

## Alcance real: NO es `docs/agentic-validation/mcp-client-setup.md`

Ese markdown es doc **interno para devs de Schema Forge** (setup local de OAuth, troubleshooting de
discovery URLs) y queda **fuera de este plan**, tal cual está.

La pieza a rediseñar es la **página `ConnectionsLanding`** dentro de
`tools/app-shell/src/pages/AuthorizePage.jsx` (líneas 215–265), que se renderiza en
`http://localhost:3100/authorize` (y su equivalente en experimental/producción) cuando se accede
**sin parámetros OAuth** — es la landing "cómo conectar tu cliente MCP a Etendo".

Estado actual de esa página (`ConnectionsLanding`):
- Título hardcodeado **"Connect with Claude"** (`tMenu('Connect with Claude')`) — sesgado a un solo
  cliente aunque el copy de abajo diga "Claude Desktop or any MCP-compatible client".
- 4 pasos genéricos y ya redactados pensando en Claude Desktop específicamente
  (`oauthStep1`–`oauthStep4`, ver `packages/app-shell-core/src/locales/en_US.json:17051-17054`):
  1. "Add this Etendo server as an MCP remote in Claude Desktop"
  2. "Claude will open this page to request access"
  3. "Review the permissions and click Authorize"
  4. "Claude can now read and write data in Etendo on your behalf"
- Un solo bloque con la **MCP Server URL**, calculada dinámicamente con
  `detectMcpUrl()` = `window.location.origin + '/mcp'` (`AuthorizePage.jsx:18-20`) — esto es
  exactamente el mecanismo de "URL dinámica según entorno" que ya funciona y **se debe conservar**:
  como la página se sirve desde el mismo origin que el entorno activo (local `:3100`, experimental,
  o producción), el origin ya resuelve solo el ambiente correcto. No hace falta rehacer esa lógica,
  solo reutilizarla dentro de cada tab de cliente.
- No hay ningún selector: es un único flujo de 4 pasos, un solo nombre de cliente en el título.

## Decisiones confirmadas

- **Selector de cliente**: la página `ConnectionsLanding` debe mostrar un **selector** (tabs) con:
  **Claude Desktop, Claude Code (CLI), Cursor, VS Code, OpenAI Codex, OpenCode, Google Antigravity**,
  más una pestaña **"Otros / genérico"** para cualquier cliente MCP no listado explícitamente (con la
  URL + explicación mínima de qué es un servidor MCP remoto, para que sirva de fallback).
  - **ChatGPT (Web/Desktop) queda FUERA de alcance de esta entrega** (decisión ronda 3, 2026-07-07):
    de OpenAI solo entra Codex. La tab de ChatGPT no se implementa ahora; su borrador de copy se
    conserva más abajo marcado como follow-up futuro (requiere validación OAuth end-to-end antes de
    exponerse).
- **Botón de copiar = componente genérico nuevo** (decisión ronda 3, 2026-07-07): NO existe un
  componente compartido de copiar; el patrón (`navigator.clipboard.writeText` + toast + estado
  `copied`) está duplicado en 5+ lugares (`OAuth2ClientDialog.jsx`, `AccountSummaryStrip.jsx`,
  `EditAccountModal.jsx`, `accountColumns.jsx`, `OAuth2ClientsPage.jsx`). Dado que esta landing tiene
  muchos bloques copiables (una URL/snippet/comando por tab + JSONs + prompt de agentes), el Developer
  crea un `CopyButton`/`CopyBlock` genérico en `tools/app-shell/src/components/ui/` y lo usa en toda la
  página. Migrar los 5 usos existentes es opcional y va en commit aparte para no ensuciar el scope.
- **Audiencia: usuarios sin contexto técnico.** Esto es lo que más cambia el copy respecto al doc
  interno: nada de OAuth discovery, RFC 8414/9728, issuers ni audiencias. El público objetivo es,
  literalmente, "el gerente de una empresa que quiere conectar su asistente de IA a Etendo". Cada
  tab debe leerse como una receta de cocina: pasos numerados, lenguaje simple, capturas o nombres
  de menú reales de cada cliente en vez de jerga OAuth. Nada de mostrar errores de discovery ni
  explicar por qué algo falla a bajo nivel — si hace falta manejar errores, un mensaje simple
  ("no pudimos conectar, contactá a soporte") alcanza para esta página.
- **URL dinámica según entorno**: SE MANTIENE el mecanismo actual (`detectMcpUrl()` vía
  `window.location.origin`) — ya resuelve local/experimental/producción solo por dónde se sirve la
  página, sin selector adicional de ambiente. Cada tab de cliente debe interpolar esa misma URL en
  su snippet/instrucción (ej. el JSON de Claude Desktop con la URL ya insertada, el comando
  `claude mcp add ... <url>` con la URL ya insertada, etc.) — nunca URLs hardcodeadas de ejemplo
  que el usuario tenga que editar a mano.

## Propuesta

### Estructura de la página `ConnectionsLanding`

1. **Encabezado neutral** (no "Connect with Claude"): algo tipo "Conectá tu asistente de IA a
   Etendo" — sin nombrar un cliente específico, ya que ahora hay varios.
2. **Selector de cliente** (tabs horizontales, mismo patrón visual que el resto de la PWA):
   `Claude Desktop | Claude Code | Cursor | VS Code | OpenAI Codex | Otros`.
3. **Contenido por tab**, cada uno con:
   - Pasos numerados específicos de ese cliente (dónde hace clic, qué menú, qué pega).
   - El snippet/comando correspondiente con la **MCP Server URL ya interpolada** (vía
     `detectMcpUrl()`), en un bloque copiable (botón "copiar").
   - Para clientes con config por archivo JSON (Cursor, VS Code): mostrar el bloque JSON completo
     listo para pegar, no solo el URL suelto.
   - Para clientes CLI (Claude Code, OpenAI Codex si aplica): mostrar el comando completo.
   - **Claude Desktop es la única tab con un sub-selector interno** (Cuenta personal / Organización
     Team-Enterprise) porque el flujo de UI difiere realmente entre ambas — no es un simple cambio
     de copy, son pantallas distintas (Configuración de usuario vs. Configuración de la
     organización) confirmadas con capturas reales.
4. La tab **"Otros"** mantiene el contenido genérico actual (URL + explicación breve) como fallback.

### Qué NO cambia
- El doc interno `docs/agentic-validation/mcp-client-setup.md` sigue existiendo tal cual, para devs
  que necesitan el detalle técnico de OAuth/discovery en LOCAL vs EXPERIMENTAL.
- El mecanismo `detectMcpUrl()` / `detectBaseUrl()`.
- El resto del flujo de `AuthorizePage.jsx` (consentimiento OAuth cuando SÍ hay parámetros) no se
  toca — el rediseño es solo sobre `ConnectionsLanding`.

## Decisiones cerradas (ronda 2)

- **El copy actual (título "Connect with Claude" + `oauthStep1`-`4`) se conserva íntegro pero se
  reubica dentro de la tab "Otros"**, sin reescribir — es el fallback genérico para cualquier
  cliente MCP no listado explícitamente. Las tabs nuevas (Claude Desktop, Claude Code, Cursor,
  VS Code, OpenAI Codex) llevan copy nuevo, redactado con el tono "sin contexto técnico".
- **OpenAI Codex SÍ soporta MCP remoto por HTTP**, confirmado contra la doc oficial
  (developers.openai.com/codex/mcp, julio 2026):
  - No existe un comando `codex mcp add` para servidores HTTP — se configuran a mano en
    `~/.codex/config.toml` (o `.codex/config.toml` del proyecto) con:
    ```toml
    [mcp_servers.etendo-go]
    url = "<MCP_SERVER_URL>"
    ```
  - OAuth se dispara con `codex mcp login <server-name>` — abre el navegador con un flow
    equivalente al de Claude Code (`claude mcp add` + `/mcp` → Authenticate).
- **Copy nuevo**: lo redacto yo en este plan (borrador abajo), el usuario ajusta antes de pasar a
  desarrollo.

## Decisión adicional: botón "Instalar" con deep link (Cursor y VS Code)

Ambos clientes soportan (o soportaban a la fecha de este borrador) un **esquema de deep link** que
permite dar de alta el servidor MCP con un solo clic, sin que el usuario tenga que copiar/pegar URL
ni tipear nada manualmente — el botón abre directamente la app con el servidor pre-cargado, el
usuario solo confirma. Esto reduce fricción especialmente para la audiencia sin contexto técnico.

- **Alcance de esta decisión**: agregar un botón "Instalar en Cursor" / "Instalar en VS Code" en la
  tab correspondiente, **además de** (no en reemplazo de) los pasos manuales — el deep link puede
  fallar (versión vieja del cliente, esquema de URL no registrado en el SO) y el fallback manual
  siempre debe quedar visible debajo.
- **Formato exacto del deep link — AMBOS confirmados contra doc oficial**:
  - **VS Code**: `vscode:mcp/install?<json-url-encoded>` con
    `{"name":"etendo-go","type":"http","url":"{mcpUrl}"}` (variante `vscode-insiders:` para build
    Insiders). Ver bloque completo en la tab de VS Code más abajo.
  - **Cursor**: `cursor://anysphere.cursor-deeplink/mcp/install?name=etendo-go&config=<BASE64>`,
    donde `<BASE64>` = `base64(JSON.stringify({ url: "{mcpUrl}" }))` — **el config va en base64**
    (distinto de VS Code, que usa JSON URL-encoded plano), y debe calcularse dinámicamente en el
    cliente porque `{mcpUrl}` varía por entorno. Ver bloque completo en la tab de Cursor más abajo.
- **Claude Desktop y OpenAI Codex**: no se les conoce (a la fecha de este borrador) un esquema de
  deep link equivalente — quedan con solo los pasos manuales.
- **i18n**: el label del botón sigue la regla de naming general — `oauthConnect<Client>InstallButton`
  (ej. `oauthConnectCursorInstallButton`, `oauthConnectVsCodeInstallButton`), como ejemplo del caso
  "sufijo descriptivo" ya contemplado en la regla de naming.

## Decisión adicional: bloque de "Prompt" para agentes CLI (Codex, Claude Code, OpenCode)

Estos tres clientes no son solo "programas que leen un config" — son **agentes que ejecutan
comandos por vos**. Para esos tres (y solo esos tres, por ahora) se agrega, dentro de su propia tab,
un **segundo método de configuración** además de los pasos manuales: un cuadro con un texto
copiable ("Prompt") pensado para pegarlo directamente en el chat del agente CLI. El propio agente
interpreta el pedido y hace el `mcp add` / edición de config + login por su cuenta.

- **Formato en la tab**: un bloque separado, con su propio título ("¿Preferís que el agente lo haga
  por vos?" o similar) y un botón "copiar", debajo de los pasos manuales — no reemplaza el manual,
  es una alternativa más rápida para quien ya tiene el agente abierto.
- **Contenido del prompt**: en lenguaje natural, sin jerga OAuth, con la `{mcpUrl}` ya interpolada.
  Borrador único (mismo texto para los tres, ya que los tres son agentes de código con acceso a
  shell):
  > Agregá el servidor MCP remoto de Etendo llamado `etendo-go` en `{mcpUrl}` usando transporte
  > HTTP, y ayudame a completar el login cuando se abra el navegador.
- **i18n**: clave `oauthConnectAgentPrompt` (compartida entre las 3 tabs, ya que el texto es el
  mismo) — caso de contenido no numerado, sigue la regla de sufijo descriptivo ya definida
  (`oauthConnect<Sufijo>` sin `<Client>` porque es transversal a los tres, no de-uno-solo).

## Decisión adicional: evento de métricas al hacer click en una tab

Se necesita saber **qué cliente MCP elige la gente** en esta página. Dos consecuencias directas
sobre el diseño:

- **Ninguna tab se abre por defecto.** Si hubiera una tab pre-seleccionada, no podríamos distinguir
  "clickeó esta tab" de "nunca tocó nada y quedó la default" — el evento perdería sentido. La página
  arranca con el selector sin selección (o con un estado "elegí tu cliente" placeholder) hasta que
  el usuario clickea una tab por primera vez.
- **Evento a enviar**: 1 evento por click en una tab, con el identificador del cliente elegido (el
  mismo `<Client>` de la regla de naming: `ClaudeDesktopPersonal`, `ClaudeDesktopOrg`, `ClaudeCode`,
  `Cursor`, `VsCode`, `Codex`, `OpenCode`, `ChatGpt`, `Antigravity`, `Other`) — no hace falta más
  payload que eso para responder "qué cliente elige la gente".
- **Mecanismo de envío — confirmado, ya existe, se reusa tal cual**:
  - `tools/app-shell/src/lib/observability/core.js` expone `track(eventName, properties)` (importado
    vía `@/lib/observability.js`); el sink real es Mixpanel
    (`tools/app-shell/src/lib/observability/providers/mixpanel.js`, gateado por
    `VITE_MIXPANEL_ENABLED`/`VITE_MIXPANEL_TOKEN`) — no hay backend propio de este repo para
    eventos, van directo al cliente de Mixpanel.
  - El evento nuevo se da de alta en el catálogo `tools/app-shell/src/lib/observability/events.js`
    (`OBSERVABILITY_EVENTS`: nombre, categoría, canales) — ej.
    `mcp_connect_tab_selected` con `properties: { client: '<Client>' }`.
  - Se sigue el patrón de wrapper de dominio (no llamar `track()` directo desde el componente): una
    función tipo `trackMcpConnectTabSelected({ client })` en un archivo `*Telemetry.js` nuevo o
    existente que arme el evento y llame `track(...)` fire-and-forget (`.catch(() => {})`) — mismo
    patrón que `trackSearchResultSelected` en `productUsageTelemetry.js`, invocado por ejemplo desde
    `DataTable.jsx:1326`.

### Evento adicional: click en el botón de copiar

Mismo mecanismo (`track()` vía wrapper de dominio, alta en `events.js`), un evento nuevo separado
del de tab-click:

- **Evento**: `mcp_connect_copy_clicked`, `properties: { client: '<Client>', block: '<bloque>' }` —
  `client` es la tab activa al momento del click (mismo identificador de la regla de naming);
  `block` identifica qué bloque copiable se tocó dentro de esa tab (ej. `url`, `command`, `config`,
  `prompt` — el nombre exacto depende de qué bloques copiables termine teniendo cada tab).
- **No se trackea el deep link** (Cursor/VS Code "1-click install") — solo tabs y copy.
- Wrapper: `trackMcpConnectCopyClicked({ client, block })`, mismo archivo `*Telemetry.js` del evento
  de tab-click.
- **No existe un `CopyButton` reusable en `components/ui/`.** Cada pantalla del repo implementa su
  propio botón inline (`OAuth2ClientDialog.jsx`, `accountColumns.jsx`, `EditAccountModal.jsx`,
  `AccountSummaryStrip.jsx`, `OAuth2ClientsPage.jsx`) con el mismo patrón: ícono `Copy` de
  `lucide-react` + `navigator.clipboard.writeText(...)` + `toast.success(ui('<clave-i18n>'))`.
- **Prerequisito de esta implementación: extraer un `CopyButton` compartido en
  `schema_forge_core` → `packages/app-shell-core/src/components/ui/`** (fuente real del UI kit —
  confirmado que `tools/app-shell/src/components/ui/` en este repo son copias locales ya
  divergentes, no symlinks). Este componente reemplaza el patrón inline repetido en los 5 lugares
  de arriba y es lo que consumen los bloques copiables de esta página nueva. Se construye como parte
  del mismo ciclo de implementación (Developer), antes de escribir los bloques copiables de las
  tabs — no como refactor separado de los 5 usos existentes (eso queda fuera de alcance de este
  plan, se migran oportunistamente si se tocan esos archivos por otro motivo).

## Propuesta de copy por tab (borrador — a revisar)

Todas las tabs interpolan `{mcpUrl}` = `detectMcpUrl()` (URL ya resuelta según el entorno activo).

### Tab: Claude Desktop (con 2 sub-tabs: Cuenta personal / Organización)

Confirmado con capturas reales de la UI: el flujo **difiere** según el tipo de cuenta, así que esta
tab lleva un sub-selector interno.

#### Sub-tab: Cuenta personal
Confirmado con capturas reales de la UI (Claude Desktop, cuenta personal):
1. Abrí Claude Desktop → **Configuración → Conectores** (menú lateral izquierdo).
2. Click en **"Agregar"** (arriba a la derecha del listado de conectores) → **"Agregar conector
   personalizado"**.
3. En el diálogo "Agregar conector personalizado" completá:
   - **Nombre**: ej. "Etendo".
   - **URL de MCP**: `{mcpUrl}`.
4. Click en **"Agregar"**.
5. El conector "Etendo" aparece en la lista como "No conectado" — click en **"Conectar"**.
6. Se te va a pedir iniciar sesión en Etendo y aprobar el acceso — aceptá.
7. Listo. Ya podés pedirle a Claude que consulte o actualice información de Etendo.

#### Sub-tab: Organización (plan Team / Enterprise)
> Este paso lo hace quien tenga rol de **owner/admin** de la organización — se configura una sola
> vez para todo el equipo, no por cada persona.
1. Andá a **Configuración de la organización → Conectores**.
2. Click en **"+ Añadir" → Personalizado → Web**.
3. En el diálogo "Añadir conector personalizado" completá **Nombre** (ej. "Etendo") y **URL del
   servidor MCP remoto**: `{mcpUrl}`.
4. ⚠️ **Importante** — en **Métodos de conexión** dejá **activado "Inicio de sesión individual"**
   (viene así por defecto, no lo desactives): cada miembro del equipo inicia sesión con su propia
   cuenta de Etendo la primera vez que lo usa. La opción "Autorización administrada" es Beta,
   requiere solicitar acceso aparte y **no se usa** para este setup.
5. Click en **"Añadir"**. El conector queda disponible para toda la organización.

**Para cada miembro del equipo** (una vez que el owner ya hizo los pasos de arriba):
1. Andá a tu **Configuración** personal (no la de la organización) y buscá el conector que el
   admin habilitó (ej. "Etendo") en la lista.
2. Hacé clic en **"Conectar"**.
3. Se te va a pedir iniciar sesión en Etendo Go — completá el login y aprobá el acceso.
4. Listo, ya podés pedirle a Claude que consulte o actualice información de Etendo.

### Tab: Claude Code (CLI)
1. Abrí una terminal.
2. Ejecutá: `claude mcp add --scope user --transport http etendo-go {mcpUrl}`
   > `--scope user` registra el servidor a nivel usuario (disponible en cualquier proyecto/carpeta
   > donde uses Claude Code), no solo en el directorio actual — mismo criterio que se usa para
   > servidores MCP remotos de terceros (ej. Context7: `claude mcp add --scope user --transport http
   > context7 https://mcp.context7.com/mcp`).
3. Dentro de Claude Code escribí `/mcp`, elegí `etendo-go` y presioná **Authenticate**.
4. Se abre el navegador para iniciar sesión en Etendo — aceptá los permisos.

### Tab: Cursor
Confirmado contra la doc oficial (cursor.com/docs/mcp/install-links) — deep link resuelto:

0. **Botón "Instalar en Cursor"** (deep link, un solo clic):
   ```
   cursor://anysphere.cursor-deeplink/mcp/install?name=etendo-go&config=<BASE64>
   ```
   Donde `<BASE64>` es `base64(JSON.stringify({ url: "{mcpUrl}" }))`. **A diferencia de VS Code, acá
   el config va en base64, no URL-encoded plano** — y como `{mcpUrl}` cambia según el entorno
   (local/experimental/producción), el base64 **no puede ser un valor fijo hardcodeado**: hay que
   calcularlo en el cliente con `btoa(JSON.stringify({ url: detectMcpUrl() }))` al renderizar el
   botón, igual que ya se hace con `{mcpUrl}` en el resto de las tabs.
   Cursor ofrece 3 estilos de badge (enlace de texto, botón oscuro, botón claro) vía su propio
   generador — el detalle visual exacto de esos badges no está documentado públicamente, así que se
   arma un botón propio (mismo estilo que el de VS Code) apuntando a esta URL.
   **Esto resuelve el punto pendiente de "formato exacto del deep link" para Cursor.**
1. Manual: agregá esto a `~/.cursor/mcp.json` (o `.cursor/mcp.json` del proyecto):
   ```json
   {
     "mcpServers": {
       "etendo-go": {
         "url": "{mcpUrl}"
       }
     }
   }
   ```
   También accesible desde la UI: **Cursor Settings → Tools & MCP → New MCP Server**.
2. Cursor te redirige a Etendo para iniciar sesión y aprobar el acceso.
3. Cuando el ícono del servidor se pone verde, ya está conectado.

### Tab: VS Code
Confirmado — VS Code resuelve tanto el botón de instalación como el config manual:

0. **Botón "Instalar en VS Code"** (deep link, un solo clic):
   ```
   vscode:mcp/install?{"name":"etendo-go","type":"http","url":"{mcpUrl}"}
   ```
   (el JSON va URL-encoded en el `href` real; hay variante `vscode-insiders:` para quienes usan la
   build Insiders). Botón estilo shields.io, ej.:
   ```html
   <a href="vscode:mcp/install?%7B%22name%22%3A%22etendo-go%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22{mcpUrl-encoded}%22%7D">
     <img src="https://img.shields.io/badge/VS_Code-Install_Etendo_Go_MCP-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=ffffff" alt="Install in VS Code">
   </a>
   ```
   **Esto resuelve el punto pendiente de "formato exacto del deep link" para VS Code** (Cursor
   también quedó resuelto, ver su propia tab).
1. Manual: agregá esto a `.vscode/mcp.json` del proyecto (o el mcp.json global de usuario):
   ```json
   {
     "servers": {
       "etendo-go": {
         "type": "http",
         "url": "{mcpUrl}"
       }
     }
   }
   ```
2. Al abrir el proyecto, VS Code detecta el servidor y pide iniciar sesión — completá el login en
   Etendo y aprobá el acceso.
3. El servidor `etendo-go` va a aparecer disponible en el panel de Copilot Chat.

### Tab: OpenAI Codex
Confirmado — coincide con el formato oficial "Remote Server Connection" de Codex:
1. Editá (o creá) el archivo `~/.codex/config.toml` y agregá:
   ```toml
   [mcp_servers.etendo-go]
   url = "{mcpUrl}"
   ```
2. En la terminal ejecutá: `codex mcp login etendo-go`
3. Se abre el navegador para iniciar sesión en Etendo y aprobá el acceso.
4. Listo, ya podés usar Codex para leer o actualizar datos de Etendo.

**Alternativa — pedile al agente que lo configure él mismo**: ver "Bloque de Prompt" abajo.

### Tab: OpenCode
Confirmado contra la doc oficial (opencode.ai/docs/mcp-servers, opencode.ai/docs/config — julio 2026):

1. Editá (o creá) `~/.config/opencode/opencode.json` (config global) — o `opencode.json` en la raíz
   del proyecto si querés que aplique solo ahí (el config de proyecto tiene precedencia sobre el
   global) — y agregá:
   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "mcp": {
       "etendo-go": {
         "type": "remote",
         "url": "{mcpUrl}",
         "enabled": true
       }
     }
   }
   ```
   (nota: el top-level es `mcp` — no `mcpServers` como Cursor/Antigravity — y el tipo es `"remote"`.)
2. OpenCode maneja el login automáticamente vía Dynamic Client Registration: al recibir un `401`
   del servidor dispara el flujo OAuth por su cuenta y abre el navegador.
3. Completá el login en Etendo y aprobá el acceso — listo, el servidor `etendo-go` queda disponible.

**Alternativa — pedile al agente que lo configure él mismo**: ver "Bloque de Prompt" abajo.

> Nota menor: el único dato a confirmar al implementar es el nombre exacto del comando de login CLI
> (`opencode mcp auth <server>` / equivalente vigente) por si se quiere mencionar explícitamente; el
> formato del archivo/clave de config ya está confirmado arriba.

### Tab: Google Antigravity
1. Abrí (o creá) el archivo de config MCP de Antigravity y agregá:
   ```json
   {
     "mcpServers": {
       "etendo-go": {
         "serverUrl": "{mcpUrl}"
       }
     }
   }
   ```
   (nota: la clave es `serverUrl`, no `url` como en Cursor/Codex — confirmado contra el formato
   "Remote Server Connection" de Antigravity).
2. Guardá el archivo y reiniciá/recargá Antigravity si hace falta.
3. Iniciá sesión en Etendo cuando se te pida y aprobá el acceso.
4. Listo, el servidor `etendo-go` queda disponible para usar desde Antigravity.

### Tab: ChatGPT (Web / Desktop) — 🚫 FUERA DE ALCANCE (follow-up futuro)

> **Decisión ronda 3 (2026-07-07): esta tab NO se implementa en esta entrega.** El copy se conserva
> abajo solo como referencia para un follow-up. Basado en la doc oficial de OpenAI (Developer Mode,
> beta), pero **no se probó end-to-end contra el servidor MCP de Etendo GO** — el flujo OAuth de
> ChatGPT podría comportarse distinto. No agregar la tab hasta validar contra nuestro servidor real.

1. Activá el modo desarrollador: **Configuración → Apps → Configuración avanzada → Activar modo
   desarrollador**.
2. Creá la app: **Configuración → Apps → Crear app**, completando:
   - **Nombre**: "Etendo"
   - **Descripción**: algo breve, ej. "Consultar y actualizar información de Etendo"
   - **URL del servidor MCP**: `{mcpUrl}`
3. Aceptá el aviso de seguridad y completá la autorización OAuth (una sola vez).
4. Para usarla: nuevo chat → ícono **"+"** → **Más** → seleccioná la app "Etendo" (o simplemente
   escribí "usa etendo" en el mensaje).

> **ChatGPT Desktop no requiere pasos aparte**: comparte las apps configuradas en la versión web —
> alcanza con hacer los pasos de arriba una vez en chatgpt.com y ya quedan disponibles también en
> la app de escritorio.

### Tab: Otros (= contenido actual, sin cambios)
> Re-confirmado (2026-07-07): aunque el heading general de la página deja de nombrar un cliente
> específico, el título "Connect with Claude" dentro de esta tab **se mantiene tal cual** —
> decisión explícita, no un descuido.

Título "Connect with Claude" + los 4 pasos genéricos existentes (`oauthStep1`-`4`) + el bloque con
`{mcpUrl}`. Sirve como fallback para cualquier cliente no listado.

## Preguntas abiertas (a resolver con el usuario)

- [ ] Revisar el borrador de copy de arriba: ¿tono correcto? ¿algún paso de algún cliente
      desactualizado (nombres de menú cambian seguido en estas apps)?
- [x] **Sub-tabs de Claude Desktop (Personal / Organización) — UI y naming resueltos**:
      - **UI**: sub-tabs anidadas — dentro del contenido de la tab "Claude Desktop" hay un segundo
        nivel de tabs (`Personal | Organización`), reusando el mismo componente `Tabs`.
      - **Naming**: Personal y Organización se tratan como si fueran dos "clientes" propios a
        efectos de la regla `oauthConnect<Client>...`:
        - Sub-tab labels: `oauthConnectTabClaudeDesktopPersonal` /
          `oauthConnectTabClaudeDesktopOrg`.
        - Pasos: `oauthConnectClaudeDesktopPersonalStep1..N` /
          `oauthConnectClaudeDesktopOrgStep1..N` (incluye el bloque de pasos "para cada miembro del
          equipo" dentro de Org, numerado a continuación de los pasos del owner).
- [x] **Regla de naming i18n propuesta** (a validar/mejorar si hace falta que abarque más casos):
      - Prefijo común `oauthConnect` para todo lo nuevo de esta página — separa este namespace del
        de la pantalla de consentimiento OAuth (`oauthAuthorize*`, `oauthDeny`, `oauthApplication`,
        etc.), que no se toca.
      - **Label de la tab**: `oauthConnectTab<Client>` (ej. `oauthConnectTabClaudeDesktop`,
        `oauthConnectTabClaudeCode`, `oauthConnectTabCursor`, `oauthConnectTabVsCode`,
        `oauthConnectTabCodex`, `oauthConnectTabOther`).
      - **Paso a paso**: `oauthConnect<Client>Step<N>` (ej. `oauthConnectClaudeDesktopStep1`..`4`,
        `oauthConnectCursorStep1`..`4`) — mismo `<Client>` que la tab, número secuencial sin ceros
        a la izquierda. Cada cliente puede tener una cantidad distinta de pasos.
      - **Encabezado general de la página** (ya no específico de un cliente):
        `oauthConnectHeading` / `oauthConnectSubheading`, reemplazando el actual
        `tMenu('Connect with Claude')` + `oauthConnectLandingDesc` (que quedaban acoplados a
        Claude). El label del recuadro de URL (`oauthMcpServerUrl`) se reutiliza sin cambios.
      - **La tab "Otros" NO se renombra**: conserva las claves existentes tal cual
        (`oauthStep1`-`4`, `oauthConnectLandingDesc` si se necesita algo de esa copy) para no
        romper traducciones ya hechas — es la única excepción a la regla `oauthConnect<Client>*`.
      - `<Client>` siempre en PascalCase y debe listarse en un solo lugar del código (un array/enum
        de clientes soportados) para que agregar un cliente nuevo sea: 1 entrada en el enum + sus
        claves `Step1..N` — sin tocar el resto del componente.
      - Si en el futuro un cliente necesita algo más que pasos numerados (ej. un snippet con su
        propia copy explicativa, o un bloque de troubleshooting), esa pieza se nombra
        `oauthConnect<Client><Sufijo descriptivo>` (ej. `oauthConnectCodexTomlHint`) en vez de
        forzarla dentro de `StepN` — mantiene la regla extensible sin romper el patrón base.
- [x] **Componente de tabs a reusar — confirmado.** Ya existe `tools/app-shell/src/components/ui/tabs.jsx`
      (hand-built, Radix no instalado) y ya está en uso en producción (ej.
      `windows/custom/financial-account/DetailTabs.jsx`). No hace falta construir uno nuevo — se
      reusa tal cual.
- [ ] **Testear el flujo de ChatGPT (Web/Desktop) end-to-end contra Etendo GO** antes de dar esa tab
      por definitiva — el copy está basado en doc oficial de OpenAI pero no validado con nuestro
      servidor MCP real (posible diferencia en el flujo OAuth). Marcar la tab como beta/experimental
      en la UI hasta confirmar.
- [x] **Archivo/clave de config exacta de OpenCode — confirmado** (2026-07-07, contra
      opencode.ai/docs/mcp-servers y opencode.ai/docs/config): `opencode.json` (global en
      `~/.config/opencode/` o de proyecto), bloque `"mcp": { "etendo-go": { "type": "remote", "url":
      "{mcpUrl}", "enabled": true } }`. Copy de la tab ya actualizado arriba.
- [ ] **(nuevo, 2026-07-07) Evaluar agregar un evento de "conexión completada" por cliente**, no solo
      de click en la tab. Hoy `mcp_connect_tab_selected` mide intención (qué tab elige la gente), no
      si esa persona logró conectar de verdad. Investigación de factibilidad:
      - El backend (`OAuth2Servlet.java:1191`) ya captura `client_name` en el registro DCR (el MCP
        client lo manda al registrarse; fallback `"MCP Client"` si no lo manda) y lo persiste junto
        al `client_id`. Es un dato server-side que hoy **no llega al frontend** — `AuthorizePage.jsx`
        solo recibe `client_id` por query param en la pantalla de consentimiento, no `client_name`.
      - Para trackear éxito por cliente haría falta exponer `client_name` al frontend (nuevo
        endpoint o campo adicional en la respuesta que ya usa `AuthorizePage.jsx`), y disparar el
        evento en la rama `status === 'success'` de `handleAuthorize()` (`AuthorizePage.jsx:81`) —
        que es el único punto donde el consentimiento se confirma.
      - Limitación: `client_name` es lo que cada software MCP decide mandar en su DCR — no
        necesariamente calza 1:1 con los valores normalizados del enum `<Client>` que ya usa el
        evento de tab-click (`Cursor`, `VsCode`, `ClaudeDesktopPersonal`, ...). Puede requerir un
        mapeo o aceptarse como dimensión libre, menos prolija que la del evento de click.
      - Es de **mayor alcance que un cambio solo de frontend** (toca `OAuth2Servlet.java` o el
        endpoint que arma la pantalla de consentimiento) — no se resuelve en el mismo PR que las
        tabs sin más discusión de alcance con el usuario.
- [ ] Revisar el texto único del "Bloque de Prompt" (Codex/Claude Code/OpenCode): ¿alcanza como está
      o conviene un texto por cliente si en la práctica alguno interpreta distinto el mismo pedido?

## Próximos pasos

- [ ] Usuario revisa/ajusta el borrador de copy de arriba.
- [ ] Cerrado el copy, este plan pasa a Developer (Schema Forge Developer) para implementar el
      selector + tabs en `AuthorizePage.jsx` (componente `ConnectionsLanding`), dar de alta las
      claves i18n nuevas en `en_US.json` + `es_ES.json`, y seguir el pipeline normal
      (DEV → REVIEW → QA → DOCS).
- [x] **(OPCIONAL, etapa final) Migrar `ConnectionsLanding`/`AuthorizePage.jsx` a
      `schema_forge_core`.** ✅ EN EJECUCIÓN bajo ETP-4394 (2026-07-13): pasos 0–5 completos, solo
      falta el Paso 6 (release + bump, lo gestiona el usuario). Ver el bloque "🚧 ESTADO DE EJECUCIÓN"
      en la sección "Procedimiento concreto de migración a core" más abajo. Justificación original: es
      un flujo genérico igual para todos
      los clientes (no es "per-client config"), por lo que conceptualmente encaja mejor en el
      charter de core ("HOW the tooling works") que en el de funcional ("WHAT to expose, per
      client").

      **Investigación previa (2026-07-07) — hallazgos a tener en cuenta antes de encararlo:**
      - **Sin precedente de este tipo.** Las promociones a core hasta ahora (ETP-4135/ETP-4104)
        fueron primitivos de UI genéricos (`badge`, `card`, `button`, `select`, ...), nunca una
        página/feature completa con copy propio y lógica de negocio (OAuth). Sería el primer caso.
      - **i18n queda partido entre repos.** Core no tiene locale JSON propio — es un resolver que
        espera que el host (`schema_forge`) le inyecte el diccionario vía `LocaleProvider`. Las
        claves `oauthConnect*`/`oauthAuthorize*` seguirían viviendo en
        `schema_forge/tools/app-shell/src/locales/en_US.json` + `es_ES.json`, desacopladas del
        componente que las consume.
      - **Sin abstracción de observability en core.** El tracking de esta página hoy es genérico
        vía `ObservabilityRouteTracker` en el router (no hay `track()` explícito dentro del
        componente), así que mover el archivo no rompe nada hoy — pero el evento
        `mcp_connect_tab_selected` que pide este mismo plan (sección "evento de métricas al hacer
        click en una tab") si se implementa ANTES de migrar, quedaría atado a
        `schema_forge/tools/app-shell/src/lib/observability/`, que core no puede importar (dirección
        de dependencia invertida). Si se migra después, hay que diseñar antes un seam de
        observability en core.
      - **Falta el componente `Tabs` en core.** `tabs.jsx` es local a `schema_forge` (hand-built,
        Radix no instalado) — su migración a core nunca se completó (solo quedó un test huérfano
        `tabs.vitest.jsx` sin implementación en `schema_forge_core/packages/app-shell-core`). Si el
        selector de esta página depende de `Tabs`, hay que migrar ese componente primero o quedaría
        una página en core dependiendo de un componente en funcional.
      - **Mayor latencia de iteración.** Un fix en core requiere: PR en core → release manual
        (`publish-private-packages.yml` es `workflow_dispatch`, no automático) → PR de bump del pin
        en `schema_forge` (auto-abierto por `bump-core-on-release.yml`, merge humano) → recién ahí
        está live. Mitigable en desarrollo con `LOCAL_CORE=1`, no en producción.
      - **Sin gate automático que lo bloquee o lo exija.** `domain-boundary-check.yml` está
        deshabilitado (no-op post-split) — la frontera funcional/core es hoy puramente convención
        (`docs/repo-topology.md`), no hay CI que valide este move.
      - **`detectMcpUrl()`/`detectBaseUrl()` no son un obstáculo** — son autocontenidos
        (`window.location`, `import.meta.env`), funcionan igual en cualquiera de los dos repos.

      **Recomendación:** iterar el rediseño completo (copy, tabs, deep links, evento de métricas)
      en `schema_forge` primero, donde el ciclo es rápido; recién evaluar la migración a core como
      paso de "hardening" posterior, con `Tabs` ya migrado y un seam de observability definido en
      core.

## Procedimiento concreto de migración a core (paso a paso)

> **Estado (2026-07-08):** el rediseño ya está implementado y estabilizado en `schema_forge`
> (tabs por cliente, `deriveServerName()`, catálogo `mcpClients.js`, `CopyBlock`, evento
> `mcp_connect_tab_selected`). Esta sección documenta CÓMO se haría la promoción a core cuando se
> decida encararla — es el "paso opcional de hardening" de la recomendación de arriba, ya
> operacionalizado. No ejecutar sin abrir su propia tarea Jira.

> **🚧 ESTADO DE EJECUCIÓN (2026-07-13 — ETP-4394):** la migración a core SE ESTÁ EJECUTANDO en
> esta tarea. **Pasos 0–5 COMPLETOS y verdes; solo falta el Paso 6 (release + bump), que lo dispara
> el usuario.** Detalle por paso más abajo (cada uno marcado ✅/⏳). Resumen:
>
> - ✅ **Paso 0 — Tabs** en core (`components/ui/tabs.jsx`), test huérfano ahora verde (8/8). Shim en funcional.
> - ✅ **Paso 1 — CopyButton/CopyBlock** en core, test copiado (6/6). Shim en funcional.
> - ✅ **Paso 2 — Seam de observability** en core (opción A): `observability/ObservabilityContext.jsx`
>   con `ObservabilityProvider` + `useObservability()` y **default no-op**. Test 2/2. Export `./observability`.
> - ✅ **Paso 3 — `mcpClients.js`** en core (`lib/mcpClients.js`, módulo puro), test copiado como
>   `*.vitest.js` (core lib 21/21). Shim en funcional. Export `./lib/*`.
> - ✅ **Paso 4 — `AuthorizePage.jsx`** en core (`pages/AuthorizePage.jsx`): imports reapuntados a
>   rutas relativas de core; telemetría consumida vía `useObservability()` (seam del Paso 2, sin fuga
>   de `mcpConnectTelemetry` a core — grep limpio); export `./pages/*`. Shim de re-export en funcional
>   (`runtime-routes.jsx` sin cambios). Host wrap en `App.jsx`: `<ObservabilityProvider value={{ trackMcpConnectTabSelected }}>`
>   envuelve `<AppShellRuntime>` e inyecta el tracking real de dominio. Test copiado a core (23/23).
>   El test original de funcional se reescribió como **smoke-test de shim** (2/2, full-mount con
>   `AuthProvider` + `ObservabilityProvider` reales de core) — decisión del usuario, porque sus mocks
>   `@/` ya no interceptaban los imports relativos de la página en core (`useAuth` estricto lanzaba).
> - ✅ **Paso 5 — i18n:** verificado. Todas las claves que la página usa (literales + `oauthConnectTab<Id>`
>   dinámicos de 8 clientes + 2 sub-tabs) existen en `en_US` y `es_ES` con paridad `oauth*` perfecta.
>   Los diccionarios se quedan en funcional (core es resolver; el host inyecta vía `LocaleProvider`).
>   (Nota: hay 24 claves no-`oauth*` solo en `es_ES` — desbalance preexistente del repo, fuera de alcance.)
> - ⏳ **Paso 6 — Release + bump: PENDIENTE (lo gestiona el usuario).** Publicar core primero, luego
>   bumpear el pin `@etendosoftware/app-shell-core` (`0.3.5` → nueva) en funcional. Cierra el "peaje"
>   de todos los shims a la vez.
>
> **Verificación:** todo verde bajo `LOCAL_CORE=1` (el perfil de dev). En build default (paquete
> publicado) los shims de exports NUEVOS (`observability`, `lib/mcpClients`, `pages/AuthorizePage`)
> recién resuelven tras el Paso 6 — es el peaje conocido, no una regresión.
>
> **Excepción del peaje — `mcpClients.test.js`:** el test original de funcional para `mcpClients` es
> **node:test** (no vitest), y el alias `LOCAL_CORE` es un resolver de vite/vitest → node no lo usa.
> Ese test resuelve el shim contra el paquete publicado y recién pasa a verde tras el Paso 6. Su
> lógica está cubierta mientras tanto por la copia en core (`mcpClients.vitest.js`, 21/21).
>
> **Jira relacionada:** ETP-4484 (`plataforma`) — migrar la librería de observability completa a core
> (el sink Mixpanel + catálogo de eventos), creada como follow-up y colgada de la epic ETP-3504.

### Actualización del análisis previo (lo que cambió respecto a la investigación de arriba)

Dos supuestos de la investigación original quedaron **desactualizados** al implementar:

- ✅ **Auth e i18n YA resuelven a core.** En este repo `tools/app-shell/src/auth/AuthContext.jsx`
  y `src/i18n/index.js` son shims de una línea (`export * from '@etendosoftware/app-shell-core/auth'`
  y `.../i18n`). O sea: `useAuth`, `createApiFetch` y `useUI` que consume `AuthorizePage.jsx` ya
  vienen de core. **No hay seam nuevo que diseñar para auth/i18n** — solo hay que cambiar los
  imports de `@/auth/...`/`@/i18n` a `@etendosoftware/app-shell-core/auth`/`/i18n` cuando el archivo
  viva dentro de core (imports relativos internos).
- ⚠️ **El JSON de locales sigue partido** (sin cambios): core es un resolver, las claves
  `oauthConnect*` se quedan en `schema_forge/tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json`.
  Es aceptable — el resto de componentes de core ya funcionan así (el host inyecta el diccionario
  vía `LocaleProvider`).

Bloqueantes reales que quedan (confirmados contra el árbol de core, 2026-07-08):

| Dependencia de la página | ¿En core hoy? | Acción |
|---|---|---|
| `useAuth`, `createApiFetch`, `useUI` | ✅ sí | solo reapuntar imports |
| `Card`, `Button`, `Badge` | ✅ sí (`components/ui/`) | ninguna |
| `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` | ❌ no (solo test huérfano `tabs.vitest.jsx`) | **migrar primero** |
| `CopyBlock`/`CopyButton` (`components/ui/copy-button.jsx`) | ❌ no | **migrar primero** |
| `mcpClients.js` (catálogo + `deriveServerName`) | ❌ no (lib local) | migrar como lib de core |
| `mcpConnectTelemetry.js` → `observability.js`/`observability/events.js` | ❌ no existe observability en core | **seam de observability** (el blocker de dirección de dependencia) |
| dir `pages/` + export en `package.json` | ❌ core no tiene `pages/` ni lo exporta | crear + agregar entrada en `exports` |

### Orden de ejecución (cada paso es su propio PR en core, en este orden)

**Paso 0 — Migrar `Tabs` a core** ✅ HECHO (2026-07-13) (`packages/app-shell-core/src/components/ui/tabs.jsx`).
Es hand-built (no Radix), su única dependencia es `cn` de `@/lib/utils` → en core es `./lib/utils`
o el `utils.js` que ya existe ahí. Ya hay un test huérfano (`tabs.vitest.jsx`) esperando la
implementación — al migrar el componente ese test empieza a pasar. Dejar en `schema_forge` un shim
`tools/app-shell/src/components/ui/tabs.jsx` = `export * from '@etendosoftware/app-shell-core/components/ui/tabs.jsx'`
(mismo patrón que auth/i18n) para no tocar a los otros consumidores locales (`DetailTabs.jsx`).

**Paso 1 — Migrar `CopyButton`/`CopyBlock` a core** ✅ HECHO (2026-07-13)
(`packages/app-shell-core/src/components/ui/copy-button.jsx`). Depende de `Button`, `cn`, `toast`
(sonner, ya en core) y `useUI`/`ui('copied')`. Mover el componente + su test
(`copy-button.vitest.jsx`, ya escrito y verde con el fix de `userEvent.setup({ writeToClipboard:
false })`). Shim de re-export en `schema_forge` igual que Tabs. La clave i18n `copied` ya la resuelve
el host.

**Paso 2 — Definir el seam de observability en core** ✅ HECHO (2026-07-13) — se implementó la
**opción (A) Inyección por contexto**: `packages/app-shell-core/src/observability/ObservabilityContext.jsx`
(`ObservabilityProvider` + `useObservability()`, default no-op) + barrel `index.js` + export `./observability`.
Test `observability-context.vitest.jsx` (2/2). El sink Mixpanel + catálogo de eventos se quedan en
el host (funcional); solo migró la *invocación*. (Detalle de diseño original abajo.)
`mcpConnectTelemetry.js` importa `@/lib/observability.js` (que expone `track`) + `observability/events.js`
(catálogo `OBSERVABILITY_EVENTS` + `buildObservabilityEvent`), y todo eso vive en
`schema_forge/tools/app-shell/src/lib/observability/` — que core **no puede importar** (invierte la
dirección de dependencia funcional→core). Dos opciones:
  - **(A) Inyección por contexto (preferida).** Core define una interfaz mínima `track(name, props)`
    y un `ObservabilityProvider`/hook (`useObservability()`) que el host implementa contra su pipeline
    real de Mixpanel. La página en core llama `track` del contexto; si el host no provee nada, es
    no-op. Es el patrón menos acoplado y reutilizable por cualquier feature futura que core quiera
    instrumentar.
  - **(B) Prop/callback.** El host pasa `onTabSelected={client => trackMcpConnectTabSelected({client})}`
    como prop a `<ConnectionsLanding>`. Más simple, pero traslada el catálogo de eventos y el
    sanitizado al host y no escala si core suma más features instrumentadas.
  - En **ambos casos** el catálogo `MCP_CONNECT_TAB_SELECTED` y el fix de allowlist (`'client'` en
    `SAFE_EVENT_PROPERTY_KEYS`, `payload.js`) se quedan en el host, porque el pipeline Mixpanel es
    del host. Solo migra la *invocación*, no el sink.

**Paso 3 — Migrar `mcpClients.js` a core** ✅ HECHO (2026-07-13) (`packages/app-shell-core/src/lib/mcpClients.js`).
Es JS puro sin dependencias de entorno (`deriveServerName`, `buildMcpClients`, helpers de deep link
con `btoa`/`encodeURIComponent`). Mover el archivo + su test node (`mcpClients.test.js`, 21 casos).
Shim de re-export en el host. `detectMcpUrl()`/`detectBaseUrl()` **no** se migran acá: son helpers de
`AuthorizePage` (usan `window.location`), viajan con la página en el Paso 4.

**Paso 4 — Migrar `AuthorizePage.jsx` (`ConnectionsLanding` + `McpInstructions`) a core.** ✅ HECHO (2026-07-13).
Nota de ejecución: el test original de funcional se reescribió como **smoke-test de shim** (full-mount
con providers reales de core), no se conservó tal cual — sus mocks `@/` dejaron de interceptar los
imports relativos de la página en core (`useAuth` estricto lanzaba `useAuth must be used within AuthProvider`).
La cobertura de comportamiento (23 casos) vive ahora en la copia de core.
  - Crear `packages/app-shell-core/src/pages/` (no existe) y mover el archivo.
  - Reapuntar imports internos: `@/auth/...`→`../auth/...`, `@/i18n`→`../i18n`, `@/components/ui/*`→
    `../components/ui/*`, `@/lib/mcpClients.js`→`../lib/mcpClients.js`, y la telemetría al seam del
    Paso 2.
  - Agregar la entrada de export en `package.json` de core:
    `"./pages/AuthorizePage.jsx": "./src/pages/AuthorizePage.jsx"` (o un barrel `./pages`).
  - En `schema_forge`, reemplazar `tools/app-shell/src/pages/AuthorizePage.jsx` por un shim:
    `export { default } from '@etendosoftware/app-shell-core/pages/AuthorizePage.jsx';`
    `runtime-routes.jsx` sigue haciendo `lazy(() => import('./pages/AuthorizePage.jsx'))` sin cambios.
  - Mover también el test `AuthorizePage.vitest.jsx` a core (23 casos) — al vivir en core, el host
    ya no lo corre; validar que el mock de `useUI`/observability sigue funcionando con el seam nuevo.
  - **La mitad OAuth de la página (consentimiento, la que se ve CON params) viaja entera sin
    bloqueantes nuevos** (verificado 2026-07-08): `useSearchParams` usa `react-router-dom ^7`, que ya
    es peerDependency de core y core ya consume internamente (`ShellLayout`, `AppShellRuntime`);
    `createApiFetch` viene de `@/auth/api.js` (ya re-export de core); `window.location`,
    `import.meta.env.VITE_API_BASE` y `fetch('/oauth2/authorize')` [ruta relativa al origin] son
    autocontenidos y funcionan igual servidos desde core. O sea la página se migra como UNA sola
    unidad — no hay que partir landing y consentimiento.

**Paso 5 — i18n.** ✅ HECHO (2026-07-13) — verificado: paridad `oauth*` perfecta entre `en_US`/`es_ES`
y todas las claves usadas (literales + `oauthConnectTab<Id>` dinámicos) presentes en ambos. No mover el JSON. Verificar que las claves `oauthConnect*` (incluidas las 5
nuevas de la tab "Otros": `oauthConnectOtherAutoHeading/ManualHeading/Step1..3`) siguen en los 3
locales del host y que el `LocaleProvider` las inyecta. Agregar una nota en
`docs/repo-topology.md`: "las claves de una página que vive en core pueden seguir en el host".

**Paso 6 — Release + bump (el "peaje" de latencia).** ⏳ PENDIENTE (2026-07-13 — lo gestiona el usuario).
`publish-private-packages.yml` es `workflow_dispatch` (release manual de core) → `bump-core-on-release.yml`
abre el PR de bump del pin en `schema_forge` (merge humano) → recién ahí live. Durante desarrollo,
validar todo el encadenamiento con `LOCAL_CORE=1` / `make dev-local-core` antes de publicar, para no
gastar ciclos de release en errores de imports.

### Estrategia de shims (clave para hacerlo incremental y sin big-bang)

Cada paso deja en `schema_forge` un re-export de una línea del artefacto movido, exactamente como ya
existe para `@/auth` e `@/i18n`. Ventaja: ningún otro consumidor local se entera del move, cada PR es
chico y revisable, y si algo falla se revierte el shim sin tocar core. Los shims se pueden limpiar
más adelante (oportunísticamente) reapuntando los imports directos a `@etendosoftware/app-shell-core/...`.

### Riesgos / checklist de verificación post-migración

- [ ] `make dev-local-core` levanta y `/authorize` (sin params OAuth) renderiza la landing con tabs.
- [ ] `/authorize?...` (con params) sigue mostrando la pantalla de consentimiento — la parte OAuth de
      `AuthorizePage` viaja junto y no se debe romper.
- [ ] El evento `mcp_connect_tab_selected` sigue llegando a Mixpanel con `client` (verificar que el
      seam del Paso 2 no volvió a romper el allowlist de `payload.js`).
- [ ] Los 3 tests (`mcpClients.test.js`, `copy-button.vitest.jsx`, `AuthorizePage.vitest.jsx`) corren
      verdes desde core (`pnpm --filter app-shell-core test` / `test:vitest`).
- [ ] `deriveServerName()` sigue devolviendo el alias correcto por entorno (local/staging/exp/prod).
- [ ] `domain-boundary-check.yml` sigue no-op (no hay gate que valide el move) — la revisión de la
      frontera es manual contra `docs/repo-topology.md`.
