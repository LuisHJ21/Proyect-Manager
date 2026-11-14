# El PM también ejecuta tareas (C2): especificación de diseño

**Fecha:** 2026-11-13
**Estado:** aprobada
**Origen:** corrección C2 de `docs/guia-implementacion-pmbok.md` (decisión 2 de la sección 3)

## 1. Propósito

El PM también hace trabajo de coordinación, así que debe poder tener tareas asignadas y seguirlas igual que un colaborador: asignárselas, verlas en «Mis tareas» y contar en la carga de trabajo del equipo.

### Criterios de éxito

1. Una tarea se puede asignar a cualquier miembro activo del proyecto con rol PM o Colaborador.
2. Ascender a alguien a PM no le quita tareas ni pasos.
3. Quien crea un proyecto queda como miembro de él.
4. El PM ve «Mis tareas» en el menú y la página le muestra sus tareas.
5. La carga de trabajo del panel incluye a los PM con tareas abiertas.

## 2. Situación actual

- `assertAssignable` (`server/src/routes/tasks.ts`) exige `role: 'COLLABORATOR'`; mensaje «Solo se pueden asignar colaboradores activos del proyecto».
- `PATCH /api/users/:id` (`server/src/routes/users.ts`) borra las asignaciones de tareas y pasos en proyectos activos al ascender a PM.
- `POST /api/projects` no crea ningún miembro.
- La ruta `/mis-tareas` está detrás de `RequireCollaborator` (`client/src/router.tsx`) y el menú del PM no la incluye (`client/src/components/AppLayout.tsx`).
- `buildDashboard` (`server/src/domain/dashboard.ts`) cuenta la carga solo de colaboradores.
- `TaskForm.tsx` y `Calendar.tsx` filtran a las personas con rol Colaborador.
- Riesgos e incidentes ya aceptan a cualquier miembro como responsable, y un PM ya se puede añadir como miembro: no cambian.

## 3. Diseño

1. **Asignación:** `assertAssignable` acepta miembros activos con rol PM o Colaborador. Mensaje nuevo: «Solo se pueden asignar miembros activos del proyecto». Los pasos siguen exigiendo que la persona esté asignada a la tarea.
2. **Ascenso a PM:** se elimina la limpieza de asignaciones. Se conserva la regla de que debe quedar al menos un PM activo.
3. **Creador como miembro:** `POST /api/projects` crea en la misma transacción un `ProjectMember` del usuario que crea el proyecto, con `projectRole: 'Project Manager'`.
4. **Mis tareas:** la ruta queda disponible para cualquier usuario con sesión (se quita `RequireCollaborator` de ella). El menú del PM incluye «Mis tareas» con su contador, como el del colaborador. El inicio del PM sigue siendo `/panel`. `GET /api/me/tasks` ya filtra por asignación y no cambia, pero se comprueba con una prueba para un PM.
5. **Carga de trabajo:** `buildDashboard` cuenta a cualquier persona activa asignada, sea PM o Colaborador.
6. **Interfaz:** el formulario de tarea ofrece a todos los miembros activos (más los asignados inactivos que ya estuvieran, como hoy). El calendario del PM ofrece a todas las personas activas en su filtro.

## 4. Alternativas consideradas

- **Migración que añade a los PM como miembros de los proyectos existentes:** descartada. En producción solo hay datos de prueba y el PM puede añadirse desde la pestaña Miembros. (Decisión de Claude, aceptada al aprobar el diseño.)
- **Un indicador «puede ejecutar tareas» por usuario:** descartado; la guía decide que todo PM puede ejecutar tareas.

## 5. Fuera de alcance

- Que cada PM vea solo sus proyectos (`Project.ownerId`): la guía lo deja para cuando haya más de un PM.
- Perfil Observador y permisos de riesgos para colaboradores (C1 y F1, siguiente bloque).

## 6. Pruebas

- Servidor: asignar a un PM miembro funciona; a un PM no miembro o inactivo falla; ascender a PM conserva tareas y pasos; crear un proyecto deja al creador como miembro; `GET /api/me/tasks` de un PM devuelve sus tareas; la carga del panel incluye al PM.
- Cliente: el PM ve «Mis tareas» en el menú y entra a la página; el formulario de tarea ofrece al PM miembro.
- Las pruebas de permisos y de `closedGuard` siguen pasando sin cambios.
