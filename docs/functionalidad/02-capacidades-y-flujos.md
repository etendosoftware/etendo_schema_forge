# Capacidades y flujos

Nota de arquitectura previa a todo lo demás: la UI de onboarding (`OnboardingPage.jsx`) es solo un wrapper de configuración; el motor real (pasos, máquina de estados, llamadas a API) vive en el paquete vendorizado `@etendosoftware/etendo-go-core` (`node_modules/@etendosoftware/etendo-go-core/src/onboarding/*`). Todo el backend de estas 4 áreas vive en `etendo_core/modules/com.etendoerp.go`, que es su propio repo Git anidado (puede estar en una rama distinta a la de `schema-forge`).

---

# Parte 1 — Creación de cuenta (onboarding)

## CAP-ONB-01 — Registro de nueva cuenta (email + password)

- **Actor:** Visitante anónimo.
- **Superficie:** `/onboarding` → `RegisterStep` (`node_modules/@etendosoftware/etendo-go-core/src/onboarding/steps/RegisterStep.jsx`).
- **Objetivo:** Crear una cuenta de plataforma (`ETGO_ACCOUNT`), todavía sin tenant.
- **Precondiciones:** Sin `sf_platform_token` en localStorage. La vista por defecto de `/onboarding` es login; hay que hacer click en "¿No tienes cuenta? / Crear cuenta" (`OnboardingFlow.jsx:213-218`).
- **Trigger:** Submit del formulario de registro (`action-register-submit`).
- **Flujo principal:**
  1. Usuario completa Nombre (`#reg-name`, máx 60), Email (`#reg-email`, máx 60), Password (`#reg-password`, máx 128). El submit se habilita solo si `isStrongPassword(password) && isValidEmailFormat(email)` (`RegisterStep.jsx:322`).
  2. `registerAccount(...)` → `POST /sws/go/register`.
  3. Backend `EtendoGoJwtServlet.handleRegister` (líneas 394-490): valida campos no vacíos, formato de email, límites de longitud, fuerza de password (`PasswordPolicy.isStrong`: min 8 caracteres, mayúscula+minúscula+dígito+especial), unicidad del email. Hashea password (SHA-256+salt), genera token de sesión, crea la entidad `Account`, dispara email de "nueva cuenta" (best-effort), responde `201 {token, account:{id,email,name}}`.
  4. Frontend guarda `sf_platform_token` + `sf_platform_auth_method=password`, salta al paso `profile` con el nombre precargado.
- **Variantes / errores observables:**
  - [Hecho] `EMAIL_ALREADY_REGISTERED` (HTTP 400) → error inline, se queda en registro (`EtendoGoJwtServlet.java:454-458`; test `onboarding-register.integration.spec.js`).
  - [Hecho] `FIELD_TOO_LONG {field,max}` → mensaje localizado "El campo no puede superar los N caracteres" (`onboarding-length-limits.mocked.spec.js`).
  - [Hecho] `WEAK_PASSWORD` → mensaje localizado específico.
  - [Hecho] Los `maxLength` del lado cliente truncan en silencio antes del submit (sin banner de error).
  - [Hecho] El botón de submit permanece deshabilitado con campos vacíos o email mal formado.
- **Resultado esperado:** Fila nueva en `ETGO_ACCOUNT`, token de sesión emitido, usuario en el paso Profile con el nombre precargado.
- **Reglas / permisos implicados:** Ninguno (acción pública). Contraseña debe cumplir `PasswordPolicy`.
- **Datos / entidades tocadas:** `ETGO_ACCOUNT` (email, password_hash, name, session_token). Ningún `AD_Client`/`AD_User` todavía.
- **Evidencia:** `RegisterStep.jsx:130-173`; `EtendoGoJwtServlet.java:394-490`; `PasswordPolicy.java`; `fieldLimits.js`.
- **Huecos abiertos:** ninguno relevante más allá de los cubiertos por tests existentes.

## CAP-ONB-01b — Registro/login vía Google SSO (variante)

- **Actor:** Visitante anónimo.
- **Superficie:** Botón Google en `/onboarding`, visible solo si `VITE_GOOGLE_CLIENT_ID` está configurado (`sso.js:6-8`) — no hay feature flag separado, es pura config de entorno.
- **Objetivo:** Registrar/loguear sin password.
- **Precondiciones:** `VITE_GOOGLE_CLIENT_ID` configurado en el entorno desplegado.
- **Trigger:** Click en el botón de Google Identity Services.
- **Flujo principal:**
  1. `POST /sws/go/sso/google` con `{credential}`.
  2. `handleSsoLogin` (`EtendoGoJwtServlet.java:564-633`): verifica la aserción, busca/vincula/crea cuenta por identidad SSO, emite token de sesión con `authMethod:"sso"`.
- **Variantes / errores observables:** no relevados en detalle en esta pasada.
- **Resultado esperado:** Igual que CAP-ONB-01 pero sin password.
- **Reglas / permisos implicados:** Ninguno adicional.
- **Datos / entidades tocadas:** `ETGO_ACCOUNT` (con vínculo SSO).
- **Evidencia:** `sso.js:6-8`; `EtendoGoJwtServlet.java:564-633`.
- **Huecos abiertos:** [Ambigüedad] no se verificó si algún entorno desplegado real tiene `VITE_GOOGLE_CLIENT_ID` configurado — sin eso, esta capacidad no es alcanzable en absoluto.

## CAP-ONB-02 — Configurar perfil y empresa

- **Actor:** Cuenta de plataforma recién autenticada, sin tenant.
- **Superficie:** `ProfileStep.jsx` → `CompanyStep.jsx`.
- **Objetivo:** Recolectar los datos necesarios para aprovisionar un tenant (`AD_Client` + `AD_Org`).
- **Precondiciones:** Token válido; llegada fresca tras registro, o vía restauración de borrador, o vía login sin entornos.
- **Trigger:** Ninguno explícito (auto-ruteado); usuario hace click en Continuar/Empezar.
- **Flujo principal:**
  1. **Profile:** nombre completo (precargado, máx 60/40 según freelancer), país fijo (España), tipo de negocio (`company`|`freelancer`|`advisory`). Continuar habilitado solo si `isProfileStepValid` (`state.js:127-133`).
  2. **Company:** nombre de empresa (`clientName`, requerido salvo freelancer, que reutiliza `fullName`), NIF opcional (máx 20), dirección opcional (máx 60), sector. "Empezar" habilitado si `isCompanyStepValid` (`state.js:135-143`; en la práctica solo `clientName` es realmente obligatorio).
  3. Ambos pasos autoguardan un **borrador** vía `POST /sws/go/onboarding/draft` (debounce 1500ms) — ver CAP-ONB-05.
  4. Click en "Empezar" avanza a `setup-progress` (CAP-ONB-03).
- **Variantes / errores observables:** validaciones de longitud por campo (`fieldLimits.js`); freelancer no pide `clientName` separado.
- **Resultado esperado:** `stepData` en memoria (clientName, fullName, address, fiscalIdValue, countryCode, language, currency) listo para `POST /sws/go/onboarding`.
- **Reglas / permisos implicados:** Ninguno adicional a estar autenticado.
- **Datos / entidades tocadas:** Ninguno todavía (solo estado en memoria + borrador, ver CAP-ONB-05).
- **Evidencia:** `ProfileStep.jsx`; `CompanyStep.jsx`; `state.js:40-143`; `fieldLimits.js`.
- **Huecos abiertos:** ninguno relevante.

## CAP-ONB-03 — Aprovisionamiento del entorno (creación del tenant)

