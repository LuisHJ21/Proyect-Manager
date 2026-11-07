# Gestor de proyectos PMBOK 7: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la aplicación web de red local para gestionar proyectos según PMBOK 7, con dos roles, acta, tareas con dependencias, anexos, interesados, riesgos, presupuesto e indicadores.

**Architecture:** Monorepo con npm workspaces. Un solo proceso Fastify atiende la API y entrega el frontend React compilado, con datos en SQLite y anexos en disco. Las reglas de negocio viven en funciones puras de `server/src/domain/`, y los esquemas Zod se comparten en `shared/`.

**Tech Stack:** TypeScript, React 19, Tailwind 4, Vite, React Router, TanStack Query, @dnd-kit/core, Fastify 5, Prisma 6, SQLite, Zod, @node-rs/argon2, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-gestor-proyectos-pmbok7-design.md`

## Global Constraints

- Todo texto visible para el usuario está en español. Los identificadores de código están en inglés.
- Node 24. Versiones: `react@^19`, `tailwindcss@^4`, `fastify@^5`, `prisma@^6` y `@prisma/client@^6`.
- Permisos y reglas se validan siempre en el servidor.
- La API no envía a un colaborador presupuesto, gastos, interesados, riesgos ni indicadores derivados.
- Formato de error: `{ "error": { "code": string, "message": string, "fields"?: Record<string,string>, "details"?: object } }`.
- No miembro de un proyecto: 404. Miembro sin permiso: 403.
- Montos: enteros en centavos. Fechas de planificación: texto `YYYY-MM-DD`, nunca `Date`.
- Interfaz: Tailwind sobrio de aplicación de gestión, usable desde 1024 px de ancho.
- Trabajo en la rama `feat/gestor-pmbok7`. Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Correos con mayúsculas o espacios** (`" Ana@X.com "`): identifican a la misma cuenta al crearla y al iniciar sesión. Prueba en la Tarea 2.
2. **Nombres de anexo con acentos, comillas o rutas** (`../../informe "final" ñ.pdf`): se conserva el nombre al descargar y nunca se usa para la ruta en disco. Prueba en la Tarea 8.
3. **Fechas de calendario y zona horaria:** una tarea que vence hoy no está vencida a las 23:30 hora local, aunque en UTC ya sea mañana. Prueba en la Tarea 9.
4. **Avance en una tarea en espera:** subir el porcentaje con predecesoras pendientes se rechaza, para que el bloqueo no se pueda eludir. Prueba en la Tarea 7.
5. **Montos en formato latino** (`1.234,50`, `1234.5`, `-5`): se interpretan sin error de redondeo o se rechazan. Prueba en la Tarea 1.

---

## Contrato compartido

**Valores de enumeración** (SQLite no admite enums en Prisma: se guardan como `String` y se validan con Zod; `shared/src/enums.ts` exporta también `LABELS` con la etiqueta en español de la especificación):

```ts
ROLE = ['PM','COLLABORATOR']
PROJECT_STATUS = ['PLANNING','EXECUTING','PAUSED','CLOSED','CANCELLED']
APPROACH = ['PREDICTIVE','AGILE','HYBRID']
CHARTER_STATUS = ['DRAFT','APPROVED']
OBJECTIVE_STATUS = ['PENDING','MET','NOT_MET']
MILESTONE_STATUS = ['PENDING','REACHED']
TASK_STATUS = ['TODO','IN_PROGRESS','BLOCKED','DONE']
PRIORITY = ['LOW','MEDIUM','HIGH']
LEVEL = ['LOW','MEDIUM','HIGH']
RISK_TYPE = ['THREAT','OPPORTUNITY']
RISK_STATUS = ['OPEN','TREATING','CLOSED']
RISK_RESPONSE = { THREAT:['AVOID','MITIGATE','TRANSFER','ESCALATE','ACCEPT'], OPPORTUNITY:['EXPLOIT','ENHANCE','SHARE','ESCALATE','ACCEPT'] }
EXPENSE_CATEGORY = ['LABOR','MATERIALS','EQUIPMENT','SERVICES','OTHER']
```

**Rutas de la API** (todas bajo `/api`; "PM" exige ese rol y "miembro" admite a PM y a miembros):

| Ruta | Acceso |
|---|---|
| `GET setup/status`, `POST setup` | Público, `POST` solo sin usuarios |
| `POST auth/login`, `POST auth/logout`, `GET auth/me`, `POST auth/change-password` | Público / sesión |
| `GET,POST users`, `PATCH users/:id`, `POST users/:id/reset-password` | PM |
| `GET projects`, `GET projects/:id` | Miembro (lista filtrada) |
| `POST projects`, `PATCH,DELETE projects/:id` (`DELETE` exige `{confirmName}`) | PM |
| `GET projects/:id/members` | Miembro |
| `POST projects/:id/members`, `PATCH,DELETE projects/:id/members/:userId`, `GET .../:userId/impact` | PM |
| `GET projects/:id/charter` | Miembro |
| `PUT projects/:id/charter`, `POST projects/:id/charter/approve` | PM |
| `GET projects/:id/{objectives,milestones}` | Miembro |
| `POST`, `PATCH /:itemId`, `DELETE /:itemId` en `objectives`, `milestones` | PM |
| CRUD completo en `projects/:id/{stakeholders,risks,expenses}` | PM |
| `GET projects/:id/tasks`, `GET tasks/:id`, `GET me/tasks` | Miembro / propio |
| `POST projects/:id/tasks`, `PATCH,DELETE tasks/:id`, `PUT tasks/:id/assignees` | PM |
| `POST tasks/:id/dependencies`, `DELETE tasks/:id/dependencies/:predecessorId` | PM |
| `PATCH tasks/:id/progress`, `POST tasks/:id/comments` | PM o asignado |
| `GET projects/:id/attachments`, `GET tasks/:id/attachments`, `GET attachments/:id/download` | Miembro |
| `POST projects/:id/attachments` | PM |
| `POST tasks/:id/attachments` | PM o asignado |
| `DELETE attachments/:id` | PM o quien lo subió |
| `GET projects/:id/indicators` | Miembro (campos filtrados) |

`PATCH tasks/:id` no acepta `status` ni `progress`: solo `tasks/:id/progress` los cambia, para que la regla de dependencias tenga un único punto de entrada.

---

### Task 1: Base del monorepo, servidor, esquema y utilidades compartidas

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.base.json`, `shared/package.json`, `shared/src/{index,enums,money,dates,schemas}.ts`, `server/package.json`, `server/prisma/schema.prisma`, `server/src/{app,index,config,errors}.ts`, `server/tests/helpers/{globalSetup,testApp}.ts`, `client/` (plantilla Vite con React, Tailwind y una página mínima)
- Test: `shared/tests/money.test.ts`, `shared/tests/dates.test.ts`, `server/tests/app.test.ts`

