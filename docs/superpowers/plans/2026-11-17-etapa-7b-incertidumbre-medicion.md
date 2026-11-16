# Etapa 7, bloque B: incertidumbre y medición — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** riesgos completos con historial y matriz, registro de supuestos (F15); TCPI, tendencia de hitos con historial, umbrales de salud por proyecto y CSV (F16).

**Architecture:** reglas puras en `server/src/domain/` (`milestoneForecast.ts`, umbrales en `health.ts`, `tcpi` en `evm.ts`); rutas nuevas `assumptions.ts` y `milestoneTrend.ts`; `projectCrud` gana un gancho `afterSave` para el historial de riesgos; el pronóstico lo guarda `jobs/daily.ts`; el CSV se arma en el cliente (`client/src/lib/csv.ts`).

**Tech Stack:** Hono, Prisma 6 sobre PostgreSQL, Zod en `shared`, React 19 con TanStack Query, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-etapa-7b-incertidumbre-medicion-design.md`

## Global Constraints

- **Rama y commits:** rama `etapa-7b`, un commit por tarea, en español con prefijo, terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Pruebas:** servidor `TEST_DATABASE_URL=postgresql://pm:pm@localhost:5433/postgres npx vitest run <archivo>` desde `server/`; cliente `npx vitest run` y `npx tsc -b` desde `client/`; `shared` con `npx vitest run`. Toda tarea que toque `shared/src/enums.ts` corre también la suite de `shared`.
- **Reglas de siempre:** `AppError`/`fieldError` en español; validación en `shared/src/schemas.ts`; migración nueva a mano con RLS en cada tabla nueva; escrituras en `closedGuard`, matriz de acceso y bitácora (entidad nueva en `ACTIVITY_ENTITY`, etiqueta, `client/src/lib/activity.ts`, `shared/tests/activity.test.ts`); nada en memoria.
- **Dinero:** `contingencyCostCents` y los umbrales nunca van a quien no es PM.
- **Mensajes exactos:** «Indica probabilidad e impacto residuales juntos» · «Solo se convierte un supuesto falso» · «Este supuesto ya se convirtió» · «Revisión vencida» · «Supuestos del acta» · «Exportar CSV».

## Review Focus

1. Cambiar solo el estado de un riesgo (colaborador responsable) no agrega una evaluación al historial. Prueba en Task 3.
2. Dos conversiones simultáneas del mismo supuesto crean un solo riesgo. Prueba en Task 4.
3. La tarea diaria corrida dos veces el mismo día no duplica pronósticos. Prueba en Task 6.
4. Un umbral cambiado en un proyecto no altera la salud de otro en el panel. Prueba en Task 7.
5. Un texto con `;`, comillas o salto de línea en el CSV no rompe las columnas. Prueba en Task 11.

---

### Task 1: Esquemas y enumeraciones
**Files:** `shared/src/enums.ts`, `shared/src/schemas.ts`; Test `shared/tests/stage7b.test.ts`.
**Produces:** `ASSUMPTION_STATUS = ['PENDING','VALID','FALSE']`, `LABELS.assumptionStatus` («Por validar», «Válido», «Falso»), `ASSUMPTION_TARGET = ['risk','incident']`; riesgo (crear/editar) + `trigger` noteText, `nextReviewDate` optionalDateSchema, `contingencyCostCents` monto ≥ 0 nullable, `residualProbability`/`residualImpact` scale nullable con `superRefine` (los dos o ninguno, mensaje exacto en `residualProbability`); `createAssumptionSchema { description: longText('Describe el supuesto'), ownerId: optionalId, validateBy: optionalDateSchema, status default 'PENDING' }`, `updateAssumptionSchema` parcial + `version`, `convertAssumptionSchema { kind }`; proyecto (crear/editar) + `healthOverdueTasks` int 1–50, `healthBudgetPercent` 50–100, `healthIndexMin` 50–100, `highRiskScore` 1–25 (por defecto 3/90/90/15 al crear).
- [ ] Prueba: residual a medias falla con el mensaje; `createAssumptionSchema.parse({ description: 'A' }).status === 'PENDING'`; umbral fuera de rango falla; `createProjectSchema.parse({ name: 'X' })` trae los cuatro valores por defecto. RED → implementar → `shared` verde y `client` `tsc -b` → commit `feat: esquemas de riesgos completos, supuestos y umbrales`.

