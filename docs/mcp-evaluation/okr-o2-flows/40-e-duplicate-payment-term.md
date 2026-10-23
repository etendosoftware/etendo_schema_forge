# 40. `e-duplicate-payment-term` — Condición de pago repetida

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Condiciones de pago (`/payment-term`).
- **Pedido funcional:** "Creá una condición de pago a 30 días que se llame MCPFLOW Mensual." (ya existe una de 30 días)
- **Verificación:** no se crea ninguna condición nueva; el agente explica que ya existe una con esos días y la nombra.
- **Datos previos:** una condición de pago de 30 días (el seed la trae).
- **Evidencia UI:** ✅ la UI rechaza el alta: "Ya existe la condición de pago «…» con esos días".
- **Holded:** verificar.
