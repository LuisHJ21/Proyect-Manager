# Etapa 6: informes y comunicaciones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** informe de estado periódico congelado que el observador lee sin montos (F11), involucramiento de interesados (F9), y plan de comunicaciones y actas de reunión con acuerdos convertibles (F10).

**Architecture:**
- El informe se calcula con una función pura (`server/src/domain/statusReport.ts`) a partir de los mismos cargadores que el cierre y el valor ganado, y se congela como JSON en `StatusReport.report`. Los montos se quitan en el servidor al responder a quien no es PM.
- Dos secciones nuevas en la tabla de capacidades: `reports` y `meetings`. El plan de comunicaciones y el involucramiento usan `stakeholders`.
- Las actas tienen una ruta propia (`server/src/routes/meetings.ts`) con DTO filtrado para el colaborador; la conversión de acuerdos reutiliza `createDecision`, `createIncident` y la creación de tareas.

**Tech Stack:** Hono, Prisma 6 sobre PostgreSQL, Zod en `shared`, React 19 con TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-etapa-6-informes-comunicaciones-design.md`

## Global Constraints

- **Rama y commits:** rama `etapa-6`, un commit por tarea, mensajes en español con prefijo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas:**
  - Servidor, desde `server/`: `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`.
  - Cliente, desde `client/`: `npx vitest run <archivo>` y `npx tsc -b`.
  - Shared, desde `shared/`: `npx vitest run <archivo>`.
- **Reglas de siempre:** `AppError`/`fieldError` con mensajes en español; validación solo en `shared/src/schemas.ts`; migración nueva escrita a mano y con `ENABLE ROW LEVEL SECURITY` en cada tabla nueva; toda ruta de escritura nueva en `closedGuard` (y su lista en `server/tests/closedGuard.test.ts`), en `ROUTE_SECTION` de `server/tests/accessMatrix.test.ts` (y `FINE_GRAINED`/`PM_ONLY_READS` donde toque) y en `server/src/activity/table.ts` o `NOT_LOGGED`; nada de estado en memoria; textos con formato pasan por `sanitizeRichText`.
- **Montos:** ninguna respuesta a un observador o colaborador contiene una clave que termine en `Cents`.
- **Colaborador:** nunca recibe informes de estado, interesados, plan de comunicaciones ni ids de decisiones o incidentes de un acta.
- **Fechas:** `YYYY-MM-DD`; una marca de tiempo se pasa a fecha con `deps.dateOf(date)` (Task 2), que usa la misma zona que `deps.today()`.
- **Mensajes exactos:**
  - «Este acuerdo ya se convirtió»
  - «El asistente debe ser miembro del proyecto»
  - «El interesado no pertenece a este proyecto»
  - «Toca emitir el informe de estado»
  - «Los asistentes del equipo verán estas notas»
  - «Una vez emitido, el informe no se puede editar»

## Review Focus

1. Dos acuerdos convertidos a la vez (doble clic): solo se crea un elemento; la conversión reclama el acuerdo con `updateMany` sobre las tres referencias en `null` dentro de la transacción. Prueba en Task 9.
2. El responsable de un acuerdo dejó de ser miembro antes de convertir: convertir a tarea o incidente responde 400 con el error de asignación y no crea nada. Prueba en Task 9.
3. Dos informes emitidos el mismo día: el segundo tiene período de un día (`periodStart = periodEnd = hoy`) y número siguiente. Prueba en Task 3 y Task 4.
4. Un observador pide el borrador (`/draft`) o un informe de otro proyecto del que no es miembro: 403 y 404 respectivamente. Prueba en Task 4.
5. Borrar un interesado que asistió a una reunión: el acta sigue existiendo sin ese asistente (cascada en `MeetingAttendee`). Prueba en Task 9.

---

### Task 1: Permisos, enumeraciones, etiquetas y esquemas compartidos

**Files:**
- Modify: `shared/src/access.ts`, `shared/src/enums.ts`, `shared/src/schemas.ts`
- Test: `shared/tests/stage6.test.ts` (crear)

**Interfaces:**
- Produces:
  - `SECTIONS` incluye `'reports'` y `'meetings'`, agregadas al final de la lista. Niveles: PM `write`; COLLABORATOR `reports: 'none'`, `meetings: 'own'`; OBSERVER `reports: 'read'`, `meetings: 'none'`.
  - `STATUS_REPORT_FREQUENCY = ['NONE','WEEKLY','BIWEEKLY','MONTHLY']`, `REPORT_FREQUENCY_DAYS = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 }`.
  - `ENGAGEMENT_LEVEL = ['UNAWARE','RESISTANT','NEUTRAL','SUPPORTIVE','LEADING']`.
  - `COMMUNICATION_FREQUENCY = ['ONCE','DAILY','WEEKLY','BIWEEKLY','MONTHLY','PER_MILESTONE','AS_NEEDED']`.
  - `AGREEMENT_TARGET = ['task','decision','incident']`.
  - `NOTIFICATION_KIND` agrega `'STATUS_REPORT_ISSUED'`.
  - `LABELS.reportFrequency` («Sin frecuencia», «Semanal», «Quincenal», «Mensual»), `LABELS.engagement` («Desconocedor», «Reticente», «Neutral», «De apoyo», «Líder»), `LABELS.communicationFrequency` («Una vez», «Diaria», «Semanal», «Quincenal», «Mensual», «Por hito», «Cuando se necesite»).
  - Esquemas: `statusReportSchema { comment: longText, nextSteps: longText }` (ambos con `default('')`); proyecto (crear y editar) acepta `statusReportFrequency`; interesado (crear y editar) acepta `currentEngagement`, `desiredEngagement` (`ENGAGEMENT_LEVEL` o `null`) y `expectations` (`noteText`); `createCommunicationItemSchema`/`updateCommunicationItemSchema` (`topic` shortText requerido, `audience` shortText, `frequency` default `'AS_NEEDED'`, `channel` shortText, `ownerId` string|null opcional, `notes` noteText); `meetingSchema { title: shortText requerido, date: fecha, notes: longText, userIds: string[], stakeholderIds: string[], agreements: { id?: string, text: shortText requerido, ownerId?: string|null, dueDate?: fecha|null }[] }` y `updateMeetingSchema` = `meetingSchema.partial()`; `convertAgreementSchema { kind: AGREEMENT_TARGET }`.

- [ ] **Step 1: Escribir la prueba**

```ts
it('el observador lee informes y no actas; el colaborador ve sus actas y no informes', () => {
  expect(accessLevel('OBSERVER', 'reports')).toBe('read');
  expect(accessLevel('OBSERVER', 'meetings')).toBe('none');
  expect(accessLevel('COLLABORATOR', 'reports')).toBe('none');
  expect(accessLevel('COLLABORATOR', 'meetings')).toBe('own');
  expect(accessLevel('PM', 'meetings')).toBe('write');
});
it('acta: acuerdo sin texto se rechaza y la conversión solo acepta tres destinos', () => {
  expect(meetingSchema.safeParse({ title: 'Kickoff', date: '2026-11-16', userIds: [], stakeholderIds: [], agreements: [{ text: '' }] }).success).toBe(false);
  expect(convertAgreementSchema.safeParse({ kind: 'risk' }).success).toBe(false);
});
it('involucramiento acepta null y rechaza niveles inventados', () => {
  expect(updateStakeholderSchema.safeParse({ currentEngagement: null }).success).toBe(true);
  expect(updateStakeholderSchema.safeParse({ desiredEngagement: 'FAN' }).success).toBe(false);
});
```

- [ ] **Step 2:** `npx vitest run tests/stage6.test.ts` desde `shared/`. Expected: FAIL (exportaciones inexistentes).
- [ ] **Step 3:** Implementar lo del bloque Interfaces.
- [ ] **Step 4:** Misma orden. Expected: PASS; luego `npx vitest run` en `shared/` todo verde.
- [ ] **Step 5:** Commit `feat: permisos, enumeraciones y esquemas de la etapa 6`.

### Task 2: Migración y fecha local de una marca de tiempo

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_etapa_6/migration.sql`
- Modify: `server/src/http.ts` (`Deps.dateOf`), `server/src/app.ts`, `server/src/auth/access.ts` (`toProjectDto` quita `lastStatusReportNumber`)
- Test: `server/tests/timezone.test.ts` (ampliar)

