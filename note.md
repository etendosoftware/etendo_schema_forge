---
task: ETP-5553
note: ETP-5553/2846f034
kind: backfill
date: 2026-09-30T17:02:09.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 41b720d80d
  - 511f01cc65
files:
  - .github/workflows/deploy-ai-bff-experimental.yml
  - .github/workflows/deploy-ai-bff.yml
  - tools/ai-bff/README.md
---

## Resumen
Se migró el sistema de deploy de AI BFF desde GitHub Actions hacia Jenkins, eliminando el workflow de Actions tras una transición que implementó deploy por content hash desde las ramas develop y main.

## Decisiones
- **Deploy por content hash** — permite identificar y cachear deployments únicos basados en el contenido, evitando redeploys innecesarios
- **Migrar a Jenkins** — centralizar la orquestación de deployments en una plataforma separada en lugar de usar GitHub Actions

## Descartado
- **GitHub Actions como plataforma de deploy** — se implementó un workflow mejorado pero fue descartado en favor de Jenkins, sugiriendo que la solución en Actions fue transitoria o no cumplió requisitos de producción

## Deuda dejada
- La documentación en README fue reescrita significativamente (376 líneas eliminadas, 121 agregadas), lo que sugiere cambios profundos en cómo se documenta/ejecuta el deploy
- No queda clara la razón de la migración a Jenkins desde el historial de commits