- **Actor:** Cuenta de plataforma con datos de perfil/empresa completos.
- **Superficie:** `SetupProgressStep.jsx` (UI de progreso animado, sin input del usuario).
- **Objetivo:** Crear un `AD_Client`/`AD_Org` funcional, con roles y dataset inicial, y loguear al usuario automáticamente.
- **Precondiciones:** `stepData` completo desde CAP-ONB-02.
- **Trigger:** Montaje del paso `setup-progress` → `POST /sws/go/onboarding` (stream NDJSON).
- **Flujo principal (backend, `handleOnboarding`, `EtendoGoJwtServlet.java:1193-2050`):**
  1. Resolver cuenta por bearer token.
  2. Parsear body (`clientName`, `currency`, `language`, `countryCode`, `address`, `fullName`, `fiscalIdValue`, `paymentToken`, `upgradeAction`); revalidar límites de longitud server-side.
  3. Resolver ISO de moneda → `AD_Currency`.
  4. **Chequeo de paywall** (`evaluatePaywall`) — no-op si el flag `tenant-upgrade` está apagado (ver Parte 2, CAP-CHK-05).
  5. Abrir stream NDJSON; hilo de heartbeat cada 10s (evita que un proxy/CDN corte por idle-timeout).
  6. `resolveOrCreateClient`: si ya existe un cliente con ese nombre y pertenece a esta cuenta, reanuda (retry idempotente); si pertenece a otra cuenta, falla duro ("Company name already in use" — aislamiento entre tenants); si no existe, `InitialClientSetup.createClient(...)` crea `AD_Client` + usuario/rol admin, luego sobreescribe el display name del admin con el `fullName` ingresado.
  7. `ensureRoles` — clona los 4 roles de negocio (Finance/Sales/Purchasing/Inventory) + `AD_Window_Access` desde el cliente template GOClient (`OnboardingRoleProvisioningService`).
  8. Si es un upgrade pago, marca el tenant como productivo (`TenantPlanService.markProductive`).
  9. `ensureOrganization` → `InitialOrgSetup.createOrganization(...)` crea `AD_Org` con contabilidad (clonando el plan de cuentas de otro org del mismo cliente/moneda vía `GoInitialOrgSetupAccountingHandler`), luego `applySocialName`.
  10. **`ensureOnboardingDataset`**, en este orden exacto (cualquier excepción aborta la cadena y dispara rollback): importar dataset de ejemplo → cablear contabilidad → cablear control de períodos → generar secuencias → marcar org listo → configurar datos fiscales → cablear info de org → asegurar cliente por defecto → programar sync bancario (no fatal) → parche de columnas faltantes en grupo contable (ETP-4720) → registrar baseline de data-fix (una falla SQL real acá SÍ propaga, por diseño).
  11. `commitDalChanges("onboarding")` — **un único commit todo-o-nada** para toda la cadena.
  12. Post-commit: activa el schedule de sync bancario, limpia el borrador de onboarding, envía email "entorno listo", stream final `{success:true}`.
  13. Ante cualquier excepción previa al commit: rollback + stream `{success:false, error, code?}`.
- **Frontend en éxito:** reintenta `fetchEnvironments` hasta 3 veces (2s) hasta ver el entorno nuevo, luego `loginToEnvironment(...)` → `GET /sws/go/login` → JWT de Etendo → limpia caches de service worker → corre `checkReadiness` (ver CAP-ONB-04 nota) → redirige a `/dashboard`.
- **Variantes / errores observables:**
  - [Hecho] Colisión de nombre de empresa con otra cuenta → bloqueo duro, mensaje distinto.
  - [Hecho] Cualquier excepción en un paso de aprovisionamiento → línea de progreso marcada `error`, `{success:false}`, claves crudas de AD (`@CreateClientFailed@`, etc.) traducidas client-side, nunca mostradas crudas.
  - [Hecho] Usuario puede **Reintentar** (misma cadena idempotente) o **Volver**.
  - [Hecho] Falla de "readiness" tras el auto-login (selectores de factura/términos de pago no usables) → NO redirige a `/dashboard`, muestra "todavía no está listo para facturar".
  - [Hecho] El test de integración real (`onboarding-register.integration.spec.js`) corre esto contra un backend vivo, timeout de 240s, con diagnóstico extenso en falla — señal de que este camino es lento/frágil en la práctica.
- **Resultado esperado:** `AD_Client`/`AD_Org` totalmente aprovisionados, admin autologueado, redirigido a `/dashboard`.
- **Reglas / permisos implicados:** Aislamiento entre cuentas por nombre de cliente; commit atómico todo-o-nada.
- **Datos / entidades tocadas:** `AD_Client`, `AD_Org`, `AD_User`, `AD_Role`, `AD_Window_Access`, `AD_OrgInfo`, tablas de contabilidad, `C_BPartner` (cliente por defecto), `C_BP_Group_Acct`, secuencias, `ETGO_DATA_FIX_HISTORY`, `AD_Process_Request` (sync bancario).
- **Evidencia:** `EtendoGoJwtServlet.java:1193-2050`; `SetupProgressStep.jsx`.
- **Huecos abiertos:**
  1. [Ambigüedad] Si el stream NDJSON se corta por un idle-timeout de proxy/CDN después de que el backend ya comprometió los cambios, la UI puede reportar un falso fallo con el tenant ya creado del lado del servidor — código explícito de heartbeat + `writer.checkError()` sugiere que esto es un riesgo conocido, no confirmado qué ve el usuario en ese caso exacto.
  2. [Ambigüedad] `docs/etendo-ad/onboarding-and-datafixes-map.md` describe menos pasos de los que tiene el código actual — tratar ese doc como histórico, no autoritativo en números de línea/cantidad de pasos.
  3. [Ambigüedad] Rama `advisory` del tipo de negocio comparte el camino de `company` pero no está separadamente asertada en los specs leídos.

## CAP-ONB-04 — Entrada automática a entorno tras login (ruteo post-login)

- **Actor:** Cuenta de plataforma con ≥1 entorno.
- **Superficie:** `LoginStep` (éxito) → `routeByEnvironments` (`OnboardingFlow.jsx:131-198`) → eventualmente `EnvSelectStep.jsx`.
- **Objetivo:** Meter al usuario en un tenant sin fricción.
- **Precondiciones:** Login exitoso, o montaje inicial con `sf_platform_token` válido.
- **Trigger:** Login exitoso.
- **Flujo principal:**
  1. `GET /sws/go/environments` → entornos ordenados **productivo primero, luego alfabético** (`handleEnvironments`, `EtendoGoJwtServlet.java:1057-1119`).
  2. 0 entornos → restaura borrador de onboarding o va a `profile` (usuario nuevo).
  3. ≥1 entorno → auto-login al que coincida con `localStorage.sf_last_environment`, o al primero (`envs[0]`) — "el login nunca se detiene en un selector", comentario explícito en el código.
  4. `EnvSelectStep.jsx` existe como selector manual, pero **no es el camino por defecto**: solo se llega ahí si el auto-login al entorno recordado/primero falla.
- **Variantes / errores observables:** `sf_last_environment` está deliberadamente excluido de las claves que se limpian en logout, para recordar la preferencia entre sesiones.
- **Resultado esperado:** Usuario dentro de un tenant sin decisión manual, salvo que el auto-login falle.
- **Reglas / permisos implicados:** Ninguno adicional.
- **Datos / entidades tocadas:** Ninguno (solo lectura + localStorage).
- **Evidencia:** `OnboardingFlow.jsx:125-198`; `EnvSelectStep.jsx`; `state.js:58-111`.
- **Huecos abiertos:** ninguno relevante.

