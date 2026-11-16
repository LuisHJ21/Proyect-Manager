# Etapa 8: pausa por prioridad, versiones del acta y lecciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El PM pausa un proyecto por prioridad de gerencia viendo a quién afecta, lo reanuda corriendo el cronograma de una vez, ve la carga del equipo por proyecto, guarda versiones del acta con vista imprimible y decide si las lecciones de un proyecto se comparten.

**Architecture:** Reglas puras nuevas en `server/src/domain/pause.ts` (corrimiento y días) y cambios en `domain/dashboard.ts`; rutas nuevas en `server/src/routes/projectPause.ts` y en `charter.ts`; dos tablas nuevas (`ProjectPause`, `CharterVersion`) y un campo (`Project.shareLessons`) en una migración. En el cliente, diálogos de pausa y reanudación en el encabezado del proyecto, desglose por proyecto en el panel, versiones e impresión en Acta.

**Tech Stack:** Hono, Prisma 6 + PostgreSQL, Zod (`@pm/shared`), React 19 + TanStack Query, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-etapa-8-pausa-acta-lecciones-design.md`

## Global Constraints

- Todo el texto de interfaz y de errores en español; errores con `AppError` / `fieldError` de `server/src/errors.ts`.
- Validación solo en `shared/src/schemas.ts`; las reglas que dependen del estado guardado van en la ruta.
- Fechas de planificación como texto `YYYY-MM-DD`; días corridos con `addDays`/`diffDays` de `@pm/shared`.
- Migración nueva `server/prisma/migrations/20261118090000_etapa_8/` generada con `prisma migrate diff`, más `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;` por cada tabla nueva. Nunca editar migraciones aplicadas.
- Toda ruta nueva entra en `ROUTE_SECTION` de `server/tests/accessMatrix.test.ts`, toda escritura nueva en la lista de `server/tests/closedGuard.test.ts` y en `server/src/activity/table.ts`.
- Pausar, reanudar, impacto, vista previa e historial de pausas: solo PM. Días de reanudación: entero de 0 a 365.
- Textos fijos: «Usa Pausar o Reanudar proyecto», «No comparten personas: este proyecto puede seguir avanzando», «En pausa desde el {fecha}: {motivo}», «Reanudación tras pausa: {motivo}», «Compartir lecciones en la biblioteca», «Versiones aprobadas», «Imprimir / Guardar PDF», «Borrador sin aprobar».
- Comandos de prueba del servidor con `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres`.
- Commits en español con prefijo, uno por tarea, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Reanudar dos veces seguidas (doble clic o dos pestañas) no debe correr el cronograma dos veces: el segundo intento responde 409 «El proyecto no está en pausa» (la transacción reclama el registro con `updateMany` sobre `resumedAt: null`). Prueba en Task 3.
2. Una tarea `IN_PROGRESS` cuyo fin corrido queda igual o después de su inicio nunca se invierte; una tarea hoja sin `dueDate` pero con `startDate` (o al revés) no se toca. Prueba en Task 2.
3. Un colaborador que no es miembro del proyecto prioritario no recibe su nombre ni su id en `GET /api/projects/:id`. Prueba en Task 3.
4. Editar un proyecto en pausa desde el formulario (cambiar el nombre) sigue funcionando: el formulario no envía `status` y el servidor acepta `status: 'PAUSED'` igual al actual como no-op. Prueba en Task 3 y Task 8.
5. Aprobar el acta dos veces con la misma `version` crea una sola `CharterVersion` (la segunda falla por conflicto de edición y la transacción no deja versión huérfana). Prueba en Task 6.

---

### Task 1: Modelo, esquemas y enumeraciones

**Files:**
- Modify: `server/prisma/schema.prisma`, `shared/src/enums.ts`, `shared/src/schemas.ts`, `shared/src/labels.ts` (o donde viva `LABELS`), `client/src/lib/activity.ts`
- Create: `server/prisma/migrations/20261118090000_etapa_8/migration.sql`, `shared/tests/stage8.test.ts`

**Interfaces:**
- Produces:
  - Prisma `ProjectPause { id, projectId, pausedOn String? (YYYY-MM-DD; null en registros creados al reanudar un proyecto pausado antes de esta etapa), reason String, priorityProjectId String? (onDelete SetNull), previousStatus String, pausedById String?, resumedOn String?, resumedById String?, shiftDays Int?, createdAt }`, `@@index([projectId])`.
  - Prisma `CharterVersion { id, projectId, number Int, content Json, approvedById String? (SetNull), approvedAt DateTime, createdAt }`, `@@unique([projectId, number])`.
  - `Project.shareLessons Boolean @default(true)`; `Project.lastCharterVersion Int @default(0)` (contador interno, se quita del DTO como los demás `last*`).
  - `ACTIVITY_ACTION` añade `'paused'` y `'resumed'`; `LABELS.activityAction.paused = 'pausó'`, `resumed = 'reanudó'` (mismo estilo que las existentes) y sus verbos en `client/src/lib/activity.ts`.
  - `pauseProjectSchema = { reason: texto obligatorio 1..500 (mensaje «Indica el motivo de la pausa»), priorityProjectId?: string }`.
  - `resumeProjectSchema = { days: entero 0..365 (mensaje «Usa un número de días entre 0 y 365»), createBaseline: boolean }`.
  - `resumeDaysQuery` para la vista previa: `days` opcional, mismo rango.
  - `createProjectSchema.status` deja de aceptar `PAUSED` con «Usa Pausar o Reanudar proyecto»; `updateProjectSchema` lo sigue aceptando (la ruta decide).
  - `shareLessons: z.boolean().optional()` en `createProjectSchema` y `updateProjectSchema`.

- [ ] **Step 1:** En `shared/tests/stage8.test.ts` escribe las pruebas: `pauseProjectSchema` rechaza motivo vacío con «Indica el motivo de la pausa»; `resumeProjectSchema` acepta `{days:0}` y `{days:365}`, rechaza `-1`, `366` y `1.5`; `createProjectSchema` rechaza `status:'PAUSED'` con «Usa Pausar o Reanudar proyecto»; `updateProjectSchema` acepta `shareLessons:false`; `ACTIVITY_ACTION` incluye `paused` y `resumed` y cada uno tiene etiqueta.
- [ ] **Step 2:** Run `npx vitest run tests/stage8.test.ts` (desde `shared/`). Expected: FAIL (esquemas no definidos).
- [ ] **Step 3:** Implementa esquemas, enumeraciones, etiquetas, modelos Prisma y la migración (diff contra el `schema.prisma` de `HEAD` + RLS para `ProjectPause` y `CharterVersion`). Quita `lastCharterVersion` en `toProjectDto`. Añade los verbos al cliente.
- [ ] **Step 4:** Run `npx vitest run` en `shared/`, `npx prisma migrate reset --force` contra la base de pruebas desde `server/`, y `npx vitest run tests/rls.test.ts tests/projects.test.ts` en `server/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: modelo de pausas, versiones del acta y lecciones compartidas`.

### Task 2: Reglas puras de la pausa

**Files:**
- Create: `server/src/domain/pause.ts`, `server/tests/domain/pause.test.ts`

**Interfaces:**
- Consumes: `addDays`, `diffDays` de `@pm/shared`; `weeklyLoad`, `weekStart` de `server/src/domain/workload.ts`.
- Produces:
  - `type ShiftTask = { id: string; title: string; status: string; startDate: string | null; dueDate: string | null }`
  - `type DateChange = { id: string; name: string; from: { startDate: string | null; dueDate: string | null }; to: { startDate: string | null; dueDate: string | null } }`
  - `planShift(input: { tasks: ShiftTask[]; milestones: { id: string; name: string; dueDate: string; status: string }[]; endDate: string | null }, days: number): { tasks: DateChange[]; milestones: { id: string; name: string; from: string; to: string }[]; endDate: { from: string; to: string } | null }` — `tasks` son solo hojas (quien llama filtra con `leafWhere`).
  - `proposedResumeDays(pausedOn: string | null, today: string): number` — `null` → 0; si no, `diffDays(pausedOn, today)` acotado a 0..365.
  - `pauseImpact(input: { members: { userId: string; name: string; projectIds: string[] }[]; tasks: (LoadTask & { projectId: string })[] }, projectId: string, priorityProjectId: string, today: string): { userId: string; name: string; hours: { projectId: string; total: number }[] }[]` — miembros de ambos proyectos; horas de la semana actual y las 3 siguientes con `weeklyLoad`, redondeadas a 1 decimal, por proyecto.

- [ ] **Step 1:** Pruebas en `server/tests/domain/pause.test.ts`:
  - `planShift` con 10 días: `TODO` 2026-11-01→2026-11-05 pasa a 2026-11-11→2026-11-15; `BLOCKED` igual; `IN_PROGRESS` 2026-11-01→2026-11-05 queda 2026-11-01→2026-11-15; `DONE` no aparece; tarea con solo `startDate` o solo `dueDate` no aparece; hito `PENDING` 2026-11-20 → 2026-11-30; hito `REACHED` no aparece; `endDate` 2026-12-31 → 2027-01-10; `endDate: null` → `endDate: null`.
  - `planShift` con 0 días devuelve listas vacías y `endDate: null`.
  - `proposedResumeDays('2026-11-01','2026-11-16')` = 15; `(null, …)` = 0; `('2026-11-20','2026-11-16')` = 0; `('2024-01-01','2026-11-16')` = 365.
  - `pauseImpact`: dos miembros, uno solo en el proyecto A → solo devuelve al compartido; sus horas por proyecto suman las de sus tareas asignadas en las 4 semanas; sin compartidos devuelve `[]`.
- [ ] **Step 2:** Run `npx vitest run tests/domain/pause.test.ts` (desde `server/`). Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementa las tres funciones en `server/src/domain/pause.ts`.
- [ ] **Step 4:** Run el mismo comando. Expected: PASS.
- [ ] **Step 5:** Commit `feat: reglas de corrimiento del cronograma y de impacto de una pausa`.

### Task 3: Rutas de pausa y reanudación

**Files:**
- Create: `server/src/routes/projectPause.ts`, `server/tests/projectPause.test.ts`
- Modify: `server/src/app.ts` (registrar rutas), `server/src/routes/projects.ts` (regla de `status` en PATCH; `activePause` en `GET /api/projects/:id`), `server/src/activity/table.ts`, `server/tests/accessMatrix.test.ts`, `server/tests/closedGuard.test.ts`

**Interfaces:**
- Consumes: Task 1 esquemas y modelos; Task 2 `planShift`, `proposedResumeDays`, `pauseImpact`; `createBaseline(tx, project, userId, { reason, changeRequestId: null })` de `routes/performance.ts`; `leafWhere`.
- Produces (todas con sección `project`; las GET en `PM_ONLY_READS`):
  - `GET /api/projects/:id/pause-impact?priorityProjectId=` → `{ shared: ReturnType<typeof pauseImpact> }`. Proyecto prioritario inexistente, cerrado o igual al propio → `fieldError('priorityProjectId', 'Elige otro proyecto activo')`.
  - `POST /api/projects/:id/pause` body `pauseProjectSchema` → proyecto DTO. Estado distinto de `PLANNING`/`EXECUTING` → `AppError(409, 'not_pausable', 'El proyecto ya está en pausa')`. Crea `ProjectPause` con `pausedOn: today`, `previousStatus`. Actividad `project({ action: 'paused' })`.
  - `GET /api/projects/:id/resume-preview?days=` → `{ proposedDays: number; days: number; changes: ReturnType<typeof planShift>; hasBaseline: boolean }` (sin `days` usa `proposedDays`). No pausado → 409 `not_paused` «El proyecto no está en pausa».
  - `POST /api/projects/:id/resume` body `resumeProjectSchema` → proyecto DTO. En una transacción: reclama el registro abierto con `updateMany({ where: { projectId, resumedOn: null }, data: { resumedOn: today, resumedById, shiftDays } })`; si `count === 0` y el proyecto no está en `PAUSED` → 409 `not_paused`; si está en `PAUSED` sin registro, lo crea ya cerrado (`pausedOn: null`, `reason: ''`, `previousStatus: 'EXECUTING'`). Aplica `planShift` (tareas con `version: { increment: 1 }`), mueve `endDate`, devuelve el estado a `previousStatus` y, si `createBaseline` y hay línea base, llama a `createBaseline` con motivo `Reanudación tras pausa: {reason}`. Actividad `project({ action: 'resumed' })`.
  - `GET /api/projects/:id/pauses` → `{ pausedOn, resumedOn, reason, shiftDays, priorityProject: { id, name } | null }[]`, más recientes primero.
  - `GET /api/projects/:id` añade `activePause: { pausedOn: string | null; reason: string; priorityProject: { id: string; name: string } | null } | null`; `priorityProject` es `null` si quien pide no es PM ni miembro de ese proyecto.
  - PATCH: `input.status === 'PAUSED'` con proyecto no pausado, o `input.status` distinto de `PAUSED` con proyecto pausado → `fieldError('status', 'Usa Pausar o Reanudar proyecto')`; `PAUSED` igual al actual es no-op.

- [ ] **Step 1:** Pruebas en `server/tests/projectPause.test.ts` (con los ayudantes de `server/tests/helpers/`):
  - PM pausa un proyecto en `EXECUTING` → 200, `status: 'PAUSED'`, `activePause.reason`; pausar otra vez → 409 «El proyecto ya está en pausa».
  - Colaborador → 403 en las cinco rutas.
  - `pause-impact` con un miembro compartido devuelve sus horas; sin compartidos `shared: []`; prioritario = propio → 400 en `priorityProjectId`.
  - `resume-preview` con `pausedOn` hace 15 días (fijar `deps.today`) → `proposedDays: 15`; `?days=3` → cambios de 3 días.
  - `resume` con `days: 10, createBaseline: true` en un proyecto con línea base: tareas `TODO`/`IN_PROGRESS`/`DONE` según la regla, hito y fin del proyecto movidos, estado vuelve a `EXECUTING`, hay una línea base nueva con el motivo «Reanudación tras pausa: …», el historial muestra `shiftDays: 10`.
  - Review Focus 1: dos `resume` seguidos → el segundo 409 «El proyecto no está en pausa» y las fechas solo se movieron una vez.
  - Proyecto en `PAUSED` sin registro (creado directo en base): `resume-preview` → `proposedDays: 0`; `resume` con `days: 0` → `EXECUTING` y un registro con `pausedOn: null`.
  - Review Focus 3: colaborador miembro del proyecto pausado pero no del prioritario recibe `activePause.priorityProject: null`.
  - Review Focus 4: PATCH `{ name: 'Nuevo', status: 'PAUSED' }` sobre un pausado → 200; PATCH `{ status: 'EXECUTING' }` sobre un pausado → 400 «Usa Pausar o Reanudar proyecto»; PATCH `{ status: 'PAUSED' }` sobre uno en ejecución → 400 igual.
  - Pausar un proyecto cerrado → error de proyecto cerrado (lo cubre `closedGuard`).
- [ ] **Step 2:** Run `npx vitest run tests/projectPause.test.ts`. Expected: FAIL (rutas 404).
- [ ] **Step 3:** Implementa las rutas y los cambios en `projects.ts`; añade las cinco rutas a `ROUTE_SECTION`, las GET a `PM_ONLY_READS`, las POST a `closedGuard.test.ts` y a `activity/table.ts`.
- [ ] **Step 4:** Run `npx vitest run tests/projectPause.test.ts tests/accessMatrix.test.ts tests/closedGuard.test.ts tests/activityCoverage.test.ts tests/projects.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: pausar y reanudar un proyecto con corrimiento del cronograma`.

### Task 4: Tarea diaria sin proyectos en pausa

**Files:**
- Modify: `server/src/jobs/daily.ts`
- Test: `server/tests/daily.test.ts` (o `notifyDaily.test.ts` para los avisos)

**Interfaces:**
- Consumes: estados de `PROJECT_STATUS`.

- [ ] **Step 1:** Pruebas: con un proyecto en `PAUSED` que tiene una tarea que vence mañana, otra vencida ayer, línea base e hitos pendientes, la tarea diaria no crea avisos `TASK_DUE_SOON`/`TASK_OVERDUE` para ese proyecto, no guarda `EvmSnapshot` ni `MilestoneForecast` suyos, y sí lo hace para un proyecto en `EXECUTING` igual.
- [ ] **Step 2:** Run `npx vitest run tests/daily.test.ts tests/notifyDaily.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Excluye `PAUSED` en las tres consultas de `daily.ts` (avisos, fotos y pronósticos).
- [ ] **Step 4:** Run el mismo comando. Expected: PASS.
- [ ] **Step 5:** Commit `feat: la tarea diaria no avisa ni mide proyectos en pausa`.

