---
task: ETP-5517
note: ETP-5517/0999a661
kind: backfill
date: 2026-09-28T12:46:25.000Z
authors:
  - Lucas Palacios
agents:
sessions:
commits:
  - d7e36d448f
files:
  - .github/workflows/deploy-staging.yml
---

## Resumen
Se implementó almacenamiento de paquetes SPA construidos en S3 y coordinación de despliegues: cada build se archiva en `s3://$S3_BUCKET_FRONT_RELEASES/<env>/<sha>/` y Jenkins publica entornos configurados en `COORDINATED_TARGETS` tras el deploy del backend.

## Decisiones
- Usar S3 para versionar builds de frontend — permite desacoplamiento entre pipeline de frontend y despliegues posteriores de backend
- Variable `COORDINATED_TARGETS` controla qué entornos publica Jenkins — facilita adopción gradual sin cambiar comportamiento si está vacía

## Deuda dejada
- La lógica de coordinación reside en Jenkins; la nomenclatura y versionado dependen de acuerdos externos (formato de `<sha>`, política de retención en S3)
- No hay documentación visible sobre cómo Jenkins consume estos artifacts o cómo configurar `COORDINATED_TARGETS`
