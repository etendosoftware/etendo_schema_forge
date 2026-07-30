
# Cuentas financieras y Conciliaciones | Test Plan — DRAFT de actualización (ETP-4502)

> Este archivo es un borrador de trabajo. NO se toca Confluence hasta que el usuario lo valide.
> Fuente vieja: [Test Plan actual en Confluence](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan)
> Fuente funcional: [Cuentas Financieras y Conciliación Bancaria](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5024940034/Cuentas+Financieras+y+Conciliaci+n+Bancaria)
> Se respeta el formato original: una tabla por Sección, bloques `Case/Given-Precondition/When-Then-Result` por caso.
> Cada caso lleva una anotación `[SIN CAMBIOS] / [MODIFICADO] / [NUEVO] / [ELIMINADO]` respecto al plan viejo, para facilitar la revisión.

## Estado por sección

| Sección | Estado | Resumen |
| --- | --- | --- |
| 1 — Página de Cuentas | Sin cambios | No se toca |
| 2 — Alta, edición y archivado sin conexión | Ajustes menores | Modal de edición (2 tabs reales), kebab actualizado, Eliminar cuenta se saca |
| 3 — Conexión bancaria (PSD2) | Sin cambios | No se toca |
| 4 — Detalle de cuenta + tab Movimientos | Reescritura fuerte | Columnas nuevas, filtro Estado binario, kebab de fila con ciclo de vida completo, dimensiones fijas, + casos nuevos (crear/editar/procesar/contabilizar/reactivar/eliminar movimiento, Transferir fondos) |
| 5 — Reglas de matcheo | Sin cambios | No se toca |
| 6 — Conciliación manual / panel 50/50 | Reescritura fuerte | Conciliación parcial (ya no se deshabilita por diferencia), multi-moneda, método de pago, Desconciliar/Reactivar split-button + casos nuevos |
| 7 — Conciliación automática sugerida | Sin cambios | No se toca |
| 8 — Reactivar y Desconciliar (antes "Contabilización diferida y Reactivar") | Reescritura completa | Se elimina el subsistema de posteo diferido/batch (ya no existe); "Reactivar" se separa en 2 features distintas |
| 9 — Extractos importados e importación de archivos | Ajustes menores | Estados del pill (4, no 3), tag "Parcial", extracto manual, sync PSD2 |

---

# Sección 1 — Página de Cuentas

**[SIN CAMBIOS]** — los 8 casos del plan actual siguen vigentes tal cual (listar cuentas, sidebar de saldos, filtrar por tipo, buscar, navegar al detalle, pill "Conciliar (N)", estado vacío, filtrar inactivas). No se reescribe acá — ver Confluence.

# Sección 3 — Conexión bancaria (PSD2 / Salt Edge)

**[SIN CAMBIOS]** — los 11 casos siguen vigentes tal cual (conectar Banco/Tarjeta, editar conexión, banner re-autorización, sincronizar, desconectar, acciones gateadas por estado, error de sync, widget abandonado, sync periódico, nuevas transacciones). No se reescribe acá.

# Sección 5 — Reglas de matcheo

**[SIN CAMBIOS]** — los 12 casos siguen vigentes tal cual (ETBR_MatchRule: alta, prioridad duplicada, regex inválida/catastrófica, dimensiones, toggle activa, reorder por prioridad, editar, eliminar, límite de 3 dimensiones, alcance por cuenta). No se reescribe acá.

# Sección 7 — Conciliación automática sugerida

**[SIN CAMBIOS]** — los 12 casos siguen vigentes tal cual (popup de sugerencias, excluir grupos, badge "Por regla"/"Nueva", auto-creación de transacción, línea respaldada por factura excluida de reglas, regla inactiva, prioridad de reglas, abrir conciliación desde el popup, idempotencia, estado vacío, deshabilitar Conciliar sin selección, CreateTransaction=No). No se reescribe acá.

---

# Sección 2 — Alta, edición y archivado de cuentas, sin conexión

| ***Case*** | ***Title: Crear cuenta de Banco sin conexión (flujo completo)*** | ***Title: Crear cuenta de Banco sin conexión (flujo completo)*** | ***Title: Crear cuenta de Banco sin conexión (flujo completo)*** |
| --- | --- | --- | --- |
| **1** `[SIN CAMBIOS]` | **Given/Precondition:** | **Given/Precondition:** | **Given/Precondition:** |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Hacer click en `+ Nueva cuenta`. | Se abre el modal de Nueva Cuenta con el selector de tipo (Banco / Caja / Tarjeta). |  |
| **1** | 1. Seleccionar **Banco**. | El modal avanza a la selección de conexión. |  |
| **1** | 1. Elegir la pestaña **Sin conexión**. | Se muestra el formulario de datos de banco. |  |
| **1** | 1. Completar Nombre, IBAN válido, BIC/SWIFT, Moneda y Cuenta contable. | Los campos aceptan los valores; la moneda toma por defecto la de sesión. |  |
| **1** | 1. Hacer click en `Añadir cuenta`. | El backend crea el `FIN_Financial_Account`. |  |
| **1** | 1. Observar el listado de Cuentas. | **Resultado esperado:** el modal se cierra y la nueva cuenta aparece en el listado con saldo 0. |  |
| ***Case*** | ***Title: Crear cuenta de Caja (formulario simplificado)*** | ***Title: Crear cuenta de Caja (formulario simplificado)*** | ***Title: Crear cuenta de Caja (formulario simplificado)*** |
| **2** `[SIN CAMBIOS]` | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Hacer click en `+ Nueva cuenta` y seleccionar **Caja**. | El formulario de Caja se muestra sin campos IBAN/BIC. |  |
| **2** | 1. Completar Nombre y Moneda. | Los campos aceptan los valores. |  |
| **2** | 1. Hacer click en `Añadir cuenta`. | **Resultado esperado:** la cuenta de tipo Caja se crea y aparece en el listado con saldo 0. |  |
| ***Case*** | ***Title: IBAN inválido bloquea el alta*** | ***Title: IBAN inválido bloquea el alta*** | ***Title: IBAN inválido bloquea el alta*** |
| **3** `[SIN CAMBIOS]` | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco, pestaña Sin conexión. | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco, pestaña Sin conexión. | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco, pestaña Sin conexión. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Ingresar un IBAN inválido (falla checksum mod-97). | El campo IBAN marca error. |  |
| **3** | 1. Intentar Guardar. | **Resultado esperado:** se muestra el error inline "El IBAN no es válido" y **no** se llama al backend. |  |
| ***Case*** | ***Title: Editar una cuenta — tabs General y Contabilidad*** | ***Title: Editar una cuenta — tabs General y Contabilidad*** | ***Title: Editar una cuenta — tabs General y Contabilidad*** |
| **4** `[MODIFICADO — antes: "Editar datos generales de una cuenta"]` | **Given/Precondition: **Existe una cuenta editable. | **Given/Precondition: **Existe una cuenta editable. | **Given/Precondition: **Existe una cuenta editable. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. En la fila, abrir el kebab → `Editar cuenta`. | Se abre el modal de edición con encabezado (Nombre / Tipo (RO) / IBAN / Moneda) y 2 tabs debajo: **General** y **Contabilidad**. |  |
| **4** | 1. Revisar la tab **General**. | Muestra configuración de conexión PSD2 y configuración de conciliación. Para cuentas de tipo **Caja**, esta tab no se renderiza (se oculta el trigger y defaultea a Contabilidad). |  |
| **4** | 1. Modificar Nombre y pulsar `Guardar cambios`. | El backend persiste los cambios. |  |
| **4** | 1. Volver al listado. | **Resultado esperado:** la fila refleja inmediatamente los nuevos valores. |  |
| ***Case*** | ***Title: Acciones del kebab de una cuenta*** | ***Title: Acciones del kebab de una cuenta*** | ***Title: Acciones del kebab de una cuenta*** |
| **5** `[MODIFICADO]` | **Given/Precondition: **Existe una cuenta con conexión bancaria. | **Given/Precondition: **Existe una cuenta con conexión bancaria. | **Given/Precondition: **Existe una cuenta con conexión bancaria. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Abrir el kebab de una fila de cuenta. | El menú muestra, en orden: Abrir cuenta, Editar cuenta, Nuevo movimiento, Transferir fondos, Sincronizar ahora, Desconectar PSD2, Archivar cuenta. |  |
| **5** | 1. Ejecutar cada acción. | **Resultado esperado:** Abrir cuenta navega al detalle; Editar cuenta abre el modal de edición; Nuevo movimiento navega al detalle en el tab Movimientos con el modal de alta abierto (deep-link `?tab=movements&newMovement=true`); Transferir fondos abre `FundsTransferModal` con esta cuenta como origen; Sincronizar ahora dispara la sincronización; Desconectar PSD2 pide confirmación y desconecta la cuenta; Archivar pide confirmación y archiva la cuenta (Activa = No). |  |
| ***Case*** | ***Title: Archivar una cuenta*** | ***Title: Archivar una cuenta*** | ***Title: Archivar una cuenta*** |
| **6** `[SIN CAMBIOS]` | **Given/Precondition: **Existe una cuenta activa visible en el listado. | **Given/Precondition: **Existe una cuenta activa visible en el listado. | **Given/Precondition: **Existe una cuenta activa visible en el listado. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. En la fila, abrir el kebab → `Archivar`. | Se muestra un diálogo de confirmación. |  |
| **6** | 1. Confirmar el archivado. | La cuenta pasa a Activa = No. |  |
| **6** | 1. Observar el listado con el filtro por defecto. | La cuenta archivada deja de aparecer entre las activas. |  |
| **6** | 1. Cambiar el filtro de tipo a "Inactivas". | **Resultado esperado:** la cuenta aparece en el listado de Inactivas. |  |
| ***Case*** | ***Title: Archivar una cuenta con conciliaciones abiertas (rechazo 409)*** | ***Title: Archivar una cuenta con conciliaciones abiertas (rechazo 409)*** | ***Title: Archivar una cuenta con conciliaciones abiertas (rechazo 409)*** |
| **7** `[NUEVO]` | **Given/Precondition: **Existe una cuenta activa con al menos una `FIN_Reconciliation` abierta (en curso). | **Given/Precondition: **Existe una cuenta activa con al menos una `FIN_Reconciliation` abierta (en curso). | **Given/Precondition: **Existe una cuenta activa con al menos una `FIN_Reconciliation` abierta (en curso). |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. En la fila, abrir el kebab → `Archivar` y confirmar. | El backend valida las conciliaciones abiertas. |  |
| **7** | 1. Observar el resultado. | **Resultado esperado:** se rechaza con HTTP 409 y un mensaje claro; el diálogo permanece abierto y la cuenta sigue activa. |  |
| ***Case*** | ***Title: Reactivar (desarchivar) una cuenta inactiva*** | ***Title: Reactivar (desarchivar) una cuenta inactiva*** | ***Title: Reactivar (desarchivar) una cuenta inactiva*** |
| **8** `[SIN CAMBIOS]` | **Given/Precondition: **Existe una cuenta inactiva (Activa = No, archivada). | **Given/Precondition: **Existe una cuenta inactiva (Activa = No, archivada). | **Given/Precondition: **Existe una cuenta inactiva (Activa = No, archivada). |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Filtrar por "Inactivas" y abrir el kebab de la cuenta → `Reactivar`. | Se muestra un diálogo de confirmación. |  |
| **8** | 1. Confirmar la reactivación. | La cuenta vuelve a Activa = Sí. |  |
| **8** | 1. Volver al filtro por defecto. | **Resultado esperado:** la cuenta reaparece en el listado de cuentas activas y deja de figurar bajo "Inactivas". |  |
| ***Case*** | ***Title: Crear cuenta de Tarjeta sin conexión*** | ***Title: Crear cuenta de Tarjeta sin conexión*** | ***Title: Crear cuenta de Tarjeta sin conexión*** |
| **9** `[SIN CAMBIOS]` | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Hacer click en `+ Nueva cuenta` y seleccionar **Tarjeta**. | El wizard muestra, igual que en Banco, las pestañas **Sin conexión** y **Con conexión**. |  |
| **9** | 1. Elegir la pestaña **Sin conexión**. | Se muestra el formulario de alta de tarjeta. |  |
| **9** | 1. Completar Nombre, Moneda y los datos propios de la tarjeta. | Los campos aceptan los valores. |  |
| **9** | 1. Hacer click en `Añadir cuenta`. | **Resultado esperado:** la cuenta de tipo Tarjeta se crea sin conexión y aparece en el listado con saldo 0 y el indicador de tipo Tarjeta. |  |
| ***Case*** | ***Title: Acciones del kebab de una cuenta sin conexión PSD2*** | ***Title: Acciones del kebab de una cuenta sin conexión PSD2*** | ***Title: Acciones del kebab de una cuenta sin conexión PSD2*** |
| **10** `[MODIFICADO]` | **Given/Precondition: **Existe una cuenta de Banco sin conexión PSD2 activa (offline). | **Given/Precondition: **Existe una cuenta de Banco sin conexión PSD2 activa (offline). | **Given/Precondition: **Existe una cuenta de Banco sin conexión PSD2 activa (offline). |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Abrir el kebab de la fila. | El menú muestra: Abrir cuenta, Editar cuenta, Nuevo movimiento, Transferir fondos, Conectar PSD2, Archivar cuenta. |  |
| **10** | 1. Revisar las opciones de conexión. | **Resultado esperado:** no aparecen "Sincronizar ahora" ni "Desconectar PSD2" (solo aplican a cuentas con conexión activa); en su lugar se ofrece "Conectar PSD2". |  |
| ***Case*** | ***Title: Acciones del kebab para una cuenta de tipo Caja*** | ***Title: Acciones del kebab para una cuenta de tipo Caja*** | ***Title: Acciones del kebab para una cuenta de tipo Caja*** |
| **11** `[NUEVO]` | **Given/Precondition: **Existe una cuenta de tipo Caja activa. | **Given/Precondition: **Existe una cuenta de tipo Caja activa. | **Given/Precondition: **Existe una cuenta de tipo Caja activa. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Abrir el kebab de la fila. | **Resultado esperado:** no aparecen las opciones de conexión PSD2 (Conectar/Sincronizar/Desconectar) — quedan Abrir cuenta, Editar cuenta, Nuevo movimiento, Transferir fondos, Archivar cuenta. |  |
| ***Case*** | ***Title: Crear cuenta con IBAN duplicado (rechazo) — validación propuesta, a confirmar*** | ***Title: Crear cuenta con IBAN duplicado (rechazo) — validación propuesta, a confirmar*** | ***Title: Crear cuenta con IBAN duplicado (rechazo) — validación propuesta, a confirmar*** |
| **12** `[SIN CAMBIOS]` | **Given/Precondition: **Ya existe una cuenta de Banco activa con un IBAN determinado en el mismo cliente. | **Given/Precondition: **Ya existe una cuenta de Banco activa con un IBAN determinado en el mismo cliente. | **Given/Precondition: **Ya existe una cuenta de Banco activa con un IBAN determinado en el mismo cliente. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Abrir `+ Nueva cuenta`, tipo Banco, e ingresar el mismo IBAN de una cuenta ya existente. | El formulario acepta el texto. |  |
| **12** | 1. Hacer click en `Añadir cuenta`. | **Resultado esperado:** el sistema rechaza el alta con un mensaje de IBAN duplicado y la cuenta no se crea. *(Regla a confirmar con producto: unicidad de IBAN por cliente, solo cuentas de Banco.)* |  |

