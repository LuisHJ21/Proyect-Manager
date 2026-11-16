# Etapa 5: planificación completa — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** reservas y presupuesto por categoría (F8); horas, tarifas, capacidad y costo de mano de obra (F6); y tipos de dependencia, ruta crítica y reprogramación (F7).

**Architecture:**
- Tres bloques en el orden F8, F6, F7, con reglas puras en `server/src/domain/` y rutas que las usan.
- El costo de mano de obra entra en los cálculos como filas con la misma forma que los gastos (`{ projectId, taskId, date, amountCents }`), devueltas por un solo cargador. Así el valor ganado, los indicadores, la salud, el panel y el cierre lo suman sin cambiar sus funciones puras.
- La ruta crítica es una función pura sobre hojas con fechas.

**Tech Stack:** Hono, Prisma 6 sobre PostgreSQL, Zod en `shared`, React 19 con TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-etapa-5-planificacion-design.md`

## Global Constraints

- **Rama y commits:**
  - Rama `etapa-5-planificacion`, con un commit por tarea.
  - Mensajes en español, con prefijo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas:**
  - Servidor, desde `server/`: `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`.
  - Cliente, desde `client/`: `npx vitest run <archivo>` y `npx tsc -b`.
- **Reglas de siempre:**
  - Errores con `AppError` o `fieldError` y mensajes en español.
  - Validación en `shared/src/schemas.ts`.
  - Migraciones nuevas escritas a mano con el formato de Prisma; nunca se edita una ya aplicada.
  - Toda ruta nueva de escritura entra en `closedGuard`, la matriz de acceso (`server/tests/accessMatrix.test.ts`) y la bitácora (`server/src/activity/table.ts`).
  - Nada de estado en memoria.
- **Lo que solo ve el PM:** tarifas, costo de horas, reservas y presupuesto por categoría. Nunca salen hacia un colaborador u observador, y lo prueban las pruebas de lo que no ve el colaborador.
- **EDT:** ninguna función nueva escribe fechas, horas estimadas, horas registradas ni dependencias en una tarea con subtareas.
- **Días:** naturales, con `diffDays` y `addDays` de `@pm/shared`. Las semanas van de lunes a domingo.
- **Mensajes exactos:**
  - «La línea base y las reservas superan el presupuesto del proyecto»
  - «El sobrecosto proyectado supera la reserva de contingencia»
  - «No se registran horas futuras»
  - «Se calcula con sus subtareas»
  - «Usa esta categoría para trabajo externo. Las horas del equipo ya suman su costo desde la tarifa de cada miembro.»
  - «Las fechas no respetan una dependencia»
  - «La reprogramación deja tareas fuera del proyecto: <títulos separados por «, »>»
  - «Hay sucesoras que ya no respetan sus dependencias»
  - La fila «Mano de obra del equipo», las etiquetas «Sin asignar», «Contingencia», «Sobrecargada» y «Ruta crítica», y los botones «Registrar horas» y «Reprogramar sucesoras».
- **Códigos de error:** `reschedule_outside` (409) y, ya existente, `task_is_summary` (409).

## Review Focus

1. **Tarifa cambiada después de registrar horas:** el costo de las horas viejas no cambia. Prueba en la Task 4.
2. **Una tarea con dos responsables que cruza dos semanas:** sus horas estimadas se reparten por persona y por día, y suman exactamente lo estimado entre todas las semanas. Prueba en la Task 6.
3. **Reprogramar una cadena A → B → C** donde solo B choca con A: C se mueve si el movimiento de B la hace chocar, y no se mueve si no. Prueba en la Task 10.
4. **Desfase negativo en FS (−2):** la sucesora puede empezar 2 días antes del fin de la predecesora sin `date_conflict`, y la ruta crítica lo respeta. Prueba en la Task 9.
5. **Proyecto sin línea base:** las reservas se muestran en Presupuesto y Desempeño no se rompe; `contingencyUseCents` es 0 sin línea base. Prueba en la Task 2.

---

## Bloque F8 · Reservas y presupuesto por categoría

### Task 1: Datos, reservas del proyecto y categorías

**Files:**
- Create: `server/prisma/migrations/20261116100000_budget_reserves/migration.sql`, `server/src/routes/budget.ts`
- Modify:
  - `server/prisma/schema.prisma`: `Project.contingencyReserveCents BigInt @default(0)` y `managementReserveCents BigInt @default(0)`; modelo `BudgetCategory` con `@@unique([projectId, category])` y cascada al proyecto.
  - `shared/src/schemas.ts`: los dos campos en `projectFields` y `updateProjectSchema`, con `budgetAmount`; y `budgetCategoriesSchema`.
  - `server/src/auth/access.ts` (`toProjectDto`).
  - El registro de rutas en `server/src/app.ts` o donde se registran las demás rutas.
  - `server/src/activity/table.ts` y `server/tests/accessMatrix.test.ts`.
- Test: `server/tests/budget.test.ts` (nuevo), `server/tests/closedGuard.test.ts`

**Interfaces:**
- Produces:
  - `budgetCategoriesSchema = z.object({ items: z.array(z.object({ category: z.enum(EXPENSE_CATEGORY), plannedCents: budgetAmount })).max(EXPENSE_CATEGORY.length) })`. Una categoría repetida falla con «Cada categoría va una sola vez».
  - `GET /api/projects/:id/budget-categories`, solo PM, sección `budget`. Responde `{ items: { category, plannedCents, actualCents }[], teamLaborCents: number, contingencyCents, managementCents, unallocatedCents, overAllocated: boolean }`. `actualCents` sale de los gastos por categoría; `teamLaborCents` queda en 0 hasta la Task 5; `unallocatedCents = presupuesto − BAC − contingencia − gestión`, con BAC de la última línea base o, sin ella, la suma de costo planeado de las hojas.
  - `PUT /api/projects/:id/budget-categories` reemplaza las filas y responde lo mismo que el GET.
  - `toProjectDto` quita `contingencyReserveCents` y `managementReserveCents` a quien no es PM, y para el PM los convierte a número.

- [x] **Step 1: Pruebas que fallan** en `budget.test.ts`:
  - `PATCH /api/projects/:id` con `contingencyReserveCents: 5000` y `managementReserveCents: 2000`, y el `GET` del PM los devuelve.
  - El colaborador miembro no recibe esas claves en `GET /api/projects/:id` ni en `GET /api/projects`.
  - PUT con `MATERIALS: 10000` y `SERVICES: 3000`, más un gasto de 2 500 en MATERIALS: el GET da `items` con MATERIALS `{ plannedCents: 10000, actualCents: 2500 }`.
  - Una categoría repetida da 400 «Cada categoría va una sola vez»; un colaborador recibe 403.
  - Presupuesto 100 000, una hoja con costo 80 000 y sin línea base, contingencia 15 000 y gestión 10 000: `unallocatedCents` es −5 000 y `overAllocated` es `true`.
  - `closedGuard.test.ts` lista `PUT /api/projects/:id/budget-categories`.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar** con la migración escrita a mano y `npx prisma generate`.
- [x] **Step 4: Correr** `budget.test.ts`, `closedGuard`, `accessMatrix`, `activityCoverage` y la suite del servidor completa.
  Expected: PASS.
- [x] **Step 5: Commit** `feat: reservas y presupuesto por categoría`.

### Task 2: Reservas en el valor ganado

**Files:**
- Modify: `server/src/domain/evm.ts`, `server/src/routes/performance.ts` (`loadEvmInput` carga las dos reservas)
- Test: `server/tests/domain/evm.test.ts`, `server/tests/performance.test.ts`

**Interfaces:**
- Produces:
  - `EvmInput` suma `contingencyCents` y `managementCents`.
  - `EvmMetrics` reemplaza `reserveCents` por `contingencyCents`, `managementCents`, `unallocatedCents` y `contingencyUseCents = max(0, EAC − BAC)`, y suma `contingencyExceeded: boolean`.

- [x] **Step 1: Pruebas que fallan.**
  - BAC 100 000, EAC 125 000, contingencia 20 000, gestión 5 000 y presupuesto 130 000 dan `{ contingencyUseCents: 25000, contingencyExceeded: true, unallocatedCents: 5000 }`.
  - Con EAC menor que BAC, `contingencyUseCents` es 0.
  - La prueba «índices y proyección» se actualiza con las claves nuevas en lugar de `reserveCents`.
  - En la ruta, un proyecto sin línea base sigue respondiendo `metrics: null` (Review Focus 5).
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.**
- [x] **Step 4: Correr la suite del servidor.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: contingencia y presupuesto sin asignar en el valor ganado`.

