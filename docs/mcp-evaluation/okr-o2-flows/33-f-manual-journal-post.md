# 33. `f-manual-journal-post` — Asiento manual y contabilización

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Asientos Manuales (`/manual-journals`), Documentos no contabilizados (`/not-posted-documents`).
- **Pedido funcional:** "Hacé un asiento de 100 € por el alquiler pagado en efectivo, con la descripción MCPFLOW Alquiler, y contabilizalo."
- **Verificación:** asiento completado con débitos = créditos = 100 €; no aparece en Documentos no
  contabilizados.
- **Evidencia UI:** 👁 obligatorios: fecha, período y descripción; líneas aparte. 📄 no deja guardar
  si débito ≠ crédito; solo se borra en borrador. Documentos no contabilizados lista lo pendiente y
  contabiliza de a uno o en lote.
- **Holded:** asientos contables sí (verificar alta).
