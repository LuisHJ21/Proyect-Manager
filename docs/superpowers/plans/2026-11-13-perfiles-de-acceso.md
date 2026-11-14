# Perfiles de acceso (C1 + F1): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** tres perfiles (PM, Colaborador, Observador) con una tabla de capacidades por sección que aplican el servidor y el cliente. El colaborador lee los entregables y cambia el estado de sus riesgos; el observador solo lee.

**Arquitectura:** la tabla `ACCESS` vive en `shared/src/access.ts`. En el servidor, `getProjectAccess` devuelve `can`, y `requireProjectAccess(c, id, section, 'read' | 'write')` sustituye a `requireProjectPm`; un middleware global bloquea toda escritura del observador. En el cliente, el hook `useAccess()` lee la misma tabla para pestañas, menús y botones. Cierra el bloque una prueba de matriz perfil × ruta construida sobre las rutas registradas.

**Tecnología:** Hono, Prisma con PostgreSQL, Zod, React 19, React Router 7, TanStack Query, Vitest, Testing Library, Playwright.

**Especificación:** `docs/superpowers/specs/2026-11-13-perfiles-de-acceso-design.md`

## Restricciones globales

- Rama `perfiles-de-acceso`. Un commit por tarea, en español, con prefijo y terminado en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Pruebas primero: escribir la prueba, verla fallar, implementar, verla pasar.
- Pruebas del servidor: `docker compose up -d` y `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres` en el entorno.
- Sin migraciones: `User.role` es texto.
- `ROLE = ['PM', 'COLLABORATOR', 'OBSERVER']` y `LABELS.role.OBSERVER = 'Observador'`.
- Escritura del observador: 403, código `observer_read_only`, mensaje `Tu perfil es de solo lectura`. Excepciones: `POST /api/auth/logout` y `POST /api/auth/change-password`.
- Cambio a Observador con trabajo abierto: 409, código `observer_has_work`, mensaje `Tiene trabajo abierto: reasígnalo antes de cambiar su perfil a Observador`, `details: { tasks, steps, risks, incidents }`.
- Riesgo propio: mensaje `Solo puedes cambiar el estado de los riesgos de los que eres responsable`.
- Observador como responsable: 400 con `fields.ownerId = 'Un observador no puede ser responsable'`. El mensaje es decisión del plan; la especificación solo fija el 400 con `fields.ownerId`.
- Nadie que no sea PM recibe costos, presupuesto, riesgos ajenos, interesados (tampoco el nombre de quien revisó un entregable), desempeño ni control de cambios. Las pruebas actuales del colaborador sin costos y las de `closedGuard` siguen pasando.
- Errores con `AppError` y la forma `{ error: { code, message, fields?, details? } }`.

## Focos de revisión

1. **Degradar a un PM a Observador** debe respetar la regla de al menos un PM activo. Hoy `losesPmAccess` solo mira `role === 'COLLABORATOR'`. La Task 4 lo cambia a «cualquier rol distinto de PM» y lo prueba.
2. **Los selectores de responsable o de asignado del cliente** no deben ofrecer observadores: formulario de tarea, pasos, riesgos, incidentes y filtro del calendario. Si los ofrecen, el usuario recibe un 400 sin entender por qué. La Task 11 lo prueba en los formularios de tarea y de riesgo.
3. **El riesgo de otra persona** responde 404 al colaborador en `PATCH` y no sale en su lista, para no revelar que existe. La Task 6 lo prueba.
4. **El DTO de riesgo incluye `incidents`.** Para el colaborador se omite, igual que el vínculo de incidente a riesgo, que solo ve el PM (sección 4.5 de la especificación). La Task 6 lo prueba.
5. **A un observador que tiene la sesión abierta cuando le cambian el perfil**, sus escrituras le responden 403. El cliente ya vuelve a pedir `/api/auth/me` ante un 403 (`pm:forbidden` en `AuthProvider`). La Task 9 comprueba que entonces se le muestra el menú de observador.

---