**Interfaces:**
- Produces:
  - Shared: `parseMoneyToCents(input: string): number | null`, `formatMoney(cents: number, currency: string): string`, `localToday(now: Date): string`, `addDays(date: string, days: number): string`.
  - Server: `buildApp(opts: { prisma: PrismaClient; dataDir: string; now?: () => Date; clientDist?: string }): Promise<FastifyInstance>` con `app.now()` decorado; `class AppError(status, code, message, extras?: { fields?; details? })`; `databaseUrl(dataDir: string): string`.
  - Pruebas: `createTestApp(opts?: { clientDist?: string }): Promise<TestCtx>`, con `ctx.app`, `ctx.prisma`, `ctx.dataDir`, `ctx.clock.set(iso)`, `ctx.makeUser({role, name?, email?, password?, mustChangePassword?})`, `ctx.makeProject({members?: User[]})`, `ctx.makeTask(projectId, {assignees?, status?, ...})`, `ctx.as(user).get|post|put|patch|delete(url, body?)`, `ctx.anon`, `ctx.close()`.

- [ ] **Step 1: Crear los workspaces y la plantilla del cliente**

`package.json` raíz con `workspaces: ["shared","server","client"]` y scripts `build`, `start`, `test` y `dev`. `shared/package.json` declara `"name":"@pm/shared"` y `"exports":"./src/index.ts"`. `.gitignore` incluye `node_modules`, `dist`, `data`, `*.db`, `test-results`, `playwright-report`.

Run: `npm install`
Expected: termina sin errores.

- [ ] **Step 2: Escribir las pruebas de utilidades que fallan**

```ts
it('parseMoneyToCents', () => {
  expect(parseMoneyToCents('1.234,50')).toBe(123450);
  expect(parseMoneyToCents('1,234.50')).toBe(123450);
  expect(parseMoneyToCents('1234.5')).toBe(123450);
  expect(parseMoneyToCents('1,5')).toBe(150);
  expect(parseMoneyToCents('1.234')).toBe(123400);
  expect(parseMoneyToCents('0.29')).toBe(29);
  expect(parseMoneyToCents('0')).toBe(0);
  for (const bad of ['-5', 'abc', '', '1,2,3', '1.2345']) expect(parseMoneyToCents(bad)).toBeNull();
});
it('localToday usa la hora local, no UTC', () => {
  expect(localToday(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
  expect(addDays('2026-11-30', 14)).toBe('2026-12-14');
});
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w shared`
Expected: FAIL, funciones no definidas.

- [ ] **Step 4: Implementar `money.ts`, `dates.ts` y `enums.ts`**

`parseMoneyToCents` usa solo aritmética entera: el último separador es decimal si le siguen 1 o 2 dígitos, y de miles si le siguen 3.

- [ ] **Step 5: Escribir la prueba de la aplicación que falla**