### Task 2: Migración
**Files:** `server/prisma/schema.prisma`, `server/prisma/migrations/20261117120000_etapa_7b/migration.sql` (con `prisma migrate diff` desde el esquema de HEAD + RLS), `server/src/auth/access.ts` (`toProjectDto`: sin `lastAssumptionNumber`; los cuatro umbrales solo para el PM), `server/src/activity/loaders.ts` (omite el contador).
**Produces:** columnas de riesgo; `RiskAssessment`; `Assumption`; `MilestoneForecast` (`@@unique([milestoneId, date])`); `Project.lastAssumptionNumber`, `healthOverdueTasks @default(3)`, `healthBudgetPercent @default(90)`, `healthIndexMin @default(90)`, `highRiskScore @default(15)`.
- [ ] Prueba en `projects.test.ts`: el colaborador no recibe `highRiskScore` y el PM sí (valor 15). RED → implementar → `projects.test.ts rls.test.ts` → commit `feat: modelo de riesgos completos, supuestos, pronósticos y umbrales`.

### Task 3: Riesgos completos (servidor)
**Files:** `server/src/routes/projectCrud.ts` (opción `afterSave?: (prisma, saved, current: Record<string, any> | undefined, userId: string) => Promise<void>` llamada tras crear y tras editar), `server/src/routes/registers.ts` (riesgos: `toDto` con `residualScore`, `reviewOverdue`, `assessments` ordenadas por `assessedAt` desc con `{ assessedAt, assessedBy: {id,name}, probability, impact, residualProbability, residualImpact }`, `contingencyCostCents` como número solo para el PM; `include` con assessments; `afterSave` crea `RiskAssessment` si es alta o cambió alguno de los cuatro valores). `toDto` necesita `today`: ampliar `toDto(item, isPm, ctx)` con `ctx.today` o calcular `reviewOverdue` en el cliente — **decisión:** pasar `today` como tercer argumento de `toDto`.
- [ ] Pruebas (`server/tests/riskAssessments.test.ts`): alta crea 1 evaluación; editar P/I agrega otra; el colaborador responsable cambia el estado y no agrega (Review Focus 1); residual a medias → 400; colaborador sin `contingencyCostCents`; `reviewOverdue` con `nextReviewDate` de ayer. RED → implementar → `riskAssessments registers ownRisks accessMatrix` → commit `feat: riesgos con disparador, residual e historial de evaluaciones`.

### Task 4: Registro de supuestos (servidor)
**Files:** Create `server/src/routes/assumptions.ts` (CRUD con número, versión, `ownerId` con `assertOwnerCanOwn`, sección `planning`; `convert` con reclamo `updateMany({ where: { id, riskId: null, incidentId: null, status: 'FALSE' } })` dentro de la transacción tras crear el destino con `tx.risk.create` o `createIncidentIn`); bitácora (entidad `assumption`, «Supuesto», «el supuesto»); `accessMatrix`, `closedGuard`; Test `server/tests/assumptions.test.ts`.
**DTO:** `{ id, number, description, owner, validateBy, status, version, risk: { id } | null, incident: { id, number } | null, overdue }` (`overdue` = `PENDING` y `validateBy < hoy`).
- [ ] Pruebas: SUP-1/SUP-2; el observador y el colaborador leen y no escriben; convertir uno pendiente → 409 «Solo se convierte un supuesto falso»; convertir falso a riesgo crea el riesgo con P3 I3 MITIGATE y responsable; de nuevo → 409; dos simultáneas → un riesgo (Review Focus 2); a incidente con título truncado. RED → implementar → commit `feat: registro de supuestos convertibles en riesgo o incidente`.

### Task 5: TCPI
**Files:** `server/src/domain/evm.ts` (`tcpi` en `EvmMetrics`); Test `server/tests/domain/evm.test.ts` (ampliar).
- [ ] Prueba: BAC 1000, EV 400, AC 500 → `tcpi` 1.2; AC ≥ BAC → `null`. RED → implementar → `tests/domain/evm.test.ts tests/performance.test.ts` → commit `feat: TCPI en el valor ganado`.

### Task 6: Tendencia de hitos
**Files:** Create `server/src/domain/milestoneForecast.ts` (`forecastDate(milestone: { dueDate; status }, leaves: { status; dueDate }[], today): string | null`), `server/src/routes/milestoneTrend.ts` (`GET /api/projects/:id/milestone-trend`, sección `planning`; `loadForecasts(prisma, projectId, today)` exportada), `server/src/jobs/daily.ts` (`upsert` por hito y día; contador `forecasts` en el resultado); `accessMatrix`; Test `server/tests/domain/milestoneForecast.test.ts`, `server/tests/milestoneTrend.test.ts`.
- [ ] Pruebas: pura (hoja vencida → hoy; la más tardía; sin pendientes → dueDate; alcanzado → null); ruta con `slipDays` e historial; la tarea diaria dos veces el mismo día deja una fila (Review Focus 3) y actualiza el valor. RED → implementar → `tests/daily.test.ts` incluido → commit `feat: pronóstico diario y tendencia de hitos`.

