# C11 — Ediciones simultáneas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que guardar el acta, una tarea, un riesgo o un entregable responda 409 `edit_conflict` cuando otra persona guardó antes, y que la interfaz avise y recargue.

**Architecture:** Columna `version Int @default(1)` en los cuatro modelos. Las rutas de edición exigen `version` y escriben con `updateMany({ where: { id, version }, data: { ...input, version: { increment: 1 } } })`; `count === 0` → 409. Las rutas que tocan campos del formulario sin editar desde una copia (responsables, revisión, quitar miembro) solo incrementan. El cliente manda la versión abierta y trata el 409 con un helper común.

**Tech Stack:** Hono, Prisma 6 + PostgreSQL, Zod en `shared`, React 19 + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-ediciones-simultaneas-design.md`

## Global Constraints

- Mensaje sin versión (400, campo `version`): «Recarga la página para editar este registro».
- 409, código `edit_conflict`, mensaje: «Otra persona guardó cambios en este registro mientras editabas».
- Aviso del cliente: «Otra persona guardó cambios en este registro. Cargamos la versión actual; vuelve a aplicar tus cambios.»
- Botón del acta: «Cargar la versión actual».
- Comprobar y escribir en una sola sentencia; nada en memoria entre peticiones.
- Orden de errores: 404/403 de acceso y 409 `project_closed` antes que el choque; validación de campos también antes.
- Nunca editar una migración aplicada: migración nueva.
- Las pruebas de permisos existentes (`accessMatrix`, lo que no ve el colaborador) siguen pasando.
- Commits en español con prefijo, uno por tarea, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Comandos (desde `server/`): `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`. Cliente (desde `client/`): `npx vitest run <archivo>` y `npx tsc -b`.

## Review Focus

1. Acta sin cambios de contenido enviada con versión vieja: responde 200 sin escribir (no 409), como dice la spec.
2. Colaborador cambiando el estado de su riesgo con `version`: la clave `version` debe estar permitida en modo `own`; sin ella sigue 403 por otras claves, no 400.
3. Dos guardados con la misma versión en paralelo: solo uno gana (lo garantiza el `where` con versión; prueba con `Promise.all`).
4. Cambio de estado del entregable desde los botones manda la versión del detalle actual, no una vieja de la lista.
5. Tras un 409 en tarea/riesgo/entregable, el formulario muestra los valores nuevos (no los que el usuario escribió) y vuelve a guardar sin choque.

---

### Task 1: Migración, campo `version` y error de choque

**Files:**
- Modify: `server/prisma/schema.prisma` (Charter, Task, Risk, Deliverable)
- Create: `server/prisma/migrations/20261115140000_edit_versions/migration.sql`
- Modify: `shared/src/schemas.ts`, `server/src/errors.ts`
- Test: `shared/tests/schemas.test.ts` (o el archivo de esquemas existente en `shared/tests/`)

**Interfaces:**
- Produces: `versionField` (Zod: `z.number({ message: VERSION_REQUIRED }).int(VERSION_REQUIRED).positive(VERSION_REQUIRED)`, `VERSION_REQUIRED = 'Recarga la página para editar este registro'`), exportados de `shared`. `editConflict(): AppError` en `server/src/errors.ts` → `new AppError(409, 'edit_conflict', 'Otra persona guardó cambios en este registro mientras editabas')`.

- [x] **Step 1: Prueba que falla** — `versionField` acepta `3`, rechaza `undefined`, `0`, `1.5` y `'2'` con el mensaje `VERSION_REQUIRED`.
- [x] **Step 2:** Ejecutar desde `shared/`: `npx vitest run`. Expected: FAIL, `versionField` no existe.
- [x] **Step 3:** Añadir `version Int @default(1)` a los cuatro modelos; generar el SQL con `prisma migrate diff` contra una base sombra (crearla y borrarla con docker psql) y guardarlo en la carpeta de migración; exportar `versionField`/`VERSION_REQUIRED`; crear `editConflict()`.
- [x] **Step 4:** `npx vitest run` en `shared/` → PASS. En `server/`: `npx prisma generate` y la suite de `charter.test.ts` → PASS (la migración aplica en la base de pruebas).
- [x] **Step 5:** Commit `feat: versión de edición en acta, tareas, riesgos y entregables`.

### Task 2: Acta — guardar y aprobar con versión

**Files:**
- Modify: `shared/src/schemas.ts` (`charterSchema` + `version: versionField`; nuevo `approveCharterSchema = z.object({ version: versionField })`), `server/src/routes/charter.ts`
- Test: `server/tests/charter.test.ts`; actualizar `richText.test.ts`, `closedGuard.test.ts`, `reviewFixes.test.ts`, `activity*.test.ts` y cualquier otra prueba que haga `PUT …/charter` o `POST …/charter/approve` para mandar `version`.

**Interfaces:**
- Consumes: `versionField`, `editConflict()` (Task 1).
- Produces: el GET/PUT/approve del acta devuelven `version`.

- [x] **Step 1: Pruebas que fallan** en `charter.test.ts`, describe «versión del acta»:
  - `guardar con la versión actual la sube en 1` → 200, `body.version === 2`.
  - `guardar con versión vieja responde 409 y no cambia nada` → `error.code === 'edit_conflict'`, mensaje exacto, el texto guardado sigue igual.
  - `sin versión responde 400 en el campo version` → `error.fields.version === 'Recarga la página para editar este registro'`.
  - `sin cambios de contenido y versión vieja responde 200 sin escribir` → `version` sigue igual.
  - `aprobar con versión vieja responde 409 y no aprueba`; `aprobar con la versión actual aprueba y sube la versión`.
  - `en un proyecto cerrado responde project_closed antes que el choque` (versión vieja).
- [x] **Step 2:** Ejecutar `charter.test.ts`. Expected: FAIL en las nuevas.
- [x] **Step 3:** PUT: tras la comparación `changed`, `updateMany` con `where: { projectId, version: input.version }` e incremento; `count === 0` → `editConflict()`. Approve: parsear `approveCharterSchema`, validar campos obligatorios, luego `updateMany` con versión. Actualizar las pruebas existentes para mandar `version`.
- [x] **Step 4:** Ejecutar todos los archivos tocados → PASS.
- [x] **Step 5:** Commit `feat: el acta rechaza guardados con versión vieja`.

### Task 3: Tareas — edición con versión, responsables la suben

**Files:**
- Modify: `shared/src/schemas.ts` (`updateTaskSchema` + `version: versionField`), `server/src/routes/tasks.ts`
- Test: `server/tests/tasks.test.ts` (describe «versión de la tarea»); actualizar `taskDates.test.ts`, `dependencies.test.ts`, `notifyTasks.test.ts`, `assignmentRule.test.ts`, `closedGuard.test.ts`, `reviewFixes.test.ts`, `activity*.test.ts` y demás que hagan `PATCH /api/tasks/:id`.

**Interfaces:**
- Consumes: Task 1.
- Produces: el DTO de tarea (`loadDto`) incluye `version` para todos los perfiles.

- [x] **Step 1: Pruebas que fallan:**
  - `editar con la versión actual la sube en 1`; `versión vieja → 409 edit_conflict sin cambios`; `sin versión → 400 fields.version`.
  - `el avance y los pasos no cambian la versión`: el colaborador hace `PATCH /progress` y crea/marca un paso; la versión sigue en 1 y el PM guarda con `version: 1` → 200.
  - `cambiar responsables sube la versión`: `PUT /assignees` → `version === 2`; luego `PATCH` con `version: 1` → 409.
  - `dos guardados en paralelo con la misma versión: uno 200 y otro 409` (`Promise.all`).
- [x] **Step 2:** Ejecutar `tasks.test.ts`. Expected: FAIL.
- [x] **Step 3:** En el PATCH, sustituir `task.update` por `updateMany` con versión dentro de la transacción existente (lanzar `editConflict()` si `count === 0` para que la transacción revierta los responsables). En `PUT /assignees`, añadir `prisma.task.update({ where: { id }, data: { version: { increment: 1 } } })` a la transacción. `/progress` y `taskSteps.ts` no cambian. Actualizar pruebas existentes.
- [x] **Step 4:** Ejecutar los archivos tocados → PASS.
- [x] **Step 5:** Commit `feat: las tareas rechazan guardados con versión vieja`.

### Task 4: Riesgos — CRUD genérico con versión

**Files:**
- Modify: `server/src/routes/projectCrud.ts` (opción `versioned?: boolean`), `server/src/routes/registers.ts` (riesgos: `versioned: true`, `own.editable: ['status', 'version']`), `shared/src/schemas.ts` (`updateRiskSchema` + `version: versionField`), `server/src/routes/members.ts`
- Test: `server/tests/registers.test.ts` (describe «versión del riesgo»), `server/tests/ownRisks.test.ts`; actualizar `activityRegisters.test.ts`, `closedGuard.test.ts` y demás que hagan PATCH de riesgos.

**Interfaces:**
- Consumes: Task 1.
- Produces: el DTO de riesgo incluye `version` (PM y colaborador).

- [x] **Step 1: Pruebas que fallan:**
  - PM: versión actual → sube; vieja → 409; sin versión → 400.
  - Colaborador responsable: `{ status, version: 1 }` → 200; `{ status, version: 1 }` otra vez → 409; `{ status }` → 400 `fields.version`; `{ status, version, description }` → 403 con el mensaje de `own`.
  - `quitar al responsable del proyecto sube la versión de sus riesgos`.
  - Interesados (otro registro del CRUD) siguen editándose sin `version`.
- [x] **Step 2:** Ejecutar `registers.test.ts ownRisks.test.ts`. Expected: FAIL.
- [x] **Step 3:** En `projectCrud.ts`, si `versioned`: separar `version` del input, `updateMany({ where: { id, version }, data: { ...rest, version: { increment: 1 } } })`, 409 si `count === 0`, recargar con `findUniqueOrThrow({ include })`. En `members.ts`, añadir `version: { increment: 1 }` al `risk.updateMany`.
- [x] **Step 4:** Ejecutar los archivos tocados y `accessMatrix.test.ts` → PASS.
- [x] **Step 5:** Commit `feat: los riesgos rechazan guardados con versión vieja`.

### Task 5: Entregables — edición con versión, revisión la sube

**Files:**
- Modify: `shared/src/schemas.ts` (`updateDeliverableSchema` + `version: versionField`), `server/src/routes/deliverables.ts`, `server/src/routes/deliverableReviews.ts`
- Test: `server/tests/deliverables.test.ts` (describe «versión del entregable»); actualizar `deliverablesAccess.test.ts`, `deliverableReviews.test.ts`, `closedGuard.test.ts`, `richText.test.ts`, `activity*.test.ts`.

**Interfaces:**
- Consumes: Task 1.
- Produces: `toDeliverableDto` incluye `version` en lista y detalle.

- [x] **Step 1: Pruebas que fallan:** versión actual → sube; vieja → 409; sin versión → 400; `cambiar el estado con versión vieja → 409`; `registrar una revisión sube la versión`; una transición inválida con versión vieja sigue respondiendo `invalid_transition` (la validación va antes).
- [x] **Step 2:** Ejecutar `deliverables.test.ts`. Expected: FAIL.
- [x] **Step 3:** PATCH con `updateMany` con versión; en la revisión, `data: { status, version: { increment: 1 } }`. Actualizar pruebas existentes.
- [x] **Step 4:** Ejecutar los archivos tocados → PASS.
- [x] **Step 5:** Commit `feat: los entregables rechazan guardados con versión vieja`.

### Task 6: Cliente — tareas, riesgos y entregables (opción A)

**Files:**
- Modify: `client/src/api/client.ts` (`isEditConflict(error: unknown): boolean`, `EDIT_CONFLICT_NOTICE`), `client/src/api/types.ts` (`version: number` en Task, Risk, Deliverable/DeliverableDetail, Charter), `client/src/components/tasks/TaskForm.tsx`, `client/src/components/RegisterTable.tsx`, `client/src/pages/project/Registers.tsx`, `client/src/components/deliverables/DeliverableForm.tsx`, `client/src/components/deliverables/DeliverableDetail.tsx`
- Test: `client/tests/taskDetail.test.tsx` (o `projectTasks.test.tsx`), `client/tests/risks.test.tsx`, `client/tests/deliverables.test.tsx`; añadir `version` a los fixtures que lo necesiten.

**Interfaces:**
- Consumes: el 409 `edit_conflict` y `version` en los DTO (Tasks 2–5).
- Produces: `isEditConflict`, `EDIT_CONFLICT_NOTICE = 'Otra persona guardó cambios en este registro. Cargamos la versión actual; vuelve a aplicar tus cambios.'`

- [x] **Step 1: Pruebas que fallan:**
  - Tarea: guardar manda `version` del fixture en el body; con `apiError(409, 'edit_conflict', …)` se ve `EDIT_CONFLICT_NOTICE`, hay un nuevo GET de la tarea y el campo Título muestra el valor del nuevo GET.
  - Riesgo (PM): el PATCH del formulario manda `version`; ante 409 se ve el aviso y se recarga la lista. Colaborador: el cambio de estado manda `{ status, version }`; ante 409, aviso y recarga.
  - Entregable: el formulario y los botones de estado mandan `version`; ante 409, aviso y recarga del detalle.
- [x] **Step 2:** `npx vitest run` de esos archivos. Expected: FAIL.
- [x] **Step 3:** Implementar. `RegisterTable` manda `version` solo si el registro editado la tiene (`'version' in editing`). Ante conflicto: invalidar la consulta, mostrar el aviso con el componente de mensajes del formulario y reiniciar el formulario con los datos nuevos (cerrar y reabrir el modal sirve si es más simple).
- [x] **Step 4:** `npx vitest run` y `npx tsc -b` en `client/` → PASS.
- [x] **Step 5:** Commit `feat: aviso de choque al editar tareas, riesgos y entregables`.

### Task 7: Cliente — acta

**Files:**
- Modify: `client/src/pages/project/Charter.tsx`
- Test: `client/tests/charter.test.tsx`

**Interfaces:**
- Consumes: `isEditConflict` (Task 6), `version` en Charter.

- [x] **Step 1: Pruebas que fallan:**
  - `guardar y aprobar mandan la versión` (`PUT` con `version` en el body; `POST …/approve` con `{ version }`).
  - `ante un choque el borrador sigue visible`: tras 409 se ve el aviso «Otra persona guardó cambios en este registro mientras editabas» (o el mensaje del servidor), el texto escrito sigue en el campo y el botón de guardar está deshabilitado.
  - `«Cargar la versión actual» reemplaza el borrador`: tras pulsarlo, hay un nuevo GET, los campos muestran lo del servidor y guardar vuelve a estar habilitado.
- [x] **Step 2:** `npx vitest run tests/charter.test.tsx`. Expected: FAIL.
- [x] **Step 3:** Estado `conflict: boolean` en la página; con `conflict` mostrar aviso + botón «Cargar la versión actual» (refetch y reemplazo del borrador), deshabilitar guardar y aprobar.
- [x] **Step 4:** `npx vitest run` y `npx tsc -b` → PASS.
- [x] **Step 5:** Commit `feat: el acta conserva el borrador ante un choque`.

### Task 8: Guía y verificación completa

**Files:**
- Modify: `docs/guia-implementacion-pmbok.md` (fila de la etapa 3 → «F3 ✓, F2 ✓, F4 ✓, C11 ✓»; nota «Hecho» en C11), este plan (casillas).

- [x] **Step 1:** Actualizar la guía.
- [x] **Step 2:** Suite completa desde la raíz: `TEST_DATABASE_URL=… npm test`. Expected: shared, server y client en verde.
- [x] **Step 3:** `npm run build` y `TEST_DATABASE_URL=… npm run test:e2e`. Expected: el flujo principal pasa (edita acta, tareas, riesgos y entregables desde la interfaz, así que comprueba que el cliente manda la versión).
- [x] **Step 4:** Commit `docs: marca C11 en la guía y las tareas del plan`.
