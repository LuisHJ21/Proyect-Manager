# Solicitudes de cambio desde el equipo (F4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un colaborador propone cambios con título y descripción, ve solo sus propuestas sin impactos y recibe aviso cuando el PM decide; los PM reciben aviso de cada propuesta.

**Architecture:** Se reutiliza `ChangeRequest`, con `requestedById` como enlace a quien propone. El colaborador pasa a nivel `own` en la sección `changes`. Las rutas de cambios separan el DTO del PM (completo, más `proposedBy`) del DTO del colaborador (reducido). `notify()` de F2 gana dos tipos y un campo `detail`.

**Tech Stack:** Hono, Prisma 6 y PostgreSQL, React 19, TanStack Query, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-solicitudes-cambio-equipo-design.md`

## Global Constraints

- Mensajes y textos en español. Errores con `AppError`.
- Un colaborador nunca recibe `scopeImpact`, `scheduleImpactDays`, `costImpactCents`, `requestedBy`, `requestedById` ni `updatedAt` de una solicitud.
- Solo el servidor fija `requestedById`. No entra en `changeRequestSchema` ni en `updateChangeRequestSchema`.
- Colaborador, `POST`: solo `title` y `description`. Cualquier otra clave → 403 «Solo el Project Manager puede fijar impactos o solicitante».
- PM, `DELETE` de una solicitud con `requestedById` no nulo → 409 `change_proposed` «Una propuesta del equipo no se borra: recházala con una nota».
- Títulos de aviso: `CR-${number} ${title}`. `CHANGE_PROPOSED` va a todos los usuarios activos con `role: 'PM'`, sin el actor. `CHANGE_DECIDED` va a `requestedById`, sin el actor, con `detail` = `APPROVED` | `REJECTED`.
- Textos: «${actorName} propuso el cambio «${title}»», «Aprobaron tu cambio «${title}»» y «Rechazaron tu cambio «${title}»». Enlace: `/proyectos/:p/cambios`.
- Una migración nueva (no editar las aplicadas).
- Pruebas del servidor: `cd server && TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>`.

## Review Focus

1. Un colaborador que propone en un proyecto donde ya hay solicitudes del PM no debe verlas en su lista, y otro colaborador no debe ver las de su compañero. → Task 2.
2. Un colaborador que envía `costImpactCents: null` o `requestedBy: ''` (claves «vacías») también recibe 403, no se ignoran. → Task 2.
3. Si el colaborador que propuso queda inactivo o lo quitan del proyecto, la decisión del PM responde 200 igual: el aviso se pierde sin error. → Task 3.
4. Un proyecto cerrado rechaza la propuesta del colaborador con el código de proyecto cerrado, no con 403. → Task 2.
5. La pestaña del colaborador no debe pedir `GET /decisions` ni mostrar `DecisionsCard` (sección `decisions: 'none'`): pedirla daría 403 y un error en pantalla. → Task 4.

---

### Task 1: Datos, permisos y esquema

**Files:**
- Modify: `shared/src/access.ts` (`COLLABORATOR.changes: 'own'`, comentario «propone; ve las suyas, sin impactos»)
- Modify: `shared/src/schemas.ts` (añadir `proposeChangeSchema`)
- Modify: `shared/src/enums.ts` (`NOTIFICATION_KIND` + `'CHANGE_PROPOSED'`, `'CHANGE_DECIDED'`)
- Modify: `server/prisma/schema.prisma` (`ChangeRequest.requestedById String?` + relación `requestedByUser User? @relation("ChangeRequester", …, onDelete: SetNull)` + `@@index([requestedById])`; `Notification.detail String @default("")`; la relación inversa en `User`)
- Create: `server/prisma/migrations/20261115120000_change_proposals/migration.sql`
- Modify: `server/src/notifications.ts` (`NotifyInput.detail?: string`, guardado en cada fila)
- Test: `shared/tests/schemas.test.ts`, `shared/tests/access.test.ts`, `server/tests/notify.test.ts`

**Interfaces:**
- Produces: `proposeChangeSchema = z.object({ title: required('Escribe el título'), description: z.string().default('') })`.
- Produces: `notify(prisma, { …, detail?: string })`: `detail` se guarda tal cual, y vacío si falta.

- [x] **Step 1: Escribe las pruebas.**
  - En shared: `proposeChangeSchema` acepta `{ title: 'X' }` → `{ title: 'X', description: '' }` y rechaza `{ title: ' ' }` con «Escribe el título».
  - En shared: `accessLevel('COLLABORATOR', 'changes') === 'own'` y `accessLevel('OBSERVER', 'changes') === 'none'`.
  - En `notify.test.ts`: `guarda detail` → la fila tiene `detail: 'APPROVED'`, y sin `detail` queda `''`.
- [x] **Step 2: Ejecuta** shared y `notify.test.ts`. Esperado: FALLAN.
- [x] **Step 3: Implementa** los esquemas, el enum, `access.ts`, el modelo y la migración (dos `ALTER TABLE`, la clave foránea `ON DELETE SET NULL` y el índice). Genera la migración con `npx prisma migrate dev --create-only --name change_proposals` contra la base local, o escríbela a mano y compárala con `prisma migrate diff`. Después, `notify` con `detail`.
- [x] **Step 4: Ejecuta** las pruebas de shared y `notify.test.ts`, `rls.test.ts`. Esperado: PASAN. Ejecuta `accessMatrix.test.ts`. Esperado: FALLA solo `COLLABORATOR POST /api/projects/:id/change-requests` (403, y la tabla lo niega). Se arregla en Task 2.
- [x] **Step 5: Commit** `feat: datos y permisos de las propuestas de cambio`.

### Task 2: Rutas de cambios para el colaborador

**Files:**
- Modify: `server/src/routes/changeRequests.ts`
- Modify: `server/tests/accessMatrix.test.ts` (añadir `'POST /api/projects/:id/change-requests'` a `FINE_GRAINED`)
- Modify: `server/tests/changeRequests.test.ts` (el caso «colaborador 403 y no miembro 404» cambia: `GET` y `POST` ya no son 403 para Ana; `decision` sigue en 403)
- Create: `server/tests/changeProposals.test.ts`

**Interfaces:**
- Consumes: `proposeChangeSchema`, `requestedById` (Task 1).
- Produces: el DTO del PM añade `proposedBy: { id: string; name: string } | null`. El DTO del colaborador es `{ id, number, title, description, status, decisionNote, decidedAt, decidedBy, createdAt }`.
- Produces: el helper interno `createChangeRequest(prisma, projectId, data)`, que hace la transacción del contador y lo reutilizan el PM y el colaborador.

- [x] **Step 1: Escribe las pruebas** en `changeProposals.test.ts`, con `pm`, `ana` y `luis` colaboradores miembros:
  - `el colaborador propone y queda como solicitante`: POST de Ana `{ title: 'Agregar blog', description: 'Hace falta' }` → 201. El cuerpo tiene exactamente las claves del DTO reducido, con `status: 'PENDING'`. En la base: `requestedById: ana.id` y `requestedBy: 'Ana'`.
  - `el colaborador solo ve sus propuestas`: el PM crea una, Ana propone una y Luis otra. `GET` de Ana → solo la suya. `GET` del PM → las 3, la de Ana con `proposedBy: { id: ana.id, name: 'Ana' }` y la del PM con `proposedBy: null`.
  - `la lista del colaborador no trae impactos`: el PM completa los impactos de la propuesta de Ana con PATCH (`scopeImpact`, `scheduleImpactDays: 3`, `costImpactCents: 5000`). El `GET` de Ana no tiene ninguna de las claves `scopeImpact`, `scheduleImpactDays`, `costImpactCents`, `requestedBy` ni `requestedById`.
  - `el colaborador ve la decisión`: el PM la rechaza con la nota «Fuera de alcance». El `GET` de Ana trae `status: 'REJECTED'`, `decisionNote: 'Fuera de alcance'` y `decidedBy.name`.
  - `otras claves dan 403`: hacer un POST de Ana por cada uno de `{ title:'X', costImpactCents: null }`, `{ title:'X', requestedBy: '' }` y `{ title:'X', scopeImpact: 'a' }`. Cada uno debe dar 403 con el mensaje de las Global Constraints y no crear ninguna fila.
  - `el colaborador no edita, no borra ni decide`: PATCH, DELETE y decision de Ana sobre su propia propuesta → 403.
  - `el PM no borra una propuesta del equipo`: DELETE del PM → 409 `change_proposed`, y la fila sigue. DELETE del PM sobre la suya → 200.
  - `proyecto cerrado`: con el proyecto `CLOSED`, el POST de Ana responde con el mismo código que da `closedGuard` en `closedGuard.test.ts`.
  - `el observador sigue sin acceso`: GET y POST → 403.
- [x] **Step 2: Ejecuta** `changeProposals.test.ts`. Esperado: FALLAN, con 403 en el GET y el POST de Ana.
- [x] **Step 3: Implementa.**
  - Usa `getProjectAccess` con `can.level('changes')`: `write` para el PM y `own` para el colaborador. `none` → 403.
  - `GET` con `own` filtra por `requestedById` y mapea a `toProposalDto`.
  - El `POST` con `own` hace la misma comprobación de claves que `incidents.ts`, luego `proposeChangeSchema` y `requestedBy: user.name`.
  - `include` añade `requestedByUser: { select: { id, name } }`, que `toChangeRequestDto` renombra a `proposedBy`.
  - `DELETE` comprueba `requestedById` después de `findPending`.
  - Actualiza `FINE_GRAINED` y el caso viejo de `changeRequests.test.ts`.
- [x] **Step 4: Ejecuta** `changeProposals.test.ts`, `changeRequests.test.ts`, `accessMatrix.test.ts`, `closedGuard.test.ts` y `activityCoverage.test.ts`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: el colaborador propone cambios y ve los suyos`.