## CAP-ONB-05 — Reanudar onboarding tras logout (persistencia de borrador)

- **Actor:** Cuenta de plataforma a mitad de onboarding (paso Profile o Company).
- **Superficie:** Acción de logout (`data-testid="onboarding-logout"`) visible en headers de Profile/Company/SetupProgress; ruta pública `/logout`.
- **Objetivo:** Permitir que el usuario se retire a mitad de registro sin perder lo ya ingresado, y retomarlo exactamente donde quedó.
- **Precondiciones:** Estar en un paso "persistible" (`profile`=draftStep 1, `company`=draftStep 2 — únicos dos que persisten).
- **Trigger:** Click/activación de logout, o navegación directa a `/logout?returnTo=...`.
- **Flujo principal:**
  1. Cada edición de campo en un paso persistible agenda un guardado debounced (1500ms) de `POST /sws/go/onboarding/draft`.
  2. En logout, se **flushea el borrador pendiente primero** (best-effort — un flush fallido nunca bloquea el logout), luego limpia la sesión local y navega a `login`.
  3. Backend `handleSaveOnboardingDraft` (`EtendoGoJwtServlet.java:964-1021`) sanitiza el borrador a una whitelist de campos, capea el JSON serializado a 4000 caracteres, lo persiste en la fila `Account`.
  4. En el próximo login, `restoreOnboardingDraft` pide `GET /sws/go/onboarding/draft`, mapea `draft.step` (1|2) al paso correspondiente, mergea en `defaultForm`, muestra un banner "borrador restaurado", y salta directo a ese paso.
  5. Logout **durante aprovisionamiento activo** (`setup-progress`) usa un guard de ref montado, para que un stream que termina después del logout no pueda crear una sesión nueva ni redirigir.
  6. Un guardado de borrador fallido muestra un warning localizado, pero el usuario igual llega a Login (fail-open, nunca atrapa al usuario).
- **Variantes / errores observables:** navegación directa a `/logout?returnTo=/logout` limpia sesión y redirige seguro a `/onboarding` sin loop (`isSafeLocalReturnTo` rechaza `/onboarding`/`/login` como destinos inseguros).
- **Resultado esperado:** El usuario puede cerrar sesión en cualquier momento del registro y retomarlo exactamente donde quedó.
- **Reglas / permisos implicados:** Whitelist de campos persistibles; cap de tamaño.
- **Datos / entidades tocadas:** `ETGO_ACCOUNT` (JSON del borrador, campos whitelisteados, máx 4000 chars).
- **Evidencia:** `e2e/tests/flows/onboarding-logout-resume.mocked.spec.js` (6 tests); `draftPersistence.js`; `logout.js`; `EtendoGoJwtServlet.java:943-1049`; `docs/plans/2026-07-17-onboarding-logout-escape-plan.md` (verificado, coincide con lo shippeado).
- **Huecos abiertos:** ninguno relevante — capacidad bien cubierta por tests.

## CAP-ONB-06 — Login con cuenta existente + recuperación de contraseña

- **Actor:** Cuenta de plataforma existente.
- **Superficie:** `LoginStep.jsx`, con 3 subvistas: `login` | `forgot-password` | `reset-password`.
- **Objetivo:** Autenticarse, o recuperar acceso si olvidó la contraseña.
- **Precondiciones:** Cuenta ya registrada (para login); para reset, poseer el email de la cuenta.
- **Trigger:** Submit del form de login, o del form de "olvidé mi contraseña", o navegación con `?resetToken=...`.
- **Flujo principal:**
  1. Login: `POST /sws/go/login` — verifica `hasLocalPassword` + hash de password, emite nuevo token de sesión.
  2. Forgot password: `POST /sws/go/password-reset/request` — respuesta siempre neutral exista o no el email (anti-enumeración), TTL de token de 30 minutos.
  3. Reset confirm: URL con `?resetToken=...` rutea directo a la subvista `reset-password` → `POST /sws/go/password-reset/confirm` → limpia sesión local, muestra éxito, vuelve a login.
- **Variantes / errores observables:** errores de login mapeados a mensajes fijos localizados, nunca se muestra el mensaje crudo del backend.
- **Resultado esperado:** Sesión nueva tras login correcto; contraseña actualizada tras reset válido.
- **Reglas / permisos implicados:** Anti-enumeración de emails en forgot-password.
- **Datos / entidades tocadas:** `ETGO_ACCOUNT` (password_hash, reset token + expiración).
- **Evidencia:** `LoginStep.jsx:152-238`; `EtendoGoJwtServlet.java:654-844`; `onboarding-validations.mocked.spec.js`.
- **Huecos abiertos:** ninguno relevante.

---

# Parte 2 — Upgrade de cuenta (checkout de pago con Stripe)

Nota importante: `docs/feature-flags.md` (sección "tenant upgrade flow") y `docs/paid-tenant-infrastructure.md` describen la implementación **anterior** (mock-card en el navegador). Fueron reemplazados por Stripe Hosted Checkout real (ETP-4800, commits `1d73eb8f3`/`40a82bbd`, ago-2026). Lo que sigue describe el código actual.

## CAP-CHK-01 — Abrir Upgrade y resolver qué rama mostrar

- **Actor:** Cuenta autenticada (dueña de al menos un token de sesión/plataforma), detrás del flag `tenant-upgrade` (solo gatea el ítem de menú, no la ruta).
- **Superficie:** `tools/app-shell/src/pages/UpgradePage.jsx`, ruta `/upgrade` (registrada incondicionalmente).
- **Objetivo:** Decidir si el usuario ve "tu primer tenant es gratis", el checkout de pago, o un checkout degradado-pero-usable.
- **Precondiciones:** Usuario autenticado; `getCheckoutToken()` resuelve un token desde `sf_auth_token` (preferido) o `sf_platform_token` (fallback).
- **Trigger:** Navegar a `/upgrade`.
- **Flujo principal:**
  1. `UpgradePage` monta, `accountState='loading'`.
  2. Sin token → `accountState='unavailable'`.
  3. `fetchEnvironments(...)` → `GET /sws/go/environments`.
  4. Éxito → `environments` poblado, `accountState='ready'`.
  5. Falla → `accountState='unavailable'` — **deliberadamente** igual muestra el checkout ("el backend es autoritativo, una consulta fallida no debe bloquear un upgrade legítimo").
  6. `hasNoTenants` (0 entornos) → Rama A, panel "primer tenant gratis", enlaza a `/onboarding`.
  7. Si no → Rama C, tarjeta de checkout, pre-seleccionando `upgradeAction:'convert-demo'` si existe un entorno demo (no-productivo).
- **Variantes / errores observables:**
  - [Hecho] Reenviar un `clientName` que coincide con un entorno ya propio se bloquea client-side antes de cualquier llamada de red.
- **Resultado esperado:** Exactamente un panel (primer-tenant-gratis / checkout / cargando) se muestra.
- **Reglas / permisos implicados:** Sin chequeo de rol más allá de "tiene un token de cuenta resolvible" — es a nivel de cuenta, no de un rol específico de tenant.
- **Datos / entidades tocadas:** Ninguno (`GET /sws/go/environments` de solo lectura).
- **Evidencia:** `UpgradePage.jsx:203-390`; `EtendoGoJwtServlet.java:1057-1119`.
- **Huecos abiertos:** ninguno relevante.

## CAP-CHK-02 — Crear sesión de Stripe Hosted Checkout

