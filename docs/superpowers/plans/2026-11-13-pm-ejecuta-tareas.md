# El PM también ejecuta tareas (C2): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que el PM pueda tener tareas asignadas, verlas en «Mis tareas» y contar en la carga del equipo.

**Arquitectura:** cambios pequeños en reglas que hoy filtran por rol Colaborador: asignación (`server/src/routes/tasks.ts`), ascenso (`server/src/routes/users.ts`), carga del panel (`server/src/domain/dashboard.ts`), menú y rutas del cliente, formulario de tarea y calendario. Crear un proyecto añade a su creador como miembro.

**Tecnología:** Hono, Prisma con PostgreSQL, React 19, TanStack Query, Vitest y Testing Library.

**Especificación:** `docs/superpowers/specs/2026-11-13-pm-ejecuta-tareas-design.md`

## Restricciones globales

- Rama `pm-ejecuta-tareas`; un commit por tarea, en español, con prefijo (`feat:`, `fix:`, `test:`…).
- Pruebas primero: escribir la prueba, verla fallar, implementar, verla pasar.
- Las pruebas del servidor necesitan PostgreSQL (`docker compose up -d`) y `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres` en el entorno o en el `.env` de la raíz.
- Sin migraciones de Prisma: no cambia el esquema.
- Rol del creador dentro del proyecto: `projectRole: 'Project Manager'`.
- Mensaje de asignación inválida: `Solo se pueden asignar miembros activos del proyecto`.
- Las pruebas de permisos (`*Permissions*`, colaborador sin costos) y de `closedGuard` deben seguir pasando sin cambios.

## Focos de revisión

1. Un PM miembro pero **inactivo** no se puede asignar y no aparece en la carga (Task 1 y Task 3 lo prueban).
2. Quitar al PM de los miembros del proyecto le quita sus tareas, igual que a un colaborador: `DELETE` de miembros ya limpia asignaciones; la Task 1 añade una prueba con un PM.
3. El menú del PM en móvil pasa a 6 enlaces en una barra de 375 px: cada etiqueta debe seguir visible (la Task 4 renderiza el menú móvil del PM y busca «Mis tareas»).
4. El PM que entra a `/mis-tareas` ya no es redirigido a `/panel`, pero el colaborador que entra a `/panel` sigue yendo a `/mis-tareas` (Task 4).
5. Un usuario degradado de PM a Colaborador conserva sus tareas (ya ocurre; la Task 1 lo deja probado).

---

### Task 1: Asignar tareas a PM miembros y conservar asignaciones al ascender

**Files:**
- Modify: `server/src/routes/tasks.ts` (`assertAssignable`, líneas 61-70)
- Modify: `server/src/routes/users.ts` (`PATCH /api/users/:id`, bloque `becomesPm`)
- Test: `server/tests/tasks.test.ts`, `server/tests/users.test.ts`, `server/tests/projects.test.ts` (ahí están las pruebas de miembros)

**Interfaces:**
- Produces: `assertAssignable` acepta usuarios con `active: true` y `role` en `['PM', 'COLLABORATOR']` que sean miembros del proyecto.

- [x] **Step 1: Escribir las pruebas que fallan**

En `tasks.test.ts`:
- `it('asigna a un PM miembro del proyecto')`: añadir al `pm` como miembro (`ctx.prisma.projectMember.create`), `POST /api/projects/:id/tasks` con `assigneeIds: [pm.id, ana.id]` → 201 y nombres asignados incluyen al PM.
- `it('rechaza asignar a un PM que no es miembro o está inactivo')`: un segundo PM no miembro → 400 con `fields.assigneeIds` = `Solo se pueden asignar miembros activos del proyecto`; un PM miembro inactivo → mismo 400.

En `users.test.ts`:
- `it('ascender a PM conserva tareas y pasos en proyectos activos')`: Ana asignada a una tarea con un paso asignado a ella; `PATCH /api/users/:ana` con `{ role: 'PM' }` → 200; la tarea sigue con Ana y el paso conserva `assigneeId`.
- `it('degradar a Colaborador conserva sus tareas')`: con dos PM activos, uno asignado a una tarea pasa a `COLLABORATOR` y la conserva.