### Task 1: Tabla de capacidades en `shared`

**Files:**
- Modify: `shared/src/enums.ts` (`ROLE`, `LABELS.role`)
- Create: `shared/src/access.ts`
- Modify: `shared/src/index.ts` (exportación)
- Test: `shared/tests/access.test.ts`

**Interfaces:**
- Produces:
  - `type Section = 'project' | 'planning' | 'tasks' | 'comments' | 'attachments' | 'members' | 'raci' | 'deliverables' | 'lessons' | 'incidents' | 'decisions' | 'risks' | 'stakeholders' | 'budget' | 'performance' | 'changes' | 'closure'`
  - `type AccessLevel = 'write' | 'read' | 'own' | 'none'`. La especificación lo llama `Level`, pero ese nombre ya existe en `enums.ts` (ver «Decisiones del plan» al final).
  - `ACCESS: Record<Role, Record<Section, AccessLevel>>`
  - `SECTIONS: readonly Section[]`
  - `canRead(role: Role, section: Section): boolean`
  - `canWrite(role: Role, section: Section): boolean`
  - `accessLevel(role: Role, section: Section): AccessLevel`

- [x] **Step 1: Escribir la prueba que falla.** `access.test.ts` comprueba cada celda contra esta tabla (fila = sección; columnas PM / COLLABORATOR / OBSERVER):

```ts
const EXPECTED = {
  project:      ['write', 'read', 'read'],
  planning:     ['write', 'read', 'read'],
  tasks:        ['write', 'read', 'read'],
  comments:     ['write', 'read', 'none'],
  attachments:  ['write', 'read', 'read'],
  members:      ['write', 'read', 'read'],
  raci:         ['write', 'none', 'none'],
  deliverables: ['write', 'read', 'read'],
  lessons:      ['write', 'write', 'read'],
  incidents:    ['write', 'own', 'none'],
  decisions:    ['write', 'none', 'none'],
  risks:        ['write', 'own', 'none'],
  stakeholders: ['write', 'none', 'none'],
  budget:       ['write', 'none', 'none'],
  performance:  ['write', 'none', 'none'],
  changes:      ['write', 'none', 'none'],
  closure:      ['write', 'none', 'none'],
} as const;
```

  La prueba comprueba además:
  - `canRead` es verdadero para `read`, `write` y `own`.
  - `canWrite` solo es verdadero para `write`.
  - `ROLE` incluye `'OBSERVER'`.
  - `LABELS.role.OBSERVER === 'Observador'`.
- [x] **Step 2: Ejecutar la prueba.** `npx vitest run tests/access.test.ts` en `shared/`. Esperado: FALLA porque `access` no existe.
- [x] **Step 3: Implementar.** Escribir `access.ts`, añadir `OBSERVER` a `ROLE` y a `LABELS`, y exportar desde `index.ts`. Un comentario por fila nombra las excepciones que se resuelven en código: avance y pasos del asignado, anexos del asignado, estado del riesgo o incidente propio.
- [x] **Step 4: Comprobar que todo compila.** `npm test -w shared`, después `npx tsc --noEmit -p client` y `npx tsc --noEmit -p server`. Esperado: PASA. Si algún `Record<Role, …>` del cliente o del servidor falla por la clave OBSERVER, se corrige en este paso.
- [x] **Step 5: Commit.** `feat: tabla de capacidades por perfil y el perfil Observador`

### Task 2: `requireProjectAccess` en el servidor, sin cambio de comportamiento

**Files:**
- Modify: `server/src/auth/access.ts`
- Modify: `server/src/routes/projectCrud.ts`, `registers.ts` y todas las rutas que llaman a `requireProjectPm`: `attachments`, `changeRequests`, `charter`, `closure`, `decisions`, `deliverableReviews`, `deliverables`, `incidents`, `members`, `performance`, `projects`, `raci` y `tasks`.
- Test: `server/tests/projectAccess.test.ts`