### Task 3: Interfaz de reservas y categorías

**Files:**
- Modify:
  - `client/src/api/types.ts`: `Project` con las dos reservas opcionales; `Performance.metrics` con las claves nuevas; tipo `BudgetCategories`.
  - `client/src/components/project/ProjectForm.tsx`: los campos «Reserva de contingencia» y «Reserva de gestión», con `MoneyInput blankIsZero`.
  - `client/src/pages/project/Registers.tsx` (`BudgetPage`): sección «Presupuesto por categoría» y ventana «Editar presupuesto por categoría».
  - `client/src/components/performance/MetricCards.tsx`: la tarjeta «Contingencia» reemplaza a «Reserva».
- Test: `client/tests/budget.test.tsx`, `client/tests/performance.test.tsx`

- [x] **Step 1: Pruebas que fallan.**
  - **Presupuesto:**
    - La tabla muestra cada categoría con planeado, real y diferencia, y la fila «Mano de obra del equipo» con su real.
    - Al pie van «Contingencia», «Reserva de gestión» y «Sin asignar».
    - Con `overAllocated` se ve «La línea base y las reservas superan el presupuesto del proyecto».
    - Editar envía `PUT … { items: [{ category: 'MATERIALS', plannedCents: 10000 }] }`.
  - **Formulario del proyecto:** envía `contingencyReserveCents` y `managementReserveCents`.
  - **Desempeño:**
    - La tarjeta «Contingencia» muestra el uso proyectado.
    - Con `contingencyExceeded` se ve «El sobrecosto proyectado supera la reserva de contingencia».
    - La tarjeta «Reserva» ya no existe.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.**