**`[ELIMINADO]` Casos viejos 10 y 11 — "Eliminar una cuenta sin movimientos" / "Eliminar una cuenta con movimientos (bloqueo)".** Confirmado: la acción "Eliminar" ya no existe en el kebab de cuentas (solo queda Archivar). Se sacan del plan sin reemplazo.

**Nota de alcance:** no se agrega un caso dedicado a la tab **Contabilidad** del modal de edición (cuenta bancaria/transitoria, ETP-4530) — baja prioridad funcional para este equipo. Si en el futuro se prioriza, agregar un caso que cubra: alta de cuenta contable + cuenta transitoria, el mensaje cuando la organización no tiene Ledger configurado, y el gating por capability `showAccountingFields`.

---

# Sección 4 — Vista detalle de cuenta + tab Movimientos

| ***Case*** | ***Title: Cargar la vista detalle (tabs y breadcrumb)*** | ***Title: Cargar la vista detalle (tabs y breadcrumb)*** | ***Title: Cargar la vista detalle (tabs y breadcrumb)*** |
| --- | --- | --- | --- |
| **1** `[SIN CAMBIOS]` | **Given/Precondition: **Se hace click en una fila de cuenta desde la página de Cuentas. | **Given/Precondition: **Se hace click en una fila de cuenta desde la página de Cuentas. | **Given/Precondition: **Se hace click en una fila de cuenta desde la página de Cuentas. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Esperar que cargue la vista detalle. | Se renderiza la cabecera y los tabs. |  |
| **1** | 1. Revisar título y breadcrumb. | El título es el nombre de la cuenta; el breadcrumb es `Finanzas / Cuentas / {nombre}`. |  |
| **1** | 1. Revisar los tabs. | **Resultado esperado:** los tabs Movimientos / Conciliación / Extractos importados son visibles y **Movimientos** está seleccionado por defecto; el botón `Editar` (lápiz) es fijo a la izquierda en cualquier tab. |  |
| ***Case*** | ***Title: Movimientos: summary strip y columnas de la tabla*** | ***Title: Movimientos: summary strip y columnas de la tabla*** | ***Title: Movimientos: summary strip y columnas de la tabla*** |
| **2** `[MODIFICADO]` | **Given/Precondition: **Cuenta con ~50 transacciones (`FIN_FinAcc_Transaction`), algunas con pago vinculado y otras G/L manuales. | **Given/Precondition: **Cuenta con ~50 transacciones (`FIN_FinAcc_Transaction`), algunas con pago vinculado y otras G/L manuales. | **Given/Precondition: **Cuenta con ~50 transacciones (`FIN_FinAcc_Transaction`), algunas con pago vinculado y otras G/L manuales. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Con el tab Movimientos activo, esperar la carga. | El summary strip muestra IBAN (en grupos de 4) + Saldo total + Entradas (30d) + Salidas (30d). |  |
| **2** | 1. Revisar las columnas de la tabla. | Columnas: chevron expandir · checkbox · Fecha · Pago · Contacto · Descripción · Estado · Tipo (con sub-label de estado de posteo) · G/L Item · Importe · Saldo · kebab. |  |
| **2** | 1. Sobre un movimiento con pago vinculado, hacer click en la columna Pago. | **Resultado esperado:** navega a `/payment-in/{id}` o `/payment-out/{id}` según corresponda; los importes muestran signo y color; no hay counter "Sin contabilizar" en el strip. |  |
| ***Case*** | ***Title: Filtrar movimientos por Estado (Conciliado / Sin conciliar)*** | ***Title: Filtrar movimientos por Estado (Conciliado / Sin conciliar)*** | ***Title: Filtrar movimientos por Estado (Conciliado / Sin conciliar)*** |
| **3** `[MODIFICADO — antes: "8 estados con búsqueda"]` | **Given/Precondition: **La cuenta tiene movimientos conciliados y sin conciliar. | **Given/Precondition: **La cuenta tiene movimientos conciliados y sin conciliar. | **Given/Precondition: **La cuenta tiene movimientos conciliados y sin conciliar. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Abrir el filtro avanzado y elegir Estado = "Conciliado". | La tabla filtra. |  |
| **3** | 1. Observar resultados. | **Resultado esperado:** el filtro de Estado tiene solo **2 opciones** (Conciliado / Sin conciliar); solo se muestran movimientos cuyo estado coincide. |  |
| ***Case*** | ***Title: Filtrar movimientos por Tipo (Cobro / Pago)*** | ***Title: Filtrar movimientos por Tipo (Cobro / Pago)*** | ***Title: Filtrar movimientos por Tipo (Cobro / Pago)*** |
| **4** `[SIN CAMBIOS]` | **Given/Precondition: **La cuenta tiene movimientos BPD (Cobro) y BPW (Pago). | **Given/Precondition: **La cuenta tiene movimientos BPD (Cobro) y BPW (Pago). | **Given/Precondition: **La cuenta tiene movimientos BPD (Cobro) y BPW (Pago). |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Abrir el filtro Tipo y elegir "Cobro". | La tabla filtra. |  |
| **4** | 1. Observar resultados. | **Resultado esperado:** solo se muestran movimientos con `trxType === 'BPD'`. |  |
| ***Case*** | ***Title: Filtrar movimientos por Importe (solo entradas)*** | ***Title: Filtrar movimientos por Importe (solo entradas)*** | ***Title: Filtrar movimientos por Importe (solo entradas)*** |
| **5** `[SIN CAMBIOS]` | **Given/Precondition: **La cuenta tiene movimientos positivos y negativos. | **Given/Precondition: **La cuenta tiene movimientos positivos y negativos. | **Given/Precondition: **La cuenta tiene movimientos positivos y negativos. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Abrir el filtro Importe, poner `Mín = 0` y dejar `Máx` vacío. | El panel acepta el rango. |  |
| **5** | 1. Hacer click en Aplicar. | **Resultado esperado:** solo se muestran movimientos con `amount >= 0` (entradas). |  |
| ***Case*** | ***Title: Filtrar movimientos por rango de fechas*** | ***Title: Filtrar movimientos por rango de fechas*** | ***Title: Filtrar movimientos por rango de fechas*** |
| **6** `[SIN CAMBIOS]` | **Given/Precondition: **La cuenta tiene movimientos en distintas fechas. | **Given/Precondition: **La cuenta tiene movimientos en distintas fechas. | **Given/Precondition: **La cuenta tiene movimientos en distintas fechas. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Abrir el filtro de fechas y elegir un preset (p. ej. "Últimos 30 días"). | La tabla filtra al rango del preset. |  |
| **6** | 1. Elegir "Personalizado" y seleccionar un rango en el calendario. | **Resultado esperado:** la tabla solo muestra movimientos dentro del rango (normalizado a día completo) y la pill refleja el rango elegido. |  |
| ***Case*** | ***Title: Buscar movimientos (texto libre)*** | ***Title: Buscar movimientos (texto libre)*** | ***Title: Buscar movimientos (texto libre)*** |
| **7** `[SIN CAMBIOS]` | **Given/Precondition: **Existe un movimiento con documentNo/contacto/descripción conocidos. | **Given/Precondition: **Existe un movimiento con documentNo/contacto/descripción conocidos. | **Given/Precondition: **Existe un movimiento con documentNo/contacto/descripción conocidos. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Escribir un fragmento (p. ej. `1000016`) en el buscador. | El input aplica debounce y filtra. |  |
| **7** | 1. Observar resultados. | **Resultado esperado:** solo se muestran movimientos cuyo documentNo, contacto o descripción contiene el substring. |  |
| ***Case*** | ***Title: Copiar IBAN al portapapeles*** | ***Title: Copiar IBAN al portapapeles*** | ***Title: Copiar IBAN al portapapeles*** |
| **8** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta de Banco con IBAN, vista detalle abierta. | **Given/Precondition: **Cuenta de Banco con IBAN, vista detalle abierta. | **Given/Precondition: **Cuenta de Banco con IBAN, vista detalle abierta. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Hacer click en el IBAN del summary strip. | Se ejecuta la copia al portapapeles. |  |
| **8** | 1. Observar la confirmación. | **Resultado esperado:** el IBAN (sin espacios) queda en el portapapeles y aparece el toast verde "IBAN copiado". |  |
| ***Case*** | ***Title: Crear un movimiento G/L (Guardar como borrador)*** | ***Title: Crear un movimiento G/L (Guardar como borrador)*** | ***Title: Crear un movimiento G/L (Guardar como borrador)*** |
| **9** `[NUEVO]` | **Given/Precondition: **Tab Movimientos abierto. | **Given/Precondition: **Tab Movimientos abierto. | **Given/Precondition: **Tab Movimientos abierto. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Click en `Nuevo movimiento`. | Se abre el modal con Fecha, Tipo (Entrada/Salida), Concepto contable (G/L Item), Importe, Descripción y dimensiones habilitadas (Contacto siempre; Centro de coste/Proyecto/Producto si están habilitadas en la cuenta). | |
| **9** | 1. Completar los campos y click en `Guardar`. | El movimiento se crea en estado **Draft**. |  |
| **9** | 1. Observar la fila en la tabla. | **Resultado esperado:** el movimiento aparece con estado Draft; el kebab ofrece Editar/Procesar/Eliminar (no Contabilizar/Reactivar todavía). |  |
| ***Case*** | ***Title: Confirmar un movimiento G/L (Draft → Procesado, atómico)*** | ***Title: Confirmar un movimiento G/L (Draft → Procesado, atómico)*** | ***Title: Confirmar un movimiento G/L (Draft → Procesado, atómico)*** |
| **10** `[NUEVO]` | **Given/Precondition: **Modal Nuevo movimiento abierto con datos válidos. | **Given/Precondition: **Modal Nuevo movimiento abierto con datos válidos. | **Given/Precondition: **Modal Nuevo movimiento abierto con datos válidos. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Click en `Confirmar` (en vez de Guardar). | El backend crea y procesa el movimiento en un solo paso. |  |
| **10** | 1. Observar la fila. | **Resultado esperado:** el movimiento aparece directamente como Procesado (sin pasar por Draft visible en la UI). |  |
| ***Case*** | ***Title: Procesar un movimiento en Draft desde el kebab*** | ***Title: Procesar un movimiento en Draft desde el kebab*** | ***Title: Procesar un movimiento en Draft desde el kebab*** |
| **11** `[NUEVO]` | **Given/Precondition: **Existe un movimiento G/L en estado Draft. | **Given/Precondition: **Existe un movimiento G/L en estado Draft. | **Given/Precondition: **Existe un movimiento G/L en estado Draft. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Abrir el kebab de la fila → `Procesar`. | Sin diálogo de confirmación (acción no destructiva). |  |
| **11** | 1. Observar el estado. | **Resultado esperado:** el movimiento pasa a Procesado; el kebab ahora ofrece Contabilizar/Reactivar/Eliminar (ya no Editar/Procesar). |  |
| ***Case*** | ***Title: Editar un movimiento G/L no procesado*** | ***Title: Editar un movimiento G/L no procesado*** | ***Title: Editar un movimiento G/L no procesado*** |
| **12** `[NUEVO]` | **Given/Precondition: **Existe un movimiento G/L en Draft. | **Given/Precondition: **Existe un movimiento G/L en Draft. | **Given/Precondition: **Existe un movimiento G/L en Draft. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Abrir el kebab → `Editar` y modificar el importe/dimensiones. | El formulario permite el cambio. |  |
| **12** | 1. Guardar. | **Resultado esperado:** los cambios se persisten; un movimiento ligado a un pago (no G/L manual) no ofrece esta opción en el kebab. |  |
| ***Case*** | ***Title: Bloqueo de edición sobre un movimiento ya procesado*** | ***Title: Bloqueo de edición sobre un movimiento ya procesado*** | ***Title: Bloqueo de edición sobre un movimiento ya procesado*** |
| **13** `[NUEVO]` | **Given/Precondition: **Existe un movimiento G/L Procesado. | **Given/Precondition: **Existe un movimiento G/L Procesado. | **Given/Precondition: **Existe un movimiento G/L Procesado. |
| **13** | ***When*** | ***Then*** | ***Result*** |
| **13** | 1. Abrir el kebab de la fila. | `Editar` no está disponible (las dimensiones quedan bloqueadas tras procesar). |  |
| **13** | 1. Intentar editar vía API directamente. | **Resultado esperado:** el backend rechaza el cambio; hay que `Reactivar` el movimiento (Procesado → Draft) antes de poder editarlo. |  |
| ***Case*** | ***Title: Contabilizar / Descontabilizar un movimiento*** | ***Title: Contabilizar / Descontabilizar un movimiento*** | ***Title: Contabilizar / Descontabilizar un movimiento*** |
| **14** `[NUEVO]` | **Given/Precondition: **Existe un movimiento Procesado, no posteado. | **Given/Precondition: **Existe un movimiento Procesado, no posteado. | **Given/Precondition: **Existe un movimiento Procesado, no posteado. |
| **14** | ***When*** | ***Then*** | ***Result*** |
| **14** | 1. Kebab → `Contabilizar`. | Sin diálogo de confirmación; el movimiento se postea vía `AcctServer`. |  |
| **14** | 1. Observar el sub-label de Tipo. | El indicador de posteo pasa a "Contabilizado"; el kebab ahora ofrece `Descontabilizar`. |  |
| **14** | 1. Kebab → `Descontabilizar`. | **Resultado esperado:** el movimiento vuelve a "Sin contabilizar"; ningún gating por estado de conciliación condiciona esta acción (el campo `reconciliation` no llega al contrato de movimiento). |  |
| ***Case*** | ***Title: Reactivar un movimiento sin riesgo (sin cartel de confirmación)*** | ***Title: Reactivar un movimiento sin riesgo (sin cartel de confirmación)*** | ***Title: Reactivar un movimiento sin riesgo (sin cartel de confirmación)*** |
| **15** `[NUEVO]` | **Given/Precondition: **Existe un movimiento G/L Procesado, no posteado y no conciliado. | **Given/Precondition: **Existe un movimiento G/L Procesado, no posteado y no conciliado. | **Given/Precondition: **Existe un movimiento G/L Procesado, no posteado y no conciliado. |
| **15** | ***When*** | ***Then*** | ***Result*** |
| **15** | 1. Kebab de la fila → `Reactivar`. | Al no requerir confirmación (`needsConfirm = false`), la acción se ejecuta directo, sin modal. |  |
| **15** | 1. Observar el estado. | **Resultado esperado:** el movimiento vuelve a Draft; el kebab vuelve a ofrecer Editar/Procesar/Eliminar. |  |
| ***Case*** | ***Title: Reactivar/Eliminar un movimiento posteado o conciliado (cartel de confirmación compartido)*** | ***Title: Reactivar/Eliminar un movimiento posteado o conciliado (cartel de confirmación compartido)*** | ***Title: Reactivar/Eliminar un movimiento posteado o conciliado (cartel de confirmación compartido)*** |
| **16** `[NUEVO]` | **Given/Precondition: **Existe un movimiento G/L posteado y/o conciliado. | **Given/Precondition: **Existe un movimiento G/L posteado y/o conciliado. | **Given/Precondition: **Existe un movimiento G/L posteado y/o conciliado. |
| **16** | ***When*** | ***Then*** | ***Result*** |
| **16** | 1. Kebab de la fila → `Reactivar` (o `Eliminar`). | Se abre el `LifecycleConfirmModal` compartido (mismo componente que usan Cobros/Pagos y el panel de Conciliación) — título rojo, bullets del estado (posteado/conciliado/ambos), caja de warning amarilla. |  |
| **16** | 1. Confirmar. | **Resultado esperado:** la acción se ejecuta (reactivar → Draft, o eliminar el movimiento); si el movimiento no requiere confirmación (`needsConfirm = false`) esta pantalla no aparece, ver caso 15. |  |
| ***Case*** | ***Title: Row-level "Desconciliar" en Movimientos permanece deshabilitado (limitación conocida)*** | ***Title: Row-level "Desconciliar" en Movimientos permanece deshabilitado (limitación conocida)*** | ***Title: Row-level "Desconciliar" en Movimientos permanece deshabilitado (limitación conocida)*** |
| **17** `[NUEVO]` | **Given/Precondition: **Existe un movimiento conciliado, visible en el tab Movimientos. | **Given/Precondition: **Existe un movimiento conciliado, visible en el tab Movimientos. | **Given/Precondition: **Existe un movimiento conciliado, visible en el tab Movimientos. |
| **17** | ***When*** | ***Then*** | ***Result*** |
| **17** | 1. Abrir el kebab de la fila. | La opción "Desconciliar" es visible en el menú. |  |
| **17** | 1. Observar su estado. | **Resultado esperado:** la opción está siempre deshabilitada con tooltip explicativo — no está implementada acá; la única forma real de desconciliar/reactivar una conciliación es desde el tab **Conciliación** (ver Sección 6). Este caso es un guard de regresión: si algún día se habilita sin querer, este test debe fallar y forzar una revisión. |  |
| ***Case*** | ***Title: Transferir fondos entre cuentas (misma moneda)*** | ***Title: Transferir fondos entre cuentas (misma moneda)*** | ***Title: Transferir fondos entre cuentas (misma moneda)*** |
| **18** `[NUEVO]` | **Given/Precondition: **Existen 2 cuentas activas en la misma moneda. | **Given/Precondition: **Existen 2 cuentas activas en la misma moneda. | **Given/Precondition: **Existen 2 cuentas activas en la misma moneda. |
| **18** | ***When*** | ***Then*** | ***Result*** |
| **18** | 1. Desde el split-button `Nuevo movimiento ▾ → Transferir fondos`, elegir cuenta destino, G/L item e importe. | El formulario no muestra el bloque de conversión (mismas monedas). |  |
| **18** | 1. Confirmar. | **Resultado esperado:** se crean 2 transacciones (salida en origen, entrada en destino) en estado **Pendiente** (no conciliadas) hasta que se concilien. |  |
| ***Case*** | ***Title: Transferir fondos entre cuentas en distinta moneda, con fee bancario*** | ***Title: Transferir fondos entre cuentas en distinta moneda, con fee bancario*** | ***Title: Transferir fondos entre cuentas en distinta moneda, con fee bancario*** |
| **19** `[NUEVO]` | **Given/Precondition: **Existen 2 cuentas activas en monedas distintas (p. ej. EUR y USD). | **Given/Precondition: **Existen 2 cuentas activas en monedas distintas (p. ej. EUR y USD). | **Given/Precondition: **Existen 2 cuentas activas en monedas distintas (p. ej. EUR y USD). |
| **19** | ***When*** | ***Then*** | ***Result*** |
| **19** | 1. Abrir `Transferir fondos`, elegir la cuenta destino de otra moneda. | Aparece el bloque de conversión con la tasa aplicada. |  |
| **19** | 1. Tildar "Fee bancario" y completar los 2 campos (origen/destino). | El formulario acepta ambos importes de fee. |  |
| **19** | 1. Confirmar. | **Resultado esperado:** se crean las transacciones con los importes convertidos y el fee restado en cada punta según corresponda; ambas quedan Pendientes hasta conciliarse. |  |
| ***Case*** | ***Title: Kebab de fila en Movimientos (ciclo de vida completo)*** | ***Title: Kebab de fila en Movimientos (ciclo de vida completo)*** | ***Title: Kebab de fila en Movimientos (ciclo de vida completo)*** |
| **20** `[MODIFICADO — antes: caso 9 "solo Desconciliar y Contabilizar"]` | **Given/Precondition: **Tab Movimientos con movimientos en distintos estados (Draft, Procesado, Posteado). | **Given/Precondition: **Tab Movimientos con movimientos en distintos estados (Draft, Procesado, Posteado). | **Given/Precondition: **Tab Movimientos con movimientos en distintos estados (Draft, Procesado, Posteado). |
| **20** | ***When*** | ***Then*** | ***Result*** |
| **20** | 1. Pasar el mouse sobre distintas filas y abrir el kebab de cada una. | El menú varía según el estado del movimiento. |  |
| **20** | 1. Revisar las acciones disponibles por estado. | **Resultado esperado:** Draft → Editar/Procesar/Eliminar; Procesado no posteado → Contabilizar/Reactivar/Eliminar; Posteado → Descontabilizar/Reactivar/Eliminar (con cartel si `needsConfirm`); "Desconciliar" visible pero siempre deshabilitada (ver caso 17). El detalle del movimiento no está en el kebab: se despliega con la flecha de la fila (ver caso 22). |  |
| ***Case*** | ***Title: Volver al listado con el botón atrás*** | ***Title: Volver al listado con el botón atrás*** | ***Title: Volver al listado con el botón atrás*** |
| **21** `[SIN CAMBIOS]` | **Given/Precondition: **Vista detalle abierta en el tab Movimientos. | **Given/Precondition: **Vista detalle abierta en el tab Movimientos. | **Given/Precondition: **Vista detalle abierta en el tab Movimientos. |
| **21** | ***When*** | ***Then*** | ***Result*** |
| **21** | 1. Hacer click en la flecha de "volver" de la toolbar. | La app navega hacia atrás. |  |
| **21** | 1. Observar la URL. | **Resultado esperado:** la URL vuelve a `/finance/accounts`. |  |
| ***Case*** | ***Title: Estado vacío: cuenta sin movimientos*** | ***Title: Estado vacío: cuenta sin movimientos*** | ***Title: Estado vacío: cuenta sin movimientos*** |
| **22** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta sin transacciones registradas. | **Given/Precondition: **Cuenta sin transacciones registradas. | **Given/Precondition: **Cuenta sin transacciones registradas. |
| **22** | ***When*** | ***Then*** | ***Result*** |
| **22** | 1. Abrir la cuenta y el tab Movimientos. | La tabla carga sin filas. |  |
| **22** | 1. Observar la tabla y el summary strip. | **Resultado esperado:** se muestra un estado vacío (mensaje tipo "No hay movimientos"); el saldo y los totales (Entradas/Salidas 30d) figuran en 0,00; los filtros siguen accesibles. |  |
| ***Case*** | ***Title: Combinación de filtros simultáneos*** | ***Title: Combinación de filtros simultáneos*** | ***Title: Combinación de filtros simultáneos*** |
| **23** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta con movimientos variados (distintos estados, tipos, fechas y descripciones). | **Given/Precondition: **Cuenta con movimientos variados (distintos estados, tipos, fechas y descripciones). | **Given/Precondition: **Cuenta con movimientos variados (distintos estados, tipos, fechas y descripciones). |
| **23** | ***When*** | ***Then*** | ***Result*** |
| **23** | 1. Aplicar a la vez los filtros: Estado + Tipo (Cobro/Pago) + rango de Fecha + texto en el buscador. | Cada filtro se va aplicando y su pill queda visible. |  |
| **23** | 1. Observar el listado. | Solo quedan los movimientos que cumplen **todas** las condiciones simultáneamente (intersección, no unión). |  |
| **23** | 1. Quitar los filtros uno a uno. | **Resultado esperado:** al limpiar cada filtro el listado se recompone correctamente, y al quitar todos se restaura el listado completo. |  |
| ***Case*** | ***Title: Paginación / scroll en tabla con muchos movimientos*** | ***Title: Paginación / scroll en tabla con muchos movimientos*** | ***Title: Paginación / scroll en tabla con muchos movimientos*** |
| **24** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta con un gran volumen de movimientos (p. ej. más de 100). | **Given/Precondition: **Cuenta con un gran volumen de movimientos (p. ej. más de 100). | **Given/Precondition: **Cuenta con un gran volumen de movimientos (p. ej. más de 100). |
| **24** | ***When*** | ***Then*** | ***Result*** |
| **24** | 1. Abrir el tab Movimientos y desplazarse hacia el final de la lista. | La tabla carga progresivamente (scroll infinito) o pagina los resultados. |  |
| **24** | 1. Aplicar un filtro con el listado grande cargado. | **Resultado esperado:** la carga por lotes/paginación funciona sin perder ni duplicar filas, el desplazamiento es fluido y el saldo corriente se mantiene coherente. **Nota:** todo el filtrado hoy es client-side (no hay paginado/filtrado server-side todavía). |  |
| ***Case*** | ***Title: Desplegar el detalle del movimiento (dimensiones fijas)*** | ***Title: Desplegar el detalle del movimiento (dimensiones fijas)*** | ***Title: Desplegar el detalle del movimiento (dimensiones fijas)*** |
| **25** `[MODIFICADO]` | **Given/Precondition: **Cuenta con al menos un movimiento. | **Given/Precondition: **Cuenta con al menos un movimiento. | **Given/Precondition: **Cuenta con al menos un movimiento. |
| **25** | ***When*** | ***Then*** | ***Result*** |
| **25** | 1. En una fila, hacer click en la flecha de expandir. | La fila se expande en un desplegable inline (no navega a otra pantalla). |  |
| **25** | 1. Revisar el contenido del desplegable. | Muestra **siempre las mismas 3 dimensiones fijas**: Proyecto, Centro de costes, Producto — independiente de qué dimensiones estén habilitadas en el plan de cuentas de la cuenta. Organización y Business Partner (que ya tiene su columna Contacto) **nunca** se muestran acá. |  |
| **25** | 1. Volver a hacer click en la flecha (o cerrarlo). | **Resultado esperado:** el desplegable se colapsa y la fila vuelve a su estado normal. |  |

