# 31. `f-manual-journal-post` — Asiento manual y contabilización

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Asientos Manuales (`/manual-journals`), Documentos no contabilizados (`/not-posted-documents`).
- **Pedido funcional:** "Registrá un asiento por 100 €: gasto de alquiler contra caja, descripción
  MCPFLOW Alquiler. Después contabilizalo."
- **Verificación:** asiento completado con débitos = créditos = 100 €; no aparece en Documentos no
  contabilizados.
- **Evidencia UI:** 👁 obligatorios: fecha, período y descripción; líneas aparte. 📄 no deja guardar
  si débito ≠ crédito; solo se borra en borrador. Documentos no contabilizados lista lo pendiente y
  contabiliza de a uno o en lote.
- **Holded:** asientos contables sí (verificar alta).