```ts
it('devuelve JSON en rutas API desconocidas y index.html en rutas de la web', async () => {
  const ctx = await createTestApp({ clientDist: fixtureDist });
  const api = await ctx.anon.get('/api/nope');
  expect(api.statusCode).toBe(404);
  expect(api.json().error.code).toBe('not_found');
  const page = await ctx.anon.get('/proyectos/abc');
  expect(page.statusCode).toBe(200);
  expect(page.headers['content-type']).toContain('text/html');
});
it('convierte ZodError en 400 con errores por campo', ...); // ruta de prueba registrada en la propia prueba
```

- [ ] **Step 6: Escribir `schema.prisma` y crear la migración inicial**

Modelos con `id` (cuid), `createdAt`, `updatedAt`:

```
User: name, email @unique, passwordHash, role, active, mustChangePassword
Session: userId, tokenHash @unique, expiresAt
Project: name, description, status, approach, startDate?, endDate?, plannedBudgetCents, currency
ProjectMember: projectId, userId, projectRole; @@unique([projectId,userId])
Charter: projectId @unique, justification, scopeIncluded, scopeExcluded, boundaries, assumptions, constraints, successCriteria, sponsor, status, approvedById?, approvedAt?
Objective: projectId, description, metric, target, status
Milestone: projectId, name, dueDate, status
Task: projectId, milestoneId?, title, description, status, priority, startDate?, dueDate?, progress
TaskAssignee: taskId, userId; @@id([taskId,userId])
TaskDependency: predecessorId, successorId; @@id([predecessorId,successorId])
TaskComment: taskId, authorId, body
Attachment: projectId, taskId?, uploadedById, originalName, storedName, mimeType, size
Stakeholder: projectId, name, organization, position, contact, influence, interest, strategy
Risk: projectId, description, type, probability, impact, response, responsePlan, ownerId?, status
Expense: projectId, description, amountCents, date, category
```

Lo que cuelga de un proyecto o tarea se borra en cascada. `Task.milestoneId` y `Risk.ownerId` usan `SetNull`. `approvedById` es referencia sin cascada.

Run: `npx -w server prisma migrate dev --name init`
Expected: crea la migración y genera el cliente.

- [ ] **Step 7: Implementar `buildApp`, `errors.ts`, `config.ts` y los ayudantes de prueba**

`globalSetup` crea una base plantilla con `prisma migrate deploy`, y `createTestApp` la copia a una carpeta temporal por prueba. `databaseUrl` convierte `\` en `/` para las rutas de Windows. `ctx.close()` desconecta Prisma antes de borrar la carpeta.

- [ ] **Step 8: Verificar que pasan**

Run: `npm test -w shared; npm test -w server; npm run build -w client`
Expected: PASS y compilación correcta.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: base del monorepo, esquema de datos y servidor"
```

---

### Task 2: Configuración inicial, inicio de sesión y sesiones

**Files:**
- Create: `server/src/auth/{passwords,sessions,loginLimiter,guards}.ts`, `server/src/routes/auth.ts`; modify `shared/src/schemas.ts`
- Test: `server/tests/auth.test.ts`