**Interfaces:**
- Produces (modelo):
  - `Project.statusReportFrequency String @default("NONE")`, `Project.lastStatusReportNumber Int @default(0)`.
  - `StatusReport { id, projectId (Cascade), number Int, periodStart String, periodEnd String, report String (JSON), comment String @default(""), nextSteps String @default(""), issuedAt DateTime @default(now()), issuedById (User, Restrict) }`, `@@unique([projectId, number])`.
  - `Stakeholder.currentEngagement String?`, `desiredEngagement String?`, `expectations String @default("")`.
  - `CommunicationItem { id, projectId (Cascade), topic, audience @default(""), frequency @default("AS_NEEDED"), channel @default(""), ownerId String? (User, SetNull), notes @default(""), position Int @default(0), createdAt, updatedAt }`.
  - `Meeting { id, projectId (Cascade), title, date String, notes @default(""), createdById (User, Restrict), createdAt, updatedAt }`.
  - `MeetingAttendee { id, meetingId (Cascade), userId String? (User, Cascade), stakeholderId String? (Stakeholder, Cascade) }`, `@@unique([meetingId, userId])`, `@@unique([meetingId, stakeholderId])`, `CHECK ((userId IS NULL) <> (stakeholderId IS NULL))` en el SQL.
  - `MeetingAgreement { id, meetingId (Cascade), text, ownerId String? (User, SetNull), dueDate String?, position Int, taskId String? (Task, SetNull), decisionId String? (Decision, SetNull), incidentId String? (Incident, SetNull) }`.
  - Cada tabla nueva: `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;`.
