# Actores y superficies

## Actores

| Actor | Descripción | Notas |
|---|---|---|
| **Visitante anónimo** | Sin `sf_platform_token`. Llega a `/onboarding` en la vista de login. | [Hecho] |
| **Cuenta de plataforma sin tenant** | Ya registrada/autenticada (`ETGO_ACCOUNT`), pero sin ningún `AD_Client` provisionado todavía. | [Hecho] |
| **Cuenta de plataforma con ≥1 tenant** | Puede tener uno o más entornos (`AD_Client`), cada uno con `plan: "free"|"productive"`. | [Hecho] |
| **Usuario final con rol fijo** | Dentro de un tenant, tiene como máximo **un** `AD_Role` activo entre: client-admin, Finance, Sales, Purchasing, Inventory. | [Hecho] |
| **Admin / client-admin de tenant** | Rol con bypass total de permisos (`NeoAccessHelper.isAdminOrClientAdmin`). Único actor que ve `/roles` y puede asignar roles vía la ventana `User`. | [Hecho] |
| **Stripe (servidor externo)** | Llama `POST /sws/go/checkout/webhook` sin sesión, autenticado solo por firma HMAC. | [Hecho] |
| **Sistema/backend (sin actor humano)** | Ejecuta el paywall, marca planes, sincroniza roles — procesos server-side disparados por las acciones de arriba. | [Hecho] |

## Superficies — Frontend (rutas y componentes)

| Superficie | Ruta / componente | Usada por |
|---|---|---|
| Onboarding (login/registro/perfil/empresa/setup) | `/onboarding` → `OnboardingPage.jsx` → `<OnboardingFlow>` (vendorizado en `@etendosoftware/etendo-go-core/src/onboarding/`) | Visitante anónimo, cuenta sin tenant |
| Selección de entorno (fallback manual) | `EnvSelectStep.jsx` (dentro del mismo flujo) | Cuenta con ≥1 tenant, solo si el auto-login falla |
| Logout / reanudar onboarding | `/logout` → `LogoutRoute` (`runtime-routes.jsx:52`) | Cuenta con sesión activa |
| Upgrade / checkout de pago | `/upgrade` → `UpgradePage.jsx` | Cuenta con ≥1 tenant, flag `tenant-upgrade` |
| Selector de entorno + badge Demo/Productive | `SideMenu.jsx` (header + dropdown "switch company") | Cualquier cuenta con ≥1 tenant, flag `tenant-upgrade` |
| Resumen de roles del tenant | `/roles` → `RolesOverviewPage.jsx` | Admin / client-admin |
| Asignación de rol a un usuario | Ventana `User` (`Configuración > Usuarios`) → `AssignRoleControl.jsx` (`headerExtra.customForm`) | Quien tenga acceso de escritura a la ventana `User` (AD_Window_Access) |
| Menú de navegación filtrado por rol | `AppLayout.jsx` + `useRoleMenu.js` + `registry.js` | Todo usuario autenticado |
| Ajustes (rol/org de solo lectura) | `SettingsPage.jsx` | Todo usuario autenticado — ya no permite cambiar de rol (ETP-3690) |
| Acción "Demo" (no relacionada con tenants) | Ventana Fiscal Models → `FmListPage.jsx` kebab menu | Cualquier usuario con la ventana abierta, sin gate |

## Superficies — Backend (`com.etendoerp.go`, prefijo `/sws/go/*` y `/sws/neo/*`)

Todos los handlers viven en `EtendoGoJwtServlet.java` salvo que se indique lo contrario.

| Endpoint | Método | Propósito | Handler |
|---|---|---|---|
| `/sws/go/register` | POST | Crear cuenta de plataforma (email+password) | `handleRegister` |
| `/sws/go/sso/google` | POST | Registro/login vía Google SSO | `handleSsoLogin` |
| `/sws/go/login` | POST | Login con cuenta existente | `handleLogin` |
| `/sws/go/password-reset/request` | POST | Solicitar reseteo de contraseña (respuesta siempre neutral) | — |
| `/sws/go/password-reset/confirm` | POST | Confirmar nueva contraseña con token | — |
| `/sws/go/onboarding/draft` | POST / GET | Guardar / restaurar borrador de onboarding (perfil+empresa) | `handleSaveOnboardingDraft` |
| `/sws/go/environments` | GET | Listar tenants de la cuenta, con `plan` y orden productive-first | `handleEnvironments` |
| `/sws/go/onboarding` | POST (NDJSON stream) | Aprovisionar un tenant nuevo (gratis o pago — mismo endpoint) | `handleOnboarding` |
| `/sws/go/checkout/sessions` | POST | Crear sesión de Stripe Checkout | `handleCheckoutSession` → `HostedCheckoutService` |
| `/sws/go/checkout/sessions/{requestId}` | GET | Consultar si un `requestId` de checkout ya fue pagado | `handleCheckoutStatus` |
| `/sws/go/checkout/webhook` | POST | Recibir confirmación de pago de Stripe | `handleCheckoutWebhook` |
| `/sws/neo/rolesoverview` | GET | Resumen de roles del tenant (solo admin/client-admin) | `SFRolesOverview.java` |
| `/sws/neo/windowaccessmap` | GET | Mapa de acceso a ventanas + capabilities para el rol activo | `SFWindowAccessMap.java` |
| `/sws/neo/listmenu` | GET | Árbol de menú permitido para el rol activo | `SFListMenu` (implícito, consumido por `useRoleMenu.js`) |

## Superficies internas (no HTTP directo, pero relevantes al flujo)

| Componente | Rol |
|---|---|
| `UserRoleAssignmentHandler` (`@Named("user")`, NeoHandler `afterHandle`) | Sincroniza `AD_User_Roles` cuando se guarda la ventana `User` |
| `TenantPaywallService` / `MockPaymentService` / `CheckoutPaymentRegistry` | Deciden si una alta de tenant paga puede proceder |
| `TenantPlanService` | Lee/escribe el `AD_Preference` `ETGO_TenantPlan` (`free`/`productive`) |
| `NeoAccessHelper` | Enforcement real de `AD_Window_Access`/`AD_Process_Access` en cada request backend |
| `OnboardingRoleProvisioningService` / `InitialClientSetup` / `InitialOrgSetup` | Clonan roles y crean `AD_Client`/`AD_Org` durante el aprovisionamiento |
