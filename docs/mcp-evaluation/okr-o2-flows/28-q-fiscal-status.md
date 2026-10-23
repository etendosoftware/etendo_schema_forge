# 28. `q-fiscal-status` — Situación fiscal de la empresa

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Configuración Fiscal (`/fiscal-config`), Monitor Fiscal (`/fiscal-monitor`), Modelos Fiscales (`/fiscal-models`).
- **Pedido funcional:** "¿Tenemos configurado el envío de facturas a Hacienda? ¿Qué modelos de
  impuestos tenemos presentados este año?"
- **Verificación:** la respuesta dice que no hay sistema fiscal configurado y que no hay modelos (es
  el estado del seed).
- **Evidencia UI:** 👁 Monitor: "No hay sistema fiscal configurado para esta organización";
  Configuración Fiscal abre un asistente (SII/TBAI/Verifactu) con "Omitir" y "Continuar"; Modelos
  Fiscales: catálogo (0) con filtros de año, modelo y estado.
- **Holded:** no.
- **Nota:** se deja como consulta a propósito: configurar el envío a Hacienda no es reversible.