### Task 3: Avisos de propuesta y de decisión

**Files:**
- Modify: `server/src/routes/changeRequests.ts`
- Modify: `server/src/routes/notifications.ts` (la lista devuelve `detail`)
- Test: `server/tests/notifyChanges.test.ts`, `server/tests/notificationRoutes.test.ts`

**Interfaces:**
- Consumes: `notify` con `detail` (Task 1); el `POST` y `decision` (Task 2).
- Produces: el aviso de la API añade `detail: string`.

- [x] **Step 1: Escribe las pruebas** en `notifyChanges.test.ts`, con dos PM (`paula`, `pedro`), un PM inactivo y `ana` colaboradora:
  - `proponer avisa a los PM activos`: Ana propone «Agregar blog». Paula y Pedro reciben un aviso `CHANGE_PROPOSED` con `title: 'CR-1 Agregar blog'`, `actorName: 'Ana'` y `entityId` igual al id de la propuesta. El inactivo y Ana no reciben nada.
  - `crear como PM no avisa`: el PM crea una solicitud y no se genera ningún aviso.
  - `decidir avisa a quien propuso`: Paula aprueba la propuesta de Ana. Ana recibe `CHANGE_DECIDED` con `detail: 'APPROVED'` y `title: 'CR-1 Agregar blog'`. Pedro no recibe nada.
  - `rechazar lleva REJECTED`: el aviso de Ana tiene `detail: 'REJECTED'`.
  - `decidir una solicitud del PM no avisa`: si `requestedById` es null, no se crea ningún aviso.
  - `quien propuso ya no está`: Ana queda inactiva y Paula decide. La respuesta es 200 y no se crea ningún aviso.
  - `un fallo del aviso no cambia la respuesta`: con `vi.spyOn(ctx.prisma.notification, 'createMany').mockRejectedValue(...)`, la propuesta responde 201 y la decisión 200.
  - En `notificationRoutes.test.ts`, el aviso listado trae `detail`.