- Produces (código): `Deps.dateOf(date: Date): string` = `localToday(date, opts.timeZone)`.

- [ ] **Step 1:** Prueba en `timezone.test.ts`: con `timeZone: 'America/Lima'`, `deps.dateOf(new Date('2026-11-17T03:00:00Z'))` es `'2026-11-16'` (crear el app con la zona como ya hace ese archivo).
- [ ] **Step 2:** Correr `tests/timezone.test.ts`. Expected: FAIL (`dateOf` no existe).
- [ ] **Step 3:** Esquema, migración SQL a mano, `dateOf`, y `lastStatusReportNumber` fuera de `toProjectDto`.
- [ ] **Step 4:** Correr `tests/timezone.test.ts tests/rls.test.ts tests/projects.test.ts`. Expected: PASS (la `globalSetup` aplica la migración; `rls.test.ts` confirma RLS en las tablas nuevas).
- [ ] **Step 5:** Commit `feat: modelo de informes, involucramiento, comunicaciones y actas`.

### Task 3: Informe de estado puro

**Files:**
- Create: `server/src/domain/statusReport.ts`
- Test: `server/tests/domain/statusReport.test.ts`

**Interfaces:**
- Consumes: `computeEvm`, `EvmInput` (`domain/evm.ts`), `computeHealth`, `HealthInput`, `isHighRisk` (`domain/health.ts`), `weightedProgress` (`domain/indicators.ts`), `HIGH_RISK_SCORE`, `addDays`, `REPORT_FREQUENCY_DAYS`.
- Produces:
  - `reportPeriod(previousEnd: string | null, projectStart: string, today: string): { periodStart: string; periodEnd: string }`: `periodStart = previousEnd ? addDays(previousEnd, 1) : projectStart`, acotado a `≤ today`; `periodEnd = today`.
  - `isReportDue(frequency: string, lastEnd: string | null, projectStart: string | null, today: string): boolean`: `false` con `NONE` o sin `projectStart` y sin informes; si no, `today >= addDays(lastEnd ?? projectStart, días)`.
  - `type StatusReportInput = { health: HealthInput; tasks: ProgressTask & { status, dueDate }[]; milestones: { name, dueDate, status }[]; risks: { description (texto plano), probability, impact, status }[]; incidents: { status, createdOn: string, resolvedOn: string | null }[]; changes: { status, decidedOn: string | null, appliedOn: string | null }[]; budget: { plannedCents, currency }; actualCostCents: number; evm: EvmInput | null }`.
  - `type StatusReportSnapshot` con las claves del spec: `health`, `progress { percent, overdueTasks, blockedTasks, doneTasks, totalTasks }`, `performance { cpi, spi, eacMethod, pvCents, evCents, acCents, eacCents, vacCents } | null`, `budget { plannedCents, actualCents, varianceCents, currency }`, `milestones { reached, upcoming, overdue }` (cada uno `{ name, dueDate }[]`, por fecha), `risks { openCount, top: { description, score, high, status }[] }`, `incidents { open, openedInPeriod, resolvedInPeriod }`, `changes { pending, approvedInPeriod, rejectedInPeriod, appliedInPeriod }`.
  - `buildStatusReport(input: StatusReportInput, period: { periodStart; periodEnd }, today: string): StatusReportSnapshot`.
  - `stripMoney(snapshot: StatusReportSnapshot): PublicStatusReport` (sin `budget`; `performance` solo `{ cpi, spi, eacMethod }` o `null`).