**Interfaces:**
- Consumes: `Section`, `accessLevel`, `canRead`, `canWrite` (Task 1).
- Produces:
  - `getProjectAccess(c, projectId): Promise<{ project: Project; role: Role; isPm: boolean; can: { read(s: Section): boolean; write(s: Section): boolean; level(s: Section): AccessLevel } }>`
  - `requireProjectAccess(c, projectId, section: Section, need: 'read' | 'write'): Promise<Project>`: responde 403 (`forbidden()`) si el nivel no alcanza. Con `need: 'read'`, el nivel `own` pasa y la ruta filtra. `requireProjectPm` se elimina.
  - `ProjectCrudOptions.section: Section`, que sustituye a `readAccess`.

- [x] **Step 1: Escribir la prueba que falla.** `projectAccess.test.ts` comprueba:
  - Un observador miembro recibe 200 en `GET /api/projects/:id/charter` y 403 en `GET /api/projects/:id/decisions`.
  - Un observador que no es miembro recibe 404 en `GET /api/projects/:id`.
  - Un colaborador recibe 403 en `GET /api/projects/:id/risks`. En esta tarea el nivel `own` todavía responde 403 en el CRUD; la Task 6 lo sustituye.
- [x] **Step 2: Ejecutar la prueba.** `npx vitest run tests/projectAccess.test.ts`. Esperado: FALLA, porque el acta no responde 200 al observador o porque la prueba no compila.
- [x] **Step 3: Implementar.** Cada `requireProjectPm(c, id)` pasa a `requireProjectAccess(c, id, <sección>, 'write')` si es una escritura, o a `'read'` si es una lectura. Sección de cada ruta:
  - acta, objetivos e hitos → `planning`
  - miembros → `members`
  - RACI → `raci`
  - decisiones → `decisions`
  - control de cambios → `changes`
  - desempeño → `performance`
  - cierre y reapertura → `closure`
  - tareas, pasos y dependencias → `tasks`
  - anexos → `attachments`
  - incidentes → `incidents`
  - entregables y sus revisiones → `deliverables`
  - proyecto → `project`
  - interesados → `stakeholders`
  - riesgos → `risks`
  - gastos → `budget`

  Hay dos excepciones:
  - Los GET de entregables piden `'write'` en esta tarea. La Task 5 los abre junto con el DTO que oculta a quien revisó.
  - En `registerProjectCrud`, el GET responde 403 si `can.level(section)` no es `read` ni `write`.
- [x] **Step 4: Ejecutar la suite del servidor.** `npm test -w server`. Esperado: todo pasa sin cambiar ninguna prueba existente, porque el PM y el colaborador se comportan como antes.
- [x] **Step 5: Commit.** `refactor: los permisos por proyecto se leen de la tabla de capacidades`

### Task 3: Guardia global del observador

**Files:**
- Create: `server/src/observerGuard.ts`
- Modify: `server/src/app.ts` (se registra justo después de `registerAuthHook` y antes de `registerClosedGuard`)
- Test: `server/tests/observerGuard.test.ts`

**Interfaces:**
- Produces: `registerObserverGuard(app: App): void`.

- [x] **Step 1: Escribir la prueba que falla.** Prueba de cobertura:
  - Recorre `listRoutes(ctx.app)` con los métodos POST, PUT, PATCH y DELETE. Excluye `POST /api/auth/logout`, `POST /api/auth/change-password` y las rutas que no necesitan sesión (`/api/setup` y `/api/auth/login`).
  - Envía cada ruta como un observador miembro de un proyecto activo, con ids reales como en `closedGuard.test.ts`.
  - Espera 403 y `error.code === 'observer_read_only'` en todas, con `routes.length >= 40`.

  Casos aparte:
  - logout responde 200.
  - change-password con la contraseña actual responde 200.
  - Un colaborador no se ve afectado: `POST /api/tasks/:id/comments` en una tarea que tiene asignada responde 201.
