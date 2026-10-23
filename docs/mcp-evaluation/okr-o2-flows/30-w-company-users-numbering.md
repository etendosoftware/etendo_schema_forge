# 30. `w-company-users-numbering` — Usuarios, roles, datos de la empresa y numeración

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Usuarios (`/user`), Roles (`/roles`), Organización (`/organization`), Secuencias de documentos (`/document-sequence`).
- **Pedido funcional:** "Dá de alta a usuario.mcpflow@example.com con permisos de ventas. Después
  decime con qué prefijo salen numeradas nuestras facturas de venta."
- **Verificación:** el usuario existe con el rol de ventas; la respuesta dice "FV".
- **Evidencia UI:** ✅ alta, edición y baja de usuario (al crearlo manda la invitación por correo).
  👁 Roles es una matriz de permisos por ventana (59 filas); Organización es una ficha única
  editable (datos fiscales, IAE, representantes); Secuencias (6, sin alta ni baja) edita prefijo y
  próximo número.
- **Holded:** no hay usuarios por MCP; series de numeración sí (lectura).