- Reglas: hitos `reached` = estado `REACHED` y `periodStart ≤ dueDate ≤ periodEnd`; `upcoming` = pendientes con `today < dueDate ≤ today+30`; `overdue` = pendientes con `dueDate < today`. Riesgos abiertos = `status !== 'CLOSED'`, top 5 por `probability × impact` descendente, empate por descripción. Incidente abierto = `OPEN` o `IN_PROGRESS`. `approvedInPeriod` cuenta `decidedOn` en período con estado `APPROVED` o `APPLIED`; `rejectedInPeriod` con `REJECTED`; `appliedInPeriod` por `appliedOn`.

- [ ] **Step 1: Pruebas**

```ts
it('período: sin informe previo empieza en el inicio; con previo, el día siguiente; mismo día queda de un día', () => {
  expect(reportPeriod(null, '2026-11-01', '2026-11-16')).toEqual({ periodStart: '2026-11-01', periodEnd: '2026-11-16' });
  expect(reportPeriod('2026-11-09', '2026-11-01', '2026-11-16')).toEqual({ periodStart: '2026-11-10', periodEnd: '2026-11-16' });
  expect(reportPeriod('2026-11-16', '2026-11-01', '2026-11-16')).toEqual({ periodStart: '2026-11-16', periodEnd: '2026-11-16' });
});
it('toca emitir según la frecuencia', () => {
  expect(isReportDue('NONE', null, '2026-11-01', '2026-12-31')).toBe(false);
  expect(isReportDue('WEEKLY', '2026-11-09', '2026-11-01', '2026-11-15')).toBe(false);
  expect(isReportDue('WEEKLY', '2026-11-09', '2026-11-01', '2026-11-16')).toBe(true);
  expect(isReportDue('MONTHLY', null, '2026-11-01', '2026-12-01')).toBe(true);
});
it('cinco riesgos abiertos de mayor puntaje, hitos del período y conteos del período', () => { /* 6 riesgos abiertos + 1 cerrado → top.length 5, openCount 6, top[0].score el mayor; hito alcanzado con fecha antes del período no aparece en reached; incidente creado antes y resuelto dentro cuenta en resolvedInPeriod, no en openedInPeriod; cambio APPLIED decidido en período cuenta en approvedInPeriod y appliedInPeriod */ });
it('sin dinero: no queda ninguna clave que termine en Cents', () => {
  const pub = stripMoney(buildStatusReport(input, period, today));
  expect(JSON.stringify(pub)).not.toMatch(/Cents"/);
  expect(pub.performance).toEqual({ cpi: expect.any(Number), spi: expect.any(Number), eacMethod: 'CPI' });
});
```

El tercer caso se escribe completo con esos valores (el comentario dice qué datos poner y qué afirmar).

- [ ] **Step 2:** Correr `tests/domain/statusReport.test.ts`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Misma orden. Expected: PASS.
- [ ] **Step 5:** Commit `feat: cálculo puro del informe de estado`.

### Task 4: Rutas de informes de estado

**Files:**
- Create: `server/src/routes/statusReports.ts` (registrar en `server/src/app.ts` junto a las demás)
- Modify: `server/src/activity/table.ts` (+ cargador en `loaders.ts` si hace falta), `server/src/notifications.ts` (solo si `notify` necesita el nuevo tipo), `server/tests/accessMatrix.test.ts`, `server/tests/closedGuard.test.ts`
- Test: `server/tests/statusReports.test.ts`

**Interfaces:**
- Consumes: Task 3; `loadEvmInput` (`routes/performance.ts`), `loadLaborCosts`, `leafWhere`, `notify`, `sanitizeRichText`, `requireProjectAccess(c, id, 'reports', need)`, `deps.dateOf`.
- Produces:
  - `loadStatusReportInput(prisma, projectId, dateOf): Promise<StatusReportInput>`, interna del archivo.
  - `GET /api/projects/:id/status-reports` → `{ items: { id, number, periodStart, periodEnd, issuedAt, issuedBy: { id, name } }[], due: boolean }` (más reciente primero; `due` solo para PM, `false` a los demás).
  - `GET /api/projects/:id/status-reports/draft` → `{ periodStart, periodEnd, report: StatusReportSnapshot }` (en `PM_ONLY_READS`).
  - `POST /api/projects/:id/status-reports` `statusReportSchema` → 201 `StatusReportDto`.
  - `GET /api/projects/:id/status-reports/:reportId` → `StatusReportDto = { id, number, periodStart, periodEnd, issuedAt, issuedBy, comment, nextSteps, report }`, con `report = stripMoney(...)` si no es PM.
  - Emitir: en una transacción incrementa `lastStatusReportNumber`, lee el `periodEnd` del último informe, calcula `reportPeriod` con inicio = `project.startDate ?? dateOf(project.createdAt)`, guarda. Después notifica `STATUS_REPORT_ISSUED` (título `Informe N`, `entityId` = id del informe) a cada miembro con rol `OBSERVER`.
  - Bitácora: `POST /api/projects/:id/status-reports` registrado como creación con título «Informe N».

