# Línea base, valor ganado y control de cambios: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El PM pone costos planeados a las tareas, fija líneas base con versiones, ve el valor ganado (CPI, SPI, EAC y curva S) y registra solicitudes de cambio con su decisión.

**Architecture:**
- **Servidor:** cuatro modelos Prisma nuevos (`Baseline`, `BaselineTask`, `ChangeRequest`, `EvmSnapshot`) y dos columnas (`Task.plannedCostCents`, `Expense.taskId`).
- **Cálculo:** una función pura `computeEvm` en `server/src/domain/evm.ts` calcula todo a la fecha de hoy. La salud del proyecto la consume a través de un cargador común.
- **Interfaz:** dos pestañas solo para el PM, "Desempeño" y "Cambios". La curva S es un SVG propio, sin dependencias nuevas.

**Tech Stack:** Fastify 5, Prisma 6 con SQLite, Zod, React 19, TanStack Query 5, Tailwind 4, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-linea-base-y-cambios-design.md`

## Global Constraints

- Toda la interfaz y los mensajes están en español.
- **Montos:** van en centavos enteros. Se guardan como `BigInt` y viajan como `number`, con el mismo tope `MAX_AMOUNT_CENTS` de siempre.
- **Sin dependencias nuevas**, ni en el servidor ni en la interfaz.
- **Permisos:** todo lo nuevo es solo para el PM. Un colaborador del proyecto recibe 403, quien no es miembro recibe 404, y un colaborador nunca recibe `plannedCostCents`.
- **CPI y SPI:**
  - se redondean a 2 decimales; sin denominador valen `null` y se muestran como "—";
  - colores: verde desde 1, ámbar desde 0,9 y por debajo de 1, y rojo bajo 0,9;
  - textos de CPI: "Sobre el costo" (<1), "En costo" (=1), "Bajo el costo" (>1);
  - textos de SPI: "Atrasado" (<1), "En plazo" (=1), "Adelantado" (>1).
- **Salud:** con línea base, un CPI o SPI menor que 0,9 lleva el proyecto al menos a `ATTENTION` y nunca rebaja un `AT_RISK`.
- **Número de cambio:** correlativo por proyecto, mostrado como `CR-<n>`.
- **Estados de cambio:** `PENDING` → "Pendiente", `APPROVED` → "Aprobada", `REJECTED` → "Rechazada".
- **Códigos de error:** `baseline_empty`, `baseline_missing_dates` (con `details.tasks: [{ id, title }]`) y `change_decided` (409).
- **Si `prisma generate` falla con EPERM** (la app del usuario abierta bloquea el motor), el cliente JS generado igual sirve si la versión de Prisma no cambia. Se deja constancia y se verifica con una copia limpia antes de fusionar.

## Review Focus

1. **`plannedCostCents` es `BigInt`.** Si llega sin convertir a una respuesta, `JSON.stringify` falla con 500 en cualquier ruta que devuelva tareas, y un colaborador no debe recibirlo nunca. Prueba en la Tarea 2: "ninguna ruta de tareas falla ni filtra el costo".
2. **Editar o borrar tareas después de fijar la base** no cambia la base. El desvío y el estado "Eliminada" sí se reflejan. Prueba en la Tarea 5: "la base no cambia al editar o borrar tareas".
3. **Gastos con fecha futura** no cuentan en AC, pero sí en el gasto ligado de la tarea. Prueba en la Tarea 3.
4. **Base con todas sus tareas borradas y sin gastos:** EV es 0, CPI es `null`, EAC vale BAC y no hay errores. Prueba en la Tarea 3 y en la Tarea 5 (la respuesta 200).
5. **Costo planeado con decimales en formato local** (`1.234,50`) llega como `123450` centavos. Prueba en la Tarea 7.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `shared/src/enums.ts`, `shared/src/schemas.ts` | `CHANGE_STATUS`, etiquetas y esquemas nuevos |
| `server/prisma/schema.prisma` y migración `add_baseline_evm` | Modelos y columnas nuevas |
| `server/src/routes/taskDto.ts`, `tasks.ts`, `dependencies.ts`, `registers.ts` | Costo planeado oculto al colaborador; `taskId` en gastos |
| `server/src/domain/evm.ts` (nuevo) | `plannedValueAt`, `computeEvm` |
| `server/src/routes/changeRequests.ts` (nuevo) | Registro de cambios |
| `server/src/routes/performance.ts` (nuevo) | Líneas base, desempeño y fotos diarias |
| `server/src/routes/evmLoader.ts` (nuevo) | `loadEvmIndexes` para la salud |
| `server/src/domain/health.ts`, `dashboard.ts`, `routes/projectStats.ts`, `routes/dashboard.ts` | Regla de salud con CPI y SPI |
| `client/src/pages/project/Performance.tsx` (nuevo), `client/src/components/performance/*` (nuevo) | Pestaña Desempeño |
| `client/src/pages/project/ChangeRequests.tsx` (nuevo) | Pestaña Cambios |
| `client/src/components/tasks/TaskForm.tsx`, `pages/project/TaskDetail.tsx`, `pages/project/Registers.tsx` | Costo planeado y tarea del gasto |

---

### Task 1: Esquemas compartidos

**Files:**
- Modify: `shared/src/enums.ts`, `shared/src/schemas.ts`
- Test: `shared/tests/schemas.test.ts`

**Interfaces:**
- Produces:
  - `CHANGE_STATUS = ['PENDING', 'APPROVED', 'REJECTED'] as const`, `type ChangeStatus`, y `LABELS.changeStatus` con los textos de Global Constraints.
  - Campo `plannedCostCents: budgetAmount.optional()` en los campos comunes de tarea, válido tanto al crear como al editar. `budgetAmount` es el validador de montos de proyecto que ya existe.
  - Campo `taskId: z.string().nullable().optional()` en `createExpenseSchema` y `updateExpenseSchema`.
  - `baselineSchema = z.object({ reason: z.string().trim().default(''), changeRequestId: z.string().nullable().optional() })`.
  - Esquemas de solicitud de cambio:
    - `changeRequestSchema`: `title: required('Escribe el título')`, `description`, `requestedBy` y `scopeImpact` como `z.string().default('')`, `scheduleImpactDays: z.number().int('Usa un número entero de días').nullable().optional()`, `costImpactCents: z.number().int('Monto inválido').min(-MAX_AMOUNT_CENTS).max(MAX_AMOUNT_CENTS, 'El monto es demasiado grande').nullable().optional()`;
    - `updateChangeRequestSchema`: los mismos campos, todos opcionales.
  - `decisionSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']), note: required('Escribe la nota de la decisión') })`.

- [ ] **Step 1: Write the failing tests:**
  - "el costo planeado de una tarea no admite negativos ni decimales": `createTaskSchema.safeParse({ title: 'T', plannedCostCents: -1 }).success === false`; con `10.5`, `false`; con `123450`, `true`.
  - "un cambio admite impacto negativo en plazo y costo": `changeRequestSchema.parse({ title: 'X', scheduleImpactDays: -3, costImpactCents: -5000 })` lo conserva.
  - "la decisión exige nota": `decisionSchema.safeParse({ status: 'APPROVED', note: '  ' }).success === false`.
  - "la línea base admite motivo vacío": `baselineSchema.parse({}).reason === ''`.
- [ ] **Step 2: Run** `npm test -w shared` → FAIL.
- [ ] **Step 3: Implement** lo de Interfaces.
- [ ] **Step 4: Run** `npm test -w shared` → PASS.
- [ ] **Step 5: Commit** `feat: esquemas de línea base, cambios y costo planeado`.

---

### Task 2: Migración, costo planeado y gasto ligado a una tarea

**Files:**
- Modify: `server/prisma/schema.prisma`, `server/src/routes/taskDto.ts`, `server/src/routes/tasks.ts`, `server/src/routes/dependencies.ts`, `server/src/routes/registers.ts`
- Create: migración `server/prisma/migrations/<timestamp>_add_baseline_evm/`
- Test: `server/tests/plannedCost.test.ts` (nuevo)

**Interfaces:**
- Consumes: Tarea 1.
- Produces:
  - **Prisma**, los modelos de la sección 2 de la spec:
    - `Task.plannedCostCents BigInt @default(0)`;
    - `Expense.taskId String?`, con relación `onDelete: SetNull` e índice;
    - `Baseline` con `@@unique([projectId, version])`, relación a `ChangeRequest?` con `onDelete: SetNull` y a `User` (`createdBy`) con `onDelete: Restrict`;
    - `BaselineTask`, que se borra con su línea base;
    - `ChangeRequest` con `@@unique([projectId, number])` y `decidedBy User?` con `SetNull`;
    - `EvmSnapshot` con `@@unique([projectId, date])`.
    - Todos se borran con su proyecto. Una sola migración contiene todo.
  - `toTaskDto(task, includeCost: boolean)`: quita siempre `plannedCostCents` del objeto y lo agrega como `Number(...)` solo si `includeCost` es verdadero. Todos los que llaman pasan `isPm` (de `getProjectAccess` o `requireTaskPm`, según la ruta). En `/api/me/tasks` pasa `false`.
  - Gastos: `registerProjectCrud` de `expenses` valida `taskId` en `validate`; si no es una tarea del proyecto, `fieldError('taskId', 'La tarea no pertenece al proyecto')`. `toDto` agrega `taskId`.

- [ ] **Step 1: Write the failing tests** en `server/tests/plannedCost.test.ts`, con PM, Ana (colaboradora asignada) y un proyecto:
  - "el PM guarda y lee el costo planeado": `POST` de tarea con `plannedCostCents: 500000` → la respuesta tiene `500000`. `PATCH` a `750000` → `750000`.
  - "ninguna ruta de tareas falla ni filtra el costo": tarea con costo `500000` asignada a Ana. Para Ana, estas rutas responden 200 y ningún objeto tiene la clave `plannedCostCents`:
    - `GET /api/projects/:id/tasks`;
    - `GET /api/me/tasks`;
    - `GET /api/tasks/:id`;
    - `PATCH /api/tasks/:id/progress`.
    Para el PM, `POST /api/tasks/:id/dependencies` responde 201 con `plannedCostCents: 500000`, y el calendario responde 200.
  - "un gasto se liga a una tarea del proyecto": `POST /expenses` con `taskId` → 201 con `taskId`. Con una tarea de otro proyecto → 400 en `fields.taskId`.
  - "borrar la tarea deja el gasto sin tarea": el gasto queda con `taskId === null`.
- [ ] **Step 2: Run** `npm test -w server -- plannedCost` → FAIL.
- [ ] **Step 3: Implement** el esquema Prisma. Genera la migración con `DATABASE_URL="file:<scratchpad>/migr.db" npx prisma migrate dev --name add_baseline_evm --create-only --skip-generate` desde `server/`, revisa que el SQL solo agregue tablas, columnas e índices, y luego ejecuta `npx prisma generate` (ver Global Constraints si falla).
- [ ] **Step 4: Implement** `toTaskDto` con `includeCost` y actualiza todos los que lo llaman (`tasks.ts` y `dependencies.ts`). La validación y la salida de `taskId` van en los gastos.
- [ ] **Step 5: Run** `npm test -w server` → PASS (toda la suite).
- [ ] **Step 6: Commit** `feat: costo planeado por tarea y gastos ligados a una tarea`.

---

### Task 3: Cálculo de valor ganado

**Files:**
- Create: `server/src/domain/evm.ts`
- Test: `server/tests/domain/evm.test.ts`

**Interfaces:**
- Produces:

```ts
export type BaselineTaskInput = { taskId: string; title: string; startDate: string; dueDate: string; plannedCostCents: number };
export type EvmInput = {
  baseline: { bacCents: number; tasks: BaselineTaskInput[] };
  tasks: { id: string; title: string; progress: number; dueDate: string | null; plannedCostCents: number }[];
  expenses: { amountCents: number; date: string; taskId: string | null }[];
  plannedBudgetCents: number;
};
export type EvmTaskRow = {
  taskId: string; title: string; baselineCostCents: number | null; progress: number | null;
  evCents: number | null; linkedCostCents: number; finishVarianceDays: number | null;
  state: 'LATE' | 'ON_TIME' | 'OUTSIDE' | 'DELETED';
};
export type EvmMetrics = {
  pvCents: number; evCents: number; acCents: number; bacCents: number; cpi: number | null; spi: number | null;
  cvCents: number; svCents: number; eacCents: number; etcCents: number; vacCents: number; percentComplete: number; reserveCents: number;
};
export function plannedValueAt(tasks: BaselineTaskInput[], date: string): number;
export function computeEvm(input: EvmInput, today: string): { metrics: EvmMetrics; tasks: EvmTaskRow[]; outsideBaseline: number };
```

  Las reglas son las de la sección 3 de la spec, con estas precisiones:
  - **Fracción planeada:** `(diffDays(start, date) + 1) / (diffDays(start, due) + 1)`, limitada entre 0 y 1.
  - **Tareas fuera de la base:** son las tareas actuales con costo mayor que 0 que no están en la base. Llevan `baselineCostCents`, `evCents` y `finishVarianceDays` en `null`, y `progress` con su avance actual.
  - **Tareas eliminadas:** son las de la base que ya no existen. Llevan `progress` y `evCents` en `null`, y `finishVarianceDays` en `null`.
  - **Desvío de fin:** si la tarea actual no tiene fecha de fin, `finishVarianceDays` es `null` y el estado es `ON_TIME`.
  - **Orden de las filas:** `finishVarianceDays` de mayor a menor, con los `null` al final y, entre ellos, por título.

- [ ] **Step 1: Write the failing tests** (una tarea de base: 2026-11-01 a 2026-11-10, costo 100000):
  - "PV antes, en el inicio, a la mitad, en el fin y después": `plannedValueAt` en `2026-10-31` → 0; en `2026-11-01` → 10000; en `2026-11-05` → 50000; en `2026-11-10` → 100000; en `2026-11-20` → 100000.
  - "una tarea de un solo día vale su costo desde ese día": de 2026-11-03 a 2026-11-03 → 0 el día 2 y el costo completo el día 3.
  - "EV usa el costo base y el avance actual": avance 40 → `evCents` 40000. Si el costo actual cambió a 999, EV sigue en 40000.
  - "CPI y SPI null sin denominador": sin gastos → `cpi` es `null` y `eacCents === bacCents`. El día 2026-10-31 → `spi` es `null`.
  - "índices y proyección": hoy 2026-11-05, avance 40, gasto 50000 → `pvCents` 50000, `evCents` 40000, `acCents` 50000, `cpi` 0.8, `spi` 0.8, `cvCents` -10000, `svCents` -10000, `eacCents` 125000, `etcCents` 75000, `vacCents` -25000, `percentComplete` 40.
  - "gastos futuros no cuentan en AC pero sí en el gasto ligado": gasto ligado con fecha 2026-12-01, 20000 → `acCents` 0 y `linkedCostCents` de la fila igual a 20000.
  - "tareas eliminadas y fuera de la base": la tarea de la base no existe → fila `DELETED` y EV 0. Una tarea actual con costo 5000 que no está en la base → fila `OUTSIDE` y `outsideBaseline === 1`.
  - "base sin tareas vigentes ni gastos": EV 0, `cpi` `null`, `eacCents === bacCents`.
  - "desvío y estado": fin actual 2026-11-13 contra base 2026-11-10 → 3 y `LATE`. Fin igual → 0 y `ON_TIME`. Sin fecha → `null` y `ON_TIME`. Las filas van ordenadas por desvío.
  - "reserva": presupuesto 80000 y BAC 100000 → `reserveCents` -20000.
- [ ] **Step 2: Run** `npm test -w server -- evm` → FAIL.
- [ ] **Step 3: Implement** `server/src/domain/evm.ts`. Usa `diffDays` de `@pm/shared` y `Math.round` para los centavos. CPI y SPI se redondean con `Math.round(x * 100) / 100`.
- [ ] **Step 4: Run** `npm test -w server -- evm` → PASS.
- [ ] **Step 5: Commit** `feat: cálculo de valor ganado`.

---

### Task 4: Registro de cambios (API)

**Files:**
- Create: `server/src/routes/changeRequests.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/changeRequests.test.ts`

**Interfaces:**
- Consumes: `changeRequestSchema`, `updateChangeRequestSchema`, `decisionSchema` (Tarea 1); el modelo `ChangeRequest` (Tarea 2).
- Produces: las rutas de la sección 5 de la spec. Cada solicitud devuelve `{ id, number, title, description, requestedBy, scopeImpact, scheduleImpactDays, costImpactCents, status, decisionNote, decidedAt, decidedBy: { id, name } | null, createdAt }`, con `costImpactCents` como `number | null`. La lista va ordenada por `number` descendente.

- [ ] **Step 1: Write the failing tests:**
  - "colaborador 403 y no miembro 404" en `GET`, `POST` y la decisión.
  - "el número es correlativo por proyecto": dos en el proyecto A dan 1 y 2; la primera del proyecto B da 1. Borrar la 2 y crear otra da 3.
  - "crea con impactos negativos y los devuelve como número".
  - "decidir exige nota y guarda quién y cuándo": con `note: ''` responde 400 en `fields.note`. Con nota → `status 'APPROVED'`, `decidedBy.id === pm.id` y `decidedAt` igual a la hora fijada con `ctx.clock.set`.
  - "una decidida no se edita, no se decide de nuevo ni se borra": `PATCH`, decisión y `DELETE` responden 409 con `code 'change_decided'`.
  - "una solicitud de otro proyecto responde 404".
- [ ] **Step 2: Run** `npm test -w server -- changeRequests` → FAIL.
- [ ] **Step 3: Implement.** El número es `max(number) + 1` del proyecto, dentro de una transacción. Registra las rutas en `app.ts` después de `raciRoutes`.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: registro de solicitudes de cambio`.

---

### Task 5: Líneas base y desempeño (API)

**Files:**
- Create: `server/src/routes/performance.ts`
- Modify: `server/src/app.ts`
- Test: `server/tests/performance.test.ts`

**Interfaces:**
- Consumes: `computeEvm` y `plannedValueAt` (Tarea 3); `baselineSchema` (Tarea 1); los modelos de la Tarea 2.
- Produces:
  - `POST /api/projects/:id/baselines`.
  - `GET /api/projects/:id/performance` con la forma exacta de la sección 5 de la spec.
  - Detalles de la respuesta:
    - `series` cubre cada día desde el menor `startDate` hasta el mayor `dueDate` de las tareas de la base, más hoy si cae fuera;
    - `evCents` y `acCents` de cada día salen de `EvmSnapshot`, y son `null` donde no hay foto;
    - `history` va de la versión mayor a la menor;
    - `createdBy` es `{ id, name }`.
  - El `GET` hace un `upsert` de la foto `(projectId, today)` con `bacCents`, `pvCents`, `evCents` y `acCents` de hoy.
  - Interno: `loadEvmInput(prisma, projectId): Promise<EvmInput | null>` (null sin línea base). Se exporta para la Tarea 6.

- [ ] **Step 1: Write the failing tests:**
  - "colaborador 403 y no miembro 404" en `GET /performance` y `POST /baselines`.
  - "sin línea base devuelve vacío": `baseline` `null`, `metrics` `null`, `tasks` `[]`, `series` `[]`, `history` `[]`.
  - "ninguna tarea con costo responde baseline_empty".
  - "tareas con costo sin fechas responden baseline_missing_dates con la lista": dos tareas, una sin fecha de inicio → `details.tasks` igual a `[{ id, title }]` de esa tarea.
  - "versión 1 sin motivo, versión 2 exige motivo": la primera → 201 con `version 1`. La segunda sin motivo → 400 en `fields.reason`. Con motivo → `version 2`. `history` → versiones `[2, 1]`.
  - "cambio ligado debe estar aprobado y ser del proyecto": uno pendiente → 400 en `fields.changeRequestId`. Uno aprobado de otro proyecto → 400. Uno aprobado del proyecto → 201, y `baseline.changeRequest` es `{ id, number, title }`.
  - "la base no cambia al editar o borrar tareas": fija la base, mueve el fin de una tarea 3 días, borra otra y crea una nueva con costo. `tasks` muestra `LATE` con 3, `DELETED`, y `OUTSIDE` con `outsideBaseline 1`. `baseline.bacCents` no cambia.
  - "la foto diaria es única y se actualiza": dos `GET` el mismo día con un gasto nuevo entre ambos → una sola fila de `EvmSnapshot`, con el `acCents` nuevo. Cambia `ctx.clock` al día siguiente y consulta → dos filas. En `series`, esos días tienen `evCents` y `acCents`, y un día sin foto tiene `null`.
  - "base con todas sus tareas borradas responde 200 con EV 0".
- [ ] **Step 2: Run** `npm test -w server -- performance` → FAIL.
- [ ] **Step 3: Implement.** Para fijar la base: una transacción que calcula `version = max + 1`, valida y crea `Baseline` y `BaselineTask` con las fechas actuales del proyecto. Registra las rutas en `app.ts`.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: líneas base con versiones y desempeño con valor ganado`.

---

### Task 6: Salud con CPI y SPI

**Files:**
- Create: `server/src/routes/evmLoader.ts`
- Modify: `server/src/domain/health.ts`, `server/src/domain/dashboard.ts`, `server/src/routes/projectStats.ts`, `server/src/routes/dashboard.ts`
- Test: `server/tests/domain/health.test.ts` (o el archivo de pruebas de salud que ya existe), `server/tests/performance.test.ts`

**Interfaces:**
- Consumes: `loadEvmInput` (Tarea 5) y `computeEvm` (Tarea 3).
- Produces:
  - `HealthInput` gana `cpi?: number | null` y `spi?: number | null`.
  - `computeHealth`: tras las reglas de `AT_RISK`, si `cpi` o `spi` no es nulo y es menor que 0,9, devuelve `ATTENTION`.
  - `summarizeProject(project, tasks, risks, expenses, today, evm?: { cpi: number | null; spi: number | null })`.
  - `loadEvmIndexes(prisma, projectIds: string[], today: string): Promise<Map<string, { cpi: number | null; spi: number | null }>>` solo incluye proyectos con línea base. Puede llamar a `loadEvmInput` por proyecto. `loadProjectSummaries` y la ruta del panel lo usan y le pasan el valor a `summarizeProject`.

- [ ] **Step 1: Write the failing tests:**
  - **En salud (unitarias):**
    - un proyecto sano con `cpi 0.85` → `ATTENTION`;
    - con `spi 0.89` → `ATTENTION`;
    - con `cpi 0.9` → `ON_TRACK`;
    - con `cpi null` → `ON_TRACK`;
    - vencido con `cpi 1.2` → `AT_RISK`.
  - **"la lista de proyectos y el panel usan CPI":** un proyecto con base y un gasto que deja CPI en 0.5 → `GET /api/projects` (PM) da `health 'ATTENTION'`, y `GET /api/dashboard` da lo mismo para ese proyecto.
- [ ] **Step 2: Run** `npm test -w server -- health performance` → FAIL.
- [ ] **Step 3: Implement** lo de Interfaces.
- [ ] **Step 4: Run** `npm test -w server` → PASS.
- [ ] **Step 5: Commit** `feat: la salud del proyecto considera CPI y SPI`.

---

### Task 7: Costo planeado y tarea del gasto en la interfaz

**Files:**
- Modify: `client/src/api/types.ts`, `client/src/components/tasks/TaskForm.tsx`, `client/src/pages/project/TaskDetail.tsx`, `client/src/pages/project/Registers.tsx` (`BudgetPage`)
- Test: `client/tests/projectTasks.test.tsx` (o el que ya prueba `TaskForm`), `client/tests/taskDetail.test.tsx`, `client/tests/budget.test.tsx`

**Interfaces:**
- Produces:
  - `Task.plannedCostCents?: number` y `Expense.taskId: string | null` en `types.ts`.
  - `TaskForm` muestra `MoneyInput` "Costo planeado" (con `blankIsZero`) solo si el usuario es PM, y lo envía como `plannedCostCents`.
  - `TaskDetail` muestra "Costo planeado" y "Gasto ligado" solo al PM. El gasto ligado es la suma de los gastos del proyecto con ese `taskId`, leída de la consulta de gastos que ya existe (`registerKey(projectId, 'expenses')`).
  - `BudgetPage`: campo `taskId` de tipo `select`, `nullable`, con etiqueta "Tarea (opcional)" y las tareas del proyecto como opciones. La tabla gana la columna "Tarea" (`—` sin tarea).

- [ ] **Step 1: Write the failing tests:**
  - "el PM escribe el costo planeado con formato local": en "Costo planeado" escribe `1.234,50` → el cuerpo enviado tiene `plannedCostCents: 123450`.
  - "el colaborador no ve el costo planeado" en el formulario ni en el detalle.
  - "el detalle muestra costo planeado y gasto ligado al PM": tarea con `plannedCostCents: 500000` y dos gastos ligados de 1000 y 2500 → muestra ambos montos con `formatMoney`.
  - "un gasto se liga a una tarea": elige "Diseño" en "Tarea (opcional)" → el cuerpo tiene `taskId: 't1'`. La tabla muestra "Diseño". Un gasto sin tarea muestra "—".
- [ ] **Step 2: Run** las tres pruebas → FAIL.
- [ ] **Step 3: Implement** lo de Interfaces.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: costo planeado y gastos por tarea en la interfaz`.

---

### Task 8: Pestaña Cambios

**Files:**
- Create: `client/src/pages/project/ChangeRequests.tsx`
- Modify: `client/src/router.tsx`, `client/src/pages/project/ProjectLayout.tsx` (`TABS`), `client/src/api/types.ts`
- Test: `client/tests/changeRequests.test.tsx`

**Interfaces:**
- Consumes: la API de la Tarea 4.
- Produces:
  - Ruta `cambios` dentro de `ProjectPmOnly`, con la pestaña "Cambios" después de "Presupuesto".
  - `type ChangeRequest` en `types.ts`.
  - `changeRequestsKey = (projectId) => ['project', projectId, 'change-requests']`.

- [ ] **Step 1: Write the failing tests:**
  - "lista con número, impactos y estado": se ven "CR-2", "+3 días", el costo con `formatMoney` y "Pendiente"; "CR-1" con "Aprobada".
  - "crear un cambio": "Añadir cambio" → el formulario con Título, Descripción, Solicitado por, Impacto en alcance, Impacto en plazo (días) e Impacto en costo → `POST` con los valores. Un 400 en `title` se muestra bajo el campo.
  - "aprobar pide nota": "Aprobar CR-2" → ventana "Aprobar CR-2" con "Nota de la decisión" → `POST .../decision` con `{ status: 'APPROVED', note }`. Sin nota, el botón está desactivado.
  - "una decidida solo tiene Ver": "CR-1" no tiene Editar, Eliminar, Aprobar ni Rechazar. "Ver CR-1" muestra la nota, quién decidió y la fecha.
  - "un 409 muestra el motivo y recarga el registro".
  - "el colaborador no ve la pestaña Cambios".
- [ ] **Step 2: Run** `npm test -w client -- changeRequests` → FAIL.
- [ ] **Step 3: Implement.** Reutiliza `RegisterTable` con `detail` para el alta, la edición, "Ver" y el borrado; las acciones de decisión van en una columna propia. Si `RegisterTable` no permite ocultar Editar y Eliminar por fila, agrega `canEditItem?: (item: T) => boolean` a `RegisterTable` y úsalo.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: pestaña Cambios`.

---

### Task 9: Pestaña Desempeño

**Files:**
- Create: `client/src/pages/project/Performance.tsx`, `client/src/components/performance/MetricCards.tsx`, `client/src/components/performance/SCurve.tsx`, `client/src/components/performance/BaselinePanel.tsx`, `client/src/lib/evmDisplay.ts`
- Modify: `client/src/router.tsx`, `client/src/pages/project/ProjectLayout.tsx`, `client/src/api/types.ts`
- Test: `client/tests/performance.test.tsx`, `client/tests/evmDisplay.test.ts`

**Interfaces:**
- Consumes: la API de la Tarea 5 y `changeRequestsKey` (Tarea 8).
- Produces:
  - Ruta `desempeno` dentro de `ProjectPmOnly`, con la pestaña "Desempeño" antes de "Cambios".
  - `type Performance` en `types.ts`.
  - `indexTone(value: number | null): 'success' | 'warning' | 'danger' | null`.
  - `cpiLabel(value)` y `spiLabel(value)`, con los textos de Global Constraints, y `null` sin valor.
  - `SCurve({ series, today }: { series: Performance['series']; today: string })` dibuja un SVG con `role="img"` y un `aria-label` que resume los tres valores de hoy. Usa un `viewBox` fijo con ancho 100 %, y las tres líneas `PV`, `EV` y `AC` con leyenda en texto y colores de tokens (`--color-link`, `--color-ok-fg`, `--color-warn-fg`). Una línea con días en `null` se dibuja uniendo los puntos existentes. Hay una marca vertical en hoy.
  - Antes de escribir `SCurve`, carga la skill `dataviz` para el color, las marcas y la accesibilidad.

- [ ] **Step 1: Write the failing tests:**
  - `evmDisplay.test.ts`:
    - `indexTone(1)` es `'success'`, `indexTone(0.9)` es `'warning'`, `indexTone(0.89)` es `'danger'` e `indexTone(null)` es `null`;
    - `cpiLabel(0.8)` es `'Sobre el costo'`, `cpiLabel(1)` es `'En costo'` y `cpiLabel(1.1)` es `'Bajo el costo'`;
    - `spiLabel(0.8)` es `'Atrasado'`, `spiLabel(1)` es `'En plazo'` y `spiLabel(1.2)` es `'Adelantado'`.
  - `performance.test.tsx`:
    - "sin línea base invita a fijarla": se ve "Fijar línea base" y el número de tareas con costo. Pulsarlo hace `POST /baselines` con `{}`.
    - "si faltan fechas, lista las tareas con enlace": `POST` → `apiError(400, 'baseline_missing_dates', { details: { tasks: [{ id: 't1', title: 'Diseño' }] } })` → aparece el enlace "Diseño" a `/proyectos/p1/tareas/t1`.
    - "con línea base muestra tarjetas con color y texto": CPI 0.8 → "0,80" y "Sobre el costo"; SPI `null` → "—"; EAC, VAC y "% completado" con su valor.
    - "la curva S tiene una descripción accesible": `getByRole('img', { name: /Valor planeado/ })`.
    - "la tabla por tarea muestra estado y desvío": "Atrasada" con "+3 días", "Eliminada" y "Fuera de línea base". Aviso "1 tarea con costo está fuera de la línea base".
    - "fijar una nueva versión pide motivo y permite citar un cambio aprobado": "Fijar nueva línea base" → ventana con "Motivo" y "Cambio aprobado (opcional)", donde solo aparecen las aprobadas → `POST` con `{ reason, changeRequestId }`.
    - "el historial muestra versiones con autor y cambio".
    - "el colaborador no ve la pestaña Desempeño".
- [ ] **Step 2: Run** `npm test -w client -- performance evmDisplay` → FAIL.
- [ ] **Step 3: Implement** lo de Interfaces.
  - Las tarjetas usan `Badge` y `formatMoney` con la moneda del proyecto.
  - Los números de CPI y SPI se formatean con `toLocaleString('es', { minimumFractionDigits: 2 })`.
  - El desvío se muestra con signo (`+3 días`, `0 días`, `−2 días`).
  - La tabla está dentro de `overflow-x-auto`. Las tarjetas usan `grid gap-3 sm:grid-cols-3`.
- [ ] **Step 4: Run** `npm test -w client` → PASS.
- [ ] **Step 5: Commit** `feat: pestaña Desempeño con valor ganado y curva S`.

---

### Task 10: Flujo completo, README y verificación

**Files:**
- Modify: `e2e/main-flow.spec.ts`, `README.md`

- [ ] **Step 1: Extend the e2e flow** después de crear las tareas "Diseño" y "Construcción":
  - El PM pone "Costo planeado" `1.000` a Diseño y `3.000` a Construcción, y les pone fechas de inicio y fin dentro del proyecto.
  - Va a "Desempeño" → "Fijar línea base" → ve "Versión 1".
  - En "Presupuesto", registra un gasto de `500` ligado a Diseño con fecha de hoy.
  - En "Desempeño" ve el CPI con un valor y el texto que le corresponde.
  - En "Cambios" crea "Agregar blog" con impacto de `+5` días y `800` de costo, y lo aprueba con una nota.
  - En "Desempeño" fija una nueva línea base con el motivo "Cambio aprobado" y el cambio "CR-1" → ve "Versión 2" y "CR-1" en el historial.
- [ ] **Step 2: Run** `npm run build` y luego `npm run test:e2e` → PASS.
- [ ] **Step 3: Update `README.md`:** una sección corta de "Línea base, valor ganado y cambios" que explique:
  - qué significan CPI, SPI, EAC y VAC, en una línea cada uno;
  - que solo el PM las ve;
  - que hay que copiar `data/` antes de actualizar.
- [ ] **Step 4: Verify** `npm test`, `npm run build` y `npm run test:e2e` en verde. Revisa en el navegador a 375 px la pestaña Desempeño: tarjetas apiladas, curva al ancho y tabla con desplazamiento interno.
- [ ] **Step 5: Commit** `test: flujo completo con línea base y cambios; docs: README`.
