# Rediseño de la app y panel de administrador: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a toda la app el diseño de referencia con paleta oscura, y añadir el panel general, Proyectos y Usuarios ampliados, el calendario y la regla de que el Project Manager no tiene tareas asignadas.

**Architecture:** El servidor añade funciones puras en `server/src/domain/` y rutas de lectura sobre las tablas existentes. El cliente centraliza el tema en variables de Tailwind y sustituye la estructura común y las pantallas afectadas; buscar, filtrar y ordenar ocurre en el navegador.

**Tech Stack:** TypeScript, React 19, Tailwind 4, TanStack Query, React Router, Fastify 5, Prisma 6, SQLite, Vitest, React Testing Library, Playwright. Nuevas: `lucide-react`, `@fontsource-variable/inter`, `@fontsource-variable/space-grotesk`.

**Spec:** `docs/superpowers/specs/2026-11-07-rediseno-panel-admin-design.md`

## Global Constraints

- Todo texto visible está en español; los identificadores de código, en inglés.
- La app funciona sin internet: ninguna fuente ni recurso externo en ejecución.
- Tema oscuro único, con los colores de la sección 3 de la especificación, usados mediante variables de tema.
- Contraste mínimo de 4.5:1; el estado nunca se indica solo con color; foco visible; `prefers-reduced-motion` respetado.
- Iconos de `lucide-react`, nunca emojis.
- Solo la rama `feat/rediseno-panel`. Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Montos en centavos; las columnas `BigInt` se convierten con `Number()` antes de enviarse. Fechas de planificación como texto `YYYY-MM-DD`.
- "Hoy" en el servidor: `localToday(app.now())`.
- Formato de error existente; no miembro: 404; sin permiso: 403.

## Review Focus

1. **Proyecto con presupuesto 0:** la barra de presupuesto se ve vacía, sin `NaN` ni ancho inválido. Prueba en la Tarea 7.
2. **Enlace antiguo `?vista=kanban` o una vista desconocida:** abre el Tablero o la Lista, sin pantalla rota. Prueba en la Tarea 11.
3. **Rol cambiado con la sesión abierta**, incluido quitarse el rol uno mismo: la app actualiza la sesión y lleva a la pantalla correcta, sin quedar en un error 403. Pruebas en las Tareas 5 y 8.
4. **Meses que cruzan de año o necesitan 6 semanas**, como enero de 2027 y agosto de 2027: la cuadrícula empieza en lunes y destaca hoy según la fecha local. Prueba en la Tarea 9.
5. **Doble clic en la casilla de Mis tareas o un rechazo por dependencias:** una sola solicitud a la vez, y la casilla vuelve a su estado si se rechaza. Prueba en la Tarea 10.

---

## Contrato compartido

Añadir en `shared/src/enums.ts`:

```ts
HEALTH = ['AT_RISK', 'ATTENTION', 'ON_TRACK']
LABELS.health = { AT_RISK: 'En riesgo', ATTENTION: 'Atención', ON_TRACK: 'Al día' }
ACTIVE_PROJECT_STATUS = ['PLANNING', 'EXECUTING', 'PAUSED']
```

---

### Task 1: El PM no tiene tareas asignadas

**Files:**
- Create: migración `server/prisma/migrations/<fecha>_remove_pm_assignments/migration.sql`
- Modify: `server/src/routes/tasks.ts`, `server/src/routes/users.ts`, `server/tests/users.test.ts`
- Test: `server/tests/assignmentRule.test.ts`

**Interfaces:**
- Consumes: `assertAssignable` existente en `tasks.ts`.
- Produces: `PATCH /api/users/:id` con `role: 'PM'` quita las asignaciones en la misma transacción.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('rechaza asignar a un PM, aunque sea miembro', ...);       // POST tasks, PATCH y PUT: 400 con el campo correspondiente
it('un colaborador desactivado ya asignado se conserva', ...);
it('cambiar un colaborador a PM quita todas sus asignaciones', ...);
it('cambiar otros campos no toca las asignaciones', ...);
it('la migración elimina solo asignaciones de usuarios con rol PM', ...); // ejecuta el SQL del archivo contra la base temporal
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/assignmentRule.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar la regla y la migración**