- **Actor:** Cuenta autenticada, Rama C (ya posee ≥1 tenant, quiere uno adicional pago o convertir el demo).
- **Superficie:** Formulario `upgrade-checkout` en `UpgradePage.jsx`.
- **Objetivo:** Obtener una URL de redirect hosteada por Stripe sin que el navegador vea precio/moneda/producto.
- **Precondiciones:** Token válido; `clientName` no vacío y no ya-propio.
- **Trigger:** Submit del formulario de checkout.
- **Flujo principal:**
  1. `POST /sws/go/checkout/sessions` con `{action:'productive-tenant', upgradeAction, clientName, language}` — **sin precio, moneda ni datos de tarjeta** (asertado por test unitario explícito que verifica que el body NO matchea `/cardNumber|paymentToken|priceId|amount/`).
  2. Backend `handleCheckoutSession` resuelve la cuenta autenticada, exige `clientName` no vacío.
  3. `HostedCheckoutService.createSession(...)`: genera un `requestId` (UUID) server-side, arma `success_url`/`cancel_url` apuntando de vuelta a `/upgrade?checkout=success|cancelled&requestId=...`, y postea **directo a `https://api.stripe.com/v1/checkout/sessions`** (API real de Stripe) con `mode`, `line_items[0][price]` (price ID server-side), `client_reference_id`, `customer_email`, y `metadata` con account_email/client_name/request_id.
  4. Respuesta `{requestId, checkoutUrl, mode}` (HTTP 201): se guarda en `sessionStorage` (nombre/acción/timestamp del tenant pendiente) y el navegador hace `window.location.assign(checkoutUrl)` — **redirect de página completa al dominio de Stripe**.
- **Variantes / errores observables:**
  - [Hecho] Config incompleta (`CheckoutConfiguration.isConfigured()` false — falta secret key, price ID o webhook secret) → **HTTP 503 `CHECKOUT_NOT_CONFIGURED`**.
  - [Hecho] Cualquier otro error (Stripe rechaza el request, falla de red) → **HTTP 502 `CHECKOUT_PROVIDER_ERROR`**.
  - [Hecho] Respuesta 2xx sin `checkoutUrl`/`requestId` → frontend lanza error `checkoutUnavailable`.
  - [Hecho] E2E: 503 → se muestra `upgrade-error`, se queda en `upgrade-checkout`, nunca se llama a onboarding.
- **Resultado esperado:** El navegador abandona la SPA por completo y aterriza en `checkout.stripe.com`.
- **Reglas / permisos implicados:** Precio/moneda/producto 100% resueltos server-side, sin override posible desde el cliente.
- **Datos / entidades tocadas:** Ninguna escritura en Etendo todavía. Se crea remotamente un objeto Checkout Session en Stripe (fuera de Etendo).
- **Evidencia:** `lib/upgrade/api.js:18-40`; `HostedCheckoutService.java:28-64`; `CheckoutConfiguration.java`; `EtendoGoJwtServlet.java:307-333`.
- **Huecos abiertos:** ninguno adicional a los de CAP-CHK-05 (config/paywall).

## CAP-CHK-03 — Volver de Stripe y confirmar el pago antes de aprovisionar

- **Actor:** Misma cuenta, ya de vuelta de la página de Stripe.
- **Superficie:** `useEffect` de reanudación en `UpgradePage.jsx`.
- **Objetivo:** Confirmar contra el backend (no contra el redirect en sí) que el pago fue reconocido, y solo entonces correr el aprovisionamiento real.
- **Precondiciones:** URL con `?checkout=success&requestId=...`; `sessionStorage` conserva el nombre/acción del tenant pendiente (sobrevive al redirect de página completa).
- **Trigger:** Carga de página con `checkout=success`.
- **Flujo principal:**
  1. Si falta `requestId`/token/nombre de tenant → error `upgradeCheckoutCreationFailed`, se detiene.
  2. `phase='running'`.
  3. Loop de polling: hasta **60 intentos, 1 por segundo** (~60s tope) llamando `GET /sws/go/checkout/sessions/{requestId}` hasta que `status !== 'pending'`.
  4. Backend busca `CheckoutPaymentRegistry.find(requestId, accountEmail)` — solo devuelve `{status:"paid"}` si un **webhook previo** ya registró ese par `(requestId, email)` exacto; si no, `{status:"pending"}`.
  5. Si el loop termina sin `status==='paid'` → error "Checkout payment is not confirmed", vuelve a `phase='form'`.
  6. Si pagado → corre el aprovisionamiento (mismo `POST /sws/go/onboarding` NDJSON de CAP-ONB-03), enviando el `requestId` de Stripe como `paymentToken`.
  7. Éxito → limpia `sessionStorage`, resetea la URL, `phase='success'`.
- **Variantes / errores observables:**
  - **[Ambigüedad] Ventana de polling dura (60s), sin reintento posterior.** Si el webhook de Stripe llega después de esos 60s, `CheckoutPaymentRegistry` puede marcar "paid" un instante más tarde, pero la UI ya reportó fallo y no hay forma de "volver más tarde" salvo reenviar todo el formulario de checkout de nuevo. No cubierto por ningún test.
  - [Hecho] El estado de pago solo tiene dos valores posibles: `"pending"` o `"paid"` — no existe `expired`/`cancelled`/`failed` en el backend, un modelo de estados más chico que lo que describía el PRD original.
- **Resultado esperado:** El aprovisionamiento solo arranca después de que el **backend** (no el redirect del navegador) considera el pago confirmado.
- **Reglas / permisos implicados:** `CheckoutPaymentRegistry.find` está scopeado por `accountEmail` — otra cuenta pidiendo el mismo `requestId` recibe `null`.
- **Datos / entidades tocadas:** Ninguna nueva en DB (solo lookup en memoria — ver hueco transversal en `03-reglas-estados-y-validaciones.md`).
- **Evidencia:** `UpgradePage.jsx:258-315`; `lib/upgrade/api.js:42-53`; `EtendoGoJwtServlet.java:335-349`; `CheckoutPaymentRegistry.java:52-57`.
- **Huecos abiertos:** ver arriba (ventana de 60s) y §Checkout en `03-reglas-estados-y-validaciones.md`.

## CAP-CHK-04 — Webhook de Stripe confirma el pago server-side

- **Actor:** Servidores de Stripe (llamador HTTP no autenticado, verificado solo por firma HMAC).
- **Superficie:** `POST /sws/go/checkout/webhook`.
- **Objetivo:** Registrar que un `requestId`/cuenta/nombre de cliente fue efectivamente pagado, independiente de si el navegador ya volvió o no.
- **Precondiciones:** `ETGO_CHECKOUT_WEBHOOK_SECRET` configurado; el endpoint de Stripe apunta a esta URL.
- **Trigger:** Stripe emite `checkout.session.completed` o `checkout.session.async_payment_succeeded`.
- **Flujo principal:**
  1. Lee el body crudo completo.
  2. `CheckoutWebhookVerifier.verify(...)`: parsea `t=…,v1=…` del header `Stripe-Signature`, computa HMAC-SHA256, compara, rechaza si el timestamp tiene más de 300s de diferencia.
  3. Firma inválida → **HTTP 400 `INVALID_CHECKOUT_SIGNATURE`**.
  4. `CheckoutPaymentRegistry.claimEvent(eventId)` (dedup por id de evento de Stripe) — evento ya reclamado → responde `200` sin reprocesar.
  5. Para los 2 tipos de evento reconocidos, extrae `metadata.request_id/account_email/client_name` y llama `recordPaid(...)`.
  6. Siempre responde `200 {"received":true}` en evento reconocido/ignorable, o `400 INVALID_CHECKOUT_PAYLOAD` en error de parseo.
