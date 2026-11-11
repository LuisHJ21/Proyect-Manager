# Entregables y aceptación: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un registro de entregables solo para el PM, con criterios de aceptación marcables, revisiones (aceptar o rechazar en nombre de un interesado, con anexo como evidencia) y su historial. Los entregables vencidos aparecen en el panel.

**Architecture:**
- **Servidor:** tres modelos Prisma nuevos (`Deliverable`, `DeliverableCriterion`, `DeliverableReview`) y un contador en `Project`. Las reglas puras (`canAccept`, `isDeliverableOverdue`, `canTransition`) viven en `shared`, porque las usan el servidor y la interfaz.
- **Rutas:** se reparten en `deliverables.ts` (CRUD y criterios) y `deliverableReviews.ts` (revisiones).
- **Interfaz:** pestaña nueva **Entregables** con tabla, formulario y una ventana de detalle que gestiona criterios, acciones e historial.

**Tech Stack:** Fastify 5, Prisma 6 con SQLite, Zod, React 19, TanStack Query 5, Tailwind 4, Tiptap (`RichTextEditor`), Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-entregables-y-aceptacion-design.md`

## Global Constraints

- Toda la interfaz y los mensajes están en español.
- Sin dependencias nuevas.
- **Número:** `ENT-<n>`, correlativo por proyecto con `Project.lastDeliverableNumber`. No se reutiliza, y `toProjectDto` quita el contador, igual que `lastIncidentNumber`.
- **Estados:** `PENDING` → "Pendiente", `IN_REVIEW` → "En revisión", `ACCEPTED` → "Aceptado", `REJECTED` → "Rechazado".
- **Resultados de revisión:** `ACCEPTED` → "Aceptado", `REJECTED` → "Rechazado".
- **Transiciones por PATCH:** solo `PENDING→IN_REVIEW`, `IN_REVIEW→PENDING`, `REJECTED→PENDING`, `REJECTED→IN_REVIEW` y `ACCEPTED→PENDING`.
  - Cualquier otra responde 409.
  - `status: ACCEPTED` o `REJECTED` por PATCH responde 400 en `status`.
- **Vencido:** `dueDate < hoy` y estado distinto de `ACCEPTED`.
- **Aceptar:** al menos un criterio y todos con `met`.
- **Rechazar:** nota no vacía (sin contar espacios).
- **Límites:** nombre de 1 a 200 caracteres; texto de criterio de 1 a 300 caracteres.
- **Permisos:** todas las rutas son solo para el PM (`requireProjectPm`): el colaborador miembro recibe 403 y el que no es miembro, 404.
- **Criterios de un entregable `ACCEPTED`:** cualquier cambio responde 409.

## Review Focus

1. **Se añade un criterio nuevo después de marcar todos.** "Aceptar" vuelve a desactivarse en la interfaz y el servidor responde 400 en `criteria`. Pruebas en las Tareas 4 y 7.
2. **`?status=` repetido o inválido** responde 400, no 500 (fue un error real en incidentes). Prueba en la Tarea 3.
3. **Se borra el anexo usado como evidencia.** El historial muestra "Anexo eliminado", no un enlace roto ni nada. Pruebas en las Tareas 4 y 7.
4. **Reordenar con ids duplicados, de otro entregable o incompletos** responde 400 y no cambia el orden. Prueba en la Tarea 3.
5. **Reabrir un entregable aceptado** conserva la revisión anterior y vuelve a permitir editar los criterios. Prueba en la Tarea 4.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `shared/src/enums.ts`, `shared/src/schemas.ts` | Estados, etiquetas y esquemas |
| `shared/src/deliverables.ts` (nuevo) | `canAccept`, `isDeliverableOverdue`, `canTransition` |
| `server/prisma/schema.prisma` y migración `add_deliverables` | Modelos y contador |
| `server/src/routes/deliverables.ts` (nuevo) | Lista, detalle, CRUD, criterios, `toDeliverableDto` |
| `server/src/routes/deliverableReviews.ts` (nuevo) | `POST /reviews` |
| `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts` | Elemento de atención `deliverable` |
| `client/src/pages/project/Deliverables.tsx` (nuevo) | Pestaña con tabla y filtro |
| `client/src/components/deliverables/{DeliverableForm,DeliverableDetail,CriteriaList,ReviewDialog}.tsx` (nuevos) | Formulario, detalle, criterios y revisión |
| `client/src/{router.tsx,api/types.ts}`, `client/src/pages/project/ProjectLayout.tsx`, `client/src/pages/Dashboard.tsx` | Integraciones |

---

### Task 1: Esquemas y reglas compartidas

**Files:**
- Create: `shared/src/deliverables.ts`
- Modify: `shared/src/enums.ts`, `shared/src/schemas.ts`, `shared/src/index.ts`
- Test: `shared/tests/deliverables.test.ts`

**Interfaces:**
- Produces:
  - **Estados y resultados:** `DELIVERABLE_STATUS = ['PENDING', 'IN_REVIEW', 'ACCEPTED', 'REJECTED'] as const`, `type DeliverableStatus`, `REVIEW_OUTCOME = ['ACCEPTED', 'REJECTED'] as const`, `type ReviewOutcome`, y `LABELS.deliverableStatus` y `LABELS.reviewOutcome` con las etiquetas de Global Constraints.
  - **`deliverableSchema`:** `name: required('Escribe el nombre').max(200, 'Máximo 200 caracteres')`, `description: z.string().default('')`, `milestoneId: z.string().min(1).nullable().optional()`, `dueDate: optionalDateSchema` y `criteria: z.array(z.string()).optional()`.
  - **`updateDeliverableSchema`:** `name`, `description`, `milestoneId` y `dueDate` opcionales, más `status: z.enum(DELIVERABLE_STATUS).optional()`. No acepta `criteria`.
  - **`criterionSchema`:** `{ text: required('Escribe el criterio').max(300, 'Máximo 300 caracteres') }`.
  - **`updateCriterionSchema`:** `{ text?, met?: boolean }`.
  - **`criteriaOrderSchema`:** `{ ids: z.array(z.string().min(1)).min(1) }`.
  - **`deliverableReviewSchema`:** `outcome: z.enum(REVIEW_OUTCOME)`, `stakeholderId` y `attachmentId` como `z.string().min(1).nullable().optional()`, `reviewedOn: calendarDateSchema` y `note: z.string().default('')`.
  - **Reglas puras** en `deliverables.ts`:
    - `canAccept(criteria: { met: boolean }[]): boolean`.
    - `isDeliverableOverdue(d: { dueDate: string | null; status: string }, today: string): boolean`.
    - `canTransition(from: DeliverableStatus, to: DeliverableStatus): boolean`, con la lista de Global Constraints. Solo cubre las transiciones por PATCH: `IN_REVIEW → ACCEPTED` devuelve `false`.

- [ ] **Step 1: Write the failing tests:**
  - "canAccept": `[]` → false; `[{met:true},{met:false}]` → false; `[{met:true}]` → true.
  - "vencido": sin fecha → false; `dueDate: '2026-11-10'` con `today: '2026-11-11'` y `PENDING` → true; lo mismo pero `ACCEPTED` → false; fecha igual a hoy → false.
  - "transiciones": `PENDING→IN_REVIEW` y `ACCEPTED→PENDING` → true; `PENDING→ACCEPTED`, `ACCEPTED→IN_REVIEW` y `PENDING→PENDING` → false.
  - "esquemas": `deliverableSchema.safeParse({ name: 'x'.repeat(201) }).success === false`; `criterionSchema.safeParse({ text: '  ' }).success === false`; `LABELS.deliverableStatus.IN_REVIEW === 'En revisión'`.
- [ ] **Step 2: Run** `npm test -w shared` → FAIL.
- [ ] **Step 3: Implement** y exporta todo desde `shared/src/index.ts`.
- [ ] **Step 4: Run** `npm test -w shared` y `npm run build -w shared` → PASS.
- [ ] **Step 5: Commit** `feat: esquemas y reglas de entregables`.

---

### Task 2: Modelos y migración

**Files:**
- Modify: `server/prisma/schema.prisma`, el lugar donde vive `toProjectDto` (búscalo con `grep -rn "lastIncidentNumber" server/src`)
- Create: migración `<timestamp>_add_deliverables`
- Test: `server/tests/deliverables.test.ts` (solo el caso de esta tarea)

**Interfaces:**
- Produces:
  - **`Deliverable`:** `id`, `projectId`, `number Int`, `name`, `description @default("")`, `milestoneId String?`, `dueDate String?`, `status @default("PENDING")`, `createdAt` y `updatedAt`.
    - Relaciones: `project` (`Cascade`) y `milestone Milestone?` (`SetNull`).
    - `@@unique([projectId, number])`, `@@index([milestoneId])`.
  - **`DeliverableCriterion`:** `id`, `deliverableId` (`Cascade`), `text`, `met Boolean @default(false)`, `position Int`, `createdAt` y `updatedAt`. `@@index([deliverableId])`.
  - **`DeliverableReview`:** `id`, `deliverableId` (`Cascade`), `outcome`, `stakeholderId String?` (`SetNull`), `stakeholderName @default("")`, `reviewedOn String`, `note @default("")`, `attachmentId String?` (`SetNull`), `attachmentName @default("")`, `criteria String` (JSON), `reviewedById` (`User`, `Restrict`, relación `"deliverableReviewer"`) y `createdAt`.
    - `@@index([deliverableId])`, `@@index([stakeholderId])`, `@@index([attachmentId])`.
  - **Relaciones inversas:**
    - `Project`: `lastDeliverableNumber Int @default(0)` y `deliverables`;
    - `Milestone.deliverables`, `Stakeholder.deliverableReviews`, `Attachment.deliverableReviews` y `User.deliverableReviews`.
  - **`toProjectDto`:** quita también `lastDeliverableNumber`.

- [ ] **Step 1: Write the failing test** "el contador no se envía": un colaborador miembro hace `GET /api/projects/:id` y el PM hace `GET /api/projects`; ninguna respuesta tiene `lastDeliverableNumber`, y `ctx.prisma.deliverable.count()` es 0.
- [ ] **Step 2: Run** `npm test -w server -- deliverables` → FAIL.
- [ ] **Step 3: Implement** el esquema.
  - Genera la migración desde `server/` con `DATABASE_URL="file:<scratchpad>/migr.db" npx prisma migrate dev --name add_deliverables --create-only --skip-generate`.
  - Revisa el SQL: si redefine `Project`, debe llevar `PRAGMA foreign_keys=OFF` y copiar todas las columnas.
  - Ejecuta `npx prisma generate`. Si falla con EPERM porque la app del usuario está en marcha, los tipos se escriben igualmente: borra `node_modules/.prisma/client/query_engine-windows.dll.node.tmp*`.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: modelos de entregables`.