### Task 5: Carga del panel por proyecto

**Files:**
- Modify: `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts`
- Test: `server/tests/domain/dashboard.test.ts` (o el archivo de dominio existente del panel), `server/tests/dashboard.test.ts`

**Interfaces:**
- Produces: `DashboardInput.capacities` pasa a `{ userId: string; projectId: string; hours: number }[]`. Cada semana de `workload[].weeks[]` añade `byProject: { projectId: string; name: string; hours: number }[]` (solo proyectos con horas > 0, ordenados por horas desc, 1 decimal). Tareas y capacidades de proyectos en `PAUSED` no cuentan en `weeks` ni en `byProject`; el resto del panel (salud, atención, totales) no cambia.

- [ ] **Step 1:** Pruebas de dominio: una persona con 10 h en el proyecto A y 6 h en el B en la misma semana → `assignedHours: 16`, `byProject` `[A 10, B 6]`; con B en `PAUSED` → `assignedHours: 10`, `byProject` `[A 10]` y su capacidad en B no suma a `capacityHours`. Prueba de ruta: el panel del PM incluye `byProject` con nombres.
- [ ] **Step 2:** Run `npx vitest run tests/domain/dashboard.test.ts tests/dashboard.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementa: calcula `weeklyLoad` por proyecto (o agrega por proyecto) excluyendo pausados; la ruta pasa `projectId` en `capacities`.
- [ ] **Step 4:** Run el mismo comando. Expected: PASS.
- [ ] **Step 5:** Commit `feat: carga semanal desglosada por proyecto y sin proyectos en pausa`.

### Task 6: Versiones del acta en el servidor

**Files:**
- Modify: `server/src/routes/charter.ts`, `server/tests/accessMatrix.test.ts`
- Test: `server/tests/charterVersions.test.ts`

**Interfaces:**
- Produces:
  - La aprobación corre en `prisma.$transaction`: el `updateMany` con `version`, luego incrementa `Project.lastCharterVersion` y crea `CharterVersion { number, content, approvedById, approvedAt }`.
  - `content = { sponsor, ...cada campo de CHARTER_RICH_FIELDS, objectives: { description, metric, target, status }[], milestones: { name, dueDate, status }[] }` (hitos por fecha).
  - `GET /api/projects/:id/charter/versions` → `{ number, approvedAt, approvedBy: { id, name } | null }[]` desc; `GET /api/projects/:id/charter/versions/:number` → `{ number, approvedAt, approvedBy, content }`; inexistente → 404 «Versión no encontrada». Sección `planning`, lectura.

- [ ] **Step 1:** Pruebas: aprobar crea la versión 1 con el contenido, los objetivos y los hitos; editar y aprobar de nuevo crea la 2 y la 1 no cambia; el observador lista y lee versiones; `GET …/versions/9` → 404; Review Focus 5: dos aprobaciones con la misma `version` → la segunda 409 y solo existe una versión.
- [ ] **Step 2:** Run `npx vitest run tests/charterVersions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementa y añade las dos GET a `ROUTE_SECTION` con `planning`.
- [ ] **Step 4:** Run `npx vitest run tests/charterVersions.test.ts tests/charter.test.ts tests/accessMatrix.test.ts tests/observerReads.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: versión congelada del acta en cada aprobación`.

