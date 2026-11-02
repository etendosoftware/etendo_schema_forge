# 28. `f-bank-account-transfer` — Cuenta nueva y transferencia

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Cuentas (`/financial-account`).
- **Pedido funcional:** "Abrimos una cuenta en el banco MCPFLOW. Cargala y pasale 500 € de la caja, es un traspaso interno."
- **Datos previos:** el concepto contable "55500001-Traspasos internos" (subcuenta 55500001 de 5550
  en "Arbol de cuentas GO"), dato fijo de la empresa. La transferencia exige un concepto, igual que
  el formulario "Transferir"; sin uno de traspaso en el tenant, el agente la imputó a "Capital social"
  (barrido del 2 nov, H9).
- **Verificación:** la cuenta existe; la caja baja 500 € y la cuenta nueva sube 500 €.
- **Evidencia UI:** 👁 3 cuentas en el seed (Caja, Cuenta de Banco, Tarjeta); "Nueva cuenta" abre un
  formulario modal; también hay "Reglas de matcheo". Transferencias y depósitos están cubiertos por
  la suite `treasury` (catálogo D6–D8).
- **Holded:** cuentas bancarias y movimientos sí (verificar transferencia).