---

### Task 3: API de entregables y criterios

**Files:**
- Create: `server/src/routes/deliverables.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/deliverables.test.ts`

**Interfaces:**
- Consumes: los esquemas, `canTransition` e `isDeliverableOverdue` (Tarea 1); `requireProjectPm`, `fieldError`, `notFound` y `sanitizeRichText` del servidor; para el 409, el helper de conflicto que ya exista en `server/src/errors.ts` (búscalo con `grep -n "409" server/src/errors.ts`; si no hay, crea `conflict(message)` ahí).
- Produces:
  - `deliverableRoutes(app)`, registrado en `app.ts`.
  - `export const deliverableDetailInclude` y `export function toDeliverableDto(d, today: string, detail: boolean)`: con `detail` false devuelve la forma de la lista; con `detail` true, el detalle de la spec, sección 4. `reviews[].criteria` se devuelve ya parseado.
  - `export async function findDeliverable(prisma, projectId, deliverableId)`: lanza 404 "Entregable no encontrado".
  - `export async function loadDeliverableDetail(prisma, id, today)`: lo usan los criterios y la Tarea 4.
  - La fecha de hoy sale de `localToday(app.now())`, igual que en incidentes.

- [ ] **Step 1: Write the failing tests** (en `describe('API de entregables')`, con el PM, Ana colaboradora, un proyecto y `ctx.clock.set('2026-11-11T10:00:00')`):
  - **"solo el PM":** como Ana, `GET` lista → 403, `POST` → 403, `GET :id` → 403; un no miembro → 404.
  - **"crear con criterios":**
    - `POST { name: 'Portal web', criteria: ['Funciona en móvil', '  ', 'Manual'] }` → 201 con `number: 1`, `status: 'PENDING'`, `criteriaTotal: 2` y `criteriaMet: 0`;
    - en el detalle, los textos son `['Funciona en móvil', 'Manual']` en ese orden;
    - la descripción `<p>x</p><script>1</script>` se guarda sin `script`.
  - **"numeración":** crear 3, borrar el 3.º y crear otro → `number: 4`.
  - **"hito de otro proyecto"** → 400 en `fields.milestoneId`, tanto en POST como en PATCH.
  - **"transiciones":**
    - `PENDING→IN_REVIEW` → 200; `IN_REVIEW→PENDING` → 200;
    - `PENDING→ACCEPTED` por PATCH → 400 en `fields.status`;
    - con el estado forzado a `ACCEPTED` en la base, `ACCEPTED→IN_REVIEW` → 409 y `ACCEPTED→PENDING` → 200.
  - **"vencido y filtro":**
    - uno con `dueDate: '2026-11-10'` aparece con `overdue: true`;
    - `?status=IN_REVIEW` filtra;
    - `?status=NOPE` → 400;
    - `?status=PENDING&status=IN_REVIEW` → 400.
  - **"criterios":**
    - añadir → aparece al final;
    - `PATCH { met: true }` → `criteriaMet` 1;
    - borrar → desaparece;
    - un `cid` de otro entregable → 404.
  - **"reordenar":**
    - con los ids invertidos → nuevo orden;
    - con un id duplicado, uno ajeno o la lista incompleta → 400, y el orden no cambia.
  - **"criterios bloqueados si está aceptado":** con el estado forzado a `ACCEPTED`, las 4 rutas de criterios → 409; `PATCH { name }` → 200.
  - **"borrar el hito deja el enlace vacío":** borrar el hito por su ruta → el entregable tiene `milestone: null`.
