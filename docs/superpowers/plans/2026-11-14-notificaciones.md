# Notificaciones (F2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Avisos dentro de la aplicación (tarea asignada, comentario en mi tarea, tarea por vencer o vencida, incidente asignado) con una campana en la barra lateral.

**Architecture:** Una función `notify()` del servidor crea filas `Notification` y nunca lanza. Las rutas de tareas e incidentes la llaman después de escribir, y la tarea diaria la llama para los vencimientos. Cuatro rutas `/api/notifications` sirven y marcan los avisos del usuario. El cliente arma las frases y muestra la campana en `AppLayout`.

**Tech Stack:** Hono, Prisma 6 y PostgreSQL, React 19, TanStack Query, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-14-notificaciones-design.md`

## Global Constraints

- Mensajes y textos en español. Errores con `AppError` en la forma `{ error: { code, message } }`.
- Nunca se avisa al actor, ni a usuarios con `active: false`.
- Un aviso solo lleva `title` (etiqueta del elemento), el nombre del proyecto y `actorName` (solo en comentarios). Nunca el cuerpo del comentario.
- `notify` no lanza: si falla, `console.error` y la ruta responde igual.
- Vencimientos: `dueDate === addDays(today, 1)` → `TASK_DUE_SOON`; `dueDate === addDays(today, -1)` → `TASK_OVERDUE`; la tarea no es `DONE` y el proyecto no está en `CLOSED_PROJECT_STATUS`. `dedupeKey = "<kind>:<taskId>:<dueDate>"`.
- Borrado de avisos con `createdAt` de más de 90 días en la tarea diaria.
- La lista y la cuenta solo incluyen avisos de proyectos a los que el usuario tiene acceso hoy: PM, o miembro del proyecto.
- Migración nueva (no editar las aplicadas) con `ENABLE ROW LEVEL SECURITY`.
- Pruebas del servidor: `cd server && TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`.

## Review Focus

1. Reasignar la tarea a las mismas personas (o quitar a una) no debe avisar a nadie: solo a los responsables *nuevos*. → prueba en Task 2.
2. Un colaborador que comenta en su tarea compartida avisa al otro responsable, pero no a sí mismo. Si comenta el PM sin estar asignado, avisa a todos los responsables. → Task 2.
3. Si la tarea diaria corre dos veces el mismo día, no debe duplicar avisos. Si se mueve la fecha de fin, sí debe volver a avisar. → Task 4.
4. Un usuario quitado del proyecto no debe ver avisos de ese proyecto en la lista ni en la cuenta. → Task 5.
5. Una página de avisos con cursor no debe repetir ni saltarse filas cuando dos avisos tienen el mismo `createdAt` (orden `createdAt desc, id desc`). → Task 5.

---

### Task 1: Modelo, enumeración y `notify()`

**Files:**
- Modify: `shared/src/enums.ts` (añadir `NOTIFICATION_KIND`)
- Modify: `server/prisma/schema.prisma` (modelo `Notification` según la especificación; relaciones `notifications Notification[]` en `User` y `Project`)
- Create: `server/prisma/migrations/20261114130000_add_notifications/migration.sql`
- Create: `server/src/notifications.ts`
- Test: `server/tests/notify.test.ts`

**Interfaces:**
- Produces: `NOTIFICATION_KIND = ['TASK_ASSIGNED','TASK_COMMENTED','TASK_DUE_SOON','TASK_OVERDUE','INCIDENT_ASSIGNED'] as const` y el tipo `NotificationKind`, exportados por `@pm/shared`.
- Produces: `notify(prisma: PrismaClient, input: { kind: NotificationKind; projectId: string; entityId: string; title: string; userIds: string[]; actorId?: string; actorName?: string; dedupeKey?: string }): Promise<number>`. Devuelve cuántas filas creó y 0 si falla.

- [x] **Step 1: Escribe las pruebas** en `notify.test.ts`:
  - `crea un aviso por destinatario`: dos usuarios activos → 2 filas con `kind`, `title` y `readAt: null`.
  - `no avisa al actor ni a usuarios inactivos`: `userIds: [actor, inactivo, ana]` con `actorId: actor` → solo la fila de Ana.
  - `quita duplicados de userIds`: `[ana, ana]` → 1 fila.
  - `con la misma dedupeKey no repite`: dos llamadas iguales con `dedupeKey: 'TASK_DUE_SOON:t1:2026-11-07'` → 1 fila; la segunda devuelve 0.
  - `si falla no lanza`: un `projectId` inexistente (falla la clave foránea) → resuelve a 0 y `console.error` se llamó (`vi.spyOn`).
- [x] **Step 2: Ejecuta las pruebas.** Esperado: FALLA, no existe `../src/notifications`.
- [x] **Step 3: Implementa** el enum, el modelo y la migración (tabla, índice único `(userId, dedupeKey)`, índice `(userId, createdAt)`, claves foráneas en cascada a `User` y `Project`, `ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;`). Luego `notify`: filtra los usuarios activos con un `findMany`, quita el actor y crea con `createMany({ skipDuplicates: true })`. Todo dentro de `try/catch`.
- [x] **Step 4: Ejecuta** `npx prisma migrate dev` desde `server/` contra la base local. Luego `notify.test.ts` y `rls.test.ts`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: modelo de avisos y función notify`.

