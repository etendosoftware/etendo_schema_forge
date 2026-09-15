# Reglas, estados y validaciones

## Cuentas y contraseñas

- **Fuerza de contraseña** [Hecho]: mínimo 8 caracteres, con mayúscula + minúscula + dígito + carácter especial (`PasswordPolicy.isStrong`, `PasswordPolicy.java:63-69`). Espejado client-side (`isStrongPassword` en `RegisterStep.jsx`) solo para UX — la validación real es server-side.
- **Unicidad de email** [Hecho]: `findActiveAccountByEmail` bloquea registro duplicado con `EMAIL_ALREADY_REGISTERED` (400).
- **Anti-enumeración en recuperación de contraseña** [Hecho]: `POST /sws/go/password-reset/request` responde igual exista o no el email.
- **TTL de token de reset** [Hecho]: 30 minutos (`PASSWORD_RESET_TTL_SECONDS`).
- **Límites de longitud de campos** [Hecho]: nombre/email 60, password 128, NIF 20, dirección 60 — validados en frontend (maxLength, silencioso) Y en backend (`OnboardingFieldLimits.firstViolation`, error `FIELD_TOO_LONG {field,max}`).
- **Errores nunca crudos** [Hecho]: tanto en registro/login como en aprovisionamiento, las claves de error del backend (incluidas las de AD, ej. `@CreateClientFailed@`) se traducen client-side a mensajes localizados fijos — el usuario nunca ve el mensaje interno del backend.

## Máquina de estados — Onboarding (borrador)

```
[sin borrador] --(edita Profile, debounce 1500ms)--> [borrador step=1]
[borrador step=1] --(edita Company, debounce 1500ms)--> [borrador step=2]
[borrador step=N] --(logout: flush best-effort)--> [borrador persistido en ETGO_ACCOUNT]
[borrador persistido] --(próximo login: GET draft)--> [restaurado, salta directo al paso N]
[borrador persistido] --(setup-progress completa con éxito)--> [borrador limpiado]
```

- El borrador se sanitiza a una **whitelist** de campos antes de persistir, y se capea a 4000 caracteres serializados.
- Un fallo al guardar el borrador **nunca bloquea el logout** (fail-open) — solo muestra un warning.
- Logout durante `setup-progress` (aprovisionamiento activo) usa un guard para que un stream que completa después del logout no cree una sesión nueva.

## Máquina de estados — Aprovisionamiento de tenant (`handleOnboarding`)

```
[request recibido] --(paywall bloquea)--> HTTP 402, fin
[request recibido] --(paywall permite)--> [stream NDJSON abierto]
  → resolveOrCreateClient (nuevo | reanudar propio | rechazar ajeno)
  → ensureRoles
  → (si es upgrade pago) markProductive
  → ensureOrganization
  → ensureOnboardingDataset (11 sub-pasos en orden fijo, cualquier excepción aborta)
  → commitDalChanges (todo-o-nada)
  → [success:true] o [rollback + success:false]
```

- **Idempotencia por nombre de cliente**: reintentar con el mismo `clientName` de la misma cuenta reanuda; el mismo nombre de otra cuenta es un rechazo duro (aislamiento entre tenants).
- **Commit atómico**: toda la cadena de 11 pasos de `ensureOnboardingDataset` comparte una única transacción — no hay estados parciales persistidos si algo falla a mitad de camino (salvo el paso `registerBaseline`, cuya falla SQL real se propaga en vez de tragarse, por diseño explícito).
- **Heartbeat de stream**: cada 10s, para que un proxy/CDN con idle-timeout no corte la conexión mientras el aprovisionamiento (potencialmente lento) sigue corriendo del lado del servidor. Riesgo conocido: un corte de stream post-commit puede reportar falso fallo a un tenant ya creado.

## Máquina de estados — Checkout de Stripe

```
[UpgradePage] --(submit checkout)--> POST /checkout/sessions --> [checkoutUrl de Stripe]
  --> redirect de página completa a Stripe
[Stripe] --(usuario paga)--> redirect a /upgrade?checkout=success&requestId=...
                          Y EN PARALELO --> Stripe llama POST /checkout/webhook
[UpgradePage resume] --(poll GET /checkout/sessions/{id}, 1/s, hasta 60 intentos)--> pending | paid
  paid --> POST /onboarding (paymentToken = requestId) --> (máquina de arriba)
  60 intentos sin "paid" --> error, vuelve a phase='form' (SIN reintento posterior)
[webhook] --(firma HMAC válida + claim del event_id en ETGO_BILLING_EVENT)--> CheckoutRequestStore.recordPaid(...) --> BillingEventStore.markApplied(...)
```

