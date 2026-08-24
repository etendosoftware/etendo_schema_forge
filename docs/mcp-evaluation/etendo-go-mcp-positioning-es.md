# Etendo GO MCP — en qué es mejor, y por qué le importa a un agente

**Destinatario:** evaluadores técnicos, arquitectos de solución y cualquiera que deba decidir qué ERP
va a operar un agente de IA. **Referencia de comparación:** el MCP de Holded, medido en paralelo
sobre el mismo conjunto de tareas.

> Cada cifra indica de dónde sale. *Medido* significa que se registró una llamada real; *estimado*
> significa muestreo con el método declarado en §7. Nada de lo que sigue se proyecta desde una ficha
> técnica.

---

## 1. La tesis

**Etendo GO expone un ERP que un agente puede operar de verdad, no un catálogo de endpoints que
tiene que memorizar.** Diecisiete verbos genéricos alcanzan 56 especificaciones. Agregar una ventana
no agrega ninguna herramienta.

La diferencia se ve en tres puntos que un evaluador puede verificar en una tarde: qué paga el agente
antes de empezar, si puede recuperarse cuando se equivoca, y si el servidor lo frena antes de hacer
daño.

---

## 2. Lo que el agente paga antes de hacer nada

El catálogo de herramientas de un servidor MCP se carga en el contexto del agente *antes de que lea
el primer mensaje del usuario*. Es el problema mejor documentado del ecosistema MCP: el servidor
oficial de GitHub se cita habitualmente en 42.000–55.000 tokens solo de definiciones, y una
instalación típica de cinco servidores en 30.000–60.000.

| | Herramientas | Costo de carga inicial |
|---|---:|---:|
| **Etendo GO** | **17** (exacto) | **≈ 10.300 tokens** (estimado) |
| Holded | ≈ 180 (estimado) | ≈ 100.000 tokens (estimado) |

Dos consecuencias, y la segunda es la que suele sorprender:

- **Etendo GO queda por debajo del umbral de diferimiento del cliente.** Desde principios de 2026,
  los clientes MCP dejan de precargar un catálogo cuando supera aproximadamente el 10 % de la ventana
  de contexto (unos 20.000 tokens sobre 200.000). Etendo GO está por debajo: sus verbos simplemente
  *están*, invocables de inmediato.
- **Un catálogo grande no sale gratis.** Pasado ese umbral, el cliente lo difiere y el agente debe
  buscar el esquema de cada herramienta antes de poder llamarla — idas y vueltas, con cada
  herramienta que no conoce. **Observado en vivo:** en la sesión que produjo estas cifras, las
  herramientas del servidor de referencia llegaron diferidas y hicieron falta tres consultas de
  descubrimiento antes de poder ejecutar una sola operación de negocio.

Es decir: la ventaja de un catálogo chico no es realmente cuestión de bytes. Es que **un agente que
opera Etendo GO nunca tiene que ir a buscar sus propias herramientas.**

---

## 3. Errores sobre los que el agente puede actuar

La mayoría de las fallas de integración no son caídas: son una llamada que el agente podría haber
corregido si el servidor le hubiera dicho qué estaba mal. Etendo GO responde con una estructura
procesable, no con prosa:

```json
{ "status": 422, "error": "validation_error",
  "detail": "Missing required fields that could not be auto-resolved",
  "missingFields": [{ "name": "product", "type": "foreignKey", "hasSelector": true }],
  "hint": "Provide these fields, or use neo_selectors to find valid values",
  "seeAlso": "docs(topic:\"creating records\")" }
```

*(medido — textual, de un `neo_create` real)*

Todo lo que el agente necesita para reintentar es legible por máquina: qué campo, de qué tipo, qué
herramienta lo resuelve y dónde está la documentación. Un nombre de entidad equivocado vuelve con la
lista de los válidos. **El efecto práctico: el agente se corrige solo en lugar de preguntarle a una
persona.**

El mismo criterio va más allá del texto de error. Cuando un valor no es escribible donde el agente lo
buscó, el descriptor del campo indica dónde **sí** lo es:

```json
{ "name": "eTGOSalePrice", "readOnly": true, "visibility": "readOnly",
  "writableVia": { "spec": "product", "entity": "price",
                   "note": "Set on the sale price list (M_ProductPrice where issopricelist='Y')." } }
```

*(medido)* — un agente que da con un campo derivado recibe una dirección de reenvío en lugar de un
callejón sin salida.

---

## 4. Barreras de protección, porque un agente en algún momento se va a equivocar

Un ERP no es un CRM: una escritura incorrecta termina en la contabilidad. Etendo GO incorpora tres
protecciones para las que no encontramos equivalente en el servidor de referencia:

- **Lotes genuinamente atómicos.** Un lote de varios documentos se confirma completo o no deja nada,
  y la respuesta declara cuál de las dos cosas ocurrió: `committed`, `atomic`, `persisted`. No hay
  facturas a medio contabilizar.
