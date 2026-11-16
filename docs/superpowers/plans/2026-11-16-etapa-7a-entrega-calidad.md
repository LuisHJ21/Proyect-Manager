# Etapa 7, bloque A: entrega y calidad — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** requisitos con trazabilidad a entregables, tareas y criterios (F12), y métricas de calidad más defectos y no conformidades dentro de los incidentes (F13).

**Architecture:**
- Registros nuevos `Requirement` y `QualityMetric`/`QualityMeasurement`, cada uno con su archivo de rutas; tablas de unión para requisito–entregable y cambio–requisito.
- Reglas puras en `server/src/domain/traceability.ts` (matriz y `suggestMet`) y `server/src/domain/quality.ts` (estado de una métrica).
- Los incidentes ganan `kind` y `deliverableId`; la revisión de entregables crea la no conformidad en su misma transacción.

**Tech Stack:** Hono, Prisma 6 sobre PostgreSQL, Zod en `shared`, React 19 con TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-etapa-7a-entrega-calidad-design.md`

## Global Constraints

- **Rama y commits:** rama `etapa-7a`, un commit por tarea, mensajes en español con prefijo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas:** servidor desde `server/`: `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`; cliente desde `client/`: `npx vitest run <archivo>` y `npx tsc -b`; shared desde `shared/`: `npx vitest run`. Al cerrar cada tarea que toque `shared/src/enums.ts` o `access.ts`, correr también la suite de `shared`.
- **Reglas de siempre:** `AppError`/`fieldError` en español; validación solo en `shared/src/schemas.ts`; migración nueva a mano con `ENABLE ROW LEVEL SECURITY` en cada tabla nueva; rutas de escritura en `closedGuard` (y su lista en `server/tests/closedGuard.test.ts`), en `ROUTE_SECTION` de `server/tests/accessMatrix.test.ts` (`FINE_GRAINED` donde el colaborador escribe por regla fina) y en `server/src/activity/table.ts` (entidad nueva en `ACTIVITY_ENTITY`, su etiqueta, `client/src/lib/activity.ts` y `shared/tests/activity.test.ts`); textos con formato con `sanitizeRichText`; nada en memoria.
- **Visibilidad:** el colaborador y el observador nunca reciben `stakeholder` de un requisito.
- **Mensajes exactos:** «El entregable no pertenece a este proyecto» · «El interesado no pertenece a este proyecto» · «El requisito no pertenece a este proyecto» · «No se registran mediciones futuras» · «Solo se registra una no conformidad al rechazar» · «Todos sus entregables están aceptados» · «Sin entregable» · «Entregables sin requisito».

## Review Focus

1. Borrar un entregable ligado a requisitos: el requisito sigue, pierde el vínculo y la matriz lo muestra «Sin entregable». Prueba en Task 4.
2. Dos personas editan el mismo requisito: la segunda recibe 409 (versión). Prueba en Task 3.
3. Rechazar con no conformidad cuando la revisión falla (p. ej. sin motivo): no se crea ningún incidente; aceptar con `nonconformity` da 400. Prueba en Task 7.
4. Dos mediciones con la misma fecha: cuenta la última registrada. Prueba en Task 6.
5. Un colaborador propone un cambio citando un requisito de otro proyecto: 400 y nada creado. Prueba en Task 5.

---

### Task 1: Permisos, enumeraciones y esquemas

**Files:** Modify `shared/src/access.ts`, `shared/src/enums.ts`, `shared/src/schemas.ts`, `shared/tests/access.test.ts`; Test `shared/tests/stage7a.test.ts`.

**Interfaces — Produces:**
- `SECTIONS` + `'requirements'`, `'quality'`: PM `write`, COLLABORATOR `read`, OBSERVER `read`.
- `REQUIREMENT_STATUS = ['PROPOSED','APPROVED','MET','REJECTED']`; `INCIDENT_KIND = ['INCIDENT','DEFECT','NONCONFORMITY']`; `METRIC_DIRECTION = ['HIGHER_BETTER','LOWER_BETTER']`.
- `LABELS.requirementStatus` («Propuesto», «Aprobado», «Cumplido», «Rechazado»), `LABELS.incidentKind` («Incidente», «Defecto», «No conformidad»), `LABELS.metricDirection` («Mayor es mejor», «Menor es mejor»).
- `createRequirementSchema { description: longText('Describe el requisito'), priority: PRIORITY default 'MEDIUM', status: REQUIREMENT_STATUS default 'PROPOSED', stakeholderId: optionalId, acceptance: noteText default '', deliverableIds: string[] default [] }`; `updateRequirementSchema` = todos opcionales + `version: versionField`.
- `changeRequestSchema`, `updateChangeRequestSchema` y `proposeChangeSchema` aceptan `requirementIds: string[]` (opcional; en crear default `[]`).
- `createQualityMetricSchema { name: shortText('Escribe el nombre de la métrica'), unit: shortText default '', target: number finito, direction: METRIC_DIRECTION default 'HIGHER_BETTER', deliverableId: optionalId }`; `updateQualityMetricSchema` parcial; `measurementSchema { date: calendarDateSchema, value: number finito, note: noteText default '' }`.
- `pmIncidentFields` + `kind: z.enum(INCIDENT_KIND).optional()`, `deliverableId: optionalId`.
- `deliverableReviewSchema` + `nonconformity: z.object({ title: shortText('Escribe el título') }).optional()` con `superRefine`: si viene y `outcome !== 'REJECTED'` → issue en `nonconformity` «Solo se registra una no conformidad al rechazar».

- [ ] **Step 1:** Pruebas en `stage7a.test.ts`: niveles de las dos secciones para los tres perfiles; `deliverableReviewSchema.safeParse({ outcome: 'ACCEPTED', reviewedOn: '2026-11-16', nonconformity: { title: 'X' } })` falla con ese mensaje y con `REJECTED` pasa; `createRequirementSchema.parse({ description: 'A' })` da `priority: 'MEDIUM', status: 'PROPOSED', deliverableIds: []`; `measurementSchema` rechaza `value: NaN`; `updateIncidentSchema` acepta `kind: 'DEFECT'`. Ampliar `EXPECTED` de `access.test.ts`.
- [ ] **Step 2:** `npx vitest run` en `shared/`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Misma orden y `npx tsc -b` en `client/`. Expected: PASS y sin errores.
- [ ] **Step 5:** Commit `feat: permisos y esquemas de requisitos y calidad`.

### Task 2: Migración

**Files:** `server/prisma/schema.prisma`; Create `server/prisma/migrations/20261117090000_etapa_7a/migration.sql` (generado con `prisma migrate diff --from-schema-datamodel <esquema de HEAD> --to-schema-datamodel prisma/schema.prisma --script`, más RLS a mano); `server/src/auth/access.ts` (`toProjectDto` quita `lastRequirementNumber`); `server/src/activity/loaders.ts` (`loadProject` omite el contador).

**Interfaces — Produces (modelo):**
- `Project.lastRequirementNumber Int @default(0)`.
- `Requirement { id, projectId (Cascade), number Int, description, priority @default("MEDIUM"), status @default("PROPOSED"), stakeholderId? (SetNull), acceptance @default(""), version Int @default(1), createdAt, updatedAt }`, `@@unique([projectId, number])`.
- `RequirementDeliverable { requirementId (Cascade), deliverableId (Cascade) }`, `@@id([requirementId, deliverableId])`, `@@index([deliverableId])`.
- `ChangeRequestRequirement { changeRequestId (Cascade), requirementId (Cascade) }`, `@@id([changeRequestId, requirementId])`.
- `QualityMetric { id, projectId (Cascade), name, unit @default(""), target Decimal @db.Decimal(14,4), direction @default("HIGHER_BETTER"), deliverableId? (SetNull), createdAt, updatedAt }`.
- `QualityMeasurement { id, metricId (Cascade), date String, value Decimal @db.Decimal(14,4), note @default(""), createdById (User, Restrict), createdAt }`, `@@index([metricId])`.
- `Incident.kind String @default("INCIDENT")`, `Incident.deliverableId String?` (SetNull), `@@index([deliverableId])`.
- RLS en las cinco tablas nuevas.

- [ ] **Step 1:** Prueba en `server/tests/projects.test.ts`: `'el contador de requisitos no sale en el proyecto'` crea un requisito con `ctx.prisma.requirement.create` (y actualiza `lastRequirementNumber` a 1), y comprueba que `GET /api/projects/:id` (PM) no tiene la clave `lastRequirementNumber`.
- [ ] **Step 2:** Correrla. Expected: FAIL (`ctx.prisma.requirement` no existe).
- [ ] **Step 3:** Esquema, migración, `prisma generate`, DTO y cargador.
- [ ] **Step 4:** `tests/projects.test.ts tests/rls.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: modelo de requisitos, métricas de calidad y tipo de incidente`.

### Task 3: Requisitos (rutas)

**Files:** Create `server/src/routes/requirements.ts` (registrar en `app.ts`), `server/src/domain/traceability.ts`; Modify `activity/table.ts`, `activity/loaders.ts` (`loadRequirement`, etiqueta `REQ-N <texto plano>`), `shared/src/enums.ts` (entidad `requirement`, «Requisito»), `client/src/lib/activity.ts` («el requisito»), `shared/tests/activity.test.ts`, `server/tests/accessMatrix.test.ts`, `server/tests/closedGuard.test.ts`; Test `server/tests/requirements.test.ts`.

**Interfaces — Produces:**
- `suggestMet(req: { status: string; deliverables: { status: string }[] }): boolean` en `domain/traceability.ts`: `status === 'APPROVED'`, al menos un entregable y todos `ACCEPTED`.
- `GET|POST /api/projects/:id/requirements`, `PATCH|DELETE /api/projects/:id/requirements/:requirementId` (sección `requirements`; escribe solo el PM).
- `RequirementDto = { id, number, description, priority, status, acceptance, version, deliverables: { id, number, name, status }[] (por número), stakeholder?: { id, name } | null (clave solo para el PM), suggestMet }`.
- Crear: numera con `lastRequirementNumber` en transacción; `deliverableIds` y `stakeholderId` validados (mensajes de Global Constraints). Editar: `updateMany` con `version` como entregables (409 `editConflict`), reemplaza vínculos si viene `deliverableIds`. Bitácora: `crudEntries('requirements', 'requirementId', { entity: 'requirement', fields: ['status', 'priority'] })`.

- [ ] **Step 1: Pruebas**
  - `'el PM crea REQ-1 y REQ-2 ligados a entregables'` → números 1 y 2, `deliverables` con número y estado.
  - `'el colaborador y el observador leen sin interesado y no escriben'` → sin clave `stakeholder`; POST/PATCH/DELETE 403.
  - `'entregable o interesado de otro proyecto dan 400'` con sus mensajes.
  - `'sugiere cumplido cuando todos sus entregables están aceptados'` → `suggestMet` true con APPROVED + entregables ACCEPTED; false si PROPOSED o sin entregables.
  - `'una edición con versión vieja da 409'` (Review Focus 2).
  - `'la descripción se sanea'`.
- [ ] **Step 2:** Correr `tests/requirements.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `tests/requirements.test.ts tests/accessMatrix.test.ts tests/closedGuard.test.ts tests/activityCoverage.test.ts` y `shared`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: registro de requisitos ligados a entregables`.

### Task 4: Matriz de trazabilidad

**Files:** Modify `server/src/domain/traceability.ts`, `server/src/routes/requirements.ts`, `accessMatrix.test.ts`; Test `server/tests/domain/traceability.test.ts`, `server/tests/requirements.test.ts`.

**Interfaces — Produces:**
- `buildTraceability(input: { requirements: { id; number; description (texto plano); status; priority; deliverableIds: string[] }[]; deliverables: { id; number; name; status; tasks: { status }[]; criteria: { met }[] }[] }): Traceability` con `Traceability = { requirements: { id, number, description, status, priority, deliverables: { id, number, name, status, tasks: { done, total }, criteria: { met, total } }[] }[]; orphanDeliverables: { id, number, name }[] }`. Orden por número.
- `GET /api/projects/:id/traceability` (sección `requirements`). Las tareas son hojas (`leafWhere`) con `deliverableId`.

- [ ] **Step 1:** Pura: conteos `tasks.done` (estado `DONE`) y `criteria.met`; entregable sin requisito en `orphanDeliverables`; requisito sin entregables con `deliverables: []`. Ruta: `'borrar un entregable deja el requisito sin entregable'` (Review Focus 1) y el observador lee la matriz.
- [ ] **Step 2:** Correr ambas. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `tests/domain/traceability.test.ts tests/requirements.test.ts tests/accessMatrix.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: matriz de trazabilidad`.

### Task 5: Cambios que citan requisitos

**Files:** Modify `server/src/routes/changeRequests.ts` (`PROPOSAL_FIELDS` + `requirementIds`; crear, proponer y editar guardan los vínculos; DTOs con `requirements: { id, number }[]`); Test `server/tests/changeRequests.test.ts`, `server/tests/changeProposals.test.ts`.

**Interfaces — Produces:** función local `assertRequirements(prisma, projectId, ids): Promise<string[]>` (únicos; si alguno no es del proyecto → `fieldError('requirementIds', 'El requisito no pertenece a este proyecto')`). Los vínculos se crean en la misma transacción que la solicitud (ampliar `createChangeRequest` con `requirementIds`).

- [ ] **Step 1:** Pruebas: el PM crea un cambio citando REQ-1 → DTO `requirements: [{ id, number: 1 }]`; editar reemplaza; el colaborador propone citando un requisito → 201 y su propuesta lo muestra; requisito de otro proyecto → 400 y `changeRequest.count` no cambia (Review Focus 5).
- [ ] **Step 2:** Correr. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `tests/changeRequests.test.ts tests/changeProposals.test.ts tests/applyChange.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: las solicitudes de cambio citan requisitos`.

### Task 6: Métricas de calidad

**Files:** Create `server/src/routes/qualityMetrics.ts`, `server/src/domain/quality.ts`; Modify registro en `app.ts`, bitácora (entidad `quality`, «Métrica de calidad», «la métrica de calidad», cargador `loadQualityMetric`), `accessMatrix.test.ts`, `closedGuard.test.ts`, `shared/tests/activity.test.ts`; Test `server/tests/domain/quality.test.ts`, `server/tests/qualityMetrics.test.ts`.

**Interfaces — Produces:**
- `metricStatus(metric: { target: number; direction: string }, measurements: { date: string; value: number; createdAt: Date }[]): { latest: { date: string; value: number } | null; met: boolean | null }` (último por fecha, empate por `createdAt`).
- CRUD `/api/projects/:id/quality-metrics` (`:metricId`), `POST /api/projects/:id/quality-metrics/:metricId/measurements` (201 con la métrica) y `DELETE /api/projects/:id/quality-metrics/:metricId/measurements/:measurementId`. Sección `quality`. `deliverableId` validado. Fecha futura → `fieldError('date', 'No se registran mediciones futuras')`.
- `QualityMetricDto = { id, name, unit, target: number, direction, deliverable: { id, number, name } | null, latest, met, measurements: { id, date, value: number, note }[] (fecha desc, luego creación desc) }`.

- [ ] **Step 1:** Pura: `HIGHER_BETTER` 95 ≥ 90 → true, `LOWER_BETTER` 3 ≤ 2 → false, sin mediciones → `{ latest: null, met: null }`, misma fecha → la de `createdAt` mayor (Review Focus 4). Ruta: el PM crea y mide; el colaborador lee y recibe 403 al medir; medición futura → 400; borrar medición.
- [ ] **Step 2:** Correr. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Las dos pruebas + `accessMatrix`, `closedGuard`, `activityCoverage` y `shared`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: métricas de calidad con mediciones`.

