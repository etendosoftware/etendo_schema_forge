---
task: ETP-5045
note: ETP-5045/22ac4ab3
kind: backfill
date: 2026-09-17T14:37:11.000Z
authors:
  - sebastianbarrozo
  - Martin Taal
agents:
sessions:
commits:
  - 1291726b6d
  - dd517c9771
  - 8089002698
  - 8d23816ecc
  - 5873300289
  - d3aa12da29
  - 6baeebc697
  - 6346a84ef8
  - a86b4532b5
  - 7599ef983d
  - d2ffc35f77
  - 902f671d20
  - 272f0d5ab0
  - 26dc9b3695
  - 76fcaa2a73
  - 344b1be312
  - 34ee10b89e
  - f77ade828c
files:
  - docs/plans/2026-08-27-recurring-billing-and-resource-limits-prd.md
  - docs/index.md
  - docs/stripe-paid-tenant-checkout-prd.md
  - docs/stripe-local-testing.md
  - tools/stripe-session-stub.py
  - tools/stripe-webhook-simulate.sh
  - .env.example
  - Makefile
  - tools/stripe-local-smoke.sh
  - docs/functionalidad/01-actores-y-superficies.md
  - docs/functionalidad/02-capacidades-y-flujos.md
  - docs/functionalidad/03-reglas-estados-y-validaciones.md
  - docs/functionalidad/04-matriz-de-pruebas-funcionales.md
  - docs/functionalidad/INDEX.md
  - flags-registry.json
  - docs/etp-5045-durable-payment-state.md
---

## Resumen
Se migró el estado de pago de memoria de proceso a almacenamiento duradero y se documentó el sistema de facturación recurrente con configuración sin código. Los cambios establecen la base para suscripciones mensuales por plan, medición de consumo y límites de recursos editables desde Etendo Classic.

## Decisiones
- **Almacenamiento duradero de pagos**: el estado sale de `CheckoutPaymentRegistry` en memoria. Correlaciones se leen de `ETGO_CHECKOUT_REQUEST`, replay protection de `ETGO_BILLING_EVENT`.
- **Stripe nativo**: se eligió implementación directa contra Stripe en lugar de Metronome o servicio Node billing separado.
- **Precio en plan**: vive en la fila del plan, editable desde Classic sin deploy. Se obtiene del precio del proveedor, sin fallback local.
- **Unidad facturable**: factura de ventas POSTED, no PENDING. Fuerza ventana de liquidación porque `C_Invoice` lleva un flag sin timestamp.
- **Consumo por recompilación**: medición programada en lugar de instrumentación en escritura. Permite contar uso desde Classic.
- **Configuración no código**: countable-resources como tabla de catálogo con restricción HQL, cuotas como tabla hija del plan (ausencia = ilimitado).
- **Ciclos de plan**: upgrade inmediato, downgrade en límite de período, anchor nunca se mueve.

## Deuda dejada
- Ventana de crash entre webhook y persistencia de evento (propuesta como tarea sucesora).
- Requisitos de idempotencia y reconciliabilidad de checkout original permanecen sin resolver.
- Gap en smartbuild sampledata.

## Pendiente
- Implementación de tareas ETP-5046 a 5053.
- Aceptación humana de crash window como tarea sucesora.
