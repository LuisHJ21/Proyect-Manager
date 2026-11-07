# Rediseño del panel de administrador: especificación de diseño

**Fecha:** 2026-11-07
**Estado:** pendiente de revisión
**Amplía:** `docs/superpowers/specs/2026-11-06-gestor-proyectos-pmbok7-design.md`

## 1. Propósito

La vista del Project Manager (PM) se percibe como básica: no hay una vista general, el aspecto es simple, la lista de proyectos da poca información y la pantalla de usuarios es limitada. Este rediseño añade un panel general, un sistema de diseño nuevo y pantallas de Proyectos y Usuarios más completas.

### Criterios de éxito

1. Al entrar, el PM ve en una pantalla el estado de todos sus proyectos activos y qué requiere atención.
2. El PM puede buscar, filtrar, ordenar y comparar proyectos y usuarios.
3. El PM puede editar el nombre y el rol de un usuario, y ver sus proyectos y tareas abiertas.
4. Un colaborador no recibe ningún dato adicional de presupuesto, riesgos ni usuarios.

### Restricciones

- Se mantienen React, Tailwind, Fastify, Prisma y SQLite.
- La app funciona en red local sin depender de internet.
- La interfaz sigue en español.

## 2. Sistema de diseño

Definido con la skill ui-ux-pro-max, partiendo de la dirección elegida: barra lateral oscura con acentos de color.

| Elemento | Valor |
|---|---|
| Estilo | Panel denso de datos: filas compactas, cifras en columnas, encabezados de tabla fijos |
| Barra lateral | `#0F172A`, elemento activo `#1E293B` con marca `#818CF8`, ancho 200 px |
| Color principal | `#4F46E5` con texto blanco |
| Fondo de página | `#F5F3FF` |
| Tarjetas | Blanco con borde `#E0E7FF` |
| Texto | `#1E1B4B`, secundario `#475569` |
| Estados | Bien `#047857`, atención `#B45309`, peligro `#B91C1C` |
| Tipografía | Plus Jakarta Sans, incluida en la app con `@fontsource-variable/plus-jakarta-sans` |
| Cifras | `font-variant-numeric: tabular-nums` |
| Iconos | `lucide-react`, nunca emojis |

Los colores se definen como variables de tema de Tailwind, y los componentes usan esos nombres en lugar de valores directos.

### Reglas de accesibilidad y movimiento

- Contraste mínimo de 4.5:1 en texto normal.
- El estado nunca se indica solo con color: lleva icono y texto.
- Foco visible en todos los controles.
- Filas de tabla de al menos 44 px.
- Transiciones de 150 a 200 ms solo en color y opacidad, desactivadas con `prefers-reduced-motion`.
- Los encabezados ordenables usan `aria-sort`.

### Alcance visual

La barra lateral, la tipografía y los colores se aplican a toda la app. Las pestañas internas de cada proyecto y **Mis tareas** cambian de aspecto, pero no de estructura ni de contenido.

Se descartan de la guía el patrón de página comercial, las animaciones al desplazarse, la exportación de datos y las acciones masivas.

## 3. Reglas de negocio

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

Un proyecto con presupuesto 0 no activa ninguna condición de presupuesto. Los umbrales son fijos.

Los proyectos cerrados y cancelados no tienen salud: la API devuelve `null`.

## 4. Pantallas

### Panel general (`/panel`, solo PM)

Es la pantalla de inicio del PM.

- **Indicadores:**
  - Proyectos activos, con cuántos están en riesgo.
  - Tareas vencidas, con en cuántos proyectos.
  - Riesgos altos.
  - Proyectos sobre presupuesto.
- **Color de los indicadores:** refleja el estado real. Vencidas y sobre presupuesto usan peligro si son más de 0; riesgos altos usa atención si es más de 0; con valor 0 usan el color de bien.
- **Salud de los proyectos:** nombre, avance, fecha de fin y salud. Orden: *En riesgo*, *Atención*, *Al día*; dentro de cada grupo, por fecha de fin ascendente, con las fechas vacías al final. Cada fila abre el resumen del proyecto.
- **Requiere atención:** máximo 8 elementos. Primero las tareas vencidas, de la más antigua a la más reciente, y después los riesgos altos, de mayor a menor puntaje. Cada elemento lleva a la pestaña de tareas o de riesgos de su proyecto.
- **Carga del equipo:** usuarios activos con tareas abiertas en proyectos activos, con abiertas y vencidas, de mayor a menor número de abiertas. La barra es proporcional a quien tiene más.
- **Próximos hitos:** pendientes de proyectos activos con fecha de hoy a 14 días después, por fecha ascendente.

Todo se calcula solo con proyectos activos.

### Proyectos (`/proyectos`)

Tabla con encabezado fijo. Por debajo de 1024 px, la tabla se desplaza horizontalmente.

**Para el PM:**

- **Columnas:** proyecto y estado, salud, avance, presupuesto (barra y "gastado de planificado" con su moneda), fin, equipo y alertas.
- **Barra de presupuesto:** usa el color de atención desde el 90 %.
- **Alertas:** tareas vencidas y riesgos altos, o "Sin alertas".
- **Equipo:** iniciales de hasta 2 personas y "+N" por el resto.
- **Búsqueda:** por nombre, sin distinguir mayúsculas ni acentos.
- **Filtros:** estado (*Activos* como valor inicial, *Todos*, o cada estado individual) y salud (*Todas* como valor inicial, o cada salud).
- **Orden:** al hacer clic en el encabezado de salud (predeterminado), proyecto, avance o fin.
- **Contador:** "N de M proyectos".

