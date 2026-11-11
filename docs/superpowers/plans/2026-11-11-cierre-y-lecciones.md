# Cierre del proyecto y lecciones aprendidas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El PM cierra un proyecto revisando sus pendientes y deja un informe final congelado. El proyecto cerrado queda en solo lectura y se puede reabrir. El equipo registra lecciones aprendidas, que se consultan en una página global.

**Architecture:**
- **Servidor:**
  - dos modelos nuevos, `ProjectClosure` y `Lesson`, y la columna `Project.closedAt`;
  - las reglas puras (`closurePendings`, `buildClosureReport`) viven en `server/src/domain/closure.ts`;
  - un `preHandler` global (`closedGuard.ts`) responde 409 a las escrituras sobre proyectos cerrados. Una prueba recorre todas las rutas registradas.
- **Interfaz:**
  - `useProject()` expone `readOnly`, y las pestañas ocultan sus controles de edición;
  - pestañas nuevas: **Cierre** (PM) y **Lecciones** (todos);
  - página global nueva: `/lecciones`.

**Tech Stack:** Fastify 5, Prisma 6 con SQLite, Zod, React 19, TanStack Query 5, Tailwind 4, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-cierre-y-lecciones-design.md`

## Global Constraints

- Toda la interfaz y los mensajes están en español.
- Sin dependencias nuevas.
- **Proyecto cerrado:** `status` es `CLOSED` o `CANCELLED`. Constante compartida `CLOSED_PROJECT_STATUS = ['CLOSED', 'CANCELLED'] as const`; ya existe `ACTIVE_PROJECT_STATUS = ['PLANNING', 'EXECUTING', 'PAUSED']`.
- **409 del guardia:** `{ code: 'project_closed', message: 'El proyecto está cerrado. Reábrelo para hacer cambios.' }`.
- **Excepciones del guardia:**
  - `DELETE /api/projects/:id`;
  - todo lo que empiece por `/api/projects/:id/lessons`;
  - `POST /api/projects/:id/reopen`.
- **Pendientes y etiquetas:**
  - `deliverables`: "Entregables sin aceptar";
  - `incidents`: "Incidentes abiertos";
  - `risks`: "Riesgos abiertos";
  - `tasks`: "Tareas sin terminar";
  - `objectives`: "Objetivos sin evaluar";
  - `charter`: "Acta sin aprobar".
- **Lecciones:**
  - `LESSON_TYPE = ['WORKED_WELL', 'TO_IMPROVE']` → "Funcionó bien" y "A mejorar";
  - `LESSON_CATEGORY = ['SCOPE', 'SCHEDULE', 'COST', 'QUALITY', 'TEAM', 'COMMUNICATION', 'RISK', 'STAKEHOLDERS', 'PROCUREMENT', 'OTHER']` → Alcance, Cronograma, Costos, Calidad, Equipo, Comunicación, Riesgos, Interesados, Proveedores, Otro;
  - `situation`: de 1 a 2000 caracteres; `recommendation`: de 0 a 2000;
  - la página global devuelve como máximo 200 lecciones.
- **Mensaje al cerrar por PATCH:** "Para cerrar el proyecto usa la pestaña Cierre".
- **Reabrir:** el proyecto pasa a `EXECUTING`.
- **Dinero:** siempre `Number()`, nunca BigInt en el JSON (tampoco dentro de la foto del informe).

## Review Focus

1. **Un colaborador que no es miembro, o una petición anónima, escribe sobre un proyecto cerrado.** Debe recibir el 404 o el 401 de siempre, no un 409 que revele que el proyecto existe y está cerrado. Prueba en la Tarea 5.
2. **Cerrar dos veces seguidas** (doble clic o dos pestañas): la segunda vez responde 409 y no crea un segundo registro de cierre. Prueba en la Tarea 4.
3. **Un proyecto que ya estaba cerrado antes de esta versión** (sin `ProjectClosure`): la pestaña Cierre no falla, muestra el informe con `legacy: true` y se puede reabrir. Prueba en la Tarea 4.
4. **Búsqueda global con caracteres especiales** (`%`, `_`, comillas): se busca el texto literal, no un patrón, y no hay error 500. Prueba en la Tarea 6.
5. **Datos que cambian después de cerrar** (se borra un gasto tras reabrir y volver a cerrar, o se edita un objetivo con el proyecto reabierto): el informe del cierre anterior en el historial no cambia, porque su foto quedó guardada. Prueba en la Tarea 4.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `shared/src/enums.ts`, `shared/src/schemas.ts` | Estados, tipos, categorías, etiquetas y esquemas |
| `server/prisma/schema.prisma` y migración `add_closure_lessons` | `ProjectClosure`, `Lesson` y `Project.closedAt` |
| `server/src/domain/closure.ts` (nuevo) | `closurePendings`, `buildClosureReport` |
| `server/src/routes/closure.ts` (nuevo) | GET, cerrar y reabrir; `loadClosureInput` |
| `server/src/closedGuard.ts` (nuevo) | Guardia de solo lectura y registro de rutas |
| `server/src/routes/lessons.ts` (nuevo) | Lecciones por proyecto y global |
| `server/src/routes/projects.ts`, `server/src/routes/performance.ts`, `server/src/auth/access.ts`, `server/src/app.ts` | Integraciones |
| `client/src/pages/project/Closure.tsx` (nuevo), `client/src/components/closure/*` (nuevo) | Pestaña Cierre, informe, ventanas |
| `client/src/pages/project/Lessons.tsx`, `client/src/pages/Lessons.tsx`, `client/src/components/lessons/*` (nuevos) | Lecciones por proyecto y global |
| `client/src/pages/project/ProjectLayout.tsx` y las pestañas existentes | Aviso, reabrir y `readOnly` |

---

### Task 1: Esquemas compartidos

**Files:**
- Modify: `shared/src/enums.ts`, `shared/src/schemas.ts`
- Test: `shared/tests/closure.test.ts`

**Interfaces:**
- Produces:
  - **Constantes:** `CLOSED_PROJECT_STATUS`, `LESSON_TYPE`, `LESSON_CATEGORY`, los tipos `LessonType` y `LessonCategory`, y `LABELS.lessonType` y `LABELS.lessonCategory` con las etiquetas de Global Constraints.
  - **Pendientes:** `CLOSURE_PENDING_KIND = ['deliverables', 'incidents', 'risks', 'tasks', 'objectives', 'charter'] as const`, `type ClosurePendingKind` y `LABELS.closurePending` con las etiquetas de Global Constraints.
  - **`closeProjectSchema`:** `{ finalStatus: z.enum(CLOSED_PROJECT_STATUS), summary: z.string().default(''), pendingReason: z.string().default('') }`.
  - **`reopenProjectSchema`:** `{ reason: required('Escribe el motivo') }`.
  - **`lessonSchema`:** `{ type: z.enum(LESSON_TYPE), category: z.enum(LESSON_CATEGORY), situation: required('Describe la situación').max(2000, 'Máximo 2000 caracteres'), recommendation: z.string().max(2000, 'Máximo 2000 caracteres').default('') }`. `updateLessonSchema` es el mismo con todo opcional.
  - **Estado del proyecto:** `projectFields.status` y `updateProjectSchema.status` aceptan solo `ACTIVE_PROJECT_STATUS`. Un estado cerrado da el error "Para cerrar el proyecto usa la pestaña Cierre" en `status`: usa `z.enum(PROJECT_STATUS).refine((s) => !CLOSED_PROJECT_STATUS.includes(s), msg)`.

- [ ] **Step 1: Write the failing tests:**
  - "el estado del proyecto no admite cerrado": `updateProjectSchema.safeParse({ status: 'CLOSED' })` falla con el mensaje de Global Constraints en `status`; `createProjectSchema.safeParse({ name: 'X', status: 'CANCELLED' }).success === false`; `{ status: 'PAUSED' }` es válido.
  - "lección": `lessonSchema.safeParse({ type: 'TO_IMPROVE', category: 'COST', situation: ' ' }).success === false`; `situation: 'x'.repeat(2001)` → false; `LABELS.lessonCategory.PROCUREMENT === 'Proveedores'`.
  - "reabrir exige motivo": `reopenProjectSchema.safeParse({ reason: '  ' }).success === false`.
- [ ] **Step 2: Run** `npm test -w shared` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w shared` → PASS. Luego ejecuta `npm test -w server -- projects` y `npm test -w client`: si alguna prueba existente usaba `status: 'CLOSED'` por PATCH o al crear, cámbiala para fijar el estado directamente en la base (`ctx.prisma.project.update`) y deja un ruling en el ledger.
- [ ] **Step 5: Commit** `feat: esquemas de cierre y lecciones`.

---

### Task 2: Modelos y migración

**Files:**
- Modify: `server/prisma/schema.prisma`, `server/src/auth/access.ts`
- Create: migración `<timestamp>_add_closure_lessons`
- Test: `server/tests/closure.test.ts` (solo el caso de esta tarea)

**Interfaces:**
- Produces:
  - **`ProjectClosure`:**
    - campos: `id`, `projectId` (`Cascade`), `finalStatus`, `summary @default("")`, `pendingReason @default("")`, `report String` (JSON);
    - `closedAt DateTime`, `closedById` (`User`, `Restrict`, relación `"projectCloser"`);
    - `reopenedAt DateTime?`, `reopenedById String?` (`User`, `Restrict`, relación `"projectReopener"`), `reopenReason @default("")`;
    - `@@index([projectId])`.
  - **`Lesson`:**
    - campos: `id`, `projectId` (`Cascade`), `authorId` (`User`, `Restrict`, relación `"lessonAuthor"`), `type`, `category`, `situation`, `recommendation @default("")`, `createdAt` y `updatedAt`;
    - `@@index([projectId])`, `@@index([category])`.
  - **`Project`:** `closedAt DateTime?`, más `closures` y `lessons`.
  - **`toProjectDto`:** deja pasar `closedAt` tal cual, porque ya forma parte de `visible`.

- [ ] **Step 1: Write the failing test** "el detalle del proyecto incluye closedAt": como colaborador miembro, `GET /api/projects/:id` tiene la propiedad `closedAt` con valor null, y `ctx.prisma.lesson.count()` es 0.
- [ ] **Step 2: Run** `npm test -w server -- closure` → FAIL.
- [ ] **Step 3: Implement.**
  - Genera la migración **una sola vez**, desde `server/`, con `DATABASE_URL="file:<scratchpad>/migr.db" npx prisma migrate dev --name add_closure_lessons --create-only --skip-generate`. Si la ejecutas otra vez, crea una migración vacía: bórrala.
  - Revisa el SQL: si redefine `Project`, debe copiar todas las columnas.
  - Ejecuta `npx prisma generate`. Si falla con EPERM, borra `node_modules/.prisma/client/query_engine-windows.dll.node.tmp*`.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: modelos de cierre y lecciones`.

---

### Task 3: Pendientes e informe de cierre (dominio)

**Files:**
- Create: `server/src/domain/closure.ts`
- Test: `server/tests/domain/closure.test.ts`

**Interfaces:**
- Consumes: `computeEvm` y `EvmInput` de `server/src/domain/evm.ts`; `ClosurePendingKind` (Tarea 1).
- Produces:
  - **`type ClosureInput`:**
    - `project: { startDate: string | null; endDate: string | null; plannedBudgetCents: number; currency: string }`;
    - `tasks: { status: string; startDate: string | null }[]`;
    - `deliverables: { status: string }[]`;
    - `incidents: { status: string }[]`;
    - `risks: { status: string }[]`;
    - `objectives: { status: string }[]`;
    - `charterStatus: string | null`;
    - `expenses: { amountCents: number }[]`;
    - `changes: { status: string }[]`;
    - `evm: EvmInput | null`.
  - **`closurePendings(input: ClosureInput): { kind: ClosurePendingKind; count: number }[]`:** las reglas de la spec, sección 3, en el orden de `CLOSURE_PENDING_KIND`. `charter` cuenta 1 si `charterStatus !== 'APPROVED'`.
  - **`type ClosureReport`:** la forma exacta de la spec, sección 3: `dates`, `budget`, `performance`, `objectives`, `deliverables`, `changes`, `incidents`, `risks` y `pendings`.
  - **`buildClosureReport(input: ClosureInput, closingDate: string): ClosureReport`:** `endVarianceDays` usa `diffDays(plannedEnd, closingDate)` de `@pm/shared`; `performance` sale de `computeEvm(input.evm, closingDate).metrics` (`cpi`, `spi`, `eacCents`, `vacCents`) o es null.

- [ ] **Step 1: Write the failing tests:**
  - **"pendientes":**
    - con todo resuelto (entregables `ACCEPTED`, incidentes `CLOSED`, riesgos `CLOSED`, tareas `DONE`, objetivos `MET` y acta `APPROVED`) → `[]`;
    - con 2 entregables `IN_REVIEW`, 1 incidente `IN_PROGRESS`, 1 riesgo `TREATING`, 1 tarea `TODO`, 1 objetivo `PENDING` y acta `DRAFT` → `[{deliverables,2},{incidents,1},{risks,1},{tasks,1},{objectives,1},{charter,1}]`;
    - `charterStatus: null` → incluye `{ kind: 'charter', count: 1 }`.
  - **"fechas":**
    - plan `2026-01-01..2026-06-30`, tareas con inicio `2026-01-05` y `2026-01-03`, cierre `2026-07-10` → `{ plannedStart: '2026-01-01', plannedEnd: '2026-06-30', actualStart: '2026-01-03', actualEnd: '2026-07-10', endVarianceDays: 10 }`;
    - sin `endDate` → `endVarianceDays: null`.
  - **"presupuesto con sobrecosto":** plan 100000 y gastos 70000 + 50000 → `{ plannedCents: 100000, actualCents: 120000, varianceCents: -20000, currency: 'USD' }`.
  - **"sin línea base":** `evm: null` → `performance: null`.
  - **"conteos":** objetivos `MET, NOT_MET, PENDING, MET` → `{ met: 2, notMet: 1, pending: 1 }`; entregables por estado; cambios `{ approved, rejected, pending }`; `incidents: { total: 3, open: 1 }`.
- [ ] **Step 2: Run** `npm test -w server -- domain/closure` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server -- domain/closure` → PASS.
- [ ] **Step 5: Commit** `feat: pendientes e informe de cierre`.

---

### Task 4: API de cierre y reapertura

**Files:**
- Create: `server/src/routes/closure.ts`
- Modify: `server/src/app.ts`, `server/src/routes/performance.ts`
- Test: `server/tests/closure.test.ts`

**Interfaces:**
- Consumes: Tareas 1 a 3; `loadEvmInput(prisma, projectId)` de `performance.ts`; `requireProjectPm`; `requireUser` de `auth/guards`.
- Produces:
  - **Cargador:** `export async function loadClosureInput(prisma, projectId): Promise<ClosureInput>`.
  - **Rutas:**
    - `GET /api/projects/:id/closure`, `POST /api/projects/:id/closure` y `POST /api/projects/:id/reopen`;
    - las tres devuelven `{ status: 'open' | 'closed', legacy: boolean, report: ClosureReport, current: { finalStatus, summary, pendingReason, closedAt, closedBy: { id, name } } | null, history: [...] }`, con la forma de la spec, sección 4;
    - `history` va de más reciente a más antiguo, y `closedBy`/`reopenedBy` son `{ id, name }`.
  - **Cerrar, en una transacción interactiva:**
    1. `updateMany({ where: { id, status: { in: ACTIVE_PROJECT_STATUS } }, data: { status: finalStatus, closedAt: now } })`; si `count === 0`, responde 409 "El proyecto ya está cerrado";
    2. dentro de la misma transacción, crea el `ProjectClosure` con `report: JSON.stringify(buildClosureReport(input, hoy))` y `summary` saneado con `sanitizeRichText`.
    - El input se carga y los pendientes se validan antes de la transacción: 400 en `pendingReason` "Explica por qué se cierra con pendientes" si hay pendientes y el motivo está vacío.
  - **Reabrir, en una transacción interactiva:**
    1. `updateMany({ where: { id, status: { in: CLOSED_PROJECT_STATUS } }, data: { status: 'EXECUTING', closedAt: null } })`; si `count === 0`, responde 409 "El proyecto no está cerrado";
    2. rellena la reapertura del último cierre sin `reopenedAt`. Si no existe (proyecto cerrado antes de esta versión), crea uno con `finalStatus` igual al estado anterior, la foto calculada en ese momento, `closedAt = now`, `closedById` = el PM, y la reapertura ya rellenada.
  - **Proyecto cerrado sin registro:** el GET devuelve `legacy: true`, `current: null` y el informe en vivo.
  - **Valor ganado:** `GET …/performance` no hace el `upsert` de la foto si `CLOSED_PROJECT_STATUS` incluye `project.status`.

- [ ] **Step 1: Write the failing tests** (PM, Ana colaboradora, un proyecto con el acta aprobada y fecha fijada con `ctx.clock.set('2026-11-11T10:00:00')`):
  - **"solo el PM":** como Ana, GET → 403 y POST closure → 403; un no miembro → 404.
  - **"abierto con pendientes":** con 1 tarea `TODO`, el GET da `status: 'open'`, `legacy: false` y `report.pendings` igual a `[{ kind: 'tasks', count: 1 }]`.
  - **"cerrar con pendientes exige motivo":**
    - `POST { finalStatus: 'CLOSED' }` → 400 en `fields.pendingReason`;
    - con `pendingReason: 'Se descartó'` → 200 con `status: 'closed'` y `current.finalStatus` igual a `'CLOSED'`;
    - el proyecto queda en `CLOSED` con `closedAt` igual al reloj.
  - **"sin pendientes no hace falta motivo":** con la tarea en `DONE` y sin otros pendientes, `POST { finalStatus: 'CANCELLED' }` → 200.
  - **"cerrar dos veces":** el segundo POST → 409 y `projectClosure.count()` es 1.
  - **"la foto no cambia":** cerrar con un gasto de 5000; luego cambiar el importe directamente en la base a 9000 → `report.budget.actualCents` sigue siendo 5000.
  - **"reabrir":**
    - sin motivo → 400 en `fields.reason`;
    - con motivo → 200 con `status: 'open'`, el proyecto en `EXECUTING` y `closedAt` null;
    - `history[0]` tiene `reopenReason` y `reopenedBy.id === pm.id`;
    - reabrir otra vez → 409.
  - **"historial con dos cierres":** cerrar, reabrir y volver a cerrar → `history.length === 2`, y la foto del primero se conserva (`history[1]` incluye su informe como `report`).
  - **"proyecto cerrado antes de esta versión":**
    - con `status: 'CLOSED'` fijado en la base sin cierre, el GET da `legacy: true`, `current: null` y un informe presente;
    - reabrir → 200 y `history.length === 1` con `reopenReason`.
  - **"PATCH de estado bloqueado":** `PATCH /api/projects/:id { status: 'CLOSED' }` → 400 en `fields.status` con el mensaje de Global Constraints.
  - **"no se toman fotos de valor ganado con el proyecto cerrado":** con una línea base creada y el proyecto cerrado, `GET …/performance` no aumenta `evmSnapshot.count()`.
- [ ] **Step 2: Run** `npm test -w server -- closure` → FAIL.
- [ ] **Step 3: Implement** y registra `closureRoutes(app)` en `app.ts`.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: cerrar y reabrir proyectos`.

---

### Task 5: Guardia de solo lectura

**Files:**
- Create: `server/src/closedGuard.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/closedGuard.test.ts`

**Interfaces:**
- Consumes: `CLOSED_PROJECT_STATUS` (Tarea 1).
- Produces:
  - **`registerClosedGuard(app)`:** se llama en `app.ts` justo después de `registerAuthHook(app)` y antes de registrar las rutas. Hace dos cosas:
    1. añade un hook `onRoute` que guarda `{ method, url }` en `app.routeList` (decora la instancia con `routeList: { method: string; url: string }[]`);
    2. añade un `preHandler` que, para POST, PATCH, PUT y DELETE, sigue el algoritmo de abajo.
  - **Algoritmo del `preHandler`:**
    1. Si no hay `req.user`, pasa.
    2. Toma `path = req.url.split('?')[0]`.
    3. Si la ruta es una de las excepciones de Global Constraints, pasa.
    4. Averigua el `projectId`: `/api/projects/:id` → `id`; `/api/tasks/:id` → `task.projectId`; `/api/attachments/:id` → `attachment.projectId`; cualquier otra ruta, pasa.
    5. Si el proyecto no existe, pasa.
    6. Si el usuario no es PM y no es miembro, pasa: la ruta responderá 404.
    7. Si el `status` está en `CLOSED_PROJECT_STATUS`, lanza `AppError(409, 'project_closed', mensaje)`.
  - `POST /api/projects` (crear) no lleva id y pasa.

- [ ] **Step 1: Write the failing tests** (proyecto con Ana como miembro, una tarea con un paso, un anexo; después se fija `status: 'CLOSED'` en la base):
  - **"cobertura: todas las rutas de escritura de un proyecto cerrado responden 409":**
    - recorre `ctx.app.routeList`, filtrando los métodos POST, PATCH, PUT y DELETE cuyo `url` empiece por `/api/projects/:id`, `/api/tasks/:id` o `/api/attachments/:id`, quitando las excepciones;
    - sustituye `:id` por el id real (del proyecto, la tarea o el anexo, según el prefijo) y cualquier otro parámetro por `'x'`;
    - envía la petición como PM con cuerpo `{}`;
    - cada una responde 409 con `error.code === 'project_closed'`;
    - comprueba además que la lista filtrada tiene al menos 30 rutas, para que el filtro no quede vacío sin que nadie lo note.
  - **"las excepciones siguen funcionando":** como Ana, `POST …/lessons` no es 409 (con la Tarea 6 todavía sin hacer será 404: comprueba solo `statusCode !== 409`); `POST …/reopen` como PM no es 409; `DELETE /api/projects/:id` con `confirmName` correcto → 200.
  - **"sin acceso, la respuesta de siempre":** un colaborador no miembro, `PATCH /api/tasks/:taskId` → 404; anónimo → 401; `PATCH /api/tasks/no-existe` como PM → 404.
  - **"proyecto abierto no se bloquea":** con `status: 'EXECUTING'`, `PATCH /api/tasks/:id { title: 'Nuevo' }` → 200.
- [ ] **Step 2: Run** `npm test -w server -- closedGuard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: proyectos cerrados en solo lectura`.

---

### Task 6: API de lecciones

**Files:**
- Create: `server/src/routes/lessons.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/lessons.test.ts`

**Interfaces:**
- Consumes: `lessonSchema`, `updateLessonSchema`, `LESSON_TYPE` y `LESSON_CATEGORY` (Tarea 1); `getProjectAccess`; `requireUser`.
- Produces:
  - **Rutas:**
    - `GET` y `POST /api/projects/:id/lessons`;
    - `PATCH` y `DELETE /api/projects/:id/lessons/:lessonId`: el autor o el PM, y cualquier otro miembro recibe 403 "Solo el autor o el Project Manager pueden cambiar esta lección";
    - `GET /api/lessons`.
  - **Forma (`toLessonDto(lesson, viewer)`):** `{ id, type, category, situation, recommendation, author: { id, name }, project: { id, name }, createdAt, updatedAt, canEdit }`.
  - **Filtros globales:** cada parámetro debe ser un string único; si no, 400.
    - `q` se recorta y usa `contains` (Prisma escapa el texto, así que es literal) en `situation` y `recommendation`. En SQLite, `contains` no distingue mayúsculas solo en ASCII: es suficiente.
    - `category` y `type` deben estar en su lista.
    - `take: 200`, `orderBy: createdAt desc`.

- [ ] **Step 1: Write the failing tests:**
  - **"un miembro crea y lista":** Ana hace `POST { type: 'TO_IMPROVE', category: 'COST', situation: 'Se subestimó', recommendation: 'Reservar 10 %' }` → 201 con `author.name === 'Ana'`, `project.name` y `canEdit: true`; el GET lo lista.
  - **"permisos":** Beto, también miembro, `PATCH` sobre la lección de Ana → 403; el PM → 200; un no miembro, GET de las lecciones del proyecto → 404; para Beto la lección viene con `canEdit: false`.
  - **"con el proyecto cerrado se puede añadir":** con `status: 'CLOSED'` en la base, Ana `POST` → 201.
  - **"vista global":**
    - con lecciones en dos proyectos, Carlos (miembro de uno solo) hace `GET /api/lessons` y ve las de ambos;
    - `?category=COST` filtra;
    - `?q=subestim` encuentra;
    - `?q=50%25` (texto con `%`) responde 200 y solo devuelve lecciones que contengan "50%";
    - `?type=X` → 400;
    - `?category=COST&category=TEAM` → 400;
    - las claves de `project` son exactamente `['id', 'name']`.
  - **"anónimo":** `GET /api/lessons` → 401.
- [ ] **Step 2: Run** `npm test -w server -- lessons` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server` → PASS (la prueba de excepciones de la Tarea 5 sigue pasando).
- [ ] **Step 5: Commit** `feat: API de lecciones aprendidas`.

---

### Task 7: Solo lectura en la interfaz

**Files:**
- Modify: `client/src/api/types.ts` (`Project.closedAt: string | null`), `client/src/pages/project/ProjectLayout.tsx`, `client/src/components/project/ProjectForm.tsx` y las pestañas con controles de edición. Encuéntralas con `grep -rln "isPm\|canEdit" client/src/pages/project client/src/components`: Tasks, TaskDetail, Registers/RegisterTable, Charter, RaciMatrix, Incidents, ChangeRequests, DecisionsCard, BaselinePanel, Deliverables y su detalle, AttachmentList, MembersPanel.
- Create: `client/src/components/closure/ReopenDialog.tsx`
- Test: `client/tests/closedProject.test.tsx`

**Interfaces:**
- Produces:
  - **Contexto:** `ProjectContext` pasa a ser `{ project, isPm, readOnly }`, con `readOnly = CLOSED_PROJECT_STATUS.includes(project.status)`.
  - **Aviso del proyecto cerrado:** `role="status"`. El texto es "Proyecto cerrado el <shortDate(closedAt)> · solo lectura", o "Proyecto cancelado el …". Sin `closedAt`, se omite " el <fecha>".
  - **`ReopenDialog({ projectId, onClose })`:** ventana "Reabrir proyecto" con el campo "Motivo". El botón "Reabrir" está desactivado mientras el motivo esté vacío. Llama a `POST /api/projects/:id/reopen` e invalida `['project', id]`, la lista de proyectos, `['dashboard']` y `['project', id, 'closure']`.
  - **`readOnly`:** cada control de edición de la spec, sección 5, se oculta con `readOnly`. `RegisterTable` recibe `canEdit={!readOnly}` donde hoy recibe `canEdit`.
  - **Formulario del proyecto:** el selector de estado lista solo `ACTIVE_PROJECT_STATUS`.

- [ ] **Step 1: Write the failing tests** (proyecto `{ ...project, status: 'CLOSED', closedAt: '2026-11-10T15:00:00.000Z' }`):
  - **"aviso y controles ocultos":**
    - como PM, en `/proyectos/p1/tareas` se ve el aviso "Proyecto cerrado el 10 nov 2026 · solo lectura" y no hay botón "Nueva tarea";
    - en `/proyectos/p1/riesgos` no hay "Añadir riesgo";
    - en `/proyectos/p1/anexos` no hay "Adjuntar archivo";
    - en `/proyectos/p1/incidentes` no hay "Reportar incidente".
  - **"reabrir":** el PM pulsa "Reabrir"; en la ventana "Reabrir proyecto" el botón "Reabrir" está desactivado; tras escribir "Falta una entrega", envía `POST /api/projects/p1/reopen` con `{ reason: 'Falta una entrega' }`.
  - **"el colaborador no ve Reabrir":** como colaborador se ve el aviso y no hay botón "Reabrir".
  - **"cancelado":** con `status: 'CANCELLED'`, el aviso empieza por "Proyecto cancelado".
  - **"el formulario no ofrece Cerrado ni Cancelado":** en "Editar proyecto" de un proyecto abierto, las opciones del selector "Estado" son `['Planificación', 'En ejecución', 'En pausa']`.
- [ ] **Step 2: Run** `npm test -w client -- closedProject` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w client` → PASS. Si alguna prueba existente usaba un proyecto con `status: 'CLOSED'` y esperaba controles visibles, deja un ruling.
- [ ] **Step 5: Commit** `feat: proyectos cerrados en solo lectura en la interfaz`.

---

### Task 8: Pestaña Cierre

**Files:**
- Create: `client/src/pages/project/Closure.tsx`, `client/src/components/closure/ClosureReportView.tsx`, `client/src/components/closure/CloseProjectDialog.tsx`
- Modify: `client/src/api/types.ts` (`ClosureState`, `ClosureReport`), `client/src/router.tsx`, `client/src/pages/project/ProjectLayout.tsx`, `client/src/index.css` (`@media print`)
- Test: `client/tests/closure.test.tsx`

**Interfaces:**
- Consumes: la API de la Tarea 4 y `ReopenDialog` (Tarea 7).
- Produces:
  - **Clave:** `closureKey(projectId) = ['project', projectId, 'closure']`.
  - **Pestaña:** `{ to: 'cierre', label: 'Cierre', pmOnly: true }`, la última de la lista, con su ruta bajo `ProjectPmOnly`.
  - **Enlaces de los pendientes:** `deliverables` → `entregables`, `incidents` → `incidentes`, `risks` → `riesgos`, `tasks` → `tareas`, `objectives` → `resumen`, `charter` → `acta`.
  - **`ClosureReportView({ report, preview })`:** secciones con títulos `h3` "Fechas", "Presupuesto", "Desempeño", "Objetivos", "Entregables", "Cambios", "Incidentes y riesgos". Con `preview` muestra la etiqueta "Vista previa". Una desviación de presupuesto negativa usa `text-danger`. Sin `performance` muestra "Sin línea base". El dinero se formatea con el helper de dinero que ya existe en `@pm/shared` o en `client/src/lib/display.ts`.
  - **`CloseProjectDialog`:** campos "Estado final" (Cerrado o Cancelado), "Resumen de cierre" (`RichTextEditor`) y "Motivo de los pendientes", este último solo si `report.pendings.length > 0`. El botón "Cerrar proyecto" está desactivado mientras falte el motivo. Al terminar, invalida `closureKey`, `['project', id]`, los proyectos y `['dashboard']`.
  - **Proyecto cerrado:**
    - se muestran el resumen (`RichTextView`), el motivo y el botón "Imprimir informe" (`window.print()`);
    - con `legacy`, la nota "Cerrado antes del registro de cierres";
    - "Historial de cierre" es una lista con "Cerrado/Cancelado el <fecha> por <nombre>" y "Reabierto el <fecha> por <nombre>: <motivo>".
  - **Impresión:** `@media print` oculta `nav`, `header` y `[data-print-hide]`. Marca con `data-print-hide` las pestañas, los botones y el aviso.

- [ ] **Step 1: Write the failing tests:**
  - **"abierto: pendientes con enlaces y vista previa":** con `report.pendings` igual a `[{ kind: 'tasks', count: 2 }]`, se ve "Tareas sin terminar", un enlace con `href` `/proyectos/p1/tareas`, el texto "Vista previa" y la sección "Presupuesto".
  - **"sin pendientes":** se ve "Sin pendientes".
  - **"cerrar exige motivo si hay pendientes":**
    - en "Cerrar proyecto", el botón de confirmar está desactivado;
    - se elige "Cancelado" y se escribe el motivo "Se canceló el contrato";
    - el cuerpo del POST es `{ finalStatus: 'CANCELLED', summary: '', pendingReason: 'Se canceló el contrato' }`.
  - **"cerrado: informe congelado, imprimir e historial":**
    - con `status: 'closed'` no aparece "Vista previa";
    - el botón "Imprimir informe" llama a `window.print` (espíalo con `vi.spyOn(window, 'print').mockImplementation(() => {})`);
    - el historial muestra "Reabierto el" con su motivo cuando `history[1].reopenReason` tiene texto.
  - **"sin línea base":** con `report.performance: null` se ve "Sin línea base".
  - **"legacy":** con `legacy: true` se ve "Cerrado antes del registro de cierres".
- [ ] **Step 2: Run** `npm test -w client -- closure` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: pestaña Cierre con informe`.

---

### Task 9: Lecciones en el proyecto y página global

**Files:**
- Create: `client/src/pages/project/Lessons.tsx`, `client/src/pages/Lessons.tsx`, `client/src/components/lessons/LessonForm.tsx`, `client/src/components/lessons/LessonCard.tsx`
- Modify: `client/src/api/types.ts` (`Lesson`), `client/src/router.tsx`, `client/src/pages/project/ProjectLayout.tsx`, `client/src/components/AppLayout.tsx`
- Test: `client/tests/lessons.test.tsx`

**Interfaces:**
- Consumes: la API de la Tarea 6.
- Produces:
  - **Claves:** `lessonsKey(projectId) = ['project', projectId, 'lessons']` y `['lessons', filtros]` para la página global.
  - **Pestaña:** `{ to: 'lecciones', label: 'Lecciones' }` después de `incidentes`, para todos.
  - **Navegación:** `{ to: '/lecciones', label: 'Lecciones', Icon: Lightbulb }` en las listas del PM y del colaborador, después de Calendario. La ruta `/lecciones` va dentro de `RequireAuth`.
  - **`LessonCard({ lesson, showProject, onEdit?, onDelete? })`:**
    - etiqueta de tipo: `success` para "Funcionó bien" y `warning` para "A mejorar";
    - categoría, "Situación", "Recomendación", autor y fecha;
    - con `showProject`, un enlace con el nombre del proyecto a `/proyectos/<id>/lecciones`;
    - "Editar" y "Eliminar" solo si `canEdit` y se pasan sus callbacks.
  - **`LessonForm({ projectId, item?, onClose })`:** ventanas "Añadir lección" y "Editar lección", con "Tipo", "Categoría", "Situación" y "Recomendación".
  - **Pestaña del proyecto:** filtros "Tipo" y "Categoría" (en el cliente), el botón "Añadir lección" (visible también con `readOnly`) y, vacía, "Aún no hay lecciones aprendidas.". Eliminar usa `ConfirmDialog`.
  - **Página global:** "Buscar" (300 ms tras teclear), "Categoría", "Tipo" y "Proyecto". Las opciones de proyecto salen de los proyectos que aparecen en las lecciones cargadas sin filtrar. Llama a `GET /api/lessons?…`. Vacía, muestra "No hay lecciones que coincidan.".

- [ ] **Step 1: Write the failing tests:**
  - **"pestaña: crear":** "Añadir lección" con tipo "A mejorar", categoría "Costos" y situación "Se subestimó" → el cuerpo del POST es `{ type: 'TO_IMPROVE', category: 'COST', situation: 'Se subestimó', recommendation: '' }`.
  - **"editar solo con canEdit":** una lección con `canEdit: false` no tiene botón "Editar"; una con `canEdit: true` sí.
  - **"filtros de la pestaña":** con dos lecciones de distinta categoría, elegir "Costos" deja solo una.
  - **"se puede añadir con el proyecto cerrado":** con un proyecto `CLOSED`, "Añadir lección" está visible.
  - **"página global: búsqueda y enlace":**
    - en `/lecciones`, escribir "subestim" en "Buscar" acaba llamando a `GET /api/lessons?q=subestim`;
    - la tarjeta tiene el enlace "Portal" a `/proyectos/p1/lecciones`;
    - la navegación "Principal" incluye el enlace "Lecciones".
- [ ] **Step 2: Run** `npm test -w client -- lessons` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: lecciones aprendidas en el proyecto y página global`.

---

### Task 10: Flujo completo, README y verificación

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `README.md`

- [ ] **Step 1: Extend the e2e flow,** al final, antes del bloque "El PM ve el avance actualizado". Si ese bloque necesita el proyecto abierto, ponlo después de reabrir.
  1. El PM abre "Cierre", ve la tarjeta de pendientes ("Tareas sin terminar"), pulsa "Cerrar proyecto", escribe el motivo "Se entrega en la fase 2" y confirma.
  2. Se ve el aviso "solo lectura" y, en "Tareas", ya no está "Nueva tarea".
  3. Carlos abre "Lecciones" → "Añadir lección" con la situación "Las pruebas empezaron tarde".
  4. El PM va a "Lecciones" en la navegación principal, busca "pruebas" y ve la lección de Carlos.
  5. El PM vuelve al proyecto → "Reabrir" con el motivo "Seguimos con la fase 2".
- [ ] **Step 2: Run** `npm run build` y luego `npm run test:e2e` → PASS.
- [ ] **Step 3: Update `README.md`** con la sección "Cierre y lecciones aprendidas": pendientes y motivo; solo lectura y reabrir; informe imprimible; lecciones por proyecto y página global; los proyectos cerrados antes de esta versión; copiar `data/` antes de actualizar.
- [ ] **Step 4: Verify:**
  - `npm test`, `npm run build` y `npm run test:e2e` en verde;
  - en el navegador a 375 px: la pestaña Cierre, la ventana "Cerrar proyecto", la pestaña Lecciones, la página global y el aviso de solo lectura, sin desplazamiento horizontal de página;
  - la vista de impresión (`emulateMedia print` o revisión visual) oculta la navegación.
- [ ] **Step 5: Commit** `test: flujo completo con cierre y lecciones; docs: README`.