- [x] **Step 2: Ejecuta.** Esperado: FALLAN, porque no se crea ningún aviso.
- [x] **Step 3: Implementa** las llamadas a `notify`:
  - **Proponer:** `userIds: () => prisma.user.findMany({ where: { role: 'PM', active: true } })` mapeado a ids, con `actorId` y `actorName` de quien propone.
  - **Decidir:** `userIds: cr.requestedById ? [cr.requestedById] : []`, `actorId` del PM y `detail: status`.
  - Añade `detail` al mapeo de `notifications.ts`.
- [x] **Step 4: Ejecuta** las dos pruebas de la tarea y `npm test -w server`. Esperado: PASAN.
- [x] **Step 5: Commit** `feat: avisos de propuesta y decisión de cambios`.

### Task 4: Interfaz

**Files:**
- Modify: `client/src/api/types.ts` (`ChangeRequest.proposedBy: PersonRef | null`; el nuevo `ChangeProposal`, con las claves del DTO reducido; `Notification.detail: string`)
- Modify: `client/src/pages/project/ChangeRequests.tsx` (el PM ve «Propuesta por {nombre}» en el detalle y en la fila, y en las propuestas no aparece «Eliminar». Si `!isPm`, se muestra `<MyProposals />`.)
- Create: `client/src/pages/project/MyProposals.tsx`
- Modify: `client/src/lib/notifications.ts`
- Test: `client/tests/changeProposals.test.tsx`, `client/tests/notificationText.test.ts`, `client/tests/changeRequests.test.tsx` (la línea 173 cambia: el colaborador ahora sí ve la pestaña)