- [x] **Step 4: Correr la suite del cliente y `npx tsc -b`.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: presupuesto por categoría y reservas en la interfaz`.

## Bloque F6 · Esfuerzo, horas y capacidad

### Task 4: Datos y API de horas

**Files:**
- Create: `server/prisma/migrations/20261116110000_time_entries/migration.sql`, `server/src/routes/timeEntries.ts`
- Modify:
  - `server/prisma/schema.prisma`: `Task.estimatedHours Decimal? @db.Decimal(7, 2)`; `ProjectMember.hourlyRateCents BigInt @default(0)` y `weeklyCapacityHours Int @default(40)`; modelo `TimeEntry` con `onDelete: Cascade` a la tarea, `Restrict` al usuario e `@@index([taskId])`.
  - `shared/src/schemas.ts`:
    - `estimatedHours: z.number().min(0).max(9999).multipleOf(0.01).nullable().optional()` en `taskCommonFields`;
    - `timeEntrySchema = { date: calendarDateSchema, hours: z.number().min(0.25).max(24).multipleOf(0.25), note: noteText().default('') }` y su versión de edición con todos los campos opcionales;
    - en `updateMemberSchema`, `hourlyRateCents: budgetAmount.optional()` y `weeklyCapacityHours: z.number().int().min(0).max(168).optional()`.
  - `server/src/routes/members.ts`: el DTO añade `weeklyCapacityHours` para todos y `hourlyRateCents` solo para el PM; el PATCH acepta los dos campos nuevos solo de un PM.
  - `server/src/routes/tasks.ts` y `taskDto.ts`: `estimatedHours` como número; en una padre se rechaza con «Se calcula con sus subtareas» y el DTO devuelve la suma de las hojas. `WbsTask` suma `estimatedHours: number | null`.
  - `server/src/activity/table.ts`, `server/tests/accessMatrix.test.ts`.
- Test: `server/tests/timeEntries.test.ts` (nuevo), `server/tests/closedGuard.test.ts`, `server/tests/wbs.test.ts`

**Interfaces:**
- Produces: `GET`/`POST /api/tasks/:id/time-entries` y `PATCH`/`DELETE /api/tasks/:id/time-entries/:entryId`. El DTO de una entrada es `{ id, taskId, date, hours: number, note, user: { id, name }, createdAt }`. Solo para el PM añade `rateCents` y `costCents = round(hours × rateCents)`.

- [x] **Step 1: Pruebas que fallan** en `timeEntries.test.ts`. Hay un PM, una responsable Ana con tarifa 2 000, otro colaborador Beto y un observador.
  - Ana registra 2,5 h hoy y responde 201; su respuesta no tiene `rateCents` ni `costCents`.
  - El PM ve la entrada con `rateCents: 2000` y `costCents: 5000`.
  - Beto (no responsable) registra y recibe 403; también ve la lista sin costo.
  - El observador recibe 403 al leer.
  - Una fecha de mañana da 400 en `date` «No se registran horas futuras». 0,1 h o 25 h dan 400.
  - En una padre da 409 `task_is_summary`.
  - Ana edita su entrada y responde 200. Beto edita o borra la de Ana y recibe 403. El PM la borra y responde 200.
  - **Review Focus 1:** el PM cambia la tarifa de Ana a 3 000 y la entrada vieja sigue con `rateCents: 2000`.
  - `GET /api/projects/:id/members`: el colaborador recibe `weeklyCapacityHours` y no `hourlyRateCents`; el PM recibe las dos.
  - El colaborador recibe 403 al hacer PATCH de `hourlyRateCents` sobre un miembro.
  - En `wbs.test.ts`, `estimatedHours` en una padre da 400; el DTO de la padre suma 3 + 5 = 8.
  - `closedGuard` cubre las tres rutas de escritura.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** `rateCents` se lee de `ProjectMember.hourlyRateCents` dentro de la misma transacción que crea la entrada.
- [x] **Step 4: Correr la suite del servidor completa.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: registro de horas, tarifas y capacidad`.

