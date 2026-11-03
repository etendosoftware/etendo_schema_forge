# 1. `q-hello` — Saludo: costo de arrancar una conversación

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** ninguna.
- **Pedido funcional:** "Hola"
- **Verificación:** el agente responde un saludo sin llamar a ninguna tool. Con los dos lados bien,
  decide la regla v2 por **tokens totales** del turno (catálogo de tools + instrucciones del MCP +
  respuesta), con el mismo margen del 10 %. Se informan también los tokens que vinieron de caché
  (`cachedInputTokens`) y las llamadas, si hubo alguna (lo esperado es 0).
- **Datos previos:** ninguno.
- **Evidencia UI:** no aplica.
- **Holded:** sí (cualquier agente puede saludar).
- **Por qué cuenta para el KR** (decidido, Valentin, 29 oct):
  - es una **alarma de regresión**: si un día se agregan tools de más o se infla la metadata de
    las tools, esta prueba es la primera que lo muestra;
  - mide cómo **convive** el MCP en un agente real, que no tiene solo el MCP de Etendo configurado:
    lo que cuesta tenerlo cargado aunque no se use.
- **Excepción al origen (§3.3 del plan):** no sale de la UI de Etendo ni del MCP de Holded; se
  acepta por los dos motivos de arriba.
