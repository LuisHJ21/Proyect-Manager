# Incidentes y decisiones: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un registro de incidentes que el equipo reporta y el PM gestiona (con paso de riesgo a incidente) y un registro de decisiones del PM, enlazado a cambios e incidentes.

**Architecture:**
- **Servidor:** dos modelos Prisma nuevos (`Incident` y `Decision`) y dos contadores en `Project`. Las reglas de permisos de un incidente viven en una función pura, `incidentAccess`, que usan tanto las rutas como el campo `can` de la respuesta.
- **Interfaz:**
  - una pestaña nueva **Incidentes**, para todos los miembros;
  - el registro de decisiones, como segunda tarjeta en la pestaña **Control de cambios** (la antigua "Cambios").

**Tech Stack:** Fastify 5, Prisma 6 con SQLite, Zod, React 19, TanStack Query 5, Tailwind 4, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-incidentes-y-decisiones-design.md`

## Global Constraints

- Toda la interfaz y los mensajes están en español.
- Sin dependencias nuevas.
- **Números:** `INC-<n>` y `DEC-<n>`, correlativos por proyecto con contador propio (`Project.lastIncidentNumber`, `Project.lastDecisionNumber`). No se reutilizan, y los contadores no se envían en ninguna respuesta (`toProjectDto` los quita, igual que `lastChangeNumber`).
- **Estados de incidente:** `OPEN` → "Abierto", `IN_PROGRESS` → "En curso", `RESOLVED` → "Resuelto", `CLOSED` → "Cerrado".
- **Prioridades:** las de tareas (`LOW`, `MEDIUM`, `HIGH`, con `LABELS.priority`).
- **Vencido:** `dueDate < hoy` y estado `OPEN` o `IN_PROGRESS`.
- **Permisos de incidentes:** exactamente la tabla de la sección 2 de la spec.
  - Un colaborador ve un incidente solo si lo reportó o es su responsable. Si no, recibe 404.
- **Permisos de decisiones:** solo el PM (el colaborador recibe 403 y el no miembro, 404).
- **Títulos generados:**
  - **Riesgo a incidente:** el texto plano de la descripción del riesgo, recortado a 200 caracteres.
  - **Decisión al cerrar un incidente:** `Cierre de INC-<n>: <título>`, recortado a 200 caracteres.
- **Reglas de estado:**
  - resolver exige una `resolution` con texto;
  - pasar a `RESOLVED` guarda `resolvedAt`, y salir de ese estado lo vacía;
  - `CLOSED` guarda `closedAt`, y reabrir vacía `closedAt` y `resolvedAt`.

## Review Focus

1. **Un colaborador responsable que envía `ownerId`, `priority`, `dueDate`, `riskId`, `title` o `status: 'CLOSED'` en un `PATCH`** recibe 403 y no cambia nada. Es la vía más probable para reasignarse o cerrar sin permiso. Prueba en la Tarea 4.
2. **El responsable cambia mientras un colaborador tiene abierto el detalle.** Su siguiente acción recibe 404; la interfaz cierra la ventana, avisa y recarga la lista. Prueba en la Tarea 7.
3. **Quien reportó desactiva su cuenta.** Su nombre sigue en el incidente y la lista no falla. Prueba en la Tarea 4.
4. **Reabrir un incidente cerrado y resuelto** vacía `closedAt` y `resolvedAt`, y el responsable puede volver a trabajarlo. Prueba en la Tarea 4.
5. **Un riesgo con una descripción larga y con formato** genera un incidente con el título en texto plano y como mucho 200 caracteres. Prueba en la Tarea 5.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `shared/src/enums.ts`, `shared/src/schemas.ts` | `INCIDENT_STATUS`, etiquetas y esquemas |
| `server/prisma/schema.prisma` y migración `add_incidents_decisions` | Modelos y contadores |
| `server/src/domain/incidents.ts` (nuevo) | `incidentAccess`, `isIncidentOverdue`, `truncateTitle` |
| `server/src/routes/incidents.ts` (nuevo) | API de incidentes y paso de riesgo a incidente |
| `server/src/routes/decisions.ts` (nuevo) | API de decisiones |
| `server/src/routes/{members,tasks,registers,projectCrud,dashboard}.ts`, `server/src/domain/dashboard.ts`, `server/src/auth/access.ts` | Integraciones |
| `client/src/pages/project/Incidents.tsx` (nuevo), `client/src/components/incidents/*` (nuevo) | Pestaña Incidentes, formulario, detalle y acciones |
| `client/src/components/decisions/DecisionsCard.tsx` (nuevo) | Tarjeta de decisiones |
| `client/src/pages/project/{ChangeRequests,TaskDetail,Registers,ProjectLayout}.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/components/project/MembersPanel.tsx`, `client/src/router.tsx` | Integraciones |

---

### Task 1: Esquemas compartidos

**Files:**
- Modify: `shared/src/enums.ts`, `shared/src/schemas.ts`
- Test: `shared/tests/schemas.test.ts`

**Interfaces:**
- Produces:
  - **Estados:** `INCIDENT_STATUS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const`, `type IncidentStatus`, y `LABELS.incidentStatus` con las etiquetas de Global Constraints.
  - **`reportIncidentSchema`:** `title: required('Escribe el título')`, `description: z.string().default('')` y `taskId: z.string().min(1).nullable().optional()`. Es lo que puede enviar cualquier miembro.
  - **`pmIncidentFields`** (objeto Zod, para extender): `ownerId: z.string().min(1).nullable().optional()`, `priority: z.enum(PRIORITY).optional()`, `dueDate: optionalDateSchema`, `riskId: z.string().min(1).nullable().optional()`.
  - **`createIncidentSchema`** = `reportIncidentSchema.extend(pmIncidentFields)`.
  - **`updateIncidentSchema`:** todos los campos anteriores opcionales, más:
    - `status: z.enum(INCIDENT_STATUS).optional()`;
    - `resolution: z.string().optional()`;
    - `recordDecision: z.boolean().optional()`.
  - **`decisionRecordSchema`:** `title: required('Escribe el título')`, `rationale` y `decidedBy` como `z.string().default('')`, `decidedOn: calendarDateSchema`, `changeRequestId` e `incidentId` como `z.string().min(1).nullable().optional()`.
  - **`updateDecisionRecordSchema`:** los mismos campos, opcionales. El nombre no puede ser `decisionSchema`, porque ya existe para la decisión de una solicitud de cambio.

- [ ] **Step 1: Write the failing tests:**
  - "reportar exige título y no admite una tarea vacía": `reportIncidentSchema.safeParse({ title: ' ' }).success === false`; con `{ title: 'X', taskId: '' }`, también `false`.
  - "la decisión exige fecha válida": `decisionRecordSchema.safeParse({ title: 'D', decidedOn: '2026-02-30' }).success === false`.
  - "los estados de incidente están en español": `LABELS.incidentStatus` es igual a `{ OPEN: 'Abierto', IN_PROGRESS: 'En curso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado' }`.
- [ ] **Step 2: Run** `npm test -w shared` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w shared` → PASS.
- [ ] **Step 5: Commit** `feat: esquemas de incidentes y decisiones`.

---

### Task 2: Modelos y migración

**Files:**
- Modify: `server/prisma/schema.prisma`, `server/src/auth/access.ts`
- Create: migración `<timestamp>_add_incidents_decisions`
- Test: `server/tests/incidents.test.ts` (solo el caso de esta tarea)

**Interfaces:**
- Produces:
  - **`Incident`** con los campos de la sección 2 de la spec y estas relaciones:
    - `project`, `onDelete: Cascade`;
    - `reportedBy User`, `onDelete: Restrict`, con nombre de relación `"incidentReporter"`;
    - `owner User?`, `onDelete: SetNull`, con relación `"incidentOwner"`;
    - `task Task?` y `risk Risk?`, ambos con `onDelete: SetNull`.
    - Índices: `@@unique([projectId, number])`, `@@index([ownerId])`, `@@index([reportedById])`.
  - **`Decision`** con los campos de la sección 3, `changeRequest ChangeRequest?` e `incident Incident?` (ambos `SetNull`) y `@@unique([projectId, number])`.
  - **`Project`:** `lastIncidentNumber Int @default(0)` y `lastDecisionNumber Int @default(0)`.
  - **`toProjectDto`:** quita también estos dos contadores.

- [ ] **Step 1: Write the failing test** "los contadores no se envían": un colaborador miembro hace `GET /api/projects/:id` y el PM hace `GET /api/projects`; ninguna respuesta tiene `lastIncidentNumber` ni `lastDecisionNumber`.
- [ ] **Step 2: Run** `npm test -w server -- incidents` → FAIL. Hasta que exista el campo, el test falla por la propiedad presente o por el modelo.
- [ ] **Step 3: Implement** el esquema. Genera la migración con `DATABASE_URL="file:<scratchpad>/migr.db" npx prisma migrate dev --name add_incidents_decisions --create-only --skip-generate` desde `server/`, revisa el SQL (que conserve los datos de `Project`) y ejecuta `npx prisma generate`. Si falla con EPERM, sigue la nota de bloqueo del plan anterior.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: modelos de incidentes y decisiones`.

---

### Task 3: Reglas de acceso a un incidente

**Files:**
- Create: `server/src/domain/incidents.ts`
- Test: `server/tests/domain/incidents.test.ts`

**Interfaces:**
- Produces:

```ts
export type IncidentViewer = { userId: string; isPm: boolean };
export type IncidentAccess = { view: boolean; edit: boolean; changeStatus: boolean; close: boolean };
export function incidentAccess(incident: { reportedById: string; ownerId: string | null; status: string }, viewer: IncidentViewer): IncidentAccess;
export function isIncidentOverdue(incident: { status: string; dueDate: string | null }, today: string): boolean;
export function truncateTitle(text: string, max = 200): string;
export const PM_ONLY_INCIDENT_FIELDS = ['ownerId', 'priority', 'dueDate', 'riskId', 'title', 'description'] as const;
```

  Las reglas salen de la tabla de la spec:
  - `edit` y `close` solo los tiene el PM.
  - `changeStatus` lo tiene el PM, o el responsable si el incidente no está `CLOSED`.
  - `view` lo tiene el PM, quien lo reportó o el responsable.
  - `truncateTitle` recorta y quita los espacios finales. Si recorta, termina en "…" y nunca supera `max`.

- [ ] **Step 1: Write the failing tests:**
  - **PM:** todo `true`, aunque el incidente esté `CLOSED`.
  - **Responsable:** `{ view: true, edit: false, changeStatus: true, close: false }`. Si está `CLOSED`, `changeStatus: false`.
  - **Quien reportó:** `{ view: true, edit: false, changeStatus: false, close: false }`.
  - **Otro colaborador:** todo `false`.
  - **`isIncidentOverdue`:** ayer y `OPEN` → `true`; ayer e `IN_PROGRESS` → `true`; ayer y `RESOLVED` → `false`; hoy → `false`; sin fecha → `false`.
  - **`truncateTitle`:** `'a'.repeat(250)` da 200 caracteres terminados en "…"; `'corto'` queda igual.
- [ ] **Step 2: Run** `npm test -w server -- domain/incidents` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: reglas de acceso a incidentes`.

---

### Task 4: API de incidentes

**Files:**
- Create: `server/src/routes/incidents.ts`
- Modify: `server/src/app.ts`, `server/src/routes/members.ts`, `server/src/routes/tasks.ts` (detalle)
- Test: `server/tests/incidents.test.ts`

**Interfaces:**
- Consumes: Tareas 1, 2 y 3.
- Produces:
  - Las rutas de incidentes de la sección 4 de la spec, con la forma de la respuesta de ese apartado:
    - `can` sale de `incidentAccess`;
    - `overdue`, de `isIncidentOverdue`;
    - `risk` es `{ id, title: truncateTitle(toPlainText(description)) }` solo para el PM, y `null` para los demás.
  - `toIncidentDto(incident, viewer, today)` se exporta para la Tarea 5.
  - Una función interna `loadVisibleIncident(req, projectId, incidentId)` responde 404 si el incidente no existe, es de otro proyecto o quien consulta no puede verlo.
  - **`POST`:**
    - un colaborador solo puede enviar las claves de `reportIncidentSchema`; cualquier clave de `PM_ONLY_INCIDENT_FIELDS` fuera de `title` y `description` responde 403 `forbidden`;
    - el PM usa `createIncidentSchema`;
    - el número sale de `Project.lastIncidentNumber`, incrementado en una transacción, igual que los cambios.
  - **`PATCH`:**
    - un no-PM que envía cualquier campo distinto de `status` y `resolution` responde 403;
    - si `status` es `CLOSED` o sale de `CLOSED` y quien consulta no tiene `close`, responde 403;
    - si cambia el estado sin tener `changeStatus`, responde 403;
    - `RESOLVED` sin resolución (la enviada o la ya guardada, después de quitar espacios) responde 400 en `resolution`;
    - las fechas `resolvedAt` y `closedAt` siguen las reglas de Global Constraints.
    - (`recordDecision` lo agrega la Tarea 5.)
  - **Validaciones**, en `POST` y `PATCH`:
    - `ownerId` debe ser miembro del proyecto (400 en `ownerId`);
    - `taskId` y `riskId` deben ser del proyecto (400 en el campo).
  - **Lista:** `?status=` filtra por estado; `?mine=1` deja los que quien consulta reportó o tiene asignados. Para un colaborador, la lista se limita siempre a lo que puede ver.
  - **`members.ts`:** al quitar a un miembro, `incident.updateMany({ where: { projectId, ownerId }, data: { ownerId: null } })` dentro de la transacción. `impact` agrega `incidents`: el número de incidentes `OPEN` o `IN_PROGRESS` donde es responsable.
  - **`GET /api/tasks/:id`** agrega `incidents: [{ id, number, title, status }]`, filtrado con `incidentAccess(...).view`.

- [ ] **Step 1: Write the failing tests** (PM, Ana colaboradora y responsable, Beto colaborador que reporta, Cata colaboradora ajena; todos miembros):
  - "qué ve cada rol":
    - Beto reporta un incidente y queda `INC-1`, `OPEN`, `MEDIUM` y sin responsable;
    - el PM lo asigna a Ana;
    - `GET` de la lista: el PM ve 1, Ana 1, Beto 1 y Cata 0;
    - `GET` del detalle: Cata recibe 404 y un no miembro también.
  - "un colaborador que reporta con campos del PM recibe 403": Beto envía `priority: 'HIGH'` → 403, y no se creó nada.
  - "el responsable no puede tocar campos del PM ni cerrar": Ana envía `ownerId`, `priority`, `dueDate`, `title` y `status: 'CLOSED'` (cada uno por separado) → 403 cada vez, y el incidente queda igual.
  - "quien reportó no cambia el estado": Beto envía `status: 'IN_PROGRESS'` → 403.
  - "el responsable avanza y resuelve":
    - Ana pasa a `IN_PROGRESS` → 200;
    - `RESOLVED` sin resolución → 400 en `fields.resolution`;
    - `RESOLVED` con resolución → 200 y `resolvedAt` igual al reloj de prueba.
  - "el PM cierra y reabre y se vacían las fechas":
    - el PM pasa a `CLOSED` → `closedAt` guardado;
    - Ana intenta `IN_PROGRESS` → 403;
    - el PM pasa a `OPEN` → `closedAt` y `resolvedAt` en nulo;
    - Ana pasa a `IN_PROGRESS` → 200.
  - "la numeración no reutiliza números": tres incidentes, se borra el 3 y el siguiente es el 4. Un colaborador no puede borrar (403).
  - "validaciones de responsable, tarea y riesgo de otro proyecto": 400 en cada campo. Un responsable que no es miembro → 400.
  - "filtros": `?status=OPEN` y `?mine=1` para el PM, que con `mine` solo ve los que reportó o tiene asignados.
  - "overdue y can": con `dueDate` ayer y `OPEN` → `overdue: true`. `can` de Ana es `{ edit: false, changeStatus: true, close: false }`.
  - "el riesgo enlazado solo se ve como PM": con `riskId` → el PM recibe `risk.title`, Ana recibe `risk: null`.
  - "quien reportó desactivado sigue apareciendo": desactiva a Beto y el PM sigue recibiendo `reportedBy.name === 'Beto'`.
  - "quitar a un miembro lo saca como responsable y el aviso lo cuenta": `impact.incidents === 1`, luego `DELETE` del miembro y el incidente queda con `owner: null`.
  - "borrar la tarea o el riesgo deja el enlace vacío".
  - "el detalle de tarea lista los incidentes visibles": un incidente enlazado a la tarea, reportado por Beto. Beto lo ve en `GET /api/tasks/:id`; Cata, si es asignada de la tarea, no.
- [ ] **Step 2: Run** `npm test -w server -- incidents` → FAIL.
- [ ] **Step 3: Implement** lo de Interfaces. Registra las rutas en `app.ts`.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: API de incidentes`.

---

### Task 5: Riesgo a incidente y decisiones (API)

**Files:**
- Create: `server/src/routes/decisions.ts`
- Modify: `server/src/routes/incidents.ts`, `server/src/routes/registers.ts`, `server/src/routes/projectCrud.ts`, `server/src/app.ts`
- Test: `server/tests/decisions.test.ts`, `server/tests/incidents.test.ts`

**Interfaces:**
- Consumes: `toIncidentDto` y `truncateTitle` (Tareas 3 y 4).
- Produces:
  - **`POST /api/projects/:id/risks/:riskId/incident`** (solo PM). Responde 201 con el incidente, que tiene:
    - el título del riesgo en texto plano y recortado;
    - el responsable del riesgo y su `riskId`;
    - prioridad `HIGH` si `probability * impact >= 15`, y `MEDIUM` si no.
    - Un riesgo de otro proyecto responde 404.
  - **`ProjectCrudOptions.include?: object`**, que se pasa a `findMany`, `create` y `update`. Los riesgos lo usan con `{ incidents: { select: { id: true, number: true, title: true, status: true }, orderBy: { number: 'asc' } } }`, y la respuesta trae `incidents`.
  - **API de decisiones:** las rutas de la sección 4 de la spec, con la forma de ese apartado, ordenadas por `number` descendente. El número sale de `Project.lastDecisionNumber`.
  - **`PATCH` de un incidente con `{ status: 'CLOSED', recordDecision: true }`** (solo PM; un no-PM recibe 403) crea en la misma transacción una decisión con:
    - `title: truncateTitle('Cierre de INC-<n>: <título>')`;
    - `rationale` igual a la resolución;
    - `decidedBy` con el nombre del PM;
    - `decidedOn` con la fecha de hoy;
    - `incidentId`.
    - `recordDecision` sin `status: 'CLOSED'` responde 400 en `recordDecision`.

- [ ] **Step 1: Write the failing tests:**
  - **En `incidents.test.ts`:**
    - "pasar un riesgo a incidente": un riesgo de probabilidad 4 e impacto 5, con responsable Ana y descripción `'<p><strong>Caída</strong> del servidor</p>'`, da un incidente con título `'Caída del servidor'`, `owner.id === ana.id`, `priority 'HIGH'` y `risk.id`. Con probabilidad 2 e impacto 3, da `MEDIUM`. `GET /risks` devuelve `incidents` con `[{ number: 1, ... }]`.
    - "título largo con formato": una descripción de 300 caracteres con `<em>` da un título sin etiquetas de 200 caracteres.
    - "colaborador 403 al pasar riesgo a incidente".
  - **En `decisions.test.ts`:**
    - "permisos": el colaborador recibe 403 y el no miembro, 404.
    - "crea, lista, edita y borra con número correlativo": DEC-1 y DEC-2, y la lista va en orden `[2, 1]`.
    - "valida enlaces de otro proyecto": 400 en `changeRequestId` y en `incidentId`.
    - "devuelve los enlaces": `changeRequest: { id, number, title }` e `incident: { id, number, title }`.
    - "cerrar un incidente registrando la decisión": el PM cierra con `recordDecision: true` una vez resuelto con `'Se reinició el servidor'`. Se crea una decisión con `title === 'Cierre de INC-1: <título>'`, `rationale === 'Se reinició el servidor'`, `decidedBy === pm.name`, `decidedOn === '2026-11-10'` (con el reloj de prueba) e `incident.number === 1`.
    - "recordDecision sin cerrar da 400".
- [ ] **Step 2: Run** `npm test -w server -- decisions incidents` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: riesgo a incidente y registro de decisiones`.

---

### Task 6: Incidentes en el panel

**Files:**
- Modify: `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts`
- Test: `server/tests/dashboard.test.ts`, `server/tests/domain/dashboard.test.ts`

**Interfaces:**
- Consumes: `isIncidentOverdue` (Tarea 3).
- Produces:
  - `DashboardInput.incidents: { id: string; number: number; title: string; projectId: string; priority: string; status: string; dueDate: string | null }[]`.
  - `attention` agrega `{ kind: 'incident', id, number, title, projectId, projectName, priority, dueDate, overdue }` para los incidentes `OPEN` o `IN_PROGRESS` de proyectos activos que son `HIGH` o están vencidos.
  - Orden de `attention`: tareas vencidas, luego incidentes (primero los vencidos, después por número) y luego riesgos. Se mantiene el tope actual de elementos.

- [ ] **Step 1: Write the failing tests:**
  - **Dominio:** un incidente `HIGH` abierto aparece; uno `MEDIUM` vencido aparece con `overdue: true`; uno `HIGH` resuelto no aparece; uno de un proyecto cerrado tampoco.
  - **API:** `GET /api/dashboard` devuelve el elemento `kind: 'incident'` con `number` y `projectName`.
- [ ] **Step 2: Run** `npm test -w server -- dashboard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: incidentes urgentes en el panel`.

---

### Task 7: Pestaña Incidentes y reporte desde una tarea

**Files:**
- Create: `client/src/pages/project/Incidents.tsx`, `client/src/components/incidents/IncidentForm.tsx`, `client/src/components/incidents/IncidentDetail.tsx`
- Modify: `client/src/api/types.ts`, `client/src/router.tsx`, `client/src/pages/project/ProjectLayout.tsx`, `client/src/pages/project/TaskDetail.tsx`
- Test: `client/tests/incidents.test.tsx`

**Interfaces:**
- Consumes: la API de las Tareas 4 y 5.
- Produces:
  - `type Incident` (la forma de la respuesta) en `types.ts`, y `incidentsKey = (projectId) => ['project', projectId, 'incidents']`.
  - Ruta `incidentes`, fuera de `ProjectPmOnly`, con la pestaña "Incidentes" después de "Anexos".
  - `IncidentForm({ projectId, isPm, initialTaskId?, onClose })` solo envía los campos que corresponden al rol.
  - `IncidentDetail({ projectId, incident, isPm, onClose })` muestra los datos y las acciones según `incident.can`:
    - **"Marcar en curso"** (`changeStatus` y estado `OPEN`);
    - **"Resolver"** (`changeStatus` y estado distinto de `RESOLVED` y `CLOSED`), que pide la resolución;
    - **"Editar"** (`edit`);
    - **"Cerrar"** (`close` y estado distinto de `CLOSED`), con una ventana que pide la resolución si falta y tiene la casilla "Registrar como decisión";
    - **"Reabrir"** (`close` y estado `CLOSED`);
    - **"Eliminar"** (`edit`).
    - Ante un 404 en cualquier acción, cierra la ventana, muestra el toast "Ya no tienes acceso a este incidente" e invalida `incidentsKey`.
  - **`TaskDetail`:** botón "Reportar incidente", que abre `IncidentForm` con `initialTaskId`, y la sección "Incidentes" con `task.incidents`.

- [ ] **Step 1: Write the failing tests:**
  - "lista con prioridad, responsable y vencido": una fila con "INC-2", "Alta", "Sin responsable" y "Vencido"; otra con "INC-1", "Ana" y "En curso".
  - "filtros": elegir "Resueltos" pide `GET .../incidents?status=RESOLVED`. La casilla "Míos" agrega `mine=1` y el colaborador no la ve.
  - "el colaborador reporta solo título, descripción y tarea": el cuerpo enviado es exactamente `{ title, description, taskId: null }`, y el formulario no muestra "Responsable" ni "Prioridad".
  - "el PM reporta con responsable, prioridad y fecha".
  - "acciones según can":
    - con `{ edit: false, changeStatus: true, close: false }` se ven "Marcar en curso" y "Resolver", pero no "Editar", "Cerrar" ni "Eliminar";
    - "Resolver" abre una ventana con "Resolución", y su botón está desactivado sin texto; al enviarla, el `PATCH` lleva `{ status: 'RESOLVED', resolution }`.
  - "cerrar con decisión": el PM pulsa "Cerrar", marca "Registrar como decisión" y el `PATCH` lleva `{ status: 'CLOSED', recordDecision: true }`.
  - "un 404 cierra el detalle y avisa": el `PATCH` responde 404, y aparece "Ya no tienes acceso a este incidente" sin el diálogo.
  - "reportar desde una tarea deja la tarea elegida": en `/proyectos/p1/tareas/t1`, "Reportar incidente" envía `taskId: 't1'`, y la sección "Incidentes" lista "INC-3".
  - "el colaborador ve la pestaña Incidentes".
- [ ] **Step 2: Run** `npm test -w client -- incidents` → FAIL.
- [ ] **Step 3: Implement.**
  - **Prioridad:** usa `Badge` con `PRIORITY_TONE` de `TaskCard`.
  - **Vencido:** `Badge tone="danger"` con el texto "Vencido".
  - **Contenedor de la tabla:** `overflow-x-auto`.
  - **Filtros:** van en una fila con `flex-wrap`.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: pestaña Incidentes y reporte desde una tarea`.

---

### Task 8: Decisiones, riesgo a incidente, panel y quitar miembro en la interfaz

**Files:**
- Create: `client/src/components/decisions/DecisionsCard.tsx`
- Modify: `client/src/pages/project/ChangeRequests.tsx`, `client/src/pages/project/ProjectLayout.tsx`, `client/src/pages/project/Registers.tsx` (`RisksPage`), `client/src/pages/Dashboard.tsx`, `client/src/components/project/MembersPanel.tsx`, `client/src/api/types.ts`
- Test: `client/tests/decisions.test.tsx`, `client/tests/risks.test.tsx`, `client/tests/dashboard.test.tsx`

**Interfaces:**
- Consumes: la API de la Tarea 5, `incidentsKey` (Tarea 7) y `changeRequestsKey` (de `ChangeRequests.tsx`).
- Produces:
  - `type DecisionRecord` en `types.ts`.
  - `DecisionsCard({ projectId })`: una tabla con número, título, fecha, quién decidió y los enlaces ("CR-n", "INC-n"). Tiene "Añadir decisión", "Ver", "Editar" y "Eliminar".
    - **Formulario:** Título, Motivo, Quién decidió, Fecha (por defecto `localToday(new Date())`), Cambio relacionado (opcional) e Incidente relacionado (opcional).
  - **Pestaña:** se llama "Control de cambios". `ChangeRequestsPage` muestra la tarjeta actual y debajo `DecisionsCard`.
  - **Detalle de riesgo:** un botón "Pasar a incidente" llama a la ruta de la Tarea 5, muestra un toast "Se creó INC-<n>" e invalida riesgos e incidentes. La lista "Incidentes" muestra `INC-n · título · estado`.
  - **Panel:** `AttentionList` muestra `kind: 'incident'` con un icono, `INC-<n> · <título>` y "Vencido" o "Prioridad alta", y enlaza a `/proyectos/<id>/incidentes`.
  - **Quitar miembro:** el aviso agrega ` y será responsable de ${incidents} incidente(s) menos`.

- [ ] **Step 1: Write the failing tests:**
  - **`decisions.test.tsx`:**
    - "la pestaña se llama Control de cambios y muestra las dos tarjetas";
    - "crear una decisión envía la fecha de hoy por defecto y los enlaces";
    - "lista con DEC-n y enlaces CR y INC";
    - "editar y eliminar".
  - **`risks.test.tsx`:**
    - "Pasar a incidente crea INC y lo avisa": el `POST` a `/risks/r1/incident` y luego el toast "Se creó INC-1".
    - "el detalle lista los incidentes del riesgo".
  - **`dashboard.test.tsx`:** "requiere atención muestra incidentes": "INC-2 · Caída" y "Vencido", con enlace a `/proyectos/p1/incidentes`.
  - **Quitar miembro:** "el aviso cuenta los incidentes", con `impact` que trae `incidents: 2`.
- [ ] **Step 2: Run** las pruebas → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: decisiones, riesgo a incidente e incidentes en el panel`.

---

### Task 9: Flujo completo, README y verificación

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `README.md`

- [ ] **Step 1: Extend the e2e flow:**
  - Carlos, ya con su sesión, abre su tarea "Construcción", pulsa "Reportar incidente" con el título "Servidor de pruebas caído" y guarda.
  - El PM abre "Incidentes", ve "INC-1", y con "Editar" asigna a Carlos con prioridad Alta.
  - Carlos abre "Incidentes" → "Ver INC-1" → "Resolver" con la resolución "Se reinició el servidor".
  - El PM → "Ver INC-1" → "Cerrar" con "Registrar como decisión" → en "Control de cambios" ve "DEC-1" y "Cierre de INC-1".
- [ ] **Step 2: Run** `npm run build` y luego `npm run test:e2e` → PASS.
- [ ] **Step 3: Update `README.md`:**
  - quién reporta y quién gestiona los incidentes;
  - el paso de riesgo a incidente;
  - el registro de decisiones solo para el PM;
  - copiar `data/` antes de actualizar.
- [ ] **Step 4: Verify** `npm test`, `npm run build` y `npm run test:e2e` en verde. Revisa en el navegador a 375 px la pestaña Incidentes (filtros y tabla) y el detalle con acciones.
- [ ] **Step 5: Commit** `test: flujo completo con incidentes y decisiones; docs: README`.