- [x] **Step 2: Ejecutar la prueba.** `npx vitest run tests/observerGuard.test.ts`. Esperado: FALLA, porque las rutas responden otros códigos.
- [x] **Step 3: Implementar el middleware.** Compara el método y `c.req.path` con las dos excepciones y, si no coinciden, lanza `new AppError(403, 'observer_read_only', 'Tu perfil es de solo lectura')`.
- [x] **Step 4: Ejecutar la suite del servidor.** `npm test -w server`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el observador no puede escribir en la API`

### Task 4: Perfiles en Usuarios y quién puede ser responsable

**Files:**
- Modify: `server/src/routes/users.ts`, `server/src/routes/registers.ts` (validación de riesgos) y `server/src/routes/incidents.ts` (`assertIncidentLinks`)
- Create: `server/src/domain/owners.ts`
- Test: `server/tests/observerProfile.test.ts`

**Interfaces:**
- Produces: el 409 `observer_has_work` con `details: { tasks: number; steps: number; risks: number; incidents: number }`, que lee la Task 11.

- [x] **Step 1: Escribir las pruebas que fallan.**
  - `POST /api/users` con `role: 'OBSERVER'` responde 201.
  - Cambiar a OBSERVER a una persona con trabajo abierto en proyectos activos responde 409 y no cambia su rol. Su trabajo: 1 tarea abierta, 1 paso sin hacer, 1 riesgo no cerrado del que es responsable y 1 incidente OPEN del que es responsable. La respuesta trae `details` igual a `{ tasks: 1, steps: 1, risks: 1, incidents: 1 }`.
  - El mismo cambio responde 200 si todo está terminado o cerrado, o si el trabajo está solo en proyectos CLOSED.
  - Cambiar al único PM activo a OBSERVER responde 409 `last_pm`.
  - Poner a un observador miembro como `ownerId` de un riesgo (POST y PATCH) o de un incidente responde 400 con `fields.ownerId === 'Un observador no puede ser responsable'`.
  - Asignar a un observador miembro a una tarea responde 400 con `fields.assigneeIds`. `assertAssignable` ya lo impide; la prueba lo deja fijado.
  - Un observador puede estar en la RACI: el `PUT` del PM sobre una celda con rol `I` responde 200.
- [x] **Step 2: Ejecutar las pruebas.** `npx vitest run tests/observerProfile.test.ts`. Esperado: FALLA.
- [x] **Step 3: Implementar.**
  - `losesPmAccess` usa `input.role !== undefined && input.role !== 'PM'`.
  - Los conteos van en una función local `countOpenWork(prisma, userId)` de `users.ts`, con cuatro `count` en paralelo.
  - La regla del responsable va en `assertOwnerCanOwn(prisma, projectId, ownerId)`, en `server/src/domain/owners.ts`. La usan riesgos y `assertIncidentLinks`, y conserva el mensaje actual para quien no es miembro.
- [x] **Step 4: Ejecutar la suite del servidor.** `npm test -w server`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el PM crea observadores y se protege el trabajo abierto`

### Task 5: Entregables en lectura para colaborador y observador

**Files:**
- Modify: `server/src/routes/deliverables.ts` (`toDeliverableDto`, `loadDeliverableDetail` y los dos GET)
- Test: `server/tests/deliverablesAccess.test.ts`

**Interfaces:**
- Produces: `toDeliverableDto(d, today, detail, isPm: boolean)` y `loadDeliverableDetail(prisma, id, today, isPm = true)`. `deliverableReviews.ts` sigue pasando el valor del PM.

- [x] **Step 1: Escribir las pruebas que fallan.**
  - Un colaborador miembro y un observador miembro reciben 200 en la lista y en el detalle. La respuesta trae `criteria` y `reviews`, con `outcome`, `reviewedOn` y `note`.
  - El texto JSON de la respuesta no contiene el nombre del interesado. Para comprobarlo se crea el interesado «María Pérez» y una revisión con su `stakeholderId`.
  - Las claves `stakeholder` y `stakeholderName` no aparecen ni en `lastReview` ni en `reviews[]`.
  - El PM sigue recibiendo esas claves.
  - Las escrituras del colaborador responden 403: POST de entregable, PATCH de criterio y POST de revisión.