---

# Sección 6 — Conciliación manual / panel 50/50

| ***Case*** | ***Title: Abrir el tab Conciliación con paneles prefiltrados*** | ***Title: Abrir el tab Conciliación con paneles prefiltrados*** | ***Title: Abrir el tab Conciliación con paneles prefiltrados*** |
| --- | --- | --- | --- |
| **1** `[MODIFICADO — 12 meses → 30 días, el filtro por defecto]` | **Given/Precondition: **Cuenta con 5 líneas de extracto no conciliadas de los últimos 30 días. | **Given/Precondition: **Cuenta con 5 líneas de extracto no conciliadas de los últimos 30 días. | **Given/Precondition: **Cuenta con 5 líneas de extracto no conciliadas de los últimos 30 días. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. En la vista detalle, abrir el tab Conciliación. | Se renderiza el panel dividido 50/50. |  |
| **1** | 1. Revisar el panel izquierdo. | Muestra las 5 líneas prefiltradas "Pendientes / Últimos 30 días". |  |
| **1** | 1. Revisar el panel derecho. | **Resultado esperado:** muestra las operaciones sistema no conciliadas con el filtro de tipo en "Cualquiera". |  |
| ***Case*** | ***Title: Seleccionar línea de extracto resalta candidatos*** | ***Title: Seleccionar línea de extracto resalta candidatos*** | ***Title: Seleccionar línea de extracto resalta candidatos*** |
| **2** `[SIN CAMBIOS]` | **Given/Precondition: **Tab Conciliación abierto con líneas de extracto. | **Given/Precondition: **Tab Conciliación abierto con líneas de extracto. | **Given/Precondition: **Tab Conciliación abierto con líneas de extracto. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Hacer click en una línea de extracto de `-500,00 €`. | El header del panel derecho muestra fecha, descripción e importe del extracto (en rojo). |  |
| **2** | 1. Observar el panel derecho. | **Resultado esperado:** los candidatos match (sugeridos por el algoritmo estándar) quedan destacados con badge azul "Sugerida". |  |
| ***Case*** | ***Title: Selección 1:1 cuadrada habilita Conciliar*** | ***Title: Selección 1:1 cuadrada habilita Conciliar*** | ***Title: Selección 1:1 cuadrada habilita Conciliar*** |
| **3** `[SIN CAMBIOS]` | **Given/Precondition: **Hay una línea de extracto de `-500,00 €` y un pago sistema de `-500,00 €`. | **Given/Precondition: **Hay una línea de extracto de `-500,00 €` y un pago sistema de `-500,00 €`. | **Given/Precondition: **Hay una línea de extracto de `-500,00 €` y un pago sistema de `-500,00 €`. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Seleccionar la línea de extracto `-500,00 €`. | Se actualiza la barra inferior. |  |
| **3** | 1. Seleccionar el pago de `-500,00 €` en el panel derecho. | La barra muestra `Documentos seleccionados: -500,00 €` y `Restante por conciliar: 0,00 €`. |  |
| **3** | 1. Observar el botón Conciliar. | **Resultado esperado:** el botón Conciliar queda habilitado. |  |
| ***Case*** | ***Title: Selección 1:N con diferencia — conciliación parcial (ya no bloquea)*** | ***Title: Selección 1:N con diferencia — conciliación parcial (ya no bloquea)*** | ***Title: Selección 1:N con diferencia — conciliación parcial (ya no bloquea)*** |
| **4** `[MODIFICADO — antes: "deshabilita Conciliar"]` | **Given/Precondition: **Línea de extracto `-500,00 €` y dos pagos que suman `-400,00 €`. | **Given/Precondition: **Línea de extracto `-500,00 €` y dos pagos que suman `-400,00 €`. | **Given/Precondition: **Línea de extracto `-500,00 €` y dos pagos que suman `-400,00 €`. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Seleccionar la línea de extracto y los dos pagos. | La barra inferior recalcula y muestra `Restante por conciliar: -100,00 €`. |  |
| **4** | 1. Observar el botón Conciliar. | A diferencia del comportamiento viejo, el botón **queda habilitado** — la conciliación parcial (under-selection) es válida. |  |
| **4** | 1. Confirmar Conciliar. | **Resultado esperado:** los 400 € seleccionados se concilian; el remanente de 100 € queda como una **sub-línea pendiente nueva**, que sigue apareciendo en el filtro "Pendiente" del panel izquierdo. El único caso que el backend rechaza con 400 es una selección que no cubre absolutamente nada de la línea. |  |
| ***Case*** | ***Title: Filtrar candidatos del panel derecho por tipo de documento*** | ***Title: Filtrar candidatos del panel derecho por tipo de documento*** | ***Title: Filtrar candidatos del panel derecho por tipo de documento*** |
| **5** `[SIN CAMBIOS]` | **Given/Precondition: **El panel derecho tiene candidatos de varios tipos. | **Given/Precondition: **El panel derecho tiene candidatos de varios tipos. | **Given/Precondition: **El panel derecho tiene candidatos de varios tipos. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Abrir el dropdown "Tipo de transacción" del panel derecho y elegir "Facturas de venta". | El filtro aplica. |  |
| **5** | 1. Observar el listado. | **Resultado esperado:** solo se listan candidatos de tipo Factura de venta (las 4 opciones mutuamente excluyentes son: Facturas de venta / Facturas de compra / Cobros / Pagos). |  |
| ***Case*** | ***Title: Conciliar un match 1:N válido*** | ***Title: Conciliar un match 1:N válido*** | ***Title: Conciliar un match 1:N válido*** |
| **6** `[SIN CAMBIOS]` | **Given/Precondition: **Selección 1:N que cuadra exactamente (o dentro de tolerancia). | **Given/Precondition: **Selección 1:N que cuadra exactamente (o dentro de tolerancia). | **Given/Precondition: **Selección 1:N que cuadra exactamente (o dentro de tolerancia). |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Con la selección cuadrada, hacer click en Conciliar. | El backend persiste vía el flujo estándar de Etendo (`APRM_MatchingUtility`), partiendo la línea en sub-líneas con `EM_ETGO_Match_Group_ID` que el frontend colapsa de vuelta en una sola fila. |  |
| **6** | 1. Observar ambos paneles. | **Resultado esperado:** los items seleccionados desaparecen de las listas no conciliadas y un toast de éxito confirma la operación. |  |
| ***Case*** | ***Title: Conciliar operaciones de cuentas distintas (rechazo 400)*** | ***Title: Conciliar operaciones de cuentas distintas (rechazo 400)*** | ***Title: Conciliar operaciones de cuentas distintas (rechazo 400)*** |
| **7** `[SIN CAMBIOS]` | **Given/Precondition: **Petición manipulada (vía API) mezclando operaciones de dos cuentas financieras. | **Given/Precondition: **Petición manipulada (vía API) mezclando operaciones de dos cuentas financieras. | **Given/Precondition: **Petición manipulada (vía API) mezclando operaciones de dos cuentas financieras. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Enviar al handler de conciliación operaciones de dos cuentas distintas. | El handler valida la pertenencia de cuenta. |  |
| **7** | 1. Observar la respuesta. | **Resultado esperado:** el backend rechaza con HTTP 400 y un mensaje de error claro. |  |
| ***Case*** | ***Title: Conciliar una factura en moneda distinta a la de la cuenta (multi-moneda)*** | ***Title: Conciliar una factura en moneda distinta a la de la cuenta (multi-moneda)*** | ***Title: Conciliar una factura en moneda distinta a la de la cuenta (multi-moneda)*** |
| **8** `[NUEVO]` | **Given/Precondition: **Cuenta en EUR; existe una factura candidata en USD. | **Given/Precondition: **Cuenta en EUR; existe una factura candidata en USD. | **Given/Precondition: **Cuenta en EUR; existe una factura candidata en USD. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Seleccionar el "Tipo de transacción" Facturas y ubicar la factura en USD. | La fila del candidato muestra un badge amber de divisa extranjera (USD). |  |
| **8** | 1. Revisar la línea secundaria de la fila. | Muestra el equivalente en la moneda de la cuenta (`amountBase`), calculado con la **tasa propia de la factura** (no la del extracto). |  |
| **8** | 1. Conciliar. | **Resultado esperado:** si el importe convertido no calza exacto con lo que mandó el banco, la diferencia **no** se postea como diferencia de cambio — queda simplemente sin conciliar en la línea (match parcial, remanente reportado). |  |
| ***Case*** | ***Title: Selector de método de pago al conciliar con facturas*** | ***Title: Selector de método de pago al conciliar con facturas*** | ***Title: Selector de método de pago al conciliar con facturas*** |
| **9** `[NUEVO]` | **Given/Precondition: **Existen métodos de pago configurados para la dirección de la línea seleccionada (entrada o salida); se seleccionan 2 facturas para conciliar. | **Given/Precondition: **Existen métodos de pago configurados para la dirección de la línea seleccionada (entrada o salida); se seleccionan 2 facturas para conciliar. | **Given/Precondition: **Existen métodos de pago configurados para la dirección de la línea seleccionada (entrada o salida); se seleccionan 2 facturas para conciliar. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Click en `Conciliar`. | Se abre el modal selector de método de pago (`ChipSelect`) antes de confirmar. |  |
| **9** | 1. Elegir un método y confirmar. | El método elegido se aplica a **todos** los pagos que esta acción crea. |  |
| **9** | 1. Repetir sin métodos configurados para esa dirección. | **Resultado esperado:** el modal se salta y el backend auto-resuelve el método; una transacción existente ya seleccionada conserva su propio método sin pasar por este selector. |  |
| ***Case*** | ***Title: Asignación greedy en conciliación multi-factura*** | ***Title: Asignación greedy en conciliación multi-factura*** | ***Title: Asignación greedy en conciliación multi-factura*** |
| **10** `[NUEVO]` | **Given/Precondition: **Se seleccionan 3 facturas impagas de distinta fecha (p. ej. 10/01, 05/01, 20/01) cuyo total supera el importe de la línea. | **Given/Precondition: **Se seleccionan 3 facturas impagas de distinta fecha (p. ej. 10/01, 05/01, 20/01) cuyo total supera el importe de la línea. | **Given/Precondition: **Se seleccionan 3 facturas impagas de distinta fecha (p. ej. 10/01, 05/01, 20/01) cuyo total supera el importe de la línea. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Conciliar. | El backend ordena las facturas por `dateinvoiced ASC, documentno ASC` — **no** por el orden en que se tildaron ni por importe. |  |
| **10** | 1. Revisar qué facturas quedaron pagadas completas vs. parciales. | **Resultado esperado:** la factura del 05/01 (más antigua) se paga completa primero; el resto del importe fluye a la siguiente en ese orden; la última en la secuencia puede quedar parcialmente pagada. |  |
| ***Case*** | ***Title: Conciliación parcial: tag "Parcial" y bloque colapsable "conciliado"*** | ***Title: Conciliación parcial: tag "Parcial" y bloque colapsable "conciliado"*** | ***Title: Conciliación parcial: tag "Parcial" y bloque colapsable "conciliado"*** |
| **11** `[NUEVO]` | **Given/Precondition: **Una línea de extracto de 100 € ya conciliada parcialmente contra una factura de 53,24 €. | **Given/Precondition: **Una línea de extracto de 100 € ya conciliada parcialmente contra una factura de 53,24 €. | **Given/Precondition: **Una línea de extracto de 100 € ya conciliada parcialmente contra una factura de 53,24 €. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Localizar la línea en el panel izquierdo. | Aparece como **una sola fila** de 100 € con el badge de estado + un segundo badge "Parcial", y la columna Progreso muestra la barra fina de 4px con tooltip "46,76 € por conciliar". |  |
| **11** | 1. Seleccionar la línea y ver el panel derecho. | Aparece el bloque colapsable "conciliado" (arranca colapsado) con el % conciliado, la barra y el importe. |  |
| **11** | 1. Expandir el bloque "conciliado". | **Resultado esperado:** se lista la factura de 53,24 € ya matcheada, con un botón "−" para desvincularla; al expandir, la lista de candidatos de abajo queda congelada. |  |
| ***Case*** | ***Title: Desvincular un documento individual de una línea parcial*** | ***Title: Desvincular un documento individual de una línea parcial*** | ***Title: Desvincular un documento individual de una línea parcial*** |
| **12** `[NUEVO]` | **Given/Precondition: **Línea parcial con el bloque "conciliado" expandido, mostrando 1 documento matcheado. | **Given/Precondition: **Línea parcial con el bloque "conciliado" expandido, mostrando 1 documento matcheado. | **Given/Precondition: **Línea parcial con el bloque "conciliado" expandido, mostrando 1 documento matcheado. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Click en el botón "−" de esa fila. | Se desvincula solo ese documento (no hay bulk/checkbox acá — es de a uno por vez). |  |
| **12** | 1. Observar el estado de la línea. | **Resultado esperado:** el importe pendiente de la línea aumenta en el importe desvinculado; si ya no queda ningún documento matcheado, la línea vuelve a "Pendiente" simple (sin tag "Parcial"). |  |
| ***Case*** | ***Title: "Desconciliar (N)" — selección total de una línea reconciliada*** | ***Title: "Desconciliar (N)" — selección total de una línea reconciliada*** | ***Title: "Desconciliar (N)" — selección total de una línea reconciliada*** |
| **13** `[MODIFICADO — antes: "el botón cambia a Reactivar"]` | **Given/Precondition: **Existe una línea totalmente reconciliada, con 2 documentos vinculados. | **Given/Precondition: **Existe una línea totalmente reconciliada, con 2 documentos vinculados. | **Given/Precondition: **Existe una línea totalmente reconciliada, con 2 documentos vinculados. |
| **13** | ***When*** | ***Then*** | ***Result*** |
| **13** | 1. Seleccionar la línea reconciliada. | Los documentos vinculados aparecen en el panel derecho, cada uno con checkbox — **todos tildados por defecto** — y un botón "−" individual. |  |
| **13** | 1. Dejar todo tildado y click en `Desconciliar (2)` (label dinámico según cantidad marcada). | Se ejecuta `undoReconciliation`: se deshace la conciliación completa. |  |
| **13** | 1. Observar el resultado. | **Resultado esperado:** el `FIN_Reconciliation` se borra; la línea vuelve a Pendiente sin documentos vinculados. |  |
| ***Case*** | ***Title: "Desconciliar" con subset marcado (deja el resto reconciliado)*** | ***Title: "Desconciliar" con subset marcado (deja el resto reconciliado)*** | ***Title: "Desconciliar" con subset marcado (deja el resto reconciliado)*** |
| **14** `[NUEVO]` | **Given/Precondition: **Línea reconciliada con 2 documentos vinculados. | **Given/Precondition: **Línea reconciliada con 2 documentos vinculados. | **Given/Precondition: **Línea reconciliada con 2 documentos vinculados. |
| **14** | ***When*** | ***Then*** | ***Result*** |
| **14** | 1. Destildar 1 de los 2 documentos y click en `Desconciliar (1)`. | Se ejecuta el loop por transacción marcada (`removeTransactionFromReconciliation` + Payment Removal solo sobre la marcada). |  |
| **14** | 1. Observar el resultado. | **Resultado esperado:** solo el documento destildado permanece reconciliado; el marcado queda desvinculado y la línea pasa a Parcial (ver caso 11). |  |
| ***Case*** | ***Title: "Reactivar" (split-button) — preserva el draft de la conciliación*** | ***Title: "Reactivar" (split-button) — preserva el draft de la conciliación*** | ***Title: "Reactivar" (split-button) — preserva el draft de la conciliación*** |
| **15** `[NUEVO]` | **Given/Precondition: **Línea totalmente reconciliada, con documentos preexistentes (no auto-creados) vinculados. | **Given/Precondition: **Línea totalmente reconciliada, con documentos preexistentes (no auto-creados) vinculados. | **Given/Precondition: **Línea totalmente reconciliada, con documentos preexistentes (no auto-creados) vinculados. |
| **15** | ***When*** | ***Then*** | ***Result*** |
| **15** | 1. Seleccionar la línea, abrir el chevron ▾ junto a `Desconciliar (N)` y elegir `Reactivar`. | Se abre el `LifecycleConfirmModal` compartido con copy propio de esta acción (no destructivo para los documentos preexistentes). |  |
| **15** | 1. Confirmar. | El `FIN_Reconciliation` NO se borra — se lo devuelve a **borrador** (`processed='N'`, `documentStatus='DR'`); no se toca `financialAccountTransaction` de la línea ni `reconciliation`/estado de la transacción. |  |
| **15** | 1. Observar la línea en el panel izquierdo. | **Resultado esperado:** la línea vuelve a "Pendiente" y, al seleccionarla, sus documentos originales aparecen **preseleccionados** en el panel derecho, listos para re-confirmar. |  |
| ***Case*** | ***Title: Re-conciliar tras "Reactivar" sin cambiar la selección (reprocesa la misma conciliación)*** | ***Title: Re-conciliar tras "Reactivar" sin cambiar la selección (reprocesa la misma conciliación)*** | ***Title: Re-conciliar tras "Reactivar" sin cambiar la selección (reprocesa la misma conciliación)*** |
| **16** `[NUEVO]` | **Given/Precondition: **Línea recién "Reactivada" (caso 15), con sus documentos originales preseleccionados. | **Given/Precondition: **Línea recién "Reactivada" (caso 15), con sus documentos originales preseleccionados. | **Given/Precondition: **Línea recién "Reactivada" (caso 15), con sus documentos originales preseleccionados. |
| **16** | ***When*** | ***Then*** | ***Result*** |
| **16** | 1. Sin tocar la preselección, click en `Conciliar`. | Como la selección confirmada coincide exactamente con las transacciones del draft, se reprocesa el **mismo** `FIN_Reconciliation` (no se crea uno nuevo). |  |
| **16** | 1. Verificar en base (o vía API) el id de la conciliación. | **Resultado esperado:** el id de `FIN_Reconciliation` es idéntico al de antes de reactivar — no hay duplicados. |  |
| ***Case*** | ***Title: Re-conciliar tras "Reactivar" cambiando la selección (descarta el draft y compone uno nuevo)*** | ***Title: Re-conciliar tras "Reactivar" cambiando la selección (descarta el draft y compone uno nuevo)*** | ***Title: Re-conciliar tras "Reactivar" cambiando la selección (descarta el draft y compone uno nuevo)*** |
| **17** `[NUEVO]` | **Given/Precondition: **Línea recién "Reactivada", con sus documentos originales preseleccionados. | **Given/Precondition: **Línea recién "Reactivada", con sus documentos originales preseleccionados. | **Given/Precondition: **Línea recién "Reactivada", con sus documentos originales preseleccionados. |
| **17** | ***When*** | ***Then*** | ***Result*** |
| **17** | 1. Destildar un documento y/o agregar otro candidato distinto, y click en `Conciliar`. | El backend detecta que la selección difiere del draft. |  |
| **17** | 1. Verificar el id de la conciliación resultante. | **Resultado esperado:** el draft viejo se descarta por completo (no queda huérfano) y se compone una conciliación **nueva** con un id distinto para la nueva selección. |  |
| ***Case*** | ***Title: Solo puede haber una conciliación en borrador por cuenta — auto-confirmación silenciosa avisada*** | ***Title: Solo puede haber una conciliación en borrador por cuenta — auto-confirmación silenciosa avisada*** | ***Title: Solo puede haber una conciliación en borrador por cuenta — auto-confirmación silenciosa avisada*** |
| **18** `[NUEVO]` | **Given/Precondition: **Cuenta con 2 líneas reconciliadas distintas, ambas con documentos preexistentes. | **Given/Precondition: **Cuenta con 2 líneas reconciliadas distintas, ambas con documentos preexistentes. | **Given/Precondition: **Cuenta con 2 líneas reconciliadas distintas, ambas con documentos preexistentes. |
| **18** | ***When*** | ***Then*** | ***Result*** |
| **18** | 1. Hacer `Reactivar` sobre la línea 1 (queda pendiente, en borrador). | La línea 1 queda pendiente con su draft. |  |
| **18** | 1. Hacer `Reactivar` sobre la línea 2 de la **misma cuenta**. | Core rechaza tener 2 conciliaciones en borrador simultáneas — el backend procesa automáticamente el draft de la línea 1 antes de crear el de la línea 2. |  |
| **18** | 1. Observar el estado de la línea 1 y el toast. | **Resultado esperado:** la línea 1 vuelve a estar **Conciliada** (su draft se auto-confirmó); aparece un toast avisando la auto-confirmación (no ocurre silenciosamente); el cartel de confirmación de `Reactivar` para la línea 2 debe haber mostrado este aviso **antes** de confirmar (bullet extra de advertencia). |  |
| ***Case*** | ***Title: Desconciliar/Reactivar en bulk con fallo parcial (no atómico)*** | ***Title: Desconciliar/Reactivar en bulk con fallo parcial (no atómico)*** | ***Title: Desconciliar/Reactivar en bulk con fallo parcial (no atómico)*** |
| **19** `[NUEVO]` | **Given/Precondition: **Línea reconciliada con 3 documentos vinculados marcados para Desconciliar; se fuerza que 1 de las 3 operaciones subyacentes falle (p. ej. período contable con otra restricción). | **Given/Precondition: **Línea reconciliada con 3 documentos vinculados marcados para Desconciliar; se fuerza que 1 de las 3 operaciones subyacentes falle (p. ej. período contable con otra restricción). | **Given/Precondition: **Línea reconciliada con 3 documentos vinculados marcados para Desconciliar; se fuerza que 1 de las 3 operaciones subyacentes falle (p. ej. período contable con otra restricción). |
| **19** | ***When*** | ***Then*** | ***Result*** |
| **19** | 1. Confirmar `Desconciliar (3)`. | El backend commitea de a una operación (no es atómico); las 2 que sí se pueden procesar quedan hechas aunque la 3ra falle. |  |
| **19** | 1. Observar el toast y la UI. | **Resultado esperado:** se muestra el toast de "éxito parcial" (no éxito total ni fallo total); la lista de líneas se recarga después, reflejando el estado real (2 desvinculadas, 1 sigue vinculada) — sin quedar en estado stale. |  |
| ***Case*** | ***Title: Conciliación manual con diferencia dentro de tolerancia*** | ***Title: Conciliación manual con diferencia dentro de tolerancia*** | ***Title: Conciliación manual con diferencia dentro de tolerancia*** |
| **20** `[SIN CAMBIOS]` | **Given/Precondition: **Una línea de extracto y la(s) operación(es) del sistema cuya suma difiere del importe del extracto por un monto pequeño, dentro del margen de tolerancia configurado. | **Given/Precondition: **Una línea de extracto y la(s) operación(es) del sistema cuya suma difiere del importe del extracto por un monto pequeño, dentro del margen de tolerancia configurado. | **Given/Precondition: **Una línea de extracto y la(s) operación(es) del sistema cuya suma difiere del importe del extracto por un monto pequeño, dentro del margen de tolerancia configurado. |
| **20** | ***When*** | ***Then*** | ***Result*** |
| **20** | 1. Seleccionar la línea de extracto y la(s) operación(es) con una diferencia menor a la tolerancia permitida. | La barra inferior muestra el "Restante por conciliar" con esa pequeña diferencia. |  |
| **20** | 1. Observar el botón Conciliar. | El botón Conciliar queda habilitado (igual que con la conciliación parcial del caso 4, pero acá la diferencia entra dentro del margen configurado explícitamente). |  |
| **20** | 1. Conciliar. | **Resultado esperado:** la conciliación se persiste correctamente y la diferencia dentro de tolerancia se trata según la configuración (sin bloquear la operación). |  |
| ***Case*** | ***Title: Acceso concurrente: dos usuarios sobre la misma línea*** | ***Title: Acceso concurrente: dos usuarios sobre la misma línea*** | ***Title: Acceso concurrente: dos usuarios sobre la misma línea*** |
| **21** `[SIN CAMBIOS]` | **Given/Precondition: **Dos usuarios tienen el tab Conciliación de la misma cuenta abierto, con la misma línea de extracto pendiente visible. | **Given/Precondition: **Dos usuarios tienen el tab Conciliación de la misma cuenta abierto, con la misma línea de extracto pendiente visible. | **Given/Precondition: **Dos usuarios tienen el tab Conciliación de la misma cuenta abierto, con la misma línea de extracto pendiente visible. |
| **21** | ***When*** | ***Then*** | ***Result*** |
| **21** | 1. El usuario A concilia la línea contra una operación. | La conciliación de A se persiste y la línea sale de las pendientes. |  |
| **21** | 1. El usuario B (con su vista cargada de antes) intenta conciliar la misma línea. | El sistema detecta que la línea ya fue conciliada por A. |  |
| **21** | 1. Observar el resultado para B. | **Resultado esperado:** la operación de B se rechaza con un aviso claro (la línea ya no está disponible), no se produce doble conciliación, y al refrescar, la línea ya no figura entre las pendientes de B. |  |