### Task 7: Lecciones compartidas (servidor y formulario)

**Files:**
- Modify: `server/src/routes/lessons.ts`, `client/src/components/project/ProjectForm.tsx`, tipos del proyecto en el cliente
- Test: `server/tests/lessons.test.ts`, `client/tests/lessons.test.tsx`

**Interfaces:**
- Produces: `GET /api/lessons` filtra: PM sin filtro de pertenencia; observador como hoy; colaborador `OR: [{ project: { members: { some: { userId } } } }, { project: { shareLessons: true } }]`. `Project.shareLessons` viaja en el DTO a todos. Casilla «Compartir lecciones en la biblioteca» en el formulario, solo PM.

- [ ] **Step 1:** Pruebas de servidor: un colaborador ajeno a un proyecto con `shareLessons: false` no ve sus lecciones en `/api/lessons`; un miembro de ese proyecto sí; el PM sí; con `shareLessons: true` el ajeno sí. Prueba de cliente: el formulario del PM muestra la casilla marcada por defecto y envía `shareLessons: false` al desmarcarla.
- [ ] **Step 2:** Run `npx vitest run tests/lessons.test.ts` (servidor) y `npx vitest run tests/lessons.test.tsx` (cliente). Expected: FAIL.
- [ ] **Step 3:** Implementa el filtro y la casilla.
- [ ] **Step 4:** Run los mismos comandos. Expected: PASS.
- [ ] **Step 5:** Commit `feat: opción para compartir las lecciones de un proyecto en la biblioteca`.

