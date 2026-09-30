---
task: ETP-5305
note: ETP-5305/3893e618
kind: backfill
date: 2026-09-15T03:07:00.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - d921fb8197
files:
  - docs/generated-custom-windows/financial-account.md
---

## Resumen
La pestaña Contabilidad rechazaba todo intento de guardar datos. Se identificaron y documentaron dos defectos acoplados que bloqueaban el guardado, e se implementó la corrección correspondiente.

## Decisiones
- Mantener el isNull guard en la lógica de guardado — porque solo con este cambio se cumple el contrato de save documentado, particularmente la mitad de limpieza del flujo. Remover la guardia rompería la persistencia.

## Deuda dejada
- Dos defectos de fondo documentados pero no completamente resueltos:
  1. **Jettison optString JSON-null trap** — manejo incorrecto de valores null en JSON por la librería Jettison
  2. **enablebankstatement flag forzado a Y** — la bandera es forzada a Y por `fin_finacc_acct_bsconfig_check` después de que ETP-4872 retiró el par `FIN_Asset_Acct`/`FIN_Transitory_Acct` que era requerido para su correcto funcionamiento

Los defectos siguen siendo puntos de fragilidad: la solución actual solo documenta por qué el isNull guard es crítico, pero no resuelve las raíces del problema.
