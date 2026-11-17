# Rediseño de la navegación del proyecto (propuesta A)

Fecha: 2026-11-16. Rama: `rediseno-navegacion`. Bocetos: lienzo de Claude Design «Rediseño del gestor de proyectos», artboard «A · Menú lateral por áreas» (versión mejorada).

## Intención

Con las etapas 6 a 8 el proyecto tiene 17 secciones en una sola fila de pestañas que se parte en varios renglones, y el Resumen apila ocho bloques uno debajo del otro. El responsable eligió la propuesta A y pidió mejorarla y ejecutarla: mismas funciones, mejor orden.

## Enfoques considerados

| Propuesta | Qué es | Por qué no / por qué sí |
|---|---|---|
| A · Menú lateral por áreas | Menú del proyecto a la izquierda en cinco grupos; menú general compacto | **Elegida.** Todo a un clic, con espacio para crecer |
| B · Cinco áreas con subpestañas | Cinco pestañas arriba y una segunda fila por área | Siempre dos clics; hay que recordar el área de cada sección |
| C · Pestañas principales + «Más» | Seis pestañas fijas y el resto en un menú | Las secciones del «Más» quedan escondidas |

## Diseño

### Menú del proyecto (escritorio, ≥ 768 px)
- Columna izquierda de 240 px, `nav` con `aria-label="Secciones del proyecto"`, fija al hacer scroll, con las secciones en cinco grupos con título:
  - **Visión general:** Resumen, Informes, Actividad.
  - **Planificación:** Acta, Requisitos, Tareas, Entregables.
  - **Control:** Riesgos, Incidentes, Control de cambios, Presupuesto, Desempeño.
  - **Personas:** Interesados, Reuniones.
  - **Cierre:** Lecciones, Anexos, Cierre.
- Cada enlace lleva un icono de lucide (decorativo, `aria-hidden`) y el mismo nombre que hoy; la sección activa se marca con fondo y una barra a la izquierda.
- Una sección que el perfil no puede leer no aparece; un grupo sin secciones visibles tampoco.
- Tareas muestra un indicador con las tareas vencidas (de `GET /indicators`, que ya se pide en el Resumen) cuando hay alguna; es decorativo (`aria-hidden`) y no cambia el nombre del enlace.

### Encabezado del proyecto
- Sobre el contenido: miga «Proyectos / {nombre}», nombre, estado, equipo y las acciones de hoy (Pausar proyecto, Nueva tarea). Los avisos de pausa y de solo lectura siguen debajo.

### Menú general dentro de un proyecto
- En las rutas `/proyectos/:id/…` la barra lateral general se reduce a una columna de iconos de 64 px (marca, enlaces con `aria-label` y `title`, avisos, cambiar contraseña y cerrar sesión como botones de icono). Sin la lista de proyectos activos.
- La franja con «Nuevo proyecto» no se muestra dentro de un proyecto.

### Móvil (< 768 px)
- El menú del proyecto pasa a una fila con desplazamiento horizontal, en el mismo orden, sin títulos de grupo.

### Resumen
- Indicadores arriba como hoy; debajo dos columnas en pantallas anchas (≥ 1024 px): a la izquierda tendencia de hitos, hitos y objetivos; a la derecha «Acerca del proyecto» (descripción, enfoque, fechas, último informe, acciones del PM), equipo y pausas. En pantallas angostas, una sola columna.

## Restricciones
- Sin cambios en la API ni en permisos; solo cliente.
- Nombres accesibles de los enlaces sin cambios (las pruebas y el flujo completo los usan); el orden de las secciones sí cambia.
- Contraste 4.5:1, objetivos táctiles ≥ 40 px, foco visible, sin emojis.

## Lo que decide quien construye
- Iconos concretos, clases de Tailwind y el componente donde vive el menú.