### Task 5: La mano de obra del equipo en el costo real

**Files:**
- Create: `server/src/routes/laborCost.ts`
- Modify:
  - `server/src/routes/performance.ts` (`loadEvmInput`: agrega las filas de mano de obra a `expenses`).
  - `server/src/routes/indicators.ts`, `projectStats.ts`, `dashboard.ts`, `closure.ts` (`loadClosureInput`) y `budget.ts` (`teamLaborCents`).
  - `server/src/domain/indicators.ts` (`weightedProgress`: horas estimadas primero) y su `ProgressTask` con `estimatedHours?: number | null`.
  - Los cargadores de tareas que alimentan `weightedProgress`, para que traigan `estimatedHours`.
  - `server/src/routes/tasks.ts`: el «Gasto ligado» del detalle suma las horas.
- Test: `server/tests/laborCost.test.ts` (nuevo), `server/tests/domain/indicators.test.ts`

**Interfaces:**
- Produces: `loadLaborCosts(db, projectIds: string[], today: string): Promise<{ projectId: string; taskId: string; date: string; amountCents: number }[]>`, con una fila por entrada con `date <= today` y `amountCents = round(hours × rateCents)`.

- [x] **Step 1: Pruebas que fallan.** Proyecto con línea base de una hoja con costo 100 000, avance 50 %, y una entrada de 10 h a 2 000 hoy:
  - `GET /performance` da `acCents: 20000` y `linkedCostCents: 20000` en esa fila.
  - Una entrada de 5 h a 2 000 en una hoja fuera de la base suma 10 000 a `outsideBaselineCostCents`.
  - Indicadores: `budget.spentCents` incluye 20 000.
  - La lista de proyectos y el panel cuentan el proyecto como sobre presupuesto cuando gastos más horas superan el presupuesto.
  - El informe de cierre trae `budget.actualCents` con las horas.
  - `GET /budget-categories` trae `teamLaborCents: 20000`.
  - Pura: `weightedProgress` con horas 2 y 6, avances 100 y 0, da 25. Si a una hoja le faltan horas, se usa el costo.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** Cada cargador concatena `loadLaborCosts` con los gastos que ya lee.