- **Marcado de campos `businessCritical`.** Importes, categorías y fechas clave vienen señalados en
  el esquema como valores que el agente debe confirmar con una persona antes de escribir.
- **Los campos de solo lectura se rechazan, no se descartan en silencio.** Escribir sobre un campo
  que mantiene el servidor devuelve un 422 que nombra el campo, en lugar de un 200 que lo tira sin
  avisar.

Esto último importa más de lo que parece: **una respuesta de éxito que no hizo nada es peor que un
rechazo**, porque no deja ninguna señal de la cual recuperarse.

---

## 5. Comparación directa

| Dimensión | Etendo GO | Holded | Origen del dato |
|---|---|---|---|
| Herramientas para cubrir toda la superficie | 17 verbos → 56 especificaciones | ~180 herramientas explícitas | medido / estimado |
| Costo de carga inicial | ≈ 10.300 tokens | ≈ 100.000 tokens | estimado (§7) |
| ¿Precargado o buscado a demanda? | precargado | diferido | observado en vivo |
| Llamadas por resultado | **1,0× — paridad** | 1,0× | medido |
| Errores estructurados y autocorregibles | sí — campo + sugerencia + herramienta + docs | sin equivalente | medido / observado |
| Dirección de reenvío en campos no escribibles | sí (`writableVia`) | no aplica | medido |
| Escrituras atómicas de varios documentos | sí, con contrato de resultado explícito | sin equivalente | medido |
| Señalización para confirmación humana | sí (`businessCritical`) | sin equivalente | medido |
| Costo de exponer una ventana nueva | ninguna herramienta nueva | endpoint nuevo + herramienta nueva | arquitectónico |
| Superficie ERP profunda (contabilidad, impuestos, inventario, multiorganización) | sí | no expuesta | revisión de catálogo |

**La paridad en llamadas por resultado es el sentido de esa fila.** Suele darse por hecho que un
servidor de verbos genéricos necesita más pasos. No es así: la misma tarea cuesta la misma cantidad
de llamadas en ambos.

---

## 6. En qué seguimos trabajando

Publicar esto sin la otra mitad sería marketing, no evaluación.

- **Nuestras respuestas pesan más por llamada.** Medido en aproximadamente 14× los bytes del servidor
  de referencia para la misma tarea (mediana de dos tareas). Etendo GO paga la introspección en
  tiempo de ejecución, donde un servidor de herramientas explícitas ya la pagó por adelantado. Caso
  concreto: una creación devuelve el registro completo — se envían 3 campos y vuelven unos 50. Está
  registrado, en seguimiento, y es lo primero que estamos recortando.
- **Dominios que todavía no exponemos.** CRM, proyectos, recursos humanos y documentos recurrentes
  están en la hoja de ruta, no en la API. Donde el servidor de referencia los cubre, los cubre y
  nosotros no.
- **Una primera tarea suelta sale más barata allá.** Si todo el trabajo es emitir una factura, una
  herramienta explícita hecha para esa factura le gana a un verbo genérico. Nuestro diseño rinde a lo
  largo de una jornada de trabajo, no en una llamada única.

Publicamos esta lista porque las cifras anteriores son verificables, y un evaluador que encuentra los
huecos por su cuenta deja de creer todo el resto.

---

## 7. Cómo se obtuvieron estas cifras

- **Entorno:** una instalación local de Etendo GO y el tenant de demostración de Holded, sondeados en
  la misma sesión.
- **Medido** = se ejecutó una llamada real y se registró su respuesta textual. Los resultados por
  tarea provienen de un conjunto de tareas congelado, ejecutado en frío y **únicamente con
  herramientas MCP** — sin acceso a base de datos, porque un agente en producción no lo tiene.
- **Estimado** = por muestreo, no exhaustivo. Conteo de herramientas: las 17 de Etendo GO son exactas;
  las ~180 de Holded se leyeron de su listado de catálogo. Los totales de carga inicial se extrapolan
  de una muestra elegida a mano que cubre el rango de tamaños (8 de 17 y 6 de ~180), de modo que
  corresponde tomarlos como orden de magnitud, no como precisión.
- **Deliberadamente no afirmamos** un punto de equilibrio en cantidad de tareas. Se calculó y se
  retiró: la fórmula supone que ambos catálogos se precargan, y el catálogo de referencia estaba
  diferido en la misma sesión que lo midió. Publicar un número que describe una sesión que no ocurre
  sería peor que no publicar ninguno.
- Las referencias de la industria sobre costo de carga inicial provienen de publicaciones públicas de
  2026 sobre consumo de contexto en MCP, no de mediciones propias.

Método y evidencia en bruto: `docs/mcp-evaluation/`. La metodología de puntuación son
`/mcp-comparison` (si el agente lo logra) y `/mcp-ace-comparison` (cuánto cuesta lograrlo).