### Task 8: Pausa y reanudación en la interfaz

**Files:**
- Create: `client/src/components/project/PauseDialog.tsx`, `client/src/components/project/ResumeDialog.tsx`, `client/tests/projectPause.test.tsx`
- Modify: `client/src/pages/project/ProjectLayout.tsx`, `client/src/components/project/ProjectForm.tsx`, `client/src/pages/project/Summary.tsx`, tipos del proyecto

**Interfaces:**
- Consumes: rutas de Task 3; `GET /api/projects` para la lista de proyectos prioritarios (activos, sin el propio).
- Produces:
  - PM, proyecto `PLANNING`/`EXECUTING`: botón «Pausar proyecto» en el encabezado. Diálogo con motivo, selector «Proyecto que pasa a tener prioridad» (opcional) y, al elegirlo, la lista de impacto por persona («{nombre}: {h} h aquí · {h} h en {prioritario}» en las próximas 4 semanas) o «No comparten personas: este proyecto puede seguir avanzando».
  - Proyecto `PAUSED`: barra `role="status"` «En pausa desde el {fecha}: {motivo}» (más «· prioridad: {nombre}» si llega) para todos; para el PM, botón «Reanudar proyecto». Diálogo con campo «Días a correr» (propuesto), vista previa (tareas, hitos y fin: antes → después, totales), casilla «Crear una nueva línea base» marcada si `hasBaseline`, y «Reanudar».
  - `ProjectForm`: estado solo ofrece `PLANNING`/`EXECUTING`; con proyecto pausado muestra «En pausa · usa Reanudar proyecto» y no envía `status`.
  - `Summary`: sección «Pausas» para el PM con el historial (fecha, motivo, prioritario, días aplicados), oculta si está vacío.