- [ ] **Step 2: Run** `npm test -w server -- deliverables` → FAIL.
- [ ] **Step 3: Implement.**
  - **`?status`:** acepta solo un string que esté en `DELIVERABLE_STATUS`; un array o un valor no válido responde 400.
  - **Al crear:** el criterio nuevo toma `position = max + 1`.
  - **Al crear el entregable:** incrementa el contador en una transacción, como `createDecision`.
  - **Reordenar:** es válido solo si `new Set(ids).size === ids.length === actuales.length` y todos los ids pertenecen al entregable. Después actualiza `position = índice` en una transacción.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: API de entregables y criterios`.

---

### Task 4: Revisiones

**Files:**
- Create: `server/src/routes/deliverableReviews.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/deliverableReviews.test.ts`

**Interfaces:**
- Consumes: `findDeliverable`, `loadDeliverableDetail` (Tarea 3), `canAccept` y `deliverableReviewSchema` (Tarea 1).
- Produces: `POST /api/projects/:id/deliverables/:did/reviews`, que devuelve el detalle.
  - **Orden de los guardas:** 403/404 → 404 si el entregable no existe → 409 "El entregable no está en revisión" → 400 en `stakeholderId` o `attachmentId` si es de otro proyecto → 400 en `criteria` "Marca todos los criterios para poder aceptar" → 400 en `note` "Escribe el motivo del rechazo".
  - **En una transacción:** crea la revisión con `stakeholderName` (nombre actual del interesado o `''`), `attachmentName` (`originalName` o `''`), `criteria = JSON.stringify(criterios ordenados como { text, met })` y `reviewedById = usuario`, y luego actualiza el `status` a `outcome`.

- [ ] **Step 1: Write the failing tests** (el entregable empieza en `IN_REVIEW` con dos criterios; hay un interesado "Cliente SA" y un anexo "acta.pdf" del proyecto):
  - **"solo en revisión":** si está en `PENDING` → 409.
  - **"aceptar exige todos los criterios":**
    - con uno sin marcar → 400 en `fields.criteria`;
    - sin criterios → 400;
    - con todos marcados, el interesado y el anexo → 200 con `status: 'ACCEPTED'` y `reviews[0]` igual a `{ outcome: 'ACCEPTED', stakeholderName: 'Cliente SA', attachmentName: 'acta.pdf', criteria: [{ text, met: true }, …] }`.
  - **"criterio nuevo tras marcar todos":** marcar los dos, añadir un tercero y aceptar → 400 en `criteria`.
  - **"rechazar exige nota":** con `note: '  '` → 400 en `fields.note`; con `note: 'Faltan pruebas'` → 200 con `REJECTED`.
  - **"interesado o anexo de otro proyecto"** → 400 en el campo correspondiente, y no se crea ninguna revisión.
  - **"el historial sobrevive a los borrados":**
    - tras aceptar, borrar el interesado y el anexo por sus rutas;
    - `reviews[0]` tiene `stakeholder: null`, `stakeholderName: 'Cliente SA'`, `attachment: null` y `attachmentName: 'acta.pdf'`.
  - **"reabrir conserva el historial":**
    - aceptar, luego `PATCH status: PENDING` → 200;
    - `reviews.length === 1`;
    - añadir un criterio → 200.
  - **"orden del historial":** rechazar, volver a `IN_REVIEW`, aceptar → `reviews.map(r => r.outcome)` es `['ACCEPTED', 'REJECTED']`.
  - **"solo el PM":** como colaborador → 403.
- [ ] **Step 2: Run** `npm test -w server -- deliverableReviews` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: aceptar y rechazar entregables`.

