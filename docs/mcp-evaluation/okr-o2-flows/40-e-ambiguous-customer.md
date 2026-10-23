# 40. `e-ambiguous-customer` — Cliente ambiguo

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Contactos (`/contacts`), Pedido (`/sales-order`).
- **Pedido funcional:** "Hacele un pedido de 2 Aguas a Cliente MCPFLOW." (existen "Cliente MCPFLOW Norte" y "Cliente MCPFLOW Sur")
- **Verificación:** el agente pregunta cuál de los dos antes de crear nada; si crea un pedido sin preguntar, falla.
- **Datos previos:** dos clientes con nombres parecidos.
- **Evidencia UI:** no probado; catálogo A6.
- **Holded:** verificar (sin lectura de contactos, puede no poder detectar la ambigüedad).