- [ ] **Step 1: Pruebas** (patrón de `laborCost.test.ts`: PM, observador `obs` y colaborador `ana` miembros)

```ts
it('emitir congela: un gasto posterior no cambia el informe emitido', async () => { /* emitir; crear gasto; GET :reportId → report.budget.actualCents igual al de antes */ });
it('el observador lee el informe sin ninguna clave Cents y el colaborador recibe 403', async () => {
  const body = (await ctx.as(obs).get(`${url}/${id}`)).json();
  expect(JSON.stringify(body)).not.toMatch(/Cents"/);
  expect(body.report.performance?.cpi ?? null).not.toBeUndefined();
  expect((await ctx.as(ana).get(url)).statusCode).toBe(403);
  expect((await ctx.as(ana).get(`${url}/${id}`)).statusCode).toBe(403);
});
it('el borrador es solo del PM y un observador ajeno recibe 404', async () => { /* obs → /draft 403; otro observador no miembro → GET :reportId 404 */ });
it('números secuenciales y dos informes el mismo día', async () => { /* dos POST → number 1 y 2; el segundo periodStart === periodEnd === TODAY */ });
it('notifica a los observadores miembros y no al colaborador', async () => { /* notification de obs con kind STATUS_REPORT_ISSUED y title 'Informe 1'; ana sin ese kind */ });
it('comentario saneado', async () => { /* comment '<p>Hola</p><script>x</script>' → sin <script> */ });
it('toca emitir: due true con frecuencia semanal y último informe de hace 7 días', async () => { /* PATCH proyecto statusReportFrequency WEEKLY; emitir con clock en 2026-11-09; clock 2026-11-16 → GET lista due true; obs → due false */ });
```

- [ ] **Step 2:** Correr `tests/statusReports.test.ts`. Expected: FAIL (404 en las rutas).
- [ ] **Step 3:** Implementar rutas y cargador; agregar las cuatro rutas a `ROUTE_SECTION` (`reports`), el GET draft a `PM_ONLY_READS`, el POST a la lista de `closedGuard.test.ts` y a la bitácora.
- [ ] **Step 4:** Correr `tests/statusReports.test.ts tests/accessMatrix.test.ts tests/closedGuard.test.ts tests/activityCoverage.test.ts tests/observerReads.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: emitir y consultar informes de estado`.

### Task 5: Aviso en el panel

**Files:**
- Modify: `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts`
- Test: `server/tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `isReportDue`.
- Produces: elemento de atención `{ kind: 'report', id: projectId, title: 'Toca emitir el informe de estado', projectId, projectName }`, uno por proyecto activo con informe pendiente, colocado después de los cambios y antes de los riesgos. La ruta carga `statusReportFrequency`, `startDate` y el `periodEnd` máximo por proyecto (`groupBy` o `findMany` con `distinct`).

- [ ] **Step 1:** Prueba `'avisa que toca emitir el informe de estado'`: proyecto `EXECUTING`, frecuencia `WEEKLY`, inicio hace 8 días, sin informes → `attention` contiene `{ kind: 'report', projectId }`; otro proyecto igual pero con frecuencia `NONE` no aparece.
- [ ] **Step 2:** Correr `tests/dashboard.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Misma orden. Expected: PASS.
- [ ] **Step 5:** Commit `feat: el panel avisa cuando toca emitir el informe de estado`.

### Task 6: Informes en la interfaz

**Files:**
- Create: `client/src/pages/project/StatusReports.tsx` (lista, nuevo, detalle), `client/src/components/reports/StatusReportView.tsx` (vista imprimible, patrón de `ClosureReportView.tsx`)
- Modify: `client/src/api/types.ts`, `client/src/router.tsx` (rutas `informes` e `informes/:reportId` bajo `ProjectSection section="reports"`), `ProjectLayout.tsx` (pestaña «Informes», sección `reports`, tras «Resumen»), `client/src/components/project/ProjectForm.tsx` (selector «Frecuencia del informe de estado»), `client/src/pages/project/Summary.tsx` (enlace «Último informe: Informe N (fecha)» para PM y observador), `client/src/pages/Dashboard.tsx` (atención `kind: 'report'` enlaza a `/proyectos/:id/informes`), `NotificationBell.tsx` y el texto de notificaciones (`STATUS_REPORT_ISSUED` → «Nuevo informe de estado: Informe N», enlaza al informe)
- Test: `client/tests/statusReports.test.tsx`