- **Solo dos estados de pago existen hoy**: `pending` y `paid`. No hay `expired`/`cancelled`/`failed` — un Checkout Session de Stripe que expira (TTL propio de Stripe) queda `pending` para siempre desde la perspectiva de este backend.
- **El webhook es la única fuente de verdad de "pagado"** — el redirect exitoso del navegador nunca por sí solo marca nada como pagado; si el webhook nunca llega (o llega tarde), el usuario nunca ve "pagado" aunque haya pagado de verdad en Stripe.
- **Ventana de confirmación dura: 60 segundos.** No hay reintento automático más allá de esa ventana ni forma de "volver más tarde" salvo rehacer todo el checkout.
- **[Hecho] El estado de pago es durable (ETP-5045).** El "pagado" es una fila de `ETGO_CHECKOUT_REQUEST` que el webhook avanza a `PAID` (`CheckoutRequestStore.java:140-178` `recordPaid`), y el polling la lee (`CheckoutRequestStore.java:180-241` `find`/`isPaidFor`). Un reinicio del backend entre el webhook y el polling ya no pierde nada. El antiguo `CheckoutPaymentRegistry` (`ConcurrentHashMap` en memoria del proceso) fue eliminado.
- **[Hecho] Dedup de eventos de webhook durable, una fila por `event_id`** en `ETGO_BILLING_EVENT` (`BillingEventStore.java:123-146` `claim`). El gate de idempotencia es el constraint único `ETGO_BILLEVT_EVENT_UQ`, no un mapa: la primera entrega inserta la fila en `RECEIVED` (`:245-276`); una reentrega choca contra el constraint y solo incrementa `DUPLICATE_COUNT` + `LAST_DUPLICATE_AT` (`:298-320`), respondiendo `200 {"received":true}` sin reprocesar — también tras un reinicio o en otro nodo.
- **[Hecho] Ciclo de vida del evento: `RECEIVED → APPLIED | IGNORED | FAILED`.** `APPLIED` (el handler corrió `recordPaid`) e `IGNORED` (tipo no manejado / falta `metadata.request_id`+`account_email`) son de una sola vez. `FAILED` es re-reclamable: la siguiente entrega del mismo `event_id` vuelve la fila a `RECEIVED` atómicamente y se procesa como nueva (`BillingEventStore.java:278-296` `reclaimFailed`), de modo que el propio reintento de Stripe repara una falla transitoria. `PROCESSED_AT` es first-write-wins (`:322-360`).
- **[Hecho] Falla del handler → HTTP 500 `CHECKOUT_WEBHOOK_FAILED`** y la fila queda `FAILED` (`EtendoGoJwtServlet.java:454-491` `handleCheckoutWebhook`; `BillingEventStore.java:174-181` `markFailed`, que nunca lanza). El 500 es deliberado: hace que Stripe reintente.
- **[Hecho] Correlación con el checkout:** la fila del evento guarda siempre el `metadata.request_id` crudo (`REQUEST_ID`) y, solo si esa solicitud existe en `ETGO_CHECKOUT_REQUEST`, la FK `ETGO_CHECKOUT_REQUEST_ID` resuelta en el momento del claim (`BillingEventStore.java:245-276`; `CheckoutRequestStore.java:376`). Un evento con un `request_id` desconocido queda `APPLIED` sin FK y con un error en el log — no marca nada como pagado.
- **[Hecho] Nunca se persiste el payload crudo ni datos de tarjeta.** `PAYLOAD_SUMMARY` es una allow-list (`data.object.{id,customer,subscription,livemode,payment_status,amount_total,currency,mode}` + `metadata.request_id`, máx. 2000 caracteres) construida en `BillingEventStore.java:196-224` `summarize`.
- **[Hecho] Auditoría sin DB:** ventanas Classic de solo lectura **Checkout Request** (con pestaña hija **Billing Event**, enlazada por la FK) y **Billing Event** (todas las filas, con o sin FK), visibles como System Administrator.
- **Paywall es autoritativo del lado del backend independientemente del flag** — con el flag `tenant-upgrade` apagado, el paywall es no-op y el primer tenant de cualquier cuenta es siempre gratis.
- **[Superado en ETP-4966] Backdoor de pago simulado (`mock-paid-<hex>`).** Era el fallback en `TenantPaywallService.decide()` cuando el registro de pagos daba `false`. `MockPaymentService` fue eliminado: hoy el único camino que pasa el gate es `CheckoutRequestStore.isPaidFor(paymentToken, accountEmail, clientName)` (`CheckoutRequestStore.java:211-241`); token ausente → 402 `PAYMENT_REQUIRED`, token no confirmado → 402 `PAYMENT_DECLINED`. Ver `com.etendoerp.go/docs/feature-flags-and-tenant-upgrade.md` §"The payment provider".
- **Plan de tenant (`free`/`productive`)**: se lee de un `AD_Preference` (`ETGO_TenantPlan`); ausencia de la preferencia = `free` por default. `markProductive` es best-effort — su falla se traga y loguea, nunca bloquea el commit del onboarding.

