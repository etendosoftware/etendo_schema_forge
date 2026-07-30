# Cuentas financieras y Conciliaciones | Test Plan


> ℹ️ ## Índice de secciones
> 1. [Sección 1 — Página de Cuentas](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-1-%E2%80%94-P%C3%A1gina-de-Cuentas)
> 2. [Sección 2 — Alta, edición y archivado de cuentas, sin conexión](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-2-%E2%80%94-Alta-y-edici%C3%B3n-de-cuentas%2C-sin-conexi%C3%B3n)
> 3. [Sección 3 — Conexión bancaria (PSD2 / Salt Edge)](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-3-%E2%80%94-Conexi%C3%B3n-bancaria-(PSD2-%2F-Salt-Edge))
> 4. [Sección 4 — Vista detalle de cuenta + tab Movimientos](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-4-%E2%80%94-Vista-detalle-de-cuenta-%2B-tab-Movimientos)
> 5. [Sección 5 — Reglas de matcheo](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-5-%E2%80%94-Reglas-de-matcheo)
> 6. [Sección 6 — Conciliación manual / panel 50/50](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-6-%E2%80%94-Conciliaci%C3%B3n-manual-%2F-panel-50%2F50)
> 7. [Sección 7 — Conciliación automática sugerida](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-7-%E2%80%94-Conciliaci%C3%B3n-autom%C3%A1tica-sugerida)
> 8. [Sección 8 — Contabilización diferida y Reactivar](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-8-%E2%80%94-Contabilizaci%C3%B3n-diferida-y-Reactivar)
> 9. [Sección 9 — Extractos importados e importación de archivos](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5010554884/Cuentas+financieras+y+Conciliaciones+Test+Plan#Secci%C3%B3n-9-%E2%80%94-Extractos-importados-e-importaci%C3%B3n-de-archivos)

# Sección 1 — Página de Cuentas

| ***Case*** | ***Title: Listar cuentas financieras activas*** | ***Title: Listar cuentas financieras activas*** | ***Title: Listar cuentas financieras activas*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Usuario logueado con varias cuentas financieras activas (banco, caja, tarjeta) en distintas divisas. | **Given/Precondition: **Usuario logueado con varias cuentas financieras activas (banco, caja, tarjeta) en distintas divisas. | **Given/Precondition: **Usuario logueado con varias cuentas financieras activas (banco, caja, tarjeta) en distintas divisas. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Abrir `Finanzas → Cuentas` (`/finance/accounts`). | La página carga con la tabla central y la sidebar de saldos. |  |
| **1** | 1. Observar la tabla de cuentas. | Se lista una fila por cada cuenta activa del cliente/organizaciones accesibles. |  |
| **1** | 1. Revisar las columnas de cada fila. | **Resultado esperado:** cada fila muestra logo + nombre, tipo (Banco/Caja/Tarjeta), IBAN enmascarado, divisa, saldo actual y la celda "Por conciliar". |  |
| ***Case*** | ***Title: Sidebar: saldo total y desglose por divisa*** | ***Title: Sidebar: saldo total y desglose por divisa*** | ***Title: Sidebar: saldo total y desglose por divisa*** |
| **2** | **Given/Precondition: **El cliente tiene tres cuentas en EUR y una en USD. | **Given/Precondition: **El cliente tiene tres cuentas en EUR y una en USD. | **Given/Precondition: **El cliente tiene tres cuentas en EUR y una en USD. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Abrir la página de Cuentas. | La sidebar izquierda se renderiza. |  |
| **2** | 1. Leer el widget "Saldo total". | Muestra la suma de los saldos de las cuentas EUR. |  |
| **2** | 1. Leer el desglose "Por divisa". | **Resultado esperado:** hay una fila EUR (suma de las 3 EUR) y una fila USD separada con su propio total; los signos (+/−) son correctos. |  |
| ***Case*** | ***Title: Filtrar cuentas por tipo*** | ***Title: Filtrar cuentas por tipo*** | ***Title: Filtrar cuentas por tipo*** |
| **3** | **Given/Precondition: **Existen cuentas de tipo Banco, Caja y Tarjeta. | **Given/Precondition: **Existen cuentas de tipo Banco, Caja y Tarjeta. | **Given/Precondition: **Existen cuentas de tipo Banco, Caja y Tarjeta. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Abrir el dropdown de tipo (Todas las cuentas / Banco / Caja / Tarjeta). | Se muestran las 4 opciones. |  |
| **3** | 1. Seleccionar "Banco". | La tabla solo muestra cuentas de tipo Banco. |  |
| **3** | 1. Observar los totales de la sidebar. | **Resultado esperado:** los totales se recalculan para el subconjunto filtrado (solo Banco). |  |
| ***Case*** | ***Title: Buscar cuenta por nombre / IBAN / divisa*** | ***Title: Buscar cuenta por nombre / IBAN / divisa*** | ***Title: Buscar cuenta por nombre / IBAN / divisa*** |
| **4** | **Given/Precondition: **Hay al menos una cuenta cuyo nombre o IBAN contiene un texto conocido. | **Given/Precondition: **Hay al menos una cuenta cuyo nombre o IBAN contiene un texto conocido. | **Given/Precondition: **Hay al menos una cuenta cuyo nombre o IBAN contiene un texto conocido. |
| **4** | 1. Escribir un fragmento del nombre o IBAN en el buscador. | El listado filtra en vivo (case-insensitive, substring). |  |
| **4** | 1. Borrar el texto del buscador. | **Resultado esperado:** durante el filtrado solo quedan las filas coincidentes; al limpiar, se restaura el listado completo. |  |
| ***Case*** | ***Title: Navegar al detalle de la cuenta*** | ***Title: Navegar al detalle de la cuenta*** | ***Title: Navegar al detalle de la cuenta*** |
| **5** | **Given/Precondition: **Hay al menos una cuenta visible en el listado. | **Given/Precondition: **Hay al menos una cuenta visible en el listado. | **Given/Precondition: **Hay al menos una cuenta visible en el listado. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Hacer click en una fila de cuenta (fuera del área del kebab). | La app navega a la vista detalle. |  |
| **5** | 1. Observar la URL y el encabezado. | **Resultado esperado:** la URL es `/financial-account/{id}` y el detalle muestra el nombre de la cuenta como título. |  |
| ***Case*** | ***Title: Pill "Conciliar (N)" en la fila*** | ***Title: Pill "Conciliar (N)" en la fila*** | ***Title: Pill "Conciliar (N)" en la fila*** |
| **6** | **Given/Precondition: **Una cuenta tiene 12 líneas de extracto sin conciliar. | **Given/Precondition: **Una cuenta tiene 12 líneas de extracto sin conciliar. | **Given/Precondition: **Una cuenta tiene 12 líneas de extracto sin conciliar. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Localizar la fila de esa cuenta. | La celda "Por conciliar" muestra la pill `Conciliar (12)`. |  |
| **6** | 1. Hacer click en la pill `Conciliar (12)`. | **Resultado esperado:** se abre el popup de conciliación automática sugerida. |  |
| ***Case*** | ***Title: Estado vacío: cliente sin cuentas*** | ***Title: Estado vacío: cliente sin cuentas*** | ***Title: Estado vacío: cliente sin cuentas*** |
| **7** | **Given/Precondition: **Usuario logueado cuyo cliente no tiene ninguna cuenta financiera cargada. | **Given/Precondition: **Usuario logueado cuyo cliente no tiene ninguna cuenta financiera cargada. | **Given/Precondition: **Usuario logueado cuyo cliente no tiene ninguna cuenta financiera cargada. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Abrir `Finanzas → Cuentas` (`/finance/accounts`). | La página carga sin filas en la tabla. |  |
| **7** | 1. Observar la tabla y la sidebar. | **Resultado esperado:** se muestra un estado vacío (mensaje tipo "Todavía no hay cuentas") con el botón `+ Nueva cuenta` visible; la sidebar muestra saldo total 0,00 y sin desglose por divisa. |  |
| ***Case*** | ***Title: Filtrar cuentas inactivas (archivadas)*** | ***Title: Filtrar cuentas inactivas (archivadas)*** | ***Title: Filtrar cuentas inactivas (archivadas)*** |
| **8** | **Given/Precondition: **Existe al menos una cuenta inactiva (Activa = No, archivada) y varias cuentas activas de distinto tipo. | **Given/Precondition: **Existe al menos una cuenta inactiva (Activa = No, archivada) y varias cuentas activas de distinto tipo. | **Given/Precondition: **Existe al menos una cuenta inactiva (Activa = No, archivada) y varias cuentas activas de distinto tipo. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Abrir el dropdown de tipo y seleccionar "Inactivas". | La tabla filtra. |  |
| **8** | 1. Observar el listado. | Se muestran únicamente las cuentas inactivas (Activa = No), sin importar su tipo (Banco/Caja/Tarjeta). |  |
| **8** | 1. Volver a seleccionar "Todas las cuentas". | **Resultado esperado:** se muestran solo las cuentas activas y las inactivas quedan ocultas. |  |
|  |  |  |  |

# Sección 2 — Alta, edición y archivado de cuentas, sin conexión

| ***Case*** | ***Title: Crear cuenta de Banco sin conexión (flujo completo)*** | ***Title: Crear cuenta de Banco sin conexión (flujo completo)*** | ***Title: Crear cuenta de Banco sin conexión (flujo completo)*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition:** | **Given/Precondition:** | **Given/Precondition:** |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Hacer click en `+ Nueva cuenta`. | Se abre el modal de Nueva Cuenta con el selector de tipo (Banco / Caja / Tarjeta). |  |
| **1** | 1. Seleccionar **Banco**. | El modal avanza a la selección de conexión. |  |
| **1** | 1. Elegir la pestaña **Sin conexión**. | Se muestra el formulario de datos de banco. |  |
| **1** | 1. Completar Nombre, IBAN válido, BIC/SWIFT, Moneda y Cuenta contable. | Los campos aceptan los valores; la moneda toma por defecto la de sesión. |  |
| **1** | 1. Hacer click en `Añadir cuenta`. | El backend crea el `FIN_Financial_Account`. |  |
| **1** | 1. Observar el listado de Cuentas. | **Resultado esperado:** el modal se cierra y la nueva cuenta aparece en el listado con saldo 0. |  |
| ***Case*** | ***Title: Crear cuenta de Caja (formulario simplificado)*** | ***Title: Crear cuenta de Caja (formulario simplificado)*** | ***Title: Crear cuenta de Caja (formulario simplificado)*** |
| **2** | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Hacer click en `+ Nueva cuenta` y seleccionar **Caja**. | El formulario de Caja se muestra sin campos IBAN/BIC. |  |
| **2** | 1. Completar Nombre y Moneda. | Los campos aceptan los valores. |  |
| **2** | 1. Hacer click en `Añadir cuenta`. | **Resultado esperado:** la cuenta de tipo Caja se crea y aparece en el listado con saldo 0. |  |
| ***Case*** | ***Title: IBAN inválido bloquea el alta*** | ***Title: IBAN inválido bloquea el alta*** | ***Title: IBAN inválido bloquea el alta*** |
| **3** | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco, pestaña Sin conexión. | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco, pestaña Sin conexión. | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco, pestaña Sin conexión. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Ingresar un IBAN inválido (falla checksum mod-97). | El campo IBAN marca error. |  |
| **3** | 1. Intentar Guardar. | **Resultado esperado:** se muestra el error inline "El IBAN no es válido" y **no** se llama al backend. |  |
| ***Case*** | ***Title: Editar datos generales de una cuenta*** | ***Title: Editar datos generales de una cuenta*** | ***Title: Editar datos generales de una cuenta*** |
| **4** | **Given/Precondition: **Existe una cuenta editable. | **Given/Precondition: **Existe una cuenta editable. | **Given/Precondition: **Existe una cuenta editable. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. En la fila, abrir el kebab → `Editar cuenta`. | Se abre el modal de edición. |  |
| **4** | 1. Verificar las secciones del modal. | "Datos de la cuenta" es editable; "Conexión bancaria" aparece deshabilitada (disponible más adelante) sin pedir datos PSD2 a la red. |  |
| **4** | 1. Modificar Nombre y Cuenta contable y pulsar `Guardar cambios`. | El backend persiste solo los campos de datos generales. |  |
| **4** | 1. Volver al listado. | **Resultado esperado:** la fila refleja inmediatamente los nuevos valores. |  |
| ***Case*** | ***Title: Acciones del kebab de una cuenta*** | ***Title: Acciones del kebab de una cuenta*** | ***Title: Acciones del kebab de una cuenta*** |
| **5** | **Given/Precondition: **Existe una cuenta con conexión bancaria. | **Given/Precondition: **Existe una cuenta con conexión bancaria. | **Given/Precondition: **Existe una cuenta con conexión bancaria. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Abrir el kebab de una fila de cuenta. | El menú muestra: Abrir cuenta, Editar cuenta, Editar conexión PSD2, Sincronizar ahora, Importar extracto manual, Desconectar PSD2, Archivar, Eliminar. |  |
| **5** | 1. Ejecutar cada acción. | **Resultado esperado:** Abrir cuenta navega al detalle; Editar cuenta abre el modal de edición; Editar conexión PSD2 abre el editor de conexión; Sincronizar ahora dispara la sincronización; Importar extracto manual abre la subida de archivo; Desconectar PSD2 pide confirmación y desconecta la cuenta; Archivar pide confirmación y archiva la cuenta (Activa = No); Eliminar pide confirmación y elimina la cuenta si no tiene movimientos asociados. |  |
| ***Case*** | ***Title: Archivar una cuenta*** | ***Title: Archivar una cuenta*** | ***Title: Archivar una cuenta*** |
| **6** | **Given/Precondition: **Existe una cuenta activa visible en el listado. | **Given/Precondition: **Existe una cuenta activa visible en el listado. | **Given/Precondition: **Existe una cuenta activa visible en el listado. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. En la fila, abrir el kebab → `Archivar`. | Se muestra un diálogo de confirmación. |  |
| **6** | 1. Confirmar el archivado. | La cuenta pasa a Activa = No. |  |
| **6** | 1. Observar el listado con el filtro por defecto. | La cuenta archivada deja de aparecer entre las activas. |  |
| **6** | 1. Cambiar el filtro de tipo a "Inactivas". | **Resultado esperado:** la cuenta aparece en el listado de Inactivas. |  |
| ***Case*** | ***Title: Reactivar (desarchivar) una cuenta inactiva*** | ***Title: Reactivar (desarchivar) una cuenta inactiva*** | ***Title: Reactivar (desarchivar) una cuenta inactiva*** |
| **7** | **Given/Precondition: **Existe una cuenta inactiva (Activa = No, archivada). | **Given/Precondition: **Existe una cuenta inactiva (Activa = No, archivada). | **Given/Precondition: **Existe una cuenta inactiva (Activa = No, archivada). |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Filtrar por "Inactivas" y abrir el kebab de la cuenta → `Reactivar`. | Se muestra un diálogo de confirmación. |  |
| **7** | 1. Confirmar la reactivación. | La cuenta vuelve a Activa = Sí. |  |
| **7** | 1. Volver al filtro por defecto. | **Resultado esperado:** la cuenta reaparece en el listado de cuentas activas y deja de figurar bajo "Inactivas". |  |
| ***Case*** | ***Title: Crear cuenta de Tarjeta sin conexión*** | ***Title: Crear cuenta de Tarjeta sin conexión*** | ***Title: Crear cuenta de Tarjeta sin conexión*** |
| **8** | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. | **Given/Precondition: **Usuario en la página de Cuentas. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Hacer click en `+ Nueva cuenta` y seleccionar **Tarjeta**. | El wizard muestra, igual que en Banco, las pestañas **Sin conexión** y **Con conexión**. |  |
| **8** | 1. Elegir la pestaña **Sin conexión**. | Se muestra el formulario de alta de tarjeta. |  |
| **8** | 1. Completar Nombre, Moneda y los datos propios de la tarjeta. | Los campos aceptan los valores. |  |
| **8** | 1. Hacer click en `Añadir cuenta`. | **Resultado esperado:** la cuenta de tipo Tarjeta se crea sin conexión y aparece en el listado con saldo 0 y el indicador de tipo Tarjeta. |  |
| ***Case*** | ***Title: Acciones del kebab de una cuenta sin conexión PSD2*** | ***Title: Acciones del kebab de una cuenta sin conexión PSD2*** | ***Title: Acciones del kebab de una cuenta sin conexión PSD2*** |
| **9** | **Given/Precondition: **Existe una cuenta de Banco sin conexión PSD2 activa (offline). | **Given/Precondition: **Existe una cuenta de Banco sin conexión PSD2 activa (offline). | **Given/Precondition: **Existe una cuenta de Banco sin conexión PSD2 activa (offline). |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Abrir el kebab de la fila. | El menú muestra: Abrir cuenta, Editar cuenta, Conectar PSD2, Importar extracto manual, Archivar, Eliminar. |  |
| **9** | 1. Revisar las opciones de conexión. | **Resultado esperado:** no aparecen "Sincronizar ahora" ni "Desconectar PSD2" (solo aplican a cuentas con conexión activa); en su lugar se ofrece "Conectar PSD2". |  |
| ***Case*** | ***Title: Eliminar una cuenta sin movimientos*** | ***Title: Eliminar una cuenta sin movimientos*** | ***Title: Eliminar una cuenta sin movimientos*** |
| **10** | **Given/Precondition: **Existe una cuenta sin movimientos, extractos ni conciliaciones asociadas. | **Given/Precondition: **Existe una cuenta sin movimientos, extractos ni conciliaciones asociadas. | **Given/Precondition: **Existe una cuenta sin movimientos, extractos ni conciliaciones asociadas. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. En la fila, abrir el kebab → `Eliminar`. | Se muestra un diálogo de confirmación que advierte que la acción es permanente. |  |
| **10** | 1. Confirmar la eliminación. | **Resultado esperado:** la cuenta se elimina definitivamente y desaparece del listado (no queda ni siquiera como inactiva). |  |
| ***Case*** | ***Title: Eliminar una cuenta con movimientos (bloqueo)*** | ***Title: Eliminar una cuenta con movimientos (bloqueo)*** | ***Title: Eliminar una cuenta con movimientos (bloqueo)*** |
| **11** | **Given/Precondition: **Existe una cuenta con al menos un movimiento, extracto o conciliación asociada. | **Given/Precondition: **Existe una cuenta con al menos un movimiento, extracto o conciliación asociada. | **Given/Precondition: **Existe una cuenta con al menos un movimiento, extracto o conciliación asociada. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Kebab → `Eliminar` y confirmar. | El sistema valida las dependencias de la cuenta. |  |
| **11** | 1. Observar el resultado. | **Resultado esperado:** la eliminación se bloquea con un mensaje claro (la cuenta tiene movimientos asociados) y se sugiere archivarla en su lugar; la cuenta permanece sin cambios. |  |
| ***Case*** | ***Title: Crear cuenta con IBAN duplicado (rechazo) — validación propuesta, a confirmar *** | ***Title: Crear cuenta con IBAN duplicado (rechazo) — validación propuesta, a confirmar *** | ***Title: Crear cuenta con IBAN duplicado (rechazo) — validación propuesta, a confirmar *** |
| **12** | **Given/Precondition: **Ya existe una cuenta de Banco activa con un IBAN determinado en el mismo cliente. | **Given/Precondition: **Ya existe una cuenta de Banco activa con un IBAN determinado en el mismo cliente. | **Given/Precondition: **Ya existe una cuenta de Banco activa con un IBAN determinado en el mismo cliente. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Abrir `+ Nueva cuenta`, tipo Banco, e ingresar el mismo IBAN de una cuenta ya existente. | El formulario acepta el texto. |  |
| **12** | 1. Hacer click en `Añadir cuenta`. | **Resultado esperado:** el sistema rechaza el alta con un mensaje de IBAN duplicado y la cuenta no se crea. *(Regla a confirmar con producto: unicidad de IBAN por cliente, solo cuentas de Banco.)* |  |

# Sección 3 — Conexión bancaria (PSD2 / Salt Edge)

| ***Case*** | ***Title: Conectar una cuenta de Banco con conexión *** | ***Title: Conectar una cuenta de Banco con conexión *** | ***Title: Conectar una cuenta de Banco con conexión *** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Módulo PSD2 instalado con sandbox keys. Modal Nueva Cuenta abierto, tipo Banco. | **Given/Precondition: **Módulo PSD2 instalado con sandbox keys. Modal Nueva Cuenta abierto, tipo Banco. | **Given/Precondition: **Módulo PSD2 instalado con sandbox keys. Modal Nueva Cuenta abierto, tipo Banco. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Cambiar a la pestaña **Con conexión**. | El widget PSD2 (Salt Edge) se monta dentro de la pestaña. |  |
| **1** | 1. Completar el flujo del widget en sandbox hasta conectar. | El widget reporta conexión exitosa y se cierra. |  |
| **1** | 1. Volver al listado de Cuentas. | **Resultado esperado:** aparece un nuevo `FIN_Financial_Account` vinculado a la conexión PSD2 con estado "Conectada". |  |
| ***Case*** | ***Title: Editar la sección "Conexión bancaria" activa*** | ***Title: Editar la sección "Conexión bancaria" activa*** | ***Title: Editar la sección "Conexión bancaria" activa*** |
| **2** | **Given/Precondition: **Existe una cuenta con conexión PSD2 activa. | **Given/Precondition: **Existe una cuenta con conexión PSD2 activa. | **Given/Precondition: **Existe una cuenta con conexión PSD2 activa. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Kebab → `Editar cuenta`. | El modal se abre. |  |
| **2** | 1. Revisar la sección "Conexión bancaria". | **Resultado esperado:** muestra estado, periodicidad y modo de auto-conciliación; los botones Re-autorizar / Desconectar / Sincronizar ahora están habilitados. |  |
| ***Case*** | ***Title: Banner de re-autorización (< 7 días)*** | ***Title: Banner de re-autorización (< 7 días)*** | ***Title: Banner de re-autorización (< 7 días)*** |
| **3** | **Given/Precondition: **Cuenta cuyo `AuthExpiresAt` vence dentro de los próximos 7 días. | **Given/Precondition: **Cuenta cuyo `AuthExpiresAt` vence dentro de los próximos 7 días. | **Given/Precondition: **Cuenta cuyo `AuthExpiresAt` vence dentro de los próximos 7 días. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Abrir el modal Editar Cuenta. | Se renderiza el modal. |  |
| **3** | 1. Observar la parte superior de la sección de conexión. | Aparece un banner amarillo de re-autorización con un link "Re-autorizar". |  |
| **3** | 1. Hacer click en "Re-autorizar". | **Resultado esperado:** se abre el widget PSD2 en modo reconnect. |  |
| ***Case*** | ***Title: Sincronizar ahora*** | ***Title: Sincronizar ahora*** | ***Title: Sincronizar ahora*** |
| **4** | **Given/Precondition: **Cuenta con conexión PSD2 activa. | **Given/Precondition: **Cuenta con conexión PSD2 activa. | **Given/Precondition: **Cuenta con conexión PSD2 activa. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Kebab → `Sincronizar ahora`. | Se invoca el endpoint sync del módulo PSD2. |  |
| **4** | 1. Esperar la respuesta. | **Resultado esperado:** un toast no bloqueante informa el estado del sync y el listado refresca cualquier cambio de saldo. |  |
| ***Case*** | ***Title: Desconectar PSD2*** | ***Title: Desconectar PSD2*** | ***Title: Desconectar PSD2*** |
| **5** | **Given/Precondition: **Cuenta con conexión PSD2 activa. | **Given/Precondition: **Cuenta con conexión PSD2 activa. | **Given/Precondition: **Cuenta con conexión PSD2 activa. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Kebab → `Desconectar PSD2` y confirmar el diálogo. | Se invoca el endpoint disconnect del módulo PSD2. |  |
| **5** | 1. Observar la fila. | **Resultado esperado:** el estado de conexión pasa a "Desconectada" y la cuenta permanece en el listado . |  |
| ***Case*** | ***Title: Acciones gateadas por estado de conexión*** | ***Title: Acciones gateadas por estado de conexión*** | ***Title: Acciones gateadas por estado de conexión*** |
| **6** | **Given/Precondition: **Cuenta cuya conexión PSD2 está `Desconectada`. | **Given/Precondition: **Cuenta cuya conexión PSD2 está `Desconectada`. | **Given/Precondition: **Cuenta cuya conexión PSD2 está `Desconectada`. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Abrir el kebab de la fila. | Se muestran las acciones PSD2. |  |
| **6** | 1. Revisar el estado de cada acción. | **Resultado esperado:** `Sincronizar ahora` y `Desconectar PSD2` están deshabilitadas; `Editar conexión PSD2` está habilitada y re-abre el widget. |  |
| ***Case*** | ***Title: Error de sincronización surface inline*** | ***Title: Error de sincronización surface inline*** | ***Title: Error de sincronización surface inline*** |
| **7** | **Given/Precondition: **Cuenta con conexión cuya autorización está expirada (el endpoint PSD2 devolverá error). | **Given/Precondition: **Cuenta con conexión cuya autorización está expirada (el endpoint PSD2 devolverá error). | **Given/Precondition: **Cuenta con conexión cuya autorización está expirada (el endpoint PSD2 devolverá error). |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Kebab → `Sincronizar ahora`. | El endpoint devuelve error. |  |
| **7** | 1. Observar la UI. | **Resultado esperado:** se muestra un mensaje de error claro y la fila de cuenta queda sin cambios. |  |
| ***Case*** | ***Title: Conectar una cuenta de Tarjeta con conexión*** | ***Title: Conectar una cuenta de Tarjeta con conexión*** | ***Title: Conectar una cuenta de Tarjeta con conexión*** |
| **8** | **Given/Precondition: **Módulo PSD2 instalado con sandbox keys. Modal Nueva Cuenta abierto, tipo Tarjeta. | **Given/Precondition: **Módulo PSD2 instalado con sandbox keys. Modal Nueva Cuenta abierto, tipo Tarjeta. | **Given/Precondition: **Módulo PSD2 instalado con sandbox keys. Modal Nueva Cuenta abierto, tipo Tarjeta. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Cambiar a la pestaña **Con conexión**. | El widget PSD2 (Salt Edge) se monta dentro de la pestaña (mismo flujo que para Banco). |  |
| **8** | 1. Completar el flujo del widget en sandbox hasta conectar. | El widget reporta conexión exitosa y se cierra. |  |
| **8** | 1. Volver al listado de Cuentas. | **Resultado esperado:** aparece una nueva cuenta de tipo Tarjeta vinculada a la conexión PSD2 con estado "Conectada". |  |
| ***Case*** | ***Title: Widget PSD2 abandonado a mitad del flujo*** | ***Title: Widget PSD2 abandonado a mitad del flujo*** | ***Title: Widget PSD2 abandonado a mitad del flujo*** |
| **9** | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco (o Tarjeta), pestaña Con conexión, con el widget PSD2 montado. | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco (o Tarjeta), pestaña Con conexión, con el widget PSD2 montado. | **Given/Precondition: **Modal Nueva Cuenta abierto, tipo Banco (o Tarjeta), pestaña Con conexión, con el widget PSD2 montado. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Iniciar el flujo del widget y abandonarlo antes de completar (cerrar la ventana/pestaña o dejar expirar por timeout). | El widget se cierra sin confirmar la conexión. |  |
| **9** | 1. Volver al listado de Cuentas. | No queda ninguna cuenta "a medio crear" ni conexión PSD2 en estado pendiente/colgado. |  |
| **9** | 1. Reintentar el alta con conexión para la misma cuenta. | **Resultado esperado:** el sistema permite reiniciar el flujo limpiamente; no hay estado inconsistente ni registros huérfanos. |  |
| ***Case*** | ***Title: Sincronización automática periódica (proceso programado)*** | ***Title: Sincronización automática periódica (proceso programado)*** | ***Title: Sincronización automática periódica (proceso programado)*** |
| **10** | **Given/Precondition: **Cuenta con conexión PSD2 activa y una periodicidad de sincronización configurada. | **Given/Precondition: **Cuenta con conexión PSD2 activa y una periodicidad de sincronización configurada. | **Given/Precondition: **Cuenta con conexión PSD2 activa y una periodicidad de sincronización configurada. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Dejar transcurrir (o disparar) el tick del proceso programado de sincronización. | El proceso corre sin intervención del usuario para las cuentas cuya próxima sincronización venció. |  |
| **10** | 1. Revisar la cuenta tras el ciclo. | **Resultado esperado:** se trae el extracto/movimientos nuevos desde el banco, se actualiza la fecha de última sincronización y se reprograma la siguiente según la periodicidad. |  |
| ***Case*** | ***Title: Nuevas transacciones tras una sincronización*** | ***Title: Nuevas transacciones tras una sincronización*** | ***Title: Nuevas transacciones tras una sincronización*** |
| **11 ** | **Given/Precondition: **Cuenta con conexión PSD2 que tiene movimientos nuevos en el banco desde la última sincronización. | **Given/Precondition: **Cuenta con conexión PSD2 que tiene movimientos nuevos en el banco desde la última sincronización. | **Given/Precondition: **Cuenta con conexión PSD2 que tiene movimientos nuevos en el banco desde la última sincronización. |
| **11 ** | ***When*** | ***Then*** | ***Result*** |
| **11 ** | 1. Ejecutar una sincronización (manual o automática). | El proceso importa las nuevas operaciones del banco. |  |
| **11 ** | 1. Abrir la cuenta y revisar el tab Movimientos. | **Resultado esperado:** las nuevas transacciones aparecen automáticamente en Movimientos, y el saldo y los totales (Entradas/Salidas) se actualizan en consecuencia. |  |
|  |  |  |  |

# Sección 4 — Vista detalle de cuenta + tab Movimientos

| ***Case*** | ***Title: Cargar la vista detalle (tabs y breadcrumb)*** | ***Title: Cargar la vista detalle (tabs y breadcrumb)*** | ***Title: Cargar la vista detalle (tabs y breadcrumb)*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Se hace click en una fila de cuenta desde la página de Cuentas. | **Given/Precondition: **Se hace click en una fila de cuenta desde la página de Cuentas. | **Given/Precondition: **Se hace click en una fila de cuenta desde la página de Cuentas. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Esperar que cargue la vista detalle. | Se renderiza la cabecera y los tabs. |  |
| **1** | 1. Revisar título y breadcrumb. | El título es el nombre de la cuenta; el breadcrumb es `Finanzas / Cuentas / {nombre}`. |  |
| **1** | 1. Revisar los tabs. | **Resultado esperado:** los tabs Movimientos / Conciliación / Extractos importados son visibles y **Movimientos** está seleccionado por defecto. |  |
| ***Case*** | ***Title: Movimientos: summary strip y columnas de la tabla*** | ***Title: Movimientos: summary strip y columnas de la tabla*** | ***Title: Movimientos: summary strip y columnas de la tabla*** |
| ** 2** | **Given/Precondition: **Cuenta con ~50 transacciones (`FIN_FinAcc_Transaction`). | **Given/Precondition: **Cuenta con ~50 transacciones (`FIN_FinAcc_Transaction`). | **Given/Precondition: **Cuenta con ~50 transacciones (`FIN_FinAcc_Transaction`). |
| ** 2** | ***When*** | ***Then*** | ***Result*** |
| ** 2** | 1. Con el tab Movimientos activo, esperar la carga. | El summary strip muestra IBAN (en grupos de 4) + Saldo total + Entradas (30d) + Salidas (30d). |  |
| ** 2** | 1. Revisar las columnas de la tabla. | Columnas: Fecha / Documento / Contacto / Descripción / Estado / Tipo / Importe / Saldo / kebab. |  |
| ** 2** | 1. Verificar lo que NO debe aparecer. | **Resultado esperado:** no hay counter "Sin contabilizar" ni columna combinada "Tercero/Conciliación"; los importes muestran signo y color. |  |
| ***Case*** | ***Title: Filtrar movimientos por Estado*** | ***Title: Filtrar movimientos por Estado*** | ***Title: Filtrar movimientos por Estado*** |
| **3** | **Given/Precondition: **La cuenta tiene movimientos en varios estados. | **Given/Precondition: **La cuenta tiene movimientos en varios estados. | **Given/Precondition: **La cuenta tiene movimientos en varios estados. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Abrir el dropdown del filtro Estado. | Se muestra la lista con búsqueda de los 8 estados. |  |
| **3** | 1. Escribir "Conciliado" y elegir la opción coincidente. | La tabla filtra. |  |
| **3** | 1. Observar resultados y trigger. | **Resultado esperado:** solo se muestran movimientos cuyo `paymentStatus` coincide; el label del botón refleja el estado elegido. |  |
| ***Case*** | ***Title: Filtrar movimientos por Tipo (Cobro / Pago)*** | ***Title: Filtrar movimientos por Tipo (Cobro / Pago)*** | ***Title: Filtrar movimientos por Tipo (Cobro / Pago)*** |
| **4** | **Given/Precondition: **La cuenta tiene movimientos BPD (Cobro) y BPW (Pago). | **Given/Precondition: **La cuenta tiene movimientos BPD (Cobro) y BPW (Pago). | **Given/Precondition: **La cuenta tiene movimientos BPD (Cobro) y BPW (Pago). |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Abrir el filtro Tipo y elegir "Cobro". | La tabla filtra. |  |
| **4** | 1. Observar resultados. | **Resultado esperado:** solo se muestran movimientos con `trxType === 'BPD'`. |  |
| ***Case*** | ***Title: Filtrar movimientos por Importe (solo entradas)*** | ***Title: Filtrar movimientos por Importe (solo entradas)*** | ***Title: Filtrar movimientos por Importe (solo entradas)*** |
| **5** | **Given/Precondition: **La cuenta tiene movimientos positivos y negativos. | **Given/Precondition: **La cuenta tiene movimientos positivos y negativos. | **Given/Precondition: **La cuenta tiene movimientos positivos y negativos. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Abrir el filtro Importe, poner `Mín = 0` y dejar `Máx` vacío. | El panel acepta el rango. |  |
| **5** | 1. Hacer click en Aplicar. | **Resultado esperado:** solo se muestran movimientos con `amount >= 0` (entradas). |  |
| ***Case*** | ***Title: Filtrar movimientos por rango de fechas*** | ***Title: Filtrar movimientos por rango de fechas*** | ***Title: Filtrar movimientos por rango de fechas*** |
| **6** | **Given/Precondition: **La cuenta tiene movimientos en distintas fechas. | **Given/Precondition: **La cuenta tiene movimientos en distintas fechas. | **Given/Precondition: **La cuenta tiene movimientos en distintas fechas. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Abrir el filtro de fechas y elegir un preset (p. ej. "Últimos 30 días"). | La tabla filtra al rango del preset. |  |
| **6** | 1. Elegir "Personalizado" y seleccionar un rango en el calendario. | **Resultado esperado:** la tabla solo muestra movimientos dentro del rango (normalizado a día completo) y la pill refleja el rango elegido. |  |
| ***Case*** | ***Title: Buscar movimientos (texto libre)*** | ***Title: Buscar movimientos (texto libre)*** | ***Title: Buscar movimientos (texto libre)*** |
| **7** | **Given/Precondition: **Existe un movimiento con documentNo/contacto/descripción conocidos. | **Given/Precondition: **Existe un movimiento con documentNo/contacto/descripción conocidos. | **Given/Precondition: **Existe un movimiento con documentNo/contacto/descripción conocidos. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Escribir un fragmento (p. ej. `1000016`) en el buscador. | El input aplica debounce y filtra. |  |
| **7** | 1. Observar resultados. | **Resultado esperado:** solo se muestran movimientos cuyo documentNo, contacto o descripción contiene el substring. |  |
| ***Case*** | ***Title: Copiar IBAN al portapapeles*** | ***Title: Copiar IBAN al portapapeles*** | ***Title: Copiar IBAN al portapapeles*** |
| **8** | **Given/Precondition: **Cuenta de Banco con IBAN, vista detalle abierta. | **Given/Precondition: **Cuenta de Banco con IBAN, vista detalle abierta. | **Given/Precondition: **Cuenta de Banco con IBAN, vista detalle abierta. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Hacer click en el IBAN del summary strip. | Se ejecuta la copia al portapapeles. |  |
| **8** | 1. Observar la confirmación. | **Resultado esperado:** el IBAN (sin espacios) queda en el portapapeles y aparece el toast verde "IBAN copiado". |  |
| ***Case*** | ***Title: Kebab de fila en Movimientos*** | ***Title: Kebab de fila en Movimientos*** | ***Title: Kebab de fila en Movimientos*** |
| ** 9** | **Given/Precondition: **Tab Movimientos con al menos una fila. | **Given/Precondition: **Tab Movimientos con al menos una fila. | **Given/Precondition: **Tab Movimientos con al menos una fila. |
| ** 9** | ***When*** | ***Then*** | ***Result*** |
| ** 9** | 1. Pasar el mouse sobre una fila y abrir el kebab. | Aparecen las acciones de fila. |  |
| ** 9** | 1. Revisar las acciones del menú. | **Resultado esperado:** el menú expone "Desconciliar" (revierte la conciliación del movimiento) y "Contabilizar" (contabiliza el movimiento conciliado). El detalle del movimiento no está en el kebab: se despliega con la flecha de la fila. |  |
| ***Case*** | ***Title: Volver al listado con el botón atrás*** | ***Title: Volver al listado con el botón atrás*** | ***Title: Volver al listado con el botón atrás*** |
| **10** | **Given/Precondition: **Vista detalle abierta en el tab Movimientos. | **Given/Precondition: **Vista detalle abierta en el tab Movimientos. | **Given/Precondition: **Vista detalle abierta en el tab Movimientos. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | . Hacer click en la flecha de "volver" de la toolbar. | La app navega hacia atrás. |  |
| **10** | 1. Observar la URL. | **Resultado esperado:** la URL vuelve a `/finance/accounts`. |  |
| ***Case*** | ***Title: Estado vacío: cuenta sin movimientos*** | ***Title: Estado vacío: cuenta sin movimientos*** | ***Title: Estado vacío: cuenta sin movimientos*** |
| **11** | **Given/Precondition: **Cuenta sin transacciones registradas. | **Given/Precondition: **Cuenta sin transacciones registradas. | **Given/Precondition: **Cuenta sin transacciones registradas. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Abrir la cuenta y el tab Movimientos. | La tabla carga sin filas. |  |
| **11** | 1. Observar la tabla y el summary strip. | **Resultado esperado:** se muestra un estado vacío (mensaje tipo "No hay movimientos"); el saldo y los totales (Entradas/Salidas 30d) figuran en 0,00; los filtros siguen accesibles. |  |
| ***Case*** | ***Title: Combinación de filtros simultáneos*** | ***Title: Combinación de filtros simultáneos*** | ***Title: Combinación de filtros simultáneos*** |
| **12** | **Given/Precondition: **Cuenta con movimientos variados (distintos estados, tipos, fechas y descripciones). | **Given/Precondition: **Cuenta con movimientos variados (distintos estados, tipos, fechas y descripciones). | **Given/Precondition: **Cuenta con movimientos variados (distintos estados, tipos, fechas y descripciones). |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Aplicar a la vez los filtros: Estado + Tipo (Cobro/Pago) + rango de Fecha + texto en el buscador. | Cada filtro se va aplicando y su pill queda visible. |  |
| **12** | 1. Observar el listado. | Solo quedan los movimientos que cumplen **todas** las condiciones simultáneamente (intersección, no unión). |  |
| **12** | 1. Quitar los filtros uno a uno. | **Resultado esperado:** al limpiar cada filtro el listado se recompone correctamente, y al quitar todos se restaura el listado completo. |  |
| ***Case*** | ***Title: Paginación / scroll en tabla con muchos movimientos*** | ***Title: Paginación / scroll en tabla con muchos movimientos*** | ***Title: Paginación / scroll en tabla con muchos movimientos*** |
| **13** | **Given/Precondition: **Cuenta con un gran volumen de movimientos (p. ej. más de 100). | **Given/Precondition: **Cuenta con un gran volumen de movimientos (p. ej. más de 100). | **Given/Precondition: **Cuenta con un gran volumen de movimientos (p. ej. más de 100). |
| **13** | ***When*** | ***Then*** | ***Result*** |
| **13** | 1. Abrir el tab Movimientos y desplazarse hacia el final de la lista. | La tabla carga progresivamente (scroll infinito) o pagina los resultados. |  |
| **13** | 1. Aplicar un filtro con el listado grande cargado. | **Resultado esperado:** la carga por lotes/paginación funciona sin perder ni duplicar filas, el desplazamiento es fluido y el saldo corriente se mantiene coherente. |  |
| ***Case*** | ***Title: Desplegar el detalle del movimiento (dimensiones)*** | ***Title: Desplegar el detalle del movimiento (dimensiones)*** | ***Title: Desplegar el detalle del movimiento (dimensiones)*** |
| **14** | **Given/Precondition: **Cuenta con dimensiones configuradas (organización y, según la cuenta, otras dimensiones contables) y al menos un movimiento. | **Given/Precondition: **Cuenta con dimensiones configuradas (organización y, según la cuenta, otras dimensiones contables) y al menos un movimiento. | **Given/Precondition: **Cuenta con dimensiones configuradas (organización y, según la cuenta, otras dimensiones contables) y al menos un movimiento. |
| **14** | ***When*** | ***Then*** | ***Result*** |
| **14** | 1. En una fila, hacer click en la flecha de expandir. | La fila se expande en un desplegable inline (no navega a otra pantalla). |  |
| **14** | 1. Revisar el contenido del desplegable. | Muestra el detalle del movimiento con las dimensiones configuradas en la cuenta (organización y demás dimensiones según configuración, p. ej. proyecto, centro de costo). Solo aparecen las dimensiones que estén configuradas. |  |
| **14** | 1. Volver a hacer click en la flecha (o cerrarlo). | **Resultado esperado:** el desplegable se colapsa y la fila vuelve a su estado normal. |  |

# Sección 5 — Reglas de matcheo

| ***Case*** | ***Title: Pantalla de Reglas vacía con banner*** | ***Title: Pantalla de Reglas vacía con banner*** | ***Title: Pantalla de Reglas vacía con banner*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Aún no existen reglas de matcheo. | **Given/Precondition: **Aún no existen reglas de matcheo. | **Given/Precondition: **Aún no existen reglas de matcheo. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Desde la página de Cuentas, click en `Reglas de matcheo`. | La app navega a `/match-rule`. |  |
| **1** | 1. Observar la pantalla. | **Resultado esperado:** la lista está vacía, hay un banner explicando el orden de evaluación por prioridad ascendente, y el botón `+ Nueva regla` es visible. |  |
| ***Case*** | ***Title: Crear una regla válida*** | ***Title: Crear una regla válida*** | ***Title: Crear una regla válida*** |
| **2** | **Given/Precondition: **Pantalla de Reglas de Matcheo abierta. | **Given/Precondition: **Pantalla de Reglas de Matcheo abierta. | **Given/Precondition: **Pantalla de Reglas de Matcheo abierta. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Click en `+ Nueva regla`. | Se abre el modal Nueva Regla. |  |
| **2** | 1. Completar: Nombre "Comisiones", Condición Contiene "COMISION", Tipo Comisión banco, Cuenta contable, Tolerancia 0%, Prioridad 10, Aplica a "Todas las cuentas", Crear transacción automáticamente = Sí. | El formulario acepta los valores. |  |
| **2** | 1. Guardar. | La regla se persiste en `ETBR_MatchRule`. |  |
| **2** | 1. Observar la lista. | **Resultado esperado:** la lista refresca y la nueva fila aparece ordenada por prioridad ascendente. |  |
| ***Case*** | ***Title: Prioridad duplicada en el mismo scope (409)*** | ***Title: Prioridad duplicada en el mismo scope (409)*** | ***Title: Prioridad duplicada en el mismo scope (409)*** |
| **3** | **Given/Precondition: **Ya existe una regla con prioridad 10 para "Todas las cuentas". | **Given/Precondition: **Ya existe una regla con prioridad 10 para "Todas las cuentas". | **Given/Precondition: **Ya existe una regla con prioridad 10 para "Todas las cuentas". |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Crear otra regla con prioridad 10 en el mismo scope y guardar. | El backend responde HTTP 409. |  |
| **3** | 1. Observar el modal. | **Resultado esperado:** se surfacea inline el error de prioridad duplicada; la regla no se crea. |  |
| ***Case*** | ***Title: Regex inválida rechazada (400)*** | ***Title: Regex inválida rechazada (400)*** | ***Title: Regex inválida rechazada (400)*** |
| **4** | **Given/Precondition: **Modal Nueva Regla abierto. | **Given/Precondition: **Modal Nueva Regla abierto. | **Given/Precondition: **Modal Nueva Regla abierto. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Seleccionar Condición = Regex e ingresar el patrón `[unclosed`. | El formulario acepta el texto. |  |
| **4** | 1. Guardar. | **Resultado esperado:** el backend rechaza con HTTP 400 mencionando el fallo de compilación de regex; el modal permanece abierto con el error visible. |  |
| ***Case*** | ***Title:  Regex catastrófica frenada por timeout*** | ***Title:  Regex catastrófica frenada por timeout*** | ***Title:  Regex catastrófica frenada por timeout*** |
| **5** | **Given/Precondition: **Modal Nueva Regla abierto, Condición = Regex. | **Given/Precondition: **Modal Nueva Regla abierto, Condición = Regex. | **Given/Precondition: **Modal Nueva Regla abierto, Condición = Regex. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Ingresar un patrón patológico (p. ej. `(a+)+b`) y guardar. | El validador compila con cap de timeout (~200 ms). |  |
| **5** | 1. Observar el resultado. | **Resultado esperado:** el timeout dispara y la regla es rechazada con un error claro. |  |
| ***Case*** | ***Title: Dimensiones contables (hasta 3) persisten*** | ***Title: Dimensiones contables (hasta 3) persisten*** | ***Title: Dimensiones contables (hasta 3) persisten*** |
| **6** | **Given/Precondition: **Modal Nueva Regla abierto con datos básicos válidos. | **Given/Precondition: **Modal Nueva Regla abierto con datos básicos válidos. | **Given/Precondition: **Modal Nueva Regla abierto con datos básicos válidos. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Agregar 3 filas de dimensión (p. ej. Proyecto A, Centro de costo 1, Campaña Q1). | El formulario muestra las 3 filas. |  |
| **6** | 1. Guardar y reabrir la regla. | **Resultado esperado:** las dimensiones persisten y re-renderizan en el mismo orden desde `ETBR_MatchRule_Dim`. |  |
| ***Case*** | ***Title: Toggle "Activa" en la lista*** | ***Title: Toggle "Activa" en la lista*** | ***Title: Toggle "Activa" en la lista*** |
| **7** | **Given/Precondition: **Existe una regla activa. | **Given/Precondition: **Existe una regla activa. | **Given/Precondition: **Existe una regla activa. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. En la lista, apagar el switch "Activa" de la regla. | Se llama `PATCH /match-rule/{id}` con `IsActive='N'`. |  |
| **7** | 1. Observar la fila. | **Resultado esperado:** la fila queda visualmente apagada pero permanece en la lista. |  |
| ***Case*** | ***Title: Editar prioridad inline reordena la lista*** | ***Title: Editar prioridad inline reordena la lista*** | ***Title: Editar prioridad inline reordena la lista*** |
| **8** | **Given/Precondition: **Existen reglas con prioridades 5, 10 y 20. | **Given/Precondition: **Existen reglas con prioridades 5, 10 y 20. | **Given/Precondition: **Existen reglas con prioridades 5, 10 y 20. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Editar la celda Prioridad de la regla con prioridad 20 y poner 1. | Se dispara un PATCH y un re-sort optimista. |  |
| **8** | 1. Observar el orden. | **Resultado esperado:** la fila salta al tope y la lista queda ordenada por prioridad ascendente. |  |
| ***Case*** | ***Title: Editar una regla existente *** | ***Title: Editar una regla existente *** | ***Title: Editar una regla existente *** |
| **9** | **Given/Precondition: **Existe al menos una regla creada. | **Given/Precondition: **Existe al menos una regla creada. | **Given/Precondition: **Existe al menos una regla creada. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Abrir una regla existente para editarla. | Se abre el modal con los valores actuales precargados (nombre, condición, patrón, tipo, cuenta contable, tolerancia, prioridad, alcance, dimensiones, toggle). |  |
| **9** | 1. Modificar uno o varios campos (p. ej. patrón y tolerancia) y guardar. | Se aplican las mismas validaciones que en el alta (regex válida, prioridad única en el scope). |  |
| **9** | 1. Reabrir la regla. | **Resultado esperado:** los cambios quedan persistidos y la lista los refleja. |  |
| ***Case*** | ***Title: Eliminar una regla*** | ***Title: Eliminar una regla*** | ***Title: Eliminar una regla*** |
| **10** | **Given/Precondition: **Existe una regla creada. | **Given/Precondition: **Existe una regla creada. | **Given/Precondition: **Existe una regla creada. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Desde la regla, elegir `Eliminar`. | Se muestra un diálogo de confirmación. |  |
| **10** | 1. Confirmar la eliminación. | **Resultado esperado:** la regla se elimina y desaparece de la lista; las reglas restantes mantienen su orden por prioridad. |  |
| ***Case*** | ***Title: Límite de dimensiones (rechazo de la 4ª) *** | ***Title: Límite de dimensiones (rechazo de la 4ª) *** | ***Title: Límite de dimensiones (rechazo de la 4ª) *** |
| **11** | **Given/Precondition: **Modal Nueva/Editar Regla abierto, con 3 filas de dimensión ya agregadas. | **Given/Precondition: **Modal Nueva/Editar Regla abierto, con 3 filas de dimensión ya agregadas. | **Given/Precondition: **Modal Nueva/Editar Regla abierto, con 3 filas de dimensión ya agregadas. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Intentar agregar una 4ª fila de dimensión. | El sistema impide superar el máximo de 3. |  |
| **11** | 1. Observar la UI. | **Resultado esperado:** no se puede añadir una 4ª dimensión (la opción se deshabilita o se rechaza con un aviso); se conservan las 3 existentes. |  |
| ***Case*** | ***Title: Regla con alcance por cuenta específica*** | ***Title: Regla con alcance por cuenta específica*** | ***Title: Regla con alcance por cuenta específica*** |
| **12** | **Given/Precondition: **Existen al menos dos cuentas; modal Nueva Regla abierto. | **Given/Precondition: **Existen al menos dos cuentas; modal Nueva Regla abierto. | **Given/Precondition: **Existen al menos dos cuentas; modal Nueva Regla abierto. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. En "Aplica a", seleccionar una **cuenta específica** (no "Todas las cuentas") y guardar una regla válida. | La regla se persiste asociada a esa cuenta. |  |
| **12** | 1. Revisar la lista de reglas. | La columna "Cuenta afectada" muestra la cuenta elegida (no "Todas"). |  |
| **12** | 1. (Conceptual) Verificar el alcance al conciliar. | **Resultado esperado:** la regla aplica solo a líneas de extracto de esa cuenta y no se evalúa sobre otras cuentas. |  |

# Sección 6 — Conciliación manual / panel 50/50

| ***Case*** | ***Title: Abrir el tab Conciliación con paneles prefiltrados*** | ***Title: Abrir el tab Conciliación con paneles prefiltrados*** | ***Title: Abrir el tab Conciliación con paneles prefiltrados*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Cuenta con 5 líneas de extracto no conciliadas de los últimos 12 meses. | **Given/Precondition: **Cuenta con 5 líneas de extracto no conciliadas de los últimos 12 meses. | **Given/Precondition: **Cuenta con 5 líneas de extracto no conciliadas de los últimos 12 meses. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. En la vista detalle, abrir el tab Conciliación. | Se renderiza el panel dividido 50/50. |  |
| **1** | 1. Revisar el panel izquierdo. | Muestra las 5 líneas prefiltradas "Pendientes / Últimos 12 meses". |  |
| **1** | 1. Revisar el panel derecho. | **Resultado esperado:** muestra las operaciones sistema no conciliadas con el filtro de tipo en "Cualquiera". |  |
| ***Case*** | ***Title: Seleccionar línea de extracto resalta candidatos*** | ***Title: Seleccionar línea de extracto resalta candidatos*** | ***Title: Seleccionar línea de extracto resalta candidatos*** |
| **2** | **Given/Precondition: **Tab Conciliación abierto con líneas de extracto. | **Given/Precondition: **Tab Conciliación abierto con líneas de extracto. | **Given/Precondition: **Tab Conciliación abierto con líneas de extracto. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Hacer click en una línea de extracto de `-500,00 €`. | El header del panel derecho muestra fecha, descripción e importe del extracto (en rojo). |  |
| **2** | 1. Observar el panel derecho. | **Resultado esperado:** los candidatos match (sugeridos por el algoritmo estándar) quedan destacados. |  |
| ***Case*** | ***Title: Selección 1:1 cuadrada habilita Conciliar*** | ***Title: Selección 1:1 cuadrada habilita Conciliar*** | ***Title: Selección 1:1 cuadrada habilita Conciliar*** |
| **3** | **Given/Precondition: **Hay una línea de extracto de `-500,00 €` y un pago sistema de `-500,00 €`. | **Given/Precondition: **Hay una línea de extracto de `-500,00 €` y un pago sistema de `-500,00 €`. | **Given/Precondition: **Hay una línea de extracto de `-500,00 €` y un pago sistema de `-500,00 €`. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Seleccionar la línea de extracto `-500,00 €`. | Se actualiza la barra inferior. |  |
| **3** | 1. Seleccionar el pago de `-500,00 €` en el panel derecho. | La barra muestra `Documentos seleccionados: -500,00 €` y `Restante por conciliar: 0,00 €`. |  |
| **3** | 1. Observar el botón Conciliar. | **Resultado esperado:** el botón Conciliar queda habilitado. |  |
| ***Case*** | ***Title: Selección 1:N con diferencia deshabilita Conciliar*** | ***Title: Selección 1:N con diferencia deshabilita Conciliar*** | ***Title: Selección 1:N con diferencia deshabilita Conciliar*** |
| **4** | **Given/Precondition: **Línea de extracto `-500,00 €` y dos pagos que suman `-400,00 €`. | **Given/Precondition: **Línea de extracto `-500,00 €` y dos pagos que suman `-400,00 €`. | **Given/Precondition: **Línea de extracto `-500,00 €` y dos pagos que suman `-400,00 €`. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Seleccionar la línea de extracto y los dos pagos. | La barra inferior recalcula. |  |
| **4** | 1. Observar la barra y el botón. | **Resultado esperado:** muestra `Restante por conciliar: -100,00 €` y el botón Conciliar permanece deshabilitado mientras el importe del extracto no coincida con la suma de las operaciones seleccionadas. |  |
| ***Case*** | ***Title: Filtrar candidatos del panel derecho por tipo de documento*** | ***Title: Filtrar candidatos del panel derecho por tipo de documento*** | ***Title: Filtrar candidatos del panel derecho por tipo de documento*** |
| **5** | **Given/Precondition: **El panel derecho tiene candidatos de varios tipos. | **Given/Precondition: **El panel derecho tiene candidatos de varios tipos. | **Given/Precondition: **El panel derecho tiene candidatos de varios tipos. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Abrir el dropdown de tipo del panel derecho y elegir "Factura de venta". | El filtro aplica. |  |
| **5** | 1. Observar el listado. | **Resultado esperado:** solo se listan candidatos de tipo Factura de venta. |  |
| ***Case*** | ***Title: Conciliar un match 1:N válido *** | ***Title: Conciliar un match 1:N válido *** | ***Title: Conciliar un match 1:N válido *** |
| **6** | **Given/Precondition: **Selección 1:N que cuadra exactamente (o dentro de tolerancia). | **Given/Precondition: **Selección 1:N que cuadra exactamente (o dentro de tolerancia). | **Given/Precondition: **Selección 1:N que cuadra exactamente (o dentro de tolerancia). |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Con la selección cuadrada, hacer click en Conciliar. | El backend persiste vía el flujo estándar de Etendo (`FIN_BankStatementHandler`/`FIN_AddPayment`). |  |
| **6** | 1. Observar ambos paneles. | **Resultado esperado:** los items seleccionados desaparecen de las listas no conciliadas y un toast de éxito confirma la operación. |  |
| ***Case*** | ***Title: Conciliar operaciones de cuentas distintas (rechazo 400) *** | ***Title: Conciliar operaciones de cuentas distintas (rechazo 400) *** | ***Title: Conciliar operaciones de cuentas distintas (rechazo 400) *** |
| **7** | **Given/Precondition: **Petición manipulada (vía API) mezclando operaciones de dos cuentas financieras. | **Given/Precondition: **Petición manipulada (vía API) mezclando operaciones de dos cuentas financieras. | **Given/Precondition: **Petición manipulada (vía API) mezclando operaciones de dos cuentas financieras. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Enviar al handler `reconcileGroup` operaciones de dos cuentas distintas. | El handler valida la pertenencia de cuenta. |  |
| **7** | 1. Observar la respuesta. | **Resultado esperado:** el backend rechaza con HTTP 400 y un mensaje de error claro. |  |
| ***Case*** | ***Title: Líneas ya conciliadas: el botón cambia a "Reactivar"*** | ***Title: Líneas ya conciliadas: el botón cambia a "Reactivar"*** | ***Title: Líneas ya conciliadas: el botón cambia a "Reactivar"*** |
| **8** | **Given/Precondition: **Existen líneas ya conciliadas seleccionables. | **Given/Precondition: **Existen líneas ya conciliadas seleccionables. | **Given/Precondition: **Existen líneas ya conciliadas seleccionables. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Seleccionar líneas ya conciliadas. | La selección se actualiza. |  |
| **8** | 1. Observar el botón de acción. | **Resultado esperado:** la label del botón Conciliar cambia a "Reactivar" y, al ejecutarlo, dispara el flujo de reactivación (ver Sección 8). |  |
| ***Case*** | ***Title: Conciliación manual con diferencia dentro de tolerancia *** | ***Title: Conciliación manual con diferencia dentro de tolerancia *** | ***Title: Conciliación manual con diferencia dentro de tolerancia *** |
| **1** | **Given/Precondition: **Una línea de extracto y la(s) operación(es) del sistema cuya suma difiere del importe del extracto por un monto pequeño, dentro del margen de tolerancia configurado. | **Given/Precondition: **Una línea de extracto y la(s) operación(es) del sistema cuya suma difiere del importe del extracto por un monto pequeño, dentro del margen de tolerancia configurado. | **Given/Precondition: **Una línea de extracto y la(s) operación(es) del sistema cuya suma difiere del importe del extracto por un monto pequeño, dentro del margen de tolerancia configurado. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Seleccionar la línea de extracto y la(s) operación(es) con una diferencia menor a la tolerancia permitida. | La barra inferior muestra el "Restante por conciliar" con esa pequeña diferencia. |  |
| **1** | 1. Observar el botón Conciliar. | A diferencia del caso sin tolerancia, al estar la diferencia dentro del margen permitido el botón Conciliar queda habilitado. |  |
| **1** | 1. Conciliar. | **Resultado esperado:** la conciliación se persiste correctamente y la diferencia dentro de tolerancia se trata según la configuración (sin bloquear la operación). |  |
| ***Case*** | ***Title: Acceso concurrente: dos usuarios sobre la misma línea*** | ***Title: Acceso concurrente: dos usuarios sobre la misma línea*** | ***Title: Acceso concurrente: dos usuarios sobre la misma línea*** |
| **1** | **Given/Precondition: **Dos usuarios tienen el tab Conciliación de la misma cuenta abierto, con la misma línea de extracto pendiente visible. | **Given/Precondition: **Dos usuarios tienen el tab Conciliación de la misma cuenta abierto, con la misma línea de extracto pendiente visible. | **Given/Precondition: **Dos usuarios tienen el tab Conciliación de la misma cuenta abierto, con la misma línea de extracto pendiente visible. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. El usuario A concilia la línea contra una operación. | La conciliación de A se persiste y la línea sale de las pendientes. |  |
| **1** | 1. El usuario B (con su vista cargada de antes) intenta conciliar la misma línea. | El sistema detecta que la línea ya fue conciliada por A. |  |
| **1** | 1. Observar el resultado para B. | **Resultado esperado:** la operación de B se rechaza con un aviso claro (la línea ya no está disponible), no se produce doble conciliación, y al refrescar, la línea ya no figura entre las pendientes de B. |  |

# Sección 7 — Conciliación automática sugerida

| ***Case*** | ***Title: Abrir el popup de sugerencias (origen estándar)*** | ***Title: Abrir el popup de sugerencias (origen estándar)*** | ***Title: Abrir el popup de sugerencias (origen estándar)*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Cuenta con 10 líneas de extracto que matchean pagos sistema por importe/fecha/referencia. | **Given/Precondition: **Cuenta con 10 líneas de extracto que matchean pagos sistema por importe/fecha/referencia. | **Given/Precondition: **Cuenta con 10 líneas de extracto que matchean pagos sistema por importe/fecha/referencia. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. En la página de Cuentas, click en la pill `Conciliar (10)`. | Se abre el popup de conciliación automática sugerida. |  |
| **1** | 1. Observar los grupos. | **Resultado esperado:** el popup muestra 10 grupos sugeridos, todos checkeados por defecto, con origen = Estándar. |  |
| ***Case*** | ***Title: Excluir grupos y conciliar en bulk*** | ***Title: Excluir grupos y conciliar en bulk*** | ***Title: Excluir grupos y conciliar en bulk*** |
| **2** | **Given/Precondition: **Popup abierto con 6 grupos sugeridos. | **Given/Precondition: **Popup abierto con 6 grupos sugeridos. | **Given/Precondition: **Popup abierto con 6 grupos sugeridos. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Desmarcar 2 grupos. | El contador superior y el CTA se actualizan a 4. |  |
| **2** | 1. Hacer click en `Conciliar 4 grupos`. | Se persisten solo los 4 grupos seleccionados. |  |
| **2** | 1. Observar la pill en la página de Cuentas. | **Resultado esperado:** la pill ahora dice `Conciliar (6)`. |  |
| ***Case*** | ***Title: Grupo originado por regla (badge "Por regla" + "Nueva")*** | ***Title: Grupo originado por regla (badge "Por regla" + "Nueva")*** | ***Title: Grupo originado por regla (badge "Por regla" + "Nueva")*** |
| **3** | **Given/Precondition: **Existe una regla activa "Comisiones" (Contiene "COMISION", Crear transacción automáticamente = Sí). | **Given/Precondition: **Existe una regla activa "Comisiones" (Contiene "COMISION", Crear transacción automáticamente = Sí). | **Given/Precondition: **Existe una regla activa "Comisiones" (Contiene "COMISION", Crear transacción automáticamente = Sí). |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Importar una línea de extracto "COMISION MTTO MAYO" de `-3,50 €` y abrir el popup. | El proceso de automatch evalúa la línea con el motor de reglas. |  |
| **3** | 1. Observar el grupo correspondiente. | **Resultado esperado:** la línea aparece como un grupo con el badge `Por regla "Comisiones"` y un candidato `Nueva` de `-3,50 €` apuntando a la cuenta contable de la regla. |  |
| ***Case*** | ***Title: Aceptar grupo con auto-creación de transacción*** | ***Title: Aceptar grupo con auto-creación de transacción*** | ***Title: Aceptar grupo con auto-creación de transacción*** |
| **4** | **Given/Precondition: **Popup con un grupo de regla `CreateTransaction = Sí`. | **Given/Precondition: **Popup con un grupo de regla `CreateTransaction = Sí`. | **Given/Precondition: **Popup con un grupo de regla `CreateTransaction = Sí`. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Aceptar el grupo y confirmar la conciliación. | El backend materializa la transacción. |  |
| **4** | 1. Verificar la transacción creada. | Se crea un `FIN_FinAcc_Transaction` con `ETBR_AutoCreated_From_Rule` = id de la regla. |  |
| **4** | 1. Revisar la lista de Reglas de Matcheo. | **Resultado esperado:** el counter `ETBR_MatchCount` de la regla se incrementó en 1. |  |
| ***Case*** | ***Title: Línea respaldada por factura NO es evaluada por reglas*** | ***Title: Línea respaldada por factura NO es evaluada por reglas*** | ***Title: Línea respaldada por factura NO es evaluada por reglas*** |
| **5** | **Given/Precondition: **Una línea de extracto cuya referencia coincide con un `C_Invoice`. | **Given/Precondition: **Una línea de extracto cuya referencia coincide con un `C_Invoice`. | **Given/Precondition: **Una línea de extracto cuya referencia coincide con un `C_Invoice`. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Ejecutar el proceso de automatch. | Solo corre el algoritmo estándar sobre esa línea. |  |
| **5** | 1. Revisar las sugerencias generadas. | **Resultado esperado:** ninguna regla se evalúa contra la línea respaldada por factura. |  |
| ***Case*** | ***Title: Regla inactiva se omite*** | ***Title: Regla inactiva se omite*** | ***Title: Regla inactiva se omite*** |
| **6** | **Given/Precondition: **Existe una regla con `IsActive='N'`. | **Given/Precondition: **Existe una regla con `IsActive='N'`. | **Given/Precondition: **Existe una regla con `IsActive='N'`. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. Ejecutar el automatch. | El motor itera solo reglas activas. |  |
| **6** | 1. Revisar las sugerencias. | **Resultado esperado:** la regla inactiva se saltea; no se produce ninguna sugerencia con su id. |  |
| ***Case*** | ***Title: Dos reglas con prioridad distinta: primaria + alternativa*** | ***Title: Dos reglas con prioridad distinta: primaria + alternativa*** | ***Title: Dos reglas con prioridad distinta: primaria + alternativa*** |
| **7** | **Given/Precondition: **Dos reglas (prioridad 10 y 20) que matchean la misma línea. | **Given/Precondition: **Dos reglas (prioridad 10 y 20) que matchean la misma línea. | **Given/Precondition: **Dos reglas (prioridad 10 y 20) que matchean la misma línea. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Ejecutar el motor de reglas sobre la línea. | Ambas reglas matchean. |  |
| **7** | 1. Revisar el payload del grupo. | **Resultado esperado:** la regla de prioridad 10 es la sugerencia principal y la de prioridad 20 se devuelve como alternativa en la metadata. |  |
| ***Case*** | ***Title: "Abrir conciliación" desde el popup*** | ***Title: "Abrir conciliación" desde el popup*** | ***Title: "Abrir conciliación" desde el popup*** |
| **8** | **Given/Precondition: **Popup de sugerencias abierto. | **Given/Precondition: **Popup de sugerencias abierto. | **Given/Precondition: **Popup de sugerencias abierto. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Hacer click en `Abrir conciliación`. | La app navega al tab Conciliación. |  |
| **8** | 1. Observar el estado del tab. | **Resultado esperado:** se abre con la misma cuenta preseleccionada y las sugerencias reflejadas en el panel derecho. |  |
| ***Case*** | ***Title: Idempotencia del re-run de automatch*** | ***Title: Idempotencia del re-run de automatch*** | ***Title: Idempotencia del re-run de automatch*** |
| **9** | **Given/Precondition: **Un dataset ya procesado por automatch. | **Given/Precondition: **Un dataset ya procesado por automatch. | **Given/Precondition: **Un dataset ya procesado por automatch. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Ejecutar automatch una segunda vez sobre el mismo dataset. | El proceso vuelve a correr. |  |
| **9** | 1. Revisar `ETBR_Match_Suggestion`. | **Resultado esperado:** no se crean filas duplicadas y las sugerencias ya aceptadas no se re-proponen. |  |
| ***Case*** | ***Title: Popup con 0 sugerencias (estado vacío)*** | ***Title: Popup con 0 sugerencias (estado vacío)*** | ***Title: Popup con 0 sugerencias (estado vacío)*** |
| **10** | **Given/Precondition: **Cuenta cuyo automatch no encuentra ninguna coincidencia (ni por algoritmo estándar ni por reglas). | **Given/Precondition: **Cuenta cuyo automatch no encuentra ninguna coincidencia (ni por algoritmo estándar ni por reglas). | **Given/Precondition: **Cuenta cuyo automatch no encuentra ninguna coincidencia (ni por algoritmo estándar ni por reglas). |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Abrir el popup de conciliación automática para esa cuenta. | El proceso corre y no produce grupos. |  |
| **10** | 1. Observar el popup. | **Resultado esperado:** se muestra un estado vacío (mensaje tipo "No hay sugerencias") con un CTA para ir a la conciliación manual; no hay grupos listados ni botón "Conciliar (N)" accionable. |  |
| ***Case*** | ***Title: Todos los grupos desmarcados deshabilitan "Conciliar"*** | ***Title: Todos los grupos desmarcados deshabilitan "Conciliar"*** | ***Title: Todos los grupos desmarcados deshabilitan "Conciliar"*** |
| **11** | **Given/Precondition: **Popup de sugerencias abierto con varios grupos (todos checkeados por defecto). | **Given/Precondition: **Popup de sugerencias abierto con varios grupos (todos checkeados por defecto). | **Given/Precondition: **Popup de sugerencias abierto con varios grupos (todos checkeados por defecto). |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Desmarcar todos los grupos. | El contador superior queda en "0 de N". |  |
| **11** | 1. Observar el botón Conciliar. | **Resultado esperado:** el botón "Conciliar" queda deshabilitado (no hay grupos seleccionados que aplicar). |  |
| ***Case*** | ***Title: Regla con "Crear transacción automáticamente" = No*** | ***Title: Regla con "Crear transacción automáticamente" = No*** | ***Title: Regla con "Crear transacción automáticamente" = No*** |
| **12** | **Given/Precondition: **Existe una regla activa con `CreateTransaction = No` y una línea de extracto que la regla matchea y que tiene una operación del sistema existente correspondiente. | **Given/Precondition: **Existe una regla activa con `CreateTransaction = No` y una línea de extracto que la regla matchea y que tiene una operación del sistema existente correspondiente. | **Given/Precondition: **Existe una regla activa con `CreateTransaction = No` y una línea de extracto que la regla matchea y que tiene una operación del sistema existente correspondiente. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Ejecutar el automatch y abrir el popup. | La regla matchea la línea. |  |
| **12** | 1. Observar el grupo de esa línea. | Aparece con el badge `Por regla {nombre}` pero **sin** el badge `Nueva` (no se crea ninguna transacción); el candidato es la operación existente. |  |
| **12** | 1. Aceptar el grupo. | **Resultado esperado:** la conciliación se realiza contra la operación existente y **no** se materializa ninguna transacción nueva (a diferencia del Caso 71 con `CreateTransaction = Sí`). |  |

# Sección 8 — Contabilización diferida y Reactivar

| ***Case*** | ***Title: Conciliar deja la línea en estado Conciliado / Pendiente de contabilizar*** | ***Title: Conciliar deja la línea en estado Conciliado / Pendiente de contabilizar*** | ***Title: Conciliar deja la línea en estado Conciliado / Pendiente de contabilizar*** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Cuenta con una línea de extracto y un pago conciliables. | **Given/Precondition: **Cuenta con una línea de extracto y un pago conciliables. | **Given/Precondition: **Cuenta con una línea de extracto y un pago conciliables. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Conciliar la línea contra el pago en el tab Conciliación. | La operación se completa. |  |
| **1** | 1. Verificar el `FIN_Reconciliation_Line`. | Tiene `Status=Conciliado` y `ETBR_PostStatus='P'`. |  |
| **1** | 1. Revisar el tab Movimientos. | **Resultado esperado:** la transacción relacionada se muestra como "Conciliado" (no "Contabilizado"). |  |
| ***Case*** | ***Title: Contabilizar manualmente*** | ***Title: Contabilizar manualmente*** | ***Title: Contabilizar manualmente*** |
| **2** | **Given/Precondition: **Existe al menos una línea con `ETBR_PostStatus='P'`. | **Given/Precondition: **Existe al menos una línea con `ETBR_PostStatus='P'`. | **Given/Precondition: **Existe al menos una línea con `ETBR_PostStatus='P'`. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Hacer click en el botón manual `Contabilizar`. | Corre `PostReconciledProcess` y contabiliza vía el `AcctServer` de Etendo. |  |
| **2** | 1. Verificar el estado tras el proceso. | `ETBR_PostStatus` pasa a `D`. |  |
| **2** | 1. Revisar el tab Movimientos. | **Resultado esperado:** la transacción se muestra como "Contabilizado". |  |
| ***Case*** | ***Title: Contabilización programada (scheduler)*** | ***Title: Contabilización programada (scheduler)*** | ***Title: Contabilización programada (scheduler)*** |
| **3** | **Given/Precondition:  **`ETBR_PostFrequency` configurada en "Cada hora"; hay líneas pendientes. | **Given/Precondition:  **`ETBR_PostFrequency` configurada en "Cada hora"; hay líneas pendientes. | **Given/Precondition:  **`ETBR_PostFrequency` configurada en "Cada hora"; hay líneas pendientes. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Esperar (o disparar) el tick del scheduler. | El proceso batch corre sin interacción del usuario. |  |
| **3** | 1. Revisar las líneas pendientes. | **Resultado esperado:** todas las líneas pendientes de todas las cuentas se procesan automáticamente. |  |
| ***Case*** | ***Title:  Fallo de un header marca F y el batch continúa*** | ***Title:  Fallo de un header marca F y el batch continúa*** | ***Title:  Fallo de un header marca F y el batch continúa*** |
| **4** | **Given/Precondition: **Un header de conciliación con configuración contable faltante (provocará error de posteo). | **Given/Precondition: **Un header de conciliación con configuración contable faltante (provocará error de posteo). | **Given/Precondition: **Un header de conciliación con configuración contable faltante (provocará error de posteo). |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Ejecutar el batch de contabilización con varios headers, uno defectuoso. | El batch procesa header por header. |  |
| **4** | 1. Revisar el resultado. | **Resultado esperado:** las líneas del header defectuoso quedan en `F`, se escribe el error en `AD_Process_Log`, y el siguiente header se procesa normalmente (el batch no aborta). |  |
| ***Case*** | ***Title: Línea contabilizada es inmutable (409)*** | ***Title: Línea contabilizada es inmutable (409)*** | ***Title: Línea contabilizada es inmutable (409)*** |
| **5** | **Given/Precondition: **Existe una línea con `ETBR_PostStatus='D'`. | **Given/Precondition: **Existe una línea con `ETBR_PostStatus='D'`. | **Given/Precondition: **Existe una línea con `ETBR_PostStatus='D'`. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Intentar un `PUT` sobre el `FIN_FinAcc_Transaction` subyacente para cambiar el importe. | El handler valida el estado. |  |
| **5** | 1. Observar la respuesta. | **Resultado esperado:** el backend devuelve HTTP 409 con un mensaje claro ("Las transacciones contabilizadas son inmutables"). |  |
| ***Case*** | ***Title: Reactivar una línea contabilizada*** | ***Title: Reactivar una línea contabilizada*** | ***Title: Reactivar una línea contabilizada*** |
| **6** | **Given/Precondition: **Existe una línea contabilizada (`D`). | **Given/Precondition: **Existe una línea contabilizada (`D`). | **Given/Precondition: **Existe una línea contabilizada (`D`). |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. En el tab Conciliación, seleccionar la línea y hacer click en `Reactivar`. | Aparece un modal de confirmación. |  |
| **6** | 1. Confirmar. | Se ejecuta el un-post + un-reconcile atómico (Payment Removal). |  |
| **6** | 1. Revisar el estado. | **Resultado esperado:** la transacción subyacente vuelve a "Completado" y la línea desaparece de la conciliación. |  |
| ***Case*** | ***Title: Periodo contable cerrado rechaza Reactivar*** | ***Title: Periodo contable cerrado rechaza Reactivar*** | ***Title: Periodo contable cerrado rechaza Reactivar*** |
| **7** | **Given/Precondition: **Una línea contabilizada cuyo periodo contable está cerrado. | **Given/Precondition: **Una línea contabilizada cuyo periodo contable está cerrado. | **Given/Precondition: **Una línea contabilizada cuyo periodo contable está cerrado. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Intentar Reactivar la línea. | El backend valida el periodo. |  |
| **7** | 1. Observar la respuesta. | **Resultado esperado:** se rechaza con un error claro que referencia el periodo cerrado; la línea sigue contabilizada. |  |
| ***Case*** | ***Title: Desconciliar una línea pendiente (P) desde Movimientos*** | ***Title: Desconciliar una línea pendiente (P) desde Movimientos*** | ***Title: Desconciliar una línea pendiente (P) desde Movimientos*** |
| **8** | **Given/Precondition: **Existe una línea conciliada-no-contabilizada (`P`). | **Given/Precondition: **Existe una línea conciliada-no-contabilizada (`P`). | **Given/Precondition: **Existe una línea conciliada-no-contabilizada (`P`). |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. En el tab Movimientos, abrir el kebab de la fila y click en `Desconciliar`. | Se invoca el mismo flujo de reactivación. |  |
| **8** | 1. Revisar el estado. | **Resultado esperado:** la línea vuelve a "Completado" y desaparece de cualquier conciliación activa. |  |
| ***Case*** | ***Title: Ciclo Reactivar → re-conciliar → re-contabilizar es idempotente*** | ***Title: Ciclo Reactivar → re-conciliar → re-contabilizar es idempotente*** | ***Title: Ciclo Reactivar → re-conciliar → re-contabilizar es idempotente*** |
| **9** | **Given/Precondition: **Una línea contabilizada. | **Given/Precondition: **Una línea contabilizada. | **Given/Precondition: **Una línea contabilizada. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Reactivar la línea. | La línea vuelve a Completado. |  |
| **9** | 1. Re-conciliar y re-contabilizar. | El ciclo se completa. |  |
| **9** | 1. Comparar los asientos contables. | **Resultado esperado:** los asientos resultantes son idénticos a los originales (idempotencia) y no hay duplicados. |  |
| ***Case*** | ***Title: Reactivar línea en período bloqueado (no cerrado) *** | ***Title: Reactivar línea en período bloqueado (no cerrado) *** | ***Title: Reactivar línea en período bloqueado (no cerrado) *** |
| **10** | **Given/Precondition: **Una línea contabilizada cuyo periodo contable está **bloqueado** para contabilización pero **no cerrado** definitivamente. | **Given/Precondition: **Una línea contabilizada cuyo periodo contable está **bloqueado** para contabilización pero **no cerrado** definitivamente. | **Given/Precondition: **Una línea contabilizada cuyo periodo contable está **bloqueado** para contabilización pero **no cerrado** definitivamente. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Intentar Reactivar la línea. | El backend valida el estado del periodo. |  |
| **10** | 1. Observar la respuesta. | **Resultado esperado:** de forma consistente con el periodo cerrado (Caso 86), la reactivación se rechaza con un mensaje claro que referencia el periodo bloqueado; la línea permanece contabilizada hasta que el periodo se desbloquee. |  |
| ***Case*** | ***Title: Estado de los documentos vinculados al reactivar*** | ***Title: Estado de los documentos vinculados al reactivar*** | ***Title: Estado de los documentos vinculados al reactivar*** |
| **11** | **Given/Precondition: **Una línea contabilizada conciliada contra un pago que, a su vez, cancela una factura. | **Given/Precondition: **Una línea contabilizada conciliada contra un pago que, a su vez, cancela una factura. | **Given/Precondition: **Una línea contabilizada conciliada contra un pago que, a su vez, cancela una factura. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Reactivar la línea y confirmar. | Se ejecuta el un-post + un-reconcile atómico. |  |
| **11** | 1. Revisar el pago vinculado. | El pago vuelve a su estado previo a la conciliación (deja de figurar como conciliado/compensado) y su asiento de conciliación se revierte, pero el pago **no** se elimina. |  |
| **11** | 1. Revisar la factura vinculada (si la hay). | **Resultado esperado:** la factura mantiene su asignación de pago y su estado de cobro sin cambios — reactivar la conciliación bancaria revierte solo el paso de compensación, no "des-paga" la factura. Ningún documento se elimina y la operación es atómica. |  |

# Sección 9 — Extractos importados e importación de archivos

| ***Case*** | ***Title: Listar extractos importados de la cuenta *** | ***Title: Listar extractos importados de la cuenta *** | ***Title: Listar extractos importados de la cuenta *** |
| --- | --- | --- | --- |
| **1** | **Given/Precondition: **Cuenta con extractos importados. | **Given/Precondition: **Cuenta con extractos importados. | **Given/Precondition: **Cuenta con extractos importados. |
| **1** | ***When*** | ***Then*** | ***Result*** |
| **1** | 1. Abrir el tab "Extractos importados". | La tabla se renderiza. |  |
| **1** | 1. Revisar columnas y orden. | **Resultado esperado:** columnas Archivo / (Datos) / Período / Líneas / Progreso / Estado / Importado, ordenadas por fecha de importación descendente. |  |
| ***Case*** | ***Title: Anillo de progreso refleja líneas matcheadas *** | ***Title: Anillo de progreso refleja líneas matcheadas *** | ***Title: Anillo de progreso refleja líneas matcheadas *** |
| **2** | **Given/Precondition: **Un extracto con 10 líneas, 7 matcheadas y 3 sin matchear. | **Given/Precondition: **Un extracto con 10 líneas, 7 matcheadas y 3 sin matchear. | **Given/Precondition: **Un extracto con 10 líneas, 7 matcheadas y 3 sin matchear. |
| **2** | ***When*** | ***Then*** | ***Result*** |
| **2** | 1. Localizar la fila del extracto. | Se muestra la columna Progreso. |  |
| **2** | 1. Leer el anillo de progreso. | **Resultado esperado:** el anillo muestra 70% con su etiqueta "70%". |  |
| ***Case*** | ***Title: Estado "Completado"*** | ***Title: Estado "Completado"*** | ***Title: Estado "Completado"*** |
| **3** | **Given/Precondition: **Un extracto con `processed='Y'` y `posted='Y'`. | **Given/Precondition: **Un extracto con `processed='Y'` y `posted='Y'`. | **Given/Precondition: **Un extracto con `processed='Y'` y `posted='Y'`. |
| **3** | ***When*** | ***Then*** | ***Result*** |
| **3** | 1. Localizar la fila del extracto. | Se muestra el badge de estado. |  |
| **3** | 1. Leer el badge. | **Resultado esperado:** muestra "Completado" en tono verde. |  |
| ***Case*** | ***Title: Estado "En curso"*** | ***Title: Estado "En curso"*** | ***Title: Estado "En curso"*** |
| **4** | **Given/Precondition: **Un extracto con `processed='N'`. | **Given/Precondition: **Un extracto con `processed='N'`. | **Given/Precondition: **Un extracto con `processed='N'`. |
| **4** | ***When*** | ***Then*** | ***Result*** |
| **4** | 1. Localizar la fila del extracto. | Se muestra el badge de estado. |  |
| **4** | 1. Leer el badge. | **Resultado esperado:** muestra "En curso" en tono amarillo. |  |
| ***Case*** | ***Title: Estado "Con incidencias"*** | ***Title: Estado "Con incidencias"*** | ***Title: Estado "Con incidencias"*** |
| **5** | **Given/Precondition: **Un extracto con `processed='Y'` pero con líneas sin matchear. | **Given/Precondition: **Un extracto con `processed='Y'` pero con líneas sin matchear. | **Given/Precondition: **Un extracto con `processed='Y'` pero con líneas sin matchear. |
| **5** | ***When*** | ***Then*** | ***Result*** |
| **5** | 1. Localizar la fila del extracto. | Se muestra el badge de estado. |  |
| **5** | 1. Leer el badge. | **Resultado esperado:** muestra "Con incidencias" en tono naranja. |  |
| ***Case*** | ***Title: Importar un extracto Cuaderno 43 (códigos coincidentes)*** | ***Title: Importar un extracto Cuaderno 43 (códigos coincidentes)*** | ***Title: Importar un extracto Cuaderno 43 (códigos coincidentes)*** |
| **6** | **Given/Precondition: **Cuenta cuyos `codebank` / `codebranch` / `codeaccount` coinciden con la cabecera del archivo C43, del mismo cliente. Existe un archivo `.txt` C43 válido para esa cuenta. | **Given/Precondition: **Cuenta cuyos `codebank` / `codebranch` / `codeaccount` coinciden con la cabecera del archivo C43, del mismo cliente. Existe un archivo `.txt` C43 válido para esa cuenta. | **Given/Precondition: **Cuenta cuyos `codebank` / `codebranch` / `codeaccount` coinciden con la cabecera del archivo C43, del mismo cliente. Existe un archivo `.txt` C43 válido para esa cuenta. |
| **6** | ***When*** | ***Then*** | ***Result*** |
| **6** | 1. En el tab Extractos importados, click en `Importar extracto`. | Se abre el diálogo de subida (acepta `.txt`). |  |
| **6** | 1. Seleccionar el archivo C43 y confirmar la importación. | El parser Cuaderno43 valida los códigos y procesa el archivo. |  |
| **6** | 1. Observar el resultado. | **Resultado esperado:** se crean `FIN_BankStatement` + `FIN_BankStatementLine`; el diálogo se cierra, la lista refresca con el nuevo extracto arriba, y aparece toast de éxito. |  |
| ***Case*** | ***Title: Importar C43 con códigos que no coinciden (error)*** | ***Title: Importar C43 con códigos que no coinciden (error)*** | ***Title: Importar C43 con códigos que no coinciden (error)*** |
| **7** | **Given/Precondition: **Archivo C43 cuya cabecera (entidad/oficina/cuenta) NO coincide con ninguna cuenta del cliente. | **Given/Precondition: **Archivo C43 cuya cabecera (entidad/oficina/cuenta) NO coincide con ninguna cuenta del cliente. | **Given/Precondition: **Archivo C43 cuya cabecera (entidad/oficina/cuenta) NO coincide con ninguna cuenta del cliente. |
| **7** | ***When*** | ***Then*** | ***Result*** |
| **7** | 1. Abrir `Importar extracto`, seleccionar el archivo y confirmar. | El parser intenta resolver la cuenta por códigos. |  |
| **7** | 1. Observar el resultado. | **Resultado esperado:** la importación aborta con error "Error en la cuenta bancaria. La cuenta bancaria no existe ({entidad}-{oficina}-{cuenta})"; no se crean extractos. |  |
| ***Case*** | ***Title: Importar archivo con extensión no soportada*** | ***Title: Importar archivo con extensión no soportada*** | ***Title: Importar archivo con extensión no soportada*** |
| **8** | **Given/Precondition: **Diálogo de importación abierto. | **Given/Precondition: **Diálogo de importación abierto. | **Given/Precondition: **Diálogo de importación abierto. |
| **8** | ***When*** | ***Then*** | ***Result*** |
| **8** | 1. Intentar subir un archivo con extensión no soportada. | La validación de tipo lo detecta. |  |
| **8** | 1. Observar la UI. | **Resultado esperado:** un toast de error describe el problema y el diálogo permanece abierto para reintentar con otro archivo |  |
| ***Case*** | ***Title: Ver las líneas de un extracto *** | ***Title: Ver las líneas de un extracto *** | ***Title: Ver las líneas de un extracto *** |
| **9** | **Given/Precondition: **Existe un extracto importado con líneas. | **Given/Precondition: **Existe un extracto importado con líneas. | **Given/Precondition: **Existe un extracto importado con líneas. |
| **9** | ***When*** | ***Then*** | ***Result*** |
| **9** | 1. Hacer click en la fila del extracto. | Se abre la sub-vista de líneas del extracto. |  |
| **9** | 1. Revisar la tabla de líneas. | Muestra Nº línea / Fecha / Descripción / Referencia / Tercero / Importe / estado de match. |  |
| **9** | 1. Hacer click en la flecha de "volver". | **Resultado esperado:** se cierra la sub-vista y se regresa al listado de extractos. |  |
| ***Case*** | ***Title: Importar dos veces el mismo archivo C43 (detección de duplicado) *** | ***Title: Importar dos veces el mismo archivo C43 (detección de duplicado) *** | ***Title: Importar dos veces el mismo archivo C43 (detección de duplicado) *** |
| **10** | **Given/Precondition: **Una cuenta donde ya se importó un archivo C43 correctamente. | **Given/Precondition: **Una cuenta donde ya se importó un archivo C43 correctamente. | **Given/Precondition: **Una cuenta donde ya se importó un archivo C43 correctamente. |
| **10** | ***When*** | ***Then*** | ***Result*** |
| **10** | 1. Volver a importar el mismo archivo C43 (mismo contenido/período) sobre la misma cuenta. | El sistema compara contra los extractos ya importados. |  |
| **10** | 1. Observar el resultado. | **Resultado esperado:** detecta que el extracto ya fue importado y evita duplicarlo (avisa con un mensaje claro y no vuelve a crear las líneas/movimientos); los saldos no se ven afectados. |  |
| ***Case*** | ***Title: Eliminar un extracto no conciliado*** | ***Title: Eliminar un extracto no conciliado*** | ***Title: Eliminar un extracto no conciliado*** |
| **11** | **Given/Precondition: **Existe un extracto importado cuyas líneas no están conciliadas. | **Given/Precondition: **Existe un extracto importado cuyas líneas no están conciliadas. | **Given/Precondition: **Existe un extracto importado cuyas líneas no están conciliadas. |
| **11** | ***When*** | ***Then*** | ***Result*** |
| **11** | 1. Desde el extracto, elegir `Eliminar`. | Se muestra un diálogo de confirmación. |  |
| **11** | 1. Confirmar la eliminación. | **Resultado esperado:** el extracto y sus líneas se eliminan y desaparecen del listado; los movimientos asociados a la importación se revierten/quitan de forma coherente. |  |
| ***Case*** | ***Title: Eliminar un extracto con líneas conciliadas (bloqueo)*** | ***Title: Eliminar un extracto con líneas conciliadas (bloqueo)*** | ***Title: Eliminar un extracto con líneas conciliadas (bloqueo)*** |
| **12** | **Given/Precondition: **Existe un extracto con al menos una línea ya conciliada. | **Given/Precondition: **Existe un extracto con al menos una línea ya conciliada. | **Given/Precondition: **Existe un extracto con al menos una línea ya conciliada. |
| **12** | ***When*** | ***Then*** | ***Result*** |
| **12** | 1. Intentar eliminar el extracto. | El sistema valida el estado de conciliación de sus líneas. |  |
| **12** | 1. Observar el resultado. | **Resultado esperado:** la eliminación se bloquea con un mensaje claro (hay líneas conciliadas); el extracto permanece. Para eliminarlo, primero hay que reactivar/desconciliar esas líneas. |  |
| ***Case*** | ***Title: Importar C43 con líneas de datos inválidos*** | ***Title: Importar C43 con líneas de datos inválidos*** | ***Title: Importar C43 con líneas de datos inválidos*** |
| **13** | **Given/Precondition: **Un archivo C43 cuyos códigos de cuenta coinciden, pero con algunas líneas con datos malformados (fechas o importes inválidos). | **Given/Precondition: **Un archivo C43 cuyos códigos de cuenta coinciden, pero con algunas líneas con datos malformados (fechas o importes inválidos). | **Given/Precondition: **Un archivo C43 cuyos códigos de cuenta coinciden, pero con algunas líneas con datos malformados (fechas o importes inválidos). |
| **13** | ***When*** | ***Then*** | ***Result*** |
| **13** | 1. Importar el archivo. | El parser procesa las líneas válidas y detecta las que no reconoce. |  |
| **13** | 1. Observar el resultado. | **Resultado esperado:** se importan solo las líneas reconocidas y se muestra un mensaje indicando las líneas que no se pudieron procesar (la importación no se aborta por completo). |  |
| ***Case*** | ***Title: Filtrar / buscar dentro del listado de extractos*** | ***Title: Filtrar / buscar dentro del listado de extractos*** | ***Title: Filtrar / buscar dentro del listado de extractos*** |
| **14** | **Given/Precondition: **Cuenta con varios extractos importados. | **Given/Precondition: **Cuenta con varios extractos importados. | **Given/Precondition: **Cuenta con varios extractos importados. |
| **14** | ***When*** | ***Then*** | ***Result*** |
| **14** | 1. Usar el buscador/filtros del listado de extractos (p. ej. por nombre de archivo, fecha o estado). | El listado filtra según el criterio. |  |
| **14** | 1. Limpiar el filtro. | **Resultado esperado:** durante el filtrado solo quedan los extractos coincidentes; al limpiar, se restaura el listado completo. |  |

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