En `projects.test.ts`:
- `it('quitar a un PM del proyecto le quita sus tareas del proyecto')`: PM miembro asignado; `DELETE /api/projects/:id/members/:pmId` → la tarea queda sin él.

- [x] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run tests/tasks.test.ts tests/users.test.ts tests/projects.test.ts` (desde `server/`)
Expected: fallan las de asignar a PM y la de ascenso; las de degradar y quitar miembro pueden pasar ya (cubren comportamiento actual).

- [x] **Step 3: Implementar**

`assertAssignable`: filtro `user: { active: true, role: { in: ['PM', 'COLLABORATOR'] } }` y el mensaje nuevo. `users.ts`: borrar `becomesPm` y la transacción que limpia asignaciones; dejar `prisma.user.update` directo. Ajustar la prueba existente cuyo mensaje cite «colaboradores activos» al mensaje nuevo, y la de `closedGuard.test.ts` «ascender a PM no toca las asignaciones de un proyecto cerrado» sigue válida sin cambios.

- [x] **Step 4: Ejecutar y ver pasar**

Run: `npm test -w server`
Expected: todo en verde.

- [x] **Step 5: Commit**

`git commit -m "feat: el PM miembro del proyecto puede tener tareas asignadas"`

### Task 2: El creador de un proyecto queda como miembro

**Files:**
- Modify: `server/src/routes/projects.ts` (`POST /api/projects`, línea 58)
- Test: `server/tests/projects.test.ts`

- [x] **Step 1: Escribir la prueba que falla**

`it('quien crea el proyecto queda como miembro con rol Project Manager')`: `POST /api/projects` como `pm` → 201; `GET /api/projects/:id/members` devuelve exactamente un miembro con `userId: pm.id` y `projectRole: 'Project Manager'`.

- [x] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run tests/projects.test.ts`
Expected: FAIL, la lista de miembros está vacía.

- [x] **Step 3: Implementar**

En el `prisma.project.create`, añadir `members: { create: { userId: user.id, projectRole: 'Project Manager' } }` (escritura anidada, atómica) con el usuario de `requireUser(c)`. Si alguna prueba existente cuenta miembros tras crear un proyecto por la API, ajustarla sumando al creador.

- [x] **Step 4: Ejecutar y ver pasar**

Run: `npm test -w server`
Expected: todo en verde.

- [x] **Step 5: Commit**

`git commit -m "feat: quien crea un proyecto queda como miembro"`

### Task 3: La carga del panel y Mis tareas incluyen al PM

**Files:**
- Modify: `server/src/domain/dashboard.ts` (línea 103)
- Test: `server/tests/domain/dashboard.test.ts`, `server/tests/tasks.test.ts`

- [x] **Step 1: Escribir las pruebas que fallan**

En `dashboard.test.ts`, renombrar la prueba de la línea 82 a `'workload: personas activas con abiertas, PM incluidos, de mayor a menor'` y esperar:

```ts
[
  { userId: 'beto', name: 'Beto', openTasks: 2, overdueTasks: 1 },
  { userId: 'ana', name: 'Ana', openTasks: 1, overdueTasks: 0 },
  { userId: 'pm', name: 'Jefa', openTasks: 1, overdueTasks: 0 },
]
```

Ana va antes que Jefa porque los empates se ordenan por nombre. `off` sigue fuera por inactivo.

En `tasks.test.ts`: `it('GET /api/me/tasks devuelve las tareas asignadas a un PM')` → el PM miembro asignado a una tarea la recibe.