---

### Task 5: Entregables vencidos en el panel

**Files:**
- Modify: `server/src/domain/dashboard.ts`, `server/src/routes/dashboard.ts`
- Test: `server/tests/domain/dashboard.test.ts`, `server/tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `isDeliverableOverdue` (Tarea 1).
- Produces:
  - `DashboardInput.deliverables?: { id: string; number: number; name: string; projectId: string; status: string; dueDate: string | null }[]`.
  - `attention` agrega `{ kind: 'deliverable', id, number, title: name, projectId, projectName, dueDate }` por cada entregable vencido de los proyectos en alcance, ordenados por `dueDate` y luego por `number`.
  - Orden: tareas → incidentes → entregables → riesgos, con el mismo tope de `MAX_ATTENTION_ITEMS`.
  - La ruta carga los entregables solo para el PM, como hace con los incidentes.

- [ ] **Step 1: Write the failing tests:**
  - **Dominio:**
    - uno vencido `PENDING` aparece;
    - uno vencido `ACCEPTED` no aparece;
    - uno sin fecha no aparece;
    - con 1 tarea vencida, 1 incidente `HIGH`, 1 entregable vencido y 1 riesgo alto, los `kind` salen en el orden `['task', 'incident', 'deliverable', 'risk']`.
  - **API:** `GET /api/dashboard` como PM devuelve el elemento `kind: 'deliverable'` con `number` y `projectName`.
- [ ] **Step 2: Run** `npm test -w server -- dashboard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: entregables vencidos en el panel`.

---

### Task 6: Pestaña Entregables y formulario

**Files:**
- Create: `client/src/pages/project/Deliverables.tsx`, `client/src/components/deliverables/DeliverableForm.tsx`
- Modify: `client/src/api/types.ts`, `client/src/router.tsx`, `client/src/pages/project/ProjectLayout.tsx`
- Test: `client/tests/deliverables.test.tsx`

**Interfaces:**
- Consumes: la API de las Tareas 3 y 4.
- Produces:
  - **Tipos:** `DeliverableRow`, `DeliverableDetail`, `DeliverableCriterion` y `DeliverableReview`, con la forma de la spec, sección 4.
  - **Claves:** `deliverablesKey(projectId) = ['project', projectId, 'deliverables']`, exportada desde `DeliverableForm.tsx`. La clave del detalle es `[...deliverablesKey(projectId), id]`.
  - **Pestaña:** `{ to: 'entregables', label: 'Entregables', pmOnly: true }` después de `cambios`, con su ruta en `router.tsx`, protegida como las otras pestañas solo para el PM.
  - **`DeliverablesPage`:** guarda `viewingId` y monta `DeliverableDetail` (Tarea 7). Hasta entonces, el botón "Ver ENT-n" puede quedar sin acción.
  - **Formulario:** `DeliverableForm({ projectId, item?, onClose })`. Al editar no muestra los criterios.

- [ ] **Step 1: Write the failing tests:**
  - **"el colaborador no ve la pestaña":** en la navegación "Secciones del proyecto" no hay enlace "Entregables".
  - **"lista":**
    - la fila de `ENT-2` muestra el nombre, el hito "Lanzamiento", "Vencido", "1/3" y "En revisión";
    - el contenedor de la tabla tiene las clases `overflow-x-auto` y `relative`;
    - sin datos se ve "Aún no hay entregables.".
  - **"filtro":** elegir "Aceptado" en "Estado" llama a `GET …/deliverables?status=ACCEPTED`.
  - **"crear con criterios":**
    - "Añadir entregable" → Nombre "Portal";
    - en "Criterios de aceptación" se escriben dos textos ("Añadir criterio" agrega otro campo);
    - "Guardar" → el cuerpo del POST incluye `{ name: 'Portal', criteria: ['A', 'B'] }`.
  - **"editar no muestra criterios":** la ventana "Editar ENT-2" no tiene el texto "Criterios de aceptación".
- [ ] **Step 2: Run** `npm test -w client -- deliverables` → FAIL.
- [ ] **Step 3: Implement.** Sigue `Incidents.tsx` para la tabla y el filtro, y `RichTextEditor` para la descripción.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: pestaña Entregables`.