- [ ] **Step 1:** Pruebas en `client/tests/projectPause.test.tsx` con `mockApi`: el PM pausa con motivo y ve el impacto de un miembro compartido y el texto sin compartidos; el colaborador ve la barra «En pausa desde el …» sin botón; el PM abre «Reanudar proyecto», ve los días propuestos y la vista previa, cambia a 3 días y se vuelve a pedir la vista previa con `days=3`, y al confirmar envía `{ days: 3, createBaseline: true }`; Review Focus 4: editar el nombre de un proyecto pausado no envía `status`.
- [ ] **Step 2:** Run `npx vitest run tests/projectPause.test.tsx` (desde `client/`). Expected: FAIL.
- [ ] **Step 3:** Implementa los diálogos, la barra, el formulario y la sección del Resumen.
- [ ] **Step 4:** Run `npx vitest run` y `npx tsc -b` en `client/`. Expected: PASS y sin errores de tipos.
- [ ] **Step 5:** Commit `feat: pausar y reanudar un proyecto desde la interfaz`.

### Task 9: Desglose de carga en el panel

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Test: `client/tests/dashboard.test.tsx`

- [ ] **Step 1:** Prueba: una semana con `byProject` `[Portal 10, Obra 6]` muestra «Portal 10 h» y «Obra 6 h» dentro de la semana de esa persona.
- [ ] **Step 2:** Run `npx vitest run tests/dashboard.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Muestra el desglose bajo `{asignadas} / {capacidad}` en cada semana.
- [ ] **Step 4:** Run el mismo comando. Expected: PASS.
- [ ] **Step 5:** Commit `feat: carga semanal por proyecto en el panel`.

### Task 10: Versiones e impresión del acta en la interfaz

**Files:**
- Create: `client/src/components/charter/CharterVersions.tsx`, `client/src/components/charter/CharterPrint.tsx`
- Modify: `client/src/pages/project/Charter.tsx`
- Test: `client/tests/charterVersions.test.tsx`

**Interfaces:**
- Consumes: rutas de Task 6.
- Produces: sección «Versiones aprobadas» (número, fecha, aprobador) en Acta; al abrir una versión, diálogo de solo lectura con su contenido, objetivos e hitos y botón «Imprimir / Guardar PDF». Botón «Imprimir / Guardar PDF» en el acta actual. La vista impresa (`CharterPrint`) muestra el nombre del proyecto y «Versión N · aprobada el {fecha} por {nombre}» o «Borrador sin aprobar»; lo demás de la página lleva `data-print-hide`, como en `Closure.tsx`.

- [ ] **Step 1:** Pruebas: con dos versiones se listan «Versión 2» y «Versión 1»; abrir la 1 muestra su contenido congelado distinto del actual; el botón de imprimir llama a `window.print` (espía); sin versiones no aparece la sección; un acta en borrador imprime «Borrador sin aprobar».
- [ ] **Step 2:** Run `npx vitest run tests/charterVersions.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implementa los componentes y la integración en `Charter.tsx`.
- [ ] **Step 4:** Run `npx vitest run` y `npx tsc -b` en `client/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: versiones aprobadas e impresión del acta`.

### Task 11: Flujo completo y guía

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `docs/guia-implementacion-pmbok.md`

- [ ] **Step 1:** Añade al flujo principal un paso de etapa 8: el PM aprueba el acta y ve «Versión 1» en «Versiones aprobadas»; pausa el proyecto con motivo «Prioridad de gerencia» y ve «En pausa desde el …»; reanuda con 2 días y la vista previa muestra los cambios; tras reanudar desaparece la barra de pausa.
- [ ] **Step 2:** Run `npm run build` y `TEST_DATABASE_URL=… npm run test:e2e`. Expected: FAIL en el paso nuevo antes de terminar la UI si algo falta; tras ajustarlo, PASS 1/1.
- [ ] **Step 3:** Guía: F14 «Descartada (2026-11-16): no se necesita»; F17 sustituida por esta etapa (plantillas, fases y modo ágil descartados, con el motivo) y «Hecho» con la referencia a la especificación; F18 y C13 «Hecho»; fila 8 del orden recomendado con ✓.
- [ ] **Step 4:** Run `TEST_DATABASE_URL=… npm test` en la raíz. Expected: shared, server y client PASS.
- [ ] **Step 5:** Commit `test: flujo de pausa y versiones del acta; etapa 8 completa en la guía`.
