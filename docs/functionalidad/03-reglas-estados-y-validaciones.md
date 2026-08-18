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
[webhook] --(firma HMAC válida + evento no duplicado)--> CheckoutPaymentRegistry.recordPaid(...)
```

- **Solo dos estados de pago existen hoy**: `pending` y `paid`. No hay `expired`/`cancelled`/`failed` — un Checkout Session de Stripe que expira (TTL propio de Stripe) queda `pending` para siempre desde la perspectiva de este backend.
- **El webhook es la única fuente de verdad de "pagado"** — el redirect exitoso del navegador nunca por sí solo marca nada como pagado; si el webhook nunca llega (o llega tarde), el usuario nunca ve "pagado" aunque haya pagado de verdad en Stripe.
- **Ventana de confirmación dura: 60 segundos.** No hay reintento automático más allá de esa ventana ni forma de "volver más tarde" salvo rehacer todo el checkout.
- **`CheckoutPaymentRegistry` es un `ConcurrentHashMap` en memoria del proceso, no una tabla persistida.** Un reinicio del backend entre el webhook y el polling del usuario pierde el registro de "pagado" sin recuperación automática — dentro de la ventana de reintentos de Stripe (Stripe reintenta webhooks fallidos por un tiempo) hay una vía de recuperación parcial; fuera de esa ventana, no.
- **Dedup de eventos de webhook** por `eventId` de Stripe (`claimEvent`, `putIfAbsent`) — evento repetido responde 200 sin reprocesar.
- **Paywall es autoritativo del lado del backend independientemente del flag** — con el flag `tenant-upgrade` apagado, el paywall es no-op y el primer tenant de cualquier cuenta es siempre gratis.
- **Backdoor de pago simulado (`mock-paid-<hex>`) sigue siendo un fallback válido** en `TenantPaywallService.decide()` cuando `CheckoutPaymentRegistry.isPaidFor` da `false` — no depende de haber pasado por Stripe. Ver riesgo de seguridad en `INDEX.md`.
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