### Task 7: Defectos, no conformidades y revisión

**Files:** Modify `server/src/routes/incidents.ts` (validar `deliverableId` en `assertIncidentLinks`; DTO con `kind` y `deliverable: { id, number, name } | null`; `incidentInclude` + deliverable; filtro `?kind=`), `server/src/routes/deliverableReviews.ts`, `server/src/routes/deliverables.ts` (detalle con `incidents: { id, number, title, kind, status }[]` solo si el perfil lee incidentes; el colaborador solo los suyos por la regla existente de incidentes), `activity/table.ts` (`INCIDENT_FIELDS` + `kind`); Test `server/tests/incidents.test.ts`, `server/tests/deliverableReviews.test.ts`.

**Interfaces — Produces:** revisión `REJECTED` con `nonconformity` crea, en la misma transacción que la revisión, un incidente con `createIncidentIn(tx, …)`: `kind: 'NONCONFORMITY'`, `deliverableId`, `priority: 'HIGH'`, `reportedById` = PM, `title` = el enviado, `description` = la nota saneada. La respuesta (detalle del entregable) suma `nonconformity: { id, number } | null`.

- [ ] **Step 1:** Pruebas: el PM fija `kind: 'DEFECT'` y `deliverableId`; entregable ajeno → 400; colaborador que reporta con `kind` → se guarda `INCIDENT`; `GET ?kind=NONCONFORMITY` filtra; rechazo con `nonconformity` crea el incidente ligado y lo devuelve; rechazo sin nota con `nonconformity` → 400 y `incident.count` 0 (Review Focus 3); aceptar con `nonconformity` → 400.
- [ ] **Step 2:** Correr. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `tests/incidents.test.ts tests/deliverableReviews.test.ts tests/deliverables.test.ts tests/deliverablesAccess.test.ts tests/notifyIncidents.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: defectos y no conformidades ligados a entregables`.