- [x] **Step 2: Ejecutar las pruebas.** `npx vitest run tests/deliverablesAccess.test.ts`. Esperado: FALLA con 403.
- [x] **Step 3: Implementar.** Los GET piden `'read'` y pasan `can.write('deliverables')` como `isPm`. Para quien no es PM, el DTO omite esas claves en vez de enviarlas como `null`.
- [x] **Step 4: Ejecutar la suite del servidor.** `npm test -w server`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el equipo ve los entregables sin datos de interesados`

### Task 6: Riesgos propios del colaborador

**Files:**
- Create: `server/src/domain/risks.ts`
- Modify: `server/src/routes/projectCrud.ts`, `server/src/routes/registers.ts`
- Test: `server/tests/domain/risks.test.ts`, `server/tests/ownRisks.test.ts`

**Interfaces:**
- Produces:
  - `riskAccess(risk: { ownerId: string | null }, viewer: { userId: string; isPm: boolean }): { view: boolean; edit: boolean; changeStatus: boolean; remove: boolean }`, con la misma forma que `incidentAccess`.
  - `ProjectCrudOptions.own?: { field: string; editable: readonly string[]; message: string }`, y `toDto(item, isPm)`.

- [x] **Step 1: Escribir las pruebas que fallan.**
  - `domain/risks.test.ts` cubre al PM, al responsable y a quien no lo es.
  - En `ownRisks.test.ts`, el colaborador es responsable de R1 y no de R2:
    - `GET risks` devuelve solo R1, con `score` y sin `incidents`.
    - `PATCH R1 { status: 'TREATING' }` responde 200.
    - `PATCH R1 { status: 'CLOSED', impact: 5 }` responde 403 con el mensaje `Solo puedes cambiar el estado de los riesgos de los que eres responsable`.
    - `PATCH R2 { status: 'CLOSED' }` responde 404.
    - `POST risks` y `DELETE R1` responden 403.
    - Los indicadores del proyecto siguen sin datos de riesgos para el colaborador.
    - El PM ve R1 y R2, ambos con `incidents`.
- [x] **Step 2: Ejecutar las pruebas.** `npx vitest run tests/domain/risks.test.ts tests/ownRisks.test.ts`. Esperado: FALLA.
- [x] **Step 3: Implementar.** Con nivel `own`:
  - El GET filtra por `{ [own.field]: user.id }`.
  - El PATCH busca el registro con ese mismo filtro; si no lo encuentra, responde 404. Si el cuerpo trae una clave fuera de `own.editable`, responde 403 con `own.message`. Después valida con `updateSchema`.
  - POST y DELETE responden 403.

  El registro de riesgos declara `own: { field: 'ownerId', editable: ['status'], message: … }` y un `toDto` que omite `incidents` para quien no es PM.
- [x] **Step 4: Ejecutar la suite del servidor.** `npm test -w server`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el colaborador ve sus riesgos y cambia su estado`

### Task 7: Lo que lee el observador

**Files:**
- Modify: `server/src/routes/incidents.ts`, `tasks.ts` (`GET /api/tasks/:id` y `GET /api/me/tasks`), `lessons.ts` (`GET /api/lessons`) y `calendar.ts`
- Test: `server/tests/observerReads.test.ts`

- [x] **Step 1: Escribir las pruebas que fallan.** El observador es miembro del proyecto A y no del B.
  - Los `GET` de incidentes, lista y detalle, responden 403.
  - `GET /api/tasks/:id` responde 200 sin la clave `comments`. Un colaborador la sigue recibiendo.
  - `GET /api/me/tasks` responde 200 con `[]`, aunque el observador tenga asignada una tarea DONE de antes.
  - `GET /api/lessons` devuelve solo las lecciones de A.
  - `GET /api/calendar` devuelve todas las tareas con fecha de A, asignadas o no, y los hitos de A. No devuelve nada de B.
  - **Ningún dato oculto:** no aparecen `plannedCostCents`, `plannedBudgetCents`, `amountCents`, `spentCents` ni `currency` en estas respuestas: detalle y lista de proyectos, tareas del proyecto, detalle de tarea, indicadores y calendario. Se comprueba igual que en las pruebas del colaborador, con `JSON.stringify` y una búsqueda de las claves.
