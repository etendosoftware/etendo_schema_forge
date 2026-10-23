# 13. `w-product-crud` — Alta, cambio y baja de un producto

Listado y convenciones: [`../okr-o2-flows.md`](../okr-o2-flows.md).

- **Ventanas:** Producto (`/product`).
- **Pedido funcional:** "Dá de alta el producto Producto MCPFLOW, que compramos a 4 € y vendemos a
  9 €. Después cambiale la descripción a 'caja de 6'. Al final borralo."
- **Verificación:** el producto existe con los dos precios y la descripción; después del borrado no.
- **Datos previos:** ninguno. Obligatorios: código, nombre, tipo, categoría, unidad y grupo de
  impuesto (los selectores vienen con valor por defecto).
- **Evidencia UI:** ✅ alta, edición (releída) y baja. 👁 los precios van en la pestaña Precio
  (tarifas); no se cargaron.
- **Holded:** alta, cambio y baja sí; no tiene tool para listar ni leer productos.