**Para el colaborador:**

- Ve solo sus proyectos, con las columnas proyecto y estado, avance, fin y equipo.
- Filtro de estado y búsqueda, sin salud.
- Orden predeterminado por proyecto.

Cada fila abre el resumen del proyecto.

### Usuarios (`/usuarios`, solo PM)

- **Columnas:** persona (iniciales, nombre y correo), rol, estado, proyectos, tareas ("N abiertas" y "N vencidas") y acciones.
- **Proyectos:** hasta 2 nombres y "y N más". Un PM sin membresías muestra "Ve todos los proyectos".
- **Búsqueda:** por nombre o correo, sin distinguir mayúsculas ni acentos.
- **Filtros:** rol (*Todos* como valor inicial) y estado (*Activos* como valor inicial, *Inactivos* o *Todos*).
- **Contador:** "N de M usuarios".
- **Editar:** nombre y rol, con `PATCH /api/users/:id`. El correo no se puede cambiar.
- **Menú "Más":** restablecer contraseña y activar o desactivar.
- **Avisos sobre la propia cuenta:** quitarse el rol de PM o desactivarse pide una confirmación que explica la consecuencia. Debe seguir quedando al menos un PM activo.
- **Detalle:** al hacer clic en la fila se abre un panel con sus proyectos, su rol en cada uno, y sus tareas abiertas ordenadas por fecha límite. Cada proyecto y tarea enlaza a su proyecto.

Los filtros de Proyectos y Usuarios vuelven a su valor inicial al salir de la pantalla.

### Navegación

Barra lateral con Panel (solo PM), Proyectos, Mis tareas y Usuarios (solo PM), más la persona, el cambio de contraseña y cerrar sesión. Un colaborador que abre `/panel` vuelve a su inicio, **Mis tareas**.

## 5. API

No se añaden tablas ni migraciones.

### `GET /api/dashboard` (solo PM)

```
{
  totals: { activeProjects, atRiskProjects, overdueTasks, overdueProjects, highRisks, overBudgetProjects },
  projects: [{ id, name, progress, endDate, health }],
  attention: [
    { kind: 'task', id, title, projectId, projectName, dueDate },
    { kind: 'risk', id, title, projectId, projectName, score }
  ],
  workload: [{ userId, name, openTasks, overdueTasks }],
  upcomingMilestones: [{ id, name, dueDate, projectId, projectName }]
}
```

### `GET /api/projects` (ampliada)

- **Todos:** `progress` y `team: [{ id, name }]`.
- **Solo PM:** además `health`, `overdueTasks`, `highRisks` y `spentCents`.

### `GET /api/users` (ampliada, solo PM)

Añade a cada usuario `projects: [{ id, name, projectRole }]`, `openTasks` y `overdueTasks`.

### `GET /api/users/:id/tasks` (nueva, solo PM)

Tareas abiertas de la persona: `{ id, title, status, dueDate, projectId, projectName }`, por fecha límite ascendente con las fechas vacías al final. Usuario inexistente: 404.

Un colaborador recibe 403 en las rutas solo para PM. "Hoy" se calcula con `localToday(app.now())`.

### Unidades de código

- **`server/src/domain/health.ts`:** función pura `computeHealth`, única fuente de las reglas de salud.
- **`server/src/domain/dashboard.ts`:** función pura que arma la respuesta del panel a partir de datos ya leídos.

## 6. Estados y errores

- **Cargando:** bloques de relleno con la forma final.
- **Fallo al cargar sin datos previos:** aviso con reintento.
- **Fallo al refrescar con datos en pantalla:** se conservan los datos y lo escrito (`isBlockingError`).
- **Panel sin proyectos activos:** invitación a crear un proyecto.
- **Secciones vacías del panel:** un mensaje breve, por ejemplo "Nada requiere atención".
- **Filtros sin resultados:** mensaje y botón para limpiarlos.
- **Error al editar un usuario:** por campo y sin perder lo escrito; `last_pm` se muestra como mensaje claro.

## 7. Pruebas

- **Reglas de salud (Vitest):**
  - Límites: 2 y 3 vencidas; 89 %, 90 % y más del 100 % de presupuesto.
  - Presupuesto 0.
  - Fecha de fin de ayer, hoy y mañana.
  - Riesgo de puntaje 14, 15 y cerrado.
  - Orden de evaluación.
- **Panel (Vitest):** solo cuenta proyectos activos, máximo 8 en atención con su orden, carga sin usuarios inactivos, hitos en los límites de 14 días.
- **API:**
  - 403 para colaboradores en panel, usuarios y tareas de usuario.
  - La lista de proyectos no envía a un colaborador salud, alertas ni gastos.
  - Totales correctos con montos de más de 2.147.483.647 centavos.
- **Interfaz (React Testing Library):** búsqueda sin acentos, filtros, orden, contador, estados vacíos, edición de usuario, avisos sobre la propia cuenta y redirección del colaborador.
- **Flujo completo (Playwright):** se actualiza para entrar por el panel.
- **Revisión visual:** capturas del panel, Proyectos y Usuarios con datos de ejemplo, comparadas con la maqueta aprobada.

## 8. Fuera del alcance

- Exportar datos y acciones masivas.
- Umbrales de salud configurables.
- Cambiar el correo de un usuario.
- Guardar filtros entre visitas.
- Gráficas históricas o de tendencia.
- Notificaciones.
- Modo oscuro.
- Rediseñar la estructura de las pestañas internas de un proyecto.