- **Variantes / errores observables:**
  - **[Hecho] `CheckoutWebhookProcessor` (la clase con tests dedicados) es código muerto en producción** — el servlet reimplementa la misma lógica de verificación+dedup inline, sin usar esa clase. Sus tests no son una guardia de regresión para el comportamiento real.
  - **[Inferencia] Un evento con `id` vacío/ausente podría ser ACKeado en silencio como 200** (tratado como "duplicado") en vez de rechazado como `INVALID_PAYLOAD`, a diferencia de lo que el código *testeado* (pero no usado) haría. Sin test que cubra este caso exacto contra el servlet real.
  - **[Inferencia] Riesgo de fragilidad de firma con bytes no-ASCII** — el body se lee como `String` vía `Reader` (charset del contenedor) y luego se re-codifica a UTF-8 para el HMAC; si el charset del reader difiere de UTF-8 (falta `charset` en el `Content-Type` de Stripe), un `client_name` con tilde/ñ podría hacer fallar la verificación de firma. No confirmado contra un evento real de Stripe.
- **Resultado esperado:** `CheckoutPaymentRegistry.recordPaid` es el **único** lugar que pasa un request de "pending" a "paid" — el redirect del navegador solo nunca lo hace.
- **Reglas / permisos implicados:** Sin auth por token — la firma HMAC ES la autenticación.
- **Datos / entidades tocadas:** Mapas en memoria de proceso `CheckoutPaymentRegistry.PAYMENTS`/`EVENTS` (no persistidos — ver hueco transversal).
- **Evidencia:** `EtendoGoJwtServlet.java:351-385`; `CheckoutWebhookVerifier.java`; `CheckoutPaymentRegistry.java:28-44`.
- **Huecos abiertos:** los 3 marcados [Hecho]/[Inferencia] arriba, más el hueco transversal de no-persistencia (ver `03-reglas-estados-y-validaciones.md`).

## CAP-CHK-05 — Paywall backend + marcar tenant como "productive"

- **Actor:** Backend únicamente (invocado dentro de `handleOnboarding`).
- **Superficie:** `POST /sws/go/onboarding` (mismo endpoint que CAP-ONB-03 — solo cambia el *significado* de `paymentToken`).
- **Objetivo:** Rechazar la creación de tenant para una cuenta que ya posee uno y no pagó; marcar el plan de un tenant pago.
- **Precondiciones:** Flag `tenant-upgrade` encendido para la cuenta.
- **Trigger:** `handleOnboarding` llega al chequeo de paywall, antes de abrir el stream NDJSON.
- **Flujo principal (`evaluatePaywall`):**
  1. Flag apagado → `ALLOWED`, `paid=false` (comportamiento idéntico al pre-feature).
  2. Flag encendido: calcula si la cuenta ya posee un tenant, si está reanudando uno propio, si es conversión de demo.
  3. `TenantPaywallService.decide(...)`:
     - Sin tenants propios, o reanudando (no-conversión) → `ALLOWED`.
     - Si no: primero chequea `CheckoutPaymentRegistry.isPaidFor(paymentToken, accountEmail, clientName)` (true solo si un webhook ya registró ese par) → `ALLOWED`.
     - **Si no, cae al fallback `MockPaymentService.validate(paymentToken)`** — `APPROVED` si el token matchea `^mock-paid-[0-9a-f]+$`, `MISSING_TOKEN` si vacío, si no `DECLINED`.
  4. Bloqueado → **HTTP 402** `{"error":"payment_required"}` — no arranca el aprovisionamiento.
  5. Permitido y es upgrade pago: `TenantPlanService.markProductive(...)` escribe un `AD_Preference` (`ETGO_TenantPlan="productive"`) dentro de la misma transacción de onboarding — **best-effort**: traga su propia excepción, así que un tenant pago puede terminar sin marcar y leerse luego como `"free"`.
- **Variantes / errores observables:**
  - **[Hecho] El backdoor de pago simulado sigue completamente vivo en el backend.** `MockPaymentService`/el regex `^mock-paid-[0-9a-f]+$` son el fallback en `TenantPaywallService.decide()` cada vez que `CheckoutPaymentRegistry.isPaidFor` da `false`. Como `paymentToken` es un string plano que el caller manda en el JSON de `POST /sws/go/onboarding`, y ese endpoint no exige haber pasado antes por `/checkout/sessions`, **cualquier cuenta autenticada puede armar a mano `{"paymentToken":"mock-paid-deadbeef", ...}` y pasar el paywall sin tocar Stripe**. Confirmado por test unitario que sigue asertando esto como comportamiento esperado.
  - [Hecho] `markProductive` fallando se loguea, no se surface — un tenant pago puede quedar mal marcado sin que nadie se entere en el momento.
