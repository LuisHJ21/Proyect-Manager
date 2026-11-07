# Rediseño de la app y panel de administrador: especificación de diseño

**Fecha:** 2026-11-07
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-06-gestor-proyectos-pmbok7-design.md`
**Diseño de referencia:** "App de gestión de proyectos", https://claude.ai/artifact/J3ogkZueoEghGDjbqnWwnk

## 1. Propósito

La vista del Project Manager (PM) se percibe como básica. Este rediseño aplica a toda la app el diseño de referencia con una paleta oscura, y añade un panel general, Proyectos y Usuarios más completos, y un calendario. Se mantienen las funciones ya establecidas: del diseño de referencia se toman el aspecto y la estructura, no sus funciones nuevas.

### Criterios de éxito

1. Al entrar, el PM ve en una pantalla el estado de sus proyectos activos y qué requiere atención.
2. El PM puede buscar, filtrar, ordenar y comparar proyectos y usuarios.
3. El PM puede editar el nombre y el rol de un usuario, y ver sus proyectos y tareas abiertas.
4. Cada rol puede ver sus actividades por fecha en un calendario.
5. Un colaborador no recibe ningún dato adicional de presupuesto, riesgos ni usuarios.

### Restricciones

- Se mantienen React, Tailwind, Fastify, Prisma y SQLite.
- La app funciona en red local sin depender de internet.
- La interfaz sigue en español.

## 2. Regla nueva: el PM no tiene tareas asignadas

Las tareas se asignan solo a usuarios con rol Colaborador.

- **Asignar:** el servidor rechaza con 400 asignar a quien no sea un colaborador activo y miembro del proyecto. Un colaborador ya asignado que se haya desactivado puede conservarse.
- **Formulario de tarea:** la lista de asignados no incluye a los PM, aunque sean miembros.
- **Mis tareas:** no aparece en la navegación del PM. Si un PM abre `/mis-tareas`, vuelve a su inicio.
- **Cambiar un colaborador a PM:** la app avisa cuántas tareas abiertas tiene asignadas y, al confirmar, se quitan todas sus asignaciones en la misma operación. Esas tareas quedan sin esa persona.
- **Datos existentes:** una migración elimina las asignaciones actuales de usuarios con rol PM.
- **Sin cambios:** el PM sigue creando y editando tareas, y actualizando el estado y avance de cualquiera.

El rol se sigue llamando **Colaborador** en pantalla.

## 2.1. Regla nueva: fechas de tarea dentro del proyecto

El inicio y la fecha límite de una tarea deben estar entre el inicio y el fin del proyecto, ambos incluidos.

- **Validación:** el servidor responde 400 con error en el campo `startDate` o `dueDate`, con este mensaje: "La fecha debe estar dentro del proyecto (inicio a fin)", usando las fechas reales. El formulario limita además los campos de fecha con ese intervalo.
- **Proyecto sin fechas:** cada límite solo aplica si está definido.
- **Al editar una tarea:** solo se valida una fecha cuando cambia. Una tarea que ya estaba fuera se puede editar en sus demás campos.
- **Al cambiar las fechas del proyecto:** si alguna tarea quedaría fuera, responde 400 con error en `startDate` o `endDate`, indicando cuántas tareas son. Solo se comprueba la fecha que cambia.
- **Datos existentes:** no se modifican.
- **Hitos:** no aplica esta regla.

## 2.2. Función nueva: pasos de una tarea

Una tarea puede tener una lista de pasos (subtareas). Cada paso tiene título, estado hecho o no, y una persona opcional. No tiene fechas, comentarios, anexos ni dependencias, y no aparece por separado en el tablero, el calendario ni Mis tareas.

- **Quién los gestiona:** el PM crea, edita y elimina pasos. El PM y los asignados a la tarea pueden marcarlos.
- **Persona del paso:** debe estar asignada a la tarea. Si deja de estarlo, el paso queda sin persona.
- **Orden:** el de creación. No se pueden reordenar.
- **Avance automático:** si una tarea tiene pasos, su avance es `hechos / total`, redondeado, y se recalcula con cada cambio. Enviar `progress` para esa tarea responde 400 con error en `progress`. Si se eliminan todos los pasos, conserva su último avance y vuelve a editarse a mano.
- **Estado:**
  - Marcar un paso de una tarea en *Por hacer* la pasa a *En curso*.
  - Una tarea no pasa a *Hecha* con pasos pendientes: responde 409 `steps_pending`, indicando cuántos faltan.
  - Terminar todos los pasos no marca la tarea como *Hecha*; eso sigue siendo una acción de la persona.
  - Desmarcar un paso o añadir uno a una tarea *Hecha* la pasa a *En curso*.
- **Dependencias:** con predecesoras pendientes no se puede marcar un paso: responde 409 `predecessors_pending`. Sí se puede desmarcar.
- **Mis tareas:** la casilla de una tarea con pasos pendientes muestra el motivo del rechazo y vuelve a su estado.

**Pantallas:**

- **Detalle de tarea:** sección "Pasos" en la columna principal, con "N de M completados", barra de avance, casillas, persona, y para el PM añadir, editar y eliminar.
- **Formulario de avance:** con pasos, el campo de avance se muestra como solo lectura.
- **Tarjeta del tablero y lista:** muestran "N de M" si la tarea tiene pasos.

## 3. Sistema de diseño

Basado en el diseño de referencia, con paleta oscura como único tema. No hay selector de tema.

| Elemento | Valor |
|---|---|
| Fondo de página | `#0F1117` |
| Barra lateral | `#0A0C11` |
| Tarjetas y campos | `#181B23` |
| Bordes | `#2A2F3A`; controles `#3F4552` |
| Texto | `#F4F4F5`; secundario `#A1A1AA`; barra lateral `#D4D4D8` |
| Botón principal | `#3B5BDB` con texto blanco |
| Enlaces y elemento activo | Texto `#A9BBFF`; fondo activo `#1E2747` |
| Salud En riesgo | Fondo `#451A03`, texto `#FDBA8C` |
| Salud Atención | Fondo `#422006`, texto `#FDE68A` |
| Salud Al día | Fondo `#064E3B`, texto `#A7F3D0` |
| Títulos | Space Grotesk, peso 600 |
| Texto general | Inter, 14 px |
| Radio | Tarjetas 12 px; controles 8 px; etiquetas y filtros redondos |
| Iconos | `lucide-react`, nunca emojis |

