---
task: ETP-5335
note: ETP-5335/a3ed8aac
kind: backfill
date: 2026-09-30T14:40:00.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 406b1410b8
  - bac3bfb267
  - 19760a1d8a
  - be04b53f96
  - 3b8f542b84
  - 0dbfaab0ca
  - 3b33cccc61
  - 8e9a60880b
  - 034e7e075d
  - 96e0c5d61d
  - dd6b19493f
  - 7a24f6ee2f
  - a4f325394c
  - b015e795ca
  - 11ff4a139a
  - d27f68dab1
  - a75bc348cd
files:
  - docs/mcp-evaluation/mcp-improvements-registry.md
  - docs/plans/2026-09-15-mcp-corrections-batch.md
  - mcp-tests/findings/2026-09-14-businesspartner-selector-wildcard-returns-empty.md
  - mcp-tests/findings/2026-09-14-vector-search-targets-are-undiscoverable.md
  - mcp-tests/findings/2026-09-15-parent-link-silently-dropped-on-write-and-unenforced-on-read.md
  - CLAUDE.md
  - artifacts/contacts/contract.json
  - artifacts/contacts/contract.mcp.json
  - artifacts/contacts/decisions.json
  - artifacts/sales-order/decisions.json
  - docs/decisions-reference.md
  - docs/plans/2026-09-16-server-owned-org-client-proposal.md
  - docs/plans/2026-09-16-report-spec-access-fail-open.md
---

## Resumen
Tarea de registro y cierre de defectos identificados en probes de 2026-09-14 y posteriores. Se registraron 9 mejoras, se cerraron varias tras verificación en vivo, y se documentaron decisiones arquitectónicas sobre búsqueda vectorial, derivación de campos y seguridad de acceso a reportes.

## Decisiones
- El objetivo de búsqueda vectorial debe ser el nombre de la especificación, no un alias (contacts, no business-partner) — porque el vector match no lleva puntero al registro y el cliente necesita conocer la especificación exacta
- BillTo_ID se deriva en servidor en lugar de exponerse al cliente — porque el campo se resuelve desde datos de sesión y el cliente no puede producir el valor requerido
- Campos cliente/organización se resuelven desde sesión en todas las rutas de escritura — por seguridad de tenencia
- El acceso a reportes debe denegar por defecto si no hay ancla o declaración explícita — porque fail-open actual permite acceso no intencional a roles

## Descartado
- Flip en `hasAccessToConstituentWindows` — porque afectaría a dos specs sin ventanas (dashboard, not-posted-documents) y cerraría reportes en SPA incorrectamente

## Deuda dejada
- Validador de pipeline (F11) para forzar que vector target sea el nombre de la especificación
- Propagación del contrato actualizado a NEO tras alineación de vector search target
- Manejador de informe sin declaración de acceso sigue abierto en runtime (capturado por guardrail de prueba)

## Pendiente
- Implementar validador F11 para vector search targets
- Propagar cambios de contrato a NEO