En `assertAssignable`, los usuarios añadidos deben tener `role: 'COLLABORATOR'` y `active: true`. La migración es solo datos:

```sql
DELETE FROM "TaskAssignee" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'PM');
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server`
Expected: PASS. Ajustar las pruebas existentes que asignaban a un PM.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: las tareas solo se asignan a colaboradores"
```

---

### Task 2: Salud de proyectos y panel general en la API

**Files:**
- Create: `server/src/domain/health.ts`, `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts`, `server/src/routes/projectStats.ts`
- Modify: `shared/src/enums.ts`, `server/src/app.ts`
- Test: `server/tests/domain/health.test.ts`, `server/tests/domain/dashboard.test.ts`, `server/tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `localToday`, `addDays`, `averageProgress`, `HIGH_RISK_SCORE`.
- Produces:
  - `computeHealth(input: { status: string; endDate: string | null; plannedBudgetCents: number; spentCents: number; overdueTasks: number; highRisks: number }, today: string): Health | null`
  - `isOverdue(task: { status: string; dueDate: string | null }, today: string): boolean`
  - `isHighRisk(risk: { probability: number; impact: number; status: string }): boolean`
  - `summarizeProject(project, tasks, risks, expenses, today): { progress; overdueTasks; highRisks; spentCents; health }`
  - `buildDashboard(input, today)`, que devuelve la forma de la especificación.
  - `loadProjectSummaries(prisma, projectIds: string[], today): Promise<Map<string, ProjectSummary>>` en `projectStats.ts`, en una sola tanda de consultas, no una por proyecto.

- [ ] **Step 1: Escribir las pruebas de salud que fallan**

```ts
const base = { status: 'EXECUTING', endDate: '2027-01-01', plannedBudgetCents: 10000, spentCents: 0, overdueTasks: 0, highRisks: 0 };
const health = (over = {}) => computeHealth({ ...base, ...over }, '2026-11-07');
it('3 vencidas es riesgo; 2 es atención; 0 al día', () => {
  expect(health({ overdueTasks: 3 })).toBe('AT_RISK');
  expect(health({ overdueTasks: 2 })).toBe('ATTENTION');
  expect(health()).toBe('ON_TRACK');
});
it('presupuesto', () => {
  expect(health({ spentCents: 8900 })).toBe('ON_TRACK');
  expect(health({ spentCents: 9000 })).toBe('ATTENTION');
  expect(health({ spentCents: 10000 })).toBe('ATTENTION');
  expect(health({ spentCents: 10001 })).toBe('AT_RISK');
});
it('presupuesto 0 no activa condiciones', () => expect(health({ plannedBudgetCents: 0, spentCents: 500 })).toBe('ON_TRACK'));
it('fecha de fin', () => {
  expect(health({ endDate: '2026-11-06' })).toBe('AT_RISK');
  expect(health({ endDate: '2026-11-07' })).toBe('ON_TRACK');
  expect(health({ endDate: null })).toBe('ON_TRACK');
});
it('riesgo alto da atención', () => expect(health({ highRisks: 1 })).toBe('ATTENTION'));
it('riesgo gana a atención', () => expect(health({ highRisks: 1, overdueTasks: 3 })).toBe('AT_RISK'));
it.each(['CLOSED', 'CANCELLED'])('%s no tiene salud', (status) => expect(health({ status })).toBeNull());
it('isHighRisk: 14 no, 15 sí, cerrado no', ...);
```

- [ ] **Step 2: Escribir las pruebas del panel que fallan**