- [x] **Step 2: Ejecutar las pruebas.** `npx vitest run tests/observerReads.test.ts`. Esperado: FALLA.
- [x] **Step 3: Implementar.**
  - Las rutas de incidentes piden `requireProjectAccess(…, 'incidents', 'read')`. El observador tiene el nivel `none`, así que recibe 403.
  - El detalle de tarea incluye los comentarios solo si `can.read('comments')`.
  - En el calendario, las tareas del observador se buscan con `project.members.some(userId)` en lugar de `assignees`.
  - `/api/lessons` añade `project: { members: { some: { userId } } }` para el observador.
- [x] **Step 4: Ejecutar la suite del servidor.** `npm test -w server`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el observador lee solo lo que su perfil permite`

### Task 8: Matriz perfil × ruta

**Files:**
- Test: `server/tests/accessMatrix.test.ts`

**Interfaces:**
- Consumes: `ACCESS` (Task 1), `listRoutes` (`server/src/http.ts`).

- [x] **Step 1: Escribir la prueba.**
  - Un mapa `ROUTE_SECTION: Record<string, Section>` con clave `"<MÉTODO> <patrón>"`. Cubre toda ruta bajo `/api/projects/:id` y `/api/tasks/:id`, los mismos prefijos que `closedGuard.test.ts` menos `attachments` y `local-uploads`.
  - Una lista `FINE_GRAINED` con las rutas cuya regla se decide en el código y ya tienen pruebas propias. Para el colaborador no se espera 403 en ellas:
    - PATCH de tarea (avance)
    - POST de comentarios
    - PATCH de pasos
    - subida de anexos a una tarea
    - POST y PATCH de incidentes
    - PATCH de riesgo
    - lecciones del proyecto
  - Para cada ruta, la prueba se hace como PM, como colaborador miembro y como observador miembro:
    - Espera 403 si el nivel no alcanza: GET necesita `read`, el resto necesita `write`, y `own` cuenta como lectura.
    - En los demás casos espera cualquier código distinto de 403.
  - En las escrituras del observador espera el código `observer_read_only`. Las peticiones usan ids reales y cuerpo vacío.
  - Si una ruta registrada no está en `ROUTE_SECTION`, la prueba falla con el mensaje `Ruta sin clasificar: <clave>`.
- [x] **Step 2: Ejecutar la prueba.** `npx vitest run tests/accessMatrix.test.ts`. Esperado: PASA. Si una ruta da un código que la tabla no permite, es un fallo de las Tasks 2 a 7: se corrige la ruta, no lo esperado.
- [x] **Step 3: Comprobar que la prueba puede fallar.** Cambiar a mano una celda de `ACCESS` (por ejemplo, `OBSERVER.planning = 'none'`), ejecutar la prueba y ver que falla. Después, deshacer el cambio.
- [x] **Step 4: Commit.** `test: matriz de permisos por perfil y ruta`

### Task 9: Cliente: acceso, pestañas, menú e inicio

**Files:**
- Create: `client/src/auth/useAccess.ts`
- Modify: `client/src/auth/AuthProvider.tsx` (expone `role`), `client/src/pages/project/ProjectLayout.tsx`, `client/src/router.tsx`, `client/src/auth/RequireAuth.tsx` y `client/src/components/AppLayout.tsx`
- Test: `client/tests/projectLayout.test.tsx`, `client/tests/layout.test.tsx`

**Interfaces:**
- Produces:
  - `useAccess(): { role: Role | null; canRead(s: Section): boolean; canWrite(s: Section): boolean; level(s: Section): AccessLevel }`
  - `ProjectSection({ section }: { section: Section })`, que sustituye a `ProjectPmOnly` y redirige a `resumen` si no hay permiso de lectura.
  - `TABS[i].section: Section`, que sustituye a `pmOnly`.

- [x] **Step 1: Escribir las pruebas que fallan.**
  - Pestañas por perfil:
    - El colaborador ve Resumen, Acta, Tareas, Anexos, Incidentes, Lecciones, Riesgos y Entregables. No ve Interesados, Presupuesto, Desempeño, Control de cambios ni Cierre.
    - El observador ve Resumen, Acta, Tareas, Anexos, Lecciones y Entregables.
  - El observador que abre `/proyectos/:id/riesgos` termina en `resumen`.
  - Menú del observador:
    - Tiene exactamente los enlaces Proyectos, Calendario y Lecciones.
    - `/` y `/mis-tareas` lo llevan a `/proyectos`.
  - El PM y el colaborador conservan sus menús.
  - Tras un 403 que dispara `pm:forbidden`, `/api/auth/me` responde con el rol OBSERVER y el menú pasa a ser el del observador.
- [x] **Step 2: Ejecutar las pruebas.** `npx vitest run tests/projectLayout.test.tsx tests/layout.test.tsx` en `client/`. Esperado: FALLA.
- [x] **Step 3: Implementar.** Sección de cada pestaña:
  - resumen → project
  - acta → planning
  - tareas → tasks
  - anexos → attachments
  - incidentes → incidents
  - lecciones → lessons
  - interesados → stakeholders
  - riesgos → risks
  - presupuesto → budget
  - desempeno → performance
  - cambios → changes
  - entregables → deliverables
  - cierre → closure

  Además:
  - El router envuelve en `<ProjectSection section=…>` cada ruta de sección que no ven todos los perfiles.
  - `OBSERVER_LINKS` contiene Proyectos, Calendario y Lecciones.
  - `HomeRedirect` lleva al PM a `/panel`, al observador a `/proyectos` y al colaborador a `/mis-tareas`.
- [x] **Step 4: Ejecutar la suite del cliente.** `npm test -w client`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: pestañas y menú según el perfil`