## Reglas de roles y permisos

- **Un usuario tiene como máximo 1 fila activa en `AD_User_Roles`** para cualquier usuario gestionado vía la ventana `User` de la SPA — `UserRoleAssignmentHandler` borra y reinserta en cada guardado, nunca permite más de una fila. Usuarios administrados fuera de la SPA (backend clásico de Etendo) podrían tener más de una — no confirmado.
- **5 roles fijos por tenant**: client-admin + Finance + Sales + Purchasing + Inventory, clonados desde el cliente template GOClient al aprovisionar (`OnboardingRoleProvisioningService`).
- **Doble gate en cada superficie sensible**: el frontend oculta menú/rutas (defensa en profundidad, "fail-open" si la consulta de permisos falla o está en vuelo), el backend es quien realmente deniega (`NeoAccessHelper`). Documentado explícitamente: el ocultamiento a nivel de botón individual NO es una frontera de seguridad, solo de UX.
- **Bypass total para admin/client-admin**: `NeoAccessHelper.isAdminOrClientAdmin` da acceso `full` a todo y ambas capabilities en `true`, sin pasar por `AD_Window_Access` fila por fila.
- **Cambiar el rol de un usuario no invalida su sesión activa** — solo afecta el próximo login. No hay código que fuerce cierre de sesión ni recarga de permisos en caliente.
- **No existe cambio de rol en sesión activa** (funcionalidad removida en ETP-3690) — la única forma de "cambiar de rol" es una edición administrativa que rige desde el próximo login.
- **El paywall de checkout es a nivel de cuenta, no de rol AD** — cualquier rol, incluso uno sin permisos de administración, puede en teoría disparar un intento de upgrade si tiene acceso a `/upgrade` (que no tiene gate de rol, solo de tener un token de cuenta resolvible).

## Reglas de "demo"

- **"Demo" no es un tipo de entorno con lifecycle propio** — es derivado en tiempo real de `plan !== 'productive'`. No hay tabla ni columna "es demo"; es el mismo campo `plan` que usa el paywall.
- **El plan es un marcador de presentación, nunca una frontera de autorización** — un tenant "demo" (free) tiene exactamente los mismos permisos de rol/ventana que uno productivo; lo único que cambia es la elegibilidad de paywall y el badge visual.
- **[Ambigüedad]** no confirmado si el dataset sembrado difiere entre un tenant demo y uno productivo — la evidencia leída sugiere que es el mismo `ensureOnboardingDataset`/`OnboardingDatasetImportService` para ambos.
- La acción "Demo" de Fiscal Models (CAP-DEMO-02) no tiene ninguna regla de permisos ni de estado — es un simple reemplazo de estado de UI en memoria, sin gate de rol ni de flag.

## Efectos secundarios observables (no obvios desde la UI)

- Registro exitoso dispara un email "nueva cuenta" (best-effort, no bloquea la respuesta).
- Aprovisionamiento exitoso dispara un email "entorno listo" y programa un sync bancario (PSD2) recurrente.
- Guardar la ventana `User` con un cambio de rol dispara una sincronización silenciosa de `AD_User_Roles` que el usuario no ve directamente (solo el badge `defaultRole` en el grid refleja el resultado).
- El checkout de Stripe emite eventos de tracking (`upgrade_page_viewed`, `UPGRADE_CHECKOUT_SUBMITTED`, `UPGRADE_TENANT_PROVISIONING_SUCCEEDED/FAILED`) — el evento `UPGRADE_PAYMENT_DECLINED` quedó inalcanzable tras migrar a Stripe real (ya no hay UI propia de tarjeta que pueda "declinar" del lado de Etendo).

## Documentación previa que quedó desactualizada (no usar como fuente de verdad)

| Documento | Qué describe que ya no aplica |
|---|---|
| `docs/feature-flags.md` (sección "tenant upgrade flow", ~líneas 355-424) | Describe el flujo de mock-card anterior a Stripe real |
| `docs/paid-tenant-infrastructure.md` (documento completo) | Ídem — arquitectura de pago simulado, sin gateway real |
| `flags-registry.json` (entrada `paid-second-tenant`) | Referencia un archivo de test (`upgrade-mockPayment.test.js`) que ya no existe |
| `docs/etendo-ad/onboarding-and-datafixes-map.md` (§1, tabla de pasos con números de línea) | Menos pasos de los que tiene el código actual de `ensureOnboardingDataset`; tratar solo como contexto histórico |