---

### Task 7: Detalle, criterios, revisión e historial

**Files:**
- Create: `client/src/components/deliverables/DeliverableDetail.tsx`, `client/src/components/deliverables/CriteriaList.tsx`, `client/src/components/deliverables/ReviewDialog.tsx`
- Modify: `client/src/pages/project/Deliverables.tsx`, `client/src/pages/Dashboard.tsx`, `client/src/api/types.ts` (`Dashboard['attention']`)
- Test: `client/tests/deliverables.test.tsx`, `client/tests/dashboard.test.tsx`

**Interfaces:**
- Consumes: `deliverablesKey` (Tarea 6), `canAccept` (Tarea 1) y `GET /api/projects/:id/{stakeholders,attachments}`.
- Produces:
  - **`DeliverableDetail({ projectId, id, onClose })`:** carga `GET …/deliverables/:id`. Cada cambio reemplaza el detalle en la caché con la respuesta e invalida la lista. Un 404 o 409 muestra un aviso con el mensaje del servidor y recarga.
  - **`CriteriaList({ projectId, deliverable })`:**
    - casilla con nombre accesible igual al texto del criterio;
    - botones "Editar criterio <texto>", "Subir <texto>", "Bajar <texto>", "Eliminar <texto>" y "Añadir criterio";
    - con `ACCEPTED`, solo las casillas desactivadas.
  - **`ReviewDialog({ projectId, deliverable, outcome, onClose })`:** título "Aceptar ENT-n" o "Rechazar ENT-n"; campos "Interesado", "Fecha", "Nota" y "Anexo"; botón de confirmación "Aceptar" o "Rechazar". Rechazar se desactiva mientras la nota esté vacía.
  - **Botones del detalle:** los de la spec, sección 5. Con `!canAccept`, "Aceptar" se desactiva y se ve el texto "Marca todos los criterios para poder aceptar".
  - **Panel:** el elemento `deliverable` muestra "ENT-n · <nombre> está vencido" con el icono `PackageCheck` y enlaza a `/proyectos/<id>/entregables`.