### Task 2: Avisos de tareas (asignación y comentarios)

**Files:**
- Modify: `server/src/routes/tasks.ts` (`POST /api/projects/:id/tasks`, `PATCH /api/tasks/:id`, `PUT /api/tasks/:id/assignees`, `POST /api/tasks/:id/comments`)
- Test: `server/tests/notifyTasks.test.ts`

**Interfaces:**
- Consumes: `notify` (Task 1).

Regla: responsables nuevos = después − antes (leer los `TaskAssignee` antes de la transacción). `title` = título de la tarea después del cambio. `entityId` = id de la tarea. Comentario: destinatarios = responsables de la tarea; `actorId` y `actorName` = quien comenta.

- [x] **Step 1: Escribe las pruebas** (PM Paula; colaboradores Ana y Luis, miembros):
  - `crear una tarea con responsables avisa a cada uno`: `assigneeIds: [ana, luis]` → Ana y Luis reciben un `TASK_ASSIGNED` con `title: 'Diseño'` y `projectId`; Paula no recibe nada.
  - `editar responsables solo avisa a los nuevos`: tarea con [Ana]; `PATCH { assigneeIds: [ana, luis] }` → solo Luis recibe un aviso nuevo; Ana sigue con 0 avisos nuevos.
  - `repetir los mismos responsables no avisa`: `PUT /assignees { userIds: [ana] }` sobre una tarea con [Ana] → 0 avisos nuevos.
  - `el PM que se asigna su tarea no se avisa`: `assigneeIds: [paula]` → 0 avisos.
  - `un comentario avisa a los demás responsables`: tarea con [Ana, Luis]; Ana comenta → Luis recibe `TASK_COMMENTED` con `actorName: 'Ana'`; Ana no recibe nada. El aviso no contiene el cuerpo del comentario (ningún campo lo incluye).
  - `el comentario del PM avisa a todos los responsables`: Paula comenta → Ana y Luis reciben aviso.
- [x] **Step 2: Ejecuta.** Esperado: FALLAN (0 avisos).
- [x] **Step 3: Implementa** las llamadas a `notify` después de cada escritura.
- [x] **Step 4: Ejecuta** `notifyTasks.test.ts`, `tasks.test.ts` y `activityLog.test.ts`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: avisos de tareas asignadas y comentarios`.

### Task 3: Avisos de incidentes

**Files:**
- Modify: `server/src/routes/incidents.ts` (POST de incidentes, PATCH `:incidentId`, `POST /api/projects/:id/risks/:riskId/incident`)
- Test: `server/tests/notifyIncidents.test.ts`

Regla: avisar a `ownerId` cuando queda fijado al crear o cambia en el PATCH (`input.ownerId !== undefined && input.ownerId !== incident.ownerId && input.ownerId`). `title` = `INC-<number> <title>` del incidente guardado.

- [x] **Step 1: Escribe las pruebas:**
  - `crear con responsable avisa al responsable`: el PM crea `{ title: 'Caída', ownerId: ana }` → Ana recibe `INCIDENT_ASSIGNED` con `title: 'INC-1 Caída'`.
  - `cambiar el responsable avisa solo al nuevo`: `PATCH { ownerId: luis }` → Luis recibe un aviso y Ana no recibe uno nuevo.
  - `editar otro campo no avisa`: `PATCH { priority: 'HIGH' }` → 0 avisos nuevos.
  - `desde un riesgo avisa al responsable del riesgo`: un riesgo con `ownerId: ana` y `POST .../incident` → Ana recibe un aviso.
  - `un colaborador que reporta no genera avisos`: Ana reporta `{ title: 'Error' }` → 0 avisos.
- [x] **Step 2: Ejecuta.** Esperado: FALLAN.
- [x] **Step 3: Implementa** las tres llamadas.
- [x] **Step 4: Ejecuta** `notifyIncidents.test.ts` y `incidents.test.ts`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: avisos de incidentes asignados`.

