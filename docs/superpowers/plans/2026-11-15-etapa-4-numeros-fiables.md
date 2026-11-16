# Etapa 4: números fiables — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dejar fiables el avance, el valor ganado, los hitos, los textos y la aplicación de cambios aprobados (C6 a C10 de la guía).

**Architecture:** las reglas nuevas son funciones puras en `server/src/domain/` con su prueba. Las rutas existentes las usan. Hay una sola migración, para C8 (`appliedAt`, `appliedById`). La interfaz solo muestra lo que la API ya calcula.

**Tech Stack:** Hono, Prisma 6 sobre PostgreSQL, Zod en `shared`, React 19 con TanStack Query, Vitest y Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-etapa-4-numeros-fiables-design.md`

## Global Constraints

- **Rama y commits:** rama `etapa-4`, un commit por tarea. Mensajes en español con prefijo (`feat:`, `fix:`, `test:`, `docs:`), terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas del servidor:** se corren desde `server/` con `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`.
- **Pruebas de cliente y shared:** `npx vitest run <archivo>` desde `client/` o `shared/`. En el cliente, también `npx tsc -b`.
- **Errores:** con `AppError` o `fieldError` de `server/src/errors.ts`, mensajes en español.
- **Validación:** solo en `shared/src/schemas.ts`. El cliente no repite reglas.
- **Costos:** costos, presupuesto, impactos de cambios y gasto fuera de línea base nunca salen hacia un colaborador u observador.
- **Proyecto cerrado:** toda ruta nueva de escritura queda cubierta por `closedGuard` y aparece en `server/tests/closedGuard.test.ts`.
- **Migraciones:** una migración nueva; no se edita ninguna aplicada.
- **Mensajes exactos:**
  - «Máximo 200 caracteres»
  - «Máximo 20 000 caracteres»
  - «Máximo 5 000 caracteres»
  - «Solo se aplica un cambio aprobado»
  - «Estimación: aún no hay avance que permita proyectar el costo»
  - «De este costo real, X no está ligado a tareas de la línea base»
  - «Listo para marcar como alcanzado»
  - «1 hito quedaría fuera del proyecto. Ajusta su fecha primero.», y en plural «N hitos quedarían fuera del proyecto. Ajusta sus fechas primero.»
  - Etiqueta del estado nuevo: «Aplicada».

## Review Focus

1. **Aplicar dos veces a la vez.** Dos clics rápidos en «Aplicar» no deben sumar el impacto dos veces ni crear dos líneas base. Se prueba en la Task 6 con dos peticiones en paralelo: una responde 200 y la otra 409.
2. **Ponderación con costo 0 en una sola tarea.** Si a una tarea le falta el costo, todo el proyecto pasa a ponderarse por duración, nunca se mezclan los dos pesos. Se prueba en la Task 4.
3. **Fechas al revés en una tarea.** Una tarea con `dueDate` anterior a `startDate` no debe pesar 0 ni un número negativo: pesa 1 día. Se prueba en la Task 4.
4. **Un gasto con fecha futura** no cuenta ni en el costo real ni en `outsideBaselineCostCents`. Se prueba en la Task 5.
5. **Aplicar acortando la fecha de fin** cuando hay tareas o hitos que quedarían fuera: se rechaza con el mismo error de la edición del proyecto y no cambia nada. Se prueba en la Task 6.

---

### Task 1: C10 — límites de longitud

**Files:**
- Modify: `shared/src/schemas.ts`
- Test: `shared/tests/schemas.test.ts`, `server/tests/registers.test.ts`, `server/tests/tasks.test.ts`

**Interfaces:**
- Produces: en `shared/src/schemas.ts`, `shortText`, `longText` y `noteText`. Cada uno es una función con un mensaje opcional de campo obligatorio, o un `z.string()` con su `.max()`; el constructor elige la forma, siempre que el mensaje de máximo sea el de Global Constraints. Las tareas 6 y 7 usan `noteText` para `reason`.

Campos por grupo. Se aplica a la versión de creación y a la de edición de cada esquema:

- **200:** nombres de usuario (`setupSchema`, `createUserSchema`, `updateUserSchema`); `name` del proyecto; `projectRole` del miembro; `sponsor` del acta; `metric` y `target` del objetivo; `name` del hito; `name`, `organization`, `position` y `contact` del interesado; `description` del gasto; `title` de tarea, paso, solicitud de cambio, propuesta, incidente y decisión; `requestedBy` de la solicitud; `decidedBy` de la decisión.
- **20 000:** `description` del proyecto; `justification`, `scopeIncluded`, `scopeExcluded`, `boundaries`, `assumptions`, `constraints` y `successCriteria` del acta; `description` del objetivo; `strategy` del interesado; `description` y `responsePlan` del riesgo; `description` de la tarea; `description` y `scopeImpact` de la solicitud; `description` de la propuesta; `description` y `resolution` del incidente; `rationale` de la decisión; `description` del entregable; `summary` y `pendingReason` del cierre.
- **5 000:** `body` del comentario; `note` de la decisión de un cambio; `note` de la revisión de un entregable; `reason` de la línea base; `reason` de reabrir.

Los máximos que ya existen (entregable, criterio y lección) no cambian.

- [x] **Step 1: Escribir las pruebas que fallan** en `shared/tests/schemas.test.ts`, bloque `describe('límites de longitud')`:
  - `updateTaskSchema` acepta un `title` de 200 caracteres y rechaza uno de 201 con «Máximo 200 caracteres».
  - `charterSchema` acepta `justification` de 20 000 y rechaza 20 001 con «Máximo 20 000 caracteres».
  - `commentSchema` acepta un `body` de 5 000 y rechaza 5 001 con «Máximo 5 000 caracteres».
- [x] **Step 2: Agregar las pruebas de ruta:**
  - `server/tests/tasks.test.ts`: `POST /api/tasks/:id/comments` con un cuerpo de 5 001 caracteres responde 400 en `fields.body`.
  - `server/tests/registers.test.ts`: `POST /api/projects/:id/milestones` con un `name` de 201 caracteres responde 400 en `fields.name`.
- [x] **Step 3: Correr y ver que fallan.**
  Run: `npx vitest run tests/schemas.test.ts` desde `shared/`, y las dos pruebas nuevas del servidor.
  Expected: FAIL, porque hoy se aceptan.
- [x] **Step 4: Implementar** los tres helpers y aplicarlos a los campos listados.
- [x] **Step 5: Correr las suites completas** de `shared` y `server`.
  Expected: todo PASS. Si una prueba existente usa un texto más largo que el nuevo límite, se acorta el dato de esa prueba y se anota como ruling.
- [x] **Step 6: Commit** `feat: límites de longitud en títulos, textos largos y comentarios`.

### Task 2: C9 — fechas de los hitos dentro del proyecto

**Files:**
- Modify: `server/src/routes/registers.ts` (opción `validate` del registro `milestones`), `server/src/routes/projects.ts` (`assertTasksStayInside`)
- Test: `server/tests/registers.test.ts`, `server/tests/projects.test.ts`

**Interfaces:**
- Consumes: `isWithinProject`, `outsideProjectMessage` y `formatRange` de `server/src/domain/projectDates.ts`.
- Produces: `assertDatesStayInside(prisma, project, changed)` en `projects.ts`. Es el nuevo nombre de `assertTasksStayInside`, y ahora comprueba tareas e hitos. Se exporta para que la Task 6 la use al aplicar un cambio, junto con la comprobación de `isDateOrderValid`.

- [x] **Step 1: Escribir las pruebas que fallan.**
  - En `registers.test.ts`, con un proyecto de `2026-01-01` a `2026-06-30`:
    - crear un hito con `dueDate: '2026-07-01'` responde 400 en `fields.dueDate` con el mensaje `La fecha debe estar dentro del proyecto (2026-01-01 a 2026-06-30)`;
    - editar un hito existente a `2025-12-31` responde lo mismo;
    - en un proyecto sin fechas, un hito con `2030-01-01` responde 201.
  - En `projects.test.ts`:
    - con un hito pendiente en `2026-06-15`, cambiar `endDate` a `2026-06-10` responde 400 en `fields.endDate` con «1 hito quedaría fuera del proyecto. Ajusta su fecha primero.»;
    - un hito que ya estaba fuera no impide editar, igual que con las tareas.
- [x] **Step 2: Correr y ver que fallan.**
  Run: `TEST_DATABASE_URL=… npx vitest run tests/registers.test.ts tests/projects.test.ts`
  Expected: FAIL en las pruebas nuevas.
- [x] **Step 3: Implementar.**
  - En el registro de hitos, `validate` comprueba `merged.dueDate` con `isWithinProject` y lanza `fieldError('dueDate', outsideProjectMessage(project))`.
  - `assertDatesStayInside` revisa primero las tareas, con el mensaje de siempre, y luego los hitos, con los mensajes de Global Constraints.
- [x] **Step 4: Correr de nuevo.**
  Expected: PASS, y la suite del servidor completa en verde.
- [x] **Step 5: Commit** `fix: la fecha de un hito queda dentro del proyecto`.

### Task 3: C9 — sugerencia de «Alcanzado»

**Files:**
- Create: `server/src/domain/milestones.ts`
- Modify: `server/src/routes/registers.ts` (`include` y `toDto` del registro de hitos), `client/src/api/types.ts` (`Milestone.readyToReach: boolean`), `client/src/components/project/PlanningPanels.tsx` (`MilestonesPanel`)
- Test: `server/tests/domain/milestones.test.ts`, `server/tests/registers.test.ts`, `client/tests/objectives.test.tsx` (o el archivo de cliente donde ya se prueban los paneles de planificación)

**Interfaces:**
- Produces: `isReadyToReach(m: { status: string; tasks: { status: string }[]; deliverables: { status: string }[] }): boolean`.
- El DTO del hito suma `readyToReach: boolean` y no expone `tasks` ni `deliverables`.

- [x] **Step 1: Escribir las pruebas puras.** `isReadyToReach` da:
  - `false` sin tareas ni entregables;
  - `false` con una tarea `IN_PROGRESS`;
  - `false` con un entregable `REJECTED`;
  - `true` con tareas `DONE` y entregables `ACCEPTED`;
  - `true` con solo tareas `DONE`;
  - `false` si el hito ya está `REACHED`.
- [x] **Step 2: Escribir la prueba de ruta.** `GET /api/projects/:id/milestones` devuelve `readyToReach: true` para un hito con su única tarea en `DONE`, y las claves del objeto no incluyen `tasks` ni `deliverables`.
- [x] **Step 3: Escribir la prueba de cliente.** Con un hito `readyToReach: true`, el panel muestra «Listo para marcar como alcanzado»; con `false`, no lo muestra.
- [x] **Step 4: Correr y ver que fallan.**
- [x] **Step 5: Implementar.**
  - `include: { tasks: { select: { status: true } }, deliverables: { select: { status: true } } }`.
  - `toDto` quita las dos relaciones y añade `readyToReach`.
  - En el panel, el aviso va dentro de la celda de Estado, bajo el `Badge`, como texto secundario.
- [x] **Step 6: Correr** las suites de servidor y cliente, y `npx tsc -b`.
  Expected: PASS.
- [x] **Step 7: Commit** `feat: sugerir marcar un hito como alcanzado`.

### Task 4: C7 — avance ponderado

**Files:**
- Modify: `server/src/domain/indicators.ts`, `server/src/domain/health.ts`, `server/src/routes/indicators.ts`, `server/src/routes/projectStats.ts`, `server/src/routes/dashboard.ts` y su tipo `DashboardInput` en `server/src/domain/dashboard.ts`, `server/src/routes/projects.ts` (lista)
- Test: `server/tests/domain/indicators.test.ts` (crear si no existe; si ya hay pruebas puras de `averageProgress`, ampliarlas donde estén), `server/tests/indicators.test.ts`, `server/tests/projectsList.test.ts`, `server/tests/dashboard.test.ts`

**Interfaces:**
- Produces: `type ProgressTask = { progress: number; plannedCostCents: number; startDate: string | null; dueDate: string | null }` y `weightedProgress(tasks: ProgressTask[]): number`. Reemplaza a `averageProgress`, que se elimina.
- `SummaryTask` y `IndicatorsInput.tasks` añaden `plannedCostCents: number`, `startDate: string | null` y `dueDate: string | null`. Los costos llegan como `number`, convertidos desde `BigInt` en la ruta.

Regla, copiada de la especificación:

- si todas las tareas tienen costo mayor que 0, peso = costo;
- si no, peso = días entre `startDate` y `dueDate` contando ambos, o 1 si falta una fecha o están al revés;
- sin tareas, 0;
- el resultado se redondea a entero.

- [x] **Step 1: Escribir las pruebas puras.**
  - Costos 100 y 300 con avances 100 y 0 dan `25`.
  - Mismos avances, una tarea de 1 día y otra de 3 días, sin costo, dan `25`.
  - Costos 100 y 0, una tarea de 1 día al 100 % y otra de 3 días al 0 %, dan `25`: se usa duración porque falta un costo.
  - Sin fechas, dos tareas al 100 % y al 0 % dan `50`.
  - Una tarea con `dueDate < startDate` pesa 1.
  - `[]` da `0`.
- [x] **Step 2: Escribir las pruebas de ruta.** Proyecto con una tarea de costo 10 000 al 100 % y otra de costo 30 000 al 0 %:
  - `GET /api/projects/:id/indicators` da `progress: 25`, también para un colaborador miembro;
  - `GET /api/projects` da `progress: 25` para el PM y para el colaborador;
  - `GET /api/dashboard` da `progress: 25` en ese proyecto.
- [x] **Step 3: Correr y ver que fallan** (hoy dan 50).
- [x] **Step 4: Implementar.**
  - `weightedProgress` usa `diffDays` de `@pm/shared`.
  - Los cuatro lugares consultan `plannedCostCents`, `startDate` y `dueDate` de cada tarea.
  - La lista de proyectos deja de usar `groupBy` y calcula con una sola consulta de tareas para todos los proyectos visibles.
- [x] **Step 5: Correr** la suite del servidor completa, incluidas `accessMatrix` y las de lo que no ve el colaborador.
  Expected: PASS. Si una prueba existente esperaba el promedio simple, se ajusta su valor esperado y se anota como ruling.
- [x] **Step 6: Commit** `fix: el avance del proyecto se pondera por costo o duración`.

### Task 5: C6 — valor ganado

**Files:**
- Modify: `server/src/domain/evm.ts`, `server/src/routes/performance.ts`, `client/src/api/types.ts`, `client/src/components/performance/MetricCards.tsx`, `client/src/pages/project/Performance.tsx`
- Test: `server/tests/domain/evm.test.ts` (o donde estén hoy las pruebas puras de `computeEvm`), `server/tests/performance.test.ts`, `client/tests/performance.test.tsx`

**Interfaces:**
- Produces:
  - `EvmMetrics.eacMethod: 'CPI' | 'ATYPICAL' | 'BUDGET'`.
  - `computeEvm(...)` devuelve además `outsideBaselineCostCents: number`.
  - La respuesta de `GET /performance` incluye `outsideBaselineCostCents`.
  - En el cliente, `PerformanceMetrics.eacMethod` y `PerformanceData.outsideBaselineCostCents`; los nombres exactos se toman de `client/src/api/types.ts`.

- [x] **Step 1: Escribir las pruebas puras.**
  - BAC 1 000, EV 500 y AC 1 000: `eacCents 2000`, `eacMethod 'CPI'`.
  - BAC 1 000, EV 0 y AC 300: `eacCents 1300`, `eacMethod 'ATYPICAL'`, `etcCents 1000` y `vacCents -300`.
  - BAC 1 000 sin gastos: `eacCents 1000`, `eacMethod 'BUDGET'`.
  - Gastos de 100 sin tarea, de 200 en una tarea fuera de la línea base, de 50 en una tarea de la línea base y de 400 en una fecha posterior a hoy dan `outsideBaselineCostCents 300` y `acCents 350`.
- [x] **Step 2: Escribir las pruebas de ruta.**
  - `GET /performance` no crea filas en `EvmSnapshot`: `count` antes y después es 0.
  - La serie trae un punto con `date === today` cuyos `evCents` y `acCents` son las métricas de hoy, aunque no haya foto.
- [x] **Step 3: Escribir las pruebas de cliente.**
  - Con `eacMethod 'ATYPICAL'` se ve «Estimación: aún no hay avance que permita proyectar el costo».
  - Con `outsideBaselineCostCents > 0` se ve «De este costo real, <monto> no está ligado a tareas de la línea base», con el monto formateado con `money()`.
  - Con 0, esa línea no aparece.
- [x] **Step 4: Correr y ver que fallan.**
- [x] **Step 5: Implementar.**
  - Quitar `saveEvmSnapshot` del GET.
  - Al armar la serie, el punto de `today` usa `metrics.evCents` y `metrics.acCents`.
  - `saveEvmSnapshot` y la tarea diaria no cambian; `server/tests/daily.test.ts` debe seguir pasando.
- [x] **Step 6: Correr** las suites de servidor y cliente, y `npx tsc -b`.
  Expected: PASS.
- [x] **Step 7: Commit** `fix: valor ganado sin escrituras al leer, EAC atípico y gasto fuera de línea base`.

### Task 6: C8 — aplicar un cambio aprobado (servidor)

**Files:**
- Create: `server/prisma/migrations/20261115160000_change_applied/migration.sql`
- Modify:
  - `server/prisma/schema.prisma`: en `ChangeRequest`, `appliedAt DateTime?`, `appliedById String?` y `appliedBy User? @relation("ChangeApplier", fields: [appliedById], references: [id], onDelete: SetNull)`; en `User`, la relación inversa.
  - `shared/src/enums.ts`: `CHANGE_STATUS` suma `'APPLIED'`, y `LABELS.changeStatus.APPLIED = 'Aplicada'`.
  - `shared/src/schemas.ts`: `applyChangeSchema`.
  - `server/src/routes/performance.ts`: se extrae `createBaseline`.
  - `server/src/routes/changeRequests.ts`: ruta nueva y DTO.
- Test: `server/tests/changeRequests.test.ts`, `server/tests/changeProposals.test.ts`, `server/tests/closedGuard.test.ts`, `server/tests/performance.test.ts`, `shared/tests/schemas.test.ts`

**Interfaces:**
- Consumes: `assertDatesStayInside` (Task 2), `noteText` (Task 1), `isDateOrderValid` y `DATE_ORDER_MESSAGE` de shared.
- Produces:
  - `applyChangeSchema = z.object({ endDate: optionalDateSchema, plannedBudgetCents: budgetAmount.optional(), baseline: z.boolean(), reason: noteText().optional() })`.
  - `createBaseline(tx: Prisma.TransactionClient, project: Project, userId: string, input: { reason: string; changeRequestId: string | null }): Promise<BaselineWithRelations>`. Lanza los mismos errores que hoy `POST /baselines`: `baseline_empty`, `baseline_missing_dates` y el campo `reason`.
  - `POST /api/projects/:id/change-requests/:crId/apply` responde el DTO del PM.
  - `toChangeRequestDto` suma `appliedAt` y `appliedBy: { id, name } | null`, sin `appliedById`.
  - `decisionSchema` sigue aceptando solo `APPROVED` y `REJECTED`.

- [x] **Step 1: Escribir las pruebas que fallan** en `changeRequests.test.ts`, bloque `describe('aplicar un cambio')`. Proyecto de `2026-01-01` a `2026-06-30` con presupuesto 100 000, una tarea con costo y fechas, y una solicitud aprobada con `scheduleImpactDays 10` y `costImpactCents 5000`:
  - Aplicar `{ endDate: '2026-07-10', plannedBudgetCents: 105000, baseline: false }` responde 200 con `status: 'APPLIED'`, `appliedAt` y `appliedBy` del PM. El proyecto queda con esa fecha y ese presupuesto.
  - Aplicar `{ baseline: true }` crea una línea base nueva con `changeRequestId` de la solicitud y `reason` «CR-1 <título>».
  - Con `baseline: true` y ninguna tarea con costo, responde 400 `baseline_empty`, y la solicitud sigue `APPROVED` con el proyecto sin cambios.
  - Una solicitud pendiente, una rechazada y una ya aplicada responden 409 `change_not_approved` con «Solo se aplica un cambio aprobado».
  - Dos peticiones de aplicar en paralelo: una 200 y otra 409, y una sola línea base nueva.
  - `endDate: '2026-03-01'` con la tarea terminando en `2026-05-31` responde 400 en `fields.endDate`, sin cambios.
  - `endDate` antes del inicio responde 400 con `DATE_ORDER_MESSAGE`.
  - Un colaborador recibe 403.
- [x] **Step 2: Escribir las demás pruebas.**
  - `changeProposals.test.ts`: `HIDDEN` suma `appliedAt`, `appliedById` y `appliedBy`. Una propuesta aplicada se ve con `status: 'APPLIED'` en la lista del colaborador.
  - `performance.test.ts`: `POST /baselines` con `changeRequestId` de una solicitud `APPLIED` responde 201; con una `PENDING`, sigue respondiendo 400.
  - `closedGuard.test.ts`: la ruta nueva aparece en la cobertura con su parámetro `:crId`, siguiendo el patrón de `decision`.
  - `schemas.test.ts`: `applyChangeSchema` exige `baseline`.
- [x] **Step 3: Correr y ver que fallan.**
- [x] **Step 4: Crear la migración** con `ALTER TABLE "ChangeRequest" ADD COLUMN "appliedAt" TIMESTAMP(3), ADD COLUMN "appliedById" TEXT`, más la clave foránea con `ON DELETE SET NULL`. Generarla con `npx prisma migrate dev --create-only --name change_applied` y revisar el SQL.
- [x] **Step 5: Implementar la ruta.**
  - Leer la solicitud del proyecto; si no está `APPROVED`, 409.
  - Validar fechas: `isDateOrderValid` con el inicio actual y `assertDatesStayInside` con lo que cambia.
  - En una transacción interactiva, en este orden:
    1. `tx.changeRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'APPLIED', appliedAt: now, appliedById } })`. Si `count === 0`, lanzar el 409. Esto resuelve el doble clic.
    2. Actualizar el proyecto con los campos presentes.
    3. Si `baseline`, llamar a `createBaseline(tx, proyectoActualizado, user.id, { reason: reason || \`CR-${n} ${title}\`, changeRequestId: id })`.
  - `POST /baselines` usa la misma `createBaseline` y acepta solicitudes `APPROVED` o `APPLIED`.
- [x] **Step 6: Correr** las suites completas de shared y servidor, incluidas `accessMatrix`, `activityCoverage` y `closedGuard`.
  Expected: PASS.
- [x] **Step 7: Commit** `feat: aplicar un cambio aprobado al plazo, presupuesto y línea base`.

### Task 7: C8 — aplicar un cambio (interfaz)

**Files:**
- Modify: `client/src/api/types.ts` (`ChangeRequest.appliedAt`, `appliedBy`), `client/src/pages/project/ChangeRequests.tsx`, `client/src/components/performance/BaselinePanel.tsx`
- Test: `client/tests/changeRequests.test.tsx`, `client/tests/performance.test.tsx`

**Interfaces:**
- Consumes: `POST /api/projects/:id/change-requests/:crId/apply` (Task 6).
- Produces: el componente `ApplyDialog({ projectId, item, project, hasBaseline, onClose })` dentro de `ChangeRequests.tsx`.

- [x] **Step 1: Escribir las pruebas que fallan.** Proyecto con `endDate '2026-06-30'` y presupuesto 100 000, solicitud aprobada con 10 días y 5 000 de impacto, y el proyecto con línea base:
  - La fila aprobada muestra el botón «Aplicar»; una rechazada o aplicada no lo muestra. Una aplicada muestra el estado «Aplicada».
  - La ventana trae la fecha de fin `2026-07-10`, el presupuesto 1 050,00, la casilla «Fijar nueva línea base citando este cambio» marcada y el motivo «CR-1 <título>».
  - Confirmar sin tocar nada envía `{ endDate: '2026-07-10', plannedBudgetCents: 105000, baseline: true, reason: 'CR-1 <título>' }`.
  - Si se cambia la fecha a la actual, el cuerpo no lleva `endDate`.
  - Sin impactos y sin línea base, la ventana trae los valores actuales, la casilla desmarcada, y el cuerpo es `{ baseline: false }` más `reason`.
  - Un error de campo de la API (`fields.endDate`) se muestra en la ventana.
  - `BaselinePanel` ofrece para citar también las solicitudes `APPLIED`.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.**
  - La fecha propuesta se calcula con `addDays` de `@pm/shared`.
  - Al confirmar se invalidan las consultas de cambios, proyecto, desempeño e indicadores, con las mismas claves que ya usa la página.
  - El monto se edita con el mismo componente de dinero que el formulario del proyecto.
- [x] **Step 4: Correr** la suite del cliente y `npx tsc -b`.
  Expected: PASS.
- [x] **Step 5: Commit** `feat: ventana para aplicar un cambio aprobado`.

### Task 8: C8 — cambios por aplicar en el panel

**Files:**
- Modify: `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts`, `client/src/api/types.ts`, `client/src/pages/Dashboard.tsx`
- Test: `server/tests/dashboard.test.ts` (y su prueba pura si `buildDashboard` la tiene), `client/tests/dashboard.test.tsx`

**Interfaces:**
- Produces:
  - `DashboardInput.changes?: { id: string; number: number; title: string; projectId: string }[]`, solo las `APPROVED`.
  - Un elemento de atención `{ kind: 'change', id, number, title, projectId, projectName }`, colocado después de los entregables y antes de los riesgos, dentro del mismo tope de 8.

- [x] **Step 1: Escribir las pruebas que fallan.**
  - `GET /api/dashboard` con una solicitud aprobada en un proyecto activo lista `{ kind: 'change', number: 1, … }`.
  - No lista una aplicada, una pendiente ni una de un proyecto cerrado.
  - En el cliente, el elemento se ve como «CR-1 <título>» con el nombre del proyecto y un enlace a `/proyectos/<id>/cambios`; tomar la ruta exacta de `client/src/router.tsx`.
- [x] **Step 2: Correr y ver que fallan.**
- [x] **Step 3: Implementar.** La consulta es `prisma.changeRequest.findMany({ where: { ...where, status: 'APPROVED' }, select: { id, number, title, projectId } })`.
- [x] **Step 4: Correr** las suites de servidor y cliente, y `npx tsc -b`.
  Expected: PASS.
- [x] **Step 5: Commit** `feat: el panel avisa de cambios aprobados sin aplicar`.

### Task 9: Cierre de la etapa

**Files:**
- Modify: `docs/guia-implementacion-pmbok.md` (fila de la etapa 4 con «C6 ✓, C7 ✓, C8 ✓, C9 ✓, C10 ✓», y una nota «Hecho» con la ruta de la especificación en cada corrección), este plan (casillas marcadas)

- [x] **Step 1: Suite completa.**
  Run: `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npm test` desde la raíz.
  Expected: shared, server y client en PASS.
- [x] **Step 2: Flujo completo.**
  Run: `npm run build`, luego `npm run test:e2e`.
  Expected: 1 passed. Si el flujo esperaba un avance o un texto que cambió con C7 o C6, se ajusta el valor esperado y se anota como ruling.
- [x] **Step 3: Actualizar la guía** y marcar las casillas.
- [x] **Step 4: Commit** `docs: marca la etapa 4 en la guía y el plan`.
