# Funcionalidad: cuentas, upgrade, roles y entorno demo

Documentación funcional (no arquitectónica) de cuatro flujos del producto Etendo GO, reconstruida leyendo código y tests reales en:

- `tools/app-shell` (SPA, este repo)
- `node_modules/@etendosoftware/etendo-go-core` (motor de onboarding vendorizado, consumido por `tools/app-shell`)
- `etendo_core/modules/com.etendoerp.go` (backend "NEO Headless", su propio repo Git anidado)

Alcance pedido: **creación de cuenta**, **upgrade de cuenta** (checkout de pago), **múltiples roles**, **entorno demo**. No cubre arquitectura general, deploy, ni otras ventanas del producto — para eso ver `docs/architecture-overview.md` y `docs/index.md`.

## Convenciones

Cada afirmación lleva una marca de confianza:

- **[Hecho]** — verificado leyendo código y/o tests reales.
- **[Inferencia]** — deducción razonable a partir de lo leído, no confirmada línea por línea.
- **[Ambigüedad]** — el repo no permite cerrar la duda; requiere validación contra un backend/entorno real.

La evidencia siempre cita archivo (ruta relativa al repo) y símbolo/línea cuando fue posible confirmarlo. Cuando la evidencia es un test, se cita el test.

## Cómo se armó este documento

Se investigaron las 4 áreas en paralelo con agentes de investigación de solo lectura (sin cambios de código), cada uno leyendo componentes React, endpoints/handlers Java, tests unitarios, specs Playwright y documentación previa (PRDs, `feature-flags.md`, `paid-tenant-infrastructure.md`, etc.), contrastando esa documentación previa contra el código real — no asumiendo que estaba actualizada.

## Ambigüedades principales (léase antes de usar el resto del documento)

1. **`docs/feature-flags.md` (sección "tenant upgrade flow") y `docs/paid-tenant-infrastructure.md` describen una implementación de pago SUPERADA** (mock-card en el navegador, sin Stripe real). La implementación actual usa Stripe Hosted Checkout real (ETP-4800, ago-2026). Ver `03-reglas-estados-y-validaciones.md` §Checkout y `02-capacidades-y-flujos.md` CAP-CHK-*. Estos documentos previos NO deben tomarse como fuente de verdad para el mecanismo de cobro, aunque siguen siendo válidos para el modelo de feature flags en general.
2. **El "backdoor" de pago simulado (`mock-paid-<hex>`) sigue activo en el backend** incluso después de migrar a Stripe real — cualquier cuenta autenticada puede, en teoría, saltear Stripe por completo si arma el request a mano. Ver CAP-CHK-05 y la fila de riesgo correspondiente en la matriz de pruebas.
3. **`CheckoutPaymentRegistry` (el registro de "este `requestId` ya fue pagado") vive solo en memoria del proceso**, no en una tabla persistida. Un reinicio del backend entre el webhook de Stripe y que el usuario complete el polling pierde ese estado sin recuperación automática.
4. **No existe UI para cambiar de rol activo dentro de una sesión ya iniciada** — existió (`UserContextSwitcher.jsx`) y fue eliminada deliberadamente en ETP-3690. Cambiar el rol de un usuario hoy solo afecta su *próximo* login, no la sesión actual.
5. **"Entorno demo" no es un entorno separado ni sandboxeado.** Es simplemente la etiqueta que la UI le pone al tenant gratuito/no-productivo (`plan !== 'productive'`). No hay evidencia de un flujo público de "solicitar demo" ni de una instancia de demo separada — si existe, vive fuera de este repo.
6. Un segundo uso, no relacionado, de la palabra "Demo" existe como botón de acción dentro de la ventana **Fiscal Models** (carga 5 declaraciones hardcodeadas) — ver CAP-DEMO-02. Es una función aislada, sin flag, sin control de permisos, con claves de i18n huérfanas — parece un leftover de desarrollo, no una feature revisada.

## Navegación

| Archivo | Contenido |
|---|---|
| `01-actores-y-superficies.md` | Roles/actores y todas las superficies (rutas, componentes, endpoints) involucradas |
| `02-capacidades-y-flujos.md` | Los flujos funcionales completos, en bloques de capacidad |
| `03-reglas-estados-y-validaciones.md` | Reglas transversales, máquinas de estado, validaciones, permisos, efectos secundarios |
| `04-matriz-de-pruebas-funcionales.md` | Casos candidatos para QA, derivados de las capacidades |