- [x] **Step 4: Correr la suite del servidor.**
  Expected: PASS. Las pruebas existentes no cambian, porque no tienen horas.
- [x] **Step 5: Commit** `feat: las horas del equipo suman al costo real`.

### Task 6: Carga semanal en el panel

**Files:**
- Create: `server/src/domain/workload.ts`
- Modify: `server/src/domain/dashboard.ts` (`DashboardInput` suma `capacities: { userId; hours }[]` y las tareas suman `estimatedHours` y `startDate`), `server/src/routes/dashboard.ts`
- Test: `server/tests/domain/workload.test.ts` (nuevo), `server/tests/dashboard.test.ts`

**Interfaces:**
- Produces:
  - `weekStart(date: string): string` devuelve el lunes de la semana.
  - `weeklyLoad(tasks: { status: string; startDate: string | null; dueDate: string | null; estimatedHours: number | null; assigneeIds: string[] }[], weeks: string[]): Map<string, number[]>`. Devuelve, por persona, las horas de cada semana.
  - El panel `workload[]` suma `weeks: { start: string; assignedHours: number; capacityHours: number; overloaded: boolean }[]` para la semana actual y las 3 siguientes. Las horas se redondean a 1 decimal.

- [x] **Step 1: Pruebas que fallan.**
  - **Review Focus 2:** una tarea de 20 h con dos responsables, del jueves al miércoles siguiente (7 días): cada persona recibe 20 / 2 / 7 por día, y las dos semanas suman 10 h por persona.
  - Una tarea `DONE`, sin fechas o sin horas no suma.
  - `weekStart('2026-11-18')` es `'2026-11-16'`.
  - En el panel, una persona con capacidad 40 en un proyecto y 10 en otro tiene `capacityHours: 50`. Con 60 h asignadas en la semana, `overloaded: true`.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.**