- Las fuentes se incluyen en la app con `@fontsource-variable/inter` y `@fontsource-variable/space-grotesk`.
- Los colores se definen como variables de tema de Tailwind, y los componentes usan esos nombres.
- Cada proyecto recibe un color fijo calculado de su identificador, de esta lista: `#6C8CFF`, `#A78BFA`, `#F97316`, `#2DD4BF`, `#EAB308`. No se puede elegir y no se guarda.

### Accesibilidad y movimiento

- Contraste mínimo de 4.5:1 en texto normal.
- El estado nunca se indica solo con color: lleva icono o texto.
- Foco visible en todos los controles.
- Filas de tabla y controles principales de al menos 44 px; filtros de al menos 34 px.
- Transiciones de 150 a 200 ms solo en color y opacidad, desactivadas con `prefers-reduced-motion`.
- Los encabezados ordenables usan `aria-sort`.
- Cifras con `font-variant-numeric: tabular-nums`.

El tema oscuro se aplica a toda la app: acceso, formularios, ventanas, Kanban, cronograma y pestañas de proyecto.

## 4. Estructura común

### Barra lateral (desde 768 px)

- Logotipo y nombre "Gestor PMBOK".
- **PM:** Inicio, Calendario, Proyectos, Usuarios.
- **Colaborador:** Mis tareas con contador de tareas abiertas, Calendario, Proyectos.
- Lista "Proyectos activos" con el cuadrado de color de cada uno y desplazamiento propio. Un colaborador ve solo los suyos.
- Tarjeta de la persona con nombre, rol, cambio de contraseña y cierre de sesión.