### Task 10: Cliente: entregables y riesgos del equipo

**Files:**
- Modify: `client/src/pages/project/Deliverables.tsx`, `client/src/components/deliverables/DeliverableDetail.tsx`, `client/src/pages/project/Registers.tsx` (`RisksPage`) y `client/src/api/types.ts` (campos opcionales de la revisión y del riesgo)
- Test: `client/tests/deliverables.test.tsx`, `client/tests/risks.test.tsx`

- [x] **Step 1: Escribir las pruebas que fallan.**
  - Colaborador en Entregables:
    - No hay botón «Añadir entregable».
    - El detalle muestra los criterios sin casillas y sin acciones de revisión.
    - Una revisión aparece como «Aceptado el 10/11/2026», sin nombre.
  - El PM sigue viendo quién revisó.
  - Colaborador en Riesgos:
    - La lista muestra solo lo que devuelve la API.
    - No hay botones para registrar, editar ni borrar.
    - El detalle tiene un selector «Estado del riesgo» que envía `PATCH … { status: 'TREATING' }`.
- [x] **Step 2: Ejecutar las pruebas.** `npx vitest run tests/deliverables.test.tsx tests/risks.test.tsx`. Esperado: FALLA.
- [x] **Step 3: Implementar.**
  - Entregables usa `readOnly || !canWrite('deliverables')`.
  - El historial muestra el nombre de quien revisó solo si llega de la API.
  - `RisksPage` usa `canEdit={!readOnly && canWrite('risks')}`.
  - Con nivel `own` y el proyecto abierto, el detalle del riesgo añade el selector de estado.