### Task 8: Requisitos y matriz en la interfaz

**Files:** Create `client/src/pages/project/Requirements.tsx`, `client/src/components/requirements/RequirementForm.tsx`, `client/src/components/requirements/TraceabilityMatrix.tsx`; Modify `client/src/api/types.ts`, `client/src/router.tsx` (`requisitos` bajo `ProjectSection section="requirements"`), `ProjectLayout.tsx` (pestaña «Requisitos» tras «Entregables»), formulario y detalle de solicitudes de cambio (selector múltiple «Requisitos afectados», también al proponer; la solicitud muestra `REQ-N`), `client/tests/projectLayout.test.tsx` (pestañas); Test `client/tests/requirements.test.tsx`.

**Interfaces — Consumes:** Tasks 3–5. Claves: `['project', id, 'requirements']`, `['project', id, 'traceability']`; al guardar un requisito o un entregable se invalidan ambas.

- [ ] **Step 1:** Pruebas: el PM crea un requisito eligiendo un entregable → POST con `deliverableIds`; con `suggestMet` aparece «Todos sus entregables están aceptados» y «Marcar cumplido» hace PATCH `{ status: 'MET', version }`; la matriz muestra «Sin entregable» y la sección «Entregables sin requisito»; el observador no ve «Añadir requisito»; al proponer un cambio se pueden marcar requisitos.
- [ ] **Step 2:** `npx vitest run tests/requirements.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` y `npx tsc -b`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: requisitos y matriz de trazabilidad en la interfaz`.

### Task 9: Calidad, tipos de incidente y revisión en la interfaz

**Files:** Create `client/src/components/quality/QualitySection.tsx`; Modify `client/src/pages/project/Deliverables.tsx` (sección «Calidad» bajo la lista), `IncidentForm.tsx`/`IncidentDetail.tsx`/`Incidents.tsx` (campo «Tipo» y «Entregable» para el PM, columna y filtro por tipo), `ReviewDialog.tsx` (casilla «Registrar no conformidad», marcada al elegir rechazar, con título «No conformidad: <nombre>»), `DeliverableDetail.tsx` (incidentes ligados), `client/src/api/types.ts`; Test `client/tests/quality.test.tsx`, `client/tests/incidents.test.tsx`, `client/tests/deliverables.test.tsx`.

- [ ] **Step 1:** Pruebas: la tabla de calidad muestra «Cumple», «No cumple» y «Sin medir»; el PM registra una medición → POST con `{ date, value, note }`; el colaborador no ve «Añadir métrica»; el formulario de incidente del PM envía `kind`; rechazar con la casilla envía `nonconformity: { title: 'No conformidad: Portal web' }`; desmarcarla no lo envía.
- [ ] **Step 2:** Correr las tres. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` y `npx tsc -b`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: calidad y no conformidades en la interfaz`.

### Task 10: Flujo completo y documentación

**Files:** `e2e/main-flow.spec.ts`, `docs/guia-implementacion-pmbok.md` (notas «Hecho» en F12 y F13; la fila de la etapa 7 marca F12 ✓ y F13 ✓).

- [ ] **Step 1:** En el flujo, tras crear el entregable: el PM abre «Requisitos», crea un requisito ligado a ese entregable y lo ve en la matriz con el entregable.
- [ ] **Step 2:** `npm run build` y `TEST_DATABASE_URL=… npm run test:e2e`. Expected: PASS 1/1.
- [ ] **Step 3:** Guía.
- [ ] **Step 4:** `TEST_DATABASE_URL=… npm test`. Expected: todo verde.
- [ ] **Step 5:** Commit `test: flujo de requisitos y etapa 7A en la guía`.
