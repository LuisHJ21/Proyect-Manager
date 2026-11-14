# Migración a Netlify, Hono y Supabase: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ejecutar la aplicación en Netlify con la API en Hono y PostgreSQL y Storage de Supabase, sin cambiar su comportamiento funcional.

**Architecture:** Primero se sustituye Fastify por Hono sobre la base actual, con las pruebas existentes como red de seguridad. Después se cambia la plataforma: `buildApp` recibe por opciones todo lo que depende del entorno y una Netlify Function envuelve la misma aplicación; en local y en pruebas se usa PostgreSQL local y un almacén en disco.

**Tech Stack:** Hono 4 (`hono`, `@hono/node-server`), Prisma 6 (postgresql), `@supabase/supabase-js` (solo servidor), Netlify Functions y funciones programadas, Vitest, Docker Compose (PostgreSQL 16).

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-netlify-supabase-design.md`

## Global Constraints

- Trabajar en la rama `migracion-netlify-supabase`.
- Mensajes de error y textos de interfaz en español, con el formato `{ error: { code, message, fields?, details? } }` de `server/src/errors.ts`.
- En las Tasks 1 a 4 no se cambian direcciones, códigos de estado, cuerpos de respuesta ni aserciones de pruebas: solo el ayudante `server/tests/helpers/testApp.ts` y lo que cada tarea indique.
- Nada de estado en memoria entre peticiones.
- La clave de servicio de Supabase no aparece en `client/` ni en ninguna respuesta de la API.
- Límite de anexo: `MAX_FILE_BYTES` (25 MB) de `shared/src/fileTypes.ts`; no se duplica el número.
- Limitador: 5 fallos, ventana y bloqueo de 15 minutos.
- Tarea diaria: `0 10 * * *`.
- `npm run dev` y `npm test` funcionan sin acceso a Supabase ni a Netlify.
- Tasks 1 a 3 terminan con las pruebas que cada una indica en verde; desde la Task 4, con `npm test` completo en verde. Cada tarea termina con un commit.
- Tasks 1 a 4 se ejecutan con la base SQLite actual y no necesitan Docker. Docker hace falta desde la Task 5.

## Review Focus

1. Id de proyecto con caracteres codificados (`%61…`) en una escritura sobre un proyecto cerrado: responde 409, no pasa el guardia (Task 4; la prueba ya existe en `closedGuard.test.ts`).
2. Cuerpo JSON mal formado o vacío en un POST: 400 con el formato de error común, nunca 500 (Task 1).
3. Confirmar un anexo que nunca se subió: 409 y el anexo sigue pendiente; archivo real mayor que el límite: 413 y se borra (Task 8).
4. Petición a las 20:00 de Lima (01:00 UTC del día siguiente): una tarea que vence hoy no aparece vencida (Task 6).
5. `POST /api/setup` sin código cuando `SETUP_TOKEN` está definido: 403 y no se crea usuario (Task 10).

---

## Parte A. De Fastify a Hono

Tabla de conversión para todas las rutas (Tasks 1 a 4):

| Fastify | Hono |
|---|---|
| `export async function xRoutes(app: FastifyInstance)` | `export function xRoutes(app: App)` |
| `const { prisma } = app` | dentro de cada manejador: `const { prisma } = c.var.deps` |
| `app.now()`, `app.dataDir` | `c.var.deps.now()`, `c.var.deps.dataDir` |
| `req.params.id` | `c.req.param('id')` |
| `req.body` | `await readBody(c)` |
| `req.query` | `c.req.query()` |
| `req.user`, `req.sessionToken` | `c.var.user`, `c.var.sessionToken` |
| `req.ip` | `c.var.deps.clientIp(c)` |
| `return valor` | `return c.json(valor)` |
| `reply.status(201).send(valor)` | `return c.json(valor, 201)` |
| `reply.setCookie` / `clearCookie` | `setCookie` / `deleteCookie` de `hono/cookie` |
| `requireUser(req)`, `getProjectAccess(req, id)` | `requireUser(c)`, `getProjectAccess(c, id)` |
| `req.server.prisma` | `c.var.deps.prisma` |

### Task 1: Núcleo en Hono, autenticación y usuarios

**Files:**
- Create: `server/src/http.ts`
- Modify: `server/package.json` (añade `hono` y `@hono/node-server`), `server/src/app.ts`, `server/src/errors.ts`, `server/src/auth/guards.ts`, `server/src/auth/access.ts`, `server/src/routes/auth.ts`, `server/src/routes/users.ts`, `server/tests/helpers/testApp.ts`
- Test: `server/tests/http.test.ts` (nueva), `auth.test.ts`, `users.test.ts`, `usersOverview.test.ts`, `resetPassword.test.ts` (existentes, sin cambios)

**Interfaces:**
- Produces, en `http.ts`:

```ts
export type Deps = { prisma: PrismaClient; dataDir: string; now(): Date; clientIp(c: Ctx): string };
export type AppEnv = { Variables: { deps: Deps; user: User | null; sessionToken: string | null } };
export type App = Hono<AppEnv>;
export type Ctx = Context<AppEnv>;
/** Cuerpo JSON de la petición; `undefined` si no hay cuerpo; AppError 400 `bad_request` si no es JSON válido. */
export function readBody(c: Ctx): Promise<unknown>;
/** Rutas registradas, sin middlewares. */
export function listRoutes(app: App): { method: string; url: string }[];
```

- Produces: `buildApp(opts: { prisma: PrismaClient; dataDir: string; now?: () => Date; clientIp?: (c: Ctx) => string }): App`. `clientIp` por defecto devuelve `'127.0.0.1'`. Ya no recibe `clientDist` ni `logger`.
- Produces: `errorHandler(error: Error, c: Ctx): Response` registrado con `app.onError`; `app.notFound` responde 404 `not_found` "No encontrado".
- Produces: `registerAuthHook(app: App)` como middleware de `/api/*` con la misma regla de cambio obligatorio de contraseña; `requireUser(c: Ctx): User`; `requirePm(c: Ctx): User`; `getProjectAccess(c: Ctx, projectId: string)`; `requireProjectPm(c: Ctx, projectId: string)`.
- Produces, en `testApp.ts`: `httpClient` llama `app.request(url, init)` y devuelve un objeto con las mismas propiedades que las pruebas ya leen de la respuesta de `inject`. `ctx.app` es la aplicación Hono; `close()` ya no llama `app.close()`.

- [x] **Step 1:** `npm install hono @hono/node-server -w server`.
- [x] **Step 2:** Listar qué propiedades de la respuesta usan las pruebas: `grep -rhoE "res[A-Za-z]*\.(statusCode|json\(\)|headers|body|payload|cookies)" server/tests | sed 's/.*\.//' | sort | uniq -c`. El adaptador de `testApp.ts` implementa exactamente esas (como mínimo `statusCode`, `json()`, `headers` y `body`).
- [x] **Step 3:** Escribir `server/tests/http.test.ts`:

```ts
it('responde 400 con el formato común si el JSON no es válido', async () => {
  const res = await ctx.app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{mal' });
  expect(res.status).toBe(400);
  expect((await res.json()).error.code).toBe('bad_request');
});
it('responde 400 de validación si falta el cuerpo', async () => {
  const res = await ctx.anon.post('/api/auth/login');
  expect(res.statusCode).toBe(400);
  expect(res.json().error.code).toBe('validation_error');
});
it('responde 404 con el formato común en una ruta de API inexistente', async () => {
  const res = await ctx.anon.get('/api/no-existe');
  expect(res.statusCode).toBe(404);
  expect(res.json().error.code).toBe('not_found');
});
```

- [x] **Step 4:** Implementar `http.ts`, `errors.ts`, `guards.ts`, `access.ts` y `app.ts`. El primer middleware de `app.ts` fija `deps`, `user = null` y `sessionToken = null`. En `app.ts` se registran solo `authRoutes` y `userRoutes`; las demás rutas quedan sin registrar hasta las Tasks 2 a 4.
- [x] **Step 5:** Convertir `routes/auth.ts` y `routes/users.ts` con la tabla.
- [x] **Step 6:** En `server/`: `npx vitest run tests/http.test.ts tests/auth.test.ts tests/users.test.ts tests/usersOverview.test.ts tests/resetPassword.test.ts tests/domain`. Esperado: todas pasan.
- [x] **Step 7:** Commit `refactor: núcleo de la API en Hono con autenticación y usuarios`.

### Task 2: Rutas de proyecto en Hono

**Files:**
- Modify: `server/src/app.ts`, `server/src/routes/projects.ts`, `projectCrud.ts`, `registers.ts`, `members.ts`, `charter.ts`, `raci.ts`, `indicators.ts`, `dashboard.ts`, `calendar.ts` (`projectStats.ts` y `evmLoader.ts` no tocan HTTP y no cambian)

**Interfaces:**
- Consumes: `App`, `Ctx`, `readBody`, guardas y accesos de Task 1.
- Produces: `registerProjectCrud(app: App, options: ProjectCrudOptions)` con las mismas opciones.

- [x] **Step 1:** Convertir los archivos con la tabla y registrarlos en `app.ts`.
- [x] **Step 2:** En `server/`: `npx vitest run tests/projects.test.ts tests/projectsList.test.ts tests/registers.test.ts tests/charter.test.ts tests/raci.test.ts tests/indicators.test.ts tests/dashboard.test.ts tests/calendar.test.ts tests/richText.test.ts tests/reviewFixes.test.ts`. Las pruebas de estos archivos que dependan de rutas aún no convertidas (tareas, anexos) pueden fallar; anotar cuáles y confirmar que pasan al terminar la Task 3.
- [x] **Step 3:** Commit `refactor: rutas de proyecto en Hono`.

### Task 3: Rutas de tareas y anexos en Hono

**Files:**
- Modify: `server/src/app.ts`, `server/src/routes/tasks.ts`, `taskSteps.ts`, `dependencies.ts`, `attachments.ts`, `server/src/files.ts`

**Interfaces:**
- Produces: `getTaskAccess(c: Ctx, taskId: string)` con el mismo resultado.
- Produces: `saveUpload(dataDir: string, file: File): Promise<{ storedName: string; size: number }>` (recibe el `File` de `c.req.parseBody()`).

- [x] **Step 1:** Convertir con la tabla. En `attachments.ts`: el archivo llega con `const { file } = await c.req.parseBody()`; si no es un `File`, 400 `file_required`; si `file.size > MAX_FILE_BYTES`, 413 `file_too_large`; las dos rutas de subida llevan `bodyLimit` de `hono/body-limit` con `MAX_FILE_BYTES + 1 MB` y el mismo error 413. La descarga devuelve `new Response(Readable.toWeb(createReadStream(path)))` con las mismas cabeceras.
- [x] **Step 2:** En `server/`: `npx vitest run tests/tasks.test.ts tests/taskSteps.test.ts tests/taskDates.test.ts tests/dependencies.test.ts tests/assignmentRule.test.ts tests/plannedCost.test.ts tests/attachments.test.ts` y las pruebas anotadas en la Task 2. Esperado: todas pasan.
- [x] **Step 3:** Commit `refactor: rutas de tareas y anexos en Hono`.

### Task 4: Rutas de control, guardia de solo lectura y retiro de Fastify

**Files:**
- Modify: `server/src/app.ts`, `server/src/closedGuard.ts`, `server/src/routes/changeRequests.ts`, `performance.ts`, `incidents.ts`, `decisions.ts`, `deliverables.ts`, `deliverableReviews.ts`, `closure.ts`, `lessons.ts`, `server/src/index.ts`, `server/tsup.config.ts`, `server/package.json`, `server/tests/app.test.ts`, `server/tests/closedGuard.test.ts` (solo donde lee `app.routeList`)
- Create: `server/src/static.ts`

**Interfaces:**
- Produces: `registerClosedGuard(app: App)`: middleware de `/api/*` para POST, PATCH, PUT y DELETE. El patrón de la ruta final se obtiene de las rutas coincidentes de Hono (`matchedRoutes`, tomando la última que no sea middleware) y decide las excepciones (`isException` no cambia). El id sale del tercer segmento de la ruta de la petición, decodificado con `decodeURIComponent`, nunca de la URL cruda. La prueba de cobertura usa `listRoutes(app)`.
- Produces: `withStatic(app: App, clientDist: string): App` en `static.ts`: sirve archivos con `serveStatic` de `@hono/node-server/serve-static` y entrega `index.html` en cualquier GET que no empiece por `/api`.
- Produces: `server/src/index.ts` arranca con `serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })` de `@hono/node-server` y `clientIp` tomado de `getConnInfo` de `@hono/node-server/conninfo`.

- [x] **Step 1:** Convertir las rutas con la tabla y registrarlas. Antes de escribir el guardia, leer en `node_modules/hono` cómo expone las rutas coincidentes la versión instalada.
- [x] **Step 2:** Adaptar `app.test.ts` para construir `withStatic(await buildApp(...), fixtureDist)`; sus aserciones no cambian.
- [x] **Step 3:** Quitar de `server/package.json`: `fastify`, `@fastify/cookie`, `@fastify/multipart`, `@fastify/static`. `grep -rn "fastify" server/src server/tests client/src shared/src` no devuelve nada.
- [x] **Step 4:** `npm test` y `npm run build && npm run test:e2e`. Esperado: todo en verde.
- [x] **Step 5:** Commit `refactor: API completa en Hono; se retira Fastify`.

---

## Parte B. De la red local a Netlify y Supabase

### Task 5: PostgreSQL en esquema, migración inicial y pruebas

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Modify: `server/prisma/schema.prisma`, `server/src/config.ts`, `server/tests/helpers/globalSetup.ts`, `server/tests/helpers/testApp.ts`, `server/tests/config.test.ts`
- Delete: `server/prisma/migrations/*` (las nueve carpetas y `migration_lock.toml`)
- Create: `server/prisma/migrations/<fecha>_init/migration.sql` (generada), `server/tests/rls.test.ts`

**Interfaces:**
- Produces: `resolveDatabaseUrl(env: NodeJS.ProcessEnv): string` en `server/src/config.ts` (lanza `Error('Falta DATABASE_URL')` si no existe). Se eliminan `databaseUrl` y `resolveDataDir`.
- Produces: `createTestApp()` conserva su forma actual; `ctx.dataDir` sigue existiendo como carpeta temporal para archivos.

- [x] **Step 1:** `docker-compose.yml` con un servicio `db` (`postgres:16`, usuario y clave `pm`, puerto `5433:5432`). `.env.example` con todas las variables de la sección 8 de la especificación y `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres`.
- [x] **Step 2:** En `schema.prisma`: `provider = "postgresql"`, `directUrl = env("DIRECT_URL")`, y en el generador `binaryTargets = ["native", "rhel-openssl-3.0.x"]`.
- [x] **Step 3:** Escribir `server/tests/rls.test.ts`:

```ts
it('todas las tablas públicas tienen RLS activado', async () => {
  const rows = await ctx.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false`;
  expect(rows).toEqual([]);
});
```

- [x] **Step 4:** Borrar las migraciones de SQLite. Con Docker en marcha: `npx prisma migrate dev --name init` en `server/` con `DATABASE_URL` y `DIRECT_URL` apuntando a una base local `pm_dev`. Añadir al final del `migration.sql` generado un bloque `DO $$ … $$` que ejecute `ALTER TABLE … ENABLE ROW LEVEL SECURITY` para cada tabla de `public`.
- [x] **Step 5:** `globalSetup.ts`: crea la base `pm_template_<pid>` en `TEST_DATABASE_URL`, aplica `prisma migrate deploy` sobre ella, activa RLS también en `_prisma_migrations`, y la publica como `templateDb` (nombre de la base). Al terminar, la borra. `testApp.ts`: `CREATE DATABASE pm_test_<aleatorio> TEMPLATE <templateDb>`, conecta Prisma a esa base y en `close()` desconecta y la borra con `DROP DATABASE … WITH (FORCE)`.
- [x] **Step 6:** `config.ts`: implementar `resolveDatabaseUrl`; actualizar `config.test.ts` (caso con variable, caso sin variable que lanza).
- [x] **Step 7:** `npm test -w server`. Corregir las pruebas que dependan de SQLite (orden por texto con acentos y mayúsculas, mensajes de restricción). Esperado: todo en verde, incluida `rls.test.ts`.
- [x] **Step 8:** Commit `feat: PostgreSQL como base de datos y RLS en todas las tablas`.

### Task 6: "Hoy" con zona horaria configurable

**Files:**
- Modify: `shared/src/dates.ts`, `shared/tests/dates.test.ts`, `server/src/app.ts`, `server/src/http.ts`, todas las rutas de `server/src/routes/` que llaman `localToday`
- Test: `server/tests/timezone.test.ts`

**Interfaces:**
- Produces: `localToday(now: Date, timeZone?: string): string`. Con `timeZone` usa `Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`; sin él, el comportamiento actual.
- Produces: `timeZone?: string` en las opciones de `buildApp` y `Deps.today(): string`, igual a `localToday(deps.now(), timeZone)`.

- [x] **Step 1:** Prueba en `shared/tests/dates.test.ts`:

```ts
it('calcula la fecha en la zona indicada', () => {
  const instant = new Date('2026-11-07T01:00:00Z');
  expect(localToday(instant, 'America/Lima')).toBe('2026-11-06');
  expect(localToday(instant, 'UTC')).toBe('2026-11-07');
});
```

- [x] **Step 2:** Prueba en `server/tests/timezone.test.ts`: aplicación creada con `timeZone: 'America/Lima'` y reloj en `2026-11-07T01:00:00Z`; una tarea con `dueDate: '2026-11-06'` y estado `TODO` da `overdueTasks === 0` en `GET /api/projects/:id/indicators`. `createTestApp` acepta `{ timeZone }` y lo pasa a `buildApp`.
- [x] **Step 3:** Ejecutar ambas y verlas fallar.
- [x] **Step 4:** Implementar `localToday` con el segundo parámetro, `deps.today`, y sustituir en el servidor cada `localToday(c.var.deps.now())` por `c.var.deps.today()` (los ayudantes locales `const today = () => …` de `closure.ts` e `incidents.ts` pasan a devolver `c.var.deps.today()`).
- [x] **Step 5:** `npm test`. Esperado: verde.
- [x] **Step 6:** Commit `feat: fecha del servidor según APP_TIMEZONE`.

### Task 7: Limitador de intentos en la base de datos

**Files:**
- Modify: `server/prisma/schema.prisma`, `server/src/auth/loginLimiter.ts`, `server/src/routes/auth.ts`, `server/tests/auth.test.ts`
- Create: migración `add_login_attempts`

**Interfaces:**
- Produces: modelo `LoginAttempt { key String @id, failures Int, windowStart DateTime, blockedUntil DateTime? }`.
- Produces: `class LoginLimiter { constructor(prisma: PrismaClient); retryAfterSeconds(key: string, now: Date): Promise<number>; recordFailure(key: string, now: Date): Promise<void>; reset(key: string): Promise<void>; purge(now: Date): Promise<number> }`.

- [x] **Step 1:** Pruebas nuevas en `auth.test.ts`:
  - `los fallos de hace más de 15 minutos no cuentan`: 4 fallos, avanzar el reloj 16 minutos, 1 fallo más, el siguiente intento con la clave correcta responde 200.
  - `fallos simultáneos no se pierden`: 5 inicios de sesión fallidos lanzados con `Promise.all`; el sexto responde 429.
- [x] **Step 2:** Verlas fallar.
- [x] **Step 3:** Implementar. `recordFailure` hace todo en una sola sentencia `INSERT … ON CONFLICT (key) DO UPDATE` con `$executeRaw`: si `windowStart` tiene más de 15 minutos reinicia a 1 fallo y nueva ventana; si no, incrementa; fija `blockedUntil = now + 15 min` cuando el resultado llega a 5. `purge` borra filas con ventana vencida y sin bloqueo vigente.
- [x] **Step 4:** `routes/auth.ts`: `new LoginLimiter(prisma)` y `await` en las tres llamadas.
- [x] **Step 5:** `npm test -w server`. Verde, incluidas las pruebas de bloqueo que ya existían.
- [x] **Step 6:** Commit `feat: intentos de inicio de sesión en la base de datos`.

### Task 8: Almacén de archivos y subida en tres pasos

**Files:**
- Create: `server/src/storage/fileStore.ts`, `server/src/storage/diskFileStore.ts`, `server/src/routes/localUploads.ts`
- Modify: `server/src/files.ts` (quedan solo `normalizeUploadName` y `contentDisposition`), `server/src/app.ts`, `server/src/routes/attachments.ts`, `server/src/routes/projects.ts`, `server/src/routes/tasks.ts`, `server/src/routes/deliverableReviews.ts`, `server/src/closedGuard.ts`, `server/prisma/schema.prisma`, `shared/src/schemas.ts`, `client/src/components/attachments/AttachmentList.tsx`, `server/tests/helpers/testApp.ts`, `server/tests/attachments.test.ts`, `client/tests/` (prueba del componente de anexos)
- Create: migración `add_attachment_uploaded_at`

**Interfaces:**
- Produces, en `fileStore.ts`:

```ts
export type UploadTarget = { url: string; method: 'PUT'; headers: Record<string, string> };
export type DownloadTarget = { redirect: string } | { stream: Readable };
export interface FileStore {
  createUpload(storedName: string, mimeType: string): Promise<UploadTarget>;
  stat(storedName: string): Promise<{ size: number } | null>;
  download(storedName: string, filename: string): Promise<DownloadTarget>;
  remove(storedNames: string[]): Promise<void>;
}
```

- Produces: `files: FileStore` en las opciones de `buildApp` y `Deps.files` (sustituyen a `dataDir`).
- Produces: `class DiskFileStore implements FileStore { constructor(dir: string) }`. Su `createUpload` devuelve `{ url: '/api/local-uploads/<storedName>', method: 'PUT', headers: { 'content-type': mimeType } }`; su `download` devuelve `{ stream }`.
- Produces: `Attachment.uploadedAt DateTime?` (nulo = pendiente) y `Attachment.size` pasa a guardar el tamaño real al confirmar.
- Produces: `uploadRequestSchema = z.object({ filename: required(), mimeType: z.string(), size: z.number().int().positive().max(MAX_FILE_BYTES, 'El archivo supera el límite de 25 MB') })`.
- Produces, rutas:
  - `POST /api/projects/:id/attachments` y `POST /api/tasks/:id/attachments` (mismos permisos que hoy), cuerpo JSON `uploadRequestSchema` → 201 `{ attachment, upload: UploadTarget }`. Tipo no permitido → 415 `file_type_not_allowed`.
  - `POST /api/attachments/:id/complete` (solo quien lo subió) → 200 con el anexo. Sin archivo → 409 `upload_missing`. Tamaño real mayor que `MAX_FILE_BYTES` → borra archivo y registro, 413 `file_too_large`.
  - `PUT /api/local-uploads/:storedName` (solo con `DiskFileStore`; exige sesión y que el anexo pendiente sea del usuario; cuerpo binario, límite `MAX_FILE_BYTES`).
  - `GET /api/attachments/:id/download`: 302 si el almacén devuelve `redirect`; si devuelve `stream`, la respuesta actual.
- Produces, en `testApp.ts`: `ctx.files: DiskFileStore` (el almacén de la aplicación de prueba, sobre `ctx.dataDir`) y `uploadFile(client: HttpClient, base: string, file: { name: string; type: string; content: Buffer }): Promise<{ id: string }>` que hace los tres pasos.

- [x] **Step 1:** Reescribir `server/tests/attachments.test.ts` sobre el flujo nuevo conservando cada caso existente (permisos por rol, tipo no permitido, acceso sin sesión, borrado) y añadir:

```ts
it('no confirma un anexo que nunca se subió', async () => {
  const res = await pm.post(`/api/projects/${project.id}/attachments`, { filename: 'a.pdf', mimeType: 'application/pdf', size: 10 });
  const done = await pm.post(`/api/attachments/${res.json().attachment.id}/complete`);
  expect(done.statusCode).toBe(409);
  expect((await pm.get(`/api/projects/${project.id}/attachments`)).json()).toEqual([]);
});

it('rechaza y borra un archivo mayor al límite aunque se declarara pequeño', async () => {
  const res = await pm.post(`/api/projects/${project.id}/attachments`, { filename: 'a.pdf', mimeType: 'application/pdf', size: 10 });
  const { attachment } = res.json();
  const { storedName } = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });
  await ctx.files.put(storedName, Buffer.alloc(MAX_FILE_BYTES + 1));
  const done = await pm.post(`/api/attachments/${attachment.id}/complete`);
  expect(done.statusCode).toBe(413);
  expect(await ctx.prisma.attachment.count()).toBe(0);
});
```

  Y: `un anexo pendiente no se puede usar como evidencia de un entregable` (400 en `attachmentId`), `solo quien lo subió puede confirmarlo` (403), `no se puede confirmar en un proyecto cerrado` (409 `project_closed`).
- [x] **Step 2:** Verlas fallar.
- [x] **Step 3:** Implementar `FileStore`, `DiskFileStore` (con un método propio `put(storedName: string, data: Buffer | Readable): Promise<void>` que usan la ruta local y las pruebas; la API nunca expone `storedName`) y la migración.
- [x] **Step 4:** Reescribir `routes/attachments.ts`; quitar la lectura con `parseBody` y su `bodyLimit`; listas y selección de evidencia filtran `uploadedAt: { not: null }`; `projects.ts` y `tasks.ts` llaman `c.var.deps.files.remove`. Comprobar que el guardia de solo lectura cubre `/api/attachments/:id/complete` y añadir esa ruta a su prueba de cobertura.
- [x] **Step 5:** `AttachmentList.tsx`: `mutationFn` hace `POST` con `{ filename, mimeType, size }`, luego `fetch(upload.url, { method: upload.method, headers: upload.headers, body: file })` y, si responde bien, `POST …/complete`. Un fallo en la subida muestra "No se pudo subir el archivo. Inténtalo de nuevo.". Actualizar la prueba del componente.
- [x] **Step 6:** `npm test`. Verde.
- [x] **Step 7:** Commit `feat: anexos con subida directa y almacén intercambiable`.

### Task 9: Almacén en Supabase Storage

**Files:**
- Create: `server/src/storage/supabaseFileStore.ts`, `server/tests/storage/supabaseFileStore.test.ts`
- Modify: `server/package.json` (añade `@supabase/supabase-js`)

**Interfaces:**
- Consumes: `FileStore` de Task 8.
- Produces: `class SupabaseFileStore implements FileStore { constructor(opts: { url: string; serviceRoleKey: string; bucket: string }) }`.

- [x] **Step 1:** Prueba con el cliente de Supabase simulado (`vi.mock('@supabase/supabase-js')`): `createUpload` llama `createSignedUploadUrl(storedName)` y devuelve su `signedUrl` con método `PUT` y `content-type`; `download` llama `createSignedUrl(storedName, 60, { download: filename })` y devuelve `{ redirect }`; `stat` devuelve `null` cuando el objeto no existe; `remove([])` no llama a la API.
- [x] **Step 2:** Verla fallar e implementar. Antes de fijar el método y los encabezados de subida, leer en `node_modules/@supabase/storage-js` cómo `uploadToSignedUrl` envía el archivo y replicar exactamente eso en `UploadTarget`.
- [x] **Step 3:** `npm test -w server`. Verde.
- [x] **Step 4:** Commit `feat: almacén de anexos en Supabase Storage`.

### Task 10: Seguridad para internet

**Files:**
- Modify: `server/src/app.ts`, `server/src/http.ts`, `server/src/routes/auth.ts`, `shared/src/schemas.ts`, `client/src/pages/AuthPages.tsx`, `server/tests/auth.test.ts`, `client/tests/auth.test.tsx`

**Interfaces:**
- Produces: opciones de `buildApp` `secureCookies?: boolean` y `setupToken?: string`, disponibles en `Deps`.
- Produces: `GET /api/setup/status` → `{ needsSetup: boolean, requiresToken: boolean }`; `setupSchema` añade `token: z.string().optional()`.

- [x] **Step 1:** Pruebas en `auth.test.ts`:
  - con `setupToken: 'abc'`: `POST /api/setup` sin `token` o con otro valor → 403 `setup_token_invalid` y `user.count() === 0`; con `token: 'abc'` → 201.
  - con `secureCookies: true`: la cookie de inicio de sesión contiene `Secure`.
  - cualquier respuesta de `/api/*` trae `x-content-type-options: nosniff` y `x-frame-options`.
- [x] **Step 2:** Verlas fallar e implementar: comparación del código con `timingSafeEqual`; `secureHeaders()` de `hono/secure-headers` en `/api/*`; `secure: deps.secureCookies` al fijar la cookie.
- [x] **Step 3:** `SetupPage` muestra el campo "Código de configuración" cuando `requiresToken` es verdadero; prueba del componente.
- [x] **Step 4:** `npm test`. Verde.
- [x] **Step 5:** Commit `feat: cookie segura, cabeceras y código de configuración inicial`.

### Task 11: Tarea diaria

**Files:**
- Create: `server/src/jobs/daily.ts`, `server/tests/daily.test.ts`
- Modify: `server/src/routes/performance.ts`

**Interfaces:**
- Consumes: `LoginLimiter.purge` (Task 7), `Deps.files.remove` (Task 8), `Deps.today()` (Task 6).
- Produces: `runDailyJobs(deps: Deps): Promise<{ sessions: number; loginAttempts: number; pendingUploads: number; snapshots: number }>`.
- Produces: `saveEvmSnapshot(prisma: PrismaClient, projectId: string, today: string): Promise<boolean>` exportada desde `performance.ts`, usada por el GET actual y por la tarea diaria.

- [x] **Step 1:** Pruebas en `daily.test.ts`, llamando `runDailyJobs` con las dependencias de la aplicación de prueba: borra una sesión vencida y conserva una vigente; borra un anexo pendiente de 25 horas (registro y archivo) y conserva uno de 1 hora; crea un `EvmSnapshot` para un proyecto activo con línea base y ninguno para uno cerrado; devuelve los cuatro contadores. `createTestApp` expone `ctx.deps`.
- [x] **Step 2:** Verlas fallar e implementar.
- [x] **Step 3:** `npm test -w server`. Verde.
- [x] **Step 4:** Commit `feat: tarea diaria de limpieza y foto de valor ganado`.

### Task 12: Funciones y configuración de Netlify

**Files:**
- Create: `server/src/production.ts`, `server/tests/production.test.ts`, `netlify/functions/api.mts`, `netlify/functions/daily.mts`, `netlify.toml`
- Modify: `server/package.json` (script `migrate`), `package.json` raíz (`engines`, dependencia de desarrollo `@netlify/functions`), `server/scripts/migrate.mjs`

**Interfaces:**
- Consumes: todas las opciones de `buildApp` de las tareas anteriores, `SupabaseFileStore` (Task 9), `runDailyJobs` (Task 11).
- Produces, en `production.ts`: `createProductionDeps(env: NodeJS.ProcessEnv): Deps` y `createProductionApp(env: NodeJS.ProcessEnv): App`. Usan `SupabaseFileStore`, `timeZone: env.APP_TIMEZONE`, `secureCookies: true`, `setupToken: env.SETUP_TOKEN` y `clientIp` con `getConnInfo` de `hono/netlify`. Si falta una variable obligatoria de la sección 8 de la especificación, lanzan `Error('Falta la variable <NOMBRE>')`. Una sola instancia de `PrismaClient` por módulo.
- Produces: `netlify/functions/api.mts`:

```ts
import { handle } from 'hono/netlify';
import { createProductionApp } from '../../server/src/production';

export default handle(createProductionApp(process.env));
export const config = { path: '/api/*' };
```

- Produces: `netlify/functions/daily.mts`:

```ts
import type { Config } from '@netlify/functions';
import { createProductionDeps } from '../../server/src/production';
import { runDailyJobs } from '../../server/src/jobs/daily';

export default async () => {
  console.log(JSON.stringify(await runDailyJobs(createProductionDeps(process.env))));
};
export const config: Config = { schedule: '0 10 * * *' };
```

- [x] **Step 1:** Prueba en `production.test.ts`: `createProductionApp({})` lanza un error cuyo mensaje contiene `DATABASE_URL`; con todas las variables presentes y sin `SETUP_TOKEN`, el mensaje contiene `SETUP_TOKEN`.
- [x] **Step 2:** Verla fallar e implementar `production.ts` y las dos funciones.
- [x] **Step 3:** `netlify.toml`:

```toml
[build]
  command = "npm run build -w client && npm run migrate -w server"
  publish = "client/dist"

[build.environment]
  NODE_VERSION = "24"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
  external_node_modules = ["@prisma/client", "@node-rs/argon2"]
  included_files = ["node_modules/.prisma/client/**"]

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "same-origin"
    Content-Security-Policy = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'"
```

- [x] **Step 4:** Script `"migrate": "node scripts/migrate.mjs"` en `server/package.json`; `migrate.mjs` solo ejecuta `prisma migrate deploy`. `"engines": { "node": ">=24" }` en la raíz.
- [x] **Step 5:** `npm test` en verde. Con la CLI de Netlify instalada, `npx netlify build` termina sin errores con un `.env` local que apunte a la base de Docker.
- [x] **Step 6:** Commit `feat: funciones y configuración para Netlify`.

### Task 13: Scripts, prueba de extremo a extremo y documentación

**Files:**
- Modify: `server/scripts/reset-password.ts`, `e2e/serve.mjs`, `README.md`, `.gitignore`
- Create: `.gitattributes`

- [x] **Step 1:** `reset-password.ts` usa `DATABASE_URL` del entorno (cargado de `.env`) y lo indica si falta.
- [x] **Step 2:** `e2e/serve.mjs`: crea la base `pm_e2e` desde cero en `TEST_DATABASE_URL`, fija `DATABASE_URL` y `DIRECT_URL` a ella y arranca `start.mjs`. `start.mjs` y `migrate.mjs` dejan de crear la carpeta de datos y de fijar `DATABASE_URL`.
- [x] **Step 3:** `.gitattributes` con `* text=auto` y renormalizar (`git add --renormalize .`). `.gitignore` añade `.env` y `.netlify`.
- [x] **Step 4:** Reescribir en el README: requisitos (Node 24, Docker), desarrollo local, variables de entorno, despliegue en Netlify, creación del proyecto y bucket en Supabase, primer ingreso con código, restablecer contraseña, respaldos. Eliminar firewall de Windows, red local y "Sin cifrado".
- [x] **Step 5:** `npm run build && npm run test:e2e`. Verde.
- [x] **Step 6:** Commit `docs: operación en Netlify y Supabase; chore: normalizar finales de línea`.

### Task 14: Primer despliegue y verificación

Lo ejecuta el responsable con sus cuentas; Claude Code puede guiar cada paso, pero no crea las cuentas ni conoce los secretos.

- [x] **Step 1:** En Supabase: crear el proyecto, crear el bucket privado `anexos` con límite de 25 MB por archivo y copiar las cadenas de conexión (pooler en modo transacción para `DATABASE_URL`, con `?pgbouncer=true&connection_limit=1`; pooler en modo sesión para `DIRECT_URL`).
- [x] **Step 2:** En Netlify: crear el sitio desde el repositorio y cargar las variables de la sección 8 de la especificación. Generar `SETUP_TOKEN` con `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
- [x] **Step 3:** Desplegar una vista previa y comprobar:
  - `GET /api/setup/status` responde `{"needsSetup":true,"requiresToken":true}`. Si responde un error del motor de Prisma, ajustar `included_files` y `external_node_modules` de `netlify.toml` según el mensaje y volver a desplegar.
  - Recargar una dirección interna de la interfaz (por ejemplo `/proyectos`) muestra la aplicación y `/api/no-existe` responde el JSON de error 404, no `index.html`.
  - La configuración inicial falla sin el código y funciona con él.
  - Crear un proyecto y una tarea; subir un PDF de unos 20 MB y descargarlo.
  - En el panel de Supabase, `select tablename from pg_tables where schemaname='public' and rowsecurity=false` no devuelve filas.
  - La función `daily` aparece como programada en el panel de Netlify; ejecutarla desde ahí y ver en su registro los cuatro contadores.
  - Después de las 19:00 de Lima, una tarea que vence hoy no aparece vencida.
- [x] **Step 4:** Publicar en producción.