### Barra superior

Contiene "Nuevo proyecto", solo para el PM.

### Móvil (menos de 768 px)

- La barra lateral se sustituye por navegación inferior con los mismos destinos principales de cada rol.
- Las tablas y el Kanban se desplazan horizontalmente dentro de su caja.
- El calendario pasa a una lista por día.

## 5. Reglas de negocio

**Proyecto activo:** estado *Planificación*, *En ejecución* o *En pausa*.

**Tarea abierta:** estado distinto de *Hecha*.

**Tarea vencida:** abierta, con fecha límite anterior a hoy.

**Riesgo alto:** sin cerrar, con puntaje de 15 o más.

### Salud de un proyecto

Se evalúa en este orden, y gana la primera condición que se cumple:

| Salud | Condición |
|---|---|
| **En riesgo** | La fecha de fin es anterior a hoy, o el gasto supera el presupuesto, o hay 3 o más tareas vencidas |
| **Atención** | Hay al menos una tarea vencida, o al menos un riesgo alto, o el gasto es igual o mayor al 90 % del presupuesto |
| **Al día** | Ninguna de las anteriores |

Un proyecto con presupuesto 0 no activa ninguna condición de presupuesto. Los umbrales son fijos. Los proyectos cerrados y cancelados no tienen salud: la API devuelve `null`.

## 6. Pantallas

### Inicio del PM (`/panel`)

Solo para PM. Un colaborador que la abre vuelve a `/mis-tareas`. Todo se calcula con proyectos activos.

- **Encabezado:** fecha y saludo según la hora local con el primer nombre: "Buenos días" hasta las 11:59, "Buenas tardes" hasta las 18:59, y "Buenas noches" después.
- **Indicadores:**
  - Proyectos activos, con cuántos están en riesgo.
  - Tareas vencidas, con en cuántos proyectos.
  - Riesgos altos.
  - Proyectos sobre presupuesto.
  - La nota inferior usa el color de atención si el valor es mayor que 0, y el de bien si es 0, salvo en proyectos activos, que usa texto secundario.
- **Salud de los proyectos:** nombre, equipo, avance, salud y fin. Orden: *En riesgo*, *Atención*, *Al día*; dentro de cada grupo, por fecha de fin ascendente, con las fechas vacías al final. Cada fila abre el resumen del proyecto.
- **Carga del equipo:** colaboradores activos con tareas abiertas, con abiertas y vencidas, de mayor a menor número de abiertas. La barra es proporcional a quien tiene más.
- **Requiere atención (columna derecha):** máximo 8 elementos. Primero las tareas vencidas, de la más antigua a la más reciente, y después los riesgos altos, de mayor a menor puntaje. Una tarea abre su detalle y un riesgo abre la pestaña de riesgos del proyecto.
- **Próximos hitos (columna derecha):** pendientes con fecha de hoy a 14 días después, por fecha ascendente.

### Calendario (`/calendario`)

Para ambos roles. Muestra un mes, de lunes a domingo.

- **Navegación:** mes anterior, mes siguiente y Hoy. El día actual está destacado.
- **Tareas:** aparecen solo en su **fecha límite**, con el color de su proyecto. Las vencidas llevan icono y color de atención.
- **Hitos:** aparecen en su fecha, con icono propio.
- **Día con más de 3 elementos:** muestra 3 y "+N más", que abre la lista completa de ese día.
- **Al hacer clic:** una tarea abre su detalle y un hito abre el resumen de su proyecto.
- **Filtros:** proyecto; persona (solo PM); Todas, Solo tareas o Solo hitos; y "Mostrar terminadas", desactivado al inicio. Las terminadas se ven tachadas.
- **Tareas sin fecha:** un contador "N tareas sin fecha" abre una lista con enlace a cada una.
- **Móvil:** lista de los días con actividades del mes.

**Qué ve cada rol, solo de proyectos activos:**

| Rol | Tareas | Hitos |
|---|---|---|
| PM | Todas | Todos |
| Colaborador | Las que tiene asignadas | Los de sus proyectos |