```ts
it('solo cuenta proyectos activos', ...);
it('ordena por salud y luego por fin, con fechas vacías al final', ...);
it('attention: máximo 8, primero vencidas de la más antigua, luego riesgos de mayor puntaje', ...);
it('workload: solo colaboradores activos con abiertas, de mayor a menor', ...);
it('hitos: hoy y hoy+14 sí; hoy+15, vencidos y alcanzados no', ...);
it('totales: overdueProjects cuenta proyectos distintos', ...);
// API
it('colaborador recibe 403 y anónimo 401', ...);
it('los totales funcionan con montos sobre 2.147.483.647 centavos', ...);
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w server -- tests/domain/health.test.ts tests/domain/dashboard.test.ts tests/dashboard.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar dominio, carga y `GET /api/dashboard`**

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -w server -- tests/domain/health.test.ts tests/domain/dashboard.test.ts tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: salud de proyectos y panel general en la API"
```

---

### Task 3: Proyectos y usuarios ampliados en la API

**Files:**
- Modify: `server/src/routes/projects.ts`, `server/src/routes/users.ts`, `server/src/routes/taskDto.ts`
- Test: `server/tests/projectsList.test.ts`, `server/tests/usersOverview.test.ts`

**Interfaces:**
- Consumes: `loadProjectSummaries`, `isOverdue`.
- Produces: las formas de la sección 7 de la especificación para `GET /api/projects`, `GET /api/users` y `GET /api/users/:id/tasks`; `TaskDto.commentCount: number`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('PM recibe health, overdueTasks, highRisks, spentCents y team', ...);
it('colaborador recibe progress y team, y ninguno de health, overdueTasks, highRisks ni spentCents', ...);
it('proyecto cerrado tiene health null', ...);
it('users incluye projects con projectRole, openTasks y overdueTasks, sin passwordHash', ...);
it('users/:id/tasks: solo abiertas, por fecha con vacías al final', ...);
it('users/:id/tasks: 403 para colaborador y 404 si no existe', ...);
it('el DTO de tarea incluye commentCount', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/projectsList.test.ts tests/usersOverview.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: datos ampliados de proyectos y usuarios"
```

---

### Task 4: Calendario en la API

**Files:**
- Create: `server/src/routes/calendar.ts`
- Modify: `shared/src/schemas.ts`, `server/src/app.ts`
- Test: `server/tests/calendar.test.ts`

**Interfaces:**
- Produces: `calendarRangeSchema` y `GET /api/calendar`, con la forma de la especificación.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('PM ve tareas e hitos de todos los proyectos activos', ...);
it('colaborador ve solo sus tareas e hitos de sus proyectos', ...);
it('excluye proyectos cerrados y cancelados', ...);
it('la tarea aparece por fecha límite, incluidos los extremos del rango', ...);
it('una tarea fuera del rango no aparece, aunque su inicio caiga dentro', ...);
it('undated: solo abiertas sin fecha, del alcance del usuario y sin depender del rango', ...);
it.each([['2026-11-30','2026-11-01'], ['2026-01-01','2026-04-01'], ['x','2026-01-01']])('rango inválido %s..%s responde 400', ...);
it('62 días se aceptan y 63 no', ...);
it('anónimo recibe 401', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/calendar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server -- tests/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: calendario de tareas e hitos en la API"
```

---

### Task 5: Tema oscuro, estructura común y navegación por rol

**Files:**
- Create: `client/src/lib/display.ts`
- Modify: `client/package.json`, `client/src/index.css`, `client/src/main.tsx`, `client/src/components/ui.tsx`, `client/src/components/FormField.tsx`, `client/src/components/AppLayout.tsx`, `client/src/auth/RequireAuth.tsx`, `client/src/auth/AuthProvider.tsx`, `client/src/router.tsx`, `client/src/api/client.ts`, `client/src/api/types.ts`
- Test: `client/tests/layout.test.tsx`, `client/tests/display.test.ts`

**Interfaces:**
- Produces:
  - `projectColor(id: string): string`, `initials(name: string): string`, `normalizeText(text: string): string`, `shortDate(date: string): string` en `display.ts`.
  - `<HealthBadge health>`, `<Avatar name>`, `<AvatarStack people max>` en `ui.tsx`.
  - Clases de tema de Tailwind: `bg-page`, `bg-sidebar`, `bg-surface`, `border-line`, `text-ink`, `text-ink-soft`, `bg-primary`, `text-link`, `bg-active`.
  - `RequireCollaborator`; `HomeRedirect` lleva al PM a `/panel`.
  - El cliente vuelve a pedir `/api/auth/me` cuando la API responde 403 `forbidden` por rol, mediante el evento `pm:forbidden`.

- [ ] **Step 1: Instalar dependencias**

Run: `npm install -w client lucide-react @fontsource-variable/inter @fontsource-variable/space-grotesk`
Expected: instala sin errores.

- [ ] **Step 2: Escribir las pruebas que fallan**

```ts
it('initials', () => { expect(initials('Beatriz Soto')).toBe('BS'); expect(initials('Ana')).toBe('A'); });
it('normalizeText quita acentos y mayúsculas', () => expect(normalizeText('MIGRACIÓN Ñandú')).toBe('migracion nandu'));
it('projectColor es estable y de la lista', ...);
it('shortDate', () => expect(shortDate('2026-11-30')).toBe('30 nov 2026'));
it('PM ve Inicio, Calendario, Proyectos y Usuarios, sin Mis tareas', ...);
it('colaborador ve Mis tareas con contador, Calendario y Proyectos, sin Inicio ni Usuarios', ...);
it('la barra lista proyectos activos', ...);
it('PM en /mis-tareas vuelve a /panel; colaborador en /panel vuelve a /mis-tareas', ...);
it('un 403 por rol actualiza la sesión y lleva a la pantalla correcta', ...);  // Review Focus 3
it('HealthBadge muestra el texto del estado', ...);
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w client -- tests/layout.test.tsx tests/display.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar tema, componentes base y estructura**

Definir los colores con `@theme` en `index.css`. En `main.tsx`, importar las dos fuentes. Por debajo de 768 px, la barra lateral se sustituye por navegación inferior. El contador de Mis tareas lee `['my-tasks']` solo para colaboradores. Añadir el foco visible y `prefers-reduced-motion` en `index.css`.

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -w client`
Expected: PASS. Actualizar las pruebas existentes que esperaban la pantalla de inicio anterior.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: tema oscuro, estructura común y navegación por rol"
```

---

### Task 6: Pantalla del panel general

**Files:**
- Create: `client/src/pages/Dashboard.tsx`, `client/src/lib/greeting.ts`
- Modify: `client/src/router.tsx`, `client/src/api/types.ts`
- Test: `client/tests/dashboard.test.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard`, `HealthBadge`, `AvatarStack`, `isBlockingError`, `ProjectForm`.
- Produces: `greeting(now: Date, name: string): string`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('saludo por hora', () => {
  expect(greeting(new Date(2026, 10, 7, 11, 59), 'Paula Ramos')).toBe('Buenos días, Paula');
  expect(greeting(new Date(2026, 10, 7, 12, 0), 'Paula Ramos')).toBe('Buenas tardes, Paula');
  expect(greeting(new Date(2026, 10, 7, 18, 59), 'Paula Ramos')).toBe('Buenas tardes, Paula');
  expect(greeting(new Date(2026, 10, 7, 19, 0), 'Paula Ramos')).toBe('Buenas noches, Paula');
});
it('muestra indicadores, salud, carga, atención e hitos', ...);
it('una tarea de atención enlaza a su detalle y un riesgo a la pestaña de riesgos', ...);
it('sin proyectos activos invita a crear uno', ...);
it('secciones vacías muestran su mensaje', ...);
it('el fallo inicial muestra reintento; al refrescar conserva los datos', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/dashboard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pantalla del panel general"
```

---

### Task 7: Pantalla de Proyectos

**Files:**
- Modify: `client/src/pages/project/ProjectList.tsx`, `client/src/api/types.ts`
- Create: `client/src/lib/projectList.ts`
- Test: `client/tests/projectList.test.tsx`, `client/tests/projectListLogic.test.ts`

**Interfaces:**
- Consumes: `normalizeText`, `HealthBadge`, `AvatarStack`, `projectColor`, `formatMoney`.
- Produces: `filterProjects(projects, { search, status, health })`, `sortProjects(projects, key, direction)` y `budgetPercent(spentCents, plannedCents): number`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('budgetPercent con presupuesto 0 da 0 y limita a 100', () => {  // Review Focus 1
  expect(budgetPercent(500, 0)).toBe(0);
  expect(budgetPercent(50, 100)).toBe(50);
  expect(budgetPercent(150, 100)).toBe(100);
});
it('búsqueda sin acentos ni mayúsculas', ...);       // 'migracion' encuentra 'Migración ERP'
it('Activos es el filtro inicial; Todos muestra cerrados', ...);
it('orden por salud, proyecto, avance y fin, con fechas vacías al final', ...);
it('el contador dice "1 de 2 proyectos"', ...);
it('colaborador no ve salud, presupuesto ni alertas, y su orden inicial es por proyecto', ...);
it('la barra usa el color de atención desde 90 %', ...);
it('sin resultados ofrece limpiar los filtros', ...);
it('el encabezado ordenado tiene aria-sort', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/projectList.test.tsx tests/projectListLogic.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/projectList.test.tsx tests/projectListLogic.test.ts tests/projectLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tabla de proyectos con filtros y orden"
```

---

### Task 8: Pantalla de Usuarios

**Files:**
- Modify: `client/src/pages/Users.tsx`, `client/src/api/types.ts`
- Create: `client/src/components/users/UserDetailPanel.tsx`, `client/src/components/users/EditUserModal.tsx`
- Test: `client/tests/users.test.tsx`

**Interfaces:**
- Consumes: `GET /api/users`, `GET /api/users/:id/tasks`, `normalizeText`, `useAuth`, `ConfirmDialog`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('búsqueda por nombre o correo sin acentos; filtros de rol y estado; contador', ...);
it('Activos es el filtro inicial', ...);
it('muestra hasta 2 proyectos y "y N más"; PM sin membresías: "Ve todos los proyectos"', ...);
it('las tareas de un PM muestran "No aplica"', ...);
it('editar envía nombre y rol y no ofrece el correo', ...);
it('cambiar un colaborador a PM avisa cuántas tareas abiertas perderá', ...);
it('quitarse el rol de PM avisa y, al confirmar, actualiza la sesión y sale de Usuarios', ...); // Review Focus 3
it('desactivarse a uno mismo avisa', ...);
it('last_pm se muestra como mensaje claro', ...);
it('el menú Más restablece la contraseña y activa o desactiva', ...);
it('al hacer clic en la fila se ven proyectos y tareas abiertas, con enlaces', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/users.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/users.test.tsx tests/auth.test.tsx`
Expected: PASS. Trasladar a `users.test.tsx` las pruebas de usuarios de `auth.test.tsx` que dependan de la pantalla anterior.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pantalla de usuarios con edición y detalle"
```

---

### Task 9: Pantalla de Calendario

**Files:**
- Create: `client/src/pages/Calendar.tsx`, `client/src/lib/calendarGrid.ts`
- Modify: `client/src/router.tsx`, `client/src/api/types.ts`
- Test: `client/tests/calendarGrid.test.ts`, `client/tests/calendar.test.tsx`

**Interfaces:**
- Consumes: `GET /api/calendar`, `localToday`, `addDays`, `projectColor`.
- Produces: `buildMonthGrid(year: number, month: number): { date: string; inMonth: boolean }[]`, con `month` de 1 a 12, de lunes a domingo; y `groupByDate(tasks, milestones): Map<string, CalendarEntry[]>`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('noviembre de 2026 empieza el lunes 26 de octubre y tiene 35 celdas', ...);
it('enero de 2027 cruza de año', () => expect(buildMonthGrid(2027, 1)[0].date).toBe('2026-12-28'));  // Review Focus 4
it('agosto de 2027 necesita 6 semanas', () => expect(buildMonthGrid(2027, 8)).toHaveLength(42));
it('inMonth marca solo los días del mes', ...);
it('coloca tareas e hitos en su día y destaca hoy según la fecha local', ...);
it('la vencida lleva icono y las terminadas se ocultan hasta activarlas, y entonces van tachadas', ...);
it('más de 3 elementos muestran "+N más" y abre la lista del día', ...);
it('cambiar de mes pide el nuevo rango; Hoy vuelve al mes actual', ...);
it('filtros de proyecto, tipo y persona; el colaborador no ve el de persona', ...);
it('el contador de tareas sin fecha abre su lista', ...);
it('un mes sin actividades muestra el mensaje', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/calendarGrid.test.ts tests/calendar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

El rango pedido es el de la cuadrícula, como máximo 42 días. Por debajo de 768 px, se muestra una lista de los días con actividades, en lugar de la cuadrícula.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/calendarGrid.test.ts tests/calendar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pantalla de calendario"
```

---

### Task 10: Mis tareas en tarjetas

**Files:**
- Modify: `client/src/pages/MyTasks.tsx`
- Create: `client/src/lib/myTasks.ts`
- Test: `client/tests/myTasks.test.tsx`

**Interfaces:**
- Consumes: `GET /api/me/tasks`, `PATCH /api/tasks/:id/progress`, `refreshTaskData`, `localToday`.
- Produces: `groupMyTasks(tasks, today): { overdue; today; upcoming; undated }`, sin terminadas salvo que se pida con `{ includeDone: true }`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('agrupa en Vencidas, Hoy, Próximas y Sin fecha', ...);
it('marcar la casilla envía status DONE y desmarcarla IN_PROGRESS', ...);
it('doble clic envía una sola solicitud', ...);                         // Review Focus 5
it('ante 409 la casilla vuelve a su estado y muestra el motivo', ...);  // Review Focus 5
it('las terminadas se muestran al activar el control', ...);
it('el título enlaza al detalle de la tarea', ...);
it('sin tareas muestra el mensaje vacío', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/myTasks.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/myTasks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Mis tareas en tarjetas agrupadas"
```

---

### Task 11: Encabezado de proyecto, Tablero y filtros rápidos

**Files:**
- Modify: `client/src/pages/project/ProjectLayout.tsx`, `client/src/pages/project/Tasks.tsx`, `client/src/components/tasks/KanbanBoard.tsx`, `client/src/components/tasks/TaskCard.tsx`, `client/src/components/tasks/Timeline.tsx`
- Create: `client/src/lib/taskFilters.ts`
- Test: `client/tests/projectTasks.test.tsx`, modify `client/tests/kanban.test.tsx`

**Interfaces:**
- Consumes: `Avatar`, `AvatarStack`, `addDays`, `TaskDto.commentCount`.
- Produces: `applyQuickFilter(tasks, filter: 'all' | 'mine' | 'high' | 'week', { userId, today })`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('el encabezado muestra ruta, título, equipo y Nueva tarea solo para el PM', ...);
it('las vistas son Tablero, Lista y Cronograma', ...);
it('?vista=kanban abre el Tablero y una vista desconocida la Lista', ...);   // Review Focus 2
it('filtros: "week" incluye hoy y hoy+7, no hoy+8 ni terminadas', ...);
it('"Asignadas a mí" solo aparece al colaborador', ...);
it('el contador refleja el filtro', ...);
it('la tarjeta muestra prioridad, avance si es mayor que 0, fecha, comentarios e iniciales', ...);
it('la tarjeta enlaza a la página de detalle', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/projectTasks.test.tsx tests/kanban.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Conservar `useMoveTask`, el arrastre y su reversión. Cambiar los colores del cronograma a variables de tema, con `projectColor` no aplicable dentro de un solo proyecto: las barras siguen coloreadas por estado.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/projectTasks.test.tsx tests/kanban.test.tsx tests/timelineLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: encabezado de proyecto, tablero y filtros rápidos"
```

---

### Task 12: Página de detalle de tarea

**Files:**
- Create: `client/src/pages/project/TaskDetail.tsx`
- Delete: `client/src/components/tasks/TaskDrawer.tsx`
- Modify: `client/src/router.tsx`, `client/src/components/tasks/TaskForm.tsx`, `client/src/pages/project/Tasks.tsx`, `client/src/components/tasks/TaskList.tsx`, `client/src/components/tasks/Timeline.tsx`
- Test: rename `client/tests/taskDrawer.test.tsx` a `client/tests/taskDetail.test.tsx`

**Interfaces:**
- Consumes: `CommentList`, `DependencyPicker`, `AttachmentList`, `TaskForm`, `isBlockingError`.
- Produces: ruta `/proyectos/:id/tareas/:taskId`.

- [ ] **Step 1: Adaptar las pruebas y añadir las nuevas**

Conservar todas las pruebas del detalle actual, renderizando la página por su ruta, y añadir:

```ts
it('es una página propia, con ruta de vuelta a las tareas', ...);
it('la dirección abre la tarea directamente', ...);
it('una tarea inexistente muestra "no encontrado" con enlace a las tareas', ...);
it('eliminar vuelve a las tareas del proyecto', ...);
it('el formulario lista solo colaboradores como asignables', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/taskDetail.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar y borrar `TaskDrawer`**

Lista, Tablero, Cronograma, Mis tareas, Calendario y panel navegan a la ruta nueva.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: página de detalle de tarea"
```

---

### Task 13: Revisión del tema, flujo completo y verificación visual

**Files:**
- Modify: pantallas restantes con colores claros (`AuthPages`, `ConfirmDialog`, `Toast`, `ErrorState`, `RegisterTable`, `ProjectForm`, `MembersPanel`, `IndicatorCards`, `Charter`, `Registers`), `e2e/main-flow.spec.ts`, `README.md`
- Create: `client/tests/theme.test.ts`

**Interfaces:**
- Consumes: clases de tema de la Tarea 5.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
it('el código del cliente no usa colores claros directos', () => {
  // recorre client/src y falla si encuentra bg-white, bg-slate-*, text-slate-*, border-slate-*, indigo-* o hex fuera de index.css
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -w client -- tests/theme.test.ts`
Expected: FAIL, con la lista de archivos.

- [ ] **Step 3: Cambiar esos colores por las clases de tema**

`projectColor` y `Timeline` pueden usar sus valores propios si la prueba los excluye de forma explícita.

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -w client`
Expected: PASS.

- [ ] **Step 5: Actualizar el flujo completo**

El flujo empieza en el panel, el PM asigna a Beatriz y Carlos, no ve **Mis tareas**, comprueba que el calendario muestra una tarea con fecha, abre el detalle por su página, y termina viendo `50 %` en el resumen y la tarea reflejada en el panel.

Run: `npm run build; npm run test:e2e`
Expected: 1 passed.

- [ ] **Step 6: Revisión visual**

Con datos de ejemplo, tomar capturas de 1360 × 860 y 375 × 812 del panel, Calendario, Proyectos, Usuarios, Tablero y Detalle de tarea. Compararlas con las maquetas y el diseño de referencia, y corregir textos cortados, contraste y desbordes.

- [ ] **Step 7: Actualizar el README**

Describir el rol de cada usuario, el calendario y que el PM no recibe tareas.

- [ ] **Step 8: Verificación final desde una instalación limpia**

Run: clonar la rama en una carpeta temporal y ejecutar `npm install; npm run build; npm test; npm run test:e2e`
Expected: todo en PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: tema oscuro completo y flujo actualizado"
```