- [ ] **Step 1: Write the failing tests:**
  - **"marcar un criterio":** clic en la casilla "Manual" → `PATCH …/criteria/c2` con `{ met: true }`.
  - **"Aceptar desactivado hasta tener todo marcado":**
    - en `IN_REVIEW` con 1/2 criterios, "Aceptar" está desactivado y se ve el texto explicativo;
    - con 2/2 está activo;
    - con 2/3 (un tercer criterio sin marcar) vuelve a estar desactivado.
  - **"aceptar con interesado y anexo":** en "Aceptar ENT-2" se eligen "Cliente SA" y "acta.pdf" y se pulsa "Aceptar" → el cuerpo del POST es `{ outcome: 'ACCEPTED', stakeholderId: 's1', attachmentId: 'a1', reviewedOn: localToday(new Date()), note: '' }`.
  - **"rechazar exige nota":** "Rechazar" está desactivado; tras escribir "Faltan pruebas" se envía con `outcome: 'REJECTED'`.
  - **"aceptado: solo lectura y reabrir":**
    - no hay "Añadir criterio" y las casillas están desactivadas;
    - "Reabrir" → `PATCH …/d2` con `{ status: 'PENDING' }`.
  - **"historial":**
    - una revisión con `attachment: null` y `attachmentName: 'acta.pdf'` muestra "Anexo eliminado";
    - una con `attachment` muestra un enlace a `/api/attachments/a1/download`.
  - **"panel":** el elemento `deliverable` muestra "ENT-3 · Portal está vencido" y un enlace a `/proyectos/p1/entregables`.
