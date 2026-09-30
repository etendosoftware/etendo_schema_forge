---
task: ETP-4799
note: ETP-4799/0e43e69e
kind: backfill
date: 2026-09-10T13:20:17.000Z
authors:
  - Irina
agents:
sessions:
commits:
  - 87b8b7b5f1
files:
  - .claude/agents/tenant-fixer.md
  - cli/src/data-fixes/sql/20260730T180000Z__R17-rectificativa-doctype-sequence.sql
  - cli/src/data-fixes/sql/README.md
  - cli/test/data-fixes-r17-rectificativa-doctype-sequence.test.js
  - docs/etendo-ad/tenant-remediation-knowledge.md
---

## Resumen
Se implementó la creación automática de categorías de mayor general faltantes antes de insertar tipos de documentos contables. Esto previene errores de restricción en la base de datos durante la remediación de tenants.

## Decisiones
- Insertar categorías GL de forma automática — evita fallos al crear C_DocType cuando la categoría no existe previamente
- Implementar como migración SQL versionada — se integra en el flujo estándar de remediation en lugar de ser un script manual
- Cobertura de tests completa — se agregaron 265 líneas de pruebas para validar el comportamiento de la migración

## Descartado
- Crear las categorías manualmente en cada tenant — requeriría intervención manual repetitiva