### Task 4: Vencimientos y limpieza en la tarea diaria

**Files:**
- Modify: `server/src/jobs/daily.ts`
- Modify: `server/tests/daily.test.ts` (el `toEqual` de la línea 103 suma `dueSoon: 0, overdue: 0, oldNotifications: 0`)
- Test: `server/tests/notifyDaily.test.ts`

**Interfaces:**
- Produces: `runDailyJobs` devuelve además `{ dueSoon: number; overdue: number; oldNotifications: number }` (avisos creados y borrados). Los pasos nuevos corren antes del bloque que puede lanzar por Storage, para que se cuenten igual.

- [x] **Step 1: Escribe las pruebas** (reloj `2026-11-06T10:00:00Z`, hoy `2026-11-06`; tarea de Ana):
  - `avisa de la tarea que vence mañana`: `dueDate: '2026-11-07'` → `TASK_DUE_SOON` para Ana y `dueSoon: 1`.
  - `avisa de la tarea que venció ayer`: `dueDate: '2026-11-05'` → `TASK_OVERDUE` y `overdue: 1`.
  - `no avisa de tareas hechas, sin fecha o vencidas hace más de un día`: `DONE` con fecha de mañana, sin fecha, y `dueDate: '2026-11-01'` → 0.
  - `no avisa en proyectos cerrados`: proyecto `CLOSED` → 0.
  - `dos corridas el mismo día no duplican, y otra fecha de fin vuelve a avisar`: corre dos veces → 1 aviso. Cambia `dueDate` a `'2026-11-07'` → `'2026-11-05'` (otra clave) → corre → 2 avisos en total.
  - `borra los avisos de más de 90 días`: un aviso con `createdAt` de hace 91 días y otro de hace 89 → queda 1 y `oldNotifications: 1`.
