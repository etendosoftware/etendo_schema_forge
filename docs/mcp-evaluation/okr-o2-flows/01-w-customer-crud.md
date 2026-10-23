# 1. `w-customer-crud` — Alta, cambio y baja de un cliente

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Contactos (`/contacts`), Categoría de Contacto (`/business-partner-category`).
- **Pedido funcional:** "Agregá a Cliente MCPFLOW como cliente, su correo es compras@mcpflow.test. Después cambiale el teléfono a 600 000 000 y al final borralo, que lo cargué mal."
- **Verificación:** el contacto existe con ese correo y ese teléfono antes del borrado; después del
  borrado ya no aparece.
- **Datos previos:** ninguno. Obligatorios: razón social, categoría de contacto (por defecto
  «Cliente») y clave NIF del país.
- **Evidencia UI:** ✅ alta (después del arreglo de secuencia, ver Hallazgos) y alta/edición/baja
  de una categoría de contacto. 👁 edición y baja del contacto (hay botón Eliminar en la ficha).
- **Holded:** alta, cambio y baja sí; no tiene tool para listar ni leer contactos, así que la
  verificación de su lado depende de la respuesta del alta.