- **Resultado esperado:** El aprovisionamiento procede (cadena NDJSON sin cambios) y, solo para un upgrade genuinamente pago, el `AD_Preference(ETGO_TenantPlan)` del tenant nuevo/convertido queda en `productive`.
- **Reglas / permisos implicados:** El paywall es a nivel de **cuenta**, no de rol de Etendo — cualquier cuenta, sin importar su rol AD, puede intentar un upgrade; el único gate es cantidad de tenants propios + token de pago.
- **Datos / entidades tocadas:** `AD_Preference` (`ETGO_TenantPlan`).
- **Evidencia:** `EtendoGoJwtServlet.java:1193-1334,1392-1445`; `TenantPaywallService.java`; `MockPaymentService.java`; `TenantPlanService.java`.
- **Huecos abiertos:** el backdoor de `mock-paid-*` (ítem #2 de las ambigüedades principales en `INDEX.md`) — candidato a escalar como hallazgo de seguridad real, no solo documental.

---

# Parte 3 — Múltiples roles

Hay **dos sistemas de "rol" sin relación directa** en este código, y confundirlos es la fuente de error más probable para un tester:

1. **Multi-rol/multi-org clásico de Etendo** (`AD_Role`, `AD_User_Roles`, `roleList` en la respuesta de login) — capacidad nativa donde un usuario *podría* tener varias filas `AD_Role`. La SPA de Go auto-elige `roleList[0]` al login y **no tiene UI para cambiar de rol en plena sesión hoy**.
2. **El modelo de rol a nivel de producto de Schema-Forge/NEO** — cada tenant tiene exactamente 5 roles fijos (client-admin + Finance/Sales/Purchasing/Inventory), un usuario tiene **como máximo un rol activo a la vez** (enforced server-side), asignable solo desde la ventana `User`, y es lo que el backend NEO Headless usa realmente para filtrar ventanas/procesos/capacidades en cada request.

## CAP-ROL-01 — Ver el resumen de roles del tenant ("Configuración > Roles")

- **Actor:** Usuario con rol admin o client-admin del tenant.
- **Superficie:** `/roles` → `RolesOverviewPage.jsx`, entrada de menú "Configuración > Roles".
- **Objetivo:** Ver, de un vistazo, los 5 roles fijos del tenant, cuántos usuarios tiene cada uno, y qué ventanas de Etendo GO puede alcanzar cada uno (nivel `full`/`read-only`).
- **Precondiciones:** `capabilities.isAdminOrClientAdmin === true` para el rol activo de la sesión.
- **Trigger:** Click en el ítem de menú "Roles".
- **Flujo principal:**
  1. `filterMenuGroupsByAccess` oculta el ítem "Roles" del menú a menos que `capabilities.isAdminOrClientAdmin === true`.
  2. Al montar, `fetchRolesOverview()` → `GET /sws/neo/rolesoverview` con el JWT del usuario actual.
  3. Backend (`SFRolesOverview.java`) resuelve el rol actual **antes** de entrar en modo admin; si no es admin/client-admin, devuelve `{roles: []}` — **denegación silenciosa, no 403**.
  4. Si autorizado: resuelve los 5 roles fijos del cliente del caller, cuenta usuarios activos por rol, lista ventanas alcanzables por rol vía `AD_Window_Access` intersectado con las specs `W` activas de `ETGO_SF_SPEC`.
  5. Frontend renderiza cada rol como tarjeta con nombre/descripción curados, badge de usuarios asignados, badges de ventanas con su tier.
- **Variantes / errores observables:**
  - [Hecho] `roles.length===0` → tarjeta "sin acceso" (defensa en profundidad — el backend ya filtró).
  - [Hecho] Error de red/parse → tarjeta de error con "Reintentar".
  - [Hecho] Sin acciones de edición/creación/borrado en ninguna parte de la página — es puramente informativa.
- **Resultado esperado:** Hasta 5 tarjetas de rol con nombre traducido, descripción, badge de usuarios, badges de ventanas alcanzables.
- **Reglas / permisos implicados:** Gate doble — frontend oculta el menú (defensa en profundidad), backend deniega con lista vacía si el caller no es admin/client-admin (enforcement real).
- **Datos / entidades tocadas:** `AD_Role`, `AD_User_Roles` (conteo), `AD_Window_Access`, `ETGO_SF_SPEC`.
- **Evidencia:** `RolesOverviewPage.jsx:1-209`; `rolesApi.js:1-80`; `SFRolesOverview.java:93-337` (test: `SFRolesOverviewTest.java`, 14 tests); `e2e/tests/flows/roles-overview.mocked.spec.js`.
- **Huecos abiertos:** [Ambigüedad] deep-link directo a `/roles` como no-admin no se puede probar en modo mock (limitación del mock de fetch) — solo cubierto por test unitario Java + test React por separado, nunca end-to-end contra un servidor real.

## CAP-ROL-02 — Asignar / cambiar los roles de un usuario (composición multi-rol, ETP-4906)

- **Actor:** Usuario con acceso de escritura a la ventana `User` (gateado por `AD_Window_Access` estándar, no por la capability admin-only de CAP-ROL-01).
- **Superficie:** Ventana `User` → control custom `AssignTemplateRolesControl.jsx` (header, chips multi-select) + tab custom "Roles del usuario" (`UserRolesTab.jsx`, matriz de permisos en vivo) + columna de chips y filtro de rol en el grid de usuarios (`RoleChipsCell.jsx`/`RoleFilterControl.jsx`/`UserHeaderTable.jsx`). Reemplaza el control single-select `AssignRoleControl.jsx` (ETP-4512) que existía antes.
- **Objetivo:** Componer 1+ roles-plantilla de sistema (Finanzas/Ventas/Compras/Inventario) sobre el rol personal del usuario, con preview de permisos antes de guardar.
- **Precondiciones:** Editar un usuario existente (no aplica en creación — nunca se llama a `SFAssignUserRoles` antes de que exista un `AD_User_ID`).
- **Trigger:** Togglear chips de rol en el control y guardar (Guardar).
- **Flujo principal:**
  1. Al abrir un usuario existente, el frontend llama `fetchUserRoleAssignments(userId)` (`GET /sws/neo/userroleassignments?UserId=...`) para precargar los roles-plantilla ya aplicados.
  2. El control muestra los roles seleccionados como chips removibles (+N si hay overflow) y una lista de checkboxes con las opciones de `SFRolesOverview` (excluyendo el rol Admin — nunca es seleccionable como plantilla). Cada toggle es **local, sin llamada de red** — solo actualiza un estado de selección compartido (`roleSelectionContext.js`) que también lee el tab "Roles del usuario" para su matriz en vivo (0 llamadas extra por toggle).
  3. Al hacer click en Guardar, `windows/custom/user/index.jsx` compara la selección local contra la aplicada al cargar; si cambió, llama `saveUserRoleAssignments(userId, templateRoleIds)` → `SFAssignUserRoles`, que resuelve/crea el rol personal del usuario y reconcilia sus filas `AD_Role_Inheritance` contra el set completo deseado (llamada de reconciliación, no incremental).
  4. El grid de usuarios (`/user`) muestra los roles aplicados de cada fila como chips (`RoleChipsCell`, vía el mapa bulk de `fetchUserRoleAssignments()` sin `UserId`) y permite filtrarlos por rol-plantilla o por "Administrador" (`RoleFilterControl`).
- **Variantes / errores observables:**
  - [Hecho] Togglear un chip habilita Guardar aunque ningún otro campo del formulario haya cambiado (`additionalDirtyState` en `DetailView.jsx`).
  - [Hecho] Guardar sin cambios reales en la selección de roles es un no-op (no dispara `SFAssignUserRoles`).
  - [Hecho] Un usuario recién creado (aún sin `AD_User_ID`) muestra un placeholder "guarda primero" en el control y no expone el tab "Roles del usuario".
  - [Hecho] El rol Admin nunca aparece como opción de composición, pero sí es un valor válido del filtro del grid (un usuario Admin clásico no tiene entradas en el mapa de composición).
- **Resultado esperado:** El rol personal del usuario (`UserRoleCompositionService`) tiene exactamente las filas `AD_Role_Inheritance` correspondientes al set de roles-plantilla elegido; el grid y la matriz en vivo reflejan ese mismo set tras guardar y recargar.
- **Reglas / permisos implicados:** Quién puede *ver* la ventana `User` está gobernado por `AD_Window_Access` normal (windowId 108), no por la capability de CAP-ROL-01. `SFUserRoleAssignments`/`SFAssignUserRoles` aplican el mismo chequeo de límite de tenant (`enforceCallerClientBoundary`) que el resto de los webhooks de roles — nunca permiten leer/escribir usuarios de otro cliente.
- **Datos / entidades tocadas:** El rol personal del usuario (composición) y sus filas `AD_Role_Inheritance`. `AD_User.Default_Ad_Role_ID` **no** se toca desde este flujo (ver Huecos abiertos).
- **Evidencia:** `AssignTemplateRolesControl.jsx` (+ `__tests__/AssignTemplateRolesControl.vitest.jsx`); `UserRolesTab.jsx`; `RoleChipsCell.jsx`/`RoleFilterControl.jsx`/`UserHeaderTable.jsx`; `windows/custom/user/index.jsx`; `userRoleAssignmentsApi.js`; `SFUserRoleAssignments.java`/`SFAssignUserRoles.java`/`UserRoleCompositionService.java` (tests: `SFUserRoleAssignmentsTest`, `SFAssignUserRolesTest`, `UserRoleCompositionServiceTest`); `e2e/tests/flows/user-role-assignment.mocked.spec.js` (reemplaza al extinto `role-assignment.mocked.spec.js` de ETP-4512, borrado por estar completamente superado).
- **Huecos abiertos:**
  - [Ambigüedad] no se pudo confirmar en código estático si algún rol no-admin (Finance/Sales/etc.) tiene acceso de escritura a la ventana `User` en un tenant real — depende de los datos de `AD_Window_Access` que traiga el cliente template GOClient.
  - [Hecho, orfandad conocida] El mecanismo ETP-4512 (`UserRoleAssignmentHandler`, sincroniza `AD_User_Roles` desde `Default_Ad_Role_ID` en cada PUT/PATCH) sigue existiendo en el backend, sin tocar por ETP-4906, pero ya no tiene ningún escritor en esta ventana — ni `AssignTemplateRolesControl` ni ningún otro campo escriben `defaultRole`. **Corrección (ETP-4906, DEV wave 6):** el tab hijo nativo "User Roles" (`userRoles`, `AD_User_Roles`) ya NO se renderiza en absoluto — quedó `exclude: true` en `decisions.json` porque compartía la misma etiqueta traducida ("Roles del usuario") que la nueva pestaña custom de este ticket, exponiendo el rol de composición interno "Personal – &lt;user&gt;" al admin; su salida generada (`UserRolesTable.jsx`/`UserRolesForm.jsx`) fue borrada tras confirmar que un `make regen ONLY=user` limpio ya no la emite (ver `docs/generated-custom-windows/user.md` → "Window shape"). La fila legacy de `AD_User_Roles` sigue existiendo en la base (el sync de `Default_Ad_Role_ID` no fue tocado), pero hoy no tiene ninguna superficie de UI, ni siquiera de solo lectura. No es un flujo activo hoy; queda documentado para quien decida limpiarlo o reutilizarlo.

## CAP-ROL-03 — Selección del rol activo al iniciar sesión

- **Actor:** Cualquier usuario final.
- **Superficie:** `LoginStep.jsx` → `routeByEnvironments` → entrada a un entorno.
- **Objetivo:** Obtener un token de sesión con rol/org activos, sin intervención del usuario.
- **Precondiciones:** Cuenta autenticada, al menos un entorno accesible.
- **Trigger:** Login exitoso o selección de entorno.
- **Flujo principal:**
  1. `LoginStep.jsx` es solo email/password (+SSO/reset) — **no hay selector de rol ni de organización acá**.
  2. Tras login, se dirige a selección de entorno/tenant.
  3. Al entrar a un entorno, la sesión se construye tomando `loginResponse.roleList[0]` **automáticamente**, sin que el usuario elija.
  4. Se elige la organización preferida del rol (la primera cuyo nombre no sea `"*"`, o la primera si todas lo son).
- **Variantes / errores observables:**
  - [Hecho] `roleList` ausente/vacío → no se escribe rol/org seleccionados en la sesión → el resto del sistema trata `currentRole==null` como denegación total.
  - [Ambigüedad] No se verificó el endpoint backend `GET /sws/go/login` (fuera del alcance revisado) para confirmar en qué orden llega `roleList` ni si ese orden es determinístico entre requests.
  - [Inferencia] Dado que `UserRoleAssignmentHandler` fuerza como máximo 1 fila `AD_User_Roles` para usuarios gestionados vía la SPA, "tomar `roleList[0]`" es casi vestigial para esos usuarios — pero sigue siendo relevante para cualquier usuario administrado fuera de la SPA (backend clásico de Etendo), donde sí podría haber múltiples filas reales.
- **Resultado esperado:** Sesión iniciada con rol/org fijados automáticamente.
- **Reglas / permisos implicados:** N/A (paso de bootstrap).
- **Datos / entidades tocadas:** `AD_User_Roles` (fuente de `roleList`, no confirmado por código de este repo), localStorage.
- **Evidencia:** `LoginStep.jsx:22-201`; `state.js:54-111`; `docs/architecture/07-auth-and-security.md:26-29`.
- **Huecos abiertos:** los dos marcados arriba.

## CAP-ROL-04 — Cambiar de rol activo en sesión (histórico — funcionalidad eliminada)

- **Actor:** N/A hoy (no alcanzable). Históricamente: usuario con múltiples roles/orgs.
- **Superficie:** N/A hoy. Históricamente: `UserContextSwitcher.jsx` (popover desde el avatar de usuario).
- **Objetivo histórico:** Cambiar rol/organización activos sin cerrar sesión, con re-autenticación por password si la sesión había expirado.
- **Flujo principal:** N/A — eliminado en el commit "Feature ETP-3690: Remove legacy login flow and UserContextSwitcher" (200 líneas de componente + 71 líneas de `AuthContext.switchContext` removidas).
- **Estado actual confirmado [Hecho]:** No existe ninguna superficie de UI para cambiar el rol activo de una sesión ya iniciada. `SettingsPage.jsx` conserva un comentario explícito (`// TODO ETP-3690: switchContext removed — revisit if Settings UI is resurrected`) y hoy solo **muestra** rol/org como texto de solo lectura. La única forma de "cambiar de rol" es editar `Default_Ad_Role_ID` desde la ventana `User` (CAP-ROL-02), lo cual afecta la *próxima* sesión del usuario, no la actual.
- **Resultado esperado:** N/A.
- **Reglas / permisos implicados:** N/A.
- **Datos / entidades tocadas:** N/A.
- **Evidencia:** commit `cca89388e0d5`; `SettingsPage.jsx:5,27-28,36,44-45`.
- **Huecos abiertos:** [Ambigüedad] si un admin reasigna el rol de un usuario mientras ese usuario tiene una sesión activa, no hay código que fuerce invalidación de esa sesión — probablemente sigue operando con permisos viejos hasta el próximo login, pero no está confirmado con un test.

## CAP-ROL-05 — El rol determina qué puede ver y hacer el usuario (enforcement transversal)

- **Actor:** Cualquier usuario autenticado.
- **Superficie:** Todo el SPA (sidebar, rutas, botones de acción, campos).
- **Objetivo:** Restringir menú, ventanas, procesos y capacidades según el rol activo.
- **Precondiciones:** Sesión con rol resuelto (o no — ver variantes).
- **Trigger:** Cualquier navegación o request al backend.
- **Flujo principal — 3 mecanismos independientes:**
  1. **Filtrado de menú**: `useRoleMenu.js` arma un `Set` de ids de ventana/proceso alcanzables (vía `/sws/neo/listmenu`); `AppLayout.jsx` oculta cualquier ítem del menú cuyo id no esté en el set. Contrato de 3 estados: `undefined` (en vuelo, filtra a nada), `null` (sin sesión o fetch falló, no filtra — fail-open), `Set` (real).
  2. **Bloqueo total**: un `Set` vacío **confirmado** (no `undefined`/`null`) renderiza una pantalla de "sin acceso" en vez del sidebar/contenido.
  3. **Capacidades + tier por ventana**: `/sws/neo/windowaccessmap` produce `windowAccess:{windowId:"full"|"read-only"}` y `capabilities:{showAccountingFields, isAdminOrClientAdmin}`. Bypass total si el rol es admin/client-admin.
  4. **Enforcement real por request** (backend): `NeoAccessHelper.hasWindowAccess/hasProcessAccess` gatea cada operación CRUD/proceso, independiente de lo que el frontend muestre; lecturas requieren fila activa, escrituras requieren además `IsReadWrite=true`.
- **Variantes / errores observables:**
  - [Hecho] Sin rol asignado → deniega todo en las 3 capas.
  - [Hecho] Documentado explícitamente (`docs/architecture/07-auth-and-security.md:243`): "Action-button-level hiding per role is not yet implemented. This remains a UX improvement, not a security boundary." — el frontend gatea a nivel de ventana/menú, no de botón individual; **el backend es la única frontera de seguridad real**.
  - [Hecho] Modo mock/E2E siempre concede acceso `full` + ambas capabilities por defecto — el modo demo/mock nunca reproduce restricciones de rol reales salvo que un spec las sobre-escriba explícitamente.
- **Resultado esperado:** Un rol sin `AD_Window_Access`/`AD_Process_Access` para X nunca ve ni puede operar X, ni por UI ni por API directa.
- **Reglas / permisos implicados:** `AD_Window_Access.IsReadWrite`, `AD_Process_Access`, `AD_Role.EM_ETGO_Show_Acct_Fields`, `AD_Role.is_client_admin`/rol System Admin (bypass total).
- **Datos / entidades tocadas:** `AD_Window_Access`, `AD_Process_Access`, `ETGO_SF_SPEC`/`SFEntity`, `AD_Role`.
- **Evidencia:** `useRoleMenu.js:1-46`; `menuTree.js:1-88`; `registry.js:77-105`; `AppLayout.jsx:118-180`; `SFWindowAccessMap.java:1-234` (21 tests); `NeoAccessHelper.java:1-486`; `docs/architecture/07-auth-and-security.md:218-266`.
- **Huecos abiertos:** [Ambigüedad] no confirmado si dos sesiones simultáneas del mismo usuario podrían tener roles activos distintos (solo posible si `AD_User_Roles` tuviera >1 fila — contradice el enforcement de "máx. 1 fila" para usuarios gestionados vía la SPA, pero podría aplicar a usuarios administrados fuera de ella).

## Capacidad adyacente — cambio de organización y cambio de entorno (no confundir con cambio de rol)

- **[Hecho]** `selectOrg` (cambiar de organización dentro del mismo rol) sigue vivo — usado en configuración fiscal para elegir sobre qué organización editar SII/TBAI/VERI*FACTU. No cambia el rol, solo la organización activa dentro del rol ya fijado.
- **[Hecho]** Cambiar de entorno/tenant (`useEnvironmentSwitch.js`) es un **re-login completo**, no un cambio de contexto: cada entorno tiene su propio usuario admin y necesita su propio JWT; termina en navegación dura a `/`. Comentario explícito en el código: "Switching tenants is a re-login, not a context change."

---

# Parte 4 — Entorno demo

**Hallazgo principal: no existe un "entorno demo" como feature separada.** No hay una instancia sandboxeada, ni reseteo periódico, ni flujo público de "solicitar demo". "Demo" en la terminología de producto es simplemente **la etiqueta que la UI le pone al tenant gratuito/no-productivo** (`plan !== 'productive'`).

## CAP-DEMO-01 — Etiqueta "Demo" como sinónimo del tenant gratuito

- **Actor:** Cualquier cuenta autenticada.
- **Superficie:** Pill de encabezado + badge en el dropdown "switch company" (`SideMenu.jsx`); comparación de planes en `/upgrade`.
- **Objetivo:** Que el usuario distinga un tenant gratis (no pago, con dataset de ejemplo, siempre el primero, nunca cobrado) de uno productivo pago.
- **Precondiciones:** Cuenta con ≥1 tenant; flag `tenant-upgrade` encendido para que el badge se renderice.
- **Trigger:** Cargar cualquier pantalla con `SideMenu`, o navegar a `/upgrade`.
- **Flujo principal:**
  1. `GET /sws/go/environments` devuelve cada tenant vinculado con su `plan`.
  2. Frontend ordena productivo-primero (espejando el orden que ya aplica el backend tras login).
  3. Cada tenant renderiza un pill "Demo" o "Productive" basado puramente en `plan !== 'productive'`.
  4. En `/upgrade`, los tenants con `plan !== 'productive'` alimentan una lista de "entornos demo"; si existe uno, se pre-selecciona "Convertir mi entorno demo" en vez de "Crear un entorno productivo nuevo".
  5. El checkout envía `upgradeAction` al backend, que es autoritativo y marca el tenant resultante como `productive` (ver CAP-CHK-05).
- **Variantes / errores observables:**
  - [Hecho] Cuenta con 0 tenants → sin checkout, panel "tu primer tenant es gratis".
  - [Hecho] Falla la consulta de cuenta → el checkout se muestra igual, el backend es autoritativo.
  - [Hecho] Reenviar un nombre que la cuenta ya posee → se trata como reanudación, no como cobro nuevo.
- **Resultado esperado:** El tenant gratis/demo queda intacto sea cual sea la elección; puede que un segundo tenant quede marcado `productive`.
- **Reglas / permisos implicados:** El plan es solo un marcador de presentación/paywall — nunca una frontera de autorización. El paywall backend es autoritativo sin importar el estado del flag.
- **Datos / entidades tocadas:** `ETGO_ACCOUNT`, `AD_Client`, `AD_Preference` (`ETGO_TenantPlan`).
- **Evidencia:** `environmentPresentation.js:1-21`; `SideMenu.jsx:481,576-580,607-614` (test: `SideMenu.vitest.jsx:234-256`); `UpgradePage.jsx:368-408`; `EtendoGoJwtServlet.java:1079-1081` (comentario explícito: "so a demo tenant never unexpectedly becomes the active workspace").
- **Huecos abiertos:** [Ambigüedad] no se confirmó que un tenant demo/gratis reciba un dataset de ejemplo distinto al de un tenant productivo — ambos parecen pasar por el mismo `ensureOnboardingDataset`/`OnboardingDatasetImportService`. La palabra "sample data" del glosario interno podría describir simplemente el dataset estándar de todo onboarding, no algo demo-exclusivo. Requiere confirmación contra un backend real.

## CAP-DEMO-02 — Acción "Demo" en la ventana Fiscal Models (no relacionada con tenants)

- **Actor:** Cualquier usuario con la ventana Fiscal Models abierta.
- **Superficie:** Kebab menu de `FmListPage.jsx` → ítem "Demo".
- **Objetivo:** Poblar rápidamente la pantalla con 5 declaraciones fiscales hardcodeadas, aparentemente para explorar/demostrar la UI sin datos reales de backend/AEAT.
- **Precondiciones:** Ninguna verificada en código — sin flag, sin chequeo de rol.
- **Trigger:** Click en kebab → "Demo".
- **Flujo principal:**
  1. Usuario abre el kebab menu.
  2. Click en "Demo".
  3. `setDecls(DEMO_DECLARATIONS.map(normDecl))` reemplaza el estado de la lista con 5 filas fijas (modelos 303/349, NIF fijo, montos/fechas fijos) — puramente en memoria, sin llamada a backend, sin persistencia.
- **Variantes / errores observables:** Ninguna — es un reemplazo plano, no un merge.
- **Resultado esperado:** La lista/tabla/KPIs muestran datos de fixture hasta que el usuario navega afuera o el componente refetchea.
- **Reglas / permisos implicados:** Ninguna encontrada — no tiene flag, no tiene chequeo de rol.
- **Datos / entidades tocadas:** Ninguna (solo estado de UI en memoria).
- **Evidencia:** `FmListPage.jsx:106-133,282-328,600`.
- **Huecos abiertos:** [Ambigüedad] el label es un string hardcodeado sin traducir, mientras existen claves de i18n huérfanas (`fm.action.demo`, `fm.list.mode.to_demo`) nunca referenciadas en el código — sugiere que esta acción no pasó por el mismo nivel de revisión que el resto del producto. No está claro si es una feature destinada a usuarios finales o un leftover de desarrollo/QA.

## Nota adicional — "demo" como apodo interno de QA (no es una capacidad de producto)

**[Hecho]** En documentación interna del equipo (`docs/etendo-ad/onboarding-gaps.md`, `docs/etendo-ad/tenant-remediation-knowledge.md`, `docs/etendo-ad/onboarding-and-datafixes-map.md`) se llama informalmente "tenant QA/demo" a un tenant real ("F&B International Group") usado para pruebas internas de gaps de onboarding. No hay código que implemente un tipo de "tenant QA/demo" diferenciado — es solo jerga del equipo sobre un tenant existente que tratan informalmente como descartable/atípico para fines diagnósticos. No confundir con CAP-DEMO-01.

**[Ambigüedad]** No se encontró en este repo ningún rastro de un flujo público de "solicitar demo" (marketing), ni una instancia de demo separada hosteada públicamente. Si existe, vive fuera de este repo (por ejemplo, un sitio de marketing).