**Interfaces:**
- Consumes: rutas de Task 4. Claves de consulta: `['project', id, 'status-reports']`, `['project', id, 'status-reports', reportId]`, `['project', id, 'status-reports', 'draft']`.
- Comportamiento: el PM ve «Nuevo informe» → muestra el borrador con `StatusReportView`, editores Comentario y Próximos pasos, botón «Emitir» que abre `ConfirmDialog` con «Una vez emitido, el informe no se puede editar». Tras emitir navega al informe e invalida la lista y el panel. `StatusReportView` oculta las secciones ausentes (`budget`, montos de `performance`, `performance` nulo). Botón «Imprimir» (`window.print()`). Si `due`, aviso «Toca emitir el informe de estado» arriba de la lista.

- [ ] **Step 1: Pruebas**
  - `'el PM emite un informe tras confirmar'`: mock del borrador y del POST; clic «Nuevo informe», escribir comentario, «Emitir», confirmar → POST con `{ comment, nextSteps }`.
  - `'el observador ve el informe sin presupuesto ni botón de emitir'`: informe sin `budget` y `performance { cpi: 0.9, spi: 1.1 }` → muestra «0,90»/«1,10» como el resto de la app formatea índices, no muestra «Presupuesto», no hay «Nuevo informe».
  - `'la pestaña Informes no aparece al colaborador'` (en `projectLayout.test.tsx` o en este archivo).
- [ ] **Step 2:** `npx vitest run tests/statusReports.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` y `npx tsc -b` en `client/`. Expected: PASS y sin errores.
- [ ] **Step 5:** Commit `feat: informes de estado en la interfaz`.

### Task 7: Involucramiento de interesados (F9)

**Files:**
- Modify: `server/src/routes/registers.ts` (solo si el `toDto` o el `validate` del interesado necesita los campos; los esquemas ya los traen), `client/src/api/types.ts`, `client/src/pages/project/Registers.tsx` (campos del formulario y las dos vistas)
- Create: `client/src/components/stakeholders/PowerInterestGrid.tsx`, `client/src/components/stakeholders/EngagementMatrix.tsx`
- Test: `server/tests/registers.test.ts` (ampliar), `client/tests/stakeholders.test.tsx`

**Interfaces:**
- Produces: `PowerInterestGrid({ stakeholders })`: 3×3, filas `influence` HIGH→LOW, columnas `interest` LOW→HIGH, rótulos «Gestionar de cerca» (HIGH/HIGH), «Mantener satisfecho» (HIGH/LOW), «Mantener informado» (LOW/HIGH), «Monitorear» (LOW/LOW). `EngagementMatrix({ stakeholders })`: columnas en el orden de `ENGAGEMENT_LEVEL`, «A» en el actual y «D» en el deseado, fila con `data-gap="true"` si ambos están evaluados y difieren, encabezado «N interesados con brecha».

- [ ] **Step 1: Pruebas**
  - Servidor: `'el PM guarda el involucramiento y el colaborador sigue sin acceso'`: PATCH con `{ currentEngagement: 'RESISTANT', desiredEngagement: 'SUPPORTIVE', expectations: 'Plazos' }` → GET los devuelve; colaborador GET → 403.
  - Cliente: `'la matriz marca la brecha'`: dos interesados, uno con brecha → texto «1 interesado con brecha» (plural: «N interesados con brecha») y una sola fila con `data-gap="true"`.
  - Cliente: `'la cuadrícula ubica al interesado en su cuadrante'`: HIGH/HIGH aparece dentro de la celda «Gestionar de cerca».
- [ ] **Step 2:** Correr ambas. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `tests/registers.test.ts` en servidor; `npx vitest run` y `npx tsc -b` en cliente. Expected: PASS.
- [ ] **Step 5:** Commit `feat: involucramiento de interesados con cuadrícula y matriz`.

### Task 8: Plan de comunicaciones

**Files:**
- Modify: `server/src/routes/registers.ts` (nuevo `registerProjectCrud` con `path: 'communications'`, `section: 'stakeholders'`, `validate` del responsable con `assertOwner` de `domain/owners.ts` o el equivalente que usan los registros), `server/src/activity/table.ts` (`crudEntries('communications', …)` y cargador), `server/tests/accessMatrix.test.ts`, `server/tests/closedGuard.test.ts`, `client/src/pages/project/Registers.tsx` (tabla «Plan de comunicaciones» con `RegisterTable` bajo las vistas de interesados), `client/src/api/types.ts`
- Test: `server/tests/communications.test.ts`, `client/tests/stakeholders.test.tsx` (ampliar)