- [x] **Step 4: Correr la suite del servidor.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: carga semanal del equipo en horas`.

### Task 7: Interfaz de horas y capacidad

**Files:**
- Create: `client/src/components/tasks/TimeEntries.tsx`
- Modify:
  - `client/src/api/types.ts`: `Task.estimatedHours`, `Member.hourlyRateCents?` y `weeklyCapacityHours`, `TimeEntry`, y `Dashboard.workload[].weeks`.
  - `TaskForm.tsx` («Horas estimadas»), `TaskDetail.tsx` (sección «Horas»), `MembersPanel.tsx` (tarifa y capacidad) y `pages/MyTasks.tsx` («Registrar horas» por tarea).
  - `Registers.tsx`: el aviso del gasto «Mano de obra» dentro del formulario de gasto, cuando la categoría es `LABOR`.
  - `pages/Dashboard.tsx`: la carga semanal.
- Test: `client/tests/timeEntries.test.tsx` (nuevo), `client/tests/dashboard.test.tsx`, `client/tests/budget.test.tsx`

- [x] **Step 1: Pruebas que fallan.**
  - **Detalle de tarea:**
    - La sección «Horas» lista fecha, persona, horas y nota, y muestra «3,5 h de 8 h estimadas».
    - El responsable registra con el formulario, que envía `{ date, hours: 1.5, note }`.
    - El PM ve una columna «Costo»; el colaborador no.
    - En una padre no aparece «Registrar horas».
  - **Formulario de tarea:** envía `estimatedHours: 8`; en una padre el campo está deshabilitado.
  - **Miembros:** el PM edita «Tarifa por hora» y «Capacidad semanal (h)»; el colaborador no ve la tarifa.
  - **Mis tareas:** cada tarea tiene «Registrar horas», que abre el mismo formulario.
  - **Gasto:** al elegir la categoría «Mano de obra» aparece el aviso exacto de Global Constraints.
  - **Panel:** muestra cuatro semanas por persona, con «Sobrecargada» en la semana con `overloaded`.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** Las horas se muestran con coma decimal (`1,5 h`).
- [x] **Step 4: Correr la suite del cliente y `npx tsc -b`.**
  Expected: PASS. Los datos de prueba de tareas suman `estimatedHours: null`.
- [x] **Step 5: Commit** `feat: horas, tarifas y carga semanal en la interfaz`.

## Bloque F7 · Ruta crítica y tipos de dependencia

### Task 8: Tipos y desfase de dependencias

**Files:**
- Create: `server/prisma/migrations/20261116120000_dependency_types/migration.sql`
- Modify:
  - `server/prisma/schema.prisma`: `TaskDependency.type String @default("FS")` y `lagDays Int @default(0)`.
  - `shared/src/enums.ts`: `DEPENDENCY_TYPE = ['FS', 'SS', 'FF', 'SF']` y sus etiquetas: «Fin a inicio», «Inicio a inicio», «Fin a fin», «Inicio a fin».
  - `shared/src/schemas.ts`: `dependencySchema` con `type` y `lagDays` opcionales (entero de −365 a 365), y `updateDependencySchema`.
  - `server/src/domain/dependencies.ts`: `checkProgressChange` recibe las predecesoras pendientes con su tipo y estado, y suma `dependencyViolated`.
  - `server/src/routes/dependencies.ts` (POST y el PATCH nuevo), `server/src/routes/taskDto.ts` (aviso `date_conflict` en lugar de `starts_before_predecessor_due`) y `server/src/routes/tasks.ts` (`/progress`).
  - Tabla de bitácora y matriz de acceso.
- Test: `server/tests/domain/dependencies.test.ts`, `server/tests/dependencies.test.ts`, `server/tests/closedGuard.test.ts`

**Interfaces:**
- Produces:
  - `type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'`.
  - `dependencyViolated(type, lagDays, predecessor: { startDate; dueDate }, successor: { startDate; dueDate }): boolean`, con las cuatro reglas de la especificación. Devuelve `false` si falta alguna fecha que la regla necesita.
  - `checkProgressChange(current, next, pending: { type: DependencyType; status: string }[])`, con esta regla:
    - FS sin terminar bloquea cualquier avance;
    - SS en «Por hacer» bloquea pasar a «En curso» o subir el avance;
    - FF y SF no bloquean.
  - El DTO de tarea expone `predecessors: { id, type, lagDays }[]` además de `predecessorIds`.

- [x] **Step 1: Pruebas que fallan.**
  - **Puras:** `dependencyViolated` en los cuatro tipos con fechas que cumplen y que no.
    - FS con `lagDays: -2`: sucesora que empieza 2 días antes del fin de la predecesora no choca, y 3 días antes sí (Review Focus 4).
  - **Puras:** `checkProgressChange` por tipo.
  - **Ruta:**
    - POST con `type: 'SS', lagDays: 2` guarda los valores.
    - PATCH a `FF` responde 200; un colaborador recibe 403.
    - `lagDays: 400` da 400.
    - El DTO trae `warnings: ['date_conflict']` cuando una FS no se cumple.
    - Una SS con la predecesora en curso deja pasar la sucesora a «En curso».
  - `closedGuard` cubre el PATCH.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** El texto del cliente para `date_conflict` es «Las fechas no respetan una dependencia»; se ajusta en la Task 11.