**Interfaces:**
- Consumes: los DTO y rutas de las Tasks 2 y 3.

- [x] **Step 1: Escribe las pruebas.**
  - **`changeProposals.test.tsx`, como `collaborator`:**
    - La pestaña «Control de cambios» aparece.
    - Se ve la lista de sus propuestas con `CR-N`, título y estado (las etiquetas de `LABELS`). Una propuesta decidida muestra la nota y «Decidió Paula».
    - No aparecen «Añadir cambio», ni impactos, ni «Eliminar», ni la tarjeta de decisiones. El mock no define `GET /api/projects/p1/decisions`; comprueba que nunca se llama.
    - «Proponer cambio» abre un formulario con «Título» y «Descripción». Al enviarlo se hace `POST /api/projects/p1/change-requests` con `{ title, description }` exactamente, y la lista se vuelve a pedir.
    - Un error 400 del título se muestra en el campo.
    - Si el proyecto está `CLOSED`, no aparece «Proponer cambio».
  - **`changeRequests.test.tsx`, como PM:**
    - Una solicitud con `proposedBy: { id: 'c1', name: 'Carlos' }` muestra «Propuesta por Carlos» y no tiene «Eliminar».
    - Una con `proposedBy: null` sí tiene «Eliminar».
  - **`notificationText.test.ts`:**
    - Los tres textos de las Global Constraints.
    - `notificationLink` de los dos tipos → `/proyectos/p1/cambios`.
- [x] **Step 2: Ejecuta** `cd client && npx vitest run tests/changeProposals.test.tsx tests/changeRequests.test.tsx tests/notificationText.test.ts`. Esperado: FALLAN.
- [x] **Step 3: Implementa.** `MyProposals` usa la misma `queryKey` (`changeRequestsKey`), `Card`, `Modal`, `FormField` y `applyFieldErrors` que el resto de la página. La rama `!isPm` se decide antes de renderizar `DecisionsCard`. Para `describeNotification`, `switch` sobre los dos tipos nuevos, con `n.detail === 'APPROVED'` → «Aprobaron».
- [x] **Step 4: Ejecuta** esas pruebas, `npm test -w client` y `npx tsc -b` en `client/`. Esperado: PASAN, sin errores de tipos.
- [x] **Step 5: Commit** `feat: pantalla de propuestas de cambio del colaborador`.

### Task 5: Flujo completo y documentación

**Files:**
- Modify: `e2e/main-flow.spec.ts`
- Modify: `docs/guia-implementacion-pmbok.md` (la fila de la etapa 3 pasa a «F3 ✓, F2 ✓, F4 ✓, C11»; la nota «Hecho» de F4; en F2, «Cambio decidido» queda hecho)
- Modify: este plan (marcar las casillas)

- [x] **Step 1: Añade al flujo**, donde Carlos ya ha iniciado sesión:
  1. Carlos abre «Control de cambios», pulsa «Proponer cambio» y envía «Agregar buscador». Ve la propuesta como pendiente.
  2. Después, cuando el PM vuelve a entrar en el flujo, abre la campana y pulsa «Carlos propuso el cambio «CR-N Agregar buscador»». Llega a `/cambios`, ve «Propuesta por Carlos» y la aprueba con una nota.
  3. Si el flujo no vuelve al PM después de Carlos, coloca los pasos donde haya un cambio de sesión. No añadas inicios de sesión nuevos.
- [x] **Step 2: Ejecuta** `npm run build` y `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npm run test:e2e`. Esperado: PASA.
- [x] **Step 3: Actualiza** la guía y el plan, y ejecuta `npm test`. Esperado: shared, server y client PASAN.
- [x] **Step 4: Commits** `test: propuesta de cambio en el flujo principal` y `docs: marca F4 en la guía y las tareas del plan`.