**Interfaces:**
- Produces: `/api/projects/:id/communications` (GET, POST, PATCH `/:itemId`, DELETE `/:itemId`), orden `position` y luego `createdAt`. DTO con `owner { id, name } | null`.

- [ ] **Step 1: Pruebas**
  - `'el PM crea una fila del plan y el colaborador y el observador reciben 403'`.
  - `'un observador no puede ser responsable'` → 400 con el mensaje existente «Un observador no puede ser responsable».
  - Cliente: `'agrega una fila al plan de comunicaciones'` → POST con `topic`, `audience`, `frequency: 'WEEKLY'`, `channel`.
- [ ] **Step 2:** Correr. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `tests/communications.test.ts tests/accessMatrix.test.ts tests/closedGuard.test.ts tests/activityCoverage.test.ts`; cliente `npx vitest run` y `npx tsc -b`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: plan de comunicaciones`.

### Task 9: Actas de reunión en el servidor

**Files:**
- Create: `server/src/routes/meetings.ts` (registrar en `app.ts`)
- Modify: `server/src/routes/tasks.ts` (extraer `createTaskInProject(c | tx, project, input, assigneeIds)` del POST de tareas para reutilizarlo, sin cambiar su comportamiento), `server/src/activity/table.ts`, `server/tests/accessMatrix.test.ts` (rutas en `ROUTE_SECTION: 'meetings'`; los GET en `FINE_GRAINED` porque el colaborador filtra), `server/tests/closedGuard.test.ts`
- Test: `server/tests/meetings.test.ts`

**Interfaces:**
- Consumes: `createDecision(tx, projectId, data)`, `createIncident(prisma, projectId, data)`, `assertIncidentLinks`, `assertAssignable`, `assertDatesWithinProject`, `nextPosition`, `notifyNewAssignees`, `sanitizeRichText`.
- Produces:
  - `GET /api/projects/:id/meetings` → `MeetingSummary[] { id, title, date, attendeeCount, agreementCount }`, por fecha descendente. Colaborador: solo donde es asistente.
  - `GET /api/projects/:id/meetings/:meetingId` → `MeetingDto { id, title, date, notes, attendees: { users: {id,name}[], stakeholders: {id,name}[] }, agreements: { id, text, owner, dueDate, position, taskId, decisionId, incidentId, convertedTo: 'task'|'decision'|'incident'|null }[] }`. Para el colaborador: `stakeholders: []`, sin `decisionId` ni `incidentId` (claves ausentes), `convertedTo` presente. No asistente → 404 «Reunión no encontrada».
  - `POST` (201), `PATCH /:meetingId`, `DELETE /:meetingId`, solo PM. Asistentes: cada `userId` debe ser miembro del proyecto (o el PM): si no, `fieldError('userIds', 'El asistente debe ser miembro del proyecto')`; cada `stakeholderId` del proyecto: si no, `fieldError('stakeholderIds', 'El interesado no pertenece a este proyecto')`. Acuerdos: sincroniza por `id` (actualiza, crea, borra los ausentes); un acuerdo convertido que se borra o cambia de texto → 409 `agreement_converted` «Este acuerdo ya se convirtió». `ownerId` de un acuerdo sigue la regla de responsable (miembro, no observador).
  - `POST /api/projects/:id/meetings/:meetingId/agreements/:agreementId/convert` `convertAgreementSchema` → 200 con el acuerdo (forma de `MeetingDto.agreements[i]`). En una transacción: crear el destino y luego `updateMany({ where: { id, taskId: null, decisionId: null, incidentId: null }, data: { <campo>: destino.id } })`; si `count === 0`, lanzar el 409 para que la transacción revierta el destino creado. Tarea: `title = text`, `assigneeIds = ownerId ? [ownerId] : []`, `dueDate`, raíz; decisión: `title = text`, `decidedOn = meeting.date`; incidente: `title = text`, `ownerId`, `dueDate`, `reportedById = PM`. Notificaciones (asignación de tarea, incidente asignado) después de la transacción, como hacen esas rutas.
  - Bitácora: crear/editar/borrar reunión y convertir acuerdo (este último como edición de la reunión o entrada propia «convirtió un acuerdo en tarea»).

- [ ] **Step 1: Pruebas**
  - `'el colaborador ve solo las actas a las que asistió, sin interesados ni ids de decisión o incidente'`: dos reuniones, `ana` asiste a una con un interesado y un acuerdo convertido a decisión → lista de `ana` con 1; detalle con `attendees.stakeholders` vacío, `agreements[0]` sin `decisionId` y `convertedTo: 'decision'`; la otra → 404; observador → 403.
  - `'convertir en tarea crea la tarea asignada y convertir de nuevo da 409'`: tarea con título del acuerdo, asignada a `ana`, notificación `TASK_ASSIGNED`; segundo POST → 409 «Este acuerdo ya se convirtió»; `prisma.task.count` no cambia.
  - `'dos conversiones simultáneas crean un solo elemento'`: `Promise.all` de dos POST `kind: 'decision'` → un 200 y un 409, `decision.count === 1`.
  - `'el responsable que salió del proyecto impide convertir y no crea nada'`: quitar a `ana` de miembros; convertir a tarea → 400; ninguna tarea nueva.
  - `'borrar la tarea creada deja el acuerdo sin vínculo'` y `'borrar un interesado lo quita de los asistentes'`.
  - `'un asistente que no es miembro da 400'` con «El asistente debe ser miembro del proyecto».
  - `'un acuerdo convertido no se borra'`: PATCH con `agreements: []` → 409.
  - `'las notas se sanean'`.
- [ ] **Step 2:** Correr `tests/meetings.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implementar (primero la extracción de `createTaskInProject`, con `tests/tasks.test.ts` en verde).
- [ ] **Step 4:** Correr `tests/meetings.test.ts tests/tasks.test.ts tests/accessMatrix.test.ts tests/closedGuard.test.ts tests/activityCoverage.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: actas de reunión con acuerdos convertibles`.