- [x] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run tests/domain/dashboard.test.ts tests/tasks.test.ts`
Expected: falla la de carga (falta Jefa); la de `/api/me/tasks` puede pasar ya.

- [x] **Step 3: Implementar**

En `buildDashboard`, cambiar la condición a `if (!person.active) continue;`.

- [x] **Step 4: Ejecutar y ver pasar**

Run: `npm test -w server`
Expected: todo en verde.

- [x] **Step 5: Commit**

`git commit -m "feat: la carga de trabajo del panel incluye a los PM"`

### Task 4: Mis tareas para el PM en el menú y la ruta

**Files:**
- Modify: `client/src/components/AppLayout.tsx` (`PM_LINKS`, `useOpenTaskCount(!isPm)`)
- Modify: `client/src/router.tsx` (ruta `/mis-tareas`)
- Modify: `client/src/auth/RequireAuth.tsx` (eliminar `RequireCollaborator` si queda sin uso)
- Test: `client/tests/layout.test.tsx`, `client/tests/myTasks.test.tsx`

**Interfaces:**
- Produces: `PM_LINKS` = Inicio, Mis tareas, Calendario, Lecciones, Proyectos, Usuarios (en ese orden).

- [x] **Step 1: Escribir las pruebas que fallan**

En `layout.test.tsx`:
- Reemplazar `'PM ve Inicio, Calendario, Proyectos y Usuarios, sin Mis tareas'` por `'PM ve Inicio, Mis tareas con contador, Calendario, Proyectos y Usuarios'`: con `'GET /api/me/tasks': [open, done]`, espera el enlace `Mis tareas, 1 abiertas`.
- Reemplazar `'el PM en /mis-tareas vuelve a su inicio'` por `'el PM entra a /mis-tareas'`: espera el encabezado `Mis tareas`.
- `it('en móvil el PM ve Mis tareas en la barra inferior')`: con `vi.stubGlobal('matchMedia', …matches: true…)` como en la prueba de la línea 96, el enlace `Mis tareas, 0 abiertas` está en la navegación `Principal`.
- La prueba `'el colaborador en /panel vuelve a Mis tareas'` no cambia.

- [x] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run tests/layout.test.tsx` (desde `client/`)
Expected: FAIL en las tres pruebas nuevas.

- [x] **Step 3: Implementar**

Añadir `{ to: '/mis-tareas', label: 'Mis tareas', Icon: CheckSquare }` como segundo elemento de `PM_LINKS`; `useOpenTaskCount(true)`; sacar `/mis-tareas` de `RequireCollaborator` dejándola dentro de `RequireAuth`; borrar `RequireCollaborator` si ya no se usa. `HomeRedirect` no cambia (el PM sigue yendo a `/panel`).

- [x] **Step 4: Ejecutar y ver pasar**

Run: `npm test -w client`
Expected: todo en verde.

- [x] **Step 5: Commit**

`git commit -m "feat: el PM tiene la página Mis tareas"`

### Task 5: Formulario de tarea y calendario ofrecen a los PM

**Files:**
- Modify: `client/src/components/tasks/TaskForm.tsx` (línea 36)
- Modify: `client/src/pages/Calendar.tsx` (línea 86)
- Test: `client/tests/taskDetail.test.tsx`, `client/tests/calendar.test.tsx`

- [x] **Step 1: Escribir las pruebas que fallan**

- `taskDetail.test.tsx`: reemplazar `'el formulario lista solo colaboradores como asignables'` por `'el formulario lista a los miembros activos, PM incluidos'`: Carlos y Pedro aparecen; un miembro inactivo no asignado no aparece.
- `calendar.test.tsx`: reemplazar `'… y a todos los colaboradores'` por `'… y a todas las personas activas'`: el filtro Persona ofrece a Diana y a Paula (PM); un usuario inactivo no aparece.

- [x] **Step 2: Ejecutar y ver fallar**

Run: `npx vitest run tests/taskDetail.test.tsx tests/calendar.test.tsx`
Expected: FAIL, Pedro y Paula no aparecen.

- [x] **Step 3: Implementar**

`TaskForm`: quitar la condición `m.role === 'COLLABORATOR'` y conservar la de activos o ya asignados. `Calendar`: `filter((u) => u.active)`.

- [x] **Step 4: Ejecutar y ver pasar**

Run: `npm test`
Expected: shared, server y client en verde.

- [x] **Step 5: Verificación completa y commit**

Run: `npm run build` y luego `npm run test:e2e` (con `TEST_DATABASE_URL`). Expected: 1 passed.
Marcar las casillas de este plan.

`git commit -m "feat: el formulario de tarea y el calendario ofrecen a los PM"`