- [x] **Step 4: Ejecutar la suite del cliente.** `npm test -w client`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el equipo ve entregables y gestiona el estado de sus riesgos`

### Task 11: Cliente: el observador sin controles de escritura, y selectores sin observadores

**Files:**
- Modify:
  - `client/src/pages/project/TaskDetail.tsx`: el observador no ve comentarios ni la sección de incidentes.
  - `client/src/pages/project/Lessons.tsx`: «Añadir lección» se oculta sin `canWrite('lessons')`.
  - `client/src/components/tasks/TaskForm.tsx`, la lista de pasos, `RisksPage` (selector de responsable), `IncidentForm.tsx` (responsable) y `client/src/pages/Calendar.tsx` (filtro): no ofrecen miembros ni usuarios con `role === 'OBSERVER'`, salvo a quien ya esté asignado.
  - `client/src/components/users/EditUserModal.tsx` y `client/src/pages/Users.tsx`: muestran el error `observer_has_work`.
- Test: `client/tests/taskDetail.test.tsx`, `lessons.test.tsx`, `users.test.tsx`, `projectTasks.test.tsx`, `risks.test.tsx`

- [x] **Step 1: Escribir las pruebas que fallan.**
  - Observador:
    - El detalle de tarea no tiene la sección «Comentarios», ni «Reportar incidente», ni casillas en los pasos.
    - Anexos no tiene botón de subir.
    - Lecciones no tiene «Añadir lección».
  - Los formularios de tarea y de riesgo no ofrecen a un miembro con rol OBSERVER.
  - Usuarios:
    - El selector «Rol» ofrece «Observador».
    - Al guardar con un 409 `observer_has_work` y `details { tasks: 2, steps: 0, risks: 1, incidents: 0 }`, se ve el mensaje de la API y «2 tareas · 1 riesgo». Solo se muestran los conteos mayores que cero, en singular o plural.
- [x] **Step 2: Ejecutar las pruebas.** Ejecutar cada archivo de prueba. Esperado: FALLA.
- [x] **Step 3: Implementar.** Lo que describen los archivos de esta tarea y las pruebas del paso 1.
- [x] **Step 4: Ejecutar la suite del cliente.** `npm test -w client`. Esperado: PASA.
- [x] **Step 5: Commit.** `feat: el observador navega sin controles de escritura`

### Task 12: Tramo e2e del observador y verificación completa

**Files:**
- Modify: `e2e/main-flow.spec.ts`

- [x] **Step 1: Añadir el tramo al final del flujo principal**, después de reabrir el proyecto:
  - `createUser` acepta un `role` opcional, que elige la etiqueta en «Rol». `signInFirstTime` acepta el encabezado esperado, por defecto `'Mis tareas'`.
  - El PM crea a «Olga» como Observador y la añade a Portal.
  - Olga inicia sesión y ve el encabezado «Proyectos».
  - Abre Portal y ve el Resumen.
  - No ve «Nueva tarea», ni la pestaña «Riesgos», ni «Añadir lección» en Lecciones.
- [x] **Step 2: Compilar y ejecutar.**
  - `npm run build && npm run test:e2e`. Esperado: PASA.
  - Después, `npm test` con `TEST_DATABASE_URL`. Esperado: pasan shared, servidor y cliente.
- [x] **Step 3: Commit.** `test: tramo del observador en el flujo principal`

---

## Decisiones del plan (no están en la especificación)

- `AccessLevel` en lugar de `Level`, porque `Level` ya existe en `shared/src/enums.ts` (Bajo, Medio, Alto).
- Claves de sección en inglés, como el resto del código: `planning` agrupa acta, objetivos e hitos; `budget` agrupa presupuesto y gastos.
- Mensaje `Un observador no puede ser responsable`.
- El riesgo de otra persona responde 404 al colaborador, no 403, para no revelar que existe.
- El DTO de riesgo omite `incidents` para quien no es PM, en línea con la sección 4.5 de la especificación.
- `GET /api/me/tasks` devuelve `[]` al observador aunque tenga asignadas tareas terminadas de antes.
- Los GET de entregables se abren en la Task 5 y no en la 2, para que ningún commit intermedio envíe el nombre de quien revisó.