### Task 10: Actas en la interfaz

**Files:**
- Create: `client/src/pages/project/Meetings.tsx`, `client/src/components/meetings/MeetingForm.tsx`
- Modify: `client/src/router.tsx` (`reuniones`, `reuniones/:meetingId` bajo `ProjectSection section="meetings"`), `ProjectLayout.tsx` (pestaña «Reuniones», sección `meetings`, tras «Interesados»), `client/src/api/types.ts`
- Test: `client/tests/meetings.test.tsx`

**Interfaces:**
- Consumes: rutas de Task 9. Claves: `['project', id, 'meetings']`, `['project', id, 'meetings', meetingId]`.
- Comportamiento: lista por fecha; PM ve «Nueva reunión». Formulario: fecha, título, asistentes del equipo (todos los miembros, observadores incluidos: asistir no da acceso al acta al observador), interesados, editor de notas con la ayuda «Los asistentes del equipo verán estas notas», acuerdos (texto, responsable, fecha; agregar y quitar). En el detalle, cada acuerdo sin convertir muestra al PM «Crear tarea», «Registrar decisión», «Registrar incidente»; uno convertido muestra el enlace al elemento (`/proyectos/:id/tareas/:taskId`, decisiones e incidentes a sus páginas) o, para el colaborador sin id, el texto «Convertido en decisión» / «Convertido en incidente». Tras convertir invalida el acta, las tareas (`refreshTaskData` o las claves de tareas), las decisiones y los incidentes.

- [ ] **Step 1: Pruebas**
  - `'el PM convierte un acuerdo en tarea'` → POST `convert` con `{ kind: 'task' }` y aparece el enlace.
  - `'el colaborador ve el acta sin botones de conversión ni editar'` y con «Convertido en decisión».
  - `'el formulario avisa que los asistentes verán las notas'`.
- [ ] **Step 2:** `npx vitest run tests/meetings.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx vitest run` y `npx tsc -b` en `client/`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: actas de reunión en la interfaz`.

### Task 11: Flujo completo y documentación

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `docs/guia-implementacion-pmbok.md` (etapa 6 ✓ y notas «Hecho» en F9, F10, F11)
- Test: `e2e/main-flow.spec.ts`

- [ ] **Step 1:** Agregar al flujo: el PM abre «Informes», «Nuevo informe», escribe un comentario, emite y confirma; el observador del flujo (si el flujo no tiene uno, crearlo con el mismo método que usa para los demás usuarios) inicia sesión, abre «Informes», ve «Informe 1» y el comentario, y no ve «Presupuesto».
- [ ] **Step 2:** `npm run build` y `TEST_DATABASE_URL=… npm run test:e2e`. Expected: antes de terminar el paso 1 el nuevo tramo falla; al final PASS 1/1.
- [ ] **Step 3:** Marcar la guía.
- [ ] **Step 4:** `TEST_DATABASE_URL=… npm test` en la raíz. Expected: todo verde.
- [ ] **Step 5:** Commit `test: flujo del informe de estado` y `docs: marca la etapa 6 en la guía` (o uno solo `docs:` si solo cambia la guía tras el e2e).
