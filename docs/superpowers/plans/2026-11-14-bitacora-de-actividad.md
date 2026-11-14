# Bitácora de actividad (F3): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda escritura exitosa sobre un proyecto deja un registro (quién, cuándo, acción, elemento, cambios en campos vigilados) que el PM consulta en la pestaña «Actividad».

**Architecture:** Un middleware de Hono, registrado después de `registerClosedGuard`, busca el patrón de la ruta en una tabla central (`server/src/activity/table.ts`). Lee una «foto» del elemento antes y después de la escritura, compara con una función pura y guarda un `ActivityLog` antes de responder. Una prueba de cobertura obliga a clasificar cada ruta de escritura.

**Tech Stack:** Hono, Prisma 6 sobre PostgreSQL, Zod (shared), React 19 + TanStack Query, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-bitacora-de-actividad-design.md`

## Global Constraints

- Interfaz, mensajes y commits en español; commits `feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`, uno por tarea, con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Rama `bitacora-de-actividad`; nunca editar una migración aplicada.
- Toda tabla pública con RLS activado (`server/tests/rls.test.ts`).
- Sección nueva `activity` en `ACCESS`: PM `read`, Colaborador `none`, Observador `none`.
- Errores con `AppError`; 403 con `forbidden()`.
- Nada en segundo plano después de responder: el registro se inserta con `await` antes de devolver la respuesta.
- Si registrar falla, la respuesta de la escritura sale igual y el error va a `console.error`.
- Dinero en centavos como número en `changes`; fechas `YYYY-MM-DD`; ids de persona guardados como nombre.
- Página de la API: 50 registros, del más reciente al más antiguo.
- Pruebas del servidor: desde `server/`, `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>` (requiere `docker compose up -d`).

## Review Focus

1. Escritura sobre un proyecto cerrado (409) o de un observador (403): no deja registro — prueba en Task 4.
2. Completar dos veces el mismo anexo: un solo registro `uploaded` — prueba en Task 6.
3. Borrar una tarea con pasos y comentarios: un solo registro (`task` `deleted`), sin registros por las cascadas — prueba en Task 4.
4. Renombrar después a la persona responsable: el registro conserva el nombre anterior — prueba en Task 5.
5. Colaborador cambia el estado de su riesgo: queda registrado a su nombre, y él sigue recibiendo 403 en `GET …/activity` — prueba en Task 7.

---

### Task 1: Modelo, migración y tipos compartidos

**Files:**
- Modify: `server/prisma/schema.prisma` (modelo `ActivityLog`; relaciones `activityLogs ActivityLog[]` en `Project` y `User`)
- Create: `server/prisma/migrations/20261114120000_add_activity_log/migration.sql`
- Modify: `shared/src/access.ts`, `shared/src/enums.ts`, `shared/src/index.ts`
- Test: `shared/tests/access.test.ts`, `shared/tests/activity.test.ts` (nuevo)

**Interfaces:**
- Produces (shared):
  - `ACTIVITY_ENTITY = ['project','member','task','step','comment','attachment','objective','milestone','stakeholder','risk','expense','raci','change','incident','decision','deliverable','lesson'] as const`, `type ActivityEntity`
  - `ACTIVITY_ACTION = ['created','updated','deleted','approved','closed','reopened','baselined','decided','reviewed','commented','uploaded'] as const`, `type ActivityAction`
  - `type ActivityChange = { field: string; from?: string | number | boolean | string[] | null; to?: string | number | boolean | string[] | null }` (sin `from`/`to` = campo no vigilado)
  - `LABELS.activityEntity` (nombres para el filtro, p. ej. `task: 'Tarea'`, `step: 'Paso'`, `change: 'Solicitud de cambio'`, `raci: 'RACI'`), `LABELS.activityField` (ver Task 8)
  - `SECTIONS` incluye `'activity'`

- [x] **Step 1: Pruebas que fallan.** En `shared/tests/access.test.ts` añadir `activity: ['read', 'none', 'none']` a `EXPECTED`. En `shared/tests/activity.test.ts`: `ACTIVITY_ENTITY` y `ACTIVITY_ACTION` tienen exactamente los valores de arriba, y cada entidad tiene etiqueta en `LABELS.activityEntity`.
- [x] **Step 2:** `npm test -w shared` → FAIL (falta `activity`, falta el módulo).
- [x] **Step 3: Implementar.** Las constantes viven en `shared/src/enums.ts` junto a las demás. Modelo Prisma como en la sección 4.1 de la especificación. SQL de la migración (copia exacta):

```sql
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT NOT NULL DEFAULT '',
    "changes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActivityLog_projectId_createdAt_idx" ON "ActivityLog"("projectId", "createdAt");
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Sin políticas: solo la conexión del servidor accede a la tabla.
ALTER TABLE "ActivityLog" ENABLE ROW LEVEL SECURITY;
```

  Después: `npx prisma generate` en `server/` y comprobar con `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <TEST_DATABASE_URL>` que no queda diferencia.
- [x] **Step 4:** `npm test -w shared` → PASS; en `server/`, `rls.test.ts` y `accessMatrix.test.ts` → PASS (la matriz no cambia hasta Task 7 porque aún no hay rutas `activity`).
- [x] **Step 5: Commit** `feat: modelo de la bitácora de actividad y su sección de acceso`

### Task 2: Contexto de ruta compartido

**Files:**
- Create: `server/src/routeContext.ts`
- Modify: `server/src/closedGuard.ts` (importa de `routeContext.ts`; sin cambio de comportamiento)
- Test: `server/tests/closedGuard.test.ts` (existente, sin cambios)

**Interfaces:**
- Produces: `routePatternOf(c: Ctx): string | null`, `idOf(c: Ctx): string | null`, `projectIdOf(prisma: PrismaClient, id: string, pattern: string): Promise<string | null>`, `under(pattern: string, prefix: string): boolean`, `WRITE_METHODS: ReadonlySet<string>` — mismas firmas y cuerpos que hoy en `closedGuard.ts`, movidos.

- [x] **Step 1:** Mover las funciones y exportarlas; `closedGuard.ts` las importa.
- [x] **Step 2:** `closedGuard.test.ts` y `observerGuard.test.ts` → PASS.
- [x] **Step 3: Commit** `refactor: el contexto de ruta de los guardias queda en un módulo común`

### Task 3: Comparación de fotos (regla pura)

**Files:**
- Create: `server/src/domain/activityDiff.ts`
- Test: `server/tests/domain/activityDiff.test.ts`

**Interfaces:**
- Produces:
  - `type ActivityValue = string | number | boolean | string[] | null`
  - `type Snapshot = { label: string; values: Record<string, ActivityValue> }`
  - `diffSnapshots(before: Snapshot | null, after: Snapshot | null, watched: readonly string[]): ActivityChange[]`
  - `toActivityValue(value: unknown): ActivityValue` (BigInt → number; Date → ISO; `undefined` → `null`; arreglos → copia ordenada de strings)

- [x] **Step 1: Pruebas que fallan:**
  - campo vigilado cambiado → `{ field: 'status', from: 'IN_PROGRESS', to: 'DONE' }`
  - campo no vigilado cambiado → `{ field: 'description' }` (sin `from`/`to`)
  - sin cambios → `[]`
  - `before` nulo (creación) o `after` nulo (borrado) → `[]`
  - las claves `id`, `projectId`, `createdAt`, `updatedAt` nunca aparecen
  - listas con el mismo contenido en otro orden → sin cambio; `['Ana']` → `['Ana','Luis']` sí cambia
  - orden del resultado: primero los vigilados en el orden de `watched`, luego los demás en orden alfabético
  - `toActivityValue(10n) === 10`
- [x] **Step 2:** ejecutar → FAIL (módulo no existe).
- [x] **Step 3:** Implementar.
- [x] **Step 4:** ejecutar → PASS.
- [x] **Step 5: Commit** `feat: comparación de valores antes y después para la bitácora`

### Task 4: Middleware, tabla base y cobertura

**Files:**
- Create: `server/src/activity/types.ts`, `server/src/activity/table.ts`, `server/src/activity/loaders.ts`, `server/src/activityLog.ts`
- Modify: `server/src/app.ts` (`registerActivityLog(app)` justo después de `registerClosedGuard(app)`)
- Test: `server/tests/activityLog.test.ts` (nuevo), `server/tests/activityCoverage.test.ts` (nuevo)

**Interfaces:**
- Consumes: Task 2 (`routePatternOf`, `projectIdOf`, `WRITE_METHODS`), Task 3 (`Snapshot`, `diffSnapshots`).
- Produces (`server/src/activity/types.ts`):

```ts
export type ActivityEntry = {
  entity: ActivityEntity;
  /** Fija la acción; sin ella: POST created, PATCH/PUT updated, DELETE deleted. */
  action?: ActivityAction | ((before: Snapshot | null, after: Snapshot | null) => ActivityAction);
  /** Clave del elemento. Se llama antes de la escritura (response = undefined) y, si dio null, otra vez después con el JSON de la respuesta. */
  target: (c: Ctx, response?: any) => string | null | Promise<string | null>;
  load: (prisma: PrismaClient, key: string) => Promise<Snapshot | null>;
  fields: readonly string[];
  /** true = no registrar (p. ej. anexo ya completado). */
  skip?: (before: Snapshot | null, after: Snapshot | null) => boolean;
};
```

  - `ACTIVITY_TABLE: Record<string, ActivityEntry>` con clave `"MÉTODO patrón"` (p. ej. `'PATCH /api/tasks/:id'`).
  - `NOT_LOGGED: Record<string, string>` misma clave → motivo.
  - Ayudantes en `loaders.ts`: `param(name)` (target desde `c.req.param(name)`), `responseId` (target desde `response.id`), y un `load` por tipo; en esta tarea `loadProject` (incluye `charter`, sus campos van en `values` con prefijo `charter.`), `loadTask` (incluye asignados como lista de nombres en `assignees`, `milestoneId` como nombre del hito), `loadStep` (`assigneeId` como nombre; etiqueta «Tarea · Paso»), `loadComment` (etiqueta = título de la tarea).
- `registerActivityLog(app: App): void`

  Orden dentro del middleware: si no es escritura, no hay usuario o no hay entrada → `next()`. Antes de `next()`: `projectId` con `projectIdOf` (para `POST /api/projects`, después, desde `response.id`), `key = await target(c)`, `before = key && método ≠ POST-de-creación ? load(key) : null`. Después de `next()`, solo con estado 2xx: leer `await c.res.clone().json()`, completar `key`/`projectId` si faltaban, `after = método ≠ DELETE ? load(key) : null`, aplicar `skip`, insertar `{ projectId, userId, action, entity, entityId: key, entityLabel: (after ?? before).label, changes: diffSnapshots(before, after, fields) }`. Todo lo posterior a `next()` dentro de `try/catch` → `console.error('bitácora', error)`.

- [x] **Step 1: Pruebas que fallan (`activityLog.test.ts`):**
  - PM crea tarea → registro `{ entity: 'task', action: 'created', entityLabel: 'Diseño', changes: [] }`, `userId` = PM.
  - colaborador asignado cambia avance por `PATCH /api/tasks/:id/progress` de `TODO` a `IN_PROGRESS` → `changes` contiene `{ field: 'status', from: 'TODO', to: 'IN_PROGRESS' }`.
  - PM cambia la descripción → `changes` = `[{ field: 'description' }]`, `action: 'updated'`.
  - `PUT /api/tasks/:id/assignees` de `[Ana]` a `[Ana, Luis]` → `{ field: 'assignees', from: ['Ana'], to: ['Ana','Luis'] }`.
  - borrar una tarea con un paso y un comentario → exactamente un registro nuevo, `task` `deleted` con `entityLabel` = título.
  - `PATCH /api/projects/:id` cambiando `endDate` → `{ field: 'endDate', from: …, to: '2026-12-31' }`; `POST /api/projects` → registro `project` `created` en el proyecto nuevo.
  - respuesta 400 (validación) → ningún registro; observador intenta escribir (403) → ninguno; escritura sobre proyecto cerrado (409) → ninguno.
  - fallo al registrar: `await ctx.prisma.$executeRawUnsafe('DROP TABLE "ActivityLog"')` y luego `PATCH /api/tasks/:id` → 200 con el mismo cuerpo que sin bitácora.
- [x] **Step 2: Prueba de cobertura (`activityCoverage.test.ts`):** toda ruta de `listRoutes(ctx.app)` con método de escritura está en `ACTIVITY_TABLE` o en `NOT_LOGGED`, y ninguna en ambas; `NOT_LOGGED` contiene exactamente las rutas de la sección 4.3 de la especificación (auth, setup, users, solicitudes de subida de anexos, `PUT /api/local-uploads/:storedName`, `DELETE /api/projects/:id`). En esta tarea la tabla cubre: proyecto (`POST /api/projects`, `PATCH /api/projects/:id`), tareas, progreso, asignados, pasos y comentarios; el resto se añade en Tasks 5 y 6, así que la prueba de cobertura se marca `it.todo` hasta Task 6 y se activa allí.
- [x] **Step 3:** ejecutar → FAIL.
- [x] **Step 4:** Implementar.
- [x] **Step 5:** ejecutar `activityLog.test.ts` → PASS; suite completa del servidor → PASS.
- [x] **Step 6: Commit** `feat: middleware de la bitácora con tareas, pasos, comentarios y proyecto`

### Task 5: Registros, incidentes, decisiones, cambios y lecciones

**Files:**
- Modify: `server/src/activity/table.ts`, `server/src/activity/loaders.ts`
- Test: `server/tests/activityRegisters.test.ts` (nuevo)

**Interfaces:**
- Consumes: Task 4 (`ActivityEntry`, `param`, `responseId`).
- Campos vigilados (copia de la especificación): `objective` `['status']`; `milestone` `['status','dueDate']`; `stakeholder` `[]`; `risk` `['status','ownerId','probability','impact']`; `expense` `['amountCents','date','category']`; `change` `['status','scheduleImpactDays','costImpactCents']`; `incident` `['status','ownerId','priority','dueDate']`; `decision` `['decidedOn']`; `lesson` `['type','category']`.
- Etiquetas: incidente «INC-n Título»; desde riesgo «INC-n Título (desde el riesgo «Descripción»)»; solicitud de cambio «CC-n Título» (usar el prefijo que ya muestra la interfaz de cambios); decisión «DEC-n Título» (ídem); riesgo y objetivo = descripción en texto plano (sin HTML, cortada a 120 caracteres).
- `POST …/change-requests/:crId/decision` → `action: 'decided'`. `POST …/risks/:riskId/incident` → `entity: 'incident'`, `action: 'created'`, target `responseId`.

- [x] **Step 1: Pruebas que fallan:** por cada tipo, crear/editar/borrar deja `created`/`updated`/`deleted` con su etiqueta; riesgo cambiando `ownerId` de Ana a Luis → `{ field: 'ownerId', from: 'Ana', to: 'Luis' }`; después renombrar a Ana (`PATCH /api/users/:id`) y el registro sigue diciendo `'Ana'`; gasto `amountCents` 1000 → 2500 → `{ from: 1000, to: 2500 }`; decidir un cambio → `action: 'decided'`, `{ field: 'status', from: 'PENDING', to: 'APPROVED' }`; incidente desde riesgo → `entity: 'incident'` con la etiqueta «(desde el riesgo «…»)»; lección creada en proyecto cerrado → registrada.
- [x] **Step 2:** ejecutar → FAIL.
- [x] **Step 3:** Implementar las entradas (las cinco rutas de `registerProjectCrud` comparten forma: un ayudante `crudEntries(path, entry)` que devuelve las tres claves).
- [x] **Step 4:** ejecutar → PASS.
- [x] **Step 5: Commit** `feat: la bitácora cubre registros, incidentes, decisiones, cambios y lecciones`

### Task 6: Entregables, miembros, RACI, dependencias, anexos y acta

**Files:**
- Modify: `server/src/activity/table.ts`, `server/src/activity/loaders.ts`
- Modify: `server/tests/activityCoverage.test.ts` (activar la prueba)
- Test: `server/tests/activityOther.test.ts` (nuevo)

**Interfaces:**
- Consumes: Task 4.
- Claves compuestas (el `target` lee `c.req.param` y, si hace falta, `await c.req.json()`): miembro `projectId:userId`; RACI `activityId:kind:partyId`; dependencia `successorId:predecessorId`.
- Entradas:
  - `deliverable` `['status','dueDate']`, etiqueta «Nombre»; criterio `['met']` con etiqueta «Entregable · Criterio»; `PUT …/criteria/order` → `updated`, `changes: [{ field: 'criteriaOrder' }]` fijo; `POST …/reviews` → `action: 'reviewed'`, entidad `deliverable`.
  - `member` `['projectRole']`, etiqueta = nombre de la persona; `POST …/members` target desde la respuesta (`projectId:userId`).
  - `raci` `['role']`, etiqueta «Actividad · Persona o interesado»; acción `created` si `before` es null, `deleted` si `after` es null, si no `updated`. Las actividades RACI (`…/raci/activities…`) son `raci` con etiqueta = título.
  - dependencias: `entity: 'task'`, etiqueta «Tarea ← Predecesora», `created` / `deleted`.
  - `POST /api/attachments/:id/complete` → `entity: 'attachment'`, `action: 'uploaded'`, `skip` si `before.values.uploadedAt` no es null; `DELETE /api/attachments/:id` → `deleted`. Etiqueta = nombre del archivo.
  - `PUT …/charter` → `project` `updated`; `POST …/charter/approve` → `approved`; `POST …/closure` → `closed`; `POST …/reopen` → `reopened`; `POST …/baselines` → `baselined`.

- [x] **Step 1: Pruebas que fallan:** asignar rol R en RACI → `raci` `created` `{ field: 'role', from: null, to: 'R' }`; cambiarlo a A → `updated`; quitarlo (`role: null`) → `deleted`; criterio marcado → `{ field: 'met', from: false, to: true }` con etiqueta «Portal · Funciona en móvil»; completar un anexo dos veces → un solo registro `uploaded`; añadir dependencia → `task` `created` «Construcción ← Diseño»; aprobar acta → `approved`; editar el acta cambiando su alcance → `changes` contiene `{ field: 'charter.scope' }` (usar el nombre real del campo del modelo `Charter`); revisión de entregable → `reviewed`.
- [x] **Step 2:** activar la prueba de cobertura; ejecutar ambas → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** ejecutar → PASS; suite completa del servidor → PASS.
- [x] **Step 5: Commit** `feat: la bitácora cubre entregables, RACI, miembros, anexos y acta`

### Task 7: API de consulta y permisos

**Files:**
- Create: `server/src/routes/activity.ts` (`activityRoutes(app)`, registrado en `app.ts`)
- Modify: `server/tests/accessMatrix.test.ts` (`ROUTE_SECTION` añade las dos rutas con sección `activity`)
- Test: `server/tests/activityRoutes.test.ts` (nuevo)

**Interfaces:**
- Produces:
  - `GET /api/projects/:id/activity?userId=&entity=&before=` → `{ items: ActivityLogDto[]; nextCursor: string | null }`, donde `ActivityLogDto = { id, action, entity, entityId, entityLabel, changes: ActivityChange[], createdAt: string, user: { id, name } }`. Orden `createdAt desc, id desc`; `before` = id del último registro de la página anterior; 50 por página.
  - `GET /api/projects/:id/activity/filters` → `{ users: { id, name }[]; entities: ActivityEntity[] }` (solo los que tienen registros, personas por nombre).
  - Ambas usan `requireProjectAccess(c, id, 'activity', 'read')`. `entity` inválido → 400 con `fieldError('entity', 'Tipo de elemento no válido')`.

- [x] **Step 1: Pruebas que fallan:** 51 registros → primera página 50 y `nextCursor`, segunda página 1 y `nextCursor: null`; filtro por `userId` y por `entity`; `filters` devuelve personas y tipos presentes; colaborador y observador miembros → 403 en ambas; el colaborador que cambió el estado de su riesgo aparece como autor del registro y aun así recibe 403.
- [x] **Step 2:** ejecutar → FAIL; `accessMatrix.test.ts` → FAIL (rutas nuevas sin clasificar).
- [x] **Step 3:** Implementar.
- [x] **Step 4:** ejecutar → PASS; suite completa del servidor → PASS.
- [x] **Step 5: Commit** `feat: consulta de la bitácora solo para el PM`

### Task 8: Pestaña «Actividad»

**Files:**
- Create: `client/src/lib/activity.ts`, `client/src/pages/project/Activity.tsx`
- Modify: `client/src/api/types.ts` (`ActivityLog`, `ActivityPage`, `ActivityFilters`), `client/src/pages/project/ProjectLayout.tsx` (pestaña `{ to: 'actividad', label: 'Actividad', section: 'activity' }` antes de «Cierre»), `client/src/router.tsx` (ruta `actividad` dentro de `ProjectSection section="activity"`), `shared/src/enums.ts` (`LABELS.activityField`)
- Test: `client/tests/activity.test.tsx` (nuevo), `client/tests/activityText.test.ts` (nuevo)

**Interfaces:**
- Consumes: Task 7 (formas de respuesta).
- Produces (`client/src/lib/activity.ts`):
  - `describeActivity(log: ActivityLog): string` → «creó la tarea «Diseño»», «cambió el riesgo «X»» (hay algún cambio con valores), «actualizó el entregable «Portal»» (ninguno con valores). Verbos: created «creó», deleted «borró», approved «aprobó», closed «cerró», reopened «reabrió», baselined «fijó la línea base de», decided «decidió», reviewed «revisó», commented «comentó en», uploaded «subió». Sustantivo con artículo por entidad (el proyecto, la tarea, el paso, el anexo, el riesgo, la solicitud de cambio, la celda RACI…).
  - `describeChanges(log: ActivityLog, currency: string): { valued: string[]; others: string[] }` → `valued`: «Estado: En curso → Terminada», «Avance: 80 % → 100 %»; `others`: etiquetas de campo («descripción»). Valores: enumeraciones con el `LABELS` del tipo (`status` de `task` → `taskStatus`, de `risk` → `riskStatus`, etc.), `*Cents` con el formateador de moneda existente, fechas `YYYY-MM-DD` con `shortDate`, booleanos «Sí»/«No», `progress` con « %», listas unidas con «, », vacío/null «—».
  - `LABELS.activityField`: `status` «Estado», `startDate` «Inicio», `endDate` «Fin», `dueDate` «Fecha límite», `plannedBudgetCents` «Presupuesto», `progress` «Avance», `plannedCostCents` «Costo planeado», `milestoneId` «Hito», `assignees` «Asignados», `done` «Hecho», `assigneeId` «Responsable», `ownerId` «Responsable», `probability` «Probabilidad», `impact` «Impacto», `amountCents` «Monto», `date` «Fecha», `category` «Categoría», `scheduleImpactDays` «Impacto en plazo (días)», `costImpactCents` «Impacto en costo», `priority` «Prioridad», `decidedOn` «Fecha de decisión», `met` «Cumplido», `type` «Tipo», `projectRole` «Rol en el proyecto», `role` «Rol RACI», `criteriaOrder` «orden de criterios», `description` «descripción». Campo sin etiqueta: se muestra su nombre; `charter.x` → «acta».

- [x] **Step 1: Pruebas que fallan (`activityText.test.ts`):** los ejemplos de arriba, incluido el dinero («US$ 10,00 → US$ 25,00» o el formato que dé el formateador existente) y «—» para null.
- [x] **Step 2: Pruebas que fallan (`activity.test.tsx`):** el PM ve la pestaña «Actividad» y la página lista registros agrupados por día («Hoy» y la fecha corta), con hora, persona, frase y cambios; al elegir persona en el filtro se pide `?userId=`; «Ver más» pide `?before=<último id>` y desaparece con `nextCursor: null`; el colaborador no ve la pestaña y entrar a `/actividad` lo lleva a `resumen`.
- [x] **Step 3:** `npm test -w client` → FAIL.
- [x] **Step 4:** Implementar con `useInfiniteQuery`. Diseño según el boceto de la sección 4.6 de la especificación; el nombre del elemento no es enlace.
- [x] **Step 5:** `npm test -w client` y `npm test -w shared` → PASS.
- [x] **Step 6: Commit** `feat: pestaña Actividad del proyecto`

### Task 9: Flujo completo

**Files:**
- Modify: `e2e/main-flow.spec.ts`

- [x] **Step 1:** Después del paso 6 (Carlos descarga el anexo), el PM abre `${projectUrl}/actividad` y comprueba: hay una fila con «Beatriz» y «Diseño» que contiene el texto `/Estado: .+ → Hecha/`; Carlos no ve la pestaña «Actividad» en `tabs`.
- [x] **Step 2:** `npm run build` y `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npm run test:e2e` → PASS.
- [x] **Step 3: Commit** `test: la bitácora en el flujo principal`

### Task 10: Cierre del plan

- [x] **Step 1:** `npm test` con `TEST_DATABASE_URL` → todo PASS.
- [x] **Step 2:** Marcar las casillas de este plan y en `docs/guia-implementacion-pmbok.md` anotar F3 como hecha en la tabla de la sección 7 (columna Bloques, «F3 ✓»).
- [x] **Step 3: Commit** `docs: marca las tareas del plan de la bitácora`