---

# Sección 8 — Reactivar y Desconciliar (antes: "Contabilización diferida y Reactivar")

> **Cambio de alcance de toda la sección:** el subsistema de posteo diferido/por lote a nivel de conciliación (`ETBR_PostStatus`, `PostReconciledProcess`, scheduler `ETBR_PostFrequency`) ya no existe — confirmado. Los casos viejos 1-4 (contabilización manual/programada/fallo de batch) se eliminan sin reemplazo: la contabilización hoy es por movimiento individual, ya cubierta en la Sección 4 (casos 14, 16, 20). El resto de la sección se reescribe distinguiendo las **2 acciones distintas que hoy comparten el nombre "Reactivar"**: (a) la de Movimientos (por movimiento, Sección 4 casos 15-16) y (b) la del panel de Conciliación (draft-preserving, Sección 6 casos 15-18).

**`[ELIMINADO]` Casos viejos 1-4** — "Conciliar deja la línea en Conciliado/Pendiente de contabilizar", "Contabilizar manualmente", "Contabilización programada (scheduler)", "Fallo de un header marca F y el batch continúa". Sin reemplazo — el subsistema de posteo diferido a nivel de conciliación no existe más.

| ***Case*** | ***Title: Movimiento contabilizado es inmutable*** | ***Title: Movimiento contabilizado es inmutable*** | ***Title: Movimiento contabilizado es inmutable*** |
| --- | --- | --- | --- |
| **1** `[MODIFICADO — antes: "Línea contabilizada es inmutable (409)", a nivel de conciliación]` | **Given/Precondition: **Existe un movimiento G/L posteado (contabilizado). | **Given/Precondition: **Existe un movimiento G/L posteado (contabilizado). | **Given/Precondition: **Existe un movimiento G/L posteado (contabilizado). |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Intentar editar el movimiento (vía UI o API) sin reactivarlo primero. | El backend/UI valida el estado. |  |
| **1** | 1. Observar el resultado. | **Resultado esperado:** se rechaza el cambio con un mensaje claro; hay que `Descontabilizar` y/o `Reactivar` el movimiento antes de poder editarlo (ver Sección 4, casos 13-16). |  |
| ***Case*** | ***Title: Reactivar un movimiento (Movimientos) vs. Reactivar una conciliación (Conciliación) — no confundir*** | ***Title: Reactivar un movimiento (Movimientos) vs. Reactivar una conciliación (Conciliación) — no confundir*** | ***Title: Reactivar un movimiento (Movimientos) vs. Reactivar una conciliación (Conciliación) — no confundir*** |
| **2** `[MODIFICADO — antes: "Reactivar una línea contabilizada", flujo global único]` | **Given/Precondition: **Existe un movimiento posteado y conciliado. | **Given/Precondition: **Existe un movimiento posteado y conciliado. | **Given/Precondition: **Existe un movimiento posteado y conciliado. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Desde el tab **Movimientos**, kebab de la fila → `Reactivar`. | Ejecuta el flujo de Sección 4 caso 16: cartel de confirmación (posteado + conciliado) → el movimiento vuelve a Draft. Esto **no** toca la conciliación en sí. |  |
| **2** | 1. Desde el tab **Conciliación**, sobre la línea que vinculaba a ese movimiento, usar el split-button `Desconciliar ▾ → Reactivar`. | Ejecuta el flujo de Sección 6 caso 15: la conciliación vuelve a borrador, preservando los documentos vinculados. |  |
| **2** | 1. Comparar ambos resultados. | **Resultado esperado:** son 2 acciones **independientes y complementarias**, no la misma — el viejo botón global "Reactivar" (un-post + un-reconcile atómico vía Payment Removal, que borraba la conciliación) ya no existe como tal; su código (`useReactivateReconciliation`) está huérfano y sin usar. |  |
| ***Case*** | ***Title: Período contable cerrado rechaza Reactivar (movimiento)*** | ***Title: Período contable cerrado rechaza Reactivar (movimiento)*** | ***Title: Período contable cerrado rechaza Reactivar (movimiento)*** |
| **3** `[MODIFICADO — antes: caso 7, apuntaba al flujo global]` | **Given/Precondition: **Movimiento posteado cuyo período contable está cerrado. | **Given/Precondition: **Movimiento posteado cuyo período contable está cerrado. | **Given/Precondition: **Movimiento posteado cuyo período contable está cerrado. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Kebab de Movimientos → `Reactivar` sobre ese movimiento. | El backend valida el período. |  |
| **3** | 1. Observar la respuesta. | **Resultado esperado:** se rechaza con un error claro que referencia el período cerrado; el movimiento sigue posteado. |  |
| ***Case*** | ***Title: Período contable cerrado rechaza Reactivar (conciliación)*** | ***Title: Período contable cerrado rechaza Reactivar (conciliación)*** | ***Title: Período contable cerrado rechaza Reactivar (conciliación)*** |
| **4** `[NUEVO — complementa el caso 3, ahora del lado de Conciliación]` | **Given/Precondition: **Línea reconciliada cuyo período contable está cerrado. | **Given/Precondition: **Línea reconciliada cuyo período contable está cerrado. | **Given/Precondition: **Línea reconciliada cuyo período contable está cerrado. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Desde el tab Conciliación, intentar `Desconciliar` o `Reactivar` sobre esa línea. | El backend valida el período. |  |
| **4** | 1. Observar la respuesta. | **Resultado esperado:** se rechaza con un error claro que referencia el período cerrado; la línea sigue reconciliada. |  |
| ***Case*** | ***Title: Período bloqueado (no cerrado) — mismo tratamiento que cerrado*** | ***Title: Período bloqueado (no cerrado) — mismo tratamiento que cerrado*** | ***Title: Período bloqueado (no cerrado) — mismo tratamiento que cerrado*** |
| **5** `[MODIFICADO — antes: caso 10]` | **Given/Precondition: **Movimiento o línea reconciliada cuyo período está **bloqueado** para contabilización pero **no cerrado** definitivamente. | **Given/Precondition: **Movimiento o línea reconciliada cuyo período está **bloqueado** para contabilización pero **no cerrado** definitivamente. | **Given/Precondition: **Movimiento o línea reconciliada cuyo período está **bloqueado** para contabilización pero **no cerrado** definitivamente. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Intentar Reactivar/Desconciliar (por cualquiera de las 2 vías, casos 3 y 4). | El backend valida el estado del período. |  |
| **5** | 1. Observar la respuesta. | **Resultado esperado:** de forma consistente con el período cerrado, la operación se rechaza con un mensaje claro que referencia el período bloqueado; el estado permanece sin cambios hasta que el período se desbloquee. |  |
| ***Case*** | ***Title: Estado de los documentos vinculados al reactivar una conciliación*** | ***Title: Estado de los documentos vinculados al reactivar una conciliación*** | ***Title: Estado de los documentos vinculados al reactivar una conciliación*** |
| **6** `[MODIFICADO — antes: caso 11, describía el flujo global viejo]` | **Given/Precondition: **Una línea reconciliada contra un pago que, a su vez, cancela una factura. | **Given/Precondition: **Una línea reconciliada contra un pago que, a su vez, cancela una factura. | **Given/Precondition: **Una línea reconciliada contra un pago que, a su vez, cancela una factura. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Desde Conciliación, `Desconciliar (N)` con todo tildado (deshace completo, ver Sección 6 caso 13). | Se ejecuta el un-reconcile completo. |  |
| **6** | 1. Revisar el pago vinculado y la factura. | El pago vuelve a su estado previo a la conciliación (deja de figurar como conciliado/compensado); la factura mantiene su asignación de pago y su estado de cobro sin cambios. |  |
| **6** | 1. Repetir usando `Reactivar` en vez de `Desconciliar (N)`. | **Resultado esperado:** con `Reactivar`, ni el pago ni la factura pierden su vínculo con la conciliación en ningún momento (la conciliación solo pasa a borrador) — es un cambio de estado del documento de conciliación, no un deshacer; ningún documento se elimina en ninguno de los dos casos. |  |