- [x] **Step 2: Ejecuta.** Esperado: FALLAN.
- [x] **Step 3: Implementa**. Una consulta trae las tareas de proyectos no cerrados con `dueDate` en `[mañana, ayer]` y `status != 'DONE'`, con sus responsables. Por cada tarea llama a `notify` con su `dedupeKey`. Luego hace un `deleteMany` de los avisos con `createdAt < now − 90 días`.
- [x] **Step 4: Ejecuta** `notifyDaily.test.ts` y `daily.test.ts`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: avisos de vencimiento y limpieza de avisos en la tarea diaria`.

### Task 5: API de avisos

**Files:**
- Create: `server/src/routes/notifications.ts` (`notificationRoutes(app)`, registrado en `server/src/app.ts`)
- Modify: `server/src/activity/table.ts` (`NOT_LOGGED`: `'POST /api/notifications/:id/read'` y `'POST /api/notifications/read-all'` con «No es de un proyecto»)
- Modify: las pruebas de cobertura que enumeran rutas (`activityCoverage.test.ts` y, si enumeran todas las rutas, `closedGuard`/`accessMatrix`), solo si exigen declarar las rutas nuevas.
- Test: `server/tests/notificationRoutes.test.ts`

**Interfaces:**
- Produces: `GET /api/notifications?before=<id>` → `{ items: NotificationDto[], nextCursor: string | null }`, 30 por página, orden `createdAt desc, id desc`. `NotificationDto = { id, kind, projectId, projectName, entityId, title, actorName, readAt: string | null, createdAt: string }`.
- Produces: `GET /api/notifications/unread-count` → `{ count: number }`. `POST /api/notifications/:id/read` → `{ ok: true }` (404 `notFound('Aviso no encontrado')` si no es del usuario). `POST /api/notifications/read-all` → `{ ok: true }`.
- Filtro de acceso, el mismo en las cuatro rutas: el PM ve todos sus avisos; los demás, `project: { members: { some: { userId } } }`.

- [x] **Step 1: Escribe las pruebas:**
  - `lista solo los avisos propios, del más reciente al más antiguo` y `sin sesión responde 401`.
  - `pagina de 30 en 30 sin repetir con createdAt iguales`: 31 avisos con el mismo `createdAt` → la página 1 trae 30 y un `nextCursor`; la página 2 trae 1; la unión de ids tiene 31 elementos.
  - `la cuenta solo incluye los no leídos`.
  - `marcar uno lo marca; el de otro usuario responde 404 y no cambia`.
  - `marcar todos solo toca los propios`.
  - `quitado del proyecto, sus avisos de ese proyecto no aparecen`: Ana tiene un aviso; la quitan con la ruta de miembros → la lista y la cuenta dan 0.
- [x] **Step 2: Ejecuta.** Esperado: FALLAN (404).
- [x] **Step 3: Implementa** las rutas y la entrada en `NOT_LOGGED`.
- [x] **Step 4: Ejecuta** el archivo nuevo y luego `npm test -w server`. Esperado: todo PASA.
- [x] **Step 5: Commit** `feat: rutas de avisos`.

### Task 6: Campana en el cliente

**Files:**
- Modify: `client/src/api/types.ts` (`Notification`, `NotificationPage`)
- Create: `client/src/lib/notifications.ts`
- Create: `client/src/components/NotificationBell.tsx`
- Modify: `client/src/components/AppLayout.tsx` (campana en `Sidebar` y en la cabecera móvil, salvo para `OBSERVER`)
- Modify: pruebas que simulan `api` en el layout (`layout.test.tsx`, `observerUi.test.tsx`, etc.), para que respondan `/api/notifications/unread-count` con `{ count: 0 }`.
- Test: `client/tests/notificationText.test.ts`, `client/tests/notifications.test.tsx`

**Interfaces:**
- Produces: `describeNotification(n: Notification): string`, con estas frases exactas:
  - `TASK_ASSIGNED`: `Te asignaron la tarea «${title}»`
  - `TASK_COMMENTED`: `${actorName} comentó en tu tarea «${title}»`
  - `TASK_DUE_SOON`: `La tarea «${title}» vence mañana`
  - `TASK_OVERDUE`: `La tarea «${title}» venció ayer`
  - `INCIDENT_ASSIGNED`: `Te asignaron el incidente «${title}»`
- Produces: `notificationLink(n): string`. Las tareas van a `/proyectos/${projectId}/tareas/${entityId}` y los incidentes a `/proyectos/${projectId}/incidentes`.
- Produces: `relativeTime(iso: string, now: Date): string`. Devuelve `ahora` si pasó menos de 1 minuto, `hace N min` si menos de 60, `hace N h` si es del mismo día, `ayer` si fue el día anterior y, si no, `shortDate`.

Comportamiento:
- La cuenta usa `useQuery(['notifications','count'], { refetchInterval: 60_000 })`. El foco de ventana ya está activo por defecto.
- Botón con `aria-label="Avisos"`, con la cuenta, o `Avisos, 3 sin leer` si hay alguno. El globo muestra `9+` desde 10.
- El panel muestra la lista con `useInfiniteQuery`:
  - Cada elemento es un botón con la frase, `proyecto · tiempo`, y un punto y negrita si no está leído.
  - Al pulsarlo hace `POST /read`, invalida `['notifications']`, navega y cierra el panel.
  - «Marcar todo como leído» llama a `read-all`.
  - Si la lista está vacía muestra «No tienes avisos». Si hay más páginas, «Ver más».

- [x] **Step 1: Escribe las pruebas:**
  - `notificationText`: las cinco frases, los dos enlaces y `relativeTime` en sus cinco casos.
  - `notifications.test.tsx`:
    - la campana muestra `Avisos, 3 sin leer`, y con 12 muestra el globo `9+`;
    - al abrirla lista las frases;
    - al pulsar un aviso llama a `/api/notifications/<id>/read` y navega a la tarea;
    - «Marcar todo como leído» llama a `read-all`;
    - la lista vacía muestra «No tienes avisos»;
    - un observador no ve el botón «Avisos».
- [x] **Step 2: Ejecuta** `npx vitest run tests/notificationText.test.ts tests/notifications.test.tsx` desde `client/`. Esperado: FALLAN.
- [x] **Step 3: Implementa.**
- [x] **Step 4: Ejecuta** `npm test -w client` y `npx tsc --noEmit -p client`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: campana de avisos`.

### Task 7: Flujo completo y guía

**Files:**
- Modify: `e2e/main-flow.spec.ts`
- Modify: `docs/guia-implementacion-pmbok.md` (etapa 3: «F3 ✓, F2 ✓, F4, C11»; en F2, nota de que «cambio decidido» llega con F4 y que se quitó «entregable en revisión»)
- Modify: este plan (marcar casillas)

- [x] **Step 1:** En el flujo principal, después de que el PM asigna la tarea al colaborador, el colaborador abre «Avisos» y ve el botón `Te asignaron la tarea «…»`. Al pulsarlo llega a la página de la tarea.
- [x] **Step 2:** `npm run build` y `TEST_DATABASE_URL=... npm run test:e2e`. Esperado: PASA.
- [x] **Step 3:** Actualiza la guía y marca el plan.
- [x] **Step 4: Commit** `test: avisos en el flujo principal` y `docs: marca F2 en la guía`.
