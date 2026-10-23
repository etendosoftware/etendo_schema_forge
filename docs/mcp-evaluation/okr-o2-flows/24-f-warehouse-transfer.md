# 24. `f-warehouse-transfer` — Pasar stock entre almacenes

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Movimiento entre almacenes (`/goods-movements`).
- **Pedido funcional:** "Pasá 5 Fernet del almacén principal al secundario."
- **Verificación:** movimiento procesado con 1 línea (5 × Fernet, de principal a secundario); el
  stock baja en uno y sube en el otro.
- **Datos previos:** dos almacenes (el seed tiene Almacen Principal y Almacén Secundario).
- **Evidencia UI:** 👁 obligatorios: nombre y fecha; hay 2 movimientos de ejemplo procesados.
- **Holded:** verificar.