- [x] **Step 4: Correr la suite del servidor.**
  Expected: PASS. Las pruebas que esperaban `starts_before_predecessor_due` se actualizan y se anotan como ruling.
- [x] **Step 5: Commit** `feat: tipos y desfase en las dependencias`.

### Task 9: Ruta crítica

**Files:**
- Create: `server/src/domain/criticalPath.ts`, `server/src/routes/schedule.ts`
- Modify: el registro de rutas y la matriz de acceso (lectura `tasks`)
- Test: `server/tests/domain/criticalPath.test.ts` (nuevo), `server/tests/schedule.test.ts` (nuevo)

**Interfaces:**
- Produces:
  - `criticalPath(tasks: { id: string; startDate: string; dueDate: string }[], dependencies: { predecessorId; successorId; type: DependencyType; lagDays: number }[], projectEnd: string | null): { tasks: Map<string, { earlyStart; earlyFinish; lateStart; lateFinish; totalFloat: number; critical: boolean }>; critical: string[]; unscheduled: string[] }`.
  - Las dependencias con un extremo fuera de `tasks` mandan ese extremo a `unscheduled`.
  - `GET /api/projects/:id/schedule` responde `{ tasks: { id, earlyStart, earlyFinish, lateStart, lateFinish, totalFloat, critical }[], critical: string[], unscheduled: string[] }`, solo con hojas con fechas.

- [x] **Step 1: Pruebas que fallan.**
  - **Puras:**
    - Cadena FS A(3 d) → B(2 d), con fin del proyecto igual al fin de B: holgura 0 y las dos críticas.
    - Dos ramas desde A, con B de 5 días y C de 2 días, hacia D: C tiene holgura 3 y B, 0.
    - SS con desfase 1.
    - FF y SF.
    - FS con −2 (Review Focus 4).
    - Con fin del proyecto posterior al último fin temprano, la holgura de la última tarea es la diferencia.
    - Una tarea sin fechas queda en `unscheduled`.
  - **Ruta:**
    - El colaborador lee el cálculo sin costos.
    - Las padres no aparecen.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** Se recorre en orden topológico (Kahn) hacia adelante y en orden inverso hacia atrás. Las restricciones, con S = inicio y F = fin:
  - FS: S_suc ≥ F_pred + 1 + lag
  - SS: S_suc ≥ S_pred + lag
  - FF: F_suc ≥ F_pred + lag
  - SF: F_suc ≥ S_pred + lag

  En la pasada hacia atrás se invierte cada una para acotar el fin tardío de la predecesora.
- [x] **Step 4: Correr la suite del servidor.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: cálculo de holgura y ruta crítica`.

### Task 10: Reprogramar sucesoras

**Files:**
- Modify: `server/src/domain/criticalPath.ts` (`proposeReschedule`), `server/src/routes/schedule.ts` (`POST /api/tasks/:id/reschedule`), tabla de bitácora, matriz de acceso y `closedGuard.test.ts`
- Test: `server/tests/schedule.test.ts`, `server/tests/domain/criticalPath.test.ts`

**Interfaces:**
- Produces:
  - `proposeReschedule(rootId, tasks, dependencies): { id: string; from: { startDate; dueDate }; to: { startDate; dueDate } }[]`. Recorre las sucesoras directas e indirectas en orden topológico. A cada una la adelanta lo mínimo para cumplir todas sus restricciones con las fechas ya propuestas, conservando la duración, y nunca la mueve hacia atrás.
  - La ruta responde `{ changes: [...], applied: boolean }`. Con `apply: true` guarda y sube `version`.

- [x] **Step 1: Pruebas que fallan.**
  - A, B y C en cadena FS. Mover el fin de A 3 días después hace que la propuesta corra B 3 días.
    - **Review Focus 3:** C se mueve si choca con la B nueva y no se mueve si tenía holgura suficiente.
  - Una sucesora que ya cumple no aparece.
  - `apply: true` guarda las fechas, sube `version` y luego `GET /schedule` ya no tiene conflictos.
  - Si una fecha nueva supera el fin del proyecto, responde 409 `reschedule_outside` con los títulos y no cambia nada.
  - Un colaborador recibe 403; `closedGuard` cubre la ruta.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** La validación de fechas dentro del proyecto usa `isWithinProject`.
- [x] **Step 4: Correr la suite del servidor.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: reprogramar sucesoras con vista previa`.