### Mis tareas (`/mis-tareas`, solo colaborador)

Tarjetas agrupadas en *Vencidas*, *Hoy*, *Próximas* y *Sin fecha*, cada una con proyecto y fecha.

- **Casilla:** marcarla pasa la tarea a *Hecha*; desmarcarla la pasa a *En curso*. El bloqueo por dependencias sigue aplicando: si se rechaza, la casilla vuelve a su estado y se muestra el motivo.
- **Terminadas:** ocultas hasta activar "Mostrar terminadas".
- Al hacer clic en el título se abre el detalle.

### Proyectos (`/proyectos`)

Tabla con encabezado fijo.

**Para el PM:**

- **Columnas:** proyecto con cuadrado de color y estado, salud, avance, presupuesto (barra y "gastado de planificado" con su moneda), fin, equipo y alertas.
- **Barra de presupuesto:** usa el color de atención desde el 90 %.
- **Alertas:** tareas vencidas y riesgos altos, o "Sin alertas".
- **Equipo:** iniciales de hasta 2 personas y "+N" por el resto.
- **Búsqueda:** por nombre, sin distinguir mayúsculas ni acentos.
- **Filtros:** estado (*Activos* como valor inicial, *Todos*, o cada estado) y salud (*Todas* como valor inicial, o cada salud).
- **Orden:** con clic en el encabezado de salud (predeterminado), proyecto, avance o fin.
- **Contador:** "N de M proyectos".

**Para el colaborador:** solo sus proyectos, con columnas proyecto y estado, avance, fin y equipo; filtro de estado y búsqueda; orden predeterminado por proyecto.

Cada fila abre el resumen del proyecto.

### Usuarios (`/usuarios`, solo PM)

- **Columnas:** persona (iniciales, nombre y correo), rol, estado, proyectos, tareas ("N abiertas" y "N vencidas") y acciones. Las tareas de un PM muestran "No aplica".
- **Proyectos:** hasta 2 nombres y "y N más". Un PM sin membresías muestra "Ve todos los proyectos".
- **Búsqueda:** por nombre o correo, sin distinguir mayúsculas ni acentos.
- **Filtros:** rol (*Todos* como valor inicial) y estado (*Activos* como valor inicial, *Inactivos* o *Todos*).
- **Contador:** "N de M usuarios".
- **Editar:** nombre y rol, con `PATCH /api/users/:id`. El correo no se puede cambiar.
- **Menú "Más":** restablecer contraseña y activar o desactivar.
- **Avisos:** quitarse el rol de PM o desactivarse pide una confirmación que explica la consecuencia; cambiar un colaborador a PM avisa de sus asignaciones. Debe seguir quedando al menos un PM activo.
- **Detalle:** al hacer clic en la fila se abre un panel con sus proyectos, su rol en cada uno, y sus tareas abiertas ordenadas por fecha límite, con enlaces.

Los filtros de Proyectos, Usuarios y Calendario vuelven a su valor inicial al salir de la pantalla.

### Proyecto (`/proyectos/:id/...`)

- **Encabezado:** ruta "Proyectos / nombre", título, estado, iniciales del equipo y "Nueva tarea" para el PM.
- **Pestañas:** Resumen, Acta, Tareas, Anexos, y para el PM Interesados, Riesgos y Presupuesto.
- Su contenido no cambia, salvo lo descrito aquí y el aspecto.

### Tareas de un proyecto

- Selector de vista: Tablero, Lista y Cronograma, guardado en `?vista=`. El valor anterior `kanban` se reemplaza por `tablero`.
- **Filtros rápidos en Tablero y Lista:** *Todas*, *Asignadas a mí* (solo colaborador), *Prioridad alta* y *Vencen esta semana* (de hoy a 7 días después), con contador de tareas. Son la única función añadida por el diseño de referencia.
- **Tablero:** las 4 columnas actuales (*Por hacer*, *En curso*, *Bloqueada*, *Hecha*) con punto de color y contador.
- **Tarjeta:** prioridad, título, aviso de espera, barra de avance si es mayor que 0, fecha límite, número de comentarios e iniciales de los asignados.

