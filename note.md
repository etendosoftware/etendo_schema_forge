---
task: ETP-5344
note: ETP-5344/5212e0a8
kind: backfill
date: 2026-09-16T12:33:07.000Z
authors:
  - Agustin-Calderon
agents:
sessions:
commits:
  - 37df4e0cf2
  - a6ba27b91b
files:
  - docs/generated-custom-windows/financial-account.md
---

## Resumen
Se documentó el comportamiento de gating de bancos sandbox por plan de tenant (Demo only) en la guía financial-account, y se actualizó la referencia a métodos de Salt Edge que se movieron a SaltEdgeConnectionBuilder para resolver una infracción de calidad.

## Decisiones
- handleConnect como único punto de decisión para sandbox banks en ambos flujos AC
- Mantener SELECTED='Y' en System preference row para evitar conflictos de filas duplicadas que hacen desaparecer bancos sandbox
- Mover createSaltEdgeConnection methods a SaltEdgeConnectionBuilder (módulo PSD2) para limpiar SonarQube S1448

## Descartado
No se modificó:
- Offline bank picker (nunca lista proveedores sandbox, cualquier tenant)
- Paths PIS y provider-catalog (deciden solo desde preference, sin tenant gating)

## Deuda dejada
La documentación aún depende del comportamiento específico de SELECTED='Y' en preference row; un cambio futuro ahí podría requerir actualización de la guía.