### Task 11: Interfaz de dependencias y ruta crítica

**Files:**
- Modify:
  - `client/src/api/types.ts`: `predecessors` con `type` y `lagDays`; tipos `Schedule` y `RescheduleChange`.
  - `DependencyPicker.tsx`: tipo y desfase al añadir; editar el par «FS +2 d».
  - `Timeline.tsx` y `timelineLayout.ts`: barras críticas con `data-critical`, la leyenda «Ruta crítica» y la holgura en el tooltip.
  - `TaskDetail.tsx`:
    - la holgura y la insignia «Crítica»;
    - el texto del aviso `date_conflict`;
    - el botón «Reprogramar sucesoras» y su ventana con la tabla de cambios y «Aplicar».
  - `TaskForm.tsx`: tras guardar, si el detalle trae sucesoras en conflicto, el aviso «Hay sucesoras que ya no respetan sus dependencias».
- Test: `client/tests/criticalPath.test.tsx` (nuevo), `client/tests/timelineLayout.test.ts`, `client/tests/taskDetail.test.tsx`

- [x] **Step 1: Pruebas que fallan.**
  - **Dependencias:**
    - Añadir una predecesora con «Inicio a inicio» y desfase 2 envía `{ predecessorId, type: 'SS', lagDays: 2 }`.
    - La lista muestra «SS +2 d».
    - Editar envía el PATCH.
  - **Cronograma:**
    - Con `GET /schedule` que marca B como crítica, la barra de B tiene `data-critical` y se ve la leyenda «Ruta crítica».
    - El tooltip de C dice «Holgura: 3 d».
  - **Detalle:**
    - Una tarea crítica muestra «Crítica» y «Holgura: 0 d».
    - «Reprogramar sucesoras» pide la propuesta con `{ apply: false }`, muestra la tabla con fechas actuales y nuevas, y «Aplicar» envía `{ apply: true }`.
    - Un 409 `reschedule_outside` muestra su mensaje en la ventana.
  - **Después de guardar:** tras guardar la tarea con sucesoras en conflicto, aparece «Hay sucesoras que ya no respetan sus dependencias».
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** El detalle pide la propuesta con `apply: false` al cargar, solo para el PM; si hay cambios, muestra el botón.
- [x] **Step 4: Correr la suite del cliente y `npx tsc -b`.**
  Expected: PASS.
- [x] **Step 5: Commit** `feat: ruta crítica, tipos de dependencia y reprogramación en la interfaz`.

### Task 12: Flujo completo y cierre

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `docs/guia-implementacion-pmbok.md` (fila de la etapa 5: «F5 ✓, F6 ✓, F7 ✓, F8 ✓» y notas «Hecho»), este plan (casillas)

- [x] **Step 1: Pasos nuevos en el flujo.**
  - Carlos registra 2 h en «Construcción» desde su detalle y la sección muestra «2 h».
  - El PM abre el cronograma y ve la leyenda «Ruta crítica».
  - Si las horas cambian valores que el flujo comprueba (avance o costo real), se ajusta el valor esperado y se anota como ruling.
- [x] **Step 2: Correr todo.**
  Run: `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npm test`, luego `npm run build`, luego `TEST_DATABASE_URL=… npm run test:e2e`.
  Expected: todo PASS.
- [x] **Step 3: Actualizar la guía y marcar las casillas.**
- [x] **Step 4: Commit** `docs: marca la etapa 5 en la guía y el plan`.