### Detalle de tarea (`/proyectos/:id/tareas/:taskId`)

Página completa que sustituye a la ventana emergente. El botón de volver y la ruta llevan a las tareas del proyecto.

- **Columna principal:** título, descripción, advertencias, comentarios y formulario para comentar.
- **Columna derecha:** estado y avance editables según permisos; asignados; fechas; prioridad; hito; predecesoras; anexos.
- **Acciones del PM:** editar y eliminar, con los mismos avisos actuales.

## 7. API

Hay dos migraciones: una elimina las asignaciones de usuarios con rol PM y otra crea la tabla `TaskStep` (`id`, `taskId`, `title`, `done`, `assigneeId` opcional, fechas de creación y actualización). Los pasos se borran con su tarea.

### Pasos

- `POST /api/tasks/:id/steps` `{ title, assigneeId? }`: solo PM.
- `PATCH /api/tasks/:id/steps/:stepId` `{ title?, assigneeId?, done? }`: `title` y `assigneeId` solo PM; `done` PM o asignado.
- `DELETE /api/tasks/:id/steps/:stepId`: solo PM.
- `GET /api/tasks/:id` añade `steps: [{ id, title, done, assignee: { id, name } | null }]`, en orden de creación.
- `TaskDto` añade `stepsDone` y `stepsTotal`.

Un paso de otra tarea responde 404. Los cambios de pasos, avance y estado de la tarea ocurren en una sola transacción.

### `GET /api/dashboard` (solo PM)

```
{
  totals: { activeProjects, atRiskProjects, overdueTasks, overdueProjects, highRisks, overBudgetProjects },
  projects: [{ id, name, progress, endDate, health, team: [{ id, name }] }],
  attention: [
    { kind: 'task', id, title, projectId, projectName, dueDate },
    { kind: 'risk', id, title, projectId, projectName, score }
  ],
  workload: [{ userId, name, openTasks, overdueTasks }],
  upcomingMilestones: [{ id, name, dueDate, projectId, projectName }]
}
```

### `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`

Para ambos roles, con el alcance de la sección 6. Las fechas son obligatorias, `from` no puede ser posterior a `to`, y el rango máximo es de 62 días; si no, responde 400 por campo.

```
{
  tasks: [{ id, title, dueDate, status, projectId, projectName, assignees: [{ id, name }] }],
  milestones: [{ id, name, dueDate, status, projectId, projectName }],
  undated: [{ id, title, status, projectId, projectName }]
}
```

`undated` lista las tareas abiertas sin fecha límite del alcance del usuario y no depende del rango.

### `GET /api/projects` (ampliada)

- **Todos:** `progress` y `team: [{ id, name }]`.
- **Solo PM:** además `health`, `overdueTasks`, `highRisks` y `spentCents`.

### `GET /api/users` (ampliada, solo PM)

Añade a cada usuario `projects: [{ id, name, projectRole }]`, `openTasks` y `overdueTasks`.

### `GET /api/users/:id/tasks` (nueva, solo PM)

Tareas abiertas de la persona: `{ id, title, status, dueDate, projectId, projectName }`, por fecha límite ascendente con las fechas vacías al final. Usuario inexistente: 404.

### Cambios en rutas existentes

- `PATCH /api/users/:id`: al pasar a rol PM, quita las asignaciones del usuario en la misma transacción.
- Asignar tareas: aplica la regla de la sección 2.
- `TaskDto` añade `commentCount`.

Un colaborador recibe 403 en las rutas solo para PM. "Hoy" se calcula con `localToday(app.now())`.

### Unidades de código

- **`server/src/domain/health.ts`:** función pura `computeHealth`, única fuente de las reglas de salud.
- **`server/src/domain/dashboard.ts`:** función pura que arma la respuesta del panel a partir de datos ya leídos.

## 8. Estados y errores