### Task 7: Umbrales de salud
**Files:** `server/src/domain/health.ts` (`HealthThresholds = { overdueTasks; budgetPercent; indexMin; highRiskScore }`, `DEFAULT_THRESHOLDS`, `thresholdsOf(project)`; `computeHealth(input, today, t = DEFAULT_THRESHOLDS)`, `isHighRisk(risk, score = 15)`, `summarizeProject(..., thresholds?)`), `domain/indicators.ts` (`computeIndicators` acepta `highRiskScore`), `domain/dashboard.ts`, `domain/statusReport.ts`, `routes/projectStats.ts`, `routes/indicators.ts`, `routes/dashboard.ts`, `routes/statusReports.ts`, `routes/incidents.ts` (riesgo → incidente usa el puntaje del proyecto); Test `server/tests/healthThresholds.test.ts`.
- [ ] Pruebas: con `healthOverdueTasks: 1` una vencida da `AT_RISK` en la lista de proyectos; otro proyecto con los valores por defecto queda `ATTENTION` en el mismo panel (Review Focus 4); `highRiskScore: 9` cuenta un riesgo 3×3 como alto en indicadores y lo pasa a incidente con prioridad `HIGH`. RED → implementar → `healthThresholds dashboard projectsList indicators statusReports domain` → commit `feat: umbrales de salud por proyecto`.

### Task 8: Riesgos en la interfaz
**Files:** `client/src/pages/project/Registers.tsx` (campos y detalle), Create `client/src/components/risks/RiskMatrix.tsx`, `client/src/api/types.ts`; Test `client/tests/riskMatrix.test.tsx`.
- [ ] Pruebas: la matriz ubica un riesgo 4×5 en su celda y al cambiar a «Residual» lo mueve a su celda residual; el detalle muestra «Revisión vencida» y el historial; el colaborador no ve el campo de costo de contingencia. RED → implementar → cliente verde → commit `feat: matriz e historial de riesgos en la interfaz`.

### Task 9: Supuestos en la interfaz
**Files:** Create `client/src/components/assumptions/AssumptionsRegister.tsx`; `client/src/pages/project/Charter.tsx` (debajo del acta); Test `client/tests/assumptions.test.tsx`.
- [ ] Pruebas: el PM crea un supuesto (POST); uno falso muestra «Convertir en riesgo» y lo llama; el observador ve la tabla sin botones; se muestra «Supuestos del acta» con el texto del acta. RED → implementar → commit `feat: registro de supuestos en la interfaz`.

### Task 10: TCPI, tendencia y umbrales en la interfaz
**Files:** `client/src/components/performance/*` (TCPI), Create `client/src/components/project/MilestoneTrend.tsx` (tabla + SVG), `client/src/pages/project/Summary.tsx`, `client/src/components/project/ProjectForm.tsx` (sección «Umbrales de salud», solo al editar/crear por el PM); Test `client/tests/milestoneTrend.test.tsx`, `client/tests/performance.test.tsx` (ampliar).
- [ ] Pruebas: TCPI «1,20» en Desempeño; la tendencia muestra «+5 días» y el gráfico (`role="img"` con nombre «Tendencia de hitos»); el formulario envía los cuatro umbrales. RED → implementar → commit `feat: TCPI, tendencia de hitos y umbrales en la interfaz`.

### Task 11: Exportación a CSV
**Files:** Create `client/src/lib/csv.ts` (`toCsv(columns: { header: string; value: (row) => string | number | null }[], rows): string`, `downloadCsv(filename, csv)`), botones «Exportar CSV» en tareas, riesgos, gastos, incidentes y lecciones; Test `client/tests/csv.test.ts`, `client/tests/csvExport.test.tsx`.
- [ ] Pruebas: `toCsv` con BOM, `;`, comillas dobladas y saltos de línea entre comillas (Review Focus 5); el botón de riesgos del colaborador genera un CSV sin la columna de costo de contingencia (espiar `downloadCsv`). RED → implementar → commit `feat: exportación a CSV`.

### Task 12: Flujo completo y guía
**Files:** `e2e/main-flow.spec.ts` (el PM registra un supuesto, lo marca falso y lo convierte en riesgo; ve «Tendencia de hitos» en el resumen), `docs/guia-implementacion-pmbok.md` (F15 ✓, F16 ✓, etapa 7 completa).
- [ ] `npm run build`, e2e 1/1, suite completa verde → commit `test: flujo de supuestos y etapa 7 completa en la guía`.
