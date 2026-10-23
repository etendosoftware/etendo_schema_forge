# 27. `f-bank-account-transfer` — Cuenta nueva y transferencia

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Cuentas (`/financial-account`).
- **Pedido funcional:** "Abrimos una cuenta en el banco MCPFLOW. Dala de alta y pasale 500 € desde la
  caja."
- **Verificación:** la cuenta existe; la caja baja 500 € y la cuenta nueva sube 500 €.
- **Evidencia UI:** 👁 3 cuentas en el seed (Caja, Cuenta de Banco, Tarjeta); "Nueva cuenta" abre un
  formulario modal; también hay "Reglas de matcheo". Transferencias y depósitos están cubiertos por
  la suite `treasury` (catálogo D6–D8).
- **Holded:** cuentas bancarias y movimientos sí (verificar transferencia).