- **Cargando:** bloques de relleno con la forma final.
- **Fallo al cargar sin datos previos:** aviso con reintento.
- **Fallo al refrescar con datos en pantalla:** se conservan los datos y lo escrito (`isBlockingError`).
- **Panel sin proyectos activos:** invitación a crear un proyecto.
- **Secciones vacías:** un mensaje breve, por ejemplo "Nada requiere atención".
- **Filtros sin resultados:** mensaje y botón para limpiarlos.
- **Mes sin actividades:** la cuadrícula se muestra con un mensaje.
- **Error al editar un usuario:** por campo y sin perder lo escrito; `last_pm` se muestra como mensaje claro.
- **Tarea inexistente o sin acceso en su página:** "no encontrado" con enlace a las tareas del proyecto.

## 9. Pruebas

- **Reglas de salud (Vitest):**
  - Límites: 2 y 3 vencidas; 89 %, 90 % y más del 100 % de presupuesto.
  - Presupuesto 0.
  - Fecha de fin de ayer, hoy y mañana.
  - Riesgo de puntaje 14, 15 y cerrado.
  - Orden de evaluación.
- **Panel (Vitest):** solo cuenta proyectos activos, máximo 8 en atención con su orden, carga solo de colaboradores activos, hitos en los límites de 14 días.
- **API:**
  - 403 para colaboradores en panel, usuarios y tareas de usuario.
  - La lista de proyectos no envía a un colaborador salud, alertas ni gastos.
  - Totales correctos con montos de más de 2.147.483.647 centavos.
  - Asignar a un PM se rechaza; cambiar a PM quita las asignaciones.
  - La migración elimina solo asignaciones de usuarios con rol PM.
  - Calendario: alcance por rol, límites del rango, 400 con rango inválido, tarea en su fecha límite, tareas sin fecha.
  - Fechas de tarea: el primer y el último día del proyecto se aceptan, un día antes o después no; proyecto con un solo límite o sin fechas; tarea ya fuera editable en otros campos; proyecto que dejaría tareas fuera.
  - Pasos: permisos por rol, persona que no está asignada, avance recalculado y redondeado, `progress` rechazado con pasos, `steps_pending`, paso de otra tarea, bloqueo por dependencias, cambios de estado automáticos, quitar un asignado limpia sus pasos, y sin pasos el avance vuelve a ser manual.
- **Interfaz (React Testing Library):**
  - Búsqueda sin acentos, filtros, orden, contador y estados vacíos.
  - Edición de usuario y avisos de rol.
  - Navegación por rol y redirecciones.
  - Calendario: colocación por fecha, cambio de mes, "+N más" y filtros.
  - Mis tareas: grupos y casilla con reversión ante bloqueo.
  - Filtros rápidos del tablero.
  - Pasos en el detalle por rol, reversión ante rechazo y avance en solo lectura.
  - Formulario de tarea: error de fechas por campo y límites del proyecto.
- **Flujo completo (Playwright):** se actualiza al panel, a la página de tarea y al calendario.
- **Revisión visual:** capturas de escritorio y móvil del panel, Calendario, Proyectos, Usuarios, Tablero y Detalle de tarea con datos de ejemplo, comparadas con las maquetas y el diseño de referencia.

## 10. Fuera del alcance

**Elementos del diseño de referencia que requerirían funciones nuevas:**

- Notificaciones y avisos.
- Compartir.
- Actividad reciente.
- Selector de periodo del inicio.
- Búsqueda global.
- Etiquetas.
- Subtareas con fechas, comentarios, anexos o dependencias propias; reordenar pasos.
- Estimación y horas registradas.
- "Creada por".
- @menciones.
- Botón de añadir tarea en cada columna.
- Tira de días en móvil.

**Otros:**

- Vista semanal, crear o mover tareas desde el calendario, y sincronización con otros calendarios.
- Exportar datos y acciones masivas.
- Umbrales de salud configurables.
- Elegir el color de un proyecto.
- Cambiar el correo de un usuario.
- Guardar filtros entre visitas.
- Gráficas históricas o de tendencia.
- Selector de tema claro u oscuro.