**Interfaces:**
- Consumes: `AppError`, `app.now()`, `TestCtx`.
- Produces: `requireUser(req): User`, `requirePm(req): User`, `hashPassword(p): Promise<string>`, `verifyPassword(hash, p): Promise<boolean>`, `createSession(prisma, userId, now): Promise<string>`, `deleteUserSessions(prisma, userId)`, `emailSchema` y `passwordSchema` (mínimo 10 caracteres). Cookie `pm_session`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('setup crea el primer PM una sola vez', ...);        // luego POST setup → 409 setup_complete; status.needsSetup false
it('correo con mayúsculas y espacios es la misma cuenta', async () => {
  await post('/api/setup', { name:'Ana', email:' Ana@X.com ', password:'contraseña-larga' });
  expect((await login('ana@x.com', 'contraseña-larga')).statusCode).toBe(200);
});
it('la cookie es httpOnly y SameSite=Lax, y vence a las 12 horas', async () => {
  ctx.clock.set('2026-11-06T08:00:00');  // login
  ctx.clock.set('2026-11-06T20:00:01');
  expect((await asCookie.get('/api/auth/me')).statusCode).toBe(401);
});
it('rechaza contraseña de menos de 10 caracteres con fields.password', ...);
it('credenciales erróneas y cuenta inactiva dan el mismo 401 invalid_credentials', ...);
it('tras 5 fallos responde 429 con details.retryAfterSeconds, incluso con la contraseña correcta', ...);
it('a los 15 minutos permite intentar de nuevo', ...);
it('con mustChangePassword solo permite me, logout y change-password', async () => {
  const c = await ctx.makeUser({ role:'COLLABORATOR', mustChangePassword:true });
  const res = await ctx.as(c).get('/api/projects');
  expect(res.statusCode).toBe(403);
  expect(res.json().error.code).toBe('password_change_required');
});
it('change-password exige la actual e invalida las demás sesiones', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/auth.test.ts`
Expected: FAIL con 404 en las rutas.

- [ ] **Step 3: Implementar autenticación y rutas**

Token aleatorio de 32 bytes, con su SHA-256 guardado en `Session.tokenHash`. Limitador en memoria por `email|ip`. El hook `preHandler` carga `req.user` y aplica la regla de `mustChangePassword`.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server -- tests/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: configuración inicial, sesiones y límite de intentos"
```

---

### Task 3: Administración de usuarios

**Files:**
- Create: `server/src/routes/users.ts`
- Test: `server/tests/users.test.ts`

**Interfaces:**
- Consumes: `requirePm`, `hashPassword`, `deleteUserSessions`.
- Produces: `UserDto = {id, name, email, role, active, mustChangePassword}`. Nunca incluye `passwordHash`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('colaborador recibe 403 en /api/users', ...);
it('crear usuario deja mustChangePassword=true y no devuelve passwordHash', ...);
it('correo duplicado responde 409 email_taken con fields.email', ...);
it('desactivar invalida sus sesiones', ...);            // su siguiente GET auth/me → 401
it('no se puede desactivar ni degradar al último PM activo', ...); // 409 last_pm
it('reset-password exige cambiarla al entrar e invalida sesiones', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/users.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar las rutas de usuarios**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server -- tests/users.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: administración de usuarios por el Project Manager"
```

---

### Task 4: Proyectos, miembros y acta

**Files:**
- Create: `server/src/auth/access.ts`, `server/src/routes/{projects,members,charter}.ts`, `server/src/files.ts`; modify `shared/src/schemas.ts`
- Test: `server/tests/projects.test.ts`, `server/tests/charter.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `requirePm`.
- Produces: `getProjectAccess(req, projectId): Promise<{ project: Project; isPm: boolean }>` (404 si no es miembro), `requireProjectPm(req, projectId)` (404 si no es miembro, 403 si es colaborador), `toProjectDto(project, isPm)`, `removeStoredFiles(dataDir, storedNames: string[]): Promise<void>` (ignora archivos ausentes).

- [ ] **Step 1: Escribir las pruebas de proyectos que fallan**

```ts
it('crear un proyecto crea su acta en DRAFT', ...);
it('rechaza startDate posterior a endDate con fields.startDate', ...);
it('colaborador lista solo sus proyectos, sin datos de presupuesto', async () => {
  const [p] = (await ctx.as(c).get('/api/projects')).json();
  expect(p).not.toHaveProperty('plannedBudgetCents');
  expect(p).not.toHaveProperty('currency');
});
it('no miembro recibe 404 y miembro recibe 403 al editar', ...);
it('todo PM ve todos los proyectos', ...);
it('DELETE exige confirmName exacto y borra los archivos del disco', ...);
it('no se puede añadir un usuario inactivo como miembro', ...);
it('impact informa tareas y riesgos; quitar al miembro elimina asignaciones y deja el riesgo sin responsable', ...);
```

- [ ] **Step 2: Escribir las pruebas del acta que fallan**

```ts
it('no aprueba sin justificación, alcance incluido y criterios de éxito', ...); // 400 con fields de los tres
it('aprobar registra approvedById y approvedAt', ...);
it('editar un acta aprobada la devuelve a DRAFT y borra la aprobación', ...);
it('colaborador miembro lee el acta y recibe 403 al editar', ...);
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w server -- tests/projects.test.ts tests/charter.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar acceso, rutas y `removeStoredFiles`**

La fila de `Attachment` se lee antes de borrar el proyecto, y los archivos se eliminan después de confirmar el borrado en la base.

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -w server -- tests/projects.test.ts tests/charter.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: proyectos, miembros y acta de constitución"
```

---

### Task 5: Objetivos, hitos, interesados, riesgos y gastos

**Files:**
- Create: `server/src/routes/projectCrud.ts`, `server/src/routes/registers.ts`; modify `shared/src/schemas.ts`
- Test: `server/tests/registers.test.ts`

**Interfaces:**
- Consumes: `getProjectAccess`, `requireProjectPm`.
- Produces: `registerProjectCrud(app, { path, delegate, createSchema, updateSchema, readAccess: 'member' | 'pm', validate?, toDto? })`. El DTO de riesgo añade `score = probability * impact`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it.each(['stakeholders','risks','expenses'])('colaborador miembro recibe 403 en %s', ...);
it.each(['objectives','milestones'])('colaborador lee %s y recibe 403 al escribir', ...);
it('un ítem de otro proyecto responde 404', ...);
it('riesgo devuelve score=20 con probabilidad 4 e impacto 5', ...);
it('rechaza probabilidad 6 y respuesta EXPLOIT en una amenaza', ...);
it('el responsable del riesgo debe ser miembro', ...);
it('rechaza gasto negativo o con decimales en amountCents', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/registers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `registerProjectCrud` y los cinco registros**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server -- tests/registers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: objetivos, hitos, interesados, riesgos y gastos"
```

---

### Task 6: Tareas, asignaciones y comentarios

**Files:**
- Create: `server/src/routes/tasks.ts`, `server/src/routes/taskDto.ts`; modify `shared/src/schemas.ts`
- Test: `server/tests/tasks.test.ts`

**Interfaces:**
- Consumes: `getProjectAccess`, `requireProjectPm`, `removeStoredFiles`.
- Produces: `TaskDto = {id, projectId, milestoneId, title, description, status, priority, startDate, dueDate, progress, assignees:{id,name}[], predecessorIds:string[], waitingOn:{id,title}[], warnings:TaskWarning[]}`, con `TaskWarning = 'predecessor_not_done' | 'starts_before_predecessor_due'`; `getTaskAccess(req, taskId): Promise<{ task; isPm; isAssignee }>`. En esta tarea `waitingOn` y `warnings` van vacíos; la Tarea 7 los calcula.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('una tarea admite varios asignados y aparece en me/tasks de cada uno', ...);
it('rechaza asignar a quien no es miembro', ...);
it('el hito debe ser del mismo proyecto', ...);
it('PATCH tasks/:id rechaza status y progress', ...);  // 400 con fields.status
it('asignado actualiza; colaborador no asignado recibe 403', ...);
it('colaborador miembro lee todas las tareas del proyecto', ...);
it('marcar DONE fija progress=100', ...);
it('rechaza progress fuera de 0 a 100', ...);
it('comentar requiere ser PM o asignado; no hay PATCH ni DELETE de comentarios', ...);
it('eliminar una tarea borra sus anexos del disco', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/tasks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar las rutas y el DTO**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server -- tests/tasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: tareas con varios asignados y comentarios"
```

---

### Task 7: Dependencias entre tareas

**Files:**
- Create: `server/src/domain/dependencies.ts`, `server/src/routes/dependencies.ts`; modify `server/src/routes/tasks.ts`, `server/src/routes/taskDto.ts`
- Test: `server/tests/domain/dependencies.test.ts`, `server/tests/dependencies.test.ts`

**Interfaces:**
- Consumes: `TaskDto`, `getTaskAccess`, `requireProjectPm`.
- Produces: `findDependencyCycle(edges: {predecessorId:string; successorId:string}[], predecessorId: string, successorId: string): string[] | null` (cadena de ids que cerraría el ciclo) y `checkProgressChange(current: {status; progress}, next: {status?; progress?}, pendingPredecessors: number): 'ok' | 'blocked'`.

- [ ] **Step 1: Escribir las pruebas de dominio que fallan**

```ts
it('detecta ciclos', () => {
  const e = [{ predecessorId:'A', successorId:'B' }, { predecessorId:'B', successorId:'C' }];
  expect(findDependencyCycle(e, 'C', 'A')).toEqual(['A','B','C','A']);
  expect(findDependencyCycle(e, 'A', 'A')).toEqual(['A','A']);
  expect(findDependencyCycle(e, 'A', 'C')).toBeNull();
});
it('checkProgressChange', () => {
  const t = { status:'TODO', progress:0 };
  expect(checkProgressChange(t, { status:'IN_PROGRESS' }, 1)).toBe('blocked');
  expect(checkProgressChange(t, { status:'DONE' }, 1)).toBe('blocked');
  expect(checkProgressChange(t, { progress:10 }, 1)).toBe('blocked');   // Review Focus 4
  expect(checkProgressChange(t, { status:'BLOCKED' }, 1)).toBe('ok');
  expect(checkProgressChange({ status:'IN_PROGRESS', progress:50 }, { progress:30 }, 1)).toBe('ok');
  expect(checkProgressChange(t, { status:'DONE' }, 0)).toBe('ok');
});
```

- [ ] **Step 2: Escribir las pruebas de API que fallan**

```ts
it('un ciclo responde 409 dependency_cycle con details.chain de {id,title}', ...);
it('rechaza una predecesora de otro proyecto con 400', ...);
it('dependencia duplicada responde 409 dependency_exists', ...);
it('el bloqueo aplica también al PM: 409 predecessors_pending con details.pending', ...);
it('la sucesora avanza cuando todas sus predecesoras están DONE', ...);
it('al reabrir la predecesora, la sucesora conserva estado y muestra predecessor_not_done', ...);
it('startDate anterior al dueDate de la predecesora guarda y muestra starts_before_predecessor_due', ...);
it('quitar la dependencia permite avanzar', ...);
it('waitingOn lista las predecesoras sin terminar', ...);
it('colaborador recibe 403 al crear dependencias', ...);
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w server -- tests/domain/dependencies.test.ts tests/dependencies.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar el dominio, las rutas y los campos del DTO**

`predecessor_not_done` aplica si la tarea no está en `TODO` y tiene predecesoras sin terminar. `PATCH tasks/:id/progress` llama a `checkProgressChange` dentro de una transacción.

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -w server -- tests/domain/dependencies.test.ts tests/dependencies.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: dependencias fin a inicio con bloqueo y detección de ciclos"
```

---

### Task 8: Anexos

**Files:**
- Create: `server/src/routes/attachments.ts`, `shared/src/fileTypes.ts`; modify `server/src/files.ts`
- Test: `server/tests/attachments.test.ts`

**Interfaces:**
- Consumes: `getProjectAccess`, `requireProjectPm`, `getTaskAccess`.
- Produces: `MAX_FILE_BYTES = 26214400`, `isAllowedFile(filename: string, mimeType: string): boolean`, `ACCEPT_ATTRIBUTE: string` (para `<input type=file>`), `saveUpload(dataDir, stream): Promise<{ storedName; size; truncated }>`. `AttachmentDto = {id, taskId, originalName, mimeType, size, uploadedBy:{id,name}, createdAt}`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('asignado sube a su tarea; colaborador no asignado recibe 403', ...);
it('colaborador recibe 403 al subir al proyecto', ...);
it('sin sesión la descarga responde 401 y sin ser miembro 404', ...);
it('rechaza .exe con 415 y no deja archivo en disco', ...);
it('rechaza 25 MB + 1 byte con 413 y sin residuos; acepta exactamente 25 MB', ...);
it('acepta CSV como application/vnd.ms-excel y ZIP como application/x-zip-compressed', ...);
it('nombre con acentos, comillas y ruta se conserva y no sale de uploads', async () => {
  const up = await upload('../../informe "final" ñ.pdf');
  const row = await ctx.prisma.attachment.findUniqueOrThrow({ where:{ id:up.id } });
  expect(row.storedName).toMatch(/^[0-9a-f-]{36}$/);
  const res = await ctx.as(pm).get(`/api/attachments/${up.id}/download`);
  expect(res.headers['content-disposition']).toMatch(/^attachment;/);
  expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers['content-type']).toContain('application/octet-stream');
});
it('si falla el registro se borra el archivo', ...);    // prisma.attachment.create simulado con error
it('colaborador elimina solo lo que subió; PM elimina todo', ...);
it('archivo ausente en disco responde 404 attachment_file_missing, sin caída', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w server -- tests/attachments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar con `@fastify/multipart`**

Usar `limits.fileSize = MAX_FILE_BYTES`. Guardar en `<dataDir>/uploads/<uuid>`. Si `file.truncated` es verdadero, borrar y responder 413.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w server -- tests/attachments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: anexos en tareas y proyectos"
```

---

### Task 9: Indicadores

**Files:**
- Create: `server/src/domain/indicators.ts`, `server/src/routes/indicators.ts`; modify `server/src/routes/projects.ts` (añade `progress` a la lista)
- Test: `server/tests/domain/indicators.test.ts`, `server/tests/indicators.test.ts`

**Interfaces:**
- Consumes: `localToday`, `addDays`, `getProjectAccess`.
- Produces: `computeIndicators(input, today: string): Indicators`, con `Indicators = {progress, overdueTasks, blockedTasks, upcomingMilestones:{id,name,dueDate}[], budget?:{plannedCents,spentCents,differenceCents}, highRisks?:number}`.

- [ ] **Step 1: Escribir las pruebas de dominio que fallan**

```ts
it('progress es 0 sin tareas y promedio simple redondeado con tareas', ...);  // [10,20,25] → 18
it('la fecha límite de hoy no está vencida; la de ayer sí; DONE nunca', ...);
it('highRisks cuenta score>=15 no cerrados', ...);                             // 3×5 sí, 3×4 no, 5×5 cerrado no
it('hitos próximos: hoy y hoy+14 sí; hoy+15 y REACHED no', ...);
it('budget calcula la diferencia, que puede ser negativa', ...);
```

- [ ] **Step 2: Escribir las pruebas de API que fallan**

```ts
it('a las 23:30 hora local, una tarea que vence hoy no cuenta como vencida', async () => {
  ctx.clock.set('2026-11-06T23:30:00');
  await ctx.makeTask(project.id, { dueDate:'2026-11-06', status:'TODO' });
  expect((await ctx.as(pm).get(url)).json().overdueTasks).toBe(0);
});
it('colaborador no recibe budget ni highRisks', ...);
it('PM los recibe', ...);
```

- [ ] **Step 3: Verificar que fallan**

Run: `npm test -w server -- tests/domain/indicators.test.ts tests/indicators.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implementar el cálculo y la ruta**

- [ ] **Step 5: Verificar que pasan**

Run: `npm test -w server`
Expected: PASS en todas las pruebas del servidor.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: indicadores por proyecto filtrados por rol"
```

---

### Task 10: Base del cliente, sesión y usuarios

**Files:**
- Create: `client/src/api/client.ts`, `client/src/auth/{AuthProvider,RequireAuth}.tsx`, `client/src/components/{AppLayout,FormField,ConfirmDialog,Toast,ErrorState}.tsx`, `client/src/pages/{Setup,Login,ChangePassword,Users}.tsx`, `client/src/router.tsx`
- Test: `client/tests/api.test.ts`, `client/tests/auth.test.tsx`

**Interfaces:**
- Consumes: esquemas y `LABELS` de `@pm/shared`, rutas `setup`, `auth` y `users`.
- Produces: `api<T>(path, { method?, body?, formData? }): Promise<T>`, `class ApiError { status; code; message; fields?; details? }`, `useAuth(): { user; isPm; logout }`, `<FormField label error>`, `applyFieldErrors(error, setError)`, `useToast()`, `<ConfirmDialog>`. El servidor de desarrollo de Vite redirige `/api` a `localhost:3000`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('api convierte el formato de error en ApiError con fields', ...);
it('un error de red da ApiError con code network_error', ...);
it('RequireAuth lleva a /login sin sesión y a /cambiar-contrasena con mustChangePassword', ...);
it('con needsSetup muestra la configuración inicial', ...);
it('Users conserva lo escrito y marca fields.email ante email_taken', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/api.test.ts tests/auth.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar el cliente HTTP, la navegación por rol y las pantallas**

Rutas de la web: `/`, `/login`, `/configuracion-inicial`, `/cambiar-contrasena`, `/proyectos`, `/proyectos/:id/{resumen,acta,tareas,anexos,interesados,riesgos,presupuesto}`, `/mis-tareas`, `/usuarios`. `/` lleva al PM a `/proyectos` y al colaborador a `/mis-tareas`.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/api.test.ts tests/auth.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: base del cliente, autenticación y usuarios"
```

---

### Task 11: Pantallas de proyecto, resumen y acta

**Files:**
- Create: `client/src/pages/project/{ProjectList,ProjectLayout,Summary,Charter}.tsx`, `client/src/components/project/{ProjectForm,MembersPanel,ObjectivesPanel,MilestonesPanel,IndicatorCards,DeleteProjectDialog}.tsx`, `client/src/components/MoneyInput.tsx`
- Test: `client/tests/charter.test.tsx`, `client/tests/projectLayout.test.tsx`

**Interfaces:**
- Consumes: `api`, `useAuth`, `FormField`, `ConfirmDialog`, `parseMoneyToCents`, `formatMoney`.
- Produces: `<ProjectLayout>` con pestañas y `useProject()`; `<MoneyInput value:number|null onChange currency>`, que muestra error si `parseMoneyToCents` devuelve `null`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('al colaborador no le muestra Interesados, Riesgos ni Presupuesto', ...);
it('Charter muestra los errores de aprobación por campo sin perder lo escrito', ...);
it('editar un acta aprobada advierte que volverá a Borrador', ...);
it('el colaborador ve el acta sin controles de edición', ...);
it('eliminar el proyecto exige escribir su nombre', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/charter.test.tsx tests/projectLayout.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar lista, formularios, resumen y acta**

`MembersPanel` consulta `impact` y lo muestra en el `ConfirmDialog` antes de quitar a un miembro.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/charter.test.tsx tests/projectLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: pantallas de proyecto, resumen y acta"
```

---

### Task 12: Tareas: lista, Kanban, detalle y Mis tareas

**Files:**
- Create: `client/src/pages/project/Tasks.tsx`, `client/src/pages/MyTasks.tsx`, `client/src/components/tasks/{TaskList,KanbanBoard,TaskCard,TaskDrawer,TaskForm,DependencyPicker,CommentList}.tsx`, `client/src/components/attachments/AttachmentList.tsx`
- Test: `client/tests/kanban.test.tsx`, `client/tests/taskDrawer.test.tsx`

**Interfaces:**
- Consumes: `api`, `useAuth`, `useToast`, `TaskDto`, `AttachmentDto`, `ACCEPT_ATTRIBUTE`, `MAX_FILE_BYTES`.
- Produces: `moveTask(task, status): Promise<void>` en `KanbanBoard`; `<AttachmentList scope={{ projectId } | { taskId }} canUpload>`, y `<Tasks>` con un selector que guarda la vista en `?vista=lista|kanban|cronograma`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('Kanban actualiza de inmediato y revierte la tarjeta ante 409, mostrando qué falta', ...);
it('una tarjeta en espera muestra las predecesoras pendientes', ...);
it('el colaborador solo puede arrastrar tareas en las que está asignado', ...);
it('el detalle muestra las advertencias predecessor_not_done y starts_before_predecessor_due', ...);
it('un ciclo muestra la cadena con los títulos de las tareas', ...);
it('avisa antes de eliminar una tarea de la que dependen otras', ...);
it('AttachmentList rechaza en el cliente más de 25 MB y muestra 415 del servidor', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/kanban.test.tsx tests/taskDrawer.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar lista, Kanban con `@dnd-kit/core`, detalle y Mis tareas**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/kanban.test.tsx tests/taskDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: lista, Kanban, detalle de tarea y Mis tareas"
```

---

### Task 13: Cronograma

**Files:**
- Create: `client/src/components/tasks/{timelineLayout.ts,Timeline.tsx}`; modify `client/src/pages/project/Tasks.tsx`
- Test: `client/tests/timelineLayout.test.ts`

**Interfaces:**
- Consumes: `TaskDto`, hitos del proyecto.
- Produces: `buildTimelineLayout(tasks, milestones, dayWidth: number): { bars:{taskId,x,y,width}[]; arrows:{from,to,path:string}[]; milestones:{id,x}[]; undated:string[]; rangeStart:string; rangeEnd:string }`. `Timeline` lo dibuja en SVG con desplazamiento horizontal.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('coloca las barras según sus fechas de calendario, incluido un cambio de mes', ...);
it('una tarea sin startDate o sin dueDate va a undated y no genera barra', ...);
it('crea una flecha por dependencia, omitiendo tareas sin barra', ...);
it('una tarea de un solo día tiene el ancho de un día', ...);
it('sin tareas devuelve un layout vacío sin error', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/timelineLayout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `buildTimelineLayout` y `Timeline`**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/timelineLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: cronograma con barras, hitos y flechas de dependencia"
```

---

### Task 14: Interesados, riesgos, presupuesto y anexos del proyecto

**Files:**
- Create: `client/src/pages/project/{Stakeholders,Risks,Budget,Attachments}.tsx`, `client/src/components/RegisterTable.tsx`
- Test: `client/tests/risks.test.tsx`, `client/tests/budget.test.tsx`

**Interfaces:**
- Consumes: `api`, `FormField`, `MoneyInput`, `AttachmentList`, `RISK_RESPONSE`, `LABELS`, `formatMoney`.
- Produces: `<RegisterTable>` reutilizable para listas con alta, edición y baja.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
it('al cambiar el tipo de riesgo, las respuestas cambian y se limpia una inválida', ...);
it('muestra el puntaje y destaca los de 15 o más', ...);
it('Budget muestra planificado, gastado y diferencia, y marca el sobrecosto', ...);
it('un monto inválido no se envía y marca el campo', ...);
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -w client -- tests/risks.test.tsx tests/budget.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar las cuatro pantallas**

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -w client -- tests/risks.test.tsx tests/budget.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: interesados, riesgos, presupuesto y anexos del proyecto"
```

---

### Task 15: Arranque de producción, flujo completo y README

**Files:**
- Create: `server/scripts/start.mjs`, `e2e/main-flow.spec.ts`, `playwright.config.ts`, `README.md`; modify `package.json`, `server/src/index.ts`
- Test: `e2e/main-flow.spec.ts`

**Interfaces:**
- Consumes: toda la aplicación.
- Produces: `npm run build`, `npm start` y `npm run test:e2e`.

- [ ] **Step 1: Escribir la prueba de extremo a extremo que falla**

Dos contextos de navegador, servidor en el puerto 3100 con un `DATA_DIR` temporal:

```ts
test('flujo principal', async ({ browser }) => {
  // 1. PM: configuración inicial; crea a Beatriz y Carlos, miembros de un proyecto nuevo; completa y aprueba el acta.
  // 2. PM: crea "Diseño" (asignada a Beatriz) y "Construcción" (asignada a Carlos), con Diseño como predecesora.
  // 3. Carlos: cambia su contraseña temporal; en Mis tareas intenta iniciar Construcción.
  await expect(carlos.getByText('Diseño')).toBeVisible();          // mensaje de predecesoras pendientes
  // 4. Carlos no ve las pestañas Riesgos ni Presupuesto, y /proyectos/:id/riesgos no muestra datos.
  // 5. Beatriz: entra, marca Diseño como Hecha y sube un anexo PDF.
  // 6. Carlos: inicia Construcción y descarga el anexo de Diseño.
  // 7. PM: ve el avance del proyecto en 50 % en Resumen.
  await expect(pm.getByTestId('indicator-progress')).toHaveText('50 %');
});
```

- [ ] **Step 2: Implementar `start.mjs`**

Resuelve `DATA_DIR` (por defecto `<raíz>/data`), crea la carpeta, ejecuta `prisma migrate deploy` y arranca `dist/index.js` en `0.0.0.0:${PORT ?? 3000}`. Empaquetar el servidor con `tsup` y `noExternal: ['@pm/shared']`. Al iniciar, mostrar en consola las URL de la red local (`http://<IP>:<puerto>`).

- [ ] **Step 3: Ejecutar la prueba y corregir lo que falle**

Run: `npm run build; npm run test:e2e`
Expected: PASS.

- [ ] **Step 4: Escribir `README.md`**

Debe cubrir instalación y arranque, primer ingreso, el comando de PowerShell `New-NetFirewallRule -DisplayName "Gestor PMBOK" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow` (requiere administrador), respaldo de `data/` con el servidor detenido, la limitación de HTTP y la disponibilidad del equipo anfitrión.

- [ ] **Step 5: Verificación final desde una instalación limpia**

Run: clonar el repositorio en una carpeta temporal con `git clone` y, dentro de ella, `npm install; npm run build; npm test; npm run test:e2e`
Expected: todo en PASS. Después, `npm start` debe responder en la IP de red local del equipo en `/api/setup/status`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: arranque de producción, flujo completo y README"
```