- [ ] **Step 2: Run** `npm test -w client -- deliverables dashboard` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: detalle, criterios y aceptación de entregables`.

---

### Task 8: Flujo completo, README y verificación

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `README.md`

- [ ] **Step 1: Extend the e2e flow** (como PM, después del bloque de incidentes; si ese bloque no deja un interesado y un anexo del proyecto, créalos antes):
  1. Abre "Entregables" → "Añadir entregable" con el nombre "Portal publicado" y los criterios "Funciona en móvil" y "Manual entregado".
  2. "Ver ENT-1" → "Enviar a revisión" → "Rechazar" con la nota "Falta el manual".
  3. "Enviar a revisión", marca los dos criterios → "Aceptar" con el interesado y el anexo.
  4. El historial muestra "Aceptado" y "Rechazado".
- [ ] **Step 2: Run** `npm run build` y luego `npm run test:e2e` → PASS.
- [ ] **Step 3: Update `README.md`** con la sección "Entregables y aceptación": solo el PM; criterios; aceptar en nombre de un interesado con un anexo como evidencia; reabrir; copiar `data/` antes de actualizar.
- [ ] **Step 4: Verify:**
  - `npm test`, `npm run build` y `npm run test:e2e` en verde;
  - en el navegador, a 375 px, revisa la pestaña Entregables y el detalle: sin desplazamiento horizontal de página.
- [ ] **Step 5: Commit** `test: flujo completo con entregables; docs: README`.