---

# Sección 9 — Extractos importados e importación de archivos

| ***Case*** | ***Title: Listar extractos importados de la cuenta*** | ***Title: Listar extractos importados de la cuenta*** | ***Title: Listar extractos importados de la cuenta*** |
| --- | --- | --- | --- |
| **1** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta con extractos importados. | **Given/Precondition: **Cuenta con extractos importados. | **Given/Precondition: **Cuenta con extractos importados. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Abrir el tab "Extractos importados". | La tabla se renderiza. |  |
| **1** | 1. Revisar columnas y orden. | **Resultado esperado:** columnas Archivo / (Datos) / Período / Líneas / Progreso / Estado / Importado, ordenadas por fecha de importación descendente. |  |
| ***Case*** | ***Title: Anillo/indicador de progreso refleja líneas matcheadas — VERIFICAR*** | ***Title: Anillo/indicador de progreso refleja líneas matcheadas — VERIFICAR*** | ***Title: Anillo/indicador de progreso refleja líneas matcheadas — VERIFICAR*** |
| **2** `[VERIFICAR — no confirmado si sigue siendo un anillo circular o cambió de estilo]` | **Given/Precondition: **Un extracto con 10 líneas, 7 matcheadas y 3 sin matchear. | **Given/Precondition: **Un extracto con 10 líneas, 7 matcheadas y 3 sin matchear. | **Given/Precondition: **Un extracto con 10 líneas, 7 matcheadas y 3 sin matchear. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Localizar la fila del extracto. | Se muestra la columna Progreso. |  |
| **2** | 1. Leer el indicador de progreso. | **Resultado esperado a confirmar manualmente:** el inventario del código no permitió confirmar si sigue siendo un anillo circular con "70%" o si cambió de estilo (p. ej. a la barra fina `ProgressCell` usada en el panel de Conciliación). Verificar contra la UI real antes de fijar este caso. |  |
| ***Case*** | ***Title: Extracto con línea parcial se muestra colapsada con tag "Parcial"*** | ***Title: Extracto con línea parcial se muestra colapsada con tag "Parcial"*** | ***Title: Extracto con línea parcial se muestra colapsada con tag "Parcial"*** |
| **3** `[NUEVO — corrige un bug real de UI encontrado en esta iteración]` | **Given/Precondition: **Una línea de extracto de 100 € matcheada parcialmente contra una factura de 53,24 €. | **Given/Precondition: **Una línea de extracto de 100 € matcheada parcialmente contra una factura de 53,24 €. | **Given/Precondition: **Una línea de extracto de 100 € matcheada parcialmente contra una factura de 53,24 €. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Expandir el extracto (acordeón) y localizar esa línea. | Se muestra una **única fila** con el importe total original (100 €) y el tag "Parcial", con caption "46,76 € por conciliar". |  |
| **3** | 1. Abrir "Abrir extracto completo" (vista de tabla completa). | **Resultado esperado:** el mismo comportamiento de fila única se replica ahí; antes de esta iteración se mostraban 2 filas sueltas (bug real, ya corregido) — la reconciliada y un "suelto" nuevo de 46,76 €, que parecían no relacionados. |  |
| ***Case*** | ***Title: Estado "Completado" / "Reconciliado"*** | ***Title: Estado "Completado" / "Reconciliado"*** | ***Title: Estado "Completado" / "Reconciliado"*** |
| **4** `[MODIFICADO — antes: 3 estados, hoy son 4]` | **Given/Precondition: **Un extracto con todas sus líneas conciliadas (`RECONCILED`). | **Given/Precondition: **Un extracto con todas sus líneas conciliadas (`RECONCILED`). | **Given/Precondition: **Un extracto con todas sus líneas conciliadas (`RECONCILED`). |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Localizar la fila del extracto. | Se muestra el status pill. |  |
| **4** | 1. Leer el pill. | **Resultado esperado:** el status pill tiene **4 valores posibles** — `DRAFT` / `PENDING` / `PARTIAL` / `RECONCILED` (ya no el modelo viejo de 3: Completado/En curso/Con incidencias) — verificar el copy/color exacto de cada uno contra la UI real. |  |
| ***Case*** | ***Title: Estado "Borrador" (extracto manual sin procesar)*** | ***Title: Estado "Borrador" (extracto manual sin procesar)*** | ***Title: Estado "Borrador" (extracto manual sin procesar)*** |
| **5** `[NUEVO — reemplaza el viejo "En curso"]` | **Given/Precondition: **Un extracto creado manualmente y guardado como borrador (sin procesar). | **Given/Precondition: **Un extracto creado manualmente y guardado como borrador (sin procesar). | **Given/Precondition: **Un extracto creado manualmente y guardado como borrador (sin procesar). |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Localizar la fila. | El pill muestra `DRAFT`. |  |
| **5** | 1. Abrir el kebab de la fila. | **Resultado esperado:** Editar / Procesar / Eliminar están habilitados (solo para drafts, `processed='N'`); en extractos ya procesados estas opciones aparecen deshabilitadas con tooltip. |  |
| ***Case*** | ***Title: Estado "Pendiente" y "Parcial" a nivel de extracto (no solo de línea)*** | ***Title: Estado "Pendiente" y "Parcial" a nivel de extracto (no solo de línea)*** | ***Title: Estado "Pendiente" y "Parcial" a nivel de extracto (no solo de línea)*** |
| **6** `[NUEVO]` | **Given/Precondition: **Un extracto procesado con algunas líneas sin conciliar y otras conciliadas parcialmente. | **Given/Precondition: **Un extracto procesado con algunas líneas sin conciliar y otras conciliadas parcialmente. | **Given/Precondition: **Un extracto procesado con algunas líneas sin conciliar y otras conciliadas parcialmente. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Localizar la fila del extracto. | El pill refleja el estado agregado. |  |
| **6** | 1. Leer el pill y, si aplica, la fracción "Parcial N/M". | **Resultado esperado:** el denominador de "N/M" cuenta **filas físicas**, no filas colapsadas/lógicas — puede crecer tras un split de línea aunque el número de filas visibles no cambie. Esto es un límite de alcance conocido, no un bug. |  |
| ***Case*** | ***Title: Importar un extracto Cuaderno 43 (códigos coincidentes)*** | ***Title: Importar un extracto Cuaderno 43 (códigos coincidentes)*** | ***Title: Importar un extracto Cuaderno 43 (códigos coincidentes)*** |
| **7** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta cuyos `codebank` / `codebranch` / `codeaccount` coinciden con la cabecera del archivo C43, del mismo cliente. Existe un archivo `.txt` C43 válido para esa cuenta. | **Given/Precondition: **Cuenta cuyos `codebank` / `codebranch` / `codeaccount` coinciden con la cabecera del archivo C43, del mismo cliente. Existe un archivo `.txt` C43 válido para esa cuenta. | **Given/Precondition: **Cuenta cuyos `codebank` / `codebranch` / `codeaccount` coinciden con la cabecera del archivo C43, del mismo cliente. Existe un archivo `.txt` C43 válido para esa cuenta. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. En el tab Extractos importados, split-button `+ Nuevo extracto ▾` → subir archivo C43. | Se abre el wizard de 3 pasos: Subir archivo → Revisar líneas → Importar. |  |
| **7** | 1. Seleccionar el archivo C43 y confirmar la importación. | El parser Cuaderno43 valida los códigos (match exacto contra `FIN_FinancialAccount`, scoped al cliente y a la MISMA instancia de cuenta desde la que se disparó el import) y procesa el archivo. |  |
| **7** | 1. Observar el resultado. | **Resultado esperado:** se crean `FIN_BankStatement` + `FIN_BankStatementLine`; el wizard se cierra, la lista refresca con el nuevo extracto arriba, y aparece toast de éxito. |  |
| ***Case*** | ***Title: Importar C43 con códigos que no coinciden (error)*** | ***Title: Importar C43 con códigos que no coinciden (error)*** | ***Title: Importar C43 con códigos que no coinciden (error)*** |
| **8** `[SIN CAMBIOS]` | **Given/Precondition: **Archivo C43 cuya cabecera (entidad/oficina/cuenta) NO coincide con ninguna cuenta del cliente. | **Given/Precondition: **Archivo C43 cuya cabecera (entidad/oficina/cuenta) NO coincide con ninguna cuenta del cliente. | **Given/Precondition: **Archivo C43 cuya cabecera (entidad/oficina/cuenta) NO coincide con ninguna cuenta del cliente. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Abrir el wizard de importar, seleccionar el archivo y confirmar. | El parser intenta resolver la cuenta por códigos. |  |
| **8** | 1. Observar el resultado. | **Resultado esperado:** la importación aborta con error "La cuenta bancaria no existe ({entidad}-{oficina}-{cuenta})"; no se crean extractos. |  |
| ***Case*** | ***Title: Importar archivo con extensión no soportada*** | ***Title: Importar archivo con extensión no soportada*** | ***Title: Importar archivo con extensión no soportada*** |
| **9** `[SIN CAMBIOS]` | **Given/Precondition: **Wizard de importación abierto. | **Given/Precondition: **Wizard de importación abierto. | **Given/Precondition: **Wizard de importación abierto. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Intentar subir un archivo con extensión no soportada. | La validación de tipo lo detecta. |  |
| **9** | 1. Observar la UI. | **Resultado esperado:** un toast de error describe el problema y el wizard permanece abierto para reintentar con otro archivo. |  |
| ***Case*** | ***Title: Crear un extracto manual (sin archivo)*** | ***Title: Crear un extracto manual (sin archivo)*** | ***Title: Crear un extracto manual (sin archivo)*** |
| **10** `[NUEVO]` | **Given/Precondition: **Cuenta sin conexión PSD2, tab Extractos importados abierto. | **Given/Precondition: **Cuenta sin conexión PSD2, tab Extractos importados abierto. | **Given/Precondition: **Cuenta sin conexión PSD2, tab Extractos importados abierto. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Split-button `+ Nuevo extracto ▾` → "Nuevo extracto bancario" (`ManualStatementModal`). | Se abre una tabla 100% editable inline (sin subir archivo). |  |
| **10** | 1. Completar líneas y click en `Guardar como borrador`. | El extracto se crea con pill `DRAFT`. |  |
| **10** | 1. Repetir con `Guardar y procesar`. | **Resultado esperado:** el extracto se crea y queda procesado directamente (pill `PENDING`/`PARTIAL`/`RECONCILED` según matcheo), sin pasar por Draft. |  |
| ***Case*** | ***Title: Cuenta con PSD2 reemplaza el import por "Sincronizar extractos"*** | ***Title: Cuenta con PSD2 reemplaza el import por "Sincronizar extractos"*** | ***Title: Cuenta con PSD2 reemplaza el import por "Sincronizar extractos"*** |
| **11** `[NUEVO]` | **Given/Precondition: **Cuenta con conexión PSD2 activa. | **Given/Precondition: **Cuenta con conexión PSD2 activa. | **Given/Precondition: **Cuenta con conexión PSD2 activa. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Abrir el tab Extractos importados. | En vez del split-button de import (C43/manual), se muestra un botón único "Sincronizar extractos". |  |
| **11** | 1. Click en el botón. | **Resultado esperado:** dispara el fetch PSD2 equivalente al "Get Bank Statement" de Classic; no se ofrece la opción de subir un archivo ni de cargar manualmente mientras la cuenta esté conectada. |  |
| ***Case*** | ***Title: Ver las líneas de un extracto*** | ***Title: Ver las líneas de un extracto*** | ***Title: Ver las líneas de un extracto*** |
| **12** `[SIN CAMBIOS]` | **Given/Precondition: **Existe un extracto importado con líneas. | **Given/Precondition: **Existe un extracto importado con líneas. | **Given/Precondition: **Existe un extracto importado con líneas. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Hacer click en la fila del extracto. | Se expande el acordeón con las líneas del extracto (`StatementLinesInline`). |  |
| **12** | 1. Revisar la mini-tabla de líneas. | Muestra fecha, descripción, contacto (texto libre + BP), G/L item, Nº referencia, Estado, Transacción (chip ↗ al movimiento conciliado — o "N movimientos" si es un grupo), Salida/Entrada. |  |
| **12** | 1. Hacer click de nuevo para colapsar. | **Resultado esperado:** se cierra el acordeón y se regresa al listado de extractos. |  |
| ***Case*** | ***Title: Importar dos veces el mismo archivo C43 (detección de duplicado)*** | ***Title: Importar dos veces el mismo archivo C43 (detección de duplicado)*** | ***Title: Importar dos veces el mismo archivo C43 (detección de duplicado)*** |
| **13** `[SIN CAMBIOS]` | **Given/Precondition: **Una cuenta donde ya se importó un archivo C43 correctamente. | **Given/Precondition: **Una cuenta donde ya se importó un archivo C43 correctamente. | **Given/Precondition: **Una cuenta donde ya se importó un archivo C43 correctamente. |
| **13** | ***When*** | ***Then*** | ***Result*** |
| **13** | 1. Volver a importar el mismo archivo C43 (mismo contenido/período) sobre la misma cuenta. | El sistema compara contra los extractos ya importados. |  |
| **13** | 1. Observar el resultado. | **Resultado esperado:** detecta que el extracto ya fue importado y evita duplicarlo (avisa con un mensaje claro y no vuelve a crear las líneas/movimientos); los saldos no se ven afectados. |  |
| ***Case*** | ***Title: Eliminar un extracto no conciliado*** | ***Title: Eliminar un extracto no conciliado*** | ***Title: Eliminar un extracto no conciliado*** |
| **14** `[SIN CAMBIOS]` | **Given/Precondition: **Existe un extracto importado cuyas líneas no están conciliadas. | **Given/Precondition: **Existe un extracto importado cuyas líneas no están conciliadas. | **Given/Precondition: **Existe un extracto importado cuyas líneas no están conciliadas. |
| **14** | ***When*** | ***Then*** | ***Result*** |
| **14** | 1. Desde el kebab del extracto, elegir `Eliminar`. | Se muestra un diálogo de confirmación. |  |
| **14** | 1. Confirmar la eliminación. | **Resultado esperado:** el extracto y sus líneas se eliminan y desaparecen del listado; los movimientos asociados a la importación se revierten/quitan de forma coherente. |  |
| ***Case*** | ***Title: Eliminar un extracto con líneas conciliadas (bloqueo)*** | ***Title: Eliminar un extracto con líneas conciliadas (bloqueo)*** | ***Title: Eliminar un extracto con líneas conciliadas (bloqueo)*** |
| **15** `[SIN CAMBIOS]` | **Given/Precondition: **Existe un extracto con al menos una línea ya conciliada. | **Given/Precondition: **Existe un extracto con al menos una línea ya conciliada. | **Given/Precondition: **Existe un extracto con al menos una línea ya conciliada. |
| **15** | ***When*** | ***Then*** | ***Result*** |
| **15** | 1. Intentar eliminar el extracto desde su kebab (deshabilitado si está procesado — ver también el estado del kebab). | El sistema valida el estado de conciliación de sus líneas. |  |
| **15** | 1. Observar el resultado. | **Resultado esperado:** la eliminación se bloquea con un mensaje claro (hay líneas conciliadas); el extracto permanece. Para eliminarlo, primero hay que Reactivar/Desconciliar esas líneas desde el tab Conciliación (Sección 6). |  |
| ***Case*** | ***Title: Importar C43 con líneas de datos inválidos*** | ***Title: Importar C43 con líneas de datos inválidos*** | ***Title: Importar C43 con líneas de datos inválidos*** |
| **16** `[SIN CAMBIOS]` | **Given/Precondition: **Un archivo C43 cuyos códigos de cuenta coinciden, pero con algunas líneas con datos malformados (fechas o importes inválidos). | **Given/Precondition: **Un archivo C43 cuyos códigos de cuenta coinciden, pero con algunas líneas con datos malformados (fechas o importes inválidos). | **Given/Precondition: **Un archivo C43 cuyos códigos de cuenta coinciden, pero con algunas líneas con datos malformados (fechas o importes inválidos). |
| **16** | ***When*** | ***Then*** | ***Result*** |
| **16** | 1. Importar el archivo. | El parser procesa las líneas válidas y detecta las que no reconoce. |  |
| **16** | 1. Observar el resultado. | **Resultado esperado:** se importan solo las líneas reconocidas y se muestra un mensaje indicando las líneas que no se pudieron procesar (la importación no se aborta por completo). |  |
| ***Case*** | ***Title: Filtrar / buscar dentro del listado de extractos*** | ***Title: Filtrar / buscar dentro del listado de extractos*** | ***Title: Filtrar / buscar dentro del listado de extractos*** |
| **17** `[SIN CAMBIOS]` | **Given/Precondition: **Cuenta con varios extractos importados. | **Given/Precondition: **Cuenta con varios extractos importados. | **Given/Precondition: **Cuenta con varios extractos importados. |
| **17** | ***When*** | ***Then*** | ***Result*** |
| **17** | 1. Usar el buscador/filtros del listado de extractos (p. ej. por nombre de archivo, fecha o estado). | El listado filtra según el criterio. |  |
| **17** | 1. Limpiar el filtro. | **Resultado esperado:** durante el filtrado solo quedan los extractos coincidentes; al limpiar, se restaura el listado completo. |  |

# Plantilla

| ***Case*** | ***Title:*** | ***Title:*** | ***Title:*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition:** | **Given/Precondition:** | **Given/Precondition:** |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | Step 1 |  |  |
| **1** | Step 2 |  |  |
| **1** | Step 3 |  |  |
| **1** | … |  |  |
| **1** | … |  |  |
| **1** | … | Expected Result |  |
